-- =============================================================================
-- SYNOD — 0040 — Cloture d'une periode comptable
-- =============================================================================
-- Reference : EF-FIN-26 — « Verrouiller une periode cloturee : aucune saisie ni
--             modification retroactive sans reouverture par le SuperAdmin. »
--
-- LE VERROU EST EN BASE, PAS DANS L'ECRAN. Une cloture qui ne tiendrait qu'a un
-- bouton grise se contourne par un appel direct a l'API — et une ecriture
-- retroactive ne se voit qu'au moment ou l'on rapproche deux etats qui auraient
-- du etre identiques, c'est-a-dire des mois plus tard.
--
-- AUCUN HERITAGE, comme pour le workflow (EF-FIN-15 amende). Une periode est
-- close pour l'entite qui la nomme, jamais pour ses descendants par ricochet :
-- le Siege qui arrete ses comptes de janvier gelerait sinon deux cents eglises
-- qui ne l'ont pas decide, et que seul le SuperAdmin pourrait degeler. La
-- cascade existe, mais elle se DEMANDE — `p_avec_perimetre` ecrit alors une
-- ligne par entite, visible et reversible une par une.
--
-- ON NE CLOT PAS SUR DU TRAVAIL EN COURS. `fn_cloturer_periode` refuse tant
-- qu'un brouillon ou un mouvement soumis subsiste dans la periode : clos, il ne
-- pourrait plus etre ni valide ni rejete, et resterait bloque jusqu'a une
-- reouverture. Un refus explicite vaut mieux qu'un etat dont personne ne
-- comprend l'origine trois semaines plus tard.
--
-- REJOUABLE (regle 23).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- La table
-- -----------------------------------------------------------------------------
--
-- UNE LIGNE PAR CLOTURE, pas un drapeau. Une periode rouverte puis reclose doit
-- laisser les deux traces : c'est precisement l'historique qu'un commissaire
-- aux comptes vient chercher. La ligne VIVANTE est celle dont `rouverte_le`
-- est nul.

create table if not exists finance_periodes_cloturees (
  id                 uuid primary key default gen_random_uuid(),
  entity_id          uuid not null references entities (id) on delete cascade,
  -- Le premier jour du mois, comme `finance_entries.periode`.
  periode            date not null,
  cloture_par        uuid references profiles (id),
  cloture_le         timestamptz not null default now(),
  rouverte_par       uuid references profiles (id),
  rouverte_le        timestamptz,
  motif_reouverture  text,
  created_at         timestamptz not null default now(),

  -- Une reouverture se MOTIVE : sans motif, l'historique dit qu'on a rouvert
  -- sans dire pourquoi, ce qui ne vaut guere mieux que pas d'historique.
  constraint finance_cloture_motif_check
    check (rouverte_le is null or nullif(trim(motif_reouverture), '') is not null)
);

-- UNE SEULE cloture vivante par entite et par periode. L'index partiel laisse
-- coexister les clotures anciennes, deja rouvertes.
create unique index if not exists finance_cloture_vivante_idx
  on finance_periodes_cloturees (entity_id, periode)
  where rouverte_le is null;

create index if not exists finance_cloture_entite_idx
  on finance_periodes_cloturees (entity_id, periode desc);

alter table finance_periodes_cloturees enable row level security;

-- LECTURE : tout le perimetre. Savoir qu'une periode est close explique
-- pourquoi une saisie est refusee ; le cacher ferait passer une regle pour une
-- panne (regle 15).
drop policy if exists finance_cloture_select on finance_periodes_cloturees;
create policy finance_cloture_select on finance_periodes_cloturees
  for select to authenticated
  using (entity_in_scope(entity_id));

-- ECRITURE : par les fonctions ci-dessous, et par elles seules. Elles verifient
-- le droit AVEC SA PORTEE et refusent une cloture sur du travail en cours ;
-- une ecriture directe contournerait les deux.
drop policy if exists finance_cloture_write on finance_periodes_cloturees;
create policy finance_cloture_write on finance_periodes_cloturees
  for all to authenticated
  using (false)
  with check (false);


-- -----------------------------------------------------------------------------
-- Le predicat, lu par le trigger
-- -----------------------------------------------------------------------------
--
-- SECURITY DEFINER (regle 13) : un trigger s'execute avec les droits de
-- l'appelant, et la RLS de cette table masquerait alors les clotures des
-- entites hors perimetre du saisissant — le verrou ne tiendrait que pour ceux
-- qui peuvent deja le voir.

create or replace function fn_periode_est_close(p_entity uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from finance_periodes_cloturees c
    where c.entity_id = p_entity
      and c.periode = date_trunc('month', p_date)::date
      and c.rouverte_le is null
  );
$$;

comment on function fn_periode_est_close is
  'EF-FIN-26 — la periode de cette date est-elle close pour cette entite ? '
  'SECURITY DEFINER : lue depuis un trigger, qui s''execute avec les droits de '
  'l''appelant (regle 13).';


-- -----------------------------------------------------------------------------
-- Le verrou, greffe sur le trigger d'ecriture existant
-- -----------------------------------------------------------------------------
--
-- LA VERIFICATION PORTE SUR LES DEUX PERIODES lors d'un deplacement de date :
-- sortir un mouvement d'une periode close est une modification retroactive tout
-- autant qu'y en faire entrer un.

create or replace function fn_finance_before_write() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_workflow_actif boolean;
begin
  new.periode := date_trunc('month', new.date_operation)::date;

  -- RG-13 : le sens est DEDUIT de la categorie, jamais saisi a la main.
  if tg_op = 'INSERT' or new.categorie_id is distinct from old.categorie_id then
    select sens into new.sens from finance_categories where id = new.categorie_id;
  end if;

  -- EF-FIN-26 : rien n'entre dans une periode close.
  if fn_periode_est_close(new.entity_id, new.date_operation) then
    raise exception
      'EF-FIN-26 : la periode % de cette entite est cloturee ; sa reouverture est necessaire.',
      to_char(new.periode, 'MM/YYYY')
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'INSERT' then
    v_workflow_actif := fn_finance_workflow_actif(new.entity_id);

    -- RG-16 : workflow inactif POUR CETTE ENTITE => validation immediate.
    if not v_workflow_actif and new.statut = 'BROUILLON' then
      new.statut := 'VALIDE';
      new.valide_le := now();
    end if;

  else
    /**
     * Rien ne SORT non plus d'une periode close — ni par un changement de
     * date, ni par un changement d'entite. Deplacer une ecriture hors d'un
     * exercice arrete est exactement ce que la cloture interdit, et c'est la
     * forme la plus discrete de la modification retroactive.
     */
    if old.date_operation is distinct from new.date_operation
    or old.entity_id is distinct from new.entity_id
    then
      if fn_periode_est_close(old.entity_id, old.date_operation) then
        raise exception
          'EF-FIN-26 : ce mouvement appartient a la periode cloturee % ; sa reouverture est necessaire.',
          to_char(old.periode, 'MM/YYYY')
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    -- RG-17 : un mouvement valide est immuable, sauf annulation motivee.
    if old.statut = 'VALIDE' then
      if not (new.statut = 'ANNULE' and new.motif_annulation is not null) then
        raise exception
          'RG-17 : un mouvement valide est immuable ; seule une annulation motivee est possible';
      end if;
      if (new.montant, new.categorie_id, new.entity_id, new.date_operation, new.sens)
         is distinct from
         (old.montant, old.categorie_id, old.entity_id, old.date_operation, old.sens)
      then
        raise exception
          'RG-17 : les donnees d''un mouvement valide ne peuvent pas etre modifiees';
      end if;
    end if;

    -- Transitions autorisees. Chaque branche enumere les etats ATTEIGNABLES
    -- depuis l'etat courant ; tout le reste est refuse.
    if (old.statut = 'BROUILLON' and new.statut not in ('BROUILLON','SOUMIS','VALIDE','ANNULE'))
    or (old.statut = 'SOUMIS'    and new.statut not in ('SOUMIS','VALIDE','REJETE','ANNULE'))
    or (old.statut = 'REJETE'    and new.statut not in ('REJETE','BROUILLON','ANNULE'))
    or (old.statut = 'ANNULE'    and new.statut <> 'ANNULE')
    then
      raise exception 'Transition de statut interdite : % -> %', old.statut, new.statut;
    end if;

    if new.statut = 'SOUMIS' and old.statut is distinct from 'SOUMIS' then
      new.soumis_le := now();
    end if;
    if new.statut = 'VALIDE' and old.statut is distinct from 'VALIDE' then
      new.valide_le := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;


-- -----------------------------------------------------------------------------
-- Clore
-- -----------------------------------------------------------------------------

create or replace function fn_cloturer_periode(
  p_entity          uuid,
  p_periode         date,
  p_avec_perimetre  boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mois    date := date_trunc('month', p_periode)::date;
  v_profil  uuid := current_profile_id();
  v_path    ltree;
  v_cibles  uuid[];
  v_entite  uuid;
  v_reste   integer;
  v_nom     text;
  v_nombre  integer := 0;
begin
  select path into v_path from entities where id = p_entity and deleted_at is null;
  if v_path is null then
    raise exception 'Cette entite est introuvable.';
  end if;

  /**
   * LA CASCADE SE DEMANDE, elle ne se deduit pas. Sans `p_avec_perimetre`, on
   * clot une seule entite : celle qui arrete ses comptes.
   */
  if p_avec_perimetre then
    select array_agg(e.id) into v_cibles
      from entities e
     where e.path <@ v_path
       and e.deleted_at is null;
  else
    v_cibles := array[p_entity];
  end if;

  foreach v_entite in array v_cibles
  loop
    -- RG-25 : le droit s'evalue AVEC SA PORTEE, entite par entite. Un
    -- gestionnaire de district ne clot pas une eglise hors de son perimetre,
    -- meme en demandant la cascade.
    if not can('finance.periode.close', v_entite) then
      continue;
    end if;

    -- Deja close : on n'ecrit pas une seconde ligne vivante. L'index partiel
    -- le refuserait, et une cascade rejouee doit rester sans effet.
    if fn_periode_est_close(v_entite, v_mois) then
      continue;
    end if;

    /**
     * ON NE CLOT PAS SUR DU TRAVAIL EN COURS.
     *
     * Un mouvement soumis dans une periode close ne pourrait plus etre ni
     * valide ni rejete : il resterait bloque jusqu'a une reouverture, sans que
     * rien a l'ecran n'en dise la cause. Le refus est nomme — l'entite, et ce
     * qui reste a decider.
     */
    select count(*) into v_reste
      from finance_entries f
     where f.entity_id = v_entite
       and f.periode = v_mois
       and f.deleted_at is null
       and f.statut in ('BROUILLON', 'SOUMIS');

    if v_reste > 0 then
      select nom into v_nom from entities where id = v_entite;
      raise exception
        'Cloture impossible : % mouvement(s) de % attendent encore une decision pour %.',
        v_reste, v_nom, to_char(v_mois, 'MM/YYYY')
        using errcode = 'check_violation';
    end if;

    insert into finance_periodes_cloturees (entity_id, periode, cloture_par)
    values (v_entite, v_mois, v_profil);

    v_nombre := v_nombre + 1;
  end loop;

  if v_nombre = 0 then
    raise exception
      'Aucune periode n''a ete cloturee : elles le sont deja, ou votre habilitation ne les couvre pas.'
      using errcode = 'insufficient_privilege';
  end if;

  return v_nombre;
end $$;

revoke execute on function fn_cloturer_periode from anon;

comment on function fn_cloturer_periode is
  'EF-FIN-26 — clot une periode pour une entite, et pour son perimetre si on le '
  'demande. Refuse tant qu''un brouillon ou un mouvement soumis y subsiste.';


-- -----------------------------------------------------------------------------
-- Rouvrir
-- -----------------------------------------------------------------------------
--
-- RESERVE AU SIEGE, et le texte de l'exigence est explicite : « sans
-- reouverture par le SuperAdmin ». `finance.periode.reopen` est donc NON
-- DELEGABLE — sans quoi celui qui clot pourrait s'accorder de quoi rouvrir, et
-- la cloture ne serait plus qu'une convention entre soi.

create or replace function fn_rouvrir_periode(
  p_entity   uuid,
  p_periode  date,
  p_motif    text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mois   date := date_trunc('month', p_periode)::date;
  v_profil uuid := current_profile_id();
  v_nombre integer;
begin
  if not can('finance.periode.reopen', p_entity) then
    raise exception 'Seul le Siege peut rouvrir une periode cloturee (EF-FIN-26).'
      using errcode = 'insufficient_privilege';
  end if;

  if nullif(trim(coalesce(p_motif, '')), '') is null then
    raise exception 'La reouverture d''une periode doit etre motivee.'
      using errcode = 'check_violation';
  end if;

  update finance_periodes_cloturees c
     set rouverte_le = now(),
         rouverte_par = v_profil,
         motif_reouverture = trim(p_motif)
   where c.entity_id = p_entity
     and c.periode = v_mois
     and c.rouverte_le is null;

  get diagnostics v_nombre = row_count;

  if v_nombre = 0 then
    raise exception 'Cette periode n''est pas cloturee.'
      using errcode = 'no_data_found';
  end if;

  return v_nombre;
end $$;

revoke execute on function fn_rouvrir_periode from anon;

comment on function fn_rouvrir_periode is
  'EF-FIN-26 — rouvre une periode close, sur motif. Reserve au detenteur de '
  'finance.periode.reopen, droit non delegable.';


-- -----------------------------------------------------------------------------
-- Le droit de reouverture entre dans les non delegables — RG-24
-- -----------------------------------------------------------------------------
--
-- DOIT rester aligne sur `NON_DELEGABLES` dans `lib/domain/permissions.ts`,
-- ce qu'un test verrouille en lisant ce fichier.

create or replace function fn_permissions_non_delegables() returns text[]
language sql immutable as $$
  select array[
    'entity.delete',
    -- Effacer l'histoire d'un bureau se decide au Siege, pas en cascade.
    'bureau.delete',
    'referentiel.manage',
    'settings.manage',
    'finance.delegate',
    -- EF-FIN-18 : la levee de la separation saisie/validation.
    'finance.validate_own',
    -- EF-FIN-26 : celui qui clot ne doit pas pouvoir s'accorder de quoi rouvrir.
    'finance.periode.reopen'
  ]::text[]
$$;

notify pgrst, 'reload schema';
