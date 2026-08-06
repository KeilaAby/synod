-- =============================================================================
-- SYNOD — 0005 — Comptes, habilitations fines et preferences
-- =============================================================================
-- Reference : plan.md §3.10 et §5 — ARB-3, RG-20, RG-21, RG-24, RG-25
--
-- PORTABILITE (ENF-POR-02) : `profiles` possede sa PROPRE cle primaire.
-- `auth_user_id` est l'unique point de couplage avec le fournisseur d'identite.
-- Changer de fournisseur ne touche ni le modele metier ni les politiques RLS.
-- =============================================================================

create table profiles (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,                    -- identifiant chez le fournisseur d'auth
  email        text not null unique,
  nom_complet  text not null,
  role         user_role not null default 'LECTEUR',
  entity_id    uuid not null references entities(id) on delete restrict,  -- perimetre
  croyant_id   uuid,                            -- FK ajoutee au lot 2 (EF-ADM-07)
  is_active    boolean not null default true,
  derniere_connexion timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table profiles is 'Compte applicatif — le perimetre est le sous-arbre de entity_id (RG-20)';
comment on column profiles.auth_user_id is
  'ENF-POR-02 : seul lien vers le fournisseur d''identite. Nullable le temps de l''invitation.';

create index profiles_entity_idx on profiles (entity_id);

-- Referentiel circulaire resolu ici : entities.created_by -> profiles.id
alter table entities
  add constraint entities_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;


-- -----------------------------------------------------------------------------
-- RG-21 : aucun compte rattache a une Cellule.
-- Un SuperAdmin est necessairement rattache au Siege (EF-ACT-2).
-- -----------------------------------------------------------------------------
create or replace function fn_profile_rattachement() returns trigger
language plpgsql as $$
declare v_type entity_type;
begin
  select type into v_type from entities where id = new.entity_id;

  if v_type = 'CELLULE' then
    raise exception 'RG-21 : une Cellule ne peut disposer d''un compte d''acces'
      using errcode = 'check_violation';
  end if;

  if new.role = 'SUPERADMIN' and v_type <> 'SIEGE' then
    raise exception 'EF-ACT-2 : un SuperAdmin doit etre rattache au Siege'
      using errcode = 'check_violation';
  end if;

  new.updated_at := now();
  return new;
end $$;

-- Volontairement sur TOUTE ecriture, et non sur les seules colonnes concernees :
-- le controle est un simple SELECT indexe, et `updated_at` doit etre touche a
-- chaque modification, pas seulement lors d'un changement de rattachement.
create trigger trg_profile_rattachement
  before insert or update on profiles
  for each row execute function fn_profile_rattachement();


-- -----------------------------------------------------------------------------
-- Habilitation = (cle, portee)  — DA-10, RG-25
--   scope_entity_id NULL  => le droit couvre tout le perimetre du compte
--   scope_entity_id defini => le droit est restreint a cette sous-structure
--                             et a ses descendants
-- -----------------------------------------------------------------------------
create table user_permissions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  permission      text not null,
  scope_entity_id uuid references entities(id) on delete cascade,
  source          text not null default 'INDIVIDUEL'
                    check (source in ('ROLE', 'PROFIL', 'INDIVIDUEL')),
  granted_by      uuid references profiles(id) on delete set null,
  granted_at      timestamptz not null default now()
);

comment on table user_permissions is
  'Droit unitaire eventuellement restreint a une sous-structure — ARB-3, RG-25';

-- NULL etant distinct de NULL dans un index unique, on normalise la portee absente.
create unique index user_permissions_unique on user_permissions
  (user_id, permission, coalesce(scope_entity_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index user_permissions_user_idx on user_permissions (user_id);


-- -----------------------------------------------------------------------------
-- Profils d'habilitation reutilisables — EF-ADM-05
--   entity_id NULL => profil global, gere par le Siege
-- -----------------------------------------------------------------------------
create table permission_profiles (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  description text,
  entity_id   uuid references entities(id) on delete cascade,
  permissions text[] not null default '{}',
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- Tableau de bord configurable — EF-DSH-03, EF-DSH-07
-- -----------------------------------------------------------------------------
create table dashboard_layouts (
  user_id    uuid primary key references profiles(id) on delete cascade,
  layout     jsonb not null,
  updated_at timestamptz not null default now()
);

create table dashboard_templates (
  id           uuid primary key default gen_random_uuid(),
  nom          text not null,
  description  text,
  role_cible   user_role,
  niveau_cible entity_type,
  layout       jsonb not null,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);
