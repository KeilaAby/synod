-- =============================================================================
-- SYNOD — Mise a jour de la base
-- =============================================================================
-- FICHIER GENERE — ne pas editer a la main.
-- Regenerer avec : pnpm db:bundle --depuis 0009
--
-- Contient uniquement les migrations POSTERIEURES a « 0009 » :
--   · 0010_croyants.sql
--   · 0011_transferts.sql
--
-- L'amorce (seed) n'est PAS incluse : elle a deja ete appliquee.
--
-- Genere le 2026-08-06T15:39:12.054Z
-- =============================================================================


-- #############################################################################
-- ## 0000_migrations.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0000 — Suivi des migrations appliquees
-- =============================================================================
-- Sans registre, rien ne distingue une base neuve d'une base deja installee :
-- rejouer `install.sql` echoue des le premier `create type`, et l'on ne sait
-- pas ou l'on en est.
--
-- Chaque section des fichiers generes s'enregistre ici. `diagnostic.sql` lit
-- cette table pour dire quelles migrations restent a appliquer.
-- =============================================================================

create table if not exists schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

comment on table schema_migrations is
  'Registre des migrations appliquees. Alimente par les fichiers generes.';

insert into schema_migrations (version) values ('0000')
  on conflict (version) do nothing;

-- #############################################################################
-- ## Rattrapage du registre — migrations deja appliquees
-- #############################################################################

insert into schema_migrations (version) values
  ('0001'),
  ('0002'),
  ('0003'),
  ('0004'),
  ('0005'),
  ('0006'),
  ('0007'),
  ('0008'),
  ('0009')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0010_croyants.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0010 — Croyants
-- =============================================================================
-- Reference : plan.md §3.5 — EF-CRO-01 a 13
-- Regles : RG-04 (une seule eglise), RG-05 (cellule fille de l'eglise),
--          RG-06 (grade et nationalite au referentiel), RG-28 (coherence des
--          dates), RG-29 (matricule immuable)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sequence de matricules — EF-CRO-02.
-- Une sequence PAR EGLISE ET PAR ANNEE : le matricule reste lisible et parlant
-- (EGL-COT-2026-0147), la ou une sequence globale produirait des numeros sans
-- rapport avec l'entite.
-- -----------------------------------------------------------------------------
create table matricule_sequences (
  cle     text primary key,            -- '<CODE_EGLISE>:<ANNEE>'
  dernier integer not null default 0
);

create or replace function fn_generer_matricule(p_code_eglise text) returns text
language plpgsql as $$
declare v_cle text; v_seq integer;
begin
  v_cle := p_code_eglise || ':' || extract(year from current_date)::text;

  -- `on conflict do update` rend l'increment atomique : deux saisies
  -- simultanees dans la meme eglise ne peuvent pas obtenir le meme numero.
  insert into matricule_sequences (cle, dernier)
  values (v_cle, 1)
  on conflict (cle) do update set dernier = matricule_sequences.dernier + 1
  returning dernier into v_seq;

  return format('%s-%s-%s', p_code_eglise, extract(year from current_date),
                lpad(v_seq::text, 4, '0'));
end $$;


-- -----------------------------------------------------------------------------
-- Croyants
-- -----------------------------------------------------------------------------
create table croyants (
  id             uuid primary key default gen_random_uuid(),
  matricule      text not null unique,                    -- RG-29, immuable
  photo_key      text,                                    -- cle d'objet relative (ENF-POR-03)
  nom            text not null,
  prenom         text not null,
  sexe           sexe_type not null,
  statut_marital statut_marital,
  email          text,
  telephone      text,
  date_naissance date not null,
  date_bapteme   date not null,
  adresse        text not null,

  -- RG-04 : rattachement principal, obligatoire et unique
  eglise_id      uuid not null references entities(id) on delete restrict,
  -- RG-05 : facultatif, et necessairement fille de l'eglise ci-dessus
  cellule_id     uuid references entities(id) on delete set null,

  grade_id       uuid not null references grades(id)       on delete restrict,
  nationalite_id uuid not null references nationalites(id) on delete restrict,

  statut         statut_croyant not null default 'ACTIF',

  saisi_par      uuid references profiles(id) on delete set null,
  saisi_depuis   uuid references entities(id) on delete set null,

  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- RG-28
  constraint croyants_dates_coherentes check (date_bapteme >= date_naissance),
  constraint croyants_naissance_passee check (date_naissance <= current_date),
  constraint croyants_bapteme_passe    check (date_bapteme  <= current_date),
  constraint croyants_email_valide
    check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$')
);

comment on table croyants is 'Personne physique membre de l''organisation — EF-CRO-01';
comment on column croyants.matricule is 'RG-29 : immuable, y compris apres transfert';
comment on column croyants.photo_key is 'ENF-POR-03 : cle relative, jamais une URL signee';

-- EF-CRO-05 — recherche en texte libre tolerante aux fautes.
-- Colonne generee plutot qu'index sur expression : PostgREST peut ainsi la
-- filtrer directement (`ilike`), tout en s'appuyant sur l'index trigram.
alter table croyants
  add column recherche text
  generated always as (
    nom || ' ' || prenom || ' ' || matricule || ' ' ||
    coalesce(email, '') || ' ' || coalesce(telephone, '')
  ) stored;

create index croyants_recherche_trgm on croyants using gin (recherche gin_trgm_ops);
create index croyants_eglise_idx     on croyants (eglise_id)  where deleted_at is null;
create index croyants_cellule_idx    on croyants (cellule_id) where deleted_at is null;
create index croyants_statut_idx     on croyants (statut, sexe) where deleted_at is null;
create index croyants_bapteme_idx    on croyants (date_bapteme desc) where deleted_at is null;
create index croyants_nom_idx        on croyants (nom, prenom) where deleted_at is null;
-- EF-CRO-13 : detection de doublons a la creation
create index croyants_doublon_idx    on croyants (lower(nom), lower(prenom), date_naissance)
  where deleted_at is null;


-- -----------------------------------------------------------------------------
-- Coherence des rattachements et immuabilite du matricule.
-- -----------------------------------------------------------------------------
create or replace function fn_croyants_check() returns trigger
language plpgsql as $$
declare v_eglise entities%rowtype; v_cellule entities%rowtype;
begin
  select * into v_eglise from entities where id = new.eglise_id;
  if not found or v_eglise.type <> 'EGLISE' then
    raise exception 'RG-04 : le rattachement principal doit etre une Eglise'
      using errcode = 'check_violation';
  end if;

  if new.cellule_id is not null then
    select * into v_cellule from entities where id = new.cellule_id;
    if not found or v_cellule.type <> 'CELLULE' then
      raise exception 'RG-05 : la cellule indiquee n''est pas une Cellule de priere'
        using errcode = 'check_violation';
    end if;
    if v_cellule.parent_id is distinct from new.eglise_id then
      raise exception 'RG-05 : la cellule « % » n''appartient pas a l''eglise « % »',
        v_cellule.nom, v_eglise.nom
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.matricule := fn_generer_matricule(v_eglise.code);
  else
    new.matricule := old.matricule;   -- RG-29
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger trg_croyants_biu
  before insert or update on croyants
  for each row execute function fn_croyants_check();


-- -----------------------------------------------------------------------------
-- EF-ADM-07 — un compte peut etre lie a une fiche croyant.
-- La contrainte n'a pu etre posee en 0005 : `croyants` n'existait pas encore.
-- -----------------------------------------------------------------------------
alter table profiles
  add constraint profiles_croyant_id_fkey
  foreign key (croyant_id) references croyants(id) on delete set null;


-- -----------------------------------------------------------------------------
-- RLS — RG-20 : un croyant n'est visible que depuis le perimetre de son eglise.
-- -----------------------------------------------------------------------------
alter table croyants enable row level security;

create policy croyants_select on croyants for select to authenticated
  using (entity_in_scope(eglise_id));

create policy croyants_insert on croyants for insert to authenticated
  with check (can('croyant.create', eglise_id));

create policy croyants_update on croyants for update to authenticated
  using      (can('croyant.update', eglise_id) or can('croyant.transfer', eglise_id))
  with check (entity_in_scope(eglise_id));

-- La suppression est LOGIQUE (deleted_at) : la suppression physique reste
-- reservee au Siege, pour la purge de corbeille (RG-22).
create policy croyants_delete on croyants for delete to authenticated
  using (is_superadmin());

-- Les sequences de matricules ne sont manipulees que par le trigger,
-- qui s'execute avec les droits du proprietaire de la table.
alter table matricule_sequences enable row level security;
create policy matricule_sequences_aucun_acces on matricule_sequences
  for all to authenticated using (false);

insert into schema_migrations (version) values ('0010')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0011_transferts.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0011 — Transferts et workflow d'approbation
-- =============================================================================
-- Reference : plan.md §3.8 — EF-TRF-01 a 11, ARB-4
-- Regles : RG-11 (aucun transfert applique sans approbation),
--          RG-12 (l'approbateur couvre origine ET destination)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RG-12 — plus petit ancetre commun de deux entites.
--
-- C'est lui qui borne l'ensemble des approbateurs competents : seul un compte
-- dont le perimetre couvre a la fois l'origine et la destination peut arbitrer
-- un transfert. Sans cette borne, un district pourrait « aspirer » les croyants
-- d'un autre district.
-- -----------------------------------------------------------------------------
create or replace function fn_ancetre_commun(a uuid, b uuid) returns uuid
language sql stable as $$
  select e.id
    from entities e,
         (select path from entities where id = a) pa,
         (select path from entities where id = b) pb
   where pa.path <@ e.path
     and pb.path <@ e.path
     and e.deleted_at is null
   order by nlevel(e.path) desc     -- le plus PROCHE des deux, pas la racine
   limit 1
$$;


create table transferts (
  id               uuid primary key default gen_random_uuid(),
  croyant_id       uuid not null references croyants(id) on delete cascade,

  -- Niveau auquel le changement s'opere : sert a l'affichage et aux filtres.
  niveau_transfert entity_type not null,

  from_eglise_id   uuid references entities(id) on delete set null,
  to_eglise_id     uuid not null references entities(id) on delete restrict,
  from_cellule_id  uuid references entities(id) on delete set null,
  to_cellule_id    uuid references entities(id) on delete set null,

  statut         statut_transfert not null default 'DEMANDE',
  motif          text,
  motif_refus    text,

  date_demande   timestamptz not null default now(),
  demande_par    uuid references profiles(id) on delete set null,
  date_decision  timestamptz,
  decide_par     uuid references profiles(id) on delete set null,
  date_effet     date,

  -- Fige a la demande : si la structure evolue ensuite, l'approbateur
  -- competent reste celui qui l'etait au moment ou le transfert a ete demande.
  ancetre_commun_id uuid references entities(id) on delete set null,

  created_at timestamptz not null default now(),

  constraint transfert_refus_motive
    check (statut <> 'REFUSE' or motif_refus is not null),
  constraint transfert_effet_date
    check (statut <> 'EFFECTUE' or date_effet is not null),
  constraint transfert_destination_differente
    check (from_eglise_id is distinct from to_eglise_id
        or from_cellule_id is distinct from to_cellule_id)
);

comment on table transferts is
  'Workflow d''approbation des transferts — ARB-4, RG-11, RG-12';
comment on column transferts.ancetre_commun_id is
  'RG-12 : borne les approbateurs competents. Fige a la demande.';

create index transferts_croyant_idx on transferts (croyant_id, date_demande desc);
create index transferts_attente_idx on transferts (ancetre_commun_id)
  where statut = 'DEMANDE';
create index transferts_periode_idx on transferts (date_demande desc);


-- -----------------------------------------------------------------------------
-- Transitions autorisees — RG-11.
-- Un transfert DEMANDE ou REFUSE ne modifie AUCUNE donnee du croyant : seul le
-- passage a EFFECTUE, opere par la Server Action dans une transaction unique,
-- applique le changement.
-- -----------------------------------------------------------------------------
create or replace function fn_transfert_transitions() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.statut <> 'DEMANDE' then
      raise exception 'RG-11 : un transfert nait toujours a l''etat « demande »'
        using errcode = 'check_violation';
    end if;
    new.ancetre_commun_id :=
      fn_ancetre_commun(coalesce(new.from_eglise_id, new.to_eglise_id), new.to_eglise_id);
    return new;
  end if;

  if old.statut is distinct from new.statut then
    if not (
         (old.statut = 'DEMANDE'  and new.statut in ('APPROUVE', 'REFUSE', 'ANNULE'))
      or (old.statut = 'APPROUVE' and new.statut in ('EFFECTUE', 'ANNULE'))
    ) then
      raise exception 'Transition de statut interdite : % → %', old.statut, new.statut
        using errcode = 'check_violation';
    end if;

    if new.statut in ('APPROUVE', 'REFUSE') then
      new.date_decision := now();
    end if;
  end if;

  -- L'ancetre commun ne se recalcule jamais : il fige la competence.
  new.ancetre_commun_id := old.ancetre_commun_id;
  return new;
end $$;

create trigger trg_transfert_transitions
  before insert or update on transferts
  for each row execute function fn_transfert_transitions();


-- -----------------------------------------------------------------------------
-- RLS — le demandeur voit son transfert, l'approbateur competent le decide.
-- -----------------------------------------------------------------------------
alter table transferts enable row level security;

-- Visible depuis l'un OU l'autre cote : les deux entites sont concernees.
create policy transferts_select on transferts for select to authenticated
  using (
       (from_eglise_id is not null and entity_in_scope(from_eglise_id))
    or entity_in_scope(to_eglise_id)
  );

create policy transferts_insert on transferts for insert to authenticated
  with check (
    can('croyant.transfer', coalesce(from_eglise_id, to_eglise_id))
    and statut = 'DEMANDE'
  );

-- RG-12 : seul un approbateur dont le perimetre couvre l'ancetre commun decide.
create policy transferts_update on transferts for update to authenticated
  using (
       can('transfer.approve', ancetre_commun_id)
    -- EF-TRF-10 : le demandeur peut retirer sa propre demande tant qu'elle
    -- n'est pas tranchee.
    or (statut = 'DEMANDE' and demande_par = current_profile_id())
  )
  with check (
       can('transfer.approve', ancetre_commun_id)
    or (statut = 'ANNULE' and demande_par = current_profile_id())
  );

create policy transferts_delete on transferts for delete to authenticated
  using (is_superadmin());


-- -----------------------------------------------------------------------------
-- Baptemes — EF-BAP-01 a 07.
-- `croyants.date_bapteme` reste la source de verite des indicateurs ; cette
-- table porte les informations de ceremonie, qui n'ont pas leur place sur la
-- fiche du croyant.
-- -----------------------------------------------------------------------------
create table baptemes (
  id              uuid primary key default gen_random_uuid(),
  croyant_id      uuid not null unique references croyants(id) on delete cascade,
  entity_id       uuid not null references entities(id) on delete restrict,
  date_bapteme    date not null,
  lieu            text,
  celebrant_id    uuid references croyants(id) on delete set null,
  session_libelle text,
  saisi_par       uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index baptemes_date_idx   on baptemes (date_bapteme desc);
create index baptemes_entity_idx on baptemes (entity_id, date_bapteme desc);

alter table baptemes enable row level security;

create policy baptemes_select on baptemes for select to authenticated
  using (entity_in_scope(entity_id));

create policy baptemes_insert on baptemes for insert to authenticated
  with check (can('bapteme.create', entity_id));

create policy baptemes_update on baptemes for update to authenticated
  using (can('bapteme.create', entity_id)) with check (entity_in_scope(entity_id));

create policy baptemes_delete on baptemes for delete to authenticated
  using (is_superadmin());

insert into schema_migrations (version) values ('0011')
  on conflict (version) do nothing;
