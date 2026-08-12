-- =============================================================================
-- SYNOD — 0023 — Finances
-- =============================================================================
-- Reference : plan.md §3.7 — EF-FIN-01 a 20
-- Regles : RG-13 (le sens vient de la categorie), RG-14 (perimetre strict),
--          RG-16 (workflow desactive => validation immediate),
--          RG-17 (un mouvement valide est immuable),
--          RG-18 (seul le valide alimente le solde)
--
-- Decisions du 12 aout 2026 :
--   1. Workflow de validation INACTIF au demarrage.
--   2. Separation saisie/validation appliquee des que le workflow est actif ;
--      le double role existe comme droit explicite, non accorde par defaut.
--   3. Categories UNIFORMES pour toute l'organisation (deja le cas : la table
--      `finance_categories` n'a pas d'`entity_id`).
--   4. Le workflow s'active PAR ENTITE — voir `fn_finance_workflow_actif`.
--      Ecart assume a EF-FIN-15, qui le decrivait global.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Le workflow s'active PAR ENTITE, ET SANS AUCUN HERITAGE — ecart a EF-FIN-15.
--
-- L'exigence le voulait global. Une eglise qui compte trois personnes n'a
-- personne pour valider ce qu'une autre a saisi, quand un district structure
-- l'exige : un reglage unique force l'organisation entiere a s'aligner sur son
-- maillon le moins outille.
--
-- PAS D'HERITAGE DEPUIS LE PARENT, et c'est une decision de fond (12 aout
-- 2026) : chaque entite a SON bureau, et chaque bureau gere SES finances. Un
-- district n'administre pas la caisse de ses eglises — il la CONSULTE. Lui
-- laisser imposer le mode de validation de leurs ecritures reviendrait a lui
-- donner sur elles une autorite que la structure ne lui reconnait pas.
--
--   null  -> « je n'ai pas decide » : on prend le defaut de l'ORGANISATION,
--            qui n'est pas un parent mais un reglage d'ensemble.
--   true  -> decide ici, et ici seulement.
--   false -> idem.
-- -----------------------------------------------------------------------------
alter table entities
  add column if not exists finance_validation_active boolean;

comment on column entities.finance_validation_active is
  'EF-FIN-15 (adapte) : workflow de validation financiere, propre a l''entite. '
  'null = defaut de l''organisation. Aucun heritage depuis le parent : chaque '
  'bureau gere ses finances, la hierarchie ne fait que les consulter.';


/**
 * Le workflow est-il actif POUR CETTE ENTITE ?
 *
 * Sa propre colonne, et rien d'autre — puis le defaut de l'organisation. Le
 * chemin ltree n'intervient PAS : remonter aux ancetres ferait decider un
 * district pour ses eglises.
 *
 * SECURITY DEFINER : la fonction est appelee par un TRIGGER, qui s'execute avec
 * les droits de l'appelant. Sans cela, un compte qui ne lit pas
 * `organisation_settings` verrait `null` la ou la reponse est `true` — et son
 * mouvement serait valide d'emblee (regle 13).
 */
create or replace function fn_finance_workflow_actif(p_entity uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select e.finance_validation_active from entities e where e.id = p_entity),
    (select s.finance_validation_active from organisation_settings s where s.id = 1),
    false   -- a defaut de savoir, on ne bloque pas la saisie d'une organisation neuve
  );
$$;


-- -----------------------------------------------------------------------------
-- Mouvements financiers — EF-FIN-01
-- -----------------------------------------------------------------------------
create table if not exists finance_entries (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references entities(id) on delete restrict,
  categorie_id   uuid not null references finance_categories(id) on delete restrict,
  -- DA-8 : denormalise depuis la categorie par le trigger, jamais saisi.
  sens           sens_finance not null,
  montant        numeric(14,2) not null check (montant > 0),
  date_operation date not null,
  -- 1er jour du mois, calcule : c'est la maille de toutes les consolidations.
  periode        date not null,
  libelle        text,
  reference      text,
  justificatif_key text,                         -- cle d'objet relative (ENF-POR-03)

  -- Workflow de validation (ARB-3, EF-FIN-14 a 20)
  statut         statut_mouvement not null default 'BROUILLON',
  soumis_par     uuid references profiles(id) on delete set null,
  soumis_le      timestamptz,
  valide_par     uuid references profiles(id) on delete set null,
  valide_le      timestamptz,
  motif_rejet    text,
  motif_annulation text,

  -- Saisie deleguee (ARB-2, EF-FIN-05, EF-FIN-06)
  est_delegue            boolean not null default false,
  saisi_par              uuid references profiles(id) on delete set null,
  saisi_depuis_entity_id uuid references entities(id) on delete set null,

  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint finance_date_passee   check (date_operation <= current_date),
  constraint finance_rejet_motive  check (statut <> 'REJETE' or motif_rejet is not null),
  constraint finance_annul_motive  check (statut <> 'ANNULE' or motif_annulation is not null)
);

comment on table finance_entries is
  'Mouvement financier d''une entite — EF-FIN-01 a 20, RG-13 a RG-18';

-- RG-18 — l'index du solde ne porte QUE le valide : c'est la seule matiere du
-- calcul, et l'index partiel evite de parcourir brouillons et rejets.
create index if not exists finance_solde_idx
  on finance_entries (entity_id, periode, sens)
  where statut = 'VALIDE' and deleted_at is null;

create index if not exists finance_statut_idx
  on finance_entries (statut, entity_id)
  where deleted_at is null;

create index if not exists finance_categorie_idx
  on finance_entries (categorie_id, periode desc);

create index if not exists finance_delegue_idx
  on finance_entries (est_delegue)
  where est_delegue;


-- -----------------------------------------------------------------------------
-- Sens, periode, workflow et immuabilite — RG-13, RG-16, RG-17
-- -----------------------------------------------------------------------------
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

  if tg_op = 'INSERT' then
    v_workflow_actif := fn_finance_workflow_actif(new.entity_id);

    -- RG-16 : workflow inactif POUR CETTE ENTITE => validation immediate.
    if not v_workflow_actif and new.statut = 'BROUILLON' then
      new.statut := 'VALIDE';
      new.valide_le := now();
    end if;

  else
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

drop trigger if exists trg_finance_biu on finance_entries;
create trigger trg_finance_biu
  before insert or update on finance_entries
  for each row execute function fn_finance_before_write();


-- -----------------------------------------------------------------------------
-- RLS — RG-14 : la saisie ne sort jamais du perimetre
-- -----------------------------------------------------------------------------
alter table finance_entries enable row level security;

drop policy if exists finance_entries_select on finance_entries;
create policy finance_entries_select on finance_entries for select to authenticated
  using (entity_in_scope(entity_id));

drop policy if exists finance_entries_insert on finance_entries;
create policy finance_entries_insert on finance_entries for insert to authenticated
  with check (
    -- EF-FIN-05 : la saisie DELEGUEE releve d'un droit distinct. Sans cette
    -- branche, le Siege ne pourrait rien saisir pour une entite sans acces.
    can('finance.create', entity_id) or can('finance.delegate', entity_id)
  );

drop policy if exists finance_entries_update on finance_entries;
create policy finance_entries_update on finance_entries for update to authenticated
  using (
       can('finance.update', entity_id)
    or can('finance.submit', entity_id)
    or can('finance.validate', entity_id)
  )
  with check (
       can('finance.update', entity_id)
    or can('finance.submit', entity_id)
    or can('finance.validate', entity_id)
  );

-- RG-22 — la suppression est LOGIQUE : `deleted_at` par un update. Aucune
-- politique DELETE, sauf pour le Siege qui purge la corbeille.
drop policy if exists finance_entries_delete on finance_entries;
create policy finance_entries_delete on finance_entries for delete to authenticated
  using (is_superadmin());


-- -----------------------------------------------------------------------------
-- Solde d'une entite ET DE SON SOUS-ARBRE — EF-FIN-09, EF-FIN-12, RG-18
--
-- Le calcul se fait EN BASE, en une requete. Ramener les mouvements pour les
-- additionner dans le navigateur aurait transporte des dizaines de milliers de
-- lignes pour en tirer trois nombres.
--
-- `propre` et `consolide` sont rendus SEPAREMENT (EF-FIN-12) : une paroisse
-- dont le solde consolide est confortable peut n'avoir rien en propre, et la
-- confusion des deux est precisement ce qui fait engager de l'argent qu'on n'a
-- pas.
-- -----------------------------------------------------------------------------
create or replace function fn_finance_solde(
  p_entity uuid,
  p_debut  date default null,
  p_fin    date default null
)
returns table (
  recettes_propres    numeric,
  depenses_propres    numeric,
  recettes_consolidees numeric,
  depenses_consolidees numeric
)
language sql
stable
as $$
  with cible as (select path from entities where id = p_entity),
  lignes as (
    select f.sens, f.montant, f.entity_id
    from finance_entries f
    join entities e on e.id = f.entity_id
    where f.statut = 'VALIDE'
      and f.deleted_at is null
      and e.path <@ (select path from cible)
      and (p_debut is null or f.date_operation >= p_debut)
      and (p_fin   is null or f.date_operation <= p_fin)
  )
  select
    coalesce(sum(montant) filter (where sens = 'RECETTE' and entity_id = p_entity), 0),
    coalesce(sum(montant) filter (where sens = 'DEPENSE' and entity_id = p_entity), 0),
    coalesce(sum(montant) filter (where sens = 'RECETTE'), 0),
    coalesce(sum(montant) filter (where sens = 'DEPENSE'), 0)
  from lignes;
$$;

comment on function fn_finance_solde is
  'EF-FIN-09/12 — recettes et depenses VALIDEES, en propre et consolidees sur '
  'le sous-arbre. RG-18 : le brouillon, le soumis et le rejete n''y entrent pas.';
