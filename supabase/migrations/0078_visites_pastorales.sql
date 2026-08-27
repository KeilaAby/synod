-- =============================================================================
-- SYNOD — 0078 — Module de Planification des Visites Pastorales
-- =============================================================================
-- Reference : cdg.md §4, plan.md §5, RG-24, RG-25.
--
-- 1. Une entite (Siege, Region, District, Paroisse, Eglise) peut planifier
--    une visite pastorale aupres d'une eglise / entite de destination.
-- 2. La delegation est composee de croyants grades (pas forcement membres
--    du bureau), avec role libre (Predicateur principal, Celebrant, Accompagnateur...).
-- 3. La visite donne lieu a un Ordre de Mission A4 officiel.
-- =============================================================================

-- Table principale des visites pastorales
create table if not exists visites_pastorales (
  id uuid primary key default gen_random_uuid(),
  entite_initiatrice_id uuid not null references entities(id) on delete cascade,
  entite_cible_id uuid not null references entities(id) on delete restrict,
  date_visite date not null,
  heure_visite text not null default '09:00',
  type_culte text not null,
  theme_message text,
  instructions text,
  statut text not null default 'PLANIFIE'
    check (statut in ('PLANIFIE', 'CONFIRME', 'EFFECTUE', 'ANNULE')),
  reference_ordre_mission text unique,
  cree_par uuid references profiles(id) on delete set null,
  valide_par uuid references profiles(id) on delete set null,
  valide_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index pour accelerer les filtres de calendrier et de recherche
create index if not exists idx_visites_date on visites_pastorales (date_visite);
create index if not exists idx_visites_initiatrice on visites_pastorales (entite_initiatrice_id);
create index if not exists idx_visites_cible on visites_pastorales (entite_cible_id);
create index if not exists idx_visites_statut on visites_pastorales (statut);

-- Table des membres missionnaires / delegues de la visite pastorale
create table if not exists visites_pastorales_delegues (
  id uuid primary key default gen_random_uuid(),
  visite_id uuid not null references visites_pastorales(id) on delete cascade,
  croyant_id uuid not null references croyants(id) on delete cascade,
  role_mission text not null default 'Délégué',
  ordre smallint not null default 1,
  created_at timestamptz not null default now(),
  unique(visite_id, croyant_id)
);

create index if not exists idx_visites_delegues_visite on visites_pastorales_delegues (visite_id);
create index if not exists idx_visites_delegues_croyant on visites_pastorales_delegues (croyant_id);

-- Sequence et fonction de generation de reference automatique OM-SYNOD-AAAA-MM/XXX
create sequence if not exists seq_ordre_mission_num start 1;

create or replace function fn_generer_reference_visite(p_date date)
returns text language plpgsql as $$
declare
  v_annee text := to_char(coalesce(p_date, current_date), 'YYYY');
  v_mois  text := to_char(coalesce(p_date, current_date), 'MM');
  v_num   bigint;
begin
  v_num := nextval('seq_ordre_mission_num');
  return 'OM-SYNOD-' || v_annee || '-' || v_mois || '/' || lpad(v_num::text, 3, '0');
end;
$$;

-- Trigger pour auto-assigner la reference et mettre a jour updated_at
create or replace function fn_visite_pastorale_before_write()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.reference_ordre_mission is null or btrim(new.reference_ordre_mission) = '' then
    new.reference_ordre_mission := fn_generer_reference_visite(new.date_visite);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_visite_pastorale_before_write on visites_pastorales;
create trigger trg_visite_pastorale_before_write
  before insert or update on visites_pastorales
  for each row execute function fn_visite_pastorale_before_write();

-- -----------------------------------------------------------------------------
-- Habilitations PROPRE : mise a jour du registre
-- -----------------------------------------------------------------------------
create or replace function fn_permissions_portee_propre() returns text[]
language sql immutable as $$
  select array[
    -- Chaque bureau gere SES finances ; la hierarchie les consulte (lot 4).
    'finance.create',
    'finance.update',
    'finance.submit',
    'finance.validate',
    'finance.validate_own',
    'finance.periode.close',
    'finance.periode.reopen',
    -- Composer le bureau d'une eglise ne revient pas au district.
    'bureau.manage',
    'bureau.delete',
    -- Les comptes et les habilitations d'une entite ne se pilotent pas d'en haut.
    'user.manage',
    'permission.delegate',
    'trash.purge',
    -- Une entite planifie, modifie, valide ou annule SES propres visites / delegations.
    'visite.create',
    'visite.update',
    'visite.validate',
    'visite.delete'
  ]::text[]
$$;

-- -----------------------------------------------------------------------------
-- RLS (Row Level Security)
-- -----------------------------------------------------------------------------
alter table visites_pastorales enable row level security;
alter table visites_pastorales_delegues enable row level security;

-- Lecture des visites pastorales :
-- Une entite peut lire si elle est initiatrice (dans son perimetre) OU si elle est l'eglise accueillante.
create policy visites_pastorales_select on visites_pastorales
  for select using (
    is_superadmin()
    or has_perm('visite.read', entite_initiatrice_id)
    or exists (
      select 1 from entities e
       where e.id = entite_cible_id
         and e.path <@ current_scope_path()
    )
  );

-- Creation d'une visite pastorale : reservee a l'entite initiatrice avec droit visite.create
create policy visites_pastorales_insert on visites_pastorales
  for insert with check (
    is_superadmin() or has_perm('visite.create', entite_initiatrice_id)
  );

-- Modification : reservee a l'entite initiatrice avec droit visite.update
create policy visites_pastorales_update on visites_pastorales
  for update using (
    is_superadmin() or has_perm('visite.update', entite_initiatrice_id)
  );

-- Suppression : reservee a l'entite initiatrice avec droit visite.delete
create policy visites_pastorales_delete on visites_pastorales
  for delete using (
    is_superadmin() or has_perm('visite.delete', entite_initiatrice_id)
  );

-- Delegation des membres : liee aux droits sur la visite parent
create policy visites_delegues_select on visites_pastorales_delegues
  for select using (
    exists (
      select 1 from visites_pastorales v
       where v.id = visites_pastorales_delegues.visite_id
    )
  );

create policy visites_delegues_all on visites_pastorales_delegues
  for all using (
    exists (
      select 1 from visites_pastorales v
       where v.id = visites_pastorales_delegues.visite_id
         and (is_superadmin() or has_perm('visite.update', v.entite_initiatrice_id) or has_perm('visite.create', v.entite_initiatrice_id))
    )
  );

-- Notification PostgREST pour recharger le schema
notify pgrst, 'reload schema';
