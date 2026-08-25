-- =============================================================================
-- SYNOD — Installation complete de la base
-- =============================================================================
-- FICHIER GENERE — ne pas editer a la main.
-- Regenerer avec : pnpm db:bundle
--
-- ⚠️  BASE NEUVE UNIQUEMENT.
--     Sur une base deja installee, ce fichier echoue des le premier
--     « create type ... already exists ». Utilisez alors :
--         pnpm db:bundle --depuis <derniere version appliquee>
--     La derniere version appliquee se lit dans supabase/diagnostic.sql.
--
-- Genere le 2026-08-25T12:57:00.712Z
-- Migrations : 76 + amorce
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
-- ## 0001_extensions.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0001 — Extensions
-- =============================================================================
-- ENF-POR-01 : uniquement des extensions PostgreSQL courantes, disponibles chez
-- tout hebergeur. Aucune extension proprietaire.
-- =============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists ltree;      -- chemins materialises (DA-2)
create extension if not exists pg_trgm;    -- recherche floue sur les croyants


-- -----------------------------------------------------------------------------
-- Role applicatif.
--
-- Les politiques RLS s'adressent toutes au role `authenticated`. Supabase le
-- fournit d'origine ; un PostgreSQL nu, non. Sans ce garde, la restauration
-- chez un hebergeur tiers (ENF-POR-07, CA-16) echouerait des la premiere
-- politique.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

insert into schema_migrations (version) values ('0001')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0002_enums.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0002 — Types enumeres
-- =============================================================================
-- Reference : plan.md §3.2
-- =============================================================================

-- Hierarchie a 6 niveaux, Siege inclus (RG-01, ARB-2)
create type entity_type as enum (
  'SIEGE', 'REGIONAL', 'DISTRICT', 'PAROISSE', 'EGLISE', 'CELLULE'
);

create type sexe_type      as enum ('M', 'F');
create type statut_marital as enum ('CELIBATAIRE', 'MARIE', 'VEUF', 'DIVORCE', 'AUTRE');
create type statut_croyant as enum ('ACTIF', 'INACTIF', 'TRANSFERE', 'DECEDE');

create type user_role as enum (
  'SUPERADMIN', 'ENTITE_ADMIN', 'ENTITE_OPERATEUR', 'LECTEUR'
);

-- Finances : recettes ET depenses (ARB-2)
create type sens_finance as enum ('RECETTE', 'DEPENSE');

-- Workflow de validation financiere, activable par le SuperAdmin (ARB-3, RG-16)
create type statut_mouvement as enum (
  'BROUILLON', 'SOUMIS', 'VALIDE', 'REJETE', 'ANNULE'
);

-- Workflow d'approbation des transferts (ARB-4, RG-11)
create type statut_transfert as enum (
  'DEMANDE', 'APPROUVE', 'REFUSE', 'ANNULE', 'EFFECTUE'
);

create type categorie_fonction as enum (
  'DIRECTION', 'FINANCE', 'COMMUNICATION', 'OEUVRES', 'AUTRE'
);

-- Generateur de rapports
create type visibilite_modele as enum ('PRIVE', 'ENTITE', 'DESCENDANTS', 'GLOBAL');
create type statut_rapport    as enum ('BROUILLON', 'GENERE', 'PUBLIE', 'ARCHIVE');

insert into schema_migrations (version) values ('0002')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0003_entities.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0003 — Hierarchie des entites
-- =============================================================================
-- Reference : plan.md §3.3 — RG-01, RG-02, RG-03
-- Table unique pour les 6 niveaux (DA-1) + chemin materialise ltree (DA-2).
-- =============================================================================

create table entities (
  id          uuid primary key default gen_random_uuid(),
  type        entity_type not null,
  code        text        not null,
  nom         text        not null,
  parent_id   uuid        references entities(id) on delete restrict,
  niveau      smallint    not null,   -- 1=SIEGE .. 6=CELLULE, derive de `type`
  path        ltree       not null,   -- chemin materialise racine -> noeud
  description text,

  -- ARB-2 / EF-STR-10 : autorise la saisie financiere deleguee par le Siege
  sans_acces_application boolean not null default false,

  is_active  boolean     not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,                     -- FK ajoutee en 0005 (dependance circulaire)
  updated_at timestamptz not null default now(),

  constraint entities_code_len    check (char_length(code) >= 3),                 -- RG-02
  constraint entities_code_format check (code ~ '^[A-Z0-9][A-Z0-9-]{2,15}$'),
  constraint entities_racine      check ((type = 'SIEGE') = (parent_id is null))  -- RG-03
);

comment on table  entities      is 'Noeuds de la structure ecclesiale, tous niveaux confondus (DA-1)';
comment on column entities.path is 'Chemin materialise ltree : permet "moi et mes descendants" via <@ (DA-2)';
comment on column entities.sans_acces_application is
  'Entite depourvue d''acces a l''application : le Siege saisit pour son compte (ARB-2)';

-- RG-02 : code unique sur toute l'application, tous niveaux confondus
create unique index entities_code_unique on entities (upper(code)) where deleted_at is null;

-- RG-03 : une seule et unique entite Siege
create unique index entities_siege_unique on entities (type)
  where type = 'SIEGE' and deleted_at is null;

create index entities_path_gist  on entities using gist (path);
create index entities_parent_idx on entities (parent_id) where deleted_at is null;
create index entities_type_idx   on entities (type)      where deleted_at is null;


-- -----------------------------------------------------------------------------
-- Etiquette ltree derivee d'un uuid.
-- Prefixe 'n' pour garantir une etiquette valide quel que soit l'uuid.
-- -----------------------------------------------------------------------------
create or replace function fn_ltree_label(p_id uuid) returns ltree
language sql immutable strict as $$
  select text2ltree('n' || replace(p_id::text, '-', '_'))
$$;


-- -----------------------------------------------------------------------------
-- RG-01 : hierarchie strictement ordonnee, aucun saut de niveau, aucun cycle.
-- Maintient `niveau` et `path` a chaque ecriture.
-- -----------------------------------------------------------------------------
create or replace function fn_entities_before_write() returns trigger
language plpgsql as $$
declare
  v_niveau smallint;
  v_parent entities%rowtype;
begin
  v_niveau := case new.type
    when 'SIEGE'    then 1
    when 'REGIONAL' then 2
    when 'DISTRICT' then 3
    when 'PAROISSE' then 4
    when 'EGLISE'   then 5
    when 'CELLULE'  then 6
  end;

  new.niveau := v_niveau;
  new.code   := upper(trim(new.code));

  if new.parent_id is null then
    if v_niveau <> 1 then
      raise exception 'RG-01 : une entite de type % doit avoir un parent', new.type
        using errcode = 'check_violation';
    end if;
    new.path := fn_ltree_label(new.id);
  else
    select * into v_parent from entities where id = new.parent_id;
    if not found then
      raise exception 'Entite parente introuvable' using errcode = 'foreign_key_violation';
    end if;

    -- Le parent doit etre du niveau immediatement superieur
    if v_parent.niveau <> v_niveau - 1 then
      raise exception
        'RG-01 : un(e) % ne peut etre rattache(e) qu''a un(e) %, pas a un(e) %',
        new.type,
        (array['SIEGE','REGIONAL','DISTRICT','PAROISSE','EGLISE'])[v_niveau - 1],
        v_parent.type
        using errcode = 'check_violation';
    end if;

    -- EF-STR-07 : un rattachement ne doit jamais creer de cycle
    if tg_op = 'UPDATE' and v_parent.path <@ fn_ltree_label(old.id) then
      raise exception 'RG-01 : rattachement impossible, cycle detecte'
        using errcode = 'check_violation';
    end if;

    new.path := v_parent.path || fn_ltree_label(new.id);
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger trg_entities_biu
  before insert or update of type, parent_id, code on entities
  for each row execute function fn_entities_before_write();


-- -----------------------------------------------------------------------------
-- EF-STR-07 : un rattachement deplace tout le sous-arbre.
-- Le garde pg_trigger_depth() evite la recursion : seule la mise a jour
-- de tete propage, en une seule instruction.
-- -----------------------------------------------------------------------------
create or replace function fn_entities_propagate_path() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if new.path is distinct from old.path then
    update entities
       set path   = new.path || subpath(path, nlevel(old.path)),
           niveau = new.niveau + (nlevel(path) - nlevel(old.path))
     where path <@ old.path
       and id <> new.id;
  end if;

  return null;
end $$;

create trigger trg_entities_aiu
  after update of path on entities
  for each row execute function fn_entities_propagate_path();


-- -----------------------------------------------------------------------------
-- EF-STR-08 : une entite ayant des sous-entites vivantes ne peut etre supprimee
-- logiquement ; l'interface propose une desactivation a la place.
-- -----------------------------------------------------------------------------
create or replace function fn_entities_before_soft_delete() returns trigger
language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if exists (
      select 1 from entities
       where parent_id = old.id and deleted_at is null
    ) then
      raise exception
        'EF-STR-08 : "%" possede des sous-entites actives et ne peut etre supprimee', old.nom
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger trg_entities_soft_delete
  before update of deleted_at on entities
  for each row execute function fn_entities_before_soft_delete();


-- -----------------------------------------------------------------------------
-- `updated_at` sur toute modification.
--
-- Trigger distinct de `trg_entities_biu` a dessein : ce dernier est restreint
-- aux colonnes type/parent_id/code, car il RECALCULE `path`. L'elargir ferait
-- entrer en conflit son calcul avec la propagation de sous-arbre.
-- -----------------------------------------------------------------------------
create or replace function fn_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_entities_touch
  before update on entities
  for each row execute function fn_touch_updated_at();

insert into schema_migrations (version) values ('0003')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0004_referentiels.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0004 — Referentiels administrables
-- =============================================================================
-- Reference : plan.md §3.4 — EF-REF-01 a 06, RG-06, RG-23, RG-31
-- Toute suppression est bloquee par `on delete restrict` cote consommateurs ;
-- l'interface propose la desactivation (is_active = false).
-- =============================================================================

create table grades (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  libelle    text not null,
  ordre      smallint not null default 100,
  is_active  boolean  not null default true,
  created_at timestamptz not null default now()
);
comment on table grades is 'Grade ecclesial du croyant (Pasteur, Diacre, Croyant...) — EF-REF-01';

create table nationalites (
  id         uuid primary key default gen_random_uuid(),
  code_iso   char(3) not null unique,
  libelle    text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table nationalites is 'Nationalite du croyant — EF-REF-02';

create table fonctions (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  libelle             text not null,
  categorie           categorie_fonction not null default 'AUTRE',
  -- RG-31 : alimente l'indicateur « membres de finances »
  est_financiere      boolean  not null default false,
  -- Rang dans l'organigramme de bureau (EF-BUR-07)
  ordre_protocolaire  smallint not null default 100,
  niveaux_applicables entity_type[] not null
    default '{SIEGE,REGIONAL,DISTRICT,PAROISSE,EGLISE,CELLULE}',
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);
comment on table fonctions is 'Fonction occupee au sein d''un Bureau — EF-REF-03';
comment on column fonctions.est_financiere is
  'RG-31 : un membre de bureau titulaire d''une fonction financiere est un « membre de finances »';

create table finance_categories (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  libelle    text not null,
  -- RG-13 : le sens du mouvement est porte par la categorie, jamais saisi a la main
  sens       sens_finance not null,
  ordre      smallint not null default 100,
  is_active  boolean  not null default true,
  created_at timestamptz not null default now()
);
comment on table finance_categories is
  'Categorie de mouvement financier, porteuse du sens recette/depense — EF-REF-04, RG-13';

insert into schema_migrations (version) values ('0004')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0005_profiles_permissions.sql
-- #############################################################################

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

insert into schema_migrations (version) values ('0005')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0006_settings_audit.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0006 — Parametres generaux et journal d'audit
-- =============================================================================
-- Reference : plan.md §3.10 — EF-ADM-09, EF-ADM-11, ENF-SEC-08
-- =============================================================================

-- Table a ligne unique : les parametres globaux de l'organisation.
create table organisation_settings (
  id               smallint primary key default 1 check (id = 1),
  nom_organisation text    not null default 'SYNOD',
  logo_key         text,                                   -- cle d'objet relative
  devise           char(3) not null default 'XOF',         -- ARB-7 : devise unique
  fuseau_horaire   text    not null default 'Africa/Porto-Novo',
  format_matricule text    not null default '{CODE}-{ANNEE}-{SEQ}',

  -- ARB-5 : fenetre « nouveaux baptises », 15 jours par defaut (RG-30)
  fenetre_nouveaux_baptises_jours smallint not null default 15
    check (fenetre_nouveaux_baptises_jours between 1 and 365),

  -- ARB-3 : workflow de validation financiere, active/desactive par le SuperAdmin
  finance_validation_active       boolean not null default false,
  separation_saisie_validation    boolean not null default true,   -- EF-FIN-18

  -- ARB-4 : auto-approbation des transferts internes au perimetre (EF-TRF-05)
  transfert_auto_approbation_interne boolean not null default true,

  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table organisation_settings is
  'Parametres globaux — une seule ligne (id = 1). EF-ADM-11';
comment on column organisation_settings.finance_validation_active is
  'ARB-3 : si vrai, tout mouvement suit Brouillon -> Soumis -> Valide (RG-16)';

insert into organisation_settings (id) values (1) on conflict (id) do nothing;

-- Empeche la suppression de la ligne unique de parametrage.
create or replace function fn_settings_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Les parametres de l''organisation ne peuvent pas etre supprimes'
    using errcode = 'check_violation';
end $$;

create trigger trg_settings_no_delete
  before delete on organisation_settings
  for each row execute function fn_settings_no_delete();


-- -----------------------------------------------------------------------------
-- Journal d'audit — insertion seule, immuable (ENF-SEC-08)
-- Conserve 5 ans minimum. Aucune mise a jour ni suppression n'est possible.
-- -----------------------------------------------------------------------------
create table audit_log (
  id         bigserial primary key,
  user_id    uuid references profiles(id) on delete set null,
  action     text not null,
  table_name text not null,
  record_id  uuid,
  entity_id  uuid references entities(id) on delete set null,
  diff       jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),

  constraint audit_action_connue check (action in (
    'CREATE','UPDATE','DELETE','RESTORE','PURGE',
    'TRANSFER','APPROVE','REJECT',
    'SUBMIT','VALIDATE','CANCEL',
    'GRANT','REVOKE',
    'REPORT','EXPORT',
    'LOGIN','LOGOUT','DENIED'
  ))
);

comment on table audit_log is
  'Journal immuable : insertion seule. UPDATE et DELETE sont revoques (ENF-SEC-08)';
comment on column audit_log.action is
  'DENIED trace notamment les tentatives d''elevation de privilege (ENF-SEC-11)';

create index audit_created_idx on audit_log (created_at desc);
create index audit_record_idx  on audit_log (table_name, record_id);
create index audit_action_idx  on audit_log (action, created_at desc);
create index audit_entity_idx  on audit_log (entity_id, created_at desc);

-- Immuabilite garantie au niveau du moteur, pas seulement par les privileges.
create or replace function fn_audit_immuable() returns trigger
language plpgsql as $$
begin
  raise exception 'ENF-SEC-08 : le journal d''audit est immuable (insertion seule)'
    using errcode = 'insufficient_privilege';
end $$;

create trigger trg_audit_immuable
  before update or delete on audit_log
  for each row execute function fn_audit_immuable();

insert into schema_migrations (version) values ('0006')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0007_rls_helpers.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0007 — Fonctions de contexte pour la RLS
-- =============================================================================
-- Reference : plan.md §4.1 — RG-20, RG-25, ENF-SEC-01, ENF-POR-02
--
-- Toutes les fonctions sont STABLE + SECURITY DEFINER : elles doivent lire
-- `profiles` et `user_permissions` sans etre elles-memes soumises a la RLS,
-- faute de quoi les politiques s'auto-referenceraient a l'infini.
--
-- Elles echouent TOUJOURS en fermeture : sans profil actif, current_scope_path()
-- vaut NULL, `path <@ NULL` vaut NULL, et aucune ligne n'est retournee.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ENF-POR-02 : SEUL point de couplage avec le fournisseur d'identite.
-- Aujourd'hui Supabase (auth.uid()) ; ailleurs, un parametre de session
-- standard (app.user_id) pose par la couche applicative.
-- -----------------------------------------------------------------------------
create or replace function app_current_auth_id() returns uuid
language plpgsql stable as $$
begin
  begin
    return auth.uid();
  exception when others then
    return nullif(current_setting('app.user_id', true), '')::uuid;
  end;
end $$;

comment on function app_current_auth_id is
  'ENF-POR-02 : encapsule auth.uid() et retombe sur le parametre de session app.user_id';


create or replace function current_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id
    from profiles
   where auth_user_id = app_current_auth_id()
     and is_active
   limit 1
$$;


-- RG-20 : le perimetre d'un compte est le sous-arbre de son entite de rattachement.
create or replace function current_scope_path() returns ltree
language sql stable security definer set search_path = public as $$
  select e.path
    from profiles p
    join entities e on e.id = p.entity_id
   where p.id = current_profile_id()
     and e.deleted_at is null
   limit 1
$$;


create or replace function is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
     where id = current_profile_id()
       and role = 'SUPERADMIN'
  )
$$;


-- RG-20 : l'entite visee est-elle dans le perimetre du compte ?
create or replace function entity_in_scope(p_entity_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_superadmin()
      or exists (
        select 1 from entities e
         where e.id = p_entity_id
           and e.path <@ current_scope_path()
      )
$$;


-- -----------------------------------------------------------------------------
-- RG-25 : le droit est-il detenu, et sa portee couvre-t-elle l'entite visee ?
--   p_entity_id NULL => on teste la seule DETENTION du droit, sans portee.
-- -----------------------------------------------------------------------------
create or replace function has_perm(p_permission text, p_entity_id uuid default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select is_superadmin()
      or exists (
        select 1
          from user_permissions up
          left join entities se on se.id = up.scope_entity_id
         where up.user_id = current_profile_id()
           and up.permission = p_permission
           and (
                p_entity_id is null            -- detention seule
             or up.scope_entity_id is null     -- portee = tout le perimetre du compte
             or exists (
                  select 1 from entities e
                   where e.id = p_entity_id
                     and e.path <@ se.path     -- portee restreinte : inclusion de chemin
                )
           )
      )
$$;

comment on function has_perm is
  'RG-25 : detention du droit ET couverture de portee. Ne verifie PAS le perimetre : voir can().';


-- Controle complet : droit detenu + portee couvrante + entite dans le perimetre.
create or replace function can(p_permission text, p_entity_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select entity_in_scope(p_entity_id) and has_perm(p_permission, p_entity_id)
$$;

comment on function can is
  'Controle de reference cote base : toujours prefere a has_perm() seul';


-- Identifiant du Siege — utile aux politiques portant sur des ressources globales.
create or replace function siege_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from entities where type = 'SIEGE' and deleted_at is null limit 1
$$;


-- Les fonctions de contexte ne doivent pas etre appelables par un role anonyme.
revoke execute on function current_profile_id, current_scope_path, is_superadmin,
                          entity_in_scope, has_perm, can, siege_id
  from public;
grant execute on function current_profile_id, current_scope_path, is_superadmin,
                          entity_in_scope, has_perm, can, siege_id
  to authenticated;

insert into schema_migrations (version) values ('0007')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0008_rls_policies.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0008 — Politiques RLS du socle
-- =============================================================================
-- Reference : plan.md §4.2 — RG-20, RG-21, RG-25, ENF-SEC-01
--
-- Regle non negociable (plan.md §18.2 n°9) : AUCUNE table metier sans RLS.
-- Un test d'integration enumere pg_tables et echoue si une table y echappe.
-- =============================================================================

alter table entities            enable row level security;
alter table profiles            enable row level security;
alter table user_permissions    enable row level security;
alter table permission_profiles enable row level security;
alter table dashboard_layouts   enable row level security;
alter table dashboard_templates enable row level security;
alter table organisation_settings enable row level security;
alter table audit_log           enable row level security;
alter table grades              enable row level security;
alter table nationalites        enable row level security;
alter table fonctions           enable row level security;
alter table finance_categories  enable row level security;


-- -----------------------------------------------------------------------------
-- ENTITES
-- Lecture : mes descendants (mon perimetre) ET mes ancetres (fil d'Ariane
-- lisible : un district doit pouvoir nommer son regional et le Siege).
-- -----------------------------------------------------------------------------
create policy entities_select on entities for select to authenticated
  using (
       is_superadmin()
    or path <@ current_scope_path()      -- mes descendants
    or current_scope_path() <@ path      -- mes ancetres
  );

create policy entities_insert on entities for insert to authenticated
  with check (
    has_perm('entity.create', parent_id)
    and (
         is_superadmin()
      or exists (
           select 1 from entities p
            where p.id = parent_id
              and p.path <@ current_scope_path()
         )
    )
  );

create policy entities_update on entities for update to authenticated
  using      (can('entity.update', id))
  with check (entity_in_scope(id));

-- entity.delete n'est pas delegable : reserve au Siege (NON_DELEGABLES)
create policy entities_delete on entities for delete to authenticated
  using (is_superadmin());


-- -----------------------------------------------------------------------------
-- PROFILS
-- Chacun lit son propre profil ; les gestionnaires de comptes lisent
-- ceux de leur perimetre.
-- -----------------------------------------------------------------------------
create policy profiles_select on profiles for select to authenticated
  using (
       id = current_profile_id()
    or (has_perm('user.manage') and entity_in_scope(entity_id))
  );

create policy profiles_insert on profiles for insert to authenticated
  with check (can('user.manage', entity_id));

create policy profiles_update on profiles for update to authenticated
  using (
       id = current_profile_id()                        -- son propre profil
    or can('user.manage', entity_id)
  )
  with check (
       id = current_profile_id()
    or can('user.manage', entity_id)
  );

-- Un compte n'est jamais supprime : il est desactive (is_active = false).
create policy profiles_delete on profiles for delete to authenticated
  using (is_superadmin());


-- -----------------------------------------------------------------------------
-- HABILITATIONS
-- Lecture de ses propres droits (EF-AUT-05) ou de ceux du perimetre gere.
-- L'ecriture est encadree par le trigger de delegation (0009), qui applique
-- RG-24. La politique ne fait que le premier filtrage.
-- -----------------------------------------------------------------------------
create policy user_permissions_select on user_permissions for select to authenticated
  using (
       user_id = current_profile_id()
    or has_perm('user.manage')
    or has_perm('permission.delegate')
  );

create policy user_permissions_insert on user_permissions for insert to authenticated
  with check (has_perm('permission.delegate'));

create policy user_permissions_delete on user_permissions for delete to authenticated
  using (has_perm('permission.delegate'));

-- Un octroi ne se modifie pas : il se revoque puis se re-accorde (tracabilite).
create policy user_permissions_update on user_permissions for update to authenticated
  using (false);


-- -----------------------------------------------------------------------------
-- PROFILS D'HABILITATION — EF-ADM-05
-- entity_id NULL = profil global du Siege, lisible par tous.
-- -----------------------------------------------------------------------------
create policy permission_profiles_select on permission_profiles for select to authenticated
  using (entity_id is null or entity_in_scope(entity_id));

-- Parentheses explicites : un profil GLOBAL (entity_id null) est reserve au
-- Siege, un profil LOCAL suit le perimetre. Sans elles, la precedence de `and`
-- sur `or` donnerait un resultat different de l'intention.
create policy permission_profiles_write on permission_profiles for all to authenticated
  using (
    has_perm('permission.delegate')
    and (
         (entity_id is null and is_superadmin())
      or (entity_id is not null and entity_in_scope(entity_id))
    )
  )
  with check (
    has_perm('permission.delegate')
    and (
         (entity_id is null and is_superadmin())
      or (entity_id is not null and entity_in_scope(entity_id))
    )
  );


-- -----------------------------------------------------------------------------
-- TABLEAU DE BORD — strictement personnel
-- -----------------------------------------------------------------------------
create policy dashboard_layouts_own on dashboard_layouts for all to authenticated
  using      (user_id = current_profile_id())
  with check (user_id = current_profile_id());

create policy dashboard_templates_select on dashboard_templates for select to authenticated
  using (true);

create policy dashboard_templates_write on dashboard_templates for all to authenticated
  using (is_superadmin()) with check (is_superadmin());


-- -----------------------------------------------------------------------------
-- PARAMETRES GENERAUX
-- Lisibles par tous (l'application en depend : devise, fenetre baptises...),
-- modifiables par le seul detenteur de settings.manage (non delegable).
-- -----------------------------------------------------------------------------
create policy settings_select on organisation_settings for select to authenticated
  using (true);

create policy settings_update on organisation_settings for update to authenticated
  using (has_perm('settings.manage')) with check (has_perm('settings.manage'));


-- -----------------------------------------------------------------------------
-- AUDIT — lecture filtree par perimetre, insertion libre, jamais de modification
-- -----------------------------------------------------------------------------
create policy audit_select on audit_log for select to authenticated
  using (
    has_perm('audit.read')
    and (entity_id is null or entity_in_scope(entity_id))
  );

create policy audit_insert on audit_log for insert to authenticated
  with check (true);

-- ENF-SEC-08 : double verrou — privileges revoques ET trigger d'immuabilite (0006)
revoke update, delete on audit_log from authenticated;


-- -----------------------------------------------------------------------------
-- REFERENTIELS — lisibles par tout compte authentifie, geres par le Siege
-- (referentiel.manage figure dans NON_DELEGABLES)
-- -----------------------------------------------------------------------------
create policy grades_select on grades for select to authenticated using (true);
create policy grades_write  on grades for all to authenticated
  using (has_perm('referentiel.manage')) with check (has_perm('referentiel.manage'));

create policy nationalites_select on nationalites for select to authenticated using (true);
create policy nationalites_write  on nationalites for all to authenticated
  using (has_perm('referentiel.manage')) with check (has_perm('referentiel.manage'));

create policy fonctions_select on fonctions for select to authenticated using (true);
create policy fonctions_write  on fonctions for all to authenticated
  using (has_perm('referentiel.manage')) with check (has_perm('referentiel.manage'));

create policy finance_categories_select on finance_categories for select to authenticated
  using (true);
create policy finance_categories_write on finance_categories for all to authenticated
  using (has_perm('referentiel.manage')) with check (has_perm('referentiel.manage'));

insert into schema_migrations (version) values ('0008')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0009_delegation.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0009 — Delegation d'habilitations
-- =============================================================================
-- Reference : plan.md §5.3 — ARB-3, RG-24, ENF-SEC-11
--
-- RG-24 : on ne delegue QUE ce que l'on detient, a un compte de SON perimetre,
-- pour une portee INCLUSE dans la sienne. Aucune elevation de privilege.
--
-- Ce controle existe en double : dans lib/domain/permissions.ts (message clair
-- a l'utilisateur) et ici (tient meme en cas d'appel SQL direct).
-- =============================================================================

-- Droits jamais delegables — doit rester aligne sur NON_DELEGABLES
-- dans lib/domain/permissions.ts.
create or replace function fn_permissions_non_delegables() returns text[]
language sql immutable as $$
  select array[
    'entity.delete',
    'referentiel.manage',
    'settings.manage',
    'finance.delegate'
  ]::text[]
$$;


create or replace function fn_check_delegation() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_moi              uuid := current_profile_id();
  v_cible_path       ltree;
  v_portee_detenue   ltree;
  v_portee_accordee  ltree;
begin
  -- Le SuperAdmin accorde sans restriction.
  if is_superadmin() then
    new.granted_by := coalesce(new.granted_by, v_moi);
    return new;
  end if;

  -- Amorcage / migrations hors session applicative : aucun profil courant.
  if v_moi is null then
    return new;
  end if;

  if not has_perm('permission.delegate') then
    raise exception 'RG-24 : vous ne pouvez pas deleguer d''habilitations'
      using errcode = 'insufficient_privilege';
  end if;

  if new.permission = any (fn_permissions_non_delegables()) then
    raise exception 'RG-24 : le droit "%" n''est pas delegable', new.permission
      using errcode = 'insufficient_privilege';
  end if;

  -- Le compte cible doit appartenir au perimetre du delegant.
  select e.path into v_cible_path
    from profiles p
    join entities e on e.id = p.entity_id
   where p.id = new.user_id;

  if v_cible_path is null or not (v_cible_path <@ current_scope_path()) then
    raise exception 'RG-24 : le compte cible est hors de votre perimetre'
      using errcode = 'insufficient_privilege';
  end if;

  -- Le delegant doit detenir le droit. On retient sa portee la PLUS LARGE
  -- (nlevel le plus faible) : c'est la borne superieure de ce qu'il peut accorder.
  select coalesce(se.path, current_scope_path())
    into v_portee_detenue
    from user_permissions up
    left join entities se on se.id = up.scope_entity_id
   where up.user_id = v_moi
     and up.permission = new.permission
   order by nlevel(coalesce(se.path, current_scope_path())) asc
   limit 1;

  if v_portee_detenue is null then
    raise exception
      'RG-24 : vous ne detenez pas le droit "%" et ne pouvez donc pas l''accorder',
      new.permission
      using errcode = 'insufficient_privilege';
  end if;

  -- La portee accordee (ou, a defaut, le perimetre du compte cible)
  -- doit etre incluse dans la portee detenue.
  if new.scope_entity_id is null then
    v_portee_accordee := v_cible_path;
  else
    select path into v_portee_accordee from entities where id = new.scope_entity_id;
    if v_portee_accordee is null then
      raise exception 'RG-24 : portee introuvable' using errcode = 'foreign_key_violation';
    end if;
  end if;

  if not (v_portee_accordee <@ v_portee_detenue) then
    raise exception 'RG-24 : la portee accordee depasse celle de votre habilitation'
      using errcode = 'insufficient_privilege';
  end if;

  new.granted_by := v_moi;
  return new;
end $$;

create trigger trg_check_delegation
  before insert or update on user_permissions
  for each row execute function fn_check_delegation();


-- -----------------------------------------------------------------------------
-- Tracabilite des octrois et revocations — EF-ADM-09.
-- Ecrite en base et non seulement dans les Server Actions, car ces lignes
-- sont le pivot de la securite applicative.
-- -----------------------------------------------------------------------------
create or replace function fn_audit_permissions() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_entity uuid;
begin
  if tg_op = 'INSERT' then
    select entity_id into v_entity from profiles where id = new.user_id;
    insert into audit_log (user_id, action, table_name, record_id, entity_id, diff)
    values (
      current_profile_id(), 'GRANT', 'user_permissions', new.id, v_entity,
      jsonb_build_object(
        'beneficiaire', new.user_id,
        'permission',   new.permission,
        'portee',       new.scope_entity_id,
        'source',       new.source
      )
    );
    return new;
  else
    select entity_id into v_entity from profiles where id = old.user_id;
    insert into audit_log (user_id, action, table_name, record_id, entity_id, diff)
    values (
      current_profile_id(), 'REVOKE', 'user_permissions', old.id, v_entity,
      jsonb_build_object(
        'beneficiaire', old.user_id,
        'permission',   old.permission,
        'portee',       old.scope_entity_id
      )
    );
    return old;
  end if;
end $$;

create trigger trg_audit_permissions
  after insert or delete on user_permissions
  for each row execute function fn_audit_permissions();

insert into schema_migrations (version) values ('0009')
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

-- #############################################################################
-- ## 0012_correctifs_croyants.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0012 — Correctifs sur les croyants
-- =============================================================================
-- 1. Les fonctions de trigger doivent contourner la RLS des tables internes.
-- 2. La date de bapteme devient facultative.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. SECURITY DEFINER sur les fonctions de trigger
--
-- `matricule_sequences` porte une politique `using (false)` : c'est une table
-- de comptage interne, que personne ne doit lire ni ecrire directement. Mais
-- `fn_generer_matricule` y ecrit, et un trigger s'execute par defaut avec les
-- droits de l'APPELANT — donc du role `authenticated`, a qui tout est refuse.
--
-- Resultat : toute creation de croyant echouait sur
-- « new row violates row-level security policy for table matricule_sequences ».
--
-- SECURITY DEFINER fait executer ces fonctions avec les droits du proprietaire.
-- L'autorisation reste portee par la politique RLS de `croyants` : c'est elle
-- qui decide QUI peut inserer, la fonction ne fait qu'attribuer un numero.
-- -----------------------------------------------------------------------------

create or replace function fn_generer_matricule(p_code_eglise text) returns text
language plpgsql security definer set search_path = public as $$
declare v_cle text; v_seq integer;
begin
  v_cle := p_code_eglise || ':' || extract(year from current_date)::text;

  insert into matricule_sequences (cle, dernier)
  values (v_cle, 1)
  on conflict (cle) do update set dernier = matricule_sequences.dernier + 1
  returning dernier into v_seq;

  return format('%s-%s-%s', p_code_eglise, extract(year from current_date),
                lpad(v_seq::text, 4, '0'));
end $$;


-- Meme raison : ce trigger lit `entities`, table soumise a la RLS. Si le
-- filtrage masquait la ligne, la fonction conclurait a tort que l'eglise
-- n'existe pas et leverait « RG-04 » — un message faux.
create or replace function fn_croyants_check() returns trigger
language plpgsql security definer set search_path = public as $$
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


-- Idem : `fn_ancetre_commun` parcourt `entities` pour determiner l'approbateur
-- competent (RG-12). Un filtrage RLS fausserait ce calcul.
create or replace function fn_ancetre_commun(a uuid, b uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select e.id
    from entities e,
         (select path from entities where id = a) pa,
         (select path from entities where id = b) pb
   where pa.path <@ e.path
     and pb.path <@ e.path
     and e.deleted_at is null
   order by nlevel(e.path) desc
   limit 1
$$;


-- -----------------------------------------------------------------------------
-- 2. Date de bapteme facultative
--
-- Une fiche se cree souvent avant que la date de bapteme ne soit connue —
-- reprise d'un registre papier, croyant en cours de preparation. L'exiger
-- bloquait la saisie sur une information qui arrive plus tard.
--
-- Les contraintes CHECK existantes tolerent deja NULL : `NULL >= date` vaut
-- NULL, et un CHECK n'echoue que sur FALSE. Seul le NOT NULL est a lever.
--
-- `baptemes.date_bapteme` reste obligatoire : cette table n'existe que
-- lorsqu'un bapteme est effectivement declare (EF-BAP-01).
-- -----------------------------------------------------------------------------
alter table croyants alter column date_bapteme drop not null;

comment on column croyants.date_bapteme is
  'Facultative : peut etre renseignee apres coup. RG-30 ne compte que les fiches ou elle est presente.';

insert into schema_migrations (version) values ('0012')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0013_codes_et_matricules.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0013 — Codes d'entite automatiques et nouveau format de matricule
-- =============================================================================
-- 1. Le code d'une entite est genere : <PREFIXE>-<SEQUENCE 4 chiffres>.
-- 2. Le matricule devient <INITIALES>-<SEQUENCE 5 chiffres>-<AA>.
--
-- Les valeurs DEJA attribuees ne changent pas : un code et un matricule sont
-- des references stables, imprimees sur des listes et citees ailleurs. Seules
-- les prochaines creations suivent le nouveau format.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Codes d'entite — EF-STR-02, RG-02
-- -----------------------------------------------------------------------------

create table if not exists entity_code_sequences (
  type    entity_type primary key,
  dernier integer not null default 0
);

comment on table entity_code_sequences is
  'Compteur par niveau hierarchique. Interne : jamais lu ni ecrit directement.';

alter table entity_code_sequences enable row level security;
create policy entity_code_sequences_aucun_acces on entity_code_sequences
  for all to authenticated using (false);

/**
 * Prefixe par niveau. Volontairement court et parlant : un code se lit a voix
 * haute et se recopie a la main sur un registre papier.
 */
create or replace function fn_prefixe_entite(p_type entity_type) returns text
language sql immutable strict as $$
  select case p_type
    when 'SIEGE'    then 'SG'
    when 'REGIONAL' then 'REG'
    when 'DISTRICT' then 'DIS'
    when 'PAROISSE' then 'PAR'
    when 'EGLISE'   then 'EGL'
    when 'CELLULE'  then 'CEL'
  end
$$;

-- SECURITY DEFINER : ecrit dans une table fermee a tous par RLS.
create or replace function fn_generer_code_entite(p_type entity_type) returns text
language plpgsql security definer set search_path = public as $$
declare v_seq integer;
begin
  insert into entity_code_sequences (type, dernier)
  values (p_type, 1)
  on conflict (type) do update set dernier = entity_code_sequences.dernier + 1
  returning dernier into v_seq;

  return format('%s-%s', fn_prefixe_entite(p_type), lpad(v_seq::text, 4, '0'));
end $$;

-- Aligne les compteurs sur l'existant : sans cela, la premiere generation
-- repartirait de 0001 et pourrait entrer en collision.
insert into entity_code_sequences (type, dernier)
select e.type, count(*)
  from entities e
 group by e.type
on conflict (type) do update set dernier = greatest(
  entity_code_sequences.dernier,
  excluded.dernier
);


-- -----------------------------------------------------------------------------
-- 2. Initiales et matricule — EF-CRO-02
-- -----------------------------------------------------------------------------

/**
 * Initiales du nom puis des prenoms, dans l'ordre de saisie, trois au plus.
 * Les accents sont replies sur leur lettre de base : un matricule se saisit au
 * clavier, parfois sur un poste sans disposition francaise.
 */
create or replace function fn_initiales(p_nom text, p_prenom text) returns text
language plpgsql immutable as $$
declare
  v_source text;
  v_mot    text;
  v_init   text := '';
begin
  v_source := coalesce(p_nom, '') || ' ' || coalesce(p_prenom, '');
  v_source := translate(
    v_source,
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'
  );

  for v_mot in
    select m
      from unnest(regexp_split_to_array(v_source, '[^A-Za-z]+')) as m
     where m <> ''
  loop
    v_init := v_init || upper(left(v_mot, 1));
    exit when char_length(v_init) >= 3;
  end loop;

  -- Un nom entierement non alphabetique reste possible : on ne laisse jamais
  -- le matricule sans prefixe.
  return coalesce(nullif(v_init, ''), 'XXX');
end $$;

/**
 * <INITIALES>-<SEQUENCE 5 chiffres>-<AA>, ex. MNK-00001-26.
 *
 * La sequence est GLOBALE par annee, non par jeu d'initiales : c'est elle qui
 * porte l'unicite. Deux homonymes obtiennent ainsi des numeros differents,
 * la ou une sequence par initiales les aurait fait entrer en collision.
 */
create or replace function fn_generer_matricule(p_nom text, p_prenom text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_annee text := to_char(current_date, 'YY');
  v_seq   integer;
begin
  insert into matricule_sequences (cle, dernier)
  values ('CROYANT:' || v_annee, 1)
  on conflict (cle) do update set dernier = matricule_sequences.dernier + 1
  returning dernier into v_seq;

  return format('%s-%s-%s', fn_initiales(p_nom, p_prenom), lpad(v_seq::text, 5, '0'), v_annee);
end $$;


-- -----------------------------------------------------------------------------
-- 3. Triggers : generer ce qui n'a pas ete fourni
-- -----------------------------------------------------------------------------

/**
 * `code` reste NOT NULL, mais un trigger BEFORE s'execute AVANT la verification
 * de cette contrainte : l'application peut donc omettre la colonne et laisser
 * la base attribuer le code. C'est ce qui garantit l'unicite face a deux
 * creations simultanees, qu'un compteur cote application ne pourrait pas tenir.
 */
create or replace function fn_entities_before_write() returns trigger
language plpgsql as $$
declare
  v_niveau smallint;
  v_parent entities%rowtype;
begin
  v_niveau := case new.type
    when 'SIEGE'    then 1
    when 'REGIONAL' then 2
    when 'DISTRICT' then 3
    when 'PAROISSE' then 4
    when 'EGLISE'   then 5
    when 'CELLULE'  then 6
  end;

  new.niveau := v_niveau;

  if tg_op = 'INSERT' and (new.code is null or btrim(new.code) = '') then
    new.code := fn_generer_code_entite(new.type);
  else
    new.code := upper(btrim(new.code));
  end if;

  if new.parent_id is null then
    if v_niveau <> 1 then
      raise exception 'RG-01 : une entite de type % doit avoir un parent', new.type
        using errcode = 'check_violation';
    end if;
    new.path := fn_ltree_label(new.id);
  else
    select * into v_parent from entities where id = new.parent_id;
    if not found then
      raise exception 'Entite parente introuvable' using errcode = 'foreign_key_violation';
    end if;

    if v_parent.niveau <> v_niveau - 1 then
      raise exception
        'RG-01 : un(e) % ne peut etre rattache(e) qu''a un(e) %, pas a un(e) %',
        new.type,
        (array['SIEGE','REGIONAL','DISTRICT','PAROISSE','EGLISE'])[v_niveau - 1],
        v_parent.type
        using errcode = 'check_violation';
    end if;

    if tg_op = 'UPDATE' and v_parent.path <@ fn_ltree_label(old.id) then
      raise exception 'RG-01 : rattachement impossible, cycle detecte'
        using errcode = 'check_violation';
    end if;

    new.path := v_parent.path || fn_ltree_label(new.id);
  end if;

  new.updated_at := now();
  return new;
end $$;

-- Le trigger doit desormais reagir aussi a un `code` absent a l'insertion.
drop trigger if exists trg_entities_biu on entities;
create trigger trg_entities_biu
  before insert or update of type, parent_id, code on entities
  for each row execute function fn_entities_before_write();


-- Le matricule se derive du nom, plus du code de l'eglise.
create or replace function fn_croyants_check() returns trigger
language plpgsql security definer set search_path = public as $$
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
    new.matricule := fn_generer_matricule(new.nom, new.prenom);
  else
    new.matricule := old.matricule;   -- RG-29
  end if;

  new.updated_at := now();
  return new;
end $$;

-- L'ancienne signature n'a plus d'appelant : la laisser exposerait deux
-- fonctions de meme nom aux intentions differentes.
drop function if exists fn_generer_matricule(text);

insert into schema_migrations (version) values ('0013')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0014_appliquer_transfert.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0014 — Application effective d'un transfert
-- =============================================================================
-- EF-TRF-03, EF-TRF-06, RG-11, RG-12.
--
-- POURQUOI UNE FONCTION ET NON DEUX APPELS DEPUIS L'APPLICATION
--
-- Appliquer un transfert, c'est deux ecritures indissociables : deplacer le
-- croyant, et marquer le transfert « effectue ». Deux appels HTTP successifs
-- ne forment pas une transaction — une coupure entre les deux laisserait soit
-- un croyant deplace sans trace, soit un transfert clos sans effet. Les deux
-- etats sont faux, et aucun ne se detecte.
--
-- Une seule fonction, donc une seule transaction.
-- =============================================================================

create or replace function fn_appliquer_transfert(p_transfert uuid)
returns transferts
language plpgsql
security definer                    -- ecrit dans `croyants`, verrouille par RLS
set search_path = public
as $$
declare
  t transferts%rowtype;
begin
  -- `for update` : deux approbateurs cliquant en meme temps ne doivent pas
  -- appliquer deux fois le meme transfert.
  select * into t from transferts where id = p_transfert for update;

  if not found then
    raise exception 'Transfert introuvable' using errcode = 'no_data_found';
  end if;

  -- RG-11 — rien ne s'applique sans approbation prealable. La verification est
  -- refaite ICI : `security definer` a mis la RLS de cote, c'est donc le seul
  -- endroit ou la regle tient encore.
  if t.statut <> 'APPROUVE' then
    raise exception 'RG-11 : un transfert ne s''applique qu''une fois approuve (etat actuel : %)', t.statut
      using errcode = 'check_violation';
  end if;

  -- RG-12 — l'approbateur couvre le plus petit ancetre commun des deux
  -- entites, fige a la demande.
  if not can('transfer.approve', t.ancetre_commun_id) then
    raise exception 'RG-12 : votre perimetre ne couvre pas ce transfert'
      using errcode = 'insufficient_privilege';
  end if;

  update croyants
     set eglise_id  = t.to_eglise_id,
         cellule_id = t.to_cellule_id
   where id = t.croyant_id;

  -- EF-TRF-09 — la cloture des mandats de bureau de l'entite d'origine viendra
  -- avec le lot 3 : la table `bureau_membres` n'existe pas encore. Le point
  -- d'insertion est ici, entre le deplacement et la cloture du transfert.

  update transferts
     set statut     = 'EFFECTUE',
         date_effet = current_date
   where id = t.id
  returning * into t;

  return t;
end $$;

comment on function fn_appliquer_transfert(uuid) is
  'Deplace le croyant et clot le transfert, en une transaction — RG-11, RG-12.';

-- L'application passe par cette fonction, jamais par un UPDATE direct :
-- `authenticated` doit pouvoir l'appeler.
grant execute on function fn_appliquer_transfert(uuid) to authenticated;

insert into schema_migrations (version) values ('0014')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0015_celebrants_multiples.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0015 — Plusieurs celebrants par bapteme
-- =============================================================================
-- EF-BAP-03.
--
-- Un bapteme est frequemment celebre a plusieurs — un pasteur assiste d'un
-- diacre, deux pasteurs lors d'une ceremonie collective. La colonne
-- `celebrant_id` n'en portait qu'un : le second etait perdu, sans que rien ne
-- le signale.
--
-- POURQUOI UNE TABLE ET NON UN TABLEAU DE UUID
--
-- `uuid[]` aurait evite une table, mais aurait aussi perdu l'integrite
-- referentielle : rien n'empecherait d'y glisser l'identifiant d'un croyant
-- supprime, ou inexistant. Une table de liaison rend la contrainte a la base,
-- qui est le seul endroit ou elle tienne quoi qu'il arrive.
-- =============================================================================

create table if not exists bapteme_celebrants (
  bapteme_id uuid not null references baptemes(id) on delete cascade,
  -- `cascade` et non `restrict` : c'est la semantique que portait deja
  -- `celebrant_id ... on delete set null`. Purger un croyant de la corbeille
  -- ne doit pas etre bloque par un bapteme qu'il a celebre ; on perd le lien,
  -- pas le bapteme.
  croyant_id uuid not null references croyants(id) on delete cascade,
  primary key (bapteme_id, croyant_id)
);

comment on table bapteme_celebrants is
  'Celebrants d''un bapteme — EF-BAP-03. Plusieurs par ceremonie.';

create index if not exists bapteme_celebrants_croyant_idx
  on bapteme_celebrants (croyant_id);


-- -----------------------------------------------------------------------------
-- Reprise des celebrants deja saisis
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'baptemes'
       and column_name  = 'celebrant_id'
  ) then
    insert into bapteme_celebrants (bapteme_id, croyant_id)
    select id, celebrant_id from baptemes where celebrant_id is not null
    on conflict do nothing;

    -- La colonne part : deux sources de verite pour la meme information
    -- divergent toujours.
    alter table baptemes drop column celebrant_id;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- RLS — un celebrant se voit si son bapteme se voit
-- -----------------------------------------------------------------------------
--
-- La politique ne reecrit AUCUNE regle de perimetre : elle interroge
-- `baptemes`, qui porte deja la sienne (`entity_in_scope`). Recopier la regle
-- ici la ferait diverger le jour ou l'une des deux changerait.

alter table bapteme_celebrants enable row level security;

drop policy if exists bapteme_celebrants_select on bapteme_celebrants;
drop policy if exists bapteme_celebrants_ecriture on bapteme_celebrants;
drop policy if exists bapteme_celebrants_suppression on bapteme_celebrants;

create policy bapteme_celebrants_select on bapteme_celebrants
  for select to authenticated
  using (
    exists (select 1 from baptemes b where b.id = bapteme_celebrants.bapteme_id)
  );

create policy bapteme_celebrants_ecriture on bapteme_celebrants
  for insert to authenticated
  with check (
    exists (
      select 1 from baptemes b
       where b.id = bapteme_celebrants.bapteme_id
         and can('bapteme.create', b.entity_id)
    )
  );

create policy bapteme_celebrants_suppression on bapteme_celebrants
  for delete to authenticated
  using (
    exists (
      select 1 from baptemes b
       where b.id = bapteme_celebrants.bapteme_id
         and can('bapteme.create', b.entity_id)
    )
  );

insert into schema_migrations (version) values ('0015')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0016_bureaux.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0016 — Bureaux et mandats
-- =============================================================================
-- Reference : plan.md §3.6 — EF-BUR-01 a 11
-- Regles : RG-07 (un membre est un croyant), RG-08 (une fonction, un titulaire),
--          RG-09 (le croyant appartient au sous-arbre), RG-10 (mandats),
--          RG-31 (membre de finances)
--
-- REJOUABLE. Chaque instruction supporte d'etre executee deux fois : le fichier
-- incremental est regenere a chaque nouvelle migration, et rien ne garantit
-- qu'il ne recouvre pas ce qui est deja applique. Une migration qui echoue au
-- rejeu bloque toutes les suivantes du meme lot.
-- =============================================================================

create table if not exists bureaux (
  id         uuid primary key default gen_random_uuid(),
  entity_id  uuid not null references entities(id) on delete restrict,
  libelle    text not null,                 -- « Bureau District Avaradrano 2026-2029 »
  date_debut date not null,
  date_fin   date,
  is_active  boolean not null default true,
  deleted_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint bureaux_periode check (date_fin is null or date_fin > date_debut)
);

comment on table bureaux is 'Mandat d''un bureau d''entite — EF-BUR-01, EF-BUR-02';

-- RG-10 — au plus un bureau ACTIF par entite. L'index partiel dit la regle
-- mieux qu'un trigger : elle tient meme si l'application se trompe.
create unique index if not exists bureaux_un_seul_actif on bureaux (entity_id)
  where is_active and deleted_at is null;

create index if not exists bureaux_entity_idx on bureaux (entity_id, date_debut desc);


create table if not exists bureau_membres (
  id          uuid primary key default gen_random_uuid(),
  bureau_id   uuid not null references bureaux(id)   on delete cascade,
  -- RG-07 : un membre de bureau est TOUJOURS un croyant enregistre.
  -- `restrict` : on ne purge pas un croyant qui a exerce une fonction.
  croyant_id  uuid not null references croyants(id)  on delete restrict,
  fonction_id uuid not null references fonctions(id) on delete restrict,
  date_debut  date not null default current_date,
  date_fin    date,
  notes       text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint membres_periode check (date_fin is null or date_fin >= date_debut)
);

comment on table bureau_membres is
  'Mandat individuel au sein d''un bureau — EF-BUR-03, EF-BUR-08';

-- RG-08 — une fonction n'a qu'UN titulaire en cours. Les mandats clos
-- (`date_fin` renseignee) restent : c'est l'historique (EF-BUR-08).
create unique index if not exists membres_fonction_unique on bureau_membres (bureau_id, fonction_id)
  where date_fin is null;

-- Un croyant n'occupe pas deux fonctions dans le MEME bureau : il peut en
-- occuper dans deux bureaux distincts — tresorier de sa cellule et secretaire
-- de sa paroisse — ce que rien n'interdit ici.
create unique index if not exists membres_croyant_unique on bureau_membres (bureau_id, croyant_id)
  where date_fin is null;

create index if not exists membres_croyant_idx on bureau_membres (croyant_id);   -- EF-BUR-10


-- -----------------------------------------------------------------------------
-- RG-09 — le croyant appartient au sous-arbre de l'entite
-- -----------------------------------------------------------------------------

/**
 * SECURITY DEFINER : le trigger lit `entities` et `croyants`, toutes deux
 * verrouillees par RLS, et s'executerait sinon avec les droits de l'appelant —
 * qui peut legitimement ne pas voir l'entite d'origine d'un croyant.
 */
create or replace function fn_membre_dans_perimetre() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_path_entite  ltree;
  v_type         entity_type;
  v_path_croyant ltree;
  v_fonction     fonctions%rowtype;
  v_nom          text;
begin
  select e.path, e.type into v_path_entite, v_type
    from bureaux b
    join entities e on e.id = b.entity_id
   where b.id = new.bureau_id;

  if not found then
    raise exception 'Bureau introuvable' using errcode = 'foreign_key_violation';
  end if;

  select e.path, c.nom into v_path_croyant, v_nom
    from croyants c
    join entities e on e.id = c.eglise_id
   where c.id = new.croyant_id
     and c.deleted_at is null;

  if not found then
    raise exception 'RG-07 : le membre doit etre un croyant enregistre'
      using errcode = 'check_violation';
  end if;

  -- RG-09 — le bureau d'un district ne se compose que de croyants de ce
  -- district. Sans cette borne, une entite pourrait nommer n'importe qui.
  if not (v_path_croyant <@ v_path_entite) then
    raise exception 'RG-09 : « % » n''appartient pas au perimetre de cette entite', v_nom
      using errcode = 'check_violation';
  end if;

  select * into v_fonction from fonctions where id = new.fonction_id;
  if not found then
    raise exception 'Fonction introuvable' using errcode = 'foreign_key_violation';
  end if;

  -- EF-REF-03 — une fonction declare les niveaux ou elle a un sens : un
  -- « Directeur des finances » n'existe pas dans une cellule de priere.
  if not (v_type = any(v_fonction.niveaux_applicables)) then
    raise exception 'La fonction « % » ne s''applique pas au niveau %',
      v_fonction.libelle, v_type
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_membre_perimetre on bureau_membres;
create trigger trg_membre_perimetre
  before insert or update of bureau_id, croyant_id, fonction_id on bureau_membres
  for each row execute function fn_membre_dans_perimetre();


-- -----------------------------------------------------------------------------
-- EF-TRF-09 — un transfert effectif clot les mandats de l'entite d'origine
-- -----------------------------------------------------------------------------

/**
 * Le point d'insertion avait ete laisse en commentaire dans la migration 0014,
 * `bureau_membres` n'existant pas encore. La fonction est reecrite ici, entiere,
 * plutot que corrigee par un patch : deux versions d'une meme fonction dans
 * deux migrations rendent illisible ce qui s'execute reellement.
 */
create or replace function fn_appliquer_transfert(p_transfert uuid)
returns transferts
language plpgsql
security definer
set search_path = public
as $$
declare
  t transferts%rowtype;
  v_clos integer := 0;
begin
  select * into t from transferts where id = p_transfert for update;

  if not found then
    raise exception 'Transfert introuvable' using errcode = 'no_data_found';
  end if;

  if t.statut <> 'APPROUVE' then
    raise exception 'RG-11 : un transfert ne s''applique qu''une fois approuve (etat actuel : %)', t.statut
      using errcode = 'check_violation';
  end if;

  if not can('transfer.approve', t.ancetre_commun_id) then
    raise exception 'RG-12 : votre perimetre ne couvre pas ce transfert'
      using errcode = 'insufficient_privilege';
  end if;

  update croyants
     set eglise_id  = t.to_eglise_id,
         cellule_id = t.to_cellule_id
   where id = t.croyant_id;

  /**
   * EF-TRF-09 — les mandats detenus dans le sous-arbre d'ORIGINE se cloturent.
   *
   * Le critere porte sur le CHEMIN, pas sur l'eglise : un croyant transfere
   * peut sieger au bureau de sa paroisse ou de son district, et ces mandats
   * cessent aussi. On ne clot en revanche QUE ceux que la destination ne
   * couvre pas — un transfert entre deux eglises d'une meme paroisse ne
   * demet personne du bureau de cette paroisse.
   */
  with origine as (
    select path from entities where id = t.from_eglise_id
  ),
  destination as (
    select path from entities where id = t.to_eglise_id
  )
  update bureau_membres m
     set date_fin = current_date
    from bureaux b, entities e, origine o, destination d
   where m.bureau_id = b.id
     and b.entity_id = e.id
     and m.croyant_id = t.croyant_id
     and m.date_fin is null
     and o.path <@ e.path          -- le bureau couvre l'origine
     and not (d.path <@ e.path);   -- mais pas la destination

  get diagnostics v_clos = row_count;

  update transferts
     set statut     = 'EFFECTUE',
         date_effet = current_date
   where id = t.id
  returning * into t;

  if v_clos > 0 then
    raise notice 'EF-TRF-09 : % mandat(s) clos a l''origine', v_clos;
  end if;

  return t;
end $$;

comment on function fn_appliquer_transfert(uuid) is
  'Deplace le croyant, clot ses mandats d''origine et clot le transfert — RG-11, RG-12, EF-TRF-09.';


-- -----------------------------------------------------------------------------
-- RLS — le bureau se lit dans son perimetre, se gere avec le droit dedie
-- -----------------------------------------------------------------------------

alter table bureaux        enable row level security;
alter table bureau_membres enable row level security;

drop policy if exists bureaux_select on bureaux;
create policy bureaux_select on bureaux for select to authenticated
  using (entity_in_scope(entity_id));

drop policy if exists bureaux_insert on bureaux;
create policy bureaux_insert on bureaux for insert to authenticated
  with check (can('bureau.manage', entity_id));

drop policy if exists bureaux_update on bureaux;
create policy bureaux_update on bureaux for update to authenticated
  using (can('bureau.manage', entity_id))
  with check (entity_in_scope(entity_id));

drop policy if exists bureaux_delete on bureaux;
create policy bureaux_delete on bureaux for delete to authenticated
  using (is_superadmin());

-- Un membre se voit, et se gere, exactement comme son bureau. La politique
-- interroge `bureaux` plutot que de recopier sa regle de perimetre : deux
-- ecritures d'une meme regle finissent toujours par diverger.
drop policy if exists membres_select on bureau_membres;
create policy membres_select on bureau_membres for select to authenticated
  using (
    exists (select 1 from bureaux b where b.id = bureau_membres.bureau_id)
  );

drop policy if exists membres_insert on bureau_membres;
create policy membres_insert on bureau_membres for insert to authenticated
  with check (
    exists (
      select 1 from bureaux b
       where b.id = bureau_membres.bureau_id
         and can('bureau.manage', b.entity_id)
    )
  );

drop policy if exists membres_update on bureau_membres;
create policy membres_update on bureau_membres for update to authenticated
  using (
    exists (
      select 1 from bureaux b
       where b.id = bureau_membres.bureau_id
         and can('bureau.manage', b.entity_id)
    )
  );

drop policy if exists membres_delete on bureau_membres;
create policy membres_delete on bureau_membres for delete to authenticated
  using (
    exists (
      select 1 from bureaux b
       where b.id = bureau_membres.bureau_id
         and can('bureau.manage', b.entity_id)
    )
  );

insert into schema_migrations (version) values ('0016')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0017_bureaux_multiples.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0017 — Une entite peut avoir PLUSIEURS bureaux
-- =============================================================================
-- Correction de RG-10 — arbitrage du 7 aout 2026.
--
-- CE QUI ETAIT FAUX
--
-- La migration 0016 posait « au plus un bureau actif par entite ». C'est trop
-- strict : une meme entite fait coexister un « Bureau executif », un « Comite
-- des finances », une « Commission des jeunes ». L'index unique sur
-- `entity_id` seul refusait le second.
--
-- CE QUI EST VRAI
--
-- Une entite a au plus un mandat actif PAR BUREAU. Deux « Bureau executif »
-- ouverts en meme temps pour la meme entite restent une erreur — c'est ce que
-- la regle voulait dire.
--
-- `bureaux.libelle` devient donc le NOM DU BUREAU (« Bureau executif ») et non
-- celui du mandat : la periode se lit deja dans `date_debut` et `date_fin`.
-- L'affichage compose les deux (`libelleAffichage`), la base ne stocke pas ce
-- qu'elle sait deriver.
-- =============================================================================

drop index if exists bureaux_un_seul_actif;

/**
 * Comparaison sur le libelle NORMALISE : « Bureau Executif » et
 * « bureau executif  » designent le meme organe. Sans cette normalisation, la
 * contrainte se contournerait d'une majuscule.
 *
 * Les accents ne sont pas replies : `unaccent` n'est pas garantie presente, et
 * l'ecart « Comite » / « Comité » reste visible a l'oeil dans la liste — la
 * contrainte protege de l'erreur, elle ne corrige pas la saisie.
 */
create unique index if not exists bureaux_un_actif_par_nom
  on bureaux (entity_id, lower(btrim(libelle)))
  where is_active and deleted_at is null;

comment on column bureaux.libelle is
  'NOM du bureau (« Bureau executif »), pas du mandat : la periode se lit dans les dates.';

comment on table bureaux is
  'Bureau d''une entite et son mandat courant — EF-BUR-01, EF-BUR-02. '
  'Une entite peut en avoir plusieurs, de noms differents (RG-10).';

/**
 * RG-09 reste INCHANGEE — arbitrage du 7 aout 2026.
 *
 * Un croyant siege dans le bureau de toute entite qui CONTIENT son eglise :
 * son eglise, sa paroisse, son district, son regional, le Siege. Il peut donc
 * cumuler plusieurs mandats, dans une meme entite comme dans plusieurs, tant
 * qu'elles sont sur sa chaine d'ancetres.
 *
 * La variante examinee — sieger au regional ouvrirait ses sous-entites — a ete
 * ecartee : l'eligibilite dependrait alors des mandats deja detenus, et
 * changerait a la cloture de l'un d'eux.
 *
 * EF-TRF-09 est confirme dans la foulee : un transfert DEMET des mandats de
 * l'origine et n'en accorde AUCUN a la destination, qui designe si elle le
 * souhaite. Le comportement de la migration 0016 est donc conserve tel quel.
 */

insert into schema_migrations (version) values ('0017')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0018_reparer_chemins.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0018 — Le chemin materialise se recalcule depuis parent_id
-- =============================================================================
-- EF-STR-07, DA-2. Corrige un defaut de propagation constate le 8 aout 2026.
--
-- LE SYMPTOME
--
-- Une eglise (ANTSAHATSIRESY) apparaissait sous le district AVARADRANO dans
-- l'organigramme — qui se construit sur `parent_id` — mais son `path` designait
-- un autre district. Consequence : ses croyants n'etaient pas proposes pour le
-- bureau du district, et surtout `entity_in_scope` les excluait du perimetre.
-- Un chemin faux ne produit pas un affichage bizarre : il produit des DROITS
-- faux, silencieusement.
--
-- LA CAUSE
--
-- `path` est un CACHE derive de `parent_id`. L'ancienne propagation
-- rafraichissait ce cache a partir de lui-meme :
--
--     update entities set path = new.path || subpath(path, nlevel(old.path))
--      where path <@ old.path
--
-- Le `where` s'appuie sur le chemin STOCKE. Un descendant dont le chemin etait
-- deja errone ne correspondait plus au filtre, donc n'etait pas corrige — et
-- restait errone pour toujours. Une routine de rafraichissement de cache ne
-- doit jamais supposer le cache deja juste.
--
-- LA CORRECTION
--
-- Le recalcul repart de `parent_id`, seule colonne qui fasse autorite. Il est
-- integral plutot qu'incrementiel : l'arbre est borne a quelques milliers
-- d'entites (ENF-PRF-05) et un rattachement est rare. Le cout est negligeable,
-- et la fonction devient AUTO-REPARATRICE — elle corrige aussi ce qui etait
-- casse avant elle.
-- =============================================================================

create or replace function fn_recalculer_chemins() returns integer
language plpgsql as $$
declare v_corriges integer;
begin
  with recursive arbre as (
    -- RG-03 : le Siege est la racine unique, sans parent.
    select e.id,
           fn_ltree_label(e.id)::ltree as chemin,
           1::smallint                 as profondeur
      from entities e
     where e.parent_id is null

    union all

    select f.id,
           a.chemin || fn_ltree_label(f.id),
           (a.profondeur + 1)::smallint
      from entities f
      join arbre a on f.parent_id = a.id
  )
  update entities e
     set path   = a.chemin,
         niveau = a.profondeur
    from arbre a
   where e.id = a.id
     -- Seules les lignes REELLEMENT fausses sont ecrites : sans ce filtre,
     -- chaque appel declencherait la propagation sur tout l'arbre.
     and (e.path is distinct from a.chemin or e.niveau is distinct from a.profondeur);

  get diagnostics v_corriges = row_count;
  return v_corriges;
end $$;

comment on function fn_recalculer_chemins() is
  'Recalcule path et niveau depuis parent_id, la seule colonne faisant autorite. '
  'Retourne le nombre de lignes corrigees. Idempotente : 0 si tout est coherent.';


-- -----------------------------------------------------------------------------
-- La propagation delegue desormais au recalcul integral
-- -----------------------------------------------------------------------------

create or replace function fn_entities_propagate_path() returns trigger
language plpgsql as $$
begin
  -- Le recalcul reecrit des chemins, ce qui redeclenche ce trigger : le garde
  -- de profondeur assure qu'une seule passe s'execute.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if new.path is distinct from old.path then
    perform fn_recalculer_chemins();
  end if;

  return null;
end $$;

drop trigger if exists trg_entities_aiu on entities;
create trigger trg_entities_aiu
  after update of path on entities
  for each row execute function fn_entities_propagate_path();


-- -----------------------------------------------------------------------------
-- Reparation de l'existant
-- -----------------------------------------------------------------------------

do $$
declare v_corriges integer;
begin
  v_corriges := fn_recalculer_chemins();

  if v_corriges > 0 then
    raise notice 'Chemins reconstruits : % entite(s) corrigee(s).', v_corriges;
  else
    raise notice 'Chemins deja coherents : aucune correction.';
  end if;
end $$;

insert into schema_migrations (version) values ('0018')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0019_bureau_suppression.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0019 — Suppression d'un bureau, sous droit dedie
-- =============================================================================
-- EF-BUR-08, EF-ADM-13.
--
-- Jusqu'ici seul le SuperAdmin pouvait supprimer un bureau. Le droit devient
-- ATTRIBUABLE — ce que EF-ADM-13 demande de tout ce qui est parametrable —
-- mais reste DISTINCT de `bureau.manage`.
--
-- POURQUOI DEUX DROITS ET NON UN
--
-- Clore un mandat le CONSERVE : c'est l'histoire du bureau, et elle se lit sur
-- la fiche de chaque ancien titulaire. Supprimer l'EFFACE — les mandats
-- individuels partent en cascade, et les fonctions occupees disparaissent des
-- frises des croyants concernes. Une operation qui reecrit le passe ne
-- s'accorde pas avec celle qui gere le present ; les confondre reviendrait a
-- offrir la premiere a quiconque peut faire la seconde.
--
-- `bureau.delete` est par ailleurs NON DELEGABLE (voir `lib/domain/permissions`) :
-- effacer de l'historique se decide au Siege, pas en cascade.
-- =============================================================================

drop policy if exists bureaux_delete on bureaux;

create policy bureaux_delete on bureaux
  for delete to authenticated
  using (can('bureau.delete', entity_id));

-- `bureau_membres` suit son bureau par `on delete cascade` : la politique de
-- suppression des membres reste celle de `bureau.manage`, qui sert au retrait
-- individuel. C'est la contrainte de cle etrangere qui emporte les lignes lors
-- d'une suppression de bureau, pas cette politique.

insert into schema_migrations (version) values ('0019')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0020_cloture_bureau.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0020 — Clore un bureau le jour meme, et le clore d'un seul tenant
-- =============================================================================
-- EF-BUR-02, EF-BUR-08. Corrige un defaut constate le 8 aout 2026.
--
-- LE SYMPTOME
--
-- Un bureau ouvert le matin, clos l'apres-midi : « L'operation n'a pas pu
-- aboutir ». La contrainte exigeait `date_fin > date_debut`, donc INTERDISAIT
-- de cloturer le jour de l'ouverture — precisement le cas d'une ouverture faite
-- par erreur, celui ou l'on veut revenir en arriere tout de suite.
--
-- La contrainte soeur sur les mandats individuels disait deja `>=`. Deux
-- regles pour la meme idee, ecrites a deux endroits : elles avaient diverge.
--
-- CE QUI EST VRAI
--
-- Un mandat ne se clot pas AVANT d'avoir commence. Il peut se clore le jour
-- meme : sa duree est alors d'un jour, ce qui se lit et se comprend.
-- =============================================================================

alter table bureaux drop constraint if exists bureaux_periode;

alter table bureaux add constraint bureaux_periode
  check (date_fin is null or date_fin >= date_debut);

comment on constraint bureaux_periode on bureaux is
  'Un mandat ne se clot pas avant d''avoir commence. Le jour meme est permis : '
  'une ouverture par erreur se corrige le jour meme (EF-BUR-02).';


-- -----------------------------------------------------------------------------
-- La cloture d'un bureau est UNE operation, sur DEUX tables
-- -----------------------------------------------------------------------------

/**
 * Clore un bureau, c'est clore son mandat ET ceux de ses titulaires. L'action
 * le faisait en deux appels HTTP, qui ne forment pas une transaction : un echec
 * entre les deux laissait un bureau clos peuple de mandats en cours — un etat
 * que rien n'affiche et que rien ne rattrape (regle 20).
 *
 * `greatest` n'est pas une precaution decorative. Deux cas le rendent
 * necessaire, et tous deux se produisent :
 *
 *   · un renouvellement clot le mandat precedent LA VEILLE de la nouvelle date
 *     de debut ; si le precedent a ete ouvert le jour meme, cette veille est
 *     anterieure a son ouverture ;
 *   · un titulaire designe apres la date de cloture choisie verrait son mandat
 *     finir avant d'avoir commence.
 *
 * Dans les deux cas la contrainte de periode refuserait l'ecriture, et
 * l'utilisateur lirait un nom d'index a la place d'une explication.
 *
 * SECURITY INVOKER (le defaut) : la RLS doit s'appliquer. La fonction sert
 * l'atomicite et l'arithmetique des dates, pas le contournement des droits.
 */
create or replace function fn_clore_bureau(p_bureau uuid, p_date date default current_date)
returns integer
language plpgsql
as $$
declare
  v_debut date;
  v_jour  date;
  v_clos  integer;
begin
  select date_debut into v_debut
    from bureaux
   where id = p_bureau
     and deleted_at is null
   for update;

  if not found then
    raise exception 'Ce bureau est introuvable ou hors de votre perimetre.'
      using errcode = 'no_data_found';
  end if;

  v_jour := greatest(p_date, v_debut);

  update bureaux
     set is_active = false,
         date_fin  = v_jour
   where id = p_bureau;

  -- La ligne est LISIBLE (politique de select) sans etre MODIFIABLE (politique
  -- d'update) : sans ce controle, la cloture ne ferait rien en silence.
  if not found then
    raise exception 'Vous n''avez pas l''autorisation de clore ce bureau.'
      using errcode = 'insufficient_privilege';
  end if;

  update bureau_membres
     set date_fin = greatest(v_jour, date_debut)
   where bureau_id = p_bureau
     and date_fin is null;

  get diagnostics v_clos = row_count;
  return v_clos;
end $$;

comment on function fn_clore_bureau(uuid, date) is
  'Clot un bureau et les mandats individuels en cours, d''un seul tenant. '
  'Retourne le nombre de mandats clos — EF-BUR-02, EF-BUR-08.';

insert into schema_migrations (version) values ('0020')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0021_organigramme_bureau.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0021 — L'organigramme d'un bureau se DESSINE
-- =============================================================================
-- EF-BUR-07. Arbitrage du 9 aout 2026.
--
-- CE QUI MANQUAIT
--
-- L'organigramme se deduisait du rang protocolaire : une suite de bandes
-- horizontales, la meme pour tous les bureaux. C'est une PRESEANCE, et elle ne
-- dit rien de la facon dont une entite s'organise reellement — quel adjoint
-- depend de quel responsable, quelle commission releve de quel poste.
--
-- Le rang reste ce qu'il est : l'ordre du referentiel, valable partout. Ce que
-- cette table ajoute, c'est la DISPOSITION propre a un bureau.
--
-- POURQUOI PAR BUREAU, ET NON SUR LA FONCTION
--
-- Porter le parent sur `fonctions` imposerait le meme organigramme a toutes les
-- entites de tous les niveaux. Or un district et une cellule n'ont ni les memes
-- fonctions ni les memes usages. La disposition appartient donc au bureau.
--
-- CE QUE CETTE TABLE NE DECIDE PAS
--
-- Elle ne dit pas QUELLES fonctions composent le bureau : cela reste
-- `fonctions.niveaux_applicables` (EF-REF-03). Une fonction applicable qui
-- n'aurait pas de ligne ici reste un poste du bureau, place par defaut a son
-- rang. Sans cela, oublier de poser un bloc ferait disparaitre un poste de
-- tresorier — et le bureau paraitrait complet.
-- =============================================================================

create table if not exists bureau_postes (
  id                 uuid primary key default gen_random_uuid(),
  bureau_id          uuid not null references bureaux(id)   on delete cascade,
  fonction_id        uuid not null references fonctions(id) on delete cascade,
  -- Le superieur DANS CE BUREAU. `null` : le poste est une racine.
  parent_fonction_id uuid references fonctions(id) on delete set null,
  -- Position libre sur le plan (EF-BUR-07) : l'utilisateur dispose comme il
  -- l'entend, la base ne recalcule rien.
  pos_x              double precision not null default 0,
  pos_y              double precision not null default 0,
  updated_by         uuid references profiles(id) on delete set null,
  updated_at         timestamptz not null default now(),

  constraint postes_parent_distinct check (parent_fonction_id is distinct from fonction_id)
);

comment on table bureau_postes is
  'Disposition de l''organigramme d''un bureau — EF-BUR-07. '
  'N''enumere pas les postes : elle place ceux que le referentiel declare.';

create unique index if not exists postes_bureau_fonction
  on bureau_postes (bureau_id, fonction_id);

create index if not exists postes_bureau_idx on bureau_postes (bureau_id);


-- -----------------------------------------------------------------------------
-- Un organigramme est un ARBRE : ni boucle, ni branche detachee
-- -----------------------------------------------------------------------------

/**
 * SECURITY DEFINER : le trigger remonte la chaine des parents dans
 * `bureau_postes`, verrouillee par RLS. Un trigger s'execute avec les droits de
 * l'appelant (regle 13) ; sans cela, la remontee s'arreterait sur la premiere
 * ligne invisible et laisserait passer le cycle qu'elle devait interdire.
 *
 * Le domaine refuse deja le geste a l'ecran, avec sa raison. Ici, c'est le
 * filet : un appel direct a l'API ne doit pas pouvoir rendre un organigramme
 * infiniment profond, que plus aucun affichage ne saurait dessiner.
 */
create or replace function fn_poste_sans_cycle() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_courant    uuid;
  v_suivant    uuid;
  v_profondeur integer := 0;
begin
  if new.parent_fonction_id is null then
    return new;
  end if;

  v_courant := new.parent_fonction_id;

  while v_courant is not null loop
    if v_courant = new.fonction_id then
      raise exception 'Ce rattachement creerait une boucle dans l''organigramme.'
        using errcode = 'check_violation';
    end if;

    v_profondeur := v_profondeur + 1;
    if v_profondeur > 64 then
      raise exception 'Cet organigramme est trop profond pour etre represente.'
        using errcode = 'check_violation';
    end if;

    select p.parent_fonction_id into v_suivant
      from bureau_postes p
     where p.bureau_id = new.bureau_id
       and p.fonction_id = v_courant;

    -- Sans ce test, une fonction sans ligne laisserait `v_suivant` inchange et
    -- la boucle tournerait indefiniment sur la meme valeur.
    if not found then
      v_courant := null;
    else
      v_courant := v_suivant;
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists trg_poste_sans_cycle on bureau_postes;
create trigger trg_poste_sans_cycle
  before insert or update of parent_fonction_id on bureau_postes
  for each row execute function fn_poste_sans_cycle();


-- -----------------------------------------------------------------------------
-- RLS — la disposition se lit comme son bureau, se modifie comme sa composition
-- -----------------------------------------------------------------------------

alter table bureau_postes enable row level security;

-- Les politiques interrogent `bureaux` plutot que de recopier sa regle de
-- perimetre : deux ecritures d'une meme regle finissent toujours par diverger.

drop policy if exists postes_select on bureau_postes;
create policy postes_select on bureau_postes for select to authenticated
  using (exists (select 1 from bureaux b where b.id = bureau_postes.bureau_id));

drop policy if exists postes_insert on bureau_postes;
create policy postes_insert on bureau_postes for insert to authenticated
  with check (
    exists (
      select 1 from bureaux b
       where b.id = bureau_postes.bureau_id
         and can('bureau.manage', b.entity_id)
    )
  );

drop policy if exists postes_update on bureau_postes;
create policy postes_update on bureau_postes for update to authenticated
  using (
    exists (
      select 1 from bureaux b
       where b.id = bureau_postes.bureau_id
         and can('bureau.manage', b.entity_id)
    )
  );

drop policy if exists postes_delete on bureau_postes;
create policy postes_delete on bureau_postes for delete to authenticated
  using (
    exists (
      select 1 from bureaux b
       where b.id = bureau_postes.bureau_id
         and can('bureau.manage', b.entity_id)
    )
  );

insert into schema_migrations (version) values ('0021')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0022_sans_ordre_protocolaire.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0022 — L'ordre protocolaire disparait
-- =============================================================================
-- EF-BUR-07, EF-REF-03. Arbitrage du 9 aout 2026.
--
-- POURQUOI IL EXISTAIT
--
-- Il servait a DEDUIRE l'organigramme d'un bureau : le rang 10 en racine, le
-- rang 20 en dessous, et ainsi de suite. C'etait la seule facon de dessiner un
-- organigramme que personne n'avait dessine.
--
-- POURQUOI IL DISPARAIT
--
-- Depuis la migration 0021, l'organigramme se DESSINE : on pose les blocs, on
-- tire les traits. Le rang ne decidait donc plus de rien — il restait une
-- colonne a saisir, a maintenir et a expliquer, pour un usage qui n'existait
-- plus. Un champ qui ne decide de rien devient un piege : quelqu'un finit par
-- croire qu'il compte encore.
--
-- CE QUI LE REMPLACE
--
-- L'ordre ALPHABETIQUE, partout ou une liste de fonctions s'affiche. Il ne
-- pretend rien dire de la preseance — c'est justement ce qu'on voulait : la
-- hierarchie reelle vit dans `bureau_postes`, propre a chaque bureau, et nulle
-- part ailleurs.
--
-- CE QUE CELA CONTREDIT, ET QUI L'A TRANCHE
--
-- EF-BUR-07 disait « ordonne par rang protocolaire » : l'exigence a ete
-- corrigee dans `cdg.md` a la meme date, sur decision de l'utilisateur.
-- =============================================================================

alter table fonctions drop column if exists ordre_protocolaire;

comment on table fonctions is
  'Role occupe au sein d''un bureau — EF-REF-03. '
  'La hierarchie ne vit pas ici : elle est propre a chaque bureau (bureau_postes).';

insert into schema_migrations (version) values ('0022')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0023_finances.sql
-- #############################################################################

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

insert into schema_migrations (version) values ('0023')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0024_devise_mga.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0024 — La devise est l'ariary malgache
-- =============================================================================
-- Reference : ARB-7 — devise unique pour toute l'organisation
--
-- `XOF` (franc CFA) etait une valeur de depart heritee du gabarit. L'eglise est
-- malgache : la devise est l'ARIARY (MGA). Une devise fausse ne se voit pas
-- comme une erreur — elle se lit comme un montant, et « 150 000 F CFA » a la
-- place de « 150 000 Ar » passe inapercu jusqu'a la premiere consolidation.
--
-- REJOUABLE (regle 23) : `alter column ... set default` et un `update` borne
-- par la valeur qu'il remplace.
-- =============================================================================

alter table organisation_settings
  alter column devise set default 'MGA';

-- On ne recrit QUE ce qui porte encore la valeur du gabarit : si quelqu'un a
-- deja choisi une autre devise, ce n'est pas a une migration de la defaire.
update organisation_settings
   set devise = 'MGA'
 where id = 1
   and devise = 'XOF';

comment on column organisation_settings.devise is
  'ARB-7 : devise unique de l''organisation. MGA (ariary malgache) par defaut.';

insert into schema_migrations (version) values ('0024')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0025_droits_non_delegables.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0025 — Droits non delegables : realigner le SQL sur le domaine
-- =============================================================================
-- Reference : RG-24 — un compte n'accorde qu'un droit qu'il detient lui-meme,
--             et jamais un droit reserve au Siege.
--
-- DEUX CORRECTIONS, dont une DIVERGENCE.
--
-- 1. `bureau.delete` manquait. `lib/domain/permissions.ts` le declare non
--    delegable depuis le lot 3, un test le verrouille, et l'interface le refuse
--    — mais `fn_permissions_non_delegables()` l'ignorait. L'ecran disait donc
--    non pendant que la base disait oui : un appel direct a l'API PostgREST
--    aurait delegue le droit d'effacer l'histoire d'un bureau, avec les
--    fonctions occupees qui disparaissent des fiches des croyants (EF-BUR-08).
--
--    Le commentaire du domaine affirmait l'alignement des deux listes ; rien ne
--    le verifiait. C'est le defaut le plus courant d'une regle ecrite a deux
--    endroits : elle ne diverge jamais le jour ou on l'ecrit.
--
-- 2. `finance.validate_own` entre dans la liste (EF-FIN-18). Se dispenser de la
--    separation saisie/validation ne se delegue pas : un compte qui le detient
--    pourrait sinon l'accorder a celui qu'il controle, et la separation ne
--    tiendrait plus qu'a la bonne volonte de celui-la meme qu'elle surveille.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

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
    'finance.validate_own'
  ]::text[]
$$;

comment on function fn_permissions_non_delegables is
  'RG-24 : droits reserves au Siege, jamais delegables. DOIT rester aligne sur '
  'NON_DELEGABLES dans lib/domain/permissions.ts — verrouille par '
  'tests/unit/permissions.test.ts.';

insert into schema_migrations (version) values ('0025')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0026_soldes_perimetre.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0026 — Soldes de tout le perimetre, en une requete
-- =============================================================================
-- Reference : EF-FIN-11 — le solde de CHAQUE entite, visible du Siege, en
--             consolide comme en detail, avec classement et detection des
--             soldes negatifs (EF-FIN-13).
--
-- POURQUOI UNE FONCTION DE PLUS
--
-- `fn_finance_solde` repond pour UNE entite. La vue consolidee en demande
-- autant qu'il y a d'entites : cinquante eglises, cinquante appels, cinquante
-- allers-retours a 0,5–4 s piece — plusieurs minutes pour un tableau (regle 28).
-- Celle-ci les calcule TOUS en une passe.
--
-- SECURITY INVOKER (le defaut), et c'est essentiel : la RLS de
-- `finance_entries` et d'`entities` s'applique donc a l'appelant. Un
-- gestionnaire de district n'obtient que son district — l'ecran n'a aucun
-- filtrage a refaire, et ne peut pas se tromper en le faisant.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

create or replace function fn_finance_soldes_perimetre(
  p_debut date default null,
  p_fin   date default null
)
returns table (
  entity_id            uuid,
  recettes_propres     numeric,
  depenses_propres     numeric,
  recettes_consolidees numeric,
  depenses_consolidees numeric
)
language sql
stable
as $$
  with lignes as (
    -- RG-18 : seul le VALIDE alimente un solde. Le brouillon, le soumis, le
    -- rejete et l'annule n'entrent nulle part.
    select f.entity_id, f.sens, f.montant, e.path
    from finance_entries f
    join entities e on e.id = f.entity_id
    where f.statut = 'VALIDE'
      and f.deleted_at is null
      and (p_debut is null or f.date_operation >= p_debut)
      and (p_fin   is null or f.date_operation <= p_fin)
  )
  select
    e.id,
    -- PROPRE : ce que l'entite a encaisse et depense ELLE-MEME.
    coalesce(sum(l.montant) filter (where l.sens = 'RECETTE' and l.entity_id = e.id), 0),
    coalesce(sum(l.montant) filter (where l.sens = 'DEPENSE' and l.entity_id = e.id), 0),
    -- CONSOLIDE : elle et tout son sous-arbre. `<@` lit « est descendant de,
    -- ou egal a » : l'entite se compte donc elle-meme, comme il se doit.
    coalesce(sum(l.montant) filter (where l.sens = 'RECETTE'), 0),
    coalesce(sum(l.montant) filter (where l.sens = 'DEPENSE'), 0)
  from entities e
  -- LEFT JOIN : une entite SANS aucun mouvement doit sortir a zero, pas
  -- disparaitre. Une eglise absente du tableau se lit « je ne la vois pas »,
  -- quand la verite est « elle n'a rien encaisse » — deux constats opposes.
  left join lignes l on l.path <@ e.path
  where e.deleted_at is null
  group by e.id;
$$;

comment on function fn_finance_soldes_perimetre is
  'EF-FIN-11 — solde propre et consolide de CHAQUE entite du perimetre, en une '
  'passe. SECURITY INVOKER : la RLS borne le resultat a la portee de l''appelant.';

insert into schema_migrations (version) values ('0026')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0027_dimes.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0027 — Dimes
-- =============================================================================
-- Reference : EF-FIN-27 a 31, RG-33 — conception dans plan.md §4.bis
--
-- LE POINT QUI COMMANDE TOUT LE RESTE
--
-- Une dime N'EST PAS une recette de l'eglise qui la collecte. Elle appartient
-- au SIEGE, a qui elle est remise en mains propres. Le mouvement financier
-- porte donc `entity_id = <Siege>` et JAMAIS l'eglise : sans cela,
-- `fn_finance_solde` compterait le meme argent deux fois — chez celui qui l'a
-- collecte et chez celui a qui il appartient, deux soldes plausibles et tous
-- deux faux.
--
-- Le lien avec le collecteur passe par `entite_collecte_id`, qui sert la
-- TRACABILITE et n'entre dans aucun calcul de solde.
--
-- REJOUABLE (regle 23) : `if not exists`, `create or replace`, et un
-- `drop ... if exists` avant chaque politique et chaque trigger.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Le contexte de collecte, sur le mouvement — EF-FIN-29, RG-33
-- -----------------------------------------------------------------------------

/**
 * `entite_collecte_id`, et non `eglise_collecte_id`.
 *
 * Une PAROISSE, un DISTRICT ou un REGIONAL peut collecter, lors d'un
 * rassemblement de son niveau (EF-FIN-30) : le nom initial aurait force a
 * ranger une collecte de district sous une eglise arbitraire, ou a laisser la
 * colonne vide — deux facons de perdre l'information.
 */
alter table finance_entries
  add column if not exists entite_collecte_id uuid references entities(id) on delete restrict;

comment on column finance_entries.entite_collecte_id is
  'RG-33 : l''entite qui a COLLECTE la dime. Le mouvement reste rattache au '
  'Siege par entity_id ; cette colonne sert la tracabilite, jamais le solde.';

do $$ begin
  create type type_evenement_dime as enum (
    'CULTE',                  -- le dimanche ordinaire, dans l'eglise
    'RASSEMBLEMENT_PAROISSE',
    'RASSEMBLEMENT_DISTRICT',
    'RASSEMBLEMENT_REGIONAL',
    'EVENEMENT_NATIONAL'      -- le Siege encaisse lui-meme, sans detail
  );
exception when duplicate_object then null;
end $$;

alter table finance_entries
  add column if not exists dime_evenement type_evenement_dime;

-- Retrouver « ce que mon eglise a collecte » sans parcourir toute la table.
create index if not exists finance_collecte_idx
  on finance_entries (entite_collecte_id, date_operation desc)
  where entite_collecte_id is not null;


/**
 * L'EGLISE DOIT VOIR CE QU'ELLE A COLLECTE — EF-FIN-31.
 *
 * La politique de lecture ne testait que `entity_in_scope(entity_id)`. Un
 * mouvement de dime etant rattache au SIEGE, il serait donc invisible a
 * l'eglise qui l'a collecte : elle ne pourrait pas repondre au croyant qui lui
 * demande la trace de sa dime, alors qu'elle lui en a remis le recu.
 */
drop policy if exists finance_entries_select on finance_entries;
create policy finance_entries_select on finance_entries for select to authenticated
  using (
       entity_in_scope(entity_id)
    or (entite_collecte_id is not null and entity_in_scope(entite_collecte_id))
  );


-- -----------------------------------------------------------------------------
-- Le mode de saisie, par eglise — EF-FIN-28
-- -----------------------------------------------------------------------------

/**
 * Comme `finance_validation_active` : propre a l'entite, AUCUN heritage.
 * Chaque bureau gere ses finances ; la hierarchie ne fait que les consulter.
 *
 *   null       -> defaut de l'organisation (detaille)
 *   DETAILLE   -> une ligne par croyant, avec enveloppe et recu
 *   GLOBAL     -> un seul montant pour la collecte
 */
do $$ begin
  create type mode_dime as enum ('DETAILLE', 'GLOBAL');
exception when duplicate_object then null;
end $$;

alter table entities
  add column if not exists dime_mode mode_dime;

comment on column entities.dime_mode is
  'EF-FIN-28 : mode de saisie des dimes, propre a l''entite. null = defaut de '
  'l''organisation. Aucun heritage depuis le parent.';


-- -----------------------------------------------------------------------------
-- L'enveloppe numerotee — EF-FIN-27
-- -----------------------------------------------------------------------------

/**
 * L'enveloppe APPARTIENT au croyant, dans une eglise donnee, et SURVIT aux
 * collectes : c'est son identite de donateur, pas un numero de transaction.
 */
create table if not exists dime_enveloppes (
  id         uuid primary key default gen_random_uuid(),
  eglise_id  uuid not null references entities(id) on delete restrict,
  croyant_id uuid not null references croyants(id) on delete restrict,
  numero     text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),

  -- Deux croyants ne partagent pas un numero dans la meme eglise.
  constraint dime_enveloppes_unicite unique (eglise_id, numero)
);

-- Un croyant n'a qu'une enveloppe ACTIVE par eglise : l'index partiel le dit
-- sans interdire de conserver les anciennes, qui figurent sur des recus remis.
create unique index if not exists dime_enveloppe_active_idx
  on dime_enveloppes (eglise_id, croyant_id)
  where is_active;

alter table dime_enveloppes enable row level security;

drop policy if exists dime_enveloppes_select on dime_enveloppes;
create policy dime_enveloppes_select on dime_enveloppes for select to authenticated
  using (entity_in_scope(eglise_id));

drop policy if exists dime_enveloppes_write on dime_enveloppes;
create policy dime_enveloppes_write on dime_enveloppes for all to authenticated
  using (can('finance.create', eglise_id))
  with check (can('finance.create', eglise_id));


-- -----------------------------------------------------------------------------
-- Le recu : une sequence PAR ENTITE ET PAR ANNEE — EF-FIN-27, regle 14
-- -----------------------------------------------------------------------------

create table if not exists dime_recu_sequences (
  cle     text primary key,          -- '<CODE_ENTITE>:<ANNEE>'
  dernier integer not null default 0
);

/**
 * Le numero de recu est attribue PAR LA BASE, jamais par le client (regle 14).
 *
 * Deux membres du bureau encaissent en meme temps, au fond de la meme salle :
 * seule la base peut garantir qu'ils n'obtiendront pas le meme numero.
 * `on conflict do update` rend l'increment atomique.
 */
create or replace function fn_generer_recu_dime(p_code_entite text) returns text
language plpgsql as $$
declare v_cle text; v_seq integer;
begin
  v_cle := p_code_entite || ':' || extract(year from current_date)::text;

  insert into dime_recu_sequences (cle, dernier)
  values (v_cle, 1)
  on conflict (cle) do update set dernier = dime_recu_sequences.dernier + 1
  returning dernier into v_seq;

  return format('DIM-%s-%s-%s', p_code_entite, extract(year from current_date),
                lpad(v_seq::text, 5, '0'));
end $$;


-- -----------------------------------------------------------------------------
-- Le versement individuel — EF-FIN-27
-- -----------------------------------------------------------------------------

/**
 * Le DETAIL d'une collecte. Le mouvement financier reste la piece comptable ;
 * ces lignes en expliquent la composition et portent les recus.
 */
create table if not exists dime_versements (
  id               uuid primary key default gen_random_uuid(),
  finance_entry_id uuid not null references finance_entries(id) on delete cascade,
  croyant_id       uuid not null references croyants(id) on delete restrict,

  /**
   * Le numero est RECOPIE, pas seulement reference.
   *
   * Un croyant peut changer d'enveloppe ; le recu remis il y a deux ans porte
   * l'ANCIEN numero, et c'est celui-la qui doit ressortir d'une recherche.
   */
  enveloppe_numero text,
  montant          numeric(14,2) not null check (montant > 0),
  recu_numero      text not null unique,
  created_at       timestamptz not null default now()
);

create index if not exists dime_versements_entry_idx
  on dime_versements (finance_entry_id);
create index if not exists dime_versements_croyant_idx
  on dime_versements (croyant_id, created_at desc);

alter table dime_versements enable row level security;

/**
 * La lecture suit celle du mouvement : l'eglise collectrice voit ses versements
 * (EF-FIN-31), le Siege les voit tous. On s'appuie sur la politique de
 * `finance_entries` plutot que de la reecrire — deux regles ecrites a deux
 * endroits divergent toujours.
 */
drop policy if exists dime_versements_select on dime_versements;
create policy dime_versements_select on dime_versements for select to authenticated
  using (
    exists (select 1 from finance_entries f where f.id = finance_entry_id)
  );

drop policy if exists dime_versements_write on dime_versements;
create policy dime_versements_write on dime_versements for all to authenticated
  using (
    exists (
      select 1 from finance_entries f
      where f.id = finance_entry_id
        and f.entite_collecte_id is not null
        and can('finance.create', f.entite_collecte_id)
    )
  )
  with check (
    exists (
      select 1 from finance_entries f
      where f.id = finance_entry_id
        and f.entite_collecte_id is not null
        and can('finance.create', f.entite_collecte_id)
    )
  );


-- -----------------------------------------------------------------------------
-- Le bordereau de remise — EF-FIN-30
-- -----------------------------------------------------------------------------

/**
 * La remise se fait EN MAINS PROPRES, portee par le tresorier principal de
 * l'eglise ou son adjoint. Les dimes d'un culte doivent parvenir au Siege au
 * plus tard dans la semaine suivante.
 *
 * Le regroupement de plusieurs cultes est possible mais mal vu : c'est un
 * retard, pas une organisation. Il n'est donc ni interdit ni encourage — le
 * bordereau DETAILLE la date de chaque culte dont il porte la collecte, ce qui
 * rend le retard visible au lieu de le noyer dans un total.
 */
create table if not exists dime_remises (
  id           uuid primary key default gen_random_uuid(),
  entite_id    uuid not null references entities(id) on delete restrict,  -- qui remet
  porteur_id   uuid references croyants(id) on delete set null,           -- tresorier ou adjoint
  date_remise  date not null default current_date,
  reference    text not null unique,
  observation  text,
  saisi_par    uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint dime_remises_date_passee check (date_remise <= current_date)
);

/**
 * Le lien remise <-> collectes. Une remise rassemble N mouvements de dime, et
 * un mouvement n'appartient qu'a une remise.
 *
 * `unique` sur `finance_entry_id` : remettre deux fois la meme collecte est
 * l'erreur qui ferait croire a un double encaissement.
 */
alter table finance_entries
  add column if not exists dime_remise_id uuid references dime_remises(id) on delete set null;

create index if not exists finance_remise_idx
  on finance_entries (dime_remise_id)
  where dime_remise_id is not null;

alter table dime_remises enable row level security;

drop policy if exists dime_remises_select on dime_remises;
create policy dime_remises_select on dime_remises for select to authenticated
  using (entity_in_scope(entite_id));

drop policy if exists dime_remises_write on dime_remises;
create policy dime_remises_write on dime_remises for all to authenticated
  using (can('finance.create', entite_id))
  with check (can('finance.create', entite_id));

create table if not exists dime_remise_sequences (
  cle     text primary key,
  dernier integer not null default 0
);

create or replace function fn_generer_bordereau(p_code_entite text) returns text
language plpgsql as $$
declare v_cle text; v_seq integer;
begin
  v_cle := p_code_entite || ':' || extract(year from current_date)::text;

  insert into dime_remise_sequences (cle, dernier)
  values (v_cle, 1)
  on conflict (cle) do update set dernier = dime_remise_sequences.dernier + 1
  returning dernier into v_seq;

  return format('BOR-%s-%s-%s', p_code_entite, extract(year from current_date),
                lpad(v_seq::text, 4, '0'));
end $$;

insert into schema_migrations (version) values ('0027')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0028_reprise_dimes.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0028 — Reprise des dimes deja enregistrees
-- =============================================================================
-- Reference : RG-33, EF-FIN-29 — conception dans plan.md §4.bis
--
-- CE QUE CETTE MIGRATION CORRIGE
--
-- Avant RG-33, les dimes etaient saisies comme des recettes de l'eglise qui les
-- collecte. Elles sont donc rattachees a l'eglise par `entity_id`, alors
-- qu'elles appartiennent au SIEGE. Deux consequences, dont la seconde est la
-- plus grave :
--
--   - elles GONFLENT LE SOLDE PROPRE des eglises, qui pourraient croire
--     disponible un argent qui ne leur appartient pas ;
--   - elles remontent en consolide chez chaque ancetre, ou elles seront
--     comptees UNE SECONDE FOIS le jour ou le Siege les enregistrera pour de
--     bon.
--
-- Construire les dimes ne suffisait donc pas : cela change ce qu'on saisira
-- desormais, pas ce qui est deja ecrit.
-- =============================================================================

do $$
declare
  v_siege   uuid;
  v_reprises integer;
begin
  select id into v_siege from entities where type = 'SIEGE' and deleted_at is null limit 1;

  if v_siege is null then
    raise notice 'Aucun Siege : rien a reprendre.';
    return;
  end if;

  /**
   * RG-17 S'Y OPPOSE, et la suspension doit se LIRE.
   *
   * Un mouvement valide est immuable : `trg_finance_biu` refusera l'`update`
   * de `entity_id`. On le desactive donc le temps de la reprise — c'est
   * legitime pour une correction de donnees, mais cela ne se glisse pas
   * discretement. Le jour ou quelqu'un relit cette migration, il doit
   * comprendre POURQUOI la regle a ete suspendue, et constater qu'elle est
   * retablie trois lignes plus bas.
   */
  alter table finance_entries disable trigger trg_finance_biu;

  /**
   * BORNEE A CE QUI N'A PAS DEJA ETE REPRIS.
   *
   * La regle 23 exige qu'une migration soit rejouable. Or une fois basculees,
   * ces lignes portent `entity_id = <Siege>` et l'eglise d'origine n'est plus
   * lisible ailleurs que dans `entite_collecte_id`. Sans la condition
   * `entite_collecte_id is null`, un second passage ecraserait la tracabilite
   * que le premier vient d'etablir — et l'eglise collectrice deviendrait le
   * Siege lui-meme.
   */
  with a_reprendre as (
    update finance_entries f
       set entite_collecte_id = f.entity_id,
           entity_id          = v_siege,
           -- Le contexte n'est pas connu retroactivement : ces collectes sont
           -- anterieures a la notion de rassemblement. « Culte » est le cas
           -- ordinaire, et le seul qu'on puisse affirmer sans inventer.
           dime_evenement     = coalesce(f.dime_evenement, 'CULTE')
      from finance_categories c
     where c.id = f.categorie_id
       and c.sens = 'RECETTE'
       and f.deleted_at is null
       and f.entite_collecte_id is null
       and f.entity_id <> v_siege
       -- Le referentiel nomme la categorie librement : on reconnait la dime
       -- par son code ou son libelle, accents et casse ignores.
       and (
            upper(c.code) like '%DIME%'
         or upper(translate(c.libelle, 'îÎïÏ', 'iIiI')) like '%DIME%'
       )
    returning f.id
  )
  select count(*) into v_reprises from a_reprendre;

  alter table finance_entries enable trigger trg_finance_biu;

  raise notice 'Reprise des dimes : % mouvement(s) rattache(s) au Siege.', v_reprises;
end $$;

insert into schema_migrations (version) values ('0028')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0029_collecte_dime.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0029 — Saisir une collecte de dimes
-- =============================================================================
-- Reference : EF-FIN-27 a 31, RG-33 — conception dans plan.md §4.bis
--
-- LE PROBLEME QUE CETTE MIGRATION RESOUT
--
-- Une dime appartient au Siege (RG-33), donc son mouvement porte
-- `entity_id = <Siege>`. Or c'est l'EGLISE qui la collecte, et son tresorier ne
-- detient pas `finance.create` sur le Siege : la RLS refuserait son insertion.
--
-- Trois issues avaient ete examinees dans plan.md. Celle retenue :
--
--   1. un droit DEDIE, `finance.dime.collect`, de portee l'EGLISE ;
--   2. une fonction SECURITY DEFINER, seul chemin d'ecriture, qui verifie ce
--      droit AVANT d'ecrire au nom du Siege.
--
-- Les deux autres etaient pires. Elargir la politique RLS au cas des categories
-- de dime l'aurait rendue illisible, et toute nouvelle categorie l'aurait
-- contournee. Passer par la saisie deleguee aurait fait saisir le Siege a la
-- place de cinquante eglises — exactement ce que ce mode est cense eviter.
--
-- ELLE EST AUSSI CE QUI REND L'ECRITURE ATOMIQUE (regle 20). Un mouvement sans
-- ses versements, ou des versements dont la somme ne fait pas le mouvement,
-- sont des etats FAUX ET INDETECTABLES : on ne saurait plus lequel des deux
-- nombres croire. Une fonction, donc, et un seul aller-retour.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Le droit de collecter — EF-FIN-27
-- -----------------------------------------------------------------------------
-- DELEGABLE : le Siege le confie a une eglise pour sa propre eglise. Il ne
-- figure donc PAS dans `fn_permissions_non_delegables()`.
-- -----------------------------------------------------------------------------


/**
 * Saisit une collecte de dimes, en une transaction.
 *
 * `p_versements` est un tableau JSON de `{ croyant_id, montant, enveloppe }`.
 * Vide, la collecte est GLOBALE : seul le montant total est enregistre, sans
 * detail par croyant (mode `GLOBAL`, ou evenement national).
 *
 * SECURITY DEFINER : la fonction ecrit au nom du Siege, ce que l'appelant ne
 * peut pas faire lui-meme. Le controle de droit est donc fait ICI, en premier,
 * et il porte sur l'ENTITE COLLECTRICE — pas sur le Siege.
 */
create or replace function fn_saisir_collecte_dime(
  p_entite_collecte uuid,
  p_categorie       uuid,
  p_date_operation  date,
  p_evenement       type_evenement_dime,
  p_libelle         text default null,
  p_reference       text default null,
  p_versements      jsonb default '[]'::jsonb
)
returns table (finance_entry_id uuid, recus jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siege     uuid := siege_id();
  v_code      text;
  v_profil    uuid := current_profile_id();
  v_total     numeric(14,2);
  v_entry     uuid;
  v_recus     jsonb := '[]'::jsonb;
  v_ligne     jsonb;
  v_recu      text;
  v_sens      sens_finance;
begin
  if v_siege is null then
    raise exception 'Aucun Siege n''est defini : une dime ne peut pas etre rattachee.';
  end if;

  -- LE CONTROLE DE DROIT, avant toute ecriture. Il porte sur l'eglise qui
  -- collecte : c'est elle que l'utilisateur doit etre habilite a representer.
  if not can('finance.dime.collect', p_entite_collecte) then
    raise exception 'Vous n''avez pas le droit de collecter les dimes de cette entite.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite_collecte;
  if v_code is null then
    raise exception 'Cette entite est introuvable.';
  end if;

  -- RG-13 : le sens vient de la categorie. Une dime est une RECETTE ; saisir
  -- une collecte dans une categorie de depense n'a aucun sens et fausserait le
  -- solde du Siege sans qu'aucune ligne ne paraisse anormale.
  select sens into v_sens from finance_categories where id = p_categorie;
  if v_sens is distinct from 'RECETTE' then
    raise exception 'RG-13 : une collecte de dimes doit relever d''une categorie de recette.';
  end if;

  /**
   * LE TOTAL VIENT DES VERSEMENTS quand il y en a.
   *
   * Le laisser saisir a cote produirait deux verites — un mouvement de
   * 1 000 000 pour 900 000 de versements — et personne ne saurait laquelle
   * croire. En mode global, il n'y a pas de detail, donc pas de contradiction
   * possible : le montant est celui du seul champ saisi.
   */
  select coalesce(sum((l->>'montant')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_versements) as l;

  if v_total <= 0 then
    raise exception 'Le montant de la collecte doit etre superieur a zero.';
  end if;

  /**
   * RG-33 — `entity_id` est le SIEGE, jamais l'eglise.
   *
   * C'est la ligne la plus importante du fichier. L'inverse ferait compter le
   * meme argent deux fois : chez celui qui l'a collecte et chez celui a qui il
   * appartient.
   */
  insert into finance_entries (
    entity_id, categorie_id, montant, date_operation, libelle, reference,
    entite_collecte_id, dime_evenement, saisi_par, saisi_depuis_entity_id
  )
  values (
    v_siege, p_categorie, v_total, p_date_operation, p_libelle, p_reference,
    p_entite_collecte, p_evenement, v_profil, p_entite_collecte
  )
  returning id into v_entry;

  -- Les versements individuels, chacun avec son recu attribue PAR LA BASE
  -- (regle 14) : deux membres du bureau encaissent en meme temps.
  for v_ligne in select * from jsonb_array_elements(p_versements)
  loop
    v_recu := fn_generer_recu_dime(v_code);

    insert into dime_versements (
      finance_entry_id, croyant_id, enveloppe_numero, montant, recu_numero
    )
    values (
      v_entry,
      (v_ligne->>'croyant_id')::uuid,
      nullif(v_ligne->>'enveloppe', ''),
      (v_ligne->>'montant')::numeric,
      v_recu
    );

    v_recus := v_recus || jsonb_build_object(
      'croyant_id', v_ligne->>'croyant_id',
      'recu', v_recu
    );
  end loop;

  return query select v_entry, v_recus;
end $$;

comment on function fn_saisir_collecte_dime is
  'EF-FIN-27/29 — collecte de dimes en UNE transaction. Le mouvement est '
  'rattache au SIEGE (RG-33) ; le droit verifie est finance.dime.collect sur '
  'l''entite collectrice.';

-- Le role anonyme n'a rien a y faire.
revoke execute on function fn_saisir_collecte_dime from anon;

insert into schema_migrations (version) values ('0029')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0030_dimes_anonymes.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0030 — Versements anonymes et rapprochement differe
-- =============================================================================
-- Reference : EF-FIN-33 (anonymes), EF-FIN-34 (import), EF-FIN-35 (historique)
--
-- CE QUE CETTE MIGRATION RECONNAIT
--
-- Toute dime n'a pas de nom. Une collecte reelle comprend :
--
--   - des enveloppes NOMINATIVES, rattachees a un croyant ;
--   - des enveloppes SANS NOM, numerotees mais non attribuees — quelqu'un a
--     oublie de s'inscrire, ou n'a pas voulu ;
--   - des especes EN VRAC, deposees dans l'urne sans enveloppe.
--
-- Les trois entrent dans le total. Seule la premiere ouvre un recu nominatif :
-- on ne remet pas un recu a personne.
--
-- REJOUABLE (regle 23).
-- =============================================================================


do $$ begin
  create type nature_versement as enum (
    'NOMINATIF',           -- une enveloppe, un croyant
    'ENVELOPPE_ANONYME',   -- une enveloppe numerotee, sans nom
    'EN_VRAC'              -- especes dans l'urne, sans enveloppe
  );
exception when duplicate_object then null;
end $$;

alter table dime_versements
  add column if not exists nature nature_versement not null default 'NOMINATIF';

/**
 * `croyant_id` DEVIENT NULLABLE, et c'est le coeur de cette migration.
 *
 * Un versement anonyme n'a personne a qui se rattacher. Le forcer aurait
 * conduit a inventer un croyant « Anonyme » — une fiche fictive qui
 * apparaitrait dans les effectifs, les statistiques par sexe, la repartition
 * par grade, et finirait par recevoir un transfert.
 */
alter table dime_versements
  alter column croyant_id drop not null;

/**
 * Le recu aussi devient facultatif.
 *
 * On ne remet pas de recu a une enveloppe sans nom : il n'y a personne pour le
 * recevoir. Le laisser obligatoire aurait fait consommer la sequence pour rien
 * et brouille la numerotation de ceux qui existent vraiment.
 */
alter table dime_versements
  alter column recu_numero drop not null;

-- La coherence des trois natures, dite une fois pour toutes.
alter table dime_versements
  drop constraint if exists dime_versements_nature_coherente;

alter table dime_versements
  add constraint dime_versements_nature_coherente check (
    (nature = 'NOMINATIF'         and croyant_id is not null)
    -- Une enveloppe anonyme porte un NUMERO : c'est ce qui la distingue du
    -- vrac, et ce qui permettra de la rattacher plus tard si son porteur se
    -- manifeste.
 or (nature = 'ENVELOPPE_ANONYME' and croyant_id is null and enveloppe_numero is not null)
 or (nature = 'EN_VRAC'           and croyant_id is null and enveloppe_numero is null)
  );

comment on column dime_versements.nature is
  'EF-FIN-33 : nominatif, enveloppe anonyme ou especes en vrac. Les trois '
  'entrent dans le total ; seul le nominatif ouvre un recu.';


-- -----------------------------------------------------------------------------
-- Les lignes d'import SANS correspondance — EF-FIN-34
-- -----------------------------------------------------------------------------

/**
 * POURQUOI UNE TABLE, ET NON UN REJET.
 *
 * A l'import d'une feuille de versements, un nom peut ne correspondre a aucune
 * fiche : le croyant n'est pas encore enregistre, ou son nom est ecrit
 * autrement. Refuser la ligne perdrait un ARGENT REELLEMENT RECU — l'enveloppe
 * est dans l'urne, elle ne disparaitra pas parce que le fichier est imparfait.
 *
 * On enregistre donc le versement (en anonyme, il compte dans le total) ET la
 * ligne du fichier, qui attend d'etre rapprochee dans `/croyants`. La collecte
 * est juste des le premier jour ; le nom se retrouve ensuite.
 */
create table if not exists dime_rapprochements (
  id               uuid primary key default gen_random_uuid(),
  versement_id     uuid not null references dime_versements(id) on delete cascade,
  entite_id        uuid not null references entities(id) on delete restrict,

  -- Ce que le fichier disait, conserve TEL QUEL : c'est la seule trace de ce
  -- qui a ete lu, et le rapprochement se fera contre elle.
  nom_source       text not null,
  prenom_source    text,
  enveloppe_source text,

  -- Rempli a la resolution : la fiche retenue, ou creee.
  croyant_id       uuid references croyants(id) on delete set null,
  resolu_le        timestamptz,
  resolu_par       uuid references profiles(id) on delete set null,

  created_at       timestamptz not null default now()
);

create index if not exists dime_rapprochements_attente_idx
  on dime_rapprochements (entite_id, created_at)
  where croyant_id is null;

alter table dime_rapprochements enable row level security;

drop policy if exists dime_rapprochements_select on dime_rapprochements;
create policy dime_rapprochements_select on dime_rapprochements for select to authenticated
  using (entity_in_scope(entite_id));

drop policy if exists dime_rapprochements_write on dime_rapprochements;
create policy dime_rapprochements_write on dime_rapprochements for all to authenticated
  using (can('finance.dime.collect', entite_id))
  with check (can('finance.dime.collect', entite_id));

comment on table dime_rapprochements is
  'EF-FIN-34 : ligne de fichier sans correspondance. Le versement est deja '
  'enregistre — l''argent est recu ; seul le NOM attend d''etre retrouve.';


-- -----------------------------------------------------------------------------
-- L'historique des versements d'un croyant — EF-FIN-35
-- -----------------------------------------------------------------------------

/**
 * Le numero d'enveloppe est deja RECOPIE sur chaque versement (0027) : un
 * changement d'enveloppe ne reecrit donc jamais le passe, et un recu remis il y
 * a deux ans reste retrouvable par son ancien numero.
 *
 * Cet index sert la lecture depuis la fiche du croyant : ses versements, du
 * plus recent au plus ancien, dimes comme autres collectes.
 */
create index if not exists dime_versements_historique_idx
  on dime_versements (croyant_id, created_at desc)
  where croyant_id is not null;


-- -----------------------------------------------------------------------------
-- La saisie, revue pour les trois natures — EF-FIN-33
-- -----------------------------------------------------------------------------

/**
 * `p_versements` porte desormais `nature` par ligne.
 *
 * LE RECU N'EST ATTRIBUE QU'AU NOMINATIF. On ne remet pas de recu a une
 * enveloppe sans nom : il n'y a personne pour le recevoir, et consommer la
 * sequence brouillerait la numerotation de ceux qui existent vraiment.
 *
 * Les trois natures entrent en revanche dans le TOTAL : l'argent est dans
 * l'urne, quelle que soit la facon dont il y est arrive.
 */
create or replace function fn_saisir_collecte_dime(
  p_entite_collecte uuid,
  p_categorie       uuid,
  p_date_operation  date,
  p_evenement       type_evenement_dime,
  p_libelle         text default null,
  p_reference       text default null,
  p_versements      jsonb default '[]'::jsonb
)
returns table (finance_entry_id uuid, recus jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siege     uuid := siege_id();
  v_code      text;
  v_profil    uuid := current_profile_id();
  v_total     numeric(14,2);
  v_entry     uuid;
  v_recus     jsonb := '[]'::jsonb;
  v_ligne     jsonb;
  v_recu      text;
  v_nature    nature_versement;
  v_croyant   uuid;
  v_sens      sens_finance;
begin
  if v_siege is null then
    raise exception 'Aucun Siege n''est defini : une dime ne peut pas etre rattachee.';
  end if;

  if not can('finance.dime.collect', p_entite_collecte) then
    raise exception 'Vous n''avez pas le droit de collecter les dimes de cette entite.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite_collecte;
  if v_code is null then
    raise exception 'Cette entite est introuvable.';
  end if;

  select sens into v_sens from finance_categories where id = p_categorie;
  if v_sens is distinct from 'RECETTE' then
    raise exception 'RG-13 : une collecte de dimes doit relever d''une categorie de recette.';
  end if;

  select coalesce(sum((l->>'montant')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_versements) as l;

  if v_total <= 0 then
    raise exception 'Le montant de la collecte doit etre superieur a zero.';
  end if;

  -- RG-33 : `entity_id` est le SIEGE, jamais l'eglise.
  insert into finance_entries (
    entity_id, categorie_id, montant, date_operation, libelle, reference,
    entite_collecte_id, dime_evenement, saisi_par, saisi_depuis_entity_id
  )
  values (
    v_siege, p_categorie, v_total, p_date_operation, p_libelle, p_reference,
    p_entite_collecte, p_evenement, v_profil, p_entite_collecte
  )
  returning id into v_entry;

  for v_ligne in select * from jsonb_array_elements(p_versements)
  loop
    v_croyant := nullif(v_ligne->>'croyant_id', '')::uuid;
    v_nature  := coalesce(
      nullif(v_ligne->>'nature', '')::nature_versement,
      case when v_croyant is null then 'EN_VRAC' else 'NOMINATIF' end
    );

    -- Le recu n'existe que pour un versement NOMINATIF.
    v_recu := case when v_nature = 'NOMINATIF' then fn_generer_recu_dime(v_code) end;

    insert into dime_versements (
      finance_entry_id, croyant_id, enveloppe_numero, montant, recu_numero, nature
    )
    values (
      v_entry,
      v_croyant,
      nullif(v_ligne->>'enveloppe', ''),
      (v_ligne->>'montant')::numeric,
      v_recu,
      v_nature
    );

    if v_recu is not null then
      v_recus := v_recus || jsonb_build_object(
        'croyant_id', v_ligne->>'croyant_id',
        'recu', v_recu
      );
    end if;
  end loop;

  return query select v_entry, v_recus;
end $$;

revoke execute on function fn_saisir_collecte_dime from anon;

insert into schema_migrations (version) values ('0030')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0031_croyants_pour_dime.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0031 — Voir tous les croyants pour une collecte de dimes
-- =============================================================================
-- Reference : EF-FIN-32 — un croyant de passage verse sa dime dans une autre
--             eglise que la sienne.
--
-- LE PROBLEME
--
-- Le menu de saisie ne proposait que les croyants du perimetre du saisissant,
-- la RLS de `croyants` ne livrant rien d'autre. Un visiteur venu d'un autre
-- district restait donc introuvable, et il fallait le saisir en anonyme —
-- perdant justement la trace que le recu doit porter.
--
-- CE QUI N'A PAS ETE FAIT, ET POURQUOI
--
-- Elargir la politique `select` de `croyants` aurait ouvert AVEC ELLE la liste
-- des croyants, les exports, les statistiques, les transferts et les rapports :
-- adresse, telephone, date de naissance, situation maritale de toute
-- l'organisation, a qui detient `croyant.read` quelque part. Un droit qui ouvre
-- plus que ce qu'on veut accorder n'est pas le bon droit — c'est la meme
-- lecon que `finance.workflow.manage`.
--
-- CE QUI EST FAIT
--
-- Une fonction dediee, qui borne DEUX choses a la fois :
--
--   - les COLONNES : de quoi identifier un donateur et rien de plus — nom,
--     prenom, matricule, eglise, portrait. Pas d'adresse, pas de telephone,
--     pas de date de naissance ;
--   - l'AUDIENCE : ceux qui detiennent `finance.dime.collect` quelque part.
--     Un lecteur sans ce droit n'y gagne rien.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

create or replace function fn_croyants_pour_dime()
returns table (
  id         uuid,
  nom        text,
  prenom     text,
  matricule  text,
  photo_key  text,
  eglise_nom text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  /**
   * LE DROIT EST VERIFIE ICI, ET SANS PORTEE — volontairement.
   *
   * `has_perm` sans entite repond « detient-il ce droit quelque part ? ». La
   * portee n'aurait pas de sens : la question n'est pas « peut-il collecter
   * pour l'eglise de ce croyant » — il ne collecte pas pour elle, il enregistre
   * un versement fait CHEZ LUI par quelqu'un venu d'ailleurs.
   */
  if not has_perm('finance.dime.collect') and not is_superadmin() then
    raise exception 'Droit insuffisant pour consulter les donateurs.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select c.id, c.nom, c.prenom, c.matricule, c.photo_key, e.nom
      from croyants c
      left join entities e on e.id = c.eglise_id
     where c.deleted_at is null
       -- Un croyant TRANSFERE ou decede ne verse plus : le proposer ferait
       -- rattacher une dime a une fiche close.
       and c.statut = 'ACTIF'
     order by c.nom, c.prenom
     -- Regle 17 : un volume trop grand se borne par un plafond ANNONCE a
     -- l'ecran, jamais par un retour silencieux a la pagination. L'appelant
     -- compare le nombre recu a cette valeur pour savoir s'il doit le dire.
     limit 5000;
end $$;

comment on function fn_croyants_pour_dime is
  'EF-FIN-32 — donateurs possibles d''une collecte, TOUTE l''organisation. '
  'Colonnes bornees a l''identite ; reserve aux detenteurs de '
  'finance.dime.collect. N''elargit PAS la RLS de croyants.';

revoke execute on function fn_croyants_pour_dime from anon;

insert into schema_migrations (version) values ('0031')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0032_import_versements.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0032 — L'import de versements ecrit ses rapprochements
-- =============================================================================
-- Reference : EF-FIN-34 — une ligne portant un nom sans correspondance est
--             conservee pour etre resolue dans `/croyants`.
--
-- POURQUOI LA MEME FONCTION, ET NON UNE SECONDE ECRITURE
--
-- Le rapprochement porte l'identifiant du VERSEMENT auquel il se rapporte, et
-- cet identifiant n'existe qu'une fois le versement ecrit. Le faire depuis
-- l'application demanderait de relire les versements pour les apparier — par
-- leur rang, ou par montant et enveloppe — deux appariements fragiles pour un
-- lien que la base peut poser sans hesiter.
--
-- Surtout, les deux sont INDISSOCIABLES (regle 20). Un versement anonyme dont
-- le rapprochement manquerait serait indistinguable d'une vraie enveloppe sans
-- nom : le nom lu dans le fichier serait perdu, et personne ne saurait qu'il a
-- existe. C'est un etat FAUX ET INDETECTABLE — donc une transaction.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

create or replace function fn_saisir_collecte_dime(
  p_entite_collecte uuid,
  p_categorie       uuid,
  p_date_operation  date,
  p_evenement       type_evenement_dime,
  p_libelle         text default null,
  p_reference       text default null,
  p_versements      jsonb default '[]'::jsonb
)
returns table (finance_entry_id uuid, recus jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siege     uuid := siege_id();
  v_code      text;
  v_profil    uuid := current_profile_id();
  v_total     numeric(14,2);
  v_entry     uuid;
  v_recus     jsonb := '[]'::jsonb;
  v_ligne     jsonb;
  v_recu      text;
  v_nature    nature_versement;
  v_croyant   uuid;
  v_versement uuid;
  v_nom       text;
  v_sens      sens_finance;
begin
  if v_siege is null then
    raise exception 'Aucun Siege n''est defini : une dime ne peut pas etre rattachee.';
  end if;

  if not can('finance.dime.collect', p_entite_collecte) then
    raise exception 'Vous n''avez pas le droit de collecter les dimes de cette entite.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite_collecte;
  if v_code is null then
    raise exception 'Cette entite est introuvable.';
  end if;

  select sens into v_sens from finance_categories where id = p_categorie;
  if v_sens is distinct from 'RECETTE' then
    raise exception 'RG-13 : une collecte de dimes doit relever d''une categorie de recette.';
  end if;

  select coalesce(sum((l->>'montant')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_versements) as l;

  if v_total <= 0 then
    raise exception 'Le montant de la collecte doit etre superieur a zero.';
  end if;

  -- RG-33 : `entity_id` est le SIEGE, jamais l'eglise.
  insert into finance_entries (
    entity_id, categorie_id, montant, date_operation, libelle, reference,
    entite_collecte_id, dime_evenement, saisi_par, saisi_depuis_entity_id
  )
  values (
    v_siege, p_categorie, v_total, p_date_operation, p_libelle, p_reference,
    p_entite_collecte, p_evenement, v_profil, p_entite_collecte
  )
  returning id into v_entry;

  for v_ligne in select * from jsonb_array_elements(p_versements)
  loop
    v_croyant := nullif(v_ligne->>'croyant_id', '')::uuid;
    v_nom     := nullif(trim(coalesce(v_ligne->>'nom_source', '')), '');

    v_nature  := coalesce(
      nullif(v_ligne->>'nature', '')::nature_versement,
      case when v_croyant is null then 'EN_VRAC' else 'NOMINATIF' end
    );

    -- Le recu n'existe que pour un versement NOMINATIF : on ne remet pas de
    -- recu a personne.
    v_recu := case when v_nature = 'NOMINATIF' then fn_generer_recu_dime(v_code) end;

    insert into dime_versements (
      finance_entry_id, croyant_id, enveloppe_numero, montant, recu_numero, nature
    )
    values (
      v_entry,
      v_croyant,
      nullif(v_ligne->>'enveloppe', ''),
      (v_ligne->>'montant')::numeric,
      v_recu,
      v_nature
    )
    returning id into v_versement;

    if v_recu is not null then
      v_recus := v_recus || jsonb_build_object(
        'croyant_id', v_ligne->>'croyant_id',
        'recu', v_recu
      );
    end if;

    /**
     * EF-FIN-34 — la ligne PORTE UN NOM que rien ne reconnait.
     *
     * Le versement vient d'etre ecrit : le montant compte des maintenant,
     * l'argent est recu. Ce qui manque, c'est le NOM — et il attend dans
     * `/croyants` qu'on le retrouve.
     *
     * Une ligne SANS nom n'entre pas ici : il n'y aurait rien a rapprocher, et
     * la file se remplirait de lignes qu'aucun travail ne peut clore.
     */
    if v_croyant is null and v_nom is not null then
      insert into dime_rapprochements (
        versement_id, entite_id, nom_source, prenom_source, enveloppe_source
      )
      values (
        v_versement,
        p_entite_collecte,
        v_nom,
        nullif(trim(coalesce(v_ligne->>'prenom_source', '')), ''),
        nullif(v_ligne->>'enveloppe', '')
      );
    end if;
  end loop;

  return query select v_entry, v_recus;
end $$;

comment on function fn_saisir_collecte_dime is
  'EF-FIN-27/29/34 — collecte de dimes en UNE transaction. Le mouvement est '
  'rattache au SIEGE (RG-33) ; une ligne nommee mais non reconnue laisse un '
  'rapprochement a resoudre.';

revoke execute on function fn_saisir_collecte_dime from anon;


/**
 * Resoudre un rapprochement : la ligne trouve enfin sa fiche.
 *
 * DEUX ECRITURES INDISSOCIABLES (regle 20) : le versement devient nominatif ET
 * le rapprochement se ferme. L'un sans l'autre laisserait soit un versement
 * attribue dont la file garde la trace comme non resolue, soit une file vide
 * pour un versement toujours anonyme.
 *
 * Le recu est emis A CE MOMENT : c'est maintenant qu'il y a quelqu'un a qui le
 * remettre.
 */
create or replace function fn_resoudre_rapprochement(
  p_rapprochement uuid,
  p_croyant       uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entite    uuid;
  v_versement uuid;
  v_code      text;
  v_recu      text;
begin
  select r.entite_id, r.versement_id
    into v_entite, v_versement
    from dime_rapprochements r
   where r.id = p_rapprochement and r.croyant_id is null;

  if v_entite is null then
    raise exception 'Ce rapprochement est introuvable ou deja resolu.';
  end if;

  if not can('finance.dime.collect', v_entite) then
    raise exception 'Vous n''avez pas le droit de resoudre ce rapprochement.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = v_entite;
  v_recu := fn_generer_recu_dime(v_code);

  update dime_versements
     set croyant_id  = p_croyant,
         nature      = 'NOMINATIF',
         recu_numero = v_recu
   where id = v_versement;

  update dime_rapprochements
     set croyant_id = p_croyant,
         resolu_le  = now(),
         resolu_par = current_profile_id()
   where id = p_rapprochement;

  return v_recu;
end $$;

revoke execute on function fn_resoudre_rapprochement from anon;

insert into schema_migrations (version) values ('0032')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0033_enveloppe_anonyme_sans_numero.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0033 — Une enveloppe anonyme n'a pas forcement de numero
-- =============================================================================
-- Reference : EF-FIN-33 — precise le 13 aout 2026.
--
-- CE QUE LA CONTRAINTE DE `0030` IMPOSAIT A TORT
--
-- Elle exigeait un NUMERO pour toute `ENVELOPPE_ANONYME`, et renvoyait au vrac
-- ce qui n'en avait pas. C'etait une distinction d'informaticien, pas de
-- tresorier :
--
--   - une enveloppe SANS NUMERO reste une enveloppe. Elle a ete pliee, remise,
--     ouverte ; l'appeler « en vrac » — des especes jetees dans l'urne — decrit
--     autre chose que ce qui s'est passe ;
--   - et surtout, elle otait un CHOIX a l'utilisateur. Devant une enveloppe
--     numerotee mais sans nom, c'est a lui de trancher : chercher le porteur par
--     le numero (la suggestion), ou la classer « enveloppe anonyme ». La
--     contrainte decidait a sa place.
--
-- CE QUI RESTE VRAI : le VRAC n'a ni nom ni numero — c'est ce qui le definit.
-- Un versement NOMINATIF a toujours un croyant.
--
-- REJOUABLE (regle 23).
-- =============================================================================

alter table dime_versements
  drop constraint if exists dime_versements_nature_coherente;

alter table dime_versements
  add constraint dime_versements_nature_coherente check (
    (nature = 'NOMINATIF'         and croyant_id is not null)
    -- Le numero devient FACULTATIF : une enveloppe sans numero reste une
    -- enveloppe, et l'utilisateur garde le choix de la qualifier ainsi.
 or (nature = 'ENVELOPPE_ANONYME' and croyant_id is null)
    -- Le vrac, lui, n'a NI nom NI enveloppe : c'est sa definition meme.
 or (nature = 'EN_VRAC'           and croyant_id is null and enveloppe_numero is null)
  );

comment on column dime_versements.nature is
  'EF-FIN-33 : nominatif, enveloppe anonyme (avec ou sans numero) ou especes en '
  'vrac. Les trois entrent dans le total ; seul le nominatif ouvre un recu.';

insert into schema_migrations (version) values ('0033')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0034_rafraichir_schema.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0034 — Forcer PostgREST a relire le schema
-- =============================================================================
-- POURQUOI CE FICHIER EXISTE
--
-- PostgREST garde en memoire la signature de chaque fonction exposee. Quand une
-- migration en REMPLACE une — `0032` l'a fait pour `fn_saisir_collecte_dime` —
-- le cache peut rester en retard quelques instants, parfois davantage. L'appel
-- echoue alors avec « Could not find the function ... in the schema cache »,
-- alors que la fonction existe bel et bien et qu'un `select` direct la trouve.
--
-- Le symptome est deroutant : la base est juste, le code est juste, et l'ecran
-- dit non. Cette notification remet les deux d'accord.
--
-- REJOUABLE (regle 23) : une notification n'a pas d'etat.
-- =============================================================================

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0034')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0035_nature_par_defaut.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0035 — Corriger le type de la nature par defaut
-- =============================================================================
-- Reference : EF-FIN-33.
--
-- LE DEFAUT
--
-- `coalesce` exige des types compatibles. Le premier argument etait un
-- `nature_versement`, le second un `case` ne rendant que des litteraux non
-- types — donc du `text`. PostgreSQL refusait l'appariement :
--
--   COALESCE types nature_versement and text cannot be matched
--
-- La saisie echouait donc AVANT d'ecrire quoi que ce soit. Rien n'a ete perdu,
-- mais rien n'a pu etre enregistre non plus.
--
-- CE QUE CE DEFAUT A APPRIS
--
-- L'ecran disait « L'operation n'a pas pu aboutir », et c'est cela qui a coute
-- du temps : la base nommait la cause depuis le debut, personne ne pouvait la
-- lire. Le message porte desormais le detail (voir `lib/actions/dimes.ts`), et
-- c'est ce qui a permis de trouver ce bogue en une minute.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

create or replace function fn_saisir_collecte_dime(
  p_entite_collecte uuid,
  p_categorie       uuid,
  p_date_operation  date,
  p_evenement       type_evenement_dime,
  p_libelle         text default null,
  p_reference       text default null,
  p_versements      jsonb default '[]'::jsonb
)
returns table (finance_entry_id uuid, recus jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siege     uuid := siege_id();
  v_code      text;
  v_profil    uuid := current_profile_id();
  v_total     numeric(14,2);
  v_entry     uuid;
  v_recus     jsonb := '[]'::jsonb;
  v_ligne     jsonb;
  v_recu      text;
  v_nature    nature_versement;
  v_croyant   uuid;
  v_versement uuid;
  v_nom       text;
  v_sens      sens_finance;
begin
  if v_siege is null then
    raise exception 'Aucun Siege n''est defini : une dime ne peut pas etre rattachee.';
  end if;

  if not can('finance.dime.collect', p_entite_collecte) then
    raise exception 'Vous n''avez pas le droit de collecter les dimes de cette entite.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite_collecte;
  if v_code is null then
    raise exception 'Cette entite est introuvable.';
  end if;

  select sens into v_sens from finance_categories where id = p_categorie;
  if v_sens is distinct from 'RECETTE' then
    raise exception 'RG-13 : une collecte de dimes doit relever d''une categorie de recette.';
  end if;

  select coalesce(sum((l->>'montant')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_versements) as l;

  if v_total <= 0 then
    raise exception 'Le montant de la collecte doit etre superieur a zero.';
  end if;

  -- RG-33 : `entity_id` est le SIEGE, jamais l'eglise.
  insert into finance_entries (
    entity_id, categorie_id, montant, date_operation, libelle, reference,
    entite_collecte_id, dime_evenement, saisi_par, saisi_depuis_entity_id
  )
  values (
    v_siege, p_categorie, v_total, p_date_operation, p_libelle, p_reference,
    p_entite_collecte, p_evenement, v_profil, p_entite_collecte
  )
  returning id into v_entry;

  for v_ligne in select * from jsonb_array_elements(p_versements)
  loop
    v_croyant := nullif(v_ligne->>'croyant_id', '')::uuid;
    v_nom     := nullif(trim(coalesce(v_ligne->>'nom_source', '')), '');

    /**
     * LES DEUX BRANCHES SONT TYPEES, et il le faut.
     *
     * `coalesce` exige des types compatibles : le premier argument est un
     * `nature_versement`, quand le `case` ne rendait que des litteraux non
     * types — donc du `text`. La conversion explicite du second terme leve
     * l'ambiguite.
     */
    v_nature  := coalesce(
      nullif(v_ligne->>'nature', '')::nature_versement,
      (case when v_croyant is null then 'EN_VRAC' else 'NOMINATIF' end)::nature_versement
    );

    -- Le recu n'existe que pour un versement NOMINATIF : on ne remet pas de
    -- recu a personne.
    v_recu := case when v_nature = 'NOMINATIF' then fn_generer_recu_dime(v_code) end;

    insert into dime_versements (
      finance_entry_id, croyant_id, enveloppe_numero, montant, recu_numero, nature
    )
    values (
      v_entry,
      v_croyant,
      nullif(v_ligne->>'enveloppe', ''),
      (v_ligne->>'montant')::numeric,
      v_recu,
      v_nature
    )
    returning id into v_versement;

    if v_recu is not null then
      v_recus := v_recus || jsonb_build_object(
        'croyant_id', v_ligne->>'croyant_id',
        'recu', v_recu
      );
    end if;

    /**
     * EF-FIN-34 — la ligne PORTE UN NOM que rien ne reconnait.
     *
     * Le versement vient d'etre ecrit : le montant compte des maintenant,
     * l'argent est recu. Ce qui manque, c'est le NOM — et il attend dans
     * `/croyants` qu'on le retrouve.
     *
     * Une ligne SANS nom n'entre pas ici : il n'y aurait rien a rapprocher, et
     * la file se remplirait de lignes qu'aucun travail ne peut clore.
     */
    if v_croyant is null and v_nom is not null then
      insert into dime_rapprochements (
        versement_id, entite_id, nom_source, prenom_source, enveloppe_source
      )
      values (
        v_versement,
        p_entite_collecte,
        v_nom,
        nullif(trim(coalesce(v_ligne->>'prenom_source', '')), ''),
        nullif(v_ligne->>'enveloppe', '')
      );
    end if;
  end loop;

  return query select v_entry, v_recus;
end $$;

comment on function fn_saisir_collecte_dime is
  'EF-FIN-27/29/34 — collecte de dimes en UNE transaction. Le mouvement est '
  'rattache au SIEGE (RG-33) ; une ligne nommee mais non reconnue laisse un '
  'rapprochement a resoudre.';

revoke execute on function fn_saisir_collecte_dime from anon;

-- La signature ne change pas, mais le cache de PostgREST ne coute rien a
-- rafraichir — et son retard est le premier suspect a ecarter.
notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0035')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0036_recu_descriptif.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0036 — Le recu porte sa propre description
-- =============================================================================
-- Reference : EF-FIN-27.
--
-- LE DEFAUT
--
-- La fonction ne rendait que la reference du recu et un identifiant. Devant
-- dix recus, personne ne savait lequel allait sur quel talon — or c est
-- precisement ce qu on en fait : on les recopie, un par un, sur des
-- enveloppes posees devant soi.
--
-- Chaque recu porte desormais le NOM, le PRENOM et le NUMERO D ENVELOPPE.
-- Le nom vient de la FICHE, pas du fichier : c est celui qui figurera au
-- registre.
--
-- REJOUABLE (regle 23) : create or replace.
-- =============================================================================
create or replace function fn_saisir_collecte_dime(
  p_entite_collecte uuid,
  p_categorie       uuid,
  p_date_operation  date,
  p_evenement       type_evenement_dime,
  p_libelle         text default null,
  p_reference       text default null,
  p_versements      jsonb default '[]'::jsonb
)
returns table (finance_entry_id uuid, recus jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siege     uuid := siege_id();
  v_code      text;
  v_profil    uuid := current_profile_id();
  v_total     numeric(14,2);
  v_entry     uuid;
  v_recus     jsonb := '[]'::jsonb;
  v_ligne     jsonb;
  v_recu      text;
  v_nature    nature_versement;
  v_croyant   uuid;
  v_versement uuid;
  v_nom       text;
  v_prenom    text;
  v_libelle   text;
  v_sens      sens_finance;
begin
  if v_siege is null then
    raise exception 'Aucun Siege n''est defini : une dime ne peut pas etre rattachee.';
  end if;

  if not can('finance.dime.collect', p_entite_collecte) then
    raise exception 'Vous n''avez pas le droit de collecter les dimes de cette entite.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite_collecte;
  if v_code is null then
    raise exception 'Cette entite est introuvable.';
  end if;

  select sens into v_sens from finance_categories where id = p_categorie;
  if v_sens is distinct from 'RECETTE' then
    raise exception 'RG-13 : une collecte de dimes doit relever d''une categorie de recette.';
  end if;

  select coalesce(sum((l->>'montant')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_versements) as l;

  if v_total <= 0 then
    raise exception 'Le montant de la collecte doit etre superieur a zero.';
  end if;

  -- RG-33 : `entity_id` est le SIEGE, jamais l'eglise.
  insert into finance_entries (
    entity_id, categorie_id, montant, date_operation, libelle, reference,
    entite_collecte_id, dime_evenement, saisi_par, saisi_depuis_entity_id
  )
  values (
    v_siege, p_categorie, v_total, p_date_operation, p_libelle, p_reference,
    p_entite_collecte, p_evenement, v_profil, p_entite_collecte
  )
  returning id into v_entry;

  for v_ligne in select * from jsonb_array_elements(p_versements)
  loop
    v_croyant := nullif(v_ligne->>'croyant_id', '')::uuid;
    v_libelle := nullif(trim(coalesce(v_ligne->>'nom_source', '')), '');

    /**
     * LES DEUX BRANCHES SONT TYPEES, et il le faut.
     *
     * `coalesce` exige des types compatibles : le premier argument est un
     * `nature_versement`, quand le `case` ne rendait que des litteraux non
     * types — donc du `text`. La conversion explicite du second terme leve
     * l'ambiguite.
     */
    v_nature  := coalesce(
      nullif(v_ligne->>'nature', '')::nature_versement,
      (case when v_croyant is null then 'EN_VRAC' else 'NOMINATIF' end)::nature_versement
    );

    -- Le recu n'existe que pour un versement NOMINATIF : on ne remet pas de
    -- recu a personne.
    v_recu := case when v_nature = 'NOMINATIF' then fn_generer_recu_dime(v_code) end;

    insert into dime_versements (
      finance_entry_id, croyant_id, enveloppe_numero, montant, recu_numero, nature
    )
    values (
      v_entry,
      v_croyant,
      nullif(v_ligne->>'enveloppe', ''),
      (v_ligne->>'montant')::numeric,
      v_recu,
      v_nature
    )
    returning id into v_versement;

    if v_recu is not null then
      /**
       * LE RECU PORTE SA PROPRE DESCRIPTION.
       *
       * Il ne rendait que la reference et un identifiant : devant dix recus,
       * personne ne savait lequel allait sur quel talon. Or c'est precisement
       * ce qu'on en fait — on les recopie, un par un, sur des enveloppes
       * posees devant soi.
       *
       * Le nom vient de la fiche, pas du fichier : c'est celui qui figurera
       * sur le registre.
       */
      select c.nom, c.prenom into v_nom, v_prenom
        from croyants c where c.id = v_croyant;

      v_recus := v_recus || jsonb_build_object(
        'croyant_id', v_ligne->>'croyant_id',
        'recu', v_recu,
        'nom', v_nom,
        'prenom', v_prenom,
        'enveloppe', nullif(v_ligne->>'enveloppe', '')
      );
    end if;

    /**
     * EF-FIN-34 — la ligne PORTE UN NOM que rien ne reconnait.
     *
     * Le versement vient d'etre ecrit : le montant compte des maintenant,
     * l'argent est recu. Ce qui manque, c'est le NOM — et il attend dans
     * `/croyants` qu'on le retrouve.
     *
     * Une ligne SANS nom n'entre pas ici : il n'y aurait rien a rapprocher, et
     * la file se remplirait de lignes qu'aucun travail ne peut clore.
     */
    if v_croyant is null and v_libelle is not null then
      insert into dime_rapprochements (
        versement_id, entite_id, nom_source, prenom_source, enveloppe_source
      )
      values (
        v_versement,
        p_entite_collecte,
        v_libelle,
        nullif(trim(coalesce(v_ligne->>'prenom_source', '')), ''),
        nullif(v_ligne->>'enveloppe', '')
      );
    end if;
  end loop;

  return query select v_entry, v_recus;
end $$;

comment on function fn_saisir_collecte_dime is
  'EF-FIN-27/29/34 — collecte de dimes en UNE transaction. Le mouvement est '
  'rattache au SIEGE (RG-33) ; une ligne nommee mais non reconnue laisse un '
  'rapprochement a resoudre.';

revoke execute on function fn_saisir_collecte_dime from anon;

-- La signature ne change pas, mais le cache de PostgREST ne coute rien a
-- rafraichir — et son retard est le premier suspect a ecarter.
notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0036')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0037_remettre_collectes.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0037 — Remettre un lot de collectes au Siege
-- =============================================================================
-- Reference : EF-FIN-30 — la dime est portee EN MAINS PROPRES au Siege par le
--             tresorier principal de l'eglise ou son adjoint.
--
-- POURQUOI UNE FONCTION
--
-- Une remise, ce sont DEUX ecritures indissociables (regle 20) : le bordereau
-- nait, et les collectes s'y rattachent. L'une sans l'autre laisserait soit un
-- bordereau vide — un papier qui ne prouve rien —, soit des collectes marquees
-- remises sans document pour l'attester. Deux etats faux, et le second
-- indetectable : on croirait l'argent arrive.
--
-- Le numero de bordereau est attribue PAR LA BASE (regle 14) : deux eglises
-- peuvent se presenter au Siege le meme matin.
--
-- CE QUE CETTE FONCTION NE FAIT PAS : verifier le delai. Les dimes d'un culte
-- doivent parvenir dans la semaine, mais REFUSER une remise tardive
-- empecherait de regulariser — exactement l'inverse du but. Le retard se
-- CONSTATE a l'ecran, il ne s'interdit pas.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

create or replace function fn_remettre_collectes(
  p_entite      uuid,
  p_collectes   uuid[],
  p_porteur     uuid default null,
  p_date_remise date default current_date,
  p_observation text default null
)
returns table (remise_id uuid, reference text, collectes integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code      text;
  v_reference text;
  v_remise    uuid;
  v_nombre    integer;
begin
  if not can('finance.dime.collect', p_entite) then
    raise exception 'Vous n''avez pas le droit de remettre les dimes de cette entite.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite;
  if v_code is null then
    raise exception 'Cette entite est introuvable.';
  end if;

  v_reference := fn_generer_bordereau(v_code);

  insert into dime_remises (
    entite_id, porteur_id, date_remise, reference, observation, saisi_par
  )
  values (
    p_entite, p_porteur, p_date_remise, v_reference, p_observation,
    current_profile_id()
  )
  returning id into v_remise;

  /**
   * SEULES LES COLLECTES ENCORE NON REMISES sont rattachees.
   *
   * `dime_remise_id is null` n'est pas une precaution de style : deux
   * utilisateurs peuvent preparer le meme bordereau en meme temps, et
   * rattacher une collecte deja remise la ferait compter DEUX FOIS — le Siege
   * croirait avoir recu le double.
   */
  update finance_entries f
     set dime_remise_id = v_remise
   where f.id = any (p_collectes)
     and f.entite_collecte_id = p_entite
     and f.dime_remise_id is null
     and f.deleted_at is null;

  get diagnostics v_nombre = row_count;

  /**
   * UN BORDEREAU VIDE N'A PAS LIEU D'EXISTER.
   *
   * Si aucune collecte n'a pu etre rattachee — toutes deja remises, ou hors de
   * l'entite —, on annule tout : un papier qui ne porte rien se retrouverait
   * dans la liste des remises sans qu'on sache quoi en faire.
   */
  if v_nombre = 0 then
    raise exception
      'Aucune de ces collectes n''est a remettre : elles ont deja ete portees au Siege.';
  end if;

  return query select v_remise, v_reference, v_nombre;
end $$;

comment on function fn_remettre_collectes is
  'EF-FIN-30 — cree un bordereau et y rattache les collectes, en UNE '
  'transaction. Le numero vient de la base ; une collecte deja remise est '
  'ignoree, et un bordereau reste vide echoue.';

revoke execute on function fn_remettre_collectes from anon;

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0037')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0038_dime_validee_a_la_remise.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0038 — La dime n'alimente le Siege qu'une fois RECUE
-- =============================================================================
-- Reference : EF-FIN-30 — « Elle n'alimente le solde du Siege qu'une fois
--             RECUE : la remise physique est ce que constate la validation. »
--
-- CE QUI N'ALLAIT PAS
--
-- La collecte creait un mouvement dont le statut etait laisse au workflow du
-- SIEGE. Deux consequences, opposees et toutes deux fausses :
--
--   - workflow du Siege ACTIF : la collecte restait en brouillon, et le solde
--     du Siege ne bougeait jamais — meme apres la remise. C'est ce qui a ete
--     constate ;
--   - workflow du Siege INACTIF : elle comptait AUSSITOT, avant meme que
--     l'argent ait quitte l'eglise. Le Siege aurait vu une recette pour des
--     billets encore dans une urne a quarante kilometres.
--
-- Le second cas est le plus grave, parce qu'il ne se voit pas.
--
-- CE QUE DIT LA REALITE, ET DESORMAIS LE CODE
--
-- Une collecte est une ANNONCE : « voici ce que nous avons recueilli ». Elle
-- nait donc SOUMISE. La remise en mains propres est ce qui la rend vraie —
-- c'est elle, et elle seule, qui VALIDE le mouvement.
--
-- RG-18 fait alors exactement ce qu'il faut : tant que la remise n'a pas eu
-- lieu, la dime ne compte au solde de personne. Et l'ecart entre le collecte et
-- le recu devient l'indicateur qu'un tresorier veut voir.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

create or replace function fn_saisir_collecte_dime(
  p_entite_collecte uuid,
  p_categorie       uuid,
  p_date_operation  date,
  p_evenement       type_evenement_dime,
  p_libelle         text default null,
  p_reference       text default null,
  p_versements      jsonb default '[]'::jsonb
)
returns table (finance_entry_id uuid, recus jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siege     uuid := siege_id();
  v_code      text;
  v_profil    uuid := current_profile_id();
  v_total     numeric(14,2);
  v_entry     uuid;
  v_recus     jsonb := '[]'::jsonb;
  v_ligne     jsonb;
  v_recu      text;
  v_nature    nature_versement;
  v_croyant   uuid;
  v_versement uuid;
  v_nom       text;
  v_prenom    text;
  v_libelle   text;
  v_sens      sens_finance;
begin
  if v_siege is null then
    raise exception 'Aucun Siege n''est defini : une dime ne peut pas etre rattachee.';
  end if;

  if not can('finance.dime.collect', p_entite_collecte) then
    raise exception 'Vous n''avez pas le droit de collecter les dimes de cette entite.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite_collecte;
  if v_code is null then
    raise exception 'Cette entite est introuvable.';
  end if;

  select sens into v_sens from finance_categories where id = p_categorie;
  if v_sens is distinct from 'RECETTE' then
    raise exception 'RG-13 : une collecte de dimes doit relever d''une categorie de recette.';
  end if;

  select coalesce(sum((l->>'montant')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_versements) as l;

  if v_total <= 0 then
    raise exception 'Le montant de la collecte doit etre superieur a zero.';
  end if;

  /**
   * RG-33 : `entity_id` est le SIEGE, jamais l'eglise.
   *
   * `statut = 'SOUMIS'` est POSE ICI, et c'est le coeur de cette migration.
   * Une collecte est une ANNONCE — « voici ce que nous avons recueilli » — et
   * non un encaissement. La laisser au workflow du Siege la faisait soit
   * dormir en brouillon pour toujours, soit compter avant que l'argent ait
   * quitte l'eglise. Le trigger respecte un statut explicite.
   */
  insert into finance_entries (
    entity_id, categorie_id, montant, date_operation, libelle, reference,
    entite_collecte_id, dime_evenement, statut, soumis_par, soumis_le,
    saisi_par, saisi_depuis_entity_id
  )
  values (
    v_siege, p_categorie, v_total, p_date_operation, p_libelle, p_reference,
    p_entite_collecte, p_evenement, 'SOUMIS', v_profil, now(),
    v_profil, p_entite_collecte
  )
  returning id into v_entry;

  for v_ligne in select * from jsonb_array_elements(p_versements)
  loop
    v_croyant := nullif(v_ligne->>'croyant_id', '')::uuid;
    v_libelle := nullif(trim(coalesce(v_ligne->>'nom_source', '')), '');

    -- `coalesce` exige des types compatibles : les deux branches sont typees.
    v_nature  := coalesce(
      nullif(v_ligne->>'nature', '')::nature_versement,
      (case when v_croyant is null then 'EN_VRAC' else 'NOMINATIF' end)::nature_versement
    );

    -- Le recu n'existe que pour un versement NOMINATIF.
    v_recu := case when v_nature = 'NOMINATIF' then fn_generer_recu_dime(v_code) end;

    insert into dime_versements (
      finance_entry_id, croyant_id, enveloppe_numero, montant, recu_numero, nature
    )
    values (
      v_entry,
      v_croyant,
      nullif(v_ligne->>'enveloppe', ''),
      (v_ligne->>'montant')::numeric,
      v_recu,
      v_nature
    )
    returning id into v_versement;

    if v_recu is not null then
      -- Le recu porte sa propre description : nom, prenom, enveloppe.
      select c.nom, c.prenom into v_nom, v_prenom
        from croyants c where c.id = v_croyant;

      v_recus := v_recus || jsonb_build_object(
        'croyant_id', v_ligne->>'croyant_id',
        'recu', v_recu,
        'nom', v_nom,
        'prenom', v_prenom,
        'enveloppe', nullif(v_ligne->>'enveloppe', '')
      );
    end if;

    -- EF-FIN-34 — la ligne porte un nom que rien ne reconnait.
    if v_croyant is null and v_libelle is not null then
      insert into dime_rapprochements (
        versement_id, entite_id, nom_source, prenom_source, enveloppe_source
      )
      values (
        v_versement,
        p_entite_collecte,
        v_libelle,
        nullif(trim(coalesce(v_ligne->>'prenom_source', '')), ''),
        nullif(v_ligne->>'enveloppe', '')
      );
    end if;
  end loop;

  return query select v_entry, v_recus;
end $$;

revoke execute on function fn_saisir_collecte_dime from anon;


-- -----------------------------------------------------------------------------
-- La remise VALIDE les collectes : c'est elle qui alimente le Siege
-- -----------------------------------------------------------------------------

create or replace function fn_remettre_collectes(
  p_entite      uuid,
  p_collectes   uuid[],
  p_porteur     uuid default null,
  p_date_remise date default current_date,
  p_observation text default null
)
returns table (remise_id uuid, reference text, collectes integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code      text;
  v_reference text;
  v_remise    uuid;
  v_nombre    integer;
  v_profil    uuid := current_profile_id();
begin
  if not can('finance.dime.collect', p_entite) then
    raise exception 'Vous n''avez pas le droit de remettre les dimes de cette entite.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite;
  if v_code is null then
    raise exception 'Cette entite est introuvable.';
  end if;

  v_reference := fn_generer_bordereau(v_code);

  insert into dime_remises (
    entite_id, porteur_id, date_remise, reference, observation, saisi_par
  )
  values (
    p_entite, p_porteur, p_date_remise, v_reference, p_observation, v_profil
  )
  returning id into v_remise;

  /**
   * LA REMISE VALIDE — EF-FIN-30, RG-18.
   *
   * C'est ici, et nulle part ailleurs, que la dime entre au solde du Siege :
   * la remise physique est ce que constate la validation.
   *
   * `statut <> 'VALIDE'` protege les collectes anterieures a cette migration,
   * creees deja validees : RG-17 refuse toute ecriture sur un mouvement valide,
   * et les inclure ferait echouer le bordereau entier.
   *
   * `dime_remise_id is null` n'est pas une precaution de style : deux
   * utilisateurs peuvent preparer le meme bordereau en meme temps, et
   * rattacher une collecte deja remise la ferait compter DEUX FOIS.
   */
  update finance_entries f
     set dime_remise_id = v_remise,
         statut         = 'VALIDE',
         valide_par     = v_profil
   where f.id = any (p_collectes)
     and f.entite_collecte_id = p_entite
     and f.dime_remise_id is null
     and f.deleted_at is null
     and f.statut <> 'VALIDE';

  /**
   * Les collectes DEJA VALIDES sont rattachees a part, sans toucher au statut.
   *
   * Elles datent d'avant cette migration. RG-17 refuse toute ecriture sur un
   * mouvement valide — les inclure ci-dessus ferait echouer le bordereau
   * entier —, mais il doit tout de meme les porter : sans cela, elles
   * resteraient eternellement « a remettre » alors qu'elles ont ete portees.
   */
  update finance_entries f
     set dime_remise_id = v_remise
   where f.id = any (p_collectes)
     and f.entite_collecte_id = p_entite
     and f.dime_remise_id is null
     and f.deleted_at is null
     and f.statut = 'VALIDE';

  -- Le compte se LIT une fois tout rattache : additionner deux `row_count`
  -- oblige a se demander lequel a deja ete consomme.
  select count(*)::integer into v_nombre
    from finance_entries f where f.dime_remise_id = v_remise;

  if v_nombre = 0 then
    raise exception
      'Aucune de ces collectes n''est a remettre : elles ont deja ete portees au Siege.';
  end if;

  return query select v_remise, v_reference, v_nombre;
end $$;

revoke execute on function fn_remettre_collectes from anon;

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0038')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0039_finance_synthese.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0039 — La synthese periodique
-- =============================================================================
-- Reference : EF-FIN-24 — « Produire une synthese periodique (mensuelle,
--             trimestrielle, annuelle) : recettes et depenses par categorie,
--             evolution du solde, comparatif entre entites soeurs. »
--
-- CES FONCTIONS RENDENT UNE ANNEE ENTIERE, MOIS PAR MOIS
--
-- Elles pourraient rendre le total d'une periode demandee. Elles rendent le
-- DETAIL MENSUEL de l'annee, et c'est un choix, pas une facilite : changer de
-- mois ou passer du trimestre a l'annee devient alors une somme faite dans le
-- navigateur, instantanee, au lieu d'un aller-retour de 0,5 a 4 s (regles 17
-- et 28). L'utilisateur d'une synthese compare — il ne consulte pas une
-- periode, il en parcourt plusieurs.
--
-- Le volume le permet largement : une vingtaine de categories sur douze mois
-- font quelques centaines de lignes, moins qu'une page de mouvements.
--
-- LES DEUX PORTEES SONT RENDUES ENSEMBLE — propre et consolide. Le basculement
-- ne coute alors rien lui non plus, et surtout les deux nombres viennent du
-- MEME passage : deux appels separes pourraient tomber de part et d'autre
-- d'une validation et se contredire.
--
-- L'EVOLUTION DU SOLDE N'A PAS DE FONCTION : elle est la somme des categories
-- par mois, que l'ecran fait en une ligne. Une troisieme fonction aurait
-- reposer la meme question a la base pour obtenir un total qu'elle a deja
-- donne en detail.
--
-- SECURITY INVOKER (le defaut), comme `fn_finance_soldes_perimetre` : la RLS de
-- `finance_entries` et d'`entities` s'applique a l'appelant. L'ecran n'a aucun
-- filtrage a refaire, et ne peut donc pas se tromper en le faisant.
--
-- RG-18 PARTOUT : seul le VALIDE alimente une synthese. Le brouillon, le
-- soumis, le rejete et l'annule n'entrent nulle part — sans quoi une synthese
-- annoncerait un argent que personne n'a encore reconnu.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Par categorie et par mois — d'ou vient l'argent, ou va-t-il
-- -----------------------------------------------------------------------------

create or replace function fn_finance_synthese_categories(
  p_entity uuid,
  p_annee  integer
)
returns table (
  mois              date,
  categorie_id      uuid,
  libelle           text,
  sens              sens_finance,
  montant_propre    numeric,
  montant_consolide numeric,
  nombre_propre     integer,
  nombre_consolide  integer
)
language sql
stable
as $$
  with cible as (
    select e.id, e.path
    from entities e
    where e.id = p_entity
      and e.deleted_at is null
  ),
  lignes as (
    select
      date_trunc('month', f.date_operation)::date as mois,
      f.categorie_id,
      f.entity_id,
      f.montant,
      f.id
    from finance_entries f
    join entities e on e.id = f.entity_id
    where f.statut = 'VALIDE'
      and f.deleted_at is null
      and f.date_operation >= make_date(p_annee, 1, 1)
      and f.date_operation <= make_date(p_annee, 12, 31)
      -- `<@` lit « est descendant de, ou egal a » : l'entite se compte donc
      -- elle-meme dans le consolide, comme il se doit.
      and e.path <@ (select path from cible)
  )
  select
    l.mois,
    c.id,
    c.libelle,
    c.sens,
    -- PROPRE : ce que l'entite a encaisse et depense ELLE-MEME.
    coalesce(sum(l.montant) filter (where l.entity_id = p_entity), 0),
    -- CONSOLIDE : elle et tout son sous-arbre — le filtre `<@` l'a deja borne.
    coalesce(sum(l.montant), 0),
    count(l.id) filter (where l.entity_id = p_entity)::integer,
    count(l.id)::integer
  from lignes l
  join finance_categories c on c.id = l.categorie_id
  group by l.mois, c.id, c.libelle, c.sens
  order by l.mois, c.sens, coalesce(sum(l.montant), 0) desc;
$$;

comment on function fn_finance_synthese_categories is
  'EF-FIN-24 — recettes et depenses par categorie et par mois sur une annee, '
  'en portee propre ET consolidee. SECURITY INVOKER : la RLS borne le resultat.';


-- -----------------------------------------------------------------------------
-- 2. Entre soeurs — sommes-nous dans la norme de nos pairs
-- -----------------------------------------------------------------------------
--
-- LES SOEURS SONT LES ENTITES DE MEME PARENT, l'entite comparee comprise : se
-- retirer du tableau obligerait a chercher ailleurs sa propre ligne pour se
-- situer, ce qui est precisement l'objet de la comparaison.
--
-- Le montant rendu est le CONSOLIDE de chaque soeur. Comparer le propre d'un
-- district a celui d'un autre ne dit rien : la ou l'un encaisse lui-meme,
-- l'autre laisse ses eglises le faire, et les deux sont des organisations
-- legitimes.
--
-- ELLE NE REND QUE DES MONTANTS, jamais les noms : une soeur SANS AUCUN
-- mouvement n'a pas de ligne ici, et doit pourtant figurer au tableau a zero —
-- absente, elle se lirait « hors perimetre » quand la verite est « elle n'a
-- rien encaisse » (regle 15). C'est donc l'ecran qui dresse la LISTE des
-- soeurs depuis l'arbre qu'il detient deja, et qui vient y poser ces montants.

create or replace function fn_finance_synthese_soeurs(
  p_entity uuid,
  p_annee  integer
)
returns table (
  mois      date,
  entity_id uuid,
  recettes  numeric,
  depenses  numeric
)
language sql
stable
as $$
  with cible as (
    select e.id, e.parent_id
    from entities e
    where e.id = p_entity
      and e.deleted_at is null
  ),
  soeurs as (
    select e.id, e.path
    from entities e, cible c
    where e.deleted_at is null
      -- `is not distinct from` couvre le Siege, dont le parent est `null` :
      -- `=` aurait rendu zero ligne, et l'ecran aurait conclu a une absence de
      -- droit la ou il n'y a qu'une racine (regle 15).
      and e.parent_id is not distinct from c.parent_id
  ),
  lignes as (
    select
      date_trunc('month', f.date_operation)::date as mois,
      f.sens,
      f.montant,
      e.path
    from finance_entries f
    join entities e on e.id = f.entity_id
    where f.statut = 'VALIDE'
      and f.deleted_at is null
      and f.date_operation >= make_date(p_annee, 1, 1)
      and f.date_operation <= make_date(p_annee, 12, 31)
  )
  select
    l.mois,
    s.id,
    coalesce(sum(l.montant) filter (where l.sens = 'RECETTE'), 0),
    coalesce(sum(l.montant) filter (where l.sens = 'DEPENSE'), 0)
  from soeurs s
  join lignes l on l.path <@ s.path
  group by l.mois, s.id;
$$;

comment on function fn_finance_synthese_soeurs is
  'EF-FIN-24 — montants consolides, mois par mois, des entites de meme parent. '
  'L''ecran dresse la liste des soeurs depuis l''arbre : une soeur sans aucun '
  'mouvement doit figurer a zero, pas disparaitre (regle 15).';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0039')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0040_cloture_periode.sql
-- #############################################################################

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

insert into schema_migrations (version) values ('0040')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0041_tableau_de_bord.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0041 — Les indicateurs du tableau de bord
-- =============================================================================
-- Reference : EF-DSH-01 a 04, EF-DSH-12 — un tableau de bord par perimetre,
--             borne aux donnees de l'utilisateur, dont les indicateurs se
--             masquent quand l'habilitation manque.
--
-- UNE FONCTION, UN ALLER-RETOUR, QUINZE INDICATEURS. Les demander un par un
-- couterait quinze fois 0,5 a 4 secondes avant le premier chiffre — soit une
-- minute pour une page qui doit s'ouvrir d'un coup (regle 28). Chaque compte
-- est un sous-select independant : PostgreSQL les evalue en une passe, et le
-- resultat tient en UNE ligne.
--
-- SECURITY INVOKER (le defaut), et c'est ce qui tient EF-DSH-02. La RLS de
-- `croyants`, d'`entities`, de `bureau_membres` et de `finance_entries`
-- s'applique a l'appelant : un gestionnaire de district n'obtient que son
-- district, sans que l'ecran n'ait le moindre filtrage a refaire. Ce qu'on ne
-- refait pas, on ne peut pas le rater.
--
-- LE PERIMETRE EST LE SOUS-ARBRE de `p_entity`, elle comprise — `<@` lit « est
-- descendant de, ou egal a ». Un district compte ses vingt eglises ET
-- lui-meme ; c'est ce que « vue consolidee » veut dire.
--
-- LES COMPTES D'EFFECTIF SONT INSTANTANES, les montants sont PERIODIQUES. Un
-- effectif est un etat — « combien sommes-nous aujourd'hui ? » — quand une
-- recette est un flux : « combien avons-nous recu ce mois-ci ? ». Leur donner
-- la meme borne temporelle rendrait l'un des deux faux.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

create or replace function fn_tableau_de_bord(
  p_entity uuid,
  p_debut  date,
  p_fin    date
)
returns table (
  croyants           integer,
  femmes             integer,
  hommes             integer,
  nouveaux_baptises  integer,
  encellules         integer,
  cellules           integer,
  eglises            integer,
  paroisses          integer,
  districts          integer,
  regionaux          integer,
  membres_bureau     integer,
  membres_finances   integer,
  bureaux_actifs     integer,
  recettes           numeric,
  depenses           numeric,
  solde_consolide    numeric,
  transferts_attente integer,
  mouvements_attente integer
)
language sql
stable
as $$
  with cible as (
    select e.id, e.path
    from entities e
    where e.id = p_entity
      and e.deleted_at is null
  ),
  perimetre as (
    select e.id, e.type
    from entities e, cible c
    where e.path <@ c.path
      and e.deleted_at is null
  ),
  -- RG-30 : la fenetre des nouveaux baptises est un REGLAGE, jamais une
  -- constante. La coder en dur ici rendrait le parametre decoratif (regle 21).
  reglage as (
    select coalesce(max(fenetre_nouveaux_baptises_jours), 15) as jours
    from organisation_settings
  ),
  gens as (
    select c.id, c.sexe, c.date_bapteme, c.cellule_id
    from croyants c
    where c.deleted_at is null
      and c.statut = 'ACTIF'
      and c.eglise_id in (select id from perimetre)
  ),
  -- Un membre de bureau est un croyant dont le mandat est EN COURS : un mandat
  -- clos appartient a l'historique (EF-BUR-08), pas a l'effectif du jour.
  mandats as (
    select distinct m.croyant_id, f.est_financiere
    from bureau_membres m
    join bureaux b on b.id = m.bureau_id
    join fonctions f on f.id = m.fonction_id
    where b.deleted_at is null
      and b.is_active
      and b.entity_id in (select id from perimetre)
      and m.date_fin is null
  ),
  argent as (
    select f.sens, f.montant, f.date_operation
    from finance_entries f
    where f.statut = 'VALIDE'
      and f.deleted_at is null
      and f.entity_id in (select id from perimetre)
  )
  select
    (select count(*) from gens)::integer,
    (select count(*) from gens where sexe = 'F')::integer,
    (select count(*) from gens where sexe = 'M')::integer,
    (select count(*) from gens, reglage
      where date_bapteme >= current_date - (reglage.jours || ' days')::interval)::integer,
    (select count(*) from gens where cellule_id is not null)::integer,

    (select count(*) from perimetre where type = 'CELLULE')::integer,
    (select count(*) from perimetre where type = 'EGLISE')::integer,
    (select count(*) from perimetre where type = 'PAROISSE')::integer,
    (select count(*) from perimetre where type = 'DISTRICT')::integer,
    (select count(*) from perimetre where type = 'REGIONAL')::integer,

    (select count(distinct croyant_id) from mandats)::integer,
    (select count(distinct croyant_id) from mandats where est_financiere)::integer,
    (select count(*) from bureaux b
      where b.deleted_at is null and b.is_active
        and b.entity_id in (select id from perimetre))::integer,

    -- Les FLUX sont bornes a la periode demandee.
    (select coalesce(sum(montant), 0) from argent
      where sens = 'RECETTE' and date_operation between p_debut and p_fin),
    (select coalesce(sum(montant), 0) from argent
      where sens = 'DEPENSE' and date_operation between p_debut and p_fin),
    /**
     * LE SOLDE, LUI, EST UN CUMUL DEPUIS TOUJOURS.
     *
     * C'est de la tresorerie : « de combien disposons-nous ? ». Le borner a la
     * periode donnerait le RESULTAT du mois, un nombre tout aussi plausible
     * mais qui repond a une autre question — et sur lequel quelqu'un
     * engagerait une depense.
     */
    (select coalesce(sum(case when sens = 'RECETTE' then montant else -montant end), 0)
      from argent),

    /**
     * Les transferts qui attendent une DECISION DE CE PERIMETRE.
     *
     * C'est l'eglise de DESTINATION qui approuve : compter ceux qui partent
     * ferait apparaitre chez l'expediteur un travail qui ne lui revient pas.
     */
    (select count(*) from transferts t
      where t.statut = 'DEMANDE'
        and t.to_eglise_id in (select id from perimetre))::integer,
    (select count(*) from finance_entries f
      where f.statut = 'SOUMIS'
        and f.deleted_at is null
        and f.entity_id in (select id from perimetre))::integer;
$$;

comment on function fn_tableau_de_bord is
  'EF-DSH-01 a 04 — les indicateurs d''un perimetre en UNE passe. '
  'SECURITY INVOKER : la RLS borne le resultat a la portee de l''appelant, '
  'l''ecran n''a aucun filtrage a refaire.';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0041')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0042_repartitions.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0042 — Repartitions analytiques du tableau de bord
-- =============================================================================
-- Reference : EF-DSH-05 — « repartition par grade, nationalite, tranche d'age,
--             sexe ; taux d'encellulement ; couverture des bureaux ; classement
--             des entites filles. »
--
-- UNE SEULE FONCTION POUR QUATRE REPARTITIONS. Elles repondent a la meme
-- question — « comment se decompose notre effectif ? » — et ne different que
-- par la colonne de regroupement. Quatre fonctions auraient donne quatre
-- allers-retours et quatre endroits ou corriger la meme borne de perimetre
-- (regle 28).
--
-- LE CLASSEMENT DES ENTITES FILLES EST UNE REPARTITION, lui aussi : « combien
-- de croyants par eglise » se decompose exactement comme « combien par grade ».
-- Lui donner sa propre fonction aurait duplique le meme calcul sous un autre
-- nom.
--
-- SECURITY INVOKER (le defaut) : la RLS de `croyants` et d'`entities` borne le
-- resultat a la portee de l'appelant, et l'ecran n'a aucun filtrage a refaire.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Les repartitions
-- -----------------------------------------------------------------------------
--
-- `cle` sert a l'ordre et au lien ; `libelle` s'affiche. Les deux existent parce
-- qu'une tranche d'age se TRIE par sa borne basse et se LIT « 26 a 40 ans » :
-- trier sur le libelle mettrait « 18 a 25 » apres « 0 a 17 » mais aussi apres
-- « 61 ans et plus ».

-- On depose avant de creer, pour la meme raison que plus bas : ajouter une
-- colonne au `returns table` d'une fonction existante est un changement de type
-- de retour, et `create or replace` le refuse. Le faire des maintenant evite de
-- buter dessus a la premiere evolution.
drop function if exists fn_repartitions(uuid);

create function fn_repartitions(p_entity uuid)
returns table (
  dimension text,
  cle       text,
  libelle   text,
  effectif  integer
)
language sql
stable
as $$
  with cible as (
    select e.id, e.path
    from entities e
    where e.id = p_entity
      and e.deleted_at is null
  ),
  perimetre as (
    select e.id, e.nom, e.code, e.type, e.parent_id
    from entities e, cible c
    where e.path <@ c.path
      and e.deleted_at is null
  ),
  gens as (
    select c.id, c.grade_id, c.nationalite_id, c.date_naissance, c.eglise_id
    from croyants c
    where c.deleted_at is null
      and c.statut = 'ACTIF'
      and c.eglise_id in (select id from perimetre)
  )

  -- Par GRADE.
  select 'GRADE', g.code, g.libelle, count(gens.id)::integer
    from grades g
    join gens on gens.grade_id = g.id
   group by g.code, g.libelle

  union all

  -- Par NATIONALITE. La colonne est `code_iso` et non `code` : une
  -- nationalite se designe par son code a trois lettres (EF-REF-02).
  select 'NATIONALITE', n.code_iso::text, n.libelle, count(gens.id)::integer
    from nationalites n
    join gens on gens.nationalite_id = n.id
   group by n.code_iso, n.libelle

  union all

  /**
   * Par TRANCHE D'AGE.
   *
   * Les bornes sont ECRITES ICI et non deduites d'un pas regulier : « 0 a 17 »
   * et « 18 a 25 » n'ont pas la meme largeur parce qu'elles ne repondent pas a
   * la meme question — l'une est la jeunesse, l'autre l'entree dans la vie
   * adulte. Un decoupage par tranches de dix ans serait regulier et ne dirait
   * rien.
   */
  select
    'AGE',
    t.cle,
    t.libelle,
    count(gens.id)::integer
  from (values
    ('1', '0 à 17 ans',      0,  17),
    ('2', '18 à 25 ans',    18,  25),
    ('3', '26 à 40 ans',    26,  40),
    ('4', '41 à 60 ans',    41,  60),
    ('5', '61 ans et plus', 61, 200)
  ) as t(cle, libelle, borne_basse, borne_haute)
  join gens
    on extract(year from age(gens.date_naissance))
       between t.borne_basse and t.borne_haute
  group by t.cle, t.libelle

  union all

  /**
   * Par ENTITE FILLE — le classement d'EF-DSH-05.
   *
   * LES FILLES DIRECTES, avec le total de LEUR sous-arbre : comparer un
   * district a une cellule n'aurait aucun sens, et ne compter que les croyants
   * rattaches en propre a un district en donnerait zero — ils sont dans ses
   * eglises.
   *
   * UNE FILLE SANS PERSONNE SORT A ZERO, et c'est le seul cas ou une tranche
   * vide merite sa ligne : un grade que nul ne detient est du bruit, une eglise
   * sans croyant est precisement celle qu'on cherche. Les `left join` sont la
   * pour cela.
   */
  select
    'ENTITE',
    fille.id::text,
    fille.nom,
    count(g.id)::integer
  from entities fille
  join cible ci on fille.parent_id = ci.id
  left join entities sous
    on sous.path <@ fille.path
   and sous.deleted_at is null
  left join croyants g
    on g.eglise_id = sous.id
   and g.deleted_at is null
   and g.statut = 'ACTIF'
  where fille.deleted_at is null
  group by fille.id, fille.nom;
$$;

comment on function fn_repartitions is
  'EF-DSH-05 — repartitions par grade, nationalite, tranche d''age et entite '
  'fille, en UNE passe. SECURITY INVOKER : la RLS borne le resultat.';


-- -----------------------------------------------------------------------------
-- 2. La couverture des bureaux entre au tableau de bord
-- -----------------------------------------------------------------------------
--
-- DEUX COLONNES DE PLUS, et non un ratio deja calcule : une jauge doit pouvoir
-- dire « 12 sur 20 », pas seulement « 60 % ». Un pourcentage seul ne distingue
-- pas trois entites sur cinq de six cents sur mille.
--
-- LES CELLULES SONT HORS DU COMPTE. RG-10 veut un bureau par entite, mais une
-- cellule de priere n'en a pas : les inclure ferait plonger la couverture de
-- toute organisation qui en compte beaucoup — c'est-a-dire de celles qui vont
-- le mieux.
--
-- IL FAUT DEPOSER LA FONCTION AVANT DE LA RECREER, et `create or replace` n'y
-- suffit pas : les parametres OUT font partie de la signature, si bien
-- qu'AJOUTER UNE COLONNE au `returns table` est un changement de type de
-- retour, que PostgreSQL refuse en remplacement (42P13).
--
-- Le `drop ... if exists` garde la migration rejouable (regle 23). Aucune vue
-- ni aucun trigger ne depend de cette fonction : rien ne tombe avec elle.

drop function if exists fn_tableau_de_bord(uuid, date, date);

create function fn_tableau_de_bord(
  p_entity uuid,
  p_debut  date,
  p_fin    date
)
returns table (
  croyants            integer,
  femmes              integer,
  hommes              integer,
  nouveaux_baptises   integer,
  encellules          integer,
  cellules            integer,
  eglises             integer,
  paroisses           integer,
  districts           integer,
  regionaux           integer,
  membres_bureau      integer,
  membres_finances    integer,
  bureaux_actifs      integer,
  entites_a_bureau    integer,
  recettes            numeric,
  depenses            numeric,
  solde_consolide     numeric,
  transferts_attente  integer,
  mouvements_attente  integer
)
language sql
stable
as $$
  with cible as (
    select e.id, e.path
    from entities e
    where e.id = p_entity
      and e.deleted_at is null
  ),
  perimetre as (
    select e.id, e.type
    from entities e, cible c
    where e.path <@ c.path
      and e.deleted_at is null
  ),
  -- RG-30 : la fenetre des nouveaux baptises est un REGLAGE, jamais une
  -- constante. La coder en dur ici rendrait le parametre decoratif (regle 21).
  reglage as (
    select coalesce(max(fenetre_nouveaux_baptises_jours), 15) as jours
    from organisation_settings
  ),
  gens as (
    select c.id, c.sexe, c.date_bapteme, c.cellule_id
    from croyants c
    where c.deleted_at is null
      and c.statut = 'ACTIF'
      and c.eglise_id in (select id from perimetre)
  ),
  -- Un membre de bureau est un croyant dont le mandat est EN COURS : un mandat
  -- clos appartient a l'historique (EF-BUR-08), pas a l'effectif du jour.
  mandats as (
    select distinct m.croyant_id, f.est_financiere
    from bureau_membres m
    join bureaux b on b.id = m.bureau_id
    join fonctions f on f.id = m.fonction_id
    where b.deleted_at is null
      and b.is_active
      and b.entity_id in (select id from perimetre)
      and m.date_fin is null
  ),
  argent as (
    select f.sens, f.montant, f.date_operation
    from finance_entries f
    where f.statut = 'VALIDE'
      and f.deleted_at is null
      and f.entity_id in (select id from perimetre)
  )
  select
    (select count(*) from gens)::integer,
    (select count(*) from gens where sexe = 'F')::integer,
    (select count(*) from gens where sexe = 'M')::integer,
    (select count(*) from gens, reglage
      where date_bapteme >= current_date - (reglage.jours || ' days')::interval)::integer,
    (select count(*) from gens where cellule_id is not null)::integer,

    (select count(*) from perimetre where type = 'CELLULE')::integer,
    (select count(*) from perimetre where type = 'EGLISE')::integer,
    (select count(*) from perimetre where type = 'PAROISSE')::integer,
    (select count(*) from perimetre where type = 'DISTRICT')::integer,
    (select count(*) from perimetre where type = 'REGIONAL')::integer,

    (select count(distinct croyant_id) from mandats)::integer,
    (select count(distinct croyant_id) from mandats where est_financiere)::integer,
    (select count(*) from bureaux b
      where b.deleted_at is null and b.is_active
        and b.entity_id in (select id from perimetre))::integer,
    -- EF-DSH-05 — le denominateur de la couverture : les entites qui DOIVENT
    -- avoir un bureau. Les cellules n'en ont pas.
    (select count(*) from perimetre where type <> 'CELLULE')::integer,

    -- Les FLUX sont bornes a la periode demandee.
    (select coalesce(sum(montant), 0) from argent
      where sens = 'RECETTE' and date_operation between p_debut and p_fin),
    (select coalesce(sum(montant), 0) from argent
      where sens = 'DEPENSE' and date_operation between p_debut and p_fin),
    /**
     * LE SOLDE, LUI, EST UN CUMUL DEPUIS TOUJOURS.
     *
     * C'est de la tresorerie : « de combien disposons-nous ? ». Le borner a la
     * periode donnerait le RESULTAT du mois, un nombre tout aussi plausible
     * mais qui repond a une autre question — et sur lequel quelqu'un
     * engagerait une depense.
     */
    (select coalesce(sum(case when sens = 'RECETTE' then montant else -montant end), 0)
      from argent),

    /**
     * Les transferts qui attendent une DECISION DE CE PERIMETRE.
     *
     * C'est l'eglise de DESTINATION qui approuve : compter ceux qui partent
     * ferait apparaitre chez l'expediteur un travail qui ne lui revient pas.
     */
    (select count(*) from transferts t
      where t.statut = 'DEMANDE'
        and t.to_eglise_id in (select id from perimetre))::integer,
    (select count(*) from finance_entries f
      where f.statut = 'SOUMIS'
        and f.deleted_at is null
        and f.entity_id in (select id from perimetre))::integer;
$$;

comment on function fn_tableau_de_bord is
  'EF-DSH-01 a 05 — les indicateurs d''un perimetre en UNE passe. '
  'SECURITY INVOKER : la RLS borne le resultat a la portee de l''appelant, '
  'l''ecran n''a aucun filtrage a refaire.';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0042')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0043_rapports.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0043 — Modeles et rapports generes
-- =============================================================================
-- Reference : EF-RAP-07 a 18, RG-26, RG-27 — conception dans `plan.md` §3.11.
--
-- DEUX TABLES, ET LA SECONDE NE DEPEND PAS DE LA PREMIERE.
--
-- `report_templates` decrit COMMENT composer ; `report_instances` conserve CE
-- QUI A ETE PRODUIT. Un rapport genere porte donc une COPIE de la structure du
-- modele (`template_snapshot`) en plus de ses donnees : modifier un modele —
-- ou l'archiver — ne doit rien changer a ce qui a deja ete diffuse. C'est la
-- meme raison qui fait garder `on delete set null` sur `template_id` : le
-- rapport survit a la disparition de son modele.
--
-- RG-27 — UN RAPPORT GENERE EST FIGE. Ses donnees sont capturees a l'instant de
-- la generation et ne sont plus recalculees. C'est ce que porte `contenu`, et
-- c'est la seule facon qu'un chiffre diffuse en conseil reste celui qu'on
-- retrouve trois mois plus tard. Un rapport qui se recalculerait a chaque
-- ouverture ne serait pas un rapport, mais un ecran.
--
-- RG-26 — LES BLOCS NON HABILITES SONT OMIS, et l'omission se TRACE
-- (`blocs_omis`). Le pied de page la mentionne : un rapport plus court sans que
-- rien ne le dise se lit comme un rapport complet, et c'est ainsi qu'on conclut
-- d'une absence de finances qu'il n'y a pas eu de mouvement.
--
-- REJOUABLE (regle 23).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Les modeles
-- -----------------------------------------------------------------------------

create table if not exists report_templates (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  description text,

  /**
   * L'entite PROPRIETAIRE. `null` designe le Siege — EF-RAP-08 : les modeles
   * officiels n'appartiennent a aucune entite en particulier, ils sont mis a
   * disposition de toutes.
   */
  entity_id   uuid references entities (id) on delete cascade,

  -- EF-RAP-10 : un modele « Synthese de district » ne se propose qu'aux districts.
  niveaux_applicables entity_type[] not null
    default '{SIEGE,REGIONAL,DISTRICT,PAROISSE,EGLISE}',

  /**
   * EF-RAP-09 — jusqu'ou le modele se voit.
   *
   *   PRIVE       : son auteur seul ;
   *   ENTITE      : les comptes de l'entite proprietaire ;
   *   DESCENDANTS : elle et tout son sous-arbre ;
   *   GLOBAL      : toute l'organisation.
   */
  visibilite   visibilite_modele not null default 'ENTITE',

  -- EF-RAP-08 : pose par le Siege, utilisable sans modification, duplicable.
  est_officiel boolean not null default false,

  -- La composition : sections et blocs (cf. `lib/domain/rapport.ts`).
  structure    jsonb not null default '{"sections":[]}'::jsonb,

  -- EF-RAP-11 : versionnement et archivage.
  version      integer not null default 1,
  archived_at  timestamptz,

  created_by   uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint report_templates_nom_check check (length(trim(nom)) >= 3),
  -- Un modele officiel appartient au Siege, donc a aucune entite : les deux
  -- ensemble donneraient un modele « officiel mais reserve a une paroisse ».
  constraint report_templates_officiel_check
    check (not est_officiel or entity_id is null)
);

create index if not exists report_templates_entity_idx
  on report_templates (entity_id)
  where archived_at is null;

create index if not exists report_templates_officiel_idx
  on report_templates (est_officiel)
  where est_officiel and archived_at is null;

comment on table report_templates is
  'EF-RAP-07 a 11 — composition reutilisable d''un rapport.';


-- -----------------------------------------------------------------------------
-- Les rapports generes
-- -----------------------------------------------------------------------------

create table if not exists report_instances (
  id uuid primary key default gen_random_uuid(),

  -- `set null` : le rapport SURVIT a la disparition de son modele. Ce qui a ete
  -- diffuse ne peut pas s'effacer parce qu'on a fait le menage dans les modeles.
  template_id       uuid references report_templates (id) on delete set null,
  -- RG-27 — la structure du modele AU MOMENT de la generation.
  template_snapshot jsonb not null,

  nom               text not null,
  entity_id         uuid not null references entities (id) on delete restrict,
  periode_debut     date not null,
  periode_fin       date not null,
  parametres        jsonb not null default '{}'::jsonb,

  -- RG-27 — les donnees FIGEES. Rien ne les recalcule.
  contenu           jsonb not null default '{}'::jsonb,
  -- RG-26 — les blocs ecartes faute d'habilitation, et leur motif.
  blocs_omis        jsonb not null default '[]'::jsonb,

  -- ENF-POR-03 — cle d'objet RELATIVE, jamais une URL signee (regle 11).
  pdf_key           text,

  statut            statut_rapport not null default 'GENERE',
  genere_par        uuid references profiles (id) on delete set null,
  genere_le         timestamptz not null default now(),
  publie_le         timestamptz,

  -- Regle 26 : une contrainte interdit l'IMPOSSIBLE, pas l'inhabituel. Un
  -- rapport sur une seule journee est bref, pas faux.
  constraint report_periode check (periode_fin >= periode_debut)
);

create index if not exists report_instances_entity_idx
  on report_instances (entity_id, genere_le desc);

create index if not exists report_instances_template_idx
  on report_instances (template_id, genere_le desc);

comment on table report_instances is
  'EF-RAP-12 a 18 — rapport genere. RG-27 : `contenu` est fige a la generation.';


-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table report_templates  enable row level security;
alter table report_instances  enable row level security;

/**
 * LECTURE D'UN MODELE — EF-RAP-08, EF-RAP-09.
 *
 * Quatre chemins, du plus large au plus etroit. `GLOBAL` et les modeles
 * officiels sont lisibles par tous : c'est ce qui permet au Siege de mettre une
 * trame a disposition sans la copier vingt fois.
 *
 * `DESCENDANTS` se lit dans le sens de la HIERARCHIE : un modele de district
 * sert ses eglises. L'inverse n'aurait pas de sens — une eglise ne compose pas
 * pour son district.
 */
drop policy if exists report_templates_select on report_templates;
create policy report_templates_select on report_templates
  for select to authenticated
  using (
    est_officiel
    or visibilite = 'GLOBAL'
    or created_by = current_profile_id()
    or (visibilite = 'ENTITE' and entity_id is not null and entity_in_scope(entity_id))
    or (
      visibilite = 'DESCENDANTS'
      and entity_id is not null
      and exists (
        select 1
        from entities proprietaire
        where proprietaire.id = entity_id
          -- `current_scope_path()` est le chemin de MON entite de rattachement.
          -- `<@` lit « est descendant de, ou egal a » : je vois le modele si je
          -- suis sous son proprietaire.
          and current_scope_path() <@ proprietaire.path
      )
    )
  );

/**
 * ECRITURE D'UN MODELE — `report.template.manage`, AVEC SA PORTEE (RG-25).
 *
 * Un modele OFFICIEL n'a pas d'entite : sa portee est celle du Siege, et lui
 * seul peut donc le poser. C'est exactement ce que dit EF-RAP-08.
 */
drop policy if exists report_templates_write on report_templates;
create policy report_templates_write on report_templates
  for all to authenticated
  using (
    case
      when entity_id is null then can('report.template.manage', siege_id())
      else can('report.template.manage', entity_id)
    end
  )
  with check (
    case
      when entity_id is null then can('report.template.manage', siege_id())
      else can('report.template.manage', entity_id)
    end
  );

/**
 * LECTURE D'UN RAPPORT — RG-26 par la RLS elle-meme.
 *
 * Le perimetre borne ce qu'on voit ; `report.read` decide si l'on voit quelque
 * chose. Un rapport PUBLIE (EF-RAP-18) se lit dans son perimetre sans autre
 * condition — c'est ce que publier veut dire.
 */
drop policy if exists report_instances_select on report_instances;
create policy report_instances_select on report_instances
  for select to authenticated
  using (
    entity_in_scope(entity_id)
    and (statut = 'PUBLIE' or can('report.read', entity_id))
  );

drop policy if exists report_instances_write on report_instances;
create policy report_instances_write on report_instances
  for all to authenticated
  using (can('report.create', entity_id))
  with check (can('report.create', entity_id));

/**
 * PUBLIER EST UN DROIT A PART (EF-RAP-18).
 *
 * `report.publish` ne se confond pas avec `report.create` : composer un rapport
 * pour soi et le rendre lisible par tout un perimetre ne sont pas le meme geste.
 * Le trigger le verifie, parce qu'une politique RLS ne sait pas comparer
 * l'ancien statut au nouveau.
 */
create or replace function fn_rapport_before_update() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.statut = 'PUBLIE' and old.statut is distinct from 'PUBLIE' then
    if not can('report.publish', new.entity_id) then
      raise exception 'EF-RAP-18 : vous n''avez pas le droit de publier un rapport pour cette entite.'
        using errcode = 'insufficient_privilege';
    end if;
    new.publie_le := now();
  end if;

  /**
   * RG-27 — UN RAPPORT GENERE EST FIGE.
   *
   * Ni ses donnees, ni la structure qui les a produites, ni sa periode ne
   * changent apres coup. Sans ce verrou, « corriger » un rapport diffuse
   * reecrirait l'histoire sans laisser de trace — et deux personnes citant le
   * meme rapport ne parleraient plus du meme document.
   */
  if (new.contenu, new.template_snapshot, new.periode_debut, new.periode_fin, new.entity_id)
     is distinct from
     (old.contenu, old.template_snapshot, old.periode_debut, old.periode_fin, old.entity_id)
  then
    raise exception
      'RG-27 : un rapport genere est fige ; regenerez-en un nouveau plutot que de le modifier.';
  end if;

  return new;
end $$;

drop trigger if exists trg_rapport_bu on report_instances;
create trigger trg_rapport_bu
  before update on report_instances
  for each row execute function fn_rapport_before_update();

-- `updated_at` d'un modele : il change, lui — c'est tout l'objet d'un modele.
create or replace function fn_report_template_bu() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  -- EF-RAP-11 — toute modification de la STRUCTURE incremente la version. Le
  -- renommer n'en est pas une : la version dit ce que le modele PRODUIT.
  if new.structure is distinct from old.structure then
    new.version := old.version + 1;
  end if;
  return new;
end $$;

drop trigger if exists trg_report_template_bu on report_templates;
create trigger trg_report_template_bu
  before update on report_templates
  for each row execute function fn_report_template_bu();

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0043')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0044_fuseau_antananarivo.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0044 — Le fuseau par defaut passe a Indian/Antananarivo
-- =============================================================================
-- Reference : EF-ADM-11 — le fuseau horaire est un parametre d'organisation.
--
-- POURQUOI CE CHANGEMENT. `Africa/Porto-Novo` (UTC+1) etait le defaut herite du
-- gabarit initial. L'organisation est a Madagascar : `Indian/Antananarivo`
-- (UTC+3). Deux heures d'ecart ne se voient pas sur un horodatage lu de loin,
-- mais elles decalent d'un JOUR tout ce qui est saisi apres 21 h — une collecte
-- du dimanche soir tombait au lundi.
--
-- DEUX ECRITURES, ET LA SECONDE EST LA VRAIE.
--
-- Changer le DEFAUT de la colonne ne touche que les lignes a venir, et cette
-- table n'en compte qu'une, posee au tout premier deploiement : sans la mise a
-- jour, le nouveau defaut n'aurait jamais servi a rien.
--
-- LA MISE A JOUR EST BORNEE A L'ANCIENNE VALEUR. Si quelqu'un a deja choisi un
-- fuseau depuis l'ecran des parametres, ce n'est pas a une migration de le
-- defaire : elle corrige un defaut, elle n'impose pas un reglage.
--
-- REJOUABLE (regle 23) : les deux instructions sont idempotentes, et la seconde
-- ne trouve plus rien a mettre a jour au second passage.
-- =============================================================================

alter table organisation_settings
  alter column fuseau_horaire set default 'Indian/Antananarivo';

update organisation_settings
   set fuseau_horaire = 'Indian/Antananarivo',
       updated_at     = now()
 where fuseau_horaire = 'Africa/Porto-Novo';

comment on column organisation_settings.fuseau_horaire is
  'EF-ADM-11 — fuseau de l''organisation. Defaut Indian/Antananarivo (UTC+3) '
  'depuis 0044 : les dates METIER restent des colonnes `date` sans fuseau, ce '
  'reglage ne sert qu''a l''affichage des horodatages.';

insert into schema_migrations (version) values ('0044')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0045_rapports_composition.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0045 — La composition de modeles s'ouvre ou se ferme, depuis le Siege
-- =============================================================================
-- Reference : EF-RAP-07, EF-RAP-08, EF-ADM-11.
--
-- CE QUE CE REGLAGE DECIDE
--
-- Le Siege pose des modeles OFFICIELS, que toute entite voit et qu'aucune autre
-- ne modifie (migration 0043). Reste une question qu'aucune colonne ne
-- tranchait : une entite a-t-elle le droit de composer LES SIENS a cote ?
--
--   ouvert (defaut) : elle emploie ceux du Siege ET dessine les siens ;
--   ferme           : elle se conforme aux modeles du Siege, et a eux seuls.
--
-- UN REGLAGE D'ORGANISATION, PAS UNE HABILITATION. `report.template.manage`
-- repond deja a « qui compose, et pour quelle entite » (RG-25). La question
-- posee ici est autre : « l'organisation autorise-t-elle qu'on compose
-- ailleurs qu'au Siege ? ». Elle vaut pour TOUTES les entites a la fois, se
-- regle en un endroit, et `settings.manage` — non delegable — la garde. La
-- porter par les habilitations obligerait a retirer un droit a cinquante
-- comptes pour repondre une fois.
--
-- LE SIEGE N'EST JAMAIS CONCERNE par son propre verrou : ferme, il ne pourrait
-- plus poser la trame a laquelle les autres doivent se conformer, et le
-- reglage se retournerait contre ce qu'il sert.
--
-- LE DEFAUT EST `true` — l'etat en vigueur avant cette migration. Une migration
-- corrige un defaut, elle n'impose pas un reglage : fermer la composition est
-- une decision, elle se prend a l'ecran.
--
-- REJOUABLE (regle 23) : `add column if not exists`.
-- =============================================================================

alter table organisation_settings
  add column if not exists rapport_composition_libre boolean not null default true;

comment on column organisation_settings.rapport_composition_libre is
  'EF-RAP-07 — les entites autres que le Siege peuvent-elles composer leurs '
  'propres modeles de rapport ? `false` : elles se conforment aux modeles '
  'officiels. Le Siege compose toujours, quel que soit ce reglage.';

/**
 * PostgREST garde un CACHE DE SCHEMA.
 *
 * Une colonne ajoutee sans cette purge reste invisible a l'API : la lecture des
 * parametres repondrait « column ... does not exist » sur du SQL pourtant en
 * place. Le piege a deja coute deux fois — les dimes (0034) et la synthese.
 */
notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0045')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0046_reinitialisation_et_mot_de_passe_provisoire.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0046 — Reinitialisation du mot de passe, et mot de passe provisoire
-- =============================================================================
-- Reference : EF-AUT-02, EF-ADM-01, EF-ADM-08, EF-ADM-11, EF-ADM-13.
--
-- DEUX COLONNES, ET ELLES REPONDENT A DEUX QUESTIONS DIFFERENTES.
--
-- 1. `organisation_settings.reinitialisation_par_email` — PAR QUEL CIRCUIT un
--    utilisateur qui a oublie son mot de passe en obtient un nouveau :
--
--      actif    : il demande lui-meme, un lien lui parvient par courriel ;
--      inactif  : il contacte le Siege ou l'administrateur de son entite, qui
--                 lui remet un mot de passe provisoire de la main a la main.
--
--    CE N'EST PAS UN DETAIL DE CONFORT. Les comptes se creent sans invitation
--    par courriel : beaucoup d'adresses sont de convenance — saisies une fois,
--    jamais relevees. Un circuit par courriel qui aboutit dans une boite que
--    personne n'ouvre ne reinitialise rien, et l'utilisateur reste dehors sans
--    comprendre pourquoi. Fermer le circuit est alors plus HONNETE que de le
--    laisser ouvert.
--
--    Le defaut est `true` : c'est le comportement en vigueur avant cette
--    migration, et une migration corrige un defaut, elle n'impose pas un
--    reglage.
--
-- 2. `profiles.doit_changer_mot_de_passe` — UN MOT DE PASSE PROVISOIRE EST
--    PROVISOIRE.
--
--    Qu'il arrive par courriel ou de la main de l'administrateur, un mot de
--    passe que QUELQU'UN D'AUTRE connait n'est pas un mot de passe : il a ete
--    dicte au telephone, ecrit sur un papier, peut-etre relu par un tiers. Tant
--    que l'utilisateur ne l'a pas remplace, le compte est partage sans que
--    personne ne l'ait voulu.
--
--    Le drapeau est pose a la creation du compte et a chaque reinitialisation
--    administrative ; il tombe quand l'utilisateur choisit le sien. L'ecran
--    l'y conduit avant toute autre chose.
--
--    Il vaut `false` pour les comptes EXISTANTS : ils ont deja choisi leur mot
--    de passe. Le poser a `true` les enverrait tous changer un mot de passe que
--    personne ne leur a communique.
--
-- REJOUABLE (regle 23) : `add column if not exists`.
-- =============================================================================

alter table organisation_settings
  add column if not exists reinitialisation_par_email boolean not null default true;

comment on column organisation_settings.reinitialisation_par_email is
  'EF-AUT-02 — `true` : l''utilisateur demande lui-meme un lien par courriel. '
  '`false` : il contacte le Siege ou l''administrateur de son entite, qui lui '
  'remet un mot de passe provisoire.';

alter table profiles
  add column if not exists doit_changer_mot_de_passe boolean not null default false;

comment on column profiles.doit_changer_mot_de_passe is
  'EF-ADM-01, EF-ADM-08 — un mot de passe provisoire est provisoire : pose a la '
  'creation du compte et a chaque reinitialisation administrative, il tombe '
  'quand l''utilisateur choisit le sien.';

/**
 * PostgREST garde un CACHE DE SCHEMA.
 *
 * Deux colonnes ajoutees sans cette purge restent invisibles a l'API : la
 * lecture des parametres et celle du profil repondraient « column ... does not
 * exist » sur du SQL pourtant en place. Le piege a deja coute deux fois.
 */
notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0046')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0047_responsable_informatique_et_email.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0047 — Responsable informatique, et preparation du courriel
-- =============================================================================
-- Reference : EF-ADM-01, EF-ADM-11, EF-ADM-13, EF-AUT-02.
--
-- TROIS OBJETS, POUR TROIS DEMANDES DISTINCTES.
--
-- 1. `profiles.est_responsable_informatique` — L'EXCEPTION A LA REGLE DES
--    BUREAUX.
--
--    « Seuls les membres de bureaux ont un compte » ferme une porte utile : le
--    jour ou un bureau est renouvele, plus personne n'a le droit d'ouvrir les
--    comptes des nouveaux elus, puisque les anciens ont perdu leur mandat. La
--    regle se mordrait la queue.
--
--    Le responsable informatique est designe HORS des bureaux, par le Siege, et
--    son compte survit aux renouvellements. Il ne siege pas, il ne vote pas —
--    il ouvre des comptes. C'est un role technique, et c'est exactement pour
--    cela qu'il ne doit pas dependre d'un mandat.
--
--    UN SEUL PAR ENTITE, et c'est voulu : deux personnes qui ouvrent les
--    comptes d'une meme entite, sans se coordonner, produisent des doublons que
--    la connexion par matricule ne saurait pas departager.
--
-- 2. `email_settings` — LA CONFIGURATION SMTP, PREPAREE ET NON BRANCHEE.
--
--    Rien n'envoie encore de courriel. Cette table existe pour que la
--    configuration soit SAISIE et VALIDEE avant qu'un envoi ne depende d'elle :
--    decouvrir un port faux le jour ou l'on active les notifications, c'est
--    decouvrir que personne n'a rien recu.
--
--    LE MOT DE PASSE N'EST PAS ICI, et c'est le point le plus important de
--    cette migration. `organisation_settings` est lisible par TOUT COMPTE
--    AUTHENTIFIE — l'application en depend partout. Y poser un secret SMTP le
--    donnerait a chaque utilisateur. Cette table-ci a donc sa propre RLS,
--    bornee a `settings.manage`, et le mot de passe reste malgre tout HORS
--    BASE : il se pose dans la variable d'environnement `SMTP_PASSWORD`. Un
--    secret qui vit dans une table finit dans une sauvegarde, dans un export,
--    dans un journal de requetes.
--
-- 3. `email_templates` — LES MODELES DE MESSAGE.
--
--    Ils portent un SUJET et un CORPS par cle fonctionnelle. Lisibles par
--    `settings.manage` seulement : un modele contient souvent des tournures
--    internes qu'on ne diffuse pas.
--
-- REJOUABLE (regle 23).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Le responsable informatique
-- -----------------------------------------------------------------------------

alter table profiles
  add column if not exists est_responsable_informatique boolean not null default false;

comment on column profiles.est_responsable_informatique is
  'EF-ADM-01 — designe HORS des bureaux par le Siege : il ouvre les comptes des '
  'nouveaux elus, et son acces survit aux renouvellements de mandat.';

/**
 * UN SEUL RESPONSABLE PAR ENTITE.
 *
 * Un index unique PARTIEL : il ne contraint que les lignes concernees, et
 * laisse les autres comptes libres. Deux responsables sur une meme entite
 * produiraient des comptes en double que la connexion par matricule ne saurait
 * pas departager.
 */
create unique index if not exists profiles_responsable_informatique_unique
  on profiles (entity_id)
  where est_responsable_informatique;


-- -----------------------------------------------------------------------------
-- 2. La configuration SMTP
-- -----------------------------------------------------------------------------

create table if not exists email_settings (
  -- Une seule ligne, comme `organisation_settings` : la contrainte le dit.
  id smallint primary key default 1 check (id = 1),

  actif       boolean not null default false,
  hote        text,
  port        integer default 587 check (port is null or (port > 0 and port < 65536)),
  -- `STARTTLS` sur 587, `TLS` sur 465, `AUCUNE` en reseau interne.
  securite    text not null default 'STARTTLS'
                check (securite in ('AUCUNE', 'STARTTLS', 'TLS')),
  utilisateur text,

  -- Ce que le destinataire lira dans « De : ».
  expediteur_nom   text,
  expediteur_email text,

  updated_at timestamptz not null default now()
);

comment on table email_settings is
  'EF-ADM-13 — configuration SMTP. LE MOT DE PASSE N''Y FIGURE PAS : il vit '
  'dans la variable d''environnement SMTP_PASSWORD. Un secret en base finit '
  'dans une sauvegarde, un export ou un journal de requetes.';

insert into email_settings (id) values (1) on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 3. Les modeles de message
-- -----------------------------------------------------------------------------

create table if not exists email_templates (
  cle         text primary key,
  libelle     text not null,
  description text,
  sujet       text not null,
  corps       text not null,
  actif       boolean not null default true,
  updated_at  timestamptz not null default now()
);

comment on table email_templates is
  'EF-ADM-13 — sujet et corps par cle fonctionnelle. Les champs dynamiques '
  's''ecrivent {{entre_doubles_accolades}} et sont remplaces a l''envoi.';

/**
 * Les trois modeles que l'application saura employer le jour ou l'envoi sera
 * branche. Poses ici pour que la configuration soit RELUE et corrigee avant
 * cela — un modele decouvert le jour du premier envoi part tel quel.
 *
 * `on conflict do nothing` : une migration rejouee ne doit pas ecraser un
 * modele que quelqu'un a reecrit.
 */
insert into email_templates (cle, libelle, description, sujet, corps) values
  (
    'REINITIALISATION',
    'Reinitialisation du mot de passe',
    'Envoye lorsque la reinitialisation par courriel est active et que l''utilisateur en fait la demande.',
    'Reinitialisation de votre mot de passe — {{organisation}}',
    E'Bonjour {{nom}},\n\nVous avez demande a reinitialiser votre mot de passe.\nSuivez ce lien pour en choisir un nouveau :\n\n{{lien}}\n\nSi vous n''etes pas a l''origine de cette demande, ignorez ce message.\n\n{{organisation}}'
  ),
  (
    'OUVERTURE_COMPTE',
    'Ouverture d''un compte',
    'Envoye a l''ouverture d''un compte, lorsque l''adresse est une vraie boite aux lettres.',
    'Votre compte {{organisation}} est ouvert',
    E'Bonjour {{nom}},\n\nUn compte vous a ete ouvert sur {{organisation}}.\n\nIdentifiant : {{identifiant}}\nMot de passe provisoire : {{mot_de_passe}}\n\nIl vous sera demande de le changer a la premiere connexion.\n\n{{organisation}}'
  ),
  (
    'RAPPORT_PUBLIE',
    'Publication d''un rapport',
    'Envoye aux comptes du perimetre lorsqu''un rapport y est publie (EF-RAP-18).',
    '{{titre}} — {{entite}}',
    E'Bonjour,\n\nUn rapport vient d''etre publie pour {{entite}} :\n\n{{titre}}\nPeriode : {{periode}}\n\nOuvrez-le depuis l''application.\n\n{{organisation}}'
  )
on conflict (cle) do nothing;


-- -----------------------------------------------------------------------------
-- RLS — les deux tables sont RESERVEES a `settings.manage`
-- -----------------------------------------------------------------------------

alter table email_settings  enable row level security;
alter table email_templates enable row level security;

/**
 * CONTRAIREMENT A `organisation_settings`, CES DEUX TABLES NE SE LISENT PAS
 * LIBREMENT.
 *
 * La devise ou le fuseau sont lus par chaque ecran ; un hote SMTP et un nom
 * d'utilisateur ne servent a personne d'autre qu'a l'administration, et
 * decrivent l'infrastructure. `settings.manage` est non delegable : la
 * configuration reste au Siege.
 */
drop policy if exists email_settings_all on email_settings;
create policy email_settings_all on email_settings
  for all to authenticated
  using (has_perm('settings.manage'))
  with check (has_perm('settings.manage'));

drop policy if exists email_templates_all on email_templates;
create policy email_templates_all on email_templates
  for all to authenticated
  using (has_perm('settings.manage'))
  with check (has_perm('settings.manage'));


-- `updated_at` sur les deux tables.
create or replace function fn_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_email_settings_bu on email_settings;
create trigger trg_email_settings_bu
  before update on email_settings
  for each row execute function fn_touch_updated_at();

drop trigger if exists trg_email_templates_bu on email_templates;
create trigger trg_email_templates_bu
  before update on email_templates
  for each row execute function fn_touch_updated_at();


/**
 * PostgREST garde un CACHE DE SCHEMA. Deux tables et une colonne ajoutees sans
 * cette purge restent invisibles a l'API : elle repondrait « relation
 * inconnue » sur du SQL pourtant en place. Le piege a deja coute deux fois.
 */
notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0047')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0048_grades_celebrants.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0048 — Les grades habilites a celebrer un bapteme
-- =============================================================================
-- Reference : EF-ADM-14, EF-BAP-03.
--
-- CE QUE CETTE MIGRATION CORRIGE.
--
-- La liste des grades pouvant celebrer un bapteme etait ECRITE EN DUR dans
-- `lib/data/baptemes.ts` — `CODES_GRADE_CELEBRANT = ['PASTEUR', 'DIACRE',
-- 'EVANGELISTE']`. Le referentiel des grades, lui, s'enrichit librement depuis
-- le lot 1.
--
-- La consequence se voit mal et se comprend tard : un grade cree apres coup ne
-- pourra JAMAIS celebrer, quoi qu'on fasse a l'ecran. L'administrateur ajoute
-- « Ancien », le retrouve partout ailleurs, et cherche pendant une heure
-- pourquoi il n'apparait pas dans la liste des celebrants. Rien ne refuse, rien
-- ne s'affiche : la liste est simplement plus courte.
--
-- C'est la limite que `plan.md` nommait deja au lot 7 : « le referentiel Grade
-- s'enrichit librement, mais un grade nouvellement cree ne pourra jamais
-- celebrer tant que la liste reste dans le code ».
--
-- LE DEFAUT EST `false`, ET LA REPRISE EST EXPLICITE.
--
-- Un defaut a `true` aurait ouvert la celebration a TOUS les grades — croyants
-- compris — le temps que quelqu'un s'en apercoive. On pose donc `false` partout,
-- puis on retablit nommement les trois codes qui etaient dans le code : l'etat
-- apres migration est exactement celui d'avant, et tout elargissement devient
-- une decision prise a l'ecran.
--
-- REJOUABLE (regle 23) : `add column if not exists`, et la mise a jour est
-- bornee aux trois codes — au second passage elle ne trouve rien de plus.
-- =============================================================================

alter table grades
  add column if not exists peut_celebrer boolean not null default false;

comment on column grades.peut_celebrer is
  'EF-ADM-14 — ce grade autorise-t-il a celebrer un bapteme ? Remplace la liste '
  'ecrite en dur dans le code, qui empechait tout grade cree apres coup de '
  'celebrer.';

/**
 * La reprise : les trois codes qui figuraient dans `CODES_GRADE_CELEBRANT`.
 *
 * Bornee a `peut_celebrer = false` pour rester rejouable ET pour ne jamais
 * defaire un choix fait a l'ecran : si quelqu'un a retire « Diacre » depuis,
 * une migration rejouee ne doit pas le remettre.
 */
update grades
   set peut_celebrer = true
 where code in ('PASTEUR', 'DIACRE', 'EVANGELISTE')
   and peut_celebrer = false;

/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, la colonne reste
 * invisible a l'API et la lecture des celebrants repondrait « column ... does
 * not exist » sur du SQL pourtant en place.
 */
notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0048')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0049_remise_dime_sur_mouvement_valide.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0049 — Rattacher un bordereau n'est pas modifier le mouvement
-- =============================================================================
-- Reference : RG-17 (un mouvement valide est immuable), EF-FIN-30 (la remise
--             physique est ce que constate la validation).
--
-- CE QUI N'ALLAIT PAS, ET POURQUOI PERSONNE NE POUVAIT LE VOIR EN LISANT LE SQL
--
-- `fn_remettre_collectes` rattache les collectes au bordereau en DEUX passes :
-- celles qui restent a valider, puis celles qui sont DEJA validees — ces
-- dernieres sans toucher au statut, precisement pour ne pas heurter RG-17.
--
-- Le commentaire de la migration 0038 disait : « RG-17 refuse toute ecriture
-- sur un mouvement valide, les inclure ci-dessus ferait echouer le bordereau
-- entier ». C'etait juste. Mais la seconde passe est une ECRITURE elle aussi, et
-- le garde-fou de `fn_finance_before_write` ne regarde PAS ce qui a change :
--
--     if old.statut = 'VALIDE' then
--       if not (new.statut = 'ANNULE' and ...) then raise ...
--
-- Il se declenche donc sur TOUT `update` d'une ligne validee, y compris celui
-- qui ne pose qu'un `dime_remise_id`. Separer les deux passes ne changeait rien :
-- la seconde etait vouee a echouer a coup sur, et avec elle la remise entiere.
--
-- Symptome constate le 19 aout 2026 : remise du District Avaradrano, 512 000 MGA,
-- refusee avec « RG-17 : un mouvement valide est immuable ». Aucune collecte
-- anterieure a 0038 ne pouvait donc etre portee au Siege.
--
-- CE QUE RG-17 PROTEGE VRAIMENT
--
-- RG-17 defend les DONNEES d'un mouvement : son montant, sa categorie, son
-- entite, sa date, son sens, son statut. Le bordereau de remise n'en fait pas
-- partie — c'est la trace d'un geste POSTERIEUR, la remise en mains propres au
-- Siege. L'enregistrer ne reecrit pas l'histoire, il la complete.
--
-- Le seul changement tolere est donc le passage de `dime_remise_id` de NULL a
-- une valeur, et rien d'autre dans la meme ecriture. Le REMPLACEMENT d'un
-- bordereau par un autre reste refuse : il ferait compter la meme collecte sur
-- deux bordereaux.
--
-- REJOUABLE (regle 23) : `create or replace` sur une fonction `returns trigger`
-- dont le type de retour ne change pas.
-- =============================================================================

create or replace function fn_finance_before_write() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow_actif boolean;
  v_rattache_bordereau boolean;
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
     * date, ni par un changement d'entite.
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

    /**
     * EF-FIN-30 — LE RATTACHEMENT A UN BORDEREAU DE REMISE.
     *
     * Vrai quand l'ecriture ne fait QUE poser `dime_remise_id` sur une collecte
     * qui n'en avait pas : le statut, le montant, la categorie, l'entite, la
     * date et le sens restent identiques. C'est la trace d'un geste posterieur
     * — la remise en mains propres —, pas une reecriture du mouvement.
     *
     * Le remplacement d'un bordereau par un autre n'entre PAS dans ce cas :
     * `old.dime_remise_id is null` l'exige. Une collecte ne se remet qu'une
     * fois, sans quoi le meme argent figurerait sur deux bordereaux.
     */
    v_rattache_bordereau :=
      old.dime_remise_id is null
      and new.dime_remise_id is not null
      and (new.statut, new.montant, new.categorie_id, new.entity_id,
           new.date_operation, new.sens)
          is not distinct from
          (old.statut, old.montant, old.categorie_id, old.entity_id,
           old.date_operation, old.sens);

    -- RG-17 : un mouvement valide est immuable, sauf annulation motivee.
    if old.statut = 'VALIDE' and not v_rattache_bordereau then
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

comment on function fn_finance_before_write is
  'RG-13, RG-16, RG-17, EF-FIN-26, EF-FIN-30. Depuis 0049 : poser un '
  'dime_remise_id sur une collecte validee est autorise — c''est la trace de la '
  'remise physique, pas une modification du mouvement.';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0049')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0050_portee_propre_des_droits.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0050 — La portee est une propriete du DROIT
-- =============================================================================
-- Reference : RG-25, precise le 19 aout 2026.
--
-- LE CAS QUI A TRANCHE
--
-- Un administrateur de district a qui l'on accorde `finance.validate` validait,
-- de ce fait, les mouvements de ses paroisses et de ses eglises : `has_perm`
-- teste une INCLUSION DE CHEMIN, donc toute la descendance.
--
-- Or le lot 4 a pose l'inverse en doctrine : « chaque entite a son bureau et
-- chaque bureau gere ses finances ; la hierarchie ne fait que les CONSULTER ».
-- Le controle de droit ne l'avait jamais suivie.
--
-- CE QUI CHANGE, ET CE QUI NE CHANGE PAS
--
-- Certains actes portent naturellement sur la descendance : creer une eglise,
-- enregistrer un croyant, consulter des finances. Un district structure ses
-- paroisses — si son administrateur ne le pouvait pas, personne ne le ferait.
--
-- D'autres ne concernent QUE l'entite : valider ses ecritures, arreter ses
-- comptes, composer son bureau, ouvrir des comptes et distribuer des
-- habilitations. Ceux-la sont declares `PROPRE`.
--
-- La portee est donc une propriete du DROIT, pas de l'habilitation : ce n'est
-- pas a l'administrateur de decider si « valider une finance » descend.
--
-- ALIGNEMENT AVEC LE DOMAINE — `fn_permissions_portee_propre()` DOIT rester
-- identique aux droits marques `portee: 'PROPRE'` dans
-- `lib/domain/permissions.ts`. Un test lit ce fichier et compare les deux
-- listes : une regle ecrite a deux endroits ne diverge jamais le jour ou on
-- l'ecrit, elle diverge six mois plus tard.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

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
    'permission.delegate'
  ]::text[]
$$;

comment on function fn_permissions_portee_propre is
  'RG-25 — droits qui valent pour l''entite SEULE, jamais pour sa descendance. '
  'DOIT rester aligne sur les droits marques portee PROPRE dans '
  'lib/domain/permissions.ts — verrouille par tests/unit/permissions.test.ts.';


-- -----------------------------------------------------------------------------
-- Le controle de reference
-- -----------------------------------------------------------------------------
--
-- `p_entity_id is null` reste la DETENTION SEULE, sans portee : c'est ce qui
-- sert a decider si un bouton s'affiche, avant de savoir sur quelle entite il
-- portera.
--
-- Quand une portee est demandee, deux lectures s'opposent :
--   - portee `null` sur l'octroi = « tout le perimetre du compte ». Pour un
--     droit PROPRE, cela se lit « mon entite de rattachement », et rien de plus.
--   - portee posee = l'entite designee. Pour un droit PROPRE, il faut l'EGALITE
--     du chemin ; pour les autres, l'inclusion, comme avant.

create or replace function has_perm(p_permission text, p_entity_id uuid default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select is_superadmin()
      or exists (
        select 1
          from user_permissions up
          left join entities se on se.id = up.scope_entity_id
         where up.user_id = current_profile_id()
           and up.permission = p_permission
           and (
                p_entity_id is null            -- detention seule
             or exists (
                  select 1
                    from entities e
                   where e.id = p_entity_id
                     and (
                       case
                         when p_permission = any (fn_permissions_portee_propre())
                           -- PROPRE : l'entite visee EST la portee accordee.
                           then e.path = coalesce(se.path, current_scope_path())
                         else
                           -- DESCENDANTE : elle est sous la portee accordee.
                           e.path <@ coalesce(se.path, current_scope_path())
                       end
                     )
                )
           )
      )
$$;

comment on function has_perm is
  'RG-24, RG-25 — le droit est-il detenu, et sa portee couvre-t-elle l''entite ? '
  'Depuis 0050, la portee suit la NATURE du droit : PROPRE (l''entite seule) ou '
  'DESCENDANTE (elle et son sous-arbre). Voir fn_permissions_portee_propre().';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0050')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0051_delegation_saisie_deleguee.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0051 — La saisie deleguee descend la hierarchie
-- =============================================================================
-- Reference : ARB-2, EF-STR-10, EF-FIN-05, RG-24, RG-25.
--
-- CE QUI COINCAIT
--
-- `finance.delegate` figurait parmi les droits NON DELEGABLES : seul le Siege
-- pouvait donc saisir pour une entite privee d'acces a l'application. Un
-- district dont trois eglises n'ont pas de connexion devait lui faire remonter
-- chaque recette — alors que la doctrine du lot 4 place les finances au plus
-- pres du bureau qui les tient.
--
-- CE QUI LE BORNE DESORMAIS
--
-- Non plus l'interdiction de deleguer, mais DEUX conditions cumulatives, toutes
-- deux verifiees :
--
--   1. LA PORTEE DE L'OCTROI (RG-25). Le Siege confie le droit a un district
--      pour sa branche : il ne saisira que chez lui. `finance.delegate` reste
--      a portee DESCENDANTE — c'est son objet meme que d'atteindre une autre
--      entite que la sienne.
--
--   2. `sans_acces_application` SUR L'ENTITE VISEE (ARB-2). Verifie a la saisie
--      depuis le 19 aout 2026 : avant, le drapeau ne decidait de rien, et
--      detenir le droit suffisait a signer une ecriture du nom de n'importe
--      quelle entite — y compris de celles qui saisissent tres bien les leurs.
--
-- Et l'ecriture reste marquee « saisie deleguee » avec le nom de son auteur
-- reel (EF-FIN-06) : elle se voit dans chaque liste et dans chaque rapport.
--
-- ALIGNEMENT — cette liste DOIT rester identique a `NON_DELEGABLES` dans
-- `lib/domain/permissions.ts` ; un test lit ce fichier et compare les deux.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

create or replace function fn_permissions_non_delegables() returns text[]
language sql immutable as $$
  select array[
    'entity.delete',
    -- Effacer l'histoire d'un bureau se decide au Siege, pas en cascade.
    'bureau.delete',
    'referentiel.manage',
    'settings.manage',
    -- EF-FIN-18 : la levee de la separation saisie/validation.
    'finance.validate_own',
    -- EF-FIN-26 : celui qui clot ne doit pas pouvoir s'accorder de quoi rouvrir.
    'finance.periode.reopen'
  ]::text[]
$$;

comment on function fn_permissions_non_delegables is
  'RG-24 : droits reserves au Siege, jamais delegables. DOIT rester aligne sur '
  'NON_DELEGABLES dans lib/domain/permissions.ts — verrouille par '
  'tests/unit/permissions.test.ts. Depuis 0051, finance.delegate n''y figure '
  'plus : il est borne par sa portee et par sans_acces_application.';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0051')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0052_saisie_deleguee_sans_workflow.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0052 — La saisie deleguee ne passe par aucun workflow
-- =============================================================================
-- Reference : ARB-2, EF-STR-10, EF-FIN-05, EF-FIN-06, RG-16, RG-25.
--
-- LA REGLE, POSEE PAR L'UTILISATEUR LE 19 AOUT 2026
--
--   · Entite SANS acces a l'application : son ascendant saisit pour elle, et
--     SANS workflow de validation. Tout lui est delegue.
--   · Entite AVEC acces : elle monte un bureau et saisit elle-meme ; le
--     workflow de validation reste reglable par son administrateur ou par le
--     Siege — ce qui est deja le cas depuis le lot 4.
--
-- CE N'EST PAS QU'UNE PREFERENCE : L'ALTERNATIVE EST UN BLOCAGE
--
-- Depuis 0050, `finance.validate` est a portee PROPRE — un district ne valide
-- pas les mouvements de ses eglises, il les consulte. Et une entite declaree
-- sans acces n'a, par definition, aucun compte pour se connecter.
--
-- Une ecriture deleguee qui naitrait SOUMIS n'aurait donc PERSONNE pour la
-- valider : ni l'entite, qui ne se connecte pas ; ni l'ascendant qui l'a
-- saisie, dont le droit ne descend plus jusqu'a elle. Elle resterait en attente
-- indefiniment, comptee nulle part — le solde de l'entite serait faux et rien
-- ne le signalerait. La validation immediate est le seul etat coherent.
--
-- CE QUE CELA NE RELACHE PAS
--
-- La saisie deleguee reste bornee par deux conditions cumulatives, verifiees
-- dans `saisirMouvement` : la portee de l'octroi de `finance.delegate`, et
-- `sans_acces_application` sur l'entite visee. On ne peut donc pas se servir de
-- cette regle pour contourner le workflow d'une entite qui, elle, se connecte :
-- la saisie deleguee lui est refusee tout court.
--
-- Et l'ecriture porte `est_delegue` avec le nom de son auteur reel
-- (EF-FIN-06) : elle se distingue dans chaque liste, chaque filtre et chaque
-- rapport. Une validation sans controle qui ne se verrait pas serait un trou ;
-- celle-ci est nommee.
--
-- LES DIMES NE SONT PAS CONCERNEES. Une collecte naît SOUMIS parce qu'elle
-- annonce sans encaisser, et c'est la remise par bordereau qui la valide
-- (EF-FIN-30). `fn_saisir_collecte_dime` n'ecrit jamais `est_delegue` — il
-- reste a son defaut `false` —, donc la branche ci-dessous ne la voit pas.
--
-- REJOUABLE (regle 23) : `create or replace` sur une fonction `returns trigger`
-- dont le type de retour ne change pas.
-- =============================================================================

create or replace function fn_finance_before_write() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow_actif boolean;
  v_rattache_bordereau boolean;
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

    /**
     * ARB-2 — LA SAISIE DELEGUEE NE PASSE PAR AUCUN WORKFLOW.
     *
     * L'entite visee ne se connecte pas : elle n'a personne pour soumettre ni
     * pour valider. Et depuis 0050 son ascendant ne le peut pas non plus a sa
     * place. Laisser le workflow s'appliquer condamnerait l'ecriture a rester
     * SOUMIS pour toujours.
     */
    if new.est_delegue then
      v_workflow_actif := false;
    end if;

    -- RG-16 : workflow inactif POUR CETTE ENTITE => validation immediate.
    if not v_workflow_actif and new.statut = 'BROUILLON' then
      new.statut := 'VALIDE';
      new.valide_le := now();
    end if;

  else
    /**
     * Rien ne SORT non plus d'une periode close — ni par un changement de
     * date, ni par un changement d'entite.
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

    /**
     * EF-FIN-30 — LE RATTACHEMENT A UN BORDEREAU DE REMISE.
     *
     * Vrai quand l'ecriture ne fait QUE poser `dime_remise_id` sur une collecte
     * qui n'en avait pas : le statut, le montant, la categorie, l'entite, la
     * date et le sens restent identiques. C'est la trace d'un geste posterieur
     * — la remise en mains propres —, pas une reecriture du mouvement.
     *
     * Le remplacement d'un bordereau par un autre n'entre PAS dans ce cas :
     * `old.dime_remise_id is null` l'exige. Une collecte ne se remet qu'une
     * fois, sans quoi le meme argent figurerait sur deux bordereaux.
     */
    v_rattache_bordereau :=
      old.dime_remise_id is null
      and new.dime_remise_id is not null
      and (new.statut, new.montant, new.categorie_id, new.entity_id,
           new.date_operation, new.sens)
          is not distinct from
          (old.statut, old.montant, old.categorie_id, old.entity_id,
           old.date_operation, old.sens);

    -- RG-17 : un mouvement valide est immuable, sauf annulation motivee.
    if old.statut = 'VALIDE' and not v_rattache_bordereau then
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

comment on function fn_finance_before_write is
  'RG-13, RG-16, RG-17, EF-FIN-26, EF-FIN-30. Depuis 0049 : poser un '
  'dime_remise_id sur une collecte validee est autorise. Depuis 0052 : une '
  'saisie deleguee ne passe par aucun workflow — l''entite visee ne se '
  'connecte pas, et depuis 0050 son ascendant ne valide pas a sa place.';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0052')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0053_chiffres_entite.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0053 — Les chiffres d'une entite, pour toute la structure en une passe
-- =============================================================================
-- Reference : EF-STR-06 (fiche d'entite), EF-DSH-02 (la RLS borne, l'ecran ne
--             refiltre pas), RG-20 (portee), regle 28 (le nombre d'allers-retours).
--
-- CE QU'ELLE REMPLACE
--
-- La fiche d'entite et le pop-up de l'organigramme annonçaient depuis le lot 1 :
-- « les effectifs, la composition du bureau et le solde apparaitront ici avec
-- les lots 2, 3 et 4 ». Ces lots sont livres. La promesse restait.
--
-- POURQUOI TOUT LE PERIMETRE, ET PAS UNE ENTITE
--
-- Le pop-up de l'organigramme s'ouvre sur n'importe quel noeud, sans requete —
-- c'est ce qui le rend instantane. Interroger a l'ouverture y ajouterait un
-- aller-retour de 0,5 a 4 s et un squelette, pour trois nombres. On charge donc
-- le perimetre ENTIER une fois, avec l'arbre, et l'ouverture reste gratuite
-- (regle 28). La fiche pleine page y lit sa propre ligne.
--
-- LES SOLDES NE SONT PAS ICI, ET C'EST VOULU. `fn_finance_soldes_perimetre`
-- (0026) les calcule deja, propre et consolide, en une passe. En ecrire une
-- seconde somme donnerait deux resultats que rien ne garantirait egaux
-- (regle 16) — les deux fonctions s'appellent cote a cote, en parallele.
--
-- SECURITY INVOKER (le defaut) : la RLS de `croyants`, de `bureaux` et
-- d'`entities` s'applique a l'appelant. Un gestionnaire de district n'obtient
-- que son district, et l'ecran n'a aucun filtrage a refaire — donc aucune
-- occasion de se tromper en le refaisant (EF-DSH-02).
--
-- REJOUABLE (regle 23). ATTENTION — `returns table` : les parametres OUT font
-- partie de la signature, donc ajouter une colonne est un changement de type de
-- retour que PostgreSQL refuse (42P13). D'ou le `drop function if exists` qui
-- precede, indispensable et lui-meme rejouable.
-- =============================================================================

drop function if exists fn_chiffres_perimetre();

create or replace function fn_chiffres_perimetre()
returns table (
  entity_id           uuid,
  croyants_propres    bigint,
  croyants_consolides bigint,
  bureau_id           uuid,
  bureau_libelle      text,
  bureau_date_fin     date,
  bureau_membres      bigint
)
language sql
stable
as $$
  with croyants_situes as (
    /**
     * RG-04 — un croyant est rattache a son EGLISE, jamais a un district.
     * Son chemin est donc celui de son eglise : c'est lui qui le fait remonter
     * dans le consolide de tous ses ascendants.
     *
     * Meme critere que le tableau de bord (0041) : `ACTIF` et non supprime. Un
     * effectif qui compterait les transferes partis serait faux des la premiere
     * mutation, et faux dans le sens qui flatte.
     */
    select c.eglise_id, e.path
    from croyants c
    join entities e on e.id = c.eglise_id
    where c.deleted_at is null
      and c.statut = 'ACTIF'
  ),
  bureau_courant as (
    /**
     * RG-10 — au plus UN bureau actif par entite, garanti par un index partiel.
     * Le `distinct on` n'est donc pas un choix arbitraire : il n'y a qu'une
     * ligne a prendre, et `date_debut desc` fixe laquelle si l'index venait a
     * manquer.
     */
    select distinct on (b.entity_id)
      b.entity_id, b.id, b.libelle, b.date_fin
    from bureaux b
    where b.deleted_at is null
      and b.is_active
    order by b.entity_id, b.date_debut desc
  ),
  membres_en_cours as (
    -- EF-BUR-04 — les mandats EN COURS. Une fonction dont le mandat s'est
    -- acheve n'est plus une place occupee : la compter ferait paraitre complet
    -- un bureau qui ne l'est plus.
    select m.bureau_id, count(*) as n
    from bureau_membres m
    where m.date_fin is null or m.date_fin >= current_date
    group by m.bureau_id
  )
  select
    e.id,
    -- PROPRE : les croyants de CETTE eglise. Nul pour un district, qui n'en
    -- porte aucun en propre — c'est la verite, pas une lacune.
    count(cs.eglise_id) filter (where cs.eglise_id = e.id),
    -- CONSOLIDE : elle et tout son sous-arbre. `<@` lit « est descendant de,
    -- ou egal a » : une eglise se compte donc elle-meme.
    count(cs.eglise_id),
    bc.id,
    bc.libelle,
    bc.date_fin,
    coalesce(mc.n, 0)
  from entities e
  left join bureau_courant bc on bc.entity_id = e.id
  left join membres_en_cours mc on mc.bureau_id = bc.id
  -- LEFT JOIN : une entite SANS croyant sort a ZERO, elle ne disparait pas.
  -- Une eglise absente du tableau se lirait « je ne la vois pas », quand la
  -- verite est « elle n'en compte aucun » — deux constats opposes (regle 15).
  left join croyants_situes cs on cs.path <@ e.path
  where e.deleted_at is null
  group by e.id, bc.id, bc.libelle, bc.date_fin, mc.n;
$$;

comment on function fn_chiffres_perimetre is
  'EF-STR-06 — effectifs et bureau courant de CHAQUE entite du perimetre, en '
  'une passe. Les soldes viennent de fn_finance_soldes_perimetre (0026) : une '
  'seconde somme donnerait deux resultats que rien ne garantirait egaux. '
  'SECURITY INVOKER : la RLS borne le resultat a la portee de l''appelant.';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0053')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0054_purge_corbeille.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0054 — L'effacement definitif : un droit a part, non delegable
-- =============================================================================
-- Reference : EF-ADM-10 (corbeille), RG-24 (droits reserves au Siege),
--             RG-25 (portee du droit).
--
-- POURQUOI UN DROIT DE PLUS PLUTOT QUE `trash.restore`
--
-- Restaurer DEFAIT une suppression ; purger la rend definitive. Ce ne sont pas
-- deux degres du meme droit mais deux actes opposes, et le second est le seul
-- de l'application qui ne se rattrape par rien : ni la corbeille, ni le
-- journal, ni une restauration ne ramenent ce qu'il a retire.
--
-- NON DELEGABLE, pour cette raison meme. Un droit sans retour se decide au
-- Siege, une fois, et ne se repand pas de proche en proche.
--
-- PORTEE PROPRE (declaree cote TypeScript, `fn_permissions_portee_propre` la
-- porte en base depuis 0050 — a completer ci-dessous). Purger n'est pas un acte
-- qui descend : un district qui effacerait pour de bon les fiches de ses
-- eglises le ferait sans que personne, chez elles, ne s'en apercoive avant
-- qu'il soit trop tard.
--
-- CE QUE LA PURGE NE POURRA PAS FAIRE, ET C'EST VOULU. Les cles etrangeres
-- sont en `on delete restrict` a peu pres partout — un croyant qui a siege
-- dans un bureau, une entite qui porte des mouvements. La base REFUSERA de les
-- effacer, et c'est elle qui a raison : ces lignes sont citees ailleurs.
-- L'application se contente de traduire ce refus en francais.
--
-- ALIGNEMENT — cette liste DOIT rester identique a `NON_DELEGABLES` dans
-- `lib/domain/permissions.ts` ; un test lit ce fichier et compare. Sans lui
-- l'ecart serait invisible : l'ecran refuserait pendant que la base
-- accorderait, ou l'inverse.
--
-- UNE MIGRATION, UNE FONCTION. La portee PROPRE de `trash.purge` se pose dans
-- la migration SUIVANTE et non ici : le test d'alignement extrait le PREMIER
-- `select array[...]` du fichier, et deux listes dans un meme fichier lui
-- feraient comparer la mauvaise. Le decoupage n'est pas cosmetique — c'est ce
-- qui garde la verification honnete.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

create or replace function fn_permissions_non_delegables() returns text[]
language sql immutable as $$
  select array[
    'entity.delete',
    -- Effacer l'histoire d'un bureau se decide au Siege, pas en cascade.
    'bureau.delete',
    'referentiel.manage',
    'settings.manage',
    -- EF-FIN-18 : la levee de la separation saisie/validation.
    'finance.validate_own',
    -- EF-FIN-26 : celui qui clot ne doit pas pouvoir s'accorder de quoi rouvrir.
    'finance.periode.reopen',
    -- EF-ADM-10 : la seule operation sans retour de l'application.
    'trash.purge'
  ]::text[]
$$;

comment on function fn_permissions_non_delegables is
  'RG-24 : droits reserves au Siege, jamais delegables. DOIT rester aligne sur '
  'NON_DELEGABLES dans lib/domain/permissions.ts — verrouille par '
  'tests/unit/permissions.test.ts. Depuis 0051, finance.delegate n''y figure '
  'plus. Depuis 0054, trash.purge s''y ajoute.';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0054')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0055_portee_propre_trash_purge.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0055 — `trash.purge` a la portee de l'entite SEULE
-- =============================================================================
-- Reference : RG-25 (la portee est une propriete du DROIT — 0050), EF-ADM-10.
--
-- POURQUOI CE DROIT NE DESCEND PAS
--
-- La portee par defaut est DESCENDANTE : un droit accorde a un district vaut
-- pour ses paroisses et ses eglises. C'est le bon defaut pour presque tout —
-- consulter, saisir, composer. Ce n'en est pas un pour l'effacement definitif.
--
-- Un district qui purgerait les fiches de ses eglises le ferait sans que
-- personne, chez elles, ne puisse s'en apercevoir avant qu'il soit trop tard :
-- il n'y a ni corbeille ou le retrouver, ni restauration a demander. Le droit
-- se donne donc entite par entite, ce qui oblige a nommer ce qu'on autorise.
--
-- UNE MIGRATION, UNE FONCTION — voir 0054. Le test d'alignement extrait le
-- PREMIER `select array[...]` du fichier ; deux listes dans un meme fichier lui
-- feraient comparer la mauvaise, et la verification cesserait de verifier.
--
-- ALIGNEMENT — cette liste DOIT rester identique aux droits declares
-- `portee: 'PROPRE'` dans `lib/domain/permissions.ts` ; un test lit ce fichier
-- et compare.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

create or replace function fn_permissions_portee_propre() returns text[]
language sql immutable as $$
  select array[
    'finance.create','finance.update','finance.submit','finance.validate',
    'finance.validate_own','finance.periode.close','finance.periode.reopen',
    'bureau.manage','bureau.delete','user.manage','permission.delegate',
    -- EF-ADM-10 : l'effacement definitif se donne entite par entite.
    'trash.purge'
  ]::text[]
$$;

comment on function fn_permissions_portee_propre is
  'RG-25 : droits dont la portee est l''entite SEULE, sans descendance. DOIT '
  'rester aligne sur les entrees portee: PROPRE de lib/domain/permissions.ts — '
  'verrouille par tests/unit/permissions.test.ts. Depuis 0055 : trash.purge.';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0055')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0056_regles_rapprochement_dimes.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0056 — Les trois regles de rapprochement des dimes
-- =============================================================================
-- Reference : EF-FIN-34, EF-FIN-27, RG-33. Regles arretees le 20 aout 2026.
--
-- CE QUE L'IMPORT FAISAIT, ET CE QU'IL LUI MANQUAIT.
--
-- Il savait deja rattacher un nom reconnu, et laisser un nom inconnu dans la
-- file de rapprochement. Deux situations lui echappaient, et chacune coutait
-- un travail refait a la main :
--
--   1. UN NOM RECONNU QUI PRESENTE UN NUMERO NOUVEAU. Le versement gardait le
--      numero, mais le CROYANT ne le recevait pas : `dime_enveloppes` restait
--      muette. La collecte suivante reposait donc la meme question,
--      indefiniment — le numero n'apprenait jamais rien, et quelqu'un le
--      ressaisissait chaque mois.
--
--   2. UNE ENVELOPPE SANS NOM MAIS AVEC UN NUMERO. Elle etait classee anonyme
--      et sortait du champ. Or le numero DIT quelque chose — il a deja ete
--      porte, et par quelqu'un. La ligne etait perdue alors qu'une question
--      simple restait posable.
--
-- LES TROIS REGLES, telles qu'elles ont ete arretees :
--
--   A. NOM + PRENOM, SANS NUMERO
--      Reconnu -> rattache. Inconnu -> file des personnes non rattachees.
--      (Deja en place ; rien ne change.)
--
--   B. NOM + PRENOM, AVEC NUMERO
--      Reconnu et numero NOUVEAU -> rattache ET le numero lui est attribue.
--      Inconnu -> file des personnes non rattachees.
--
--   C. SANS NOM, AVEC NUMERO
--      -> la ligne entre dans la file, ou le dernier porteur du numero sera
--      propose. Numero inconnu -> elle reste une enveloppe sans nom.
--
-- CE QUI CHANGE DANS LA DOCTRINE — et c'est le point a ne pas manquer.
--
-- `0032` disait : « une ligne SANS nom n'entre pas dans la file : il n'y aurait
-- rien a rapprocher, et la file se remplirait de lignes qu'aucun travail ne
-- peut clore ». Le raisonnement etait juste TANT QU'IL N'Y AVAIT RIEN POUR
-- TRAVAILLER. Un numero d'enveloppe est precisement ce quelque chose : il a un
-- dernier porteur, la question se pose, elle se tranche.
--
-- La regle devient donc : une ligne sans nom entre dans la file SI ELLE PORTE
-- UN NUMERO, et elle seule. Une ligne sans nom ET sans numero reste dehors —
-- la, il n'y a toujours rien a rapprocher. La raison d'origine n'est pas
-- abandonnee : elle est bornee a ce qu'elle couvrait vraiment.
--
-- REJOUABLE (regle 23) : `create or replace function` sur des signatures
-- INCHANGEES, et l'attribution des numeros se conditionne d'elle-meme.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Attribuer un numero d'enveloppe a un croyant — regle B
-- -----------------------------------------------------------------------------

/**
 * Attribue `p_numero` a `p_croyant`, dans l'eglise DU CROYANT.
 *
 * TROIS REFUS, ET AUCUN N'EST UNE ERREUR — d'ou le `boolean` plutot qu'une
 * exception : l'appelant continue sa collecte, il n'a rien a rattraper.
 *
 *   - le numero est deja le sien -> il n'y a rien a faire ;
 *   - le numero appartient a QUELQU'UN D'AUTRE dans cette eglise -> on ne le
 *     prend pas. Deux personnes ne partagent pas un numero
 *     (`dime_enveloppes_unicite`), et le voler en silence attribuerait les
 *     dimes suivantes a la mauvaise personne ;
 *   - le croyant n'a pas d'eglise lisible -> il n'y a rien a quoi rattacher.
 *
 * L'EGLISE EST CELLE DU CROYANT, jamais l'entite collectrice : une ceremonie de
 * district reunit des donateurs de vingt eglises, et un numero appartient a une
 * eglise — `dime_enveloppes_unicite` porte sur le couple.
 *
 * L'ANCIEN NUMERO EST DESACTIVE, PAS SUPPRIME. Il figure sur des recus deja
 * remis, et `dime_enveloppe_active_idx` ne contraint que les actifs : l'effacer
 * rendrait illisible un papier que quelqu'un detient.
 *
 * SECURITY DEFINER : appelee par des fonctions elles-memes DEFINER, qui ont
 * deja verifie `finance.dime.collect` sur l'entite collectrice. Le reverifier
 * ici sur l'eglise du croyant refuserait une collecte de district legitime.
 */
create or replace function fn_attribuer_enveloppe(
  p_croyant uuid,
  p_numero  text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eglise  uuid;
  v_numero  text;
  v_proprio uuid;
begin
  v_numero := nullif(trim(coalesce(p_numero, '')), '');
  if p_croyant is null or v_numero is null then
    return false;
  end if;

  select eglise_id into v_eglise from croyants where id = p_croyant;
  if v_eglise is null then
    return false;
  end if;

  -- Qui detient deja ce numero dans cette eglise ?
  select croyant_id into v_proprio
    from dime_enveloppes
   where eglise_id = v_eglise
     and numero    = v_numero;

  -- Deja le sien : rien a faire, et surtout pas une seconde ligne.
  if v_proprio = p_croyant then
    return false;
  end if;

  -- A quelqu'un d'autre : on ne le prend pas. Le silence serait pire que le
  -- conflit — il attribuerait les dimes suivantes au mauvais nom.
  if v_proprio is not null then
    return false;
  end if;

  -- Le precedent numero cesse d'etre actif ; il reste en base pour les recus.
  update dime_enveloppes
     set is_active = false
   where eglise_id  = v_eglise
     and croyant_id = p_croyant
     and is_active;

  insert into dime_enveloppes (eglise_id, croyant_id, numero, is_active)
  values (v_eglise, p_croyant, v_numero, true);

  return true;
end $$;

comment on function fn_attribuer_enveloppe is
  'EF-FIN-27, regle B du rapprochement — attribue un numero d''enveloppe au '
  'croyant, dans SON eglise. Ne prend jamais un numero deja detenu par un '
  'autre : le conflit se tranche a l''ecran, pas en silence.';

revoke execute on function fn_attribuer_enveloppe from anon;


-- -----------------------------------------------------------------------------
-- La saisie d'une collecte applique les regles B et C
-- -----------------------------------------------------------------------------

/**
 * Identique a `0038` pour TOUT ce qui touche a l'argent — le total, le
 * rattachement au Siege (RG-33), le statut `SOUMIS` pose explicitement
 * (EF-FIN-30), les recus et leur description. Rien de cela ne change.
 *
 * DEUX AJOUTS, ET RIEN D'AUTRE :
 *   - regle B : un nom reconnu qui presente un numero se voit attribuer ce
 *     numero — `fn_attribuer_enveloppe` refuse d'elle-meme les conflits ;
 *   - regle C : une ligne sans nom mais AVEC un numero entre dans la file.
 *
 * POURQUOI `''` ET NON `null` POUR LE NOM D'UNE LIGNE SANS NOM.
 * `dime_rapprochements.nom_source` est `not null` depuis `0030`, et la rendre
 * nullable obligerait a reprendre toutes les lectures qui s'y fient. La chaine
 * vide dit exactement ce qui s'est passe — le fichier ne portait pas de nom —
 * et l'ecran la lit comme telle : « Enveloppe 1234, sans nom », pas un blanc.
 */
create or replace function fn_saisir_collecte_dime(
  p_entite_collecte uuid,
  p_categorie       uuid,
  p_date_operation  date,
  p_evenement       type_evenement_dime,
  p_libelle         text default null,
  p_reference       text default null,
  p_versements      jsonb default '[]'::jsonb
)
returns table (finance_entry_id uuid, recus jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siege     uuid := siege_id();
  v_code      text;
  v_profil    uuid := current_profile_id();
  v_total     numeric(14,2);
  v_entry     uuid;
  v_recus     jsonb := '[]'::jsonb;
  v_ligne     jsonb;
  v_recu      text;
  v_nature    nature_versement;
  v_croyant   uuid;
  v_versement uuid;
  v_nom       text;
  v_prenom    text;
  v_libelle   text;
  v_enveloppe text;
  v_sens      sens_finance;
begin
  if v_siege is null then
    raise exception 'Aucun Siege n''est defini : une dime ne peut pas etre rattachee.';
  end if;

  if not can('finance.dime.collect', p_entite_collecte) then
    raise exception 'Vous n''avez pas le droit de collecter les dimes de cette entite.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite_collecte;
  if v_code is null then
    raise exception 'Cette entite est introuvable.';
  end if;

  select sens into v_sens from finance_categories where id = p_categorie;
  if v_sens is distinct from 'RECETTE' then
    raise exception 'RG-13 : une collecte de dimes doit relever d''une categorie de recette.';
  end if;

  select coalesce(sum((l->>'montant')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_versements) as l;

  if v_total <= 0 then
    raise exception 'Le montant de la collecte doit etre superieur a zero.';
  end if;

  /**
   * RG-33 : `entity_id` est le SIEGE, jamais l'eglise.
   *
   * `statut = 'SOUMIS'` est pose explicitement : une collecte est une ANNONCE
   * — « voici ce que nous avons recueilli » — et non un encaissement. C'est la
   * REMISE qui valide (EF-FIN-30).
   */
  insert into finance_entries (
    entity_id, categorie_id, montant, date_operation, libelle, reference,
    entite_collecte_id, dime_evenement, statut, soumis_par, soumis_le,
    saisi_par, saisi_depuis_entity_id
  )
  values (
    v_siege, p_categorie, v_total, p_date_operation, p_libelle, p_reference,
    p_entite_collecte, p_evenement, 'SOUMIS', v_profil, now(),
    v_profil, p_entite_collecte
  )
  returning id into v_entry;

  for v_ligne in select * from jsonb_array_elements(p_versements)
  loop
    v_croyant   := nullif(v_ligne->>'croyant_id', '')::uuid;
    v_libelle   := nullif(trim(coalesce(v_ligne->>'nom_source', '')), '');
    v_enveloppe := nullif(trim(coalesce(v_ligne->>'enveloppe', '')), '');

    -- `coalesce` exige des types compatibles : les deux branches sont typees.
    v_nature  := coalesce(
      nullif(v_ligne->>'nature', '')::nature_versement,
      (case when v_croyant is null then 'EN_VRAC' else 'NOMINATIF' end)::nature_versement
    );

    -- Le recu n'existe que pour un versement NOMINATIF.
    v_recu := case when v_nature = 'NOMINATIF' then fn_generer_recu_dime(v_code) end;

    insert into dime_versements (
      finance_entry_id, croyant_id, enveloppe_numero, montant, recu_numero, nature
    )
    values (
      v_entry,
      v_croyant,
      v_enveloppe,
      (v_ligne->>'montant')::numeric,
      v_recu,
      v_nature
    )
    returning id into v_versement;

    if v_recu is not null then
      -- Le recu porte sa propre description : nom, prenom, enveloppe.
      select c.nom, c.prenom into v_nom, v_prenom
        from croyants c where c.id = v_croyant;

      v_recus := v_recus || jsonb_build_object(
        'croyant_id', v_ligne->>'croyant_id',
        'recu', v_recu,
        'nom', v_nom,
        'prenom', v_prenom,
        'enveloppe', v_enveloppe
      );
    end if;

    /**
     * REGLE B — un nom reconnu qui presente un numero le GARDE.
     *
     * Sans cela le numero restait sur le seul versement : la collecte suivante
     * reposait la meme question, et quelqu'un le ressaisissait chaque mois.
     */
    if v_croyant is not null and v_enveloppe is not null then
      perform fn_attribuer_enveloppe(v_croyant, v_enveloppe);
    end if;

    /**
     * REGLES A et C — ce qui reste a identifier entre dans la file.
     *
     * Un nom que rien ne reconnait (A), ou AUCUN nom mais un numero (C). Dans
     * les deux cas le montant compte deja — l'argent est recu — et ce qui
     * manque est une identite, que quelqu'un retrouvera dans `/croyants`.
     *
     * Une ligne sans nom ET sans numero reste dehors : il n'y aurait rien a
     * rapprocher, et la file se remplirait de lignes qu'aucun travail ne peut
     * clore. C'est la raison de `0032`, bornee a ce qu'elle couvrait vraiment.
     */
    if v_croyant is null and (v_libelle is not null or v_enveloppe is not null) then
      insert into dime_rapprochements (
        versement_id, entite_id, nom_source, prenom_source, enveloppe_source
      )
      values (
        v_versement,
        p_entite_collecte,
        -- `''` dit « le fichier ne portait pas de nom ». La colonne est
        -- `not null` depuis 0030 et l'ecran lit la chaine vide comme telle.
        coalesce(v_libelle, ''),
        nullif(trim(coalesce(v_ligne->>'prenom_source', '')), ''),
        v_enveloppe
      );
    end if;
  end loop;

  return query select v_entry, v_recus;
end $$;

revoke execute on function fn_saisir_collecte_dime from anon;


-- -----------------------------------------------------------------------------
-- La resolution applique elle aussi la regle B
-- -----------------------------------------------------------------------------

/**
 * Identique a `0032` — deux ecritures indissociables (regle 20), et le recu
 * emis au moment ou il y a quelqu'un a qui le remettre.
 *
 * UN SEUL AJOUT : le numero lu devient celui du croyant.
 *
 * Rapprocher une ligne, c'est reconnaitre la personne. Si la ligne portait un
 * numero, il est desormais le sien — exactement comme a l'import. Ne le faire
 * qu'a l'import laisserait ce meme numero reposer la meme question a la
 * collecte suivante, alors qu'on vient tout juste d'y repondre.
 */
create or replace function fn_resoudre_rapprochement(
  p_rapprochement uuid,
  p_croyant       uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entite    uuid;
  v_versement uuid;
  v_enveloppe text;
  v_code      text;
  v_recu      text;
begin
  select r.entite_id, r.versement_id, r.enveloppe_source
    into v_entite, v_versement, v_enveloppe
    from dime_rapprochements r
   where r.id = p_rapprochement and r.croyant_id is null;

  if v_entite is null then
    raise exception 'Ce rapprochement est introuvable ou deja resolu.';
  end if;

  if not can('finance.dime.collect', v_entite) then
    raise exception 'Vous n''avez pas le droit de resoudre ce rapprochement.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = v_entite;
  v_recu := fn_generer_recu_dime(v_code);

  update dime_versements
     set croyant_id  = p_croyant,
         nature      = 'NOMINATIF',
         recu_numero = v_recu
   where id = v_versement;

  update dime_rapprochements
     set croyant_id = p_croyant,
         resolu_le  = now(),
         resolu_par = current_profile_id()
   where id = p_rapprochement;

  -- Regle B : le numero lu devient le sien, s'il n'appartient a personne.
  if v_enveloppe is not null then
    perform fn_attribuer_enveloppe(p_croyant, v_enveloppe);
  end if;

  return v_recu;
end $$;

revoke execute on function fn_resoudre_rapprochement from anon;


/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, l'API repondrait
 * « fonction inconnue » sur du SQL pourtant en place — constate deux fois.
 */
notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0056')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0057_recu_sur_nom_lu.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0057 — Un nom lu suffit pour un recu
-- =============================================================================
-- Reference : EF-FIN-29, EF-FIN-33, EF-FIN-34. Constate a l'essai du 20 aout
-- 2026, sur un fichier de cinq lignes.
--
-- LE DEFAUT.
--
-- Le recu n'etait emis que pour un versement NOMINATIF, c'est-a-dire rattache a
-- une FICHE. Un fichier portant « KABORE Windyam Francois » sans qu'aucune
-- fiche ne le reconnaisse donnait donc un versement compte, un rapprochement en
-- attente… et AUCUN TALON A REMETTRE.
--
-- Or la personne est devant soi. Elle a donne, on sait qui elle est, et ce qui
-- manque n'est pas son identite mais son ENREGISTREMENT — un travail qui nous
-- appartient, pas a elle. Lui refuser son recu le temps qu'on ouvre sa fiche
-- lui fait porter le delai de notre propre administration.
--
-- CE QUI CHANGE : le recu suit LE NOM, plus la fiche.
--
--   - un nom RECONNU        -> recu, comme avant ;
--   - un nom LU mais inconnu -> recu AUSSI, au nom lu dans le fichier ;
--   - aucun nom              -> toujours pas de recu. Il n'y a personne a qui
--                              le remettre, et consommer la sequence pour rien
--                              brouillerait la numerotation de ceux qui
--                              existent vraiment (raison de `0030`, intacte).
--
-- LA CONSEQUENCE A NE PAS MANQUER : LE RECU NE SE RENUMEROTE PAS.
--
-- `fn_resoudre_rapprochement` emettait un recu a la resolution — c'etait le
-- moment ou quelqu'un apparaissait. Maintenant qu'il existe deja pour les
-- lignes nommees, en emettre un second donnerait DEUX recus pour UN versement :
-- le donateur detiendrait un papier dont le numero ne serait plus celui de la
-- base, et deux references pointeraient le meme argent. La resolution CONSERVE
-- donc le numero existant, et n'en genere un que s'il n'y en avait aucun —
-- c'est-a-dire pour une enveloppe sans nom (regle C).
--
-- La nature, elle, ne bouge pas a l'import : une ligne non rattachee reste
-- ENVELOPPE_ANONYME ou EN_VRAC, parce que `dime_versements_nature_coherente`
-- exige une fiche pour NOMINATIF. Aucune contrainte ne lie le recu a la
-- nature — verifie avant d'ecrire cette migration.
--
-- REJOUABLE (regle 23) : `create or replace` sur des signatures inchangees.
-- =============================================================================


create or replace function fn_saisir_collecte_dime(
  p_entite_collecte uuid,
  p_categorie       uuid,
  p_date_operation  date,
  p_evenement       type_evenement_dime,
  p_libelle         text default null,
  p_reference       text default null,
  p_versements      jsonb default '[]'::jsonb
)
returns table (finance_entry_id uuid, recus jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siege     uuid := siege_id();
  v_code      text;
  v_profil    uuid := current_profile_id();
  v_total     numeric(14,2);
  v_entry     uuid;
  v_recus     jsonb := '[]'::jsonb;
  v_ligne     jsonb;
  v_recu      text;
  v_nature    nature_versement;
  v_croyant   uuid;
  v_versement uuid;
  v_nom       text;
  v_prenom    text;
  v_libelle   text;
  v_prenom_lu text;
  v_enveloppe text;
  v_sens      sens_finance;
begin
  if v_siege is null then
    raise exception 'Aucun Siege n''est defini : une dime ne peut pas etre rattachee.';
  end if;

  if not can('finance.dime.collect', p_entite_collecte) then
    raise exception 'Vous n''avez pas le droit de collecter les dimes de cette entite.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite_collecte;
  if v_code is null then
    raise exception 'Cette entite est introuvable.';
  end if;

  select sens into v_sens from finance_categories where id = p_categorie;
  if v_sens is distinct from 'RECETTE' then
    raise exception 'RG-13 : une collecte de dimes doit relever d''une categorie de recette.';
  end if;

  select coalesce(sum((l->>'montant')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_versements) as l;

  if v_total <= 0 then
    raise exception 'Le montant de la collecte doit etre superieur a zero.';
  end if;

  -- RG-33 : `entity_id` est le SIEGE. `SOUMIS` : une collecte annonce sans
  -- encaisser, c'est la REMISE qui valide (EF-FIN-30).
  insert into finance_entries (
    entity_id, categorie_id, montant, date_operation, libelle, reference,
    entite_collecte_id, dime_evenement, statut, soumis_par, soumis_le,
    saisi_par, saisi_depuis_entity_id
  )
  values (
    v_siege, p_categorie, v_total, p_date_operation, p_libelle, p_reference,
    p_entite_collecte, p_evenement, 'SOUMIS', v_profil, now(),
    v_profil, p_entite_collecte
  )
  returning id into v_entry;

  for v_ligne in select * from jsonb_array_elements(p_versements)
  loop
    v_croyant   := nullif(v_ligne->>'croyant_id', '')::uuid;
    v_libelle   := nullif(trim(coalesce(v_ligne->>'nom_source', '')), '');
    v_prenom_lu := nullif(trim(coalesce(v_ligne->>'prenom_source', '')), '');
    v_enveloppe := nullif(trim(coalesce(v_ligne->>'enveloppe', '')), '');

    v_nature  := coalesce(
      nullif(v_ligne->>'nature', '')::nature_versement,
      (case when v_croyant is null then 'EN_VRAC' else 'NOMINATIF' end)::nature_versement
    );

    /**
     * LE RECU SUIT LE NOM, PLUS LA FICHE.
     *
     * Une fiche reconnue, ou un nom lu dans le fichier : dans les deux cas il y
     * a quelqu'un a qui remettre le talon. Sans nom du tout, en revanche,
     * toujours rien — consommer la sequence brouillerait la numerotation de
     * ceux qui existent vraiment.
     */
    v_recu := case
      when v_croyant is not null or v_libelle is not null
      then fn_generer_recu_dime(v_code)
    end;

    insert into dime_versements (
      finance_entry_id, croyant_id, enveloppe_numero, montant, recu_numero, nature
    )
    values (
      v_entry, v_croyant, v_enveloppe,
      (v_ligne->>'montant')::numeric, v_recu, v_nature
    )
    returning id into v_versement;

    if v_recu is not null then
      /**
       * LE TALON PORTE LE NOM QU'ON A. Celui de la fiche quand elle existe,
       * celui du fichier sinon — c'est le meme papier, remis a la meme
       * personne. Le matricule reste absent tant qu'il n'y a pas de fiche : en
       * inventer un sur un document qui fait foi serait pire que son absence.
       */
      if v_croyant is not null then
        select c.nom, c.prenom into v_nom, v_prenom
          from croyants c where c.id = v_croyant;
      else
        v_nom    := v_libelle;
        v_prenom := v_prenom_lu;
      end if;

      v_recus := v_recus || jsonb_build_object(
        'croyant_id', v_ligne->>'croyant_id',
        'recu', v_recu,
        'nom', v_nom,
        'prenom', v_prenom,
        'enveloppe', v_enveloppe
      );
    end if;

    -- Regle B — un nom reconnu qui presente un numero le GARDE.
    if v_croyant is not null and v_enveloppe is not null then
      perform fn_attribuer_enveloppe(v_croyant, v_enveloppe);
    end if;

    -- Regles A et C — ce qui reste a identifier entre dans la file. Une ligne
    -- sans nom ET sans numero reste dehors : rien a rapprocher.
    if v_croyant is null and (v_libelle is not null or v_enveloppe is not null) then
      insert into dime_rapprochements (
        versement_id, entite_id, nom_source, prenom_source, enveloppe_source
      )
      values (
        v_versement, p_entite_collecte,
        coalesce(v_libelle, ''), v_prenom_lu, v_enveloppe
      );
    end if;
  end loop;

  return query select v_entry, v_recus;
end $$;

revoke execute on function fn_saisir_collecte_dime from anon;


/**
 * LA RESOLUTION NE RENUMEROTE JAMAIS UN RECU DEJA EMIS.
 *
 * C'est la contrepartie directe du changement ci-dessus. Une ligne nommee porte
 * desormais son recu des l'import ; en emettre un second a la resolution
 * donnerait DEUX references pour UN versement, et le papier detenu par le
 * donateur cesserait de correspondre a la base.
 *
 * On n'en genere donc un que s'il n'y en avait aucun — le cas d'une enveloppe
 * sans nom (regle C), ou personne n'etait identifiable avant ce geste.
 */
create or replace function fn_resoudre_rapprochement(
  p_rapprochement uuid,
  p_croyant       uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entite    uuid;
  v_versement uuid;
  v_enveloppe text;
  v_code      text;
  v_recu      text;
begin
  select r.entite_id, r.versement_id, r.enveloppe_source
    into v_entite, v_versement, v_enveloppe
    from dime_rapprochements r
   where r.id = p_rapprochement and r.croyant_id is null;

  if v_entite is null then
    raise exception 'Ce rapprochement est introuvable ou deja resolu.';
  end if;

  if not can('finance.dime.collect', v_entite) then
    raise exception 'Vous n''avez pas le droit de resoudre ce rapprochement.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Le recu deja emis fait foi : il est peut-etre deja entre les mains du
  -- donateur.
  select recu_numero into v_recu from dime_versements where id = v_versement;

  if v_recu is null then
    select code into v_code from entities where id = v_entite;
    v_recu := fn_generer_recu_dime(v_code);
  end if;

  update dime_versements
     set croyant_id  = p_croyant,
         nature      = 'NOMINATIF',
         recu_numero = v_recu
   where id = v_versement;

  update dime_rapprochements
     set croyant_id = p_croyant,
         resolu_le  = now(),
         resolu_par = current_profile_id()
   where id = p_rapprochement;

  -- Regle B : le numero lu devient le sien, s'il n'appartient a personne.
  if v_enveloppe is not null then
    perform fn_attribuer_enveloppe(p_croyant, v_enveloppe);
  end if;

  return v_recu;
end $$;

revoke execute on function fn_resoudre_rapprochement from anon;


/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, l'API repondrait
 * « fonction inconnue » sur du SQL pourtant en place.
 */
notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0057')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0058_eglise_lue_a_l_import.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0058 — L'eglise de rattachement lue dans le fichier
-- =============================================================================
-- Reference : EF-FIN-34, EF-CRO-01. Demande du 20 aout 2026.
--
-- LE PROBLEME QU'ELLE RESOUT.
--
-- Une ligne non rattachee finit dans la file des personnes non rattachees, et
-- s'y resout de trois facons : le numero propose, la recherche trouve, la
-- creation ouvre une fiche. Le troisieme chemin butait toujours au meme
-- endroit : L'EGLISE. Le formulaire s'ouvre amorce du nom lu, mais l'eglise se
-- choisit dans un selecteur de toute l'organisation — et celui qui saisit ne la
-- connait pas forcement.
--
-- L'eglise etait pourtant DANS LE FICHIER, la plupart du temps : c'est celui
-- qui a tenu la collecte qui l'a ecrite, et lui la connait. On la perdait en
-- route.
--
-- DEUX COLONNES, ET DEUX RAISONS DIFFERENTES.
--
--   `eglise_source` — CE QUE LE FICHIER DISAIT, tel quel. Meme role que
--   `nom_source` : c'est la seule trace de ce qui a ete lu, et elle vaut meme
--   quand rien ne la reconnait — « Ambohipo » suffit souvent a trancher a
--   l'oeil, la ou un champ vide ne dit rien.
--
--   `eglise_id` — L'ENTITE RECONNUE, ou `null`. Resolue A L'IMPORT, une fois,
--   contre les entites du perimetre de celui qui importe. La resoudre a
--   l'affichage la ferait dependre du lecteur : deux personnes ouvrant la meme
--   file verraient deux propositions differentes.
--
-- `null` N'EST PAS UN ECHEC. Un libelle inconnu — ou qui designe deux eglises —
-- laisse la ligne sans eglise, et le rapprochement se fait alors comme avant,
-- en la choisissant a la main. AUCUNE ENTITE N'EST CREEE pour un nom qu'on ne
-- reconnait pas : elle entrerait dans la structure, recevrait un code,
-- apparaitrait dans chaque selecteur et dans les soldes consolides, et
-- quelqu'un finirait par y transferer un vrai croyant. C'est la meme decision
-- que pour l'« eglise inconnue » refusee au lot des dimes.
--
-- `on delete set null` SUR L'ENTITE : supprimer une eglise ne doit pas
-- emporter une ligne d'argent recu. La proposition disparait, le montant reste.
--
-- REJOUABLE (regle 23) : `add column if not exists`, et la fonction est
-- remplacee sur une signature inchangee.
-- =============================================================================

alter table dime_rapprochements
  add column if not exists eglise_source text,
  add column if not exists eglise_id     uuid references entities(id) on delete set null;

comment on column dime_rapprochements.eglise_source is
  'EF-FIN-34 — l''eglise telle que le FICHIER l''ecrivait, conservee meme si '
  'rien ne la reconnait : elle suffit souvent a trancher a l''oeil.';

comment on column dime_rapprochements.eglise_id is
  'EF-FIN-34 — l''entite reconnue a l''import, ou NULL. Resolue une fois, cote '
  'serveur : la resoudre a l''affichage la ferait dependre du lecteur.';


-- -----------------------------------------------------------------------------
-- La saisie transporte l'eglise jusqu'a la file
-- -----------------------------------------------------------------------------

/**
 * Identique a `0057` — le total, le rattachement au Siege (RG-33), le statut
 * `SOUMIS`, le recu qui suit le nom lu, les regles A, B et C. Rien de cela ne
 * change.
 *
 * UN SEUL AJOUT : les deux colonnes d'eglise sont ecrites sur la ligne de
 * rapprochement. Elles ne servent qu'a la creation de fiche, et n'entrent dans
 * aucun solde — l'argent, lui, appartient toujours au Siege.
 */
create or replace function fn_saisir_collecte_dime(
  p_entite_collecte uuid,
  p_categorie       uuid,
  p_date_operation  date,
  p_evenement       type_evenement_dime,
  p_libelle         text default null,
  p_reference       text default null,
  p_versements      jsonb default '[]'::jsonb
)
returns table (finance_entry_id uuid, recus jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siege     uuid := siege_id();
  v_code      text;
  v_profil    uuid := current_profile_id();
  v_total     numeric(14,2);
  v_entry     uuid;
  v_recus     jsonb := '[]'::jsonb;
  v_ligne     jsonb;
  v_recu      text;
  v_nature    nature_versement;
  v_croyant   uuid;
  v_versement uuid;
  v_nom       text;
  v_prenom    text;
  v_libelle   text;
  v_prenom_lu text;
  v_enveloppe text;
  v_eglise_lu text;
  v_eglise    uuid;
  v_sens      sens_finance;
begin
  if v_siege is null then
    raise exception 'Aucun Siege n''est defini : une dime ne peut pas etre rattachee.';
  end if;

  if not can('finance.dime.collect', p_entite_collecte) then
    raise exception 'Vous n''avez pas le droit de collecter les dimes de cette entite.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite_collecte;
  if v_code is null then
    raise exception 'Cette entite est introuvable.';
  end if;

  select sens into v_sens from finance_categories where id = p_categorie;
  if v_sens is distinct from 'RECETTE' then
    raise exception 'RG-13 : une collecte de dimes doit relever d''une categorie de recette.';
  end if;

  select coalesce(sum((l->>'montant')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_versements) as l;

  if v_total <= 0 then
    raise exception 'Le montant de la collecte doit etre superieur a zero.';
  end if;

  -- RG-33 : `entity_id` est le SIEGE. `SOUMIS` : une collecte annonce sans
  -- encaisser, c'est la REMISE qui valide (EF-FIN-30).
  insert into finance_entries (
    entity_id, categorie_id, montant, date_operation, libelle, reference,
    entite_collecte_id, dime_evenement, statut, soumis_par, soumis_le,
    saisi_par, saisi_depuis_entity_id
  )
  values (
    v_siege, p_categorie, v_total, p_date_operation, p_libelle, p_reference,
    p_entite_collecte, p_evenement, 'SOUMIS', v_profil, now(),
    v_profil, p_entite_collecte
  )
  returning id into v_entry;

  for v_ligne in select * from jsonb_array_elements(p_versements)
  loop
    v_croyant   := nullif(v_ligne->>'croyant_id', '')::uuid;
    v_libelle   := nullif(trim(coalesce(v_ligne->>'nom_source', '')), '');
    v_prenom_lu := nullif(trim(coalesce(v_ligne->>'prenom_source', '')), '');
    v_enveloppe := nullif(trim(coalesce(v_ligne->>'enveloppe', '')), '');
    v_eglise_lu := nullif(trim(coalesce(v_ligne->>'eglise_source', '')), '');
    v_eglise    := nullif(v_ligne->>'eglise_id', '')::uuid;

    v_nature  := coalesce(
      nullif(v_ligne->>'nature', '')::nature_versement,
      (case when v_croyant is null then 'EN_VRAC' else 'NOMINATIF' end)::nature_versement
    );

    -- Le recu suit LE NOM, plus la fiche (0057). Sans nom du tout, rien :
    -- consommer la sequence brouillerait la numerotation de ceux qui existent.
    v_recu := case
      when v_croyant is not null or v_libelle is not null
      then fn_generer_recu_dime(v_code)
    end;

    insert into dime_versements (
      finance_entry_id, croyant_id, enveloppe_numero, montant, recu_numero, nature
    )
    values (
      v_entry, v_croyant, v_enveloppe,
      (v_ligne->>'montant')::numeric, v_recu, v_nature
    )
    returning id into v_versement;

    if v_recu is not null then
      -- Le talon porte le nom qu'on a : celui de la fiche, ou celui du fichier.
      if v_croyant is not null then
        select c.nom, c.prenom into v_nom, v_prenom
          from croyants c where c.id = v_croyant;
      else
        v_nom    := v_libelle;
        v_prenom := v_prenom_lu;
      end if;

      v_recus := v_recus || jsonb_build_object(
        'croyant_id', v_ligne->>'croyant_id',
        'recu', v_recu,
        'nom', v_nom,
        'prenom', v_prenom,
        'enveloppe', v_enveloppe
      );
    end if;

    -- Regle B — un nom reconnu qui presente un numero le GARDE.
    if v_croyant is not null and v_enveloppe is not null then
      perform fn_attribuer_enveloppe(v_croyant, v_enveloppe);
    end if;

    /**
     * Regles A et C — ce qui reste a identifier entre dans la file, avec
     * l'eglise lue quand le fichier en portait une. Elle ne sert qu'a amorcer
     * la creation de fiche : aucun solde ne la lit.
     */
    if v_croyant is null and (v_libelle is not null or v_enveloppe is not null) then
      insert into dime_rapprochements (
        versement_id, entite_id, nom_source, prenom_source, enveloppe_source,
        eglise_source, eglise_id
      )
      values (
        v_versement, p_entite_collecte,
        coalesce(v_libelle, ''), v_prenom_lu, v_enveloppe,
        v_eglise_lu, v_eglise
      );
    end if;
  end loop;

  return query select v_entry, v_recus;
end $$;

revoke execute on function fn_saisir_collecte_dime from anon;


/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, les deux colonnes
 * resteraient invisibles a l'API et la lecture de la file repondrait
 * « column ... does not exist » sur du SQL pourtant en place.
 */
notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0058')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0059_bureau_terme_et_archivage.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0059 — Un mandat a un terme, et un bureau clos ne se supprime plus
-- =============================================================================
-- Reference : EF-BUR-02, EF-BUR-08, RG-07, RG-10. Demandes du 20 aout 2026.
--
-- DEUX REGLES, ET ELLES SE TIENNENT.
--
-- 1. UN MANDAT A UN TERME.
--
--    `bureaux.date_fin` etait facultative : un bureau pouvait s'ouvrir sans
--    qu'on sache quand il finit. Depuis que le mandat echu ferme l'application
--    (RG-07), cette absence a une consequence qu'elle n'avait pas : un mandat
--    sans terme ne s'acheve JAMAIS, et l'acces de ses membres non plus. La
--    regle « seuls les membres de bureau en exercice ont un compte » devient
--    alors une regle qu'on ne peut plus appliquer.
--
--    ON NE MET PAS `not null` SUR LA COLONNE, et c'est la decision qui compte.
--    Des bureaux existent, ouverts avant cette regle, sans date de fin. Une
--    contrainte `not null` exigerait de leur en inventer une — et une date de
--    fin de mandat inventee est pire qu'une absente : elle a l'air vraie, elle
--    fermera des acces le jour venu, et personne ne saura d'ou elle sort.
--
--    Le terme est donc EXIGE A L'OUVERTURE, par un trigger qui ne regarde que
--    les insertions. L'existant survit tel quel et se corrige a l'ecran, quand
--    quelqu'un connait la reponse. La regle est tenue pour tout ce qui nait
--    apres elle, ce qui est exactement ce qu'on peut garantir.
--
-- 2. UN BUREAU CLOS EST ARCHIVE, JAMAIS SUPPRIME.
--
--    `bureaux_delete` autorisait le Siege a effacer n'importe quel bureau.
--    Effacer un bureau CLOS efface ce qui a ete : qui etait tresorier en 2024,
--    qui a signe les comptes de l'exercice, qui figurait sur l'organigramme.
--    Ces mandats sont cites par des lignes d'audit, des rapports generes et des
--    reçus — l'histoire ne se corrige pas, elle se lit.
--
--    La suppression reste possible sur un bureau EN COURS : c'est le rattrapage
--    d'une ouverture faite par erreur, le matin meme, et rien n'en depend
--    encore. Un bureau clos, lui, a vecu.
--
--    LE VERROU EST EN BASE, pas sur un bouton grise : un bouton se contourne
--    par un appel direct a l'API. Meme raison que la cloture de periode (0040).
--
-- REJOUABLE (regle 23) : `drop trigger if exists` avant chaque `create`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Le terme est exige a l'OUVERTURE
-- -----------------------------------------------------------------------------

create or replace function fn_bureau_terme_requis() returns trigger
language plpgsql as $$
begin
  /**
   * A L'INSERTION SEULEMENT.
   *
   * Un `update` qui laisse `date_fin` a null sur un bureau ancien doit rester
   * possible : sinon corriger le LIBELLE d'un bureau de 2024 exigerait d'abord
   * d'inventer sa date de fin, et l'on inventerait.
   */
  if tg_op = 'INSERT' and new.date_fin is null then
    raise exception
      'EF-BUR-02 : un mandat a un terme. Indiquez la date de fin — elle peut '
      'etre corrigee ensuite, et le mandat se reconduit.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

comment on function fn_bureau_terme_requis is
  'EF-BUR-02, RG-07 — un bureau ne s''ouvre pas sans terme : un mandat sans fin '
  'ne s''acheve jamais, et l''acces de ses membres non plus. Borne a l''INSERT, '
  'pour ne pas forcer a inventer une date sur les bureaux anterieurs.';

drop trigger if exists trg_bureau_terme_requis on bureaux;
create trigger trg_bureau_terme_requis
  before insert on bureaux
  for each row execute function fn_bureau_terme_requis();


-- -----------------------------------------------------------------------------
-- 2. Un bureau CLOS ne se supprime plus
-- -----------------------------------------------------------------------------

/**
 * Le verrou est un TRIGGER et non une politique RLS.
 *
 * Une politique `delete` peut rendre la ligne invisible a la suppression, mais
 * elle le fait en SILENCE : l'appel repond « 0 ligne supprimee », l'ecran
 * annonce une reussite, et le bureau est toujours la. Le trigger, lui, REFUSE
 * en disant pourquoi — et c'est ce message que l'utilisateur doit lire.
 */
create or replace function fn_bureau_clos_immuable() returns trigger
language plpgsql as $$
begin
  if not old.is_active then
    raise exception
      'EF-BUR-08 : un bureau clos ne se supprime pas. Sa composition est citee '
      'par des rapports, des recus et le journal d''audit — elle se consulte '
      'dans les archives.'
      using errcode = 'check_violation';
  end if;

  return old;
end $$;

comment on function fn_bureau_clos_immuable is
  'EF-BUR-08 — effacer un bureau clos effacerait ce qui a ete : qui etait '
  'tresorier, qui a signe les comptes. La suppression reste ouverte sur un '
  'bureau EN COURS, ou elle rattrape une ouverture faite par erreur.';

drop trigger if exists trg_bureau_clos_immuable on bureaux;
create trigger trg_bureau_clos_immuable
  before delete on bureaux
  for each row execute function fn_bureau_clos_immuable();


/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, l'API pourrait
 * repondre sur une definition perimee des fonctions qu'on vient de poser.
 */
notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0059')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0060_rapport_confidentiel.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0060 — Un rapport reste confidentiel a son entite
-- =============================================================================
-- Reference : EF-RAP-18 (retire), RG-26, RG-27. Decision du 20 aout 2026.
--
-- CE QU'ON RETIRE, ET POURQUOI.
--
-- Un rapport pouvait etre PUBLIE : il devenait alors lisible par tout le
-- perimetre SANS `report.read`. C'etait la definition meme de « publier ».
--
-- Le defaut etait connu et documente des le lot 6, sans etre corrige. RG-26
-- omet les blocs qu'on n'a pas le droit de lire, mais elle le fait A LA
-- GENERATION, sous la session de CELUI QUI GENERE. Le contenu est ensuite fige
-- (RG-27). Un tresorier de district generait donc un rapport contenant ses
-- finances, le publiait, et TOUTE personne du district pouvait l'ouvrir — y
-- compris quelqu'un a qui `finance.read` avait ete refuse. L'omission avait
-- bien eu lieu, mais pour le mauvais lecteur.
--
-- Rejouer l'omission a la lecture aurait fait varier le document d'un lecteur a
-- l'autre : deux personnes citant « le rapport du 18 aout » n'auraient plus
-- parle du meme, et un rapport cesse alors d'etre un document. La seule autre
-- issue est de RESSERRER QUI PEUT L'OUVRIR — c'est celle-ci.
--
-- CE QUI DECIDE DESORMAIS : `report.read`, SEUL, AVEC SA PORTEE.
--
-- Un droit, une portee, une regle — la meme que partout ailleurs (RG-25). Il
-- n'y a plus deux chemins pour ouvrir un rapport, donc plus de chemin qu'on
-- oublie de refermer.
--
-- LES RAPPORTS DEJA PUBLIES NE SONT PAS REECRITS.
--
-- `statut = 'PUBLIE'` reste sur les lignes qui le portent, et `publie_le` avec.
-- C'est de l'HISTOIRE : ce rapport A ETE publie, quelqu'un l'a diffuse, et
-- effacer cette trace serait exactement ce que RG-27 interdit. Ce qui change
-- est que ce statut ne DONNE PLUS RIEN — il se lit, il n'ouvre plus.
--
-- La valeur 'PUBLIE' reste donc dans l'enumeration : la retirer casserait les
-- lignes existantes, et une enumeration ne se reduit pas sans reecrire ce qui
-- s'y refere.
--
-- REJOUABLE (regle 23) : `drop policy if exists` avant `create policy`, et
-- `create or replace` sur une fonction de trigger existante.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- La lecture ne depend plus que du droit
-- -----------------------------------------------------------------------------

drop policy if exists report_instances_select on report_instances;
create policy report_instances_select on report_instances
  for select to authenticated
  using (
    entity_in_scope(entity_id)
    and can('report.read', entity_id)
  );

comment on column report_instances.publie_le is
  'HISTORIQUE — la date a laquelle ce rapport a ete publie, du temps ou la '
  'publication existait (retiree le 20 aout 2026, migration 0060). Elle ne '
  'donne plus aucun acces : `report.read` decide seul.';


-- -----------------------------------------------------------------------------
-- Le trigger ne connait plus la publication
-- -----------------------------------------------------------------------------

/**
 * Identique a `0043` moins la branche de publication.
 *
 * RG-27 est INTACTE, et c'est l'essentiel de cette fonction : ni les donnees,
 * ni la structure qui les a produites, ni la periode d'un rapport genere ne
 * changent apres coup.
 *
 * PASSER A 'PUBLIE' EST DESORMAIS REFUSE. On aurait pu l'ignorer en silence —
 * le statut ne donnant plus rien, il serait devenu decoratif. Mais un statut
 * qu'on peut encore poser et qui ne fait rien est un piege pose pour plus
 * tard : quelqu'un le verrait dans l'enumeration, le poserait, et croirait
 * avoir diffuse. Le refus dit ce qui a change.
 */
create or replace function fn_rapport_before_update() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.statut = 'PUBLIE' and old.statut is distinct from 'PUBLIE' then
    raise exception
      'La publication a ete retiree : un rapport reste confidentiel a son '
      'entite, et son acces se decide par le droit de lecture.'
      using errcode = 'check_violation';
  end if;

  /**
   * RG-27 — UN RAPPORT GENERE EST FIGE.
   *
   * Ni ses donnees, ni la structure qui les a produites, ni sa periode ne
   * changent apres coup. Sans ce verrou, « corriger » un rapport diffuse
   * reecrirait l'histoire sans laisser de trace — et deux personnes citant le
   * meme rapport ne parleraient plus du meme document.
   */
  if (new.contenu, new.template_snapshot, new.periode_debut, new.periode_fin, new.entity_id)
     is distinct from
     (old.contenu, old.template_snapshot, old.periode_debut, old.periode_fin, old.entity_id)
  then
    raise exception
      'RG-27 : un rapport genere est fige ; regenerez-en un nouveau plutot que de le modifier.';
  end if;

  return new;
end $$;

comment on function fn_rapport_before_update is
  'RG-27 — un rapport genere est fige. Depuis 0060, la publication n''existe '
  'plus : `report.read` decide seul qui peut ouvrir un rapport.';


/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, l'API repondrait sur
 * une definition perimee de la fonction qu'on vient de remplacer.
 */
notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0060')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0061_ordre_protocolaire_des_fonctions.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0061 — L'ordre protocolaire des fonctions revient, pour une AUTRE raison
-- =============================================================================
-- Reference : EF-REF-02, EF-REF-03. Demande de l'utilisateur, 20 aout 2026.
--
-- CETTE MIGRATION DEFAIT LA 0022, ET IL FAUT DIRE POURQUOI CE N'EST PAS UN
-- REVIREMENT.
--
-- La colonne a ete supprimee le 9 aout 2026 (migration 0022) parce qu'elle
-- servait a DEDUIRE l'organigramme d'un bureau : rang 10 en racine, rang 20 en
-- dessous. Depuis la 0021 l'organigramme se DESSINE — on pose les blocs, on
-- tire les traits — et le rang ne decidait donc plus de rien. Un champ qui ne
-- decide de rien devient un piege : quelqu'un finit par croire qu'il compte.
--
-- Ce raisonnement reste JUSTE, et il n'est pas remis en cause : la hierarchie
-- d'un bureau vit dans `bureau_postes`, propre a chaque bureau, et nulle part
-- ailleurs. Cette colonne-ci ne la touche pas.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE : elle donne son ORDRE D'AFFICHAGE a la
-- liste des fonctions. L'ordre alphabetique qui l'avait remplacee presentait le
-- tresorier avant le president dans la composition d'un bureau, ce qu'aucune
-- assemblee ne fait. C'est une question de PRESENTATION, pas de deduction.
--
-- La distinction tient a un mot : la 0022 retirait un rang qui PRETENDAIT dire
-- la hierarchie ; celle-ci pose un rang qui ne pretend rien de plus que l'ordre
-- dans lequel on lit une liste.
--
-- LES VALEURS DE DEPART REPRENNENT L'ORDRE ALPHABETIQUE ACTUEL.
--
-- Un defaut uniforme a 100 laisserait l'ordre indefini : la liste changerait
-- toute seule au premier rechargement, sans que personne n'ait rien demande.
-- En partant de ce qui est deja a l'ecran, la migration ne DEPLACE rien — elle
-- rend seulement l'ordre modifiable. Ce qui bouge ensuite bouge parce qu'on l'a
-- voulu.
--
-- Espacement de dix, comme l'action de reordonnancement : il laisse la place a
-- une insertion sans toucher aux voisines.
--
-- REJOUABLE (regle 23) : `add column if not exists`, et l'initialisation est
-- bornee aux lignes restees au defaut — un rejeu ne defait donc pas un ordre
-- pose entre-temps a l'ecran.
-- =============================================================================

alter table fonctions
  add column if not exists ordre_protocolaire smallint not null default 100;

comment on column fonctions.ordre_protocolaire is
  'EF-REF-02 : ordre d''AFFICHAGE de la liste des fonctions, pose au '
  'glisser-deposer. Ne decrit PAS la hierarchie d''un bureau — celle-ci vit '
  'dans bureau_postes, propre a chaque bureau (voir 0021 et 0022).';

/**
 * Reprise : on numerote par ordre alphabetique, et SEULEMENT ce qui est reste
 * au defaut. Le `where` est ce qui rend la migration rejouable sans degat.
 */
with rangs as (
  select id, row_number() over (order by libelle) * 10 as rang
  from fonctions
)
update fonctions f
   set ordre_protocolaire = r.rang
  from rangs r
 where r.id = f.id
   and f.ordre_protocolaire = 100;

comment on table fonctions is
  'Role occupe au sein d''un bureau — EF-REF-03. '
  'La hierarchie ne vit pas ici : elle est propre a chaque bureau '
  '(bureau_postes). ordre_protocolaire ne fixe que l''ordre d''affichage.';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0061')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0062_reordonner_referentiel.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0062 — Reordonner un referentiel en UNE ecriture
-- =============================================================================
-- Reference : EF-REF-02, regle 20 (deux ecritures indissociables se font en
--             base), regle 28 (le nombre d'allers-retours).
--
-- CE QUI NE MARCHAIT PAS, ET POURQUOI L'ERREUR ARRIVE LOIN DE SA CAUSE
--
-- L'action envoyait la liste reordonnee en un seul `upsert` :
--
--     upsert([{ id, ordre_protocolaire: 10 }, …], { onConflict: 'id' })
--
-- PostgREST le traduit en `insert … on conflict (id) do update`. Or PostgreSQL
-- VALIDE LE TUPLE INSERE AVANT de resoudre le conflit : `code` et `libelle`
-- sont `not null` SANS defaut, et l'ecriture echouait donc en 23502 —
-- « null value in column "code" violates not-null constraint » — alors qu'on
-- ne voulait rien inserer du tout.
--
-- Le message accuse une colonne a laquelle on ne touchait pas. C'est ce qui
-- rend la panne difficile a lire : `upsert` ressemble a « mets a jour si ca
-- existe », mais c'est un INSERT qui se rattrape, pas un UPDATE qui s'etend.
--
-- POURQUOI UNE FONCTION PLUTOT QUE N `update`
--
-- Reordonner dix fonctions par dix appels, c'est dix allers-retours a 0,5–4 s
-- (regle 28) — et surtout, une interruption a mi-parcours laisserait un ordre
-- A MOITIE APPLIQUE : deux fonctions au meme rang, ou un trou. L'etat
-- intermediaire est faux ET indetectable, donc l'ecriture se fait en base
-- (regle 20).
--
-- SECURITY INVOKER (le defaut) : les politiques `*_write` exigent
-- `has_perm('referentiel.manage')`, et elles s'appliquent a l'appelant. La
-- fonction n'accorde donc rien que l'appelant n'ait deja — elle ne fait que
-- grouper.
--
-- LA LISTE BLANCHE N'EST PAS DECORATIVE. Le nom de table vient du client.
-- `format(%I)` echappe l'identifiant, ce qui empeche l'injection mais PAS de
-- viser une autre table — `profiles`, par exemple, n'a pas de colonne `ordre`,
-- mais le raisonnement ne doit pas dependre de cela. On enumere donc ce qui est
-- reordonnable, et le reste est refuse en le disant.
--
-- Cette liste DOIT rester alignee sur les entrees `colonneOrdre` de
-- `lib/domain/referentiels.ts` ; un test lit ce fichier et compare.
--
-- REJOUABLE (regle 23) : `create or replace` sur une fonction dont la signature
-- ne change pas.
-- =============================================================================

create or replace function fn_reordonner_referentiel(p_table text, p_ids uuid[])
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_colonne text;
  v_touchees integer;
begin
  v_colonne := case p_table
    when 'grades'             then 'ordre'
    when 'finance_categories' then 'ordre'
    when 'fonctions'          then 'ordre_protocolaire'
    else null
  end;

  if v_colonne is null then
    raise exception 'Ce referentiel ne se reordonne pas : %', p_table
      using errcode = 'invalid_parameter_value';
  end if;

  /**
   * `with ordinality` donne le rang SANS le calculer : c'est la position dans
   * le tableau recu, donc exactement l'ordre pose a l'ecran.
   *
   * Espacement de dix : une valeur creee plus tard, ou par un import, doit
   * pouvoir s'inserer entre deux voisines sans qu'on ait a les renumeroter.
   */
  execute format(
    'update %I t
        set %I = r.rang * 10
       from unnest($1) with ordinality as r(id, rang)
      where t.id = r.id',
    p_table, v_colonne
  ) using p_ids;

  get diagnostics v_touchees = row_count;

  /**
   * On rend le NOMBRE DE LIGNES TOUCHEES plutot que rien.
   *
   * Un identifiant qui ne correspond a aucune ligne — supprimee entre-temps,
   * ou hors de ce que la RLS laisse voir — ne fait pas echouer l'ordre : il est
   * simplement ignore. L'appelant peut comparer au nombre envoye et le dire,
   * au lieu d'annoncer une reussite complete sur une reussite partielle.
   */
  return v_touchees;
end $$;

comment on function fn_reordonner_referentiel is
  'EF-REF-02 : pose l''ordre d''affichage d''un referentiel en UNE ecriture. '
  'SECURITY INVOKER — les politiques *_write exigent referentiel.manage. '
  'La liste blanche des tables doit rester alignee sur les entrees '
  'colonneOrdre de lib/domain/referentiels.ts.';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0062')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0063_apparence_et_notifications.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0063 — L'apparence et les notifications se reglent, au lieu d'etre ecrites
-- =============================================================================
-- Reference : EF-ADM-13 (les options configurables au meme endroit), regle 21
--             (un parametre configurable se lit a chaque rendu).
--
-- CE QUI ETAIT FIGE
--
-- La couleur des boutons vivait dans `--primary` de `globals.css`, et la duree
-- d'une notification dans les props du `Toaster`. Les deux se changent en
-- editant du code et en redeployant — autant dire qu'elles ne se changent pas.
--
-- POURQUOI DES JETONS ET NON DES CLASSES
--
-- Regle 32, payee une fois : une classe Tailwind fabriquee a la volee n'existe
-- dans aucune feuille — Tailwind lit le SOURCE, il ne devine pas ce que le
-- serveur enverra. Une valeur arbitraire pointant une variable CSS casse la
-- compilation de TOUTE la feuille. La couleur voyage donc comme une VALEUR, et
-- se pose sur la variable `--primary` du document.
--
-- POURQUOI LE CONTRASTE N'EST PAS UN CHAMP
--
-- On ne demande PAS la couleur du texte des boutons : elle se deduit de la
-- luminance du fond choisi. La laisser saisir permettrait de poser du blanc sur
-- du jaune, et personne ne relit un bouton qu'il a lui-meme regle.
--
-- LES NOTIFICATIONS : CE QUI SE REGLE, ET CE QUI NE SE REGLE PAS
--
-- La regle 30 tient : seule une CONFIRMATION passe par une notification, tout
-- le reste — refus, avertissement, panne — va dans un pop-up qu'on ferme.
-- Ces reglages ne rouvrent pas ce que cette regle a ferme : ils ne decident que
-- de la maniere dont s'affiche ce qui a DEJA le droit de s'y afficher.
--
-- REJOUABLE (regle 23) : `add column if not exists`.
-- =============================================================================

alter table organisation_settings
  add column if not exists couleur_primaire text not null default '#0f172a',
  add column if not exists toast_duree_ms integer not null default 4000,
  add column if not exists toast_bouton_fermer boolean not null default true,
  add column if not exists toast_couleurs_vives boolean not null default true;

/**
 * La couleur est une valeur QUE L'ON POSE DANS UNE FEUILLE DE STYLE : elle doit
 * etre un hexadecimal, et rien d'autre. Sans cette contrainte, une chaine
 * quelconque irait telle quelle dans un attribut `style` — la borne est ici,
 * pas seulement dans le formulaire.
 */
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organisation_settings_couleur_valide'
  ) then
    alter table organisation_settings
      add constraint organisation_settings_couleur_valide
      check (couleur_primaire ~ '^#[0-9a-fA-F]{6}$');
  end if;
end $$;

/**
 * Bornes de la duree : ni trop courte pour etre lue, ni assez longue pour
 * s'empiler. Deux secondes suffisent a « Croyant enregistre » ; au-dela de
 * vingt, une notification cesse d'etre une notification.
 */
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organisation_settings_toast_duree'
  ) then
    alter table organisation_settings
      add constraint organisation_settings_toast_duree
      check (toast_duree_ms between 2000 and 20000);
  end if;
end $$;

comment on column organisation_settings.couleur_primaire is
  'EF-ADM-13 : couleur des boutons principaux. Posee sur --primary a chaque '
  'rendu (regle 21). Le contraste du texte s''en DEDUIT, il ne se saisit pas.';

comment on column organisation_settings.toast_duree_ms is
  'EF-ADM-13 : duree d''affichage d''une notification de confirmation. La '
  'regle 30 reste entiere — un refus ou une panne ne passe pas par la.';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0063')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0064_poste_en_derivation.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0064 — Le poste en derivation : un adjoint sur le tronc
-- =============================================================================
-- Reference : EF-BUR-07. Demande de l'utilisateur, 20 aout 2026, sur modele
--             fourni : « Directeur general » en tete, « Vice-president
--             adjoint » accroche au trait vertical qui en descend, decale sur
--             le cote, AU-DESSUS de la rangee des autres subordonnes.
--
-- CE QUE C'EST, ET CE QUE CE N'EST PAS
--
-- C'est le motif classique du poste EN DERIVATION : adjoint, cabinet, assistant
-- de direction. Il depend du meme superieur que les autres, mais il ne se RANGE
-- pas avec eux — il se pose a cote du tronc, entre le superieur et la rangee.
--
-- CE N'EST DONC PAS UN NIVEAU DE PLUS. Le vice-president adjoint est bien un
-- enfant du directeur general : lui donner un rang intermediaire decalerait
-- toute la descendance d'un cran, et changerait la hierarchie pour obtenir un
-- effet de dessin. Ce qui change est le PLACEMENT, pas la parente.
--
-- D'OU UN DRAPEAU SUR LE POSTE, et non une table ni un `parent_fonction_id`
-- detourne. `parent_fonction_id` continue de dire de qui l'on depend ;
-- `en_derivation` dit seulement ou l'on se dessine.
--
-- CE QUE LE DRAPEAU NE TOUCHE PAS
--
-- La composition tabulaire reste la source des vacances (EF-BUR-04) : elle
-- enumere les fonctions applicables, l'organigramme ne fait que les placer.
-- Un poste en derivation est un poste comme un autre — il s'occupe, il se
-- libere, il compte dans les effectifs de bureau.
--
-- UNE RACINE NE PEUT PAS ETRE EN DERIVATION : il n'y a pas de tronc au-dessus
-- d'elle a quoi s'accrocher. Le cas se produirait en detachant un bloc deja
-- marque, et le dessin n'aurait alors nulle part ou le poser. La contrainte
-- l'interdit plutot que de laisser l'impression choisir a notre place.
--
-- REJOUABLE (regle 23) : `add column if not exists`, contrainte sous garde.
-- =============================================================================

alter table bureau_postes
  add column if not exists en_derivation boolean not null default false;

comment on column bureau_postes.en_derivation is
  'EF-BUR-07 : le poste se dessine A COTE DU TRONC de son superieur, pas dans '
  'la rangee de ses freres — adjoint, cabinet. Ne change NI la parente, NI le '
  'niveau : seulement le placement, a l''ecran comme a l''impression.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'postes_derivation_a_un_parent'
  ) then
    alter table bureau_postes
      add constraint postes_derivation_a_un_parent
      check (not en_derivation or parent_fonction_id is not null);
  end if;
end $$;

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0064')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0065_position_des_notifications.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0065 — Ou apparaissent les notifications
-- =============================================================================
-- Reference : EF-ADM-13. Demande de l'utilisateur, 20 aout 2026, sur capture
--             de l'ecran equivalent d'un autre de ses projets.
--
-- POURQUOI LA POSITION SE REGLE
--
-- Elle etait en dur, en haut a droite. C'est le mauvais coin sur les ecrans de
-- cette application : le menu ⋮ d'une ligne de tableau, le bouton d'export et
-- les actions d'en-tete y vivent tous. Une notification qui s'y pose recouvre
-- exactement ce sur quoi on vient de cliquer, au moment ou l'on s'apprete a
-- cliquer a nouveau.
--
-- CE QUE LA LISTE CONTIENT, ET POURQUOI ELLE EST CLOSE
--
-- Les six coins que Sonner accepte, pas un de plus. Ecrire une valeur libre
-- ferait passer au composant une chaine qu'il ignorerait en silence — la
-- notification reviendrait a son defaut, et personne ne comprendrait pourquoi
-- le reglage « ne marche pas » (regle 18 : un ensemble clos et connu).
--
-- REJOUABLE (regle 23) : `add column if not exists`, contrainte sous garde.
-- =============================================================================

alter table organisation_settings
  add column if not exists toast_position text not null default 'bottom-right';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organisation_settings_toast_position'
  ) then
    alter table organisation_settings
      add constraint organisation_settings_toast_position
      check (toast_position in (
        'top-left', 'top-center', 'top-right',
        'bottom-left', 'bottom-center', 'bottom-right'
      ));
  end if;
end $$;

comment on column organisation_settings.toast_position is
  'EF-ADM-13 : coin ou apparaissent les notifications de confirmation. Les six '
  'valeurs que Sonner accepte, et rien d''autre — une chaine inconnue serait '
  'ignoree en silence et le reglage paraitrait sans effet.';

-- LE DEFAUT EST `bottom-right`, et non l'ancien `top-right` code en dur.
-- En haut a droite vivent le menu ⋮ des lignes, le bouton d'export et les
-- actions d'en-tete : la notification s'y posait sur ce qu'on venait de
-- cliquer. `add column` pose ce defaut sur la ligne existante — aucune reprise
-- n'est necessaire.

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0065')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0066_motif_de_retrait.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0066 — Retirer un titulaire : une erreur, ou une decision
-- =============================================================================
-- Reference : EF-BUR-08, RG-08. Demande du 20 aout 2026.
--
-- DEUX GESTES QUE L'APPLICATION CONFONDAIT.
--
-- « Retirer » fermait le mandat du jour, sans rien demander. Or deux situations
-- tres differentes passaient par ce meme bouton :
--
--   1. UNE ERREUR D'ASSIGNATION. On a designe Rakoto au lieu de Rabe, on s'en
--      apercoit le lendemain. Ce n'est pas un evenement de la vie de Rakoto,
--      c'est une faute de frappe. La fermer laissait pourtant dans sa frise un
--      mandat d'un jour, que personne ne peut expliquer et que tout le monde
--      lira un jour comme une destitution.
--
--   2. UN RETRAIT EN COURS DE MANDAT. Deces, demission, sanction. La, c'est un
--      evenement, il compte, et il DOIT etre motive — un mandat interrompu sans
--      raison ecrite est exactement ce qu'on cherchera dans dix ans.
--
-- CE QUE CETTE MIGRATION APPORTE : `motif_retrait`.
--
-- Nullable, et il le restera. Un mandat se clot aussi par la FERMETURE DE SON
-- BUREAU (`fn_clore_bureau`) ou par un REMPLACEMENT : ni l'un ni l'autre n'est
-- un retrait, et exiger un motif les ferait echouer. La colonne dit donc « ce
-- mandat a ete interrompu, et voici pourquoi » — pas « tout mandat clos a un
-- motif ».
--
-- L'OBLIGATION VIT DANS L'ACTION, pas dans une contrainte : elle depend du
-- GESTE, que la base ne voit pas. Une contrainte ne saurait pas distinguer une
-- cloture de bureau d'un retrait individuel.
--
-- LA FENETRE DE 15 JOURS N'EST PAS ICI NON PLUS. Elle porte sur la SUPPRESSION
-- de la ligne — le cas 1 —, et une ligne supprimee ne laisse rien a contraindre.
-- C'est l'action qui la tient, et le journal d'audit qui garde la trace : la
-- fiche du croyant, elle, doit redevenir vierge, c'est tout l'objet du cas 1.
--
-- REJOUABLE (regle 23) : `add column if not exists`.
-- =============================================================================

alter table bureau_membres
  add column if not exists motif_retrait text;

comment on column bureau_membres.motif_retrait is
  'EF-BUR-08 — pourquoi ce mandat a ete INTERROMPU avant son terme : deces, '
  'demission, sanction. Reste NULL quand le mandat s''acheve normalement, par '
  'la cloture de son bureau ou par un remplacement — ce ne sont pas des '
  'retraits, et exiger un motif les ferait echouer.';


/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, la colonne resterait
 * invisible a l'API et l'ecriture repondrait « column ... does not exist » sur
 * du SQL pourtant en place.
 */
notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0066')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0067_promotion_de_grade.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0067 — La promotion de grade passe par l'entite superieure
-- =============================================================================
-- Reference : EF-CRO-12, RG-06. Demande du 20 aout 2026.
--
-- LE BESOIN. Changer le grade d'un croyant — le faire Diacre, puis Pasteur —
-- n'est pas une correction de fiche : c'est une reconnaissance, et elle engage
-- l'organisation. Aujourd'hui, quiconque detient `croyant.update` sur l'eglise
-- la pose seul, et rien n'en garde trace au-dela d'une ligne d'audit.
--
-- CE QUE CETTE MIGRATION APPORTE : un circuit, ACTIVABLE.
--
--   1. `organisation_settings.promotion_grade_validation` — le workflow existe
--      ou n'existe pas. Ferme, le grade se change comme avant : cette demande
--      n'invalide pas les organisations qui n'en veulent pas.
--   2. `promotions_grade` — la demande, et ce qu'elle est devenue.
--   3. `fn_decider_promotion` — approuver POSE le grade, en une transaction.
--
-- LE REGLAGE EST GLOBAL, PAS PAR ENTITE — et c'est l'ecart a signaler.
--
-- Le workflow financier, lui, s'active entite par entite (EF-FIN-15 amende) :
-- chaque bureau gere ses comptes. Un grade ne se compare pas : il vaut dans
-- TOUTE l'organisation. « Pasteur a Antananarivo » et « Pasteur a Toamasina »
-- doivent designer la meme chose, sans quoi le referentiel ne veut plus rien
-- dire. Un circuit ouvert ici et ferme la produirait exactement cela.
--
-- QUI DECIDE : L'ENTITE SUPERIEURE, FIGEE A LA DEMANDE.
--
-- `arbitre_id` porte le PARENT de l'eglise du croyant, copie au moment de la
-- demande — meme mecanique que `ancetre_commun_id` sur les transferts (`0011`).
-- Le figer evite qu'une reorganisation de la structure change, apres coup, qui
-- etait competent : une demande se juge sous la hierarchie du jour ou elle a
-- ete faite.
--
-- La competence tombe alors d'elle-meme : `can(..., arbitre_id)` n'est vrai que
-- pour un compte dont la portee couvre le PARENT. Celui qui est borne a
-- l'eglise ne peut pas s'approuver lui-meme, et il n'y a aucune regle de plus
-- a ecrire pour cela.
--
-- CE QU'ON NE FAIT PAS : toucher `croyants.grade_id` autrement que par
-- `fn_decider_promotion`. La table des demandes ne duplique pas le grade
-- courant — elle porte celui qu'on QUITTE et celui qu'on VISE, pour que le
-- document se relise ; le grade en vigueur reste sur la fiche, source unique.
--
-- REJOUABLE (regle 23) : `if not exists` partout, `drop policy` avant `create`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Le reglage
-- -----------------------------------------------------------------------------

alter table organisation_settings
  add column if not exists promotion_grade_validation boolean not null default false;

comment on column organisation_settings.promotion_grade_validation is
  'EF-CRO-12 — la promotion de grade doit-elle etre approuvee par l''entite '
  'superieure ? Ferme (defaut), le grade se change directement : cette regle '
  'n''invalide pas les organisations qui n''en veulent pas.';


-- -----------------------------------------------------------------------------
-- 2. La demande
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'statut_promotion') then
    create type statut_promotion as enum ('DEMANDE', 'APPROUVE', 'REFUSE', 'ANNULE');
  end if;
end $$;

create table if not exists promotions_grade (
  id             uuid primary key default gen_random_uuid(),
  croyant_id     uuid not null references croyants(id) on delete cascade,

  /**
   * LE GRADE QU'ON QUITTE, copie a la demande.
   *
   * Nullable : une fiche peut n'en porter aucun. Le conserver ici plutot que de
   * le relire sur la fiche au moment de decider est ce qui rend la demande
   * RELISIBLE — « de Croyant a Diacre » se comprend six mois plus tard, quand
   * la fiche porte deja autre chose.
   */
  grade_actuel_id  uuid references grades(id) on delete set null,
  grade_demande_id uuid not null references grades(id) on delete restrict,

  /** L'entite SUPERIEURE competente, figee : voir l'en-tete. */
  arbitre_id     uuid not null references entities(id) on delete restrict,
  /** L'eglise du croyant au moment de la demande — porte la RLS de lecture. */
  eglise_id      uuid not null references entities(id) on delete restrict,

  statut         statut_promotion not null default 'DEMANDE',
  motif          text,
  motif_refus    text,

  demande_par    uuid references profiles(id) on delete set null,
  date_demande   timestamptz not null default now(),
  decide_par     uuid references profiles(id) on delete set null,
  date_decision  timestamptz,

  -- Une promotion vers le grade qu'on porte deja n'est pas une promotion.
  constraint promotion_grade_different check (grade_actuel_id is distinct from grade_demande_id)
);

comment on table promotions_grade is
  'EF-CRO-12 — demande de changement de grade, tranchee par l''entite '
  'superieure. Le grade en vigueur reste sur la fiche du croyant : cette table '
  'porte la DEMANDE, pas l''etat.';

/**
 * RG-06 — UNE SEULE DEMANDE EN COURS PAR CROYANT.
 *
 * L'index partiel dit la regle mieux qu'un trigger : elle tient meme si
 * l'application se trompe. Deux demandes ouvertes laisseraient l'entite
 * superieure trancher deux fois, et le second verdict ecraserait le premier
 * sans que personne ne l'ait voulu.
 */
create unique index if not exists promotions_une_en_cours
  on promotions_grade (croyant_id)
  where statut = 'DEMANDE';

create index if not exists promotions_arbitre_idx
  on promotions_grade (arbitre_id, date_demande)
  where statut = 'DEMANDE';

alter table promotions_grade enable row level security;

/**
 * LA LECTURE SUIT DEUX CHEMINS, et il en faut bien deux.
 *
 * L'eglise doit voir les demandes qu'elle a faites — sinon elle ne saurait pas
 * ou elles en sont. L'arbitre doit voir celles qu'il a a trancher, y compris
 * quand l'eglise concernee n'est pas dans sa portee de lecture directe.
 */
drop policy if exists promotions_select on promotions_grade;
create policy promotions_select on promotions_grade for select to authenticated
  using (entity_in_scope(eglise_id) or entity_in_scope(arbitre_id));

/**
 * DEMANDER, C'EST METTRE A JOUR LE CROYANT — meme droit, meme portee.
 *
 * `croyant.update` sur l'eglise : celui qui pouvait poser le grade lui-meme
 * avant ce circuit peut desormais le DEMANDER. On ne cree pas un droit de plus
 * pour un geste qui n'a pas change de nature ; ce qui a change, c'est qui
 * tranche.
 */
drop policy if exists promotions_insert on promotions_grade;
create policy promotions_insert on promotions_grade for insert to authenticated
  with check (can('croyant.update', eglise_id));

/**
 * LA DECISION PASSE PAR LA FONCTION, pas par un `update` direct : elle doit
 * poser le grade DANS LA MEME TRANSACTION (regle 20). La politique couvre le
 * retrait de sa propre demande — l'eglise peut se raviser tant que rien n'est
 * tranche.
 */
drop policy if exists promotions_update on promotions_grade;
create policy promotions_update on promotions_grade for update to authenticated
  using (statut = 'DEMANDE' and can('croyant.update', eglise_id))
  with check (statut in ('DEMANDE', 'ANNULE'));


-- -----------------------------------------------------------------------------
-- 3. Decider — approuver POSE le grade, d'un seul tenant
-- -----------------------------------------------------------------------------

/**
 * DEUX ECRITURES INDISSOCIABLES (regle 20) : la demande se ferme ET le grade
 * change. L'une sans l'autre laisserait soit une promotion approuvee qui n'a
 * rien change, soit un grade pose dont la demande reste ouverte — deux etats
 * faux que rien n'affiche.
 *
 * SECURITY DEFINER, et le droit est verifie ICI, sur l'ARBITRE : c'est le
 * coeur de la regle. `can(..., arbitre_id)` n'est vrai que pour un compte dont
 * la portee couvre l'entite superieure ; celui qui est borne a l'eglise ne peut
 * pas s'approuver lui-meme.
 */
create or replace function fn_decider_promotion(
  p_promotion uuid,
  p_approuver boolean,
  p_motif     text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_arbitre uuid;
  v_croyant uuid;
  v_grade   uuid;
  v_profil  uuid := current_profile_id();
begin
  select arbitre_id, croyant_id, grade_demande_id
    into v_arbitre, v_croyant, v_grade
    from promotions_grade
   where id = p_promotion and statut = 'DEMANDE'
     for update;

  if v_arbitre is null then
    raise exception 'Cette demande est introuvable ou deja tranchee.'
      using errcode = 'no_data_found';
  end if;

  if not can('croyant.grade.approve', v_arbitre) then
    raise exception 'Seule l''entite superieure peut trancher une promotion de grade.'
      using errcode = 'insufficient_privilege';
  end if;

  /**
   * UN REFUS SE MOTIVE, une approbation non.
   *
   * Approuver confirme ce que la demande disait deja ; refuser dit le
   * contraire, et celui qui a demande doit pouvoir comprendre pourquoi sans
   * avoir a telephoner.
   */
  if not p_approuver and coalesce(trim(p_motif), '') = '' then
    raise exception 'Un refus de promotion doit etre motive.'
      using errcode = 'check_violation';
  end if;

  update promotions_grade
     set statut        = case when p_approuver then 'APPROUVE' else 'REFUSE' end,
         motif_refus   = case when p_approuver then null else trim(p_motif) end,
         decide_par    = v_profil,
         date_decision = now()
   where id = p_promotion;

  -- Le grade ne se pose QUE sur approbation, et seulement ici.
  if p_approuver then
    update croyants set grade_id = v_grade where id = v_croyant;
  end if;

  return case when p_approuver then 'APPROUVE' else 'REFUSE' end;
end $$;

comment on function fn_decider_promotion is
  'EF-CRO-12 — approuve ou refuse une promotion de grade. Approuver POSE le '
  'grade dans la meme transaction : l''un sans l''autre laisserait un etat faux '
  'que rien n''affiche. Le droit est verifie sur l''ARBITRE, donc sur l''entite '
  'superieure.';

revoke execute on function fn_decider_promotion from anon;


/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, l'API repondrait
 * « fonction inconnue » et « column ... does not exist » sur du SQL pourtant
 * en place — constate deux fois.
 */
notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0067')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0068_decision_promotion_typee.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0068 — La décision de promotion écrit un ENUM, pas du texte
-- =============================================================================
-- Reference : EF-CRO-12. Constate a l'essai du 21 aout 2026, sur le bouton
-- « Approuver » : « column "statut" is of type statut_promotion but expression
-- is of type text ».
--
-- LA CAUSE.
--
-- `fn_decider_promotion` (migration `0067`) ecrivait :
--
--     set statut = case when p_approuver then 'APPROUVE' else 'REFUSE' end
--
-- PostgreSQL resout les litteraux d'un `case` en TEXT — le type de la colonne
-- n'entre pas dans cette resolution — puis refuse d'affecter du texte a une
-- colonne enumeree. Le refus arrive donc a l'EXECUTION, jamais a l'ecriture de
-- la migration : le SQL est syntaxiquement correct, et rien ne signale
-- l'incompatibilite tant que personne n'appuie sur le bouton.
--
-- CE PIEGE A DEJA ETE PAYE, et le code en portait meme la trace : dans
-- `fn_saisir_collecte_dime`, un `coalesce` sur `nature_versement` s'accompagne
-- du commentaire « exige des types compatibles : les deux branches sont
-- typees ». La lecon n'avait pas ete reportee ici.
--
-- LA REGLE A RETENIR : dans une fonction, TOUT LITTERAL DESTINE A UNE COLONNE
-- ENUMEREE SE TYPE EXPLICITEMENT. Un `insert … values ('APPROUVE')` passe,
-- parce que PostgreSQL connait alors la colonne cible ; un `case`, un
-- `coalesce` ou un `nullif` ne le savent pas.
--
-- La fonction est par ailleurs IDENTIQUE a celle de `0067` : meme controle du
-- droit sur l'ARBITRE, meme refus motive, meme pose du grade dans la meme
-- transaction (regle 20).
--
-- REJOUABLE (regle 23) : `create or replace` sur une signature inchangee.
-- =============================================================================

create or replace function fn_decider_promotion(
  p_promotion uuid,
  p_approuver boolean,
  p_motif     text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_arbitre uuid;
  v_croyant uuid;
  v_grade   uuid;
  v_profil  uuid := current_profile_id();
  v_statut  statut_promotion;
begin
  select arbitre_id, croyant_id, grade_demande_id
    into v_arbitre, v_croyant, v_grade
    from promotions_grade
   where id = p_promotion and statut = 'DEMANDE'
     for update;

  if v_arbitre is null then
    raise exception 'Cette demande est introuvable ou deja tranchee.'
      using errcode = 'no_data_found';
  end if;

  -- Le droit se verifie sur l'ARBITRE : un compte borne a l'eglise ne couvre
  -- pas son parent, donc ne peut pas s'approuver lui-meme.
  if not can('croyant.grade.approve', v_arbitre) then
    raise exception 'Seule l''entite superieure peut trancher une promotion de grade.'
      using errcode = 'insufficient_privilege';
  end if;

  /**
   * UN REFUS SE MOTIVE, une approbation non. Approuver confirme ce que la
   * demande disait deja ; refuser dit le contraire, et celui qui a demande doit
   * pouvoir comprendre pourquoi sans avoir a telephoner.
   */
  if not p_approuver and coalesce(trim(p_motif), '') = '' then
    raise exception 'Un refus de promotion doit etre motive.'
      using errcode = 'check_violation';
  end if;

  /**
   * LE STATUT EST CALCULE DANS UNE VARIABLE TYPEE.
   *
   * C'est la correction de cette migration : une variable declaree
   * `statut_promotion` force la resolution du litteral vers l'enum, la ou un
   * `case` place directement dans le `set` la laissait en `text`.
   *
   * Ecrire la conversion ici plutot qu'un `::statut_promotion` en fin
   * d'expression la rend difficile a perdre : la prochaine main qui touchera au
   * `case` heritera du bon type sans avoir a y penser.
   */
  v_statut := (case when p_approuver then 'APPROUVE' else 'REFUSE' end)::statut_promotion;

  update promotions_grade
     set statut        = v_statut,
         motif_refus   = case when p_approuver then null else trim(p_motif) end,
         decide_par    = v_profil,
         date_decision = now()
   where id = p_promotion;

  -- Le grade ne se pose QUE sur approbation, et seulement ici : l'un sans
  -- l'autre laisserait une promotion accordee qui n'a rien change (regle 20).
  if p_approuver then
    update croyants set grade_id = v_grade where id = v_croyant;
  end if;

  return v_statut::text;
end $$;

comment on function fn_decider_promotion is
  'EF-CRO-12 — approuve ou refuse une promotion de grade. Approuver POSE le '
  'grade dans la meme transaction. Le droit est verifie sur l''ARBITRE. Le '
  'statut passe par une variable TYPEE : un case rend du text, que PostgreSQL '
  'refuse d''affecter a une colonne enumeree (corrige le 21 aout 2026).';

revoke execute on function fn_decider_promotion from anon;


/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, l'API continuerait
 * d'appeler la definition perimee, et le meme refus se reproduirait sur du SQL
 * pourtant corrige.
 */
notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0068')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0069_delai_correction_saisie.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0069 — Le delai de correction de saisie se regle, au lieu d'etre ecrit deux fois
-- =============================================================================
-- Reference : EF-BUR-08, EF-CRO-12. Demande de l'utilisateur, 21 aout 2026.
--
-- CE QUI ETAIT FIGE, ET DEUX FOIS
--
-- `JOURS_ERREUR_ASSIGNATION` (retrait d'un titulaire de bureau) et
-- `JOURS_ERREUR_GRADE` (correction d'un grade) valaient tous deux 15, ecrits
-- separement dans `lib/domain/bureau.ts` et `lib/domain/promotion.ts`. La meme
-- regle a deux endroits ne diverge pas le jour ou on l'ecrit — elle diverge le
-- jour ou on retouche l'un sans penser a l'autre. C'est exactement ce que le
-- projet a deja paye avec `bureau.delete`, non delegable en TypeScript et
-- delegable en SQL (migration 0025).
--
-- CE QUE CE DELAI BORNE : UN EFFACEMENT
--
-- « Erreur de saisie » ne clot pas un mandat ou une ligne d'historique, elle
-- l'EFFACE. Le delai est donc lu au moment de l'ECRITURE, jamais mis en cache
-- dans un formulaire ouvert depuis des heures : un onglet reste ouvert pendant
-- qu'on resserre le delai en administration, et il continuerait sinon d'effacer
-- sous l'ancienne regle (regle 21).
--
-- LA BORNE : NI ZERO NI UN AN
--
-- Un delai nul supprimerait la notion d'erreur rattrapable. Au-dela d'un an,
-- « correction de saisie » ne voudrait plus rien dire — une contrainte interdit
-- l'impossible, pas l'inhabituel (regle 26).
--
-- REJOUABLE (regle 23) : `add column if not exists`, contrainte sous garde.
-- =============================================================================

alter table organisation_settings
  add column if not exists jours_correction_saisie smallint not null default 15;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organisation_settings_delai_correction'
  ) then
    alter table organisation_settings
      add constraint organisation_settings_delai_correction
      check (jours_correction_saisie between 1 and 365);
  end if;
end $$;

comment on column organisation_settings.jours_correction_saisie is
  'EF-BUR-08, EF-CRO-12 : au-dela de ce delai depuis l''ENREGISTREMENT, retirer '
  'un titulaire ou corriger un grade n''est plus une erreur de saisie qui '
  'efface, mais une decision qui se motive et s''inscrit. Lu a CHAQUE ecriture '
  '(regle 21) — jamais mis en cache dans un formulaire ouvert depuis des heures.';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0069')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0070_attestation_transfert_reglable.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0070 — L'attestation de transfert devient configurable
-- =============================================================================
-- Reference : EF-TRF-08. Demande de l'utilisateur, 21 aout 2026 (soir),
-- tranchee le 22 aout 2026 : SON PROPRE GABARIT REGLABLE, sur le meme patron
-- que les modeles de courriel (`email_settings`/`email_templates`, 0047) —
-- pas un bloc du generateur de rapports (lot 6). Le generateur compose des
-- blocs qui AGREGENT des donnees sur une periode ; une attestation porte UN
-- transfert precis, a une date precise. Le rapprochement se serait paye par
-- un bloc d'un genre nouveau que rien d'autre n'aurait employe.
--
-- CE QUI EST REGLABLE, ET RIEN DE PLUS : logo, texte du corps, mentions
-- legales, cartouche de signature — exactement la liste posee par la demande.
-- Le NOM de l'organisation et celui de l'entite emettrice restent DYNAMIQUES,
-- lus a chaque document (ils le sont deja) : les rendre configurables ici
-- aurait fige une valeur que l'ecran connait deja, avec le risque qu'elle
-- diverge de celle affichee ailleurs (l'entete de l'application, les rapports).
--
-- UNE SEULE LIGNE, PAS UNE PAR ENTITE. Le nom de l'entite emettrice varie deja
-- (colonne dynamique) ; ce que ce gabarit regle — le texte du corps, les
-- mentions legales — est un choix d'ORGANISATION, comme le sujet et le corps
-- d'un courriel. Vingt eglises avec vingt mentions legales differentes ne
-- serait pas une personnalisation, ce serait une incoherence.
--
-- LECTURE LIBRE, ECRITURE RESERVEE — a la difference d'`email_settings`. Un
-- hote SMTP ne sert qu'a l'administration ; ce gabarit, lui, doit etre lu par
-- QUICONQUE imprime une attestation (`transfer.certify`), potentiellement
-- delegue loin du Siege. Le modifier reste sous `settings.manage`, non
-- delegable : la configuration reste au Siege, comme pour les courriels.
-- =============================================================================

create table if not exists attestation_transfert_settings (
  -- Une seule ligne, comme `organisation_settings` et `email_settings`.
  id smallint primary key default 1 check (id = 1),

  -- Cle d'objet RELATIVE (regle 11) — jamais d'URL, signee a l'affichage.
  logo_key text,

  texte_corps text not null default (
    'Le soussigné atteste que le croyant désigné ci-dessus a été régulièrement '
    || 'transféré de son entité d''origine vers son entité d''accueil, et que ce '
    || 'transfert a été approuvé aux dates portées au présent document.'
  ),

  mentions_legales text,

  cartouche_signature text not null default 'Pour l''entité émettrice',

  updated_at timestamptz not null default now()
);

comment on table attestation_transfert_settings is
  'EF-TRF-08 — gabarit reglable de l''attestation de transfert : logo, texte '
  'du corps, mentions legales, cartouche de signature. La piece de dossier '
  '(transfert encore DEMANDE) n''y puise RIEN : son texte de mise en garde '
  'reste fixe, pour ne jamais pouvoir etre attenue par un reglage.';

insert into attestation_transfert_settings (id) values (1) on conflict (id) do nothing;


alter table attestation_transfert_settings enable row level security;

drop policy if exists attestation_transfert_settings_select on attestation_transfert_settings;
create policy attestation_transfert_settings_select on attestation_transfert_settings
  for select to authenticated
  using (true);

drop policy if exists attestation_transfert_settings_update on attestation_transfert_settings;
create policy attestation_transfert_settings_update on attestation_transfert_settings
  for update to authenticated
  using (has_perm('settings.manage'))
  with check (has_perm('settings.manage'));


-- `fn_touch_updated_at` existe deja (migration 0047) — `create or replace`
-- la rend rejouable sans dependre de l'ordre d'application des migrations.
create or replace function fn_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_attestation_transfert_settings_bu on attestation_transfert_settings;
create trigger trg_attestation_transfert_settings_bu
  before update on attestation_transfert_settings
  for each row execute function fn_touch_updated_at();

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0070')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0071_lien_conjugal.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0071 — Le lien conjugal entre deux fiches de croyants
-- =============================================================================
-- Reference : EF-CRO-14 (cdg.md, ajoutee le 22 aout 2026). Demande de
-- l'utilisateur, 20 aout 2026, reprise dans notes/todos.md §1.
--
-- LE LIEN EST SYMETRIQUE, PAR TRIGGER — pas par deux ecritures applicatives.
-- Relier A a B doit relier B a A dans le MEME geste : deux ecritures
-- indissociables se font en base (regle 20). Une colonne `conjoint_id` posee
-- d'un seul cote laisserait les deux fiches se contredire des la premiere
-- saisie qui n'y pense pas.
--
-- SECURITY DEFINER, parce que le trigger ecrit sur une AUTRE ligne que celle
-- que l'utilisateur editait. La RLS de `croyants_update` borne l'ecriture a
-- la portee de l'auteur (`can('croyant.update', eglise_id)`) : relier son
-- eglise a un conjoint d'une autre eglise, hors de sa portee, echouerait sans
-- cela — exactement le cas d'un trigger qui ecrit dans une table verrouillee
-- par RLS (regle 13).
--
-- LE DIVORCE EFFACE LE LIEN, SANS HISTORIQUE — decision explicite du 20 aout.
-- Ce registre sert l'eglise d'aujourd'hui, pas la genealogie : une union
-- passee qui trainerait dans une fiche est une information que personne n'a
-- demande a voir. Le MEME trigger porte cet effacement : NEW.conjoint_id a
-- NULL relache symetriquement l'ancien conjoint.
--
-- LE DECES REND LE SURVIVANT VEUF/VEUVE, mais ne touche PAS au lien : on sait
-- toujours qui etait l'epoux ou l'epouse. Un second trigger, distinct du
-- premier (une seule responsabilite chacun), regarde le changement de STATUT
-- et non celui de `conjoint_id`.
--
-- REJOUABLE (regle 23).
-- =============================================================================

alter table croyants
  add column if not exists conjoint_id uuid references croyants(id) on delete set null;

comment on column croyants.conjoint_id is
  'EF-CRO-14 : lien symetrique maintenu par fn_conjoint_symetrique(). '
  'Facultatif meme si statut_marital = MARIE — le conjoint peut ne pas etre '
  'croyant, ou ne pas encore avoir de fiche.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'croyants_conjoint_pas_soi_meme'
  ) then
    alter table croyants
      add constraint croyants_conjoint_pas_soi_meme
      check (conjoint_id is null or conjoint_id <> id);
  end if;
end $$;

create index if not exists croyants_conjoint_idx
  on croyants (conjoint_id) where deleted_at is null and conjoint_id is not null;


-- -----------------------------------------------------------------------------
-- 1. La symetrie du lien — pose ou effacement, en un seul trigger.
-- -----------------------------------------------------------------------------
create or replace function fn_conjoint_symetrique() returns trigger
security definer set search_path = public
language plpgsql as $$
declare
  v_ancien uuid := case when tg_op = 'UPDATE' then old.conjoint_id else null end;
begin
  if new.conjoint_id is not distinct from v_ancien then
    return new;
  end if;

  -- Le NOUVEAU conjoint (s'il y en a un) pointe desormais en retour vers nous.
  -- La garde `is distinct from` arrete la recursion du trigger : une fois
  -- l'etat symetrique atteint, l'UPDATE suivant ne touche plus aucune ligne.
  if new.conjoint_id is not null then
    update croyants
      set conjoint_id = new.id
      where id = new.conjoint_id
        and conjoint_id is distinct from new.id;
  end if;

  -- L'ANCIEN conjoint (s'il y en avait un, et qu'il a change) est RELACHE :
  -- sans cela il resterait marie a nous alors que nous avons change ou nous
  -- sommes efface — le cas exact du divorce (20 aout 2026 : « le lien
  -- s'efface, sans historique »).
  if v_ancien is not null and v_ancien is distinct from new.conjoint_id then
    update croyants
      set conjoint_id = null
      where id = v_ancien
        and conjoint_id = new.id;
  end if;

  return new;
end $$;

drop trigger if exists trg_croyants_conjoint_symetrique on croyants;
create trigger trg_croyants_conjoint_symetrique
  after insert or update of conjoint_id on croyants
  for each row execute function fn_conjoint_symetrique();


-- -----------------------------------------------------------------------------
-- 2. Le deces rend le conjoint survivant veuf/veuve — RG distincte du lien.
-- -----------------------------------------------------------------------------
create or replace function fn_conjoint_veuvage() returns trigger
security definer set search_path = public
language plpgsql as $$
begin
  if new.statut = 'DECEDE' and old.statut is distinct from 'DECEDE'
     and new.conjoint_id is not null then
    update croyants
      set statut_marital = 'VEUF'
      where id = new.conjoint_id;
  end if;

  return new;
end $$;

drop trigger if exists trg_croyants_conjoint_veuvage on croyants;
create trigger trg_croyants_conjoint_veuvage
  after update of statut on croyants
  for each row execute function fn_conjoint_veuvage();

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0071')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0072_dime_eglise_et_anonymisation.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0072 — Le rapprochement des dîmes rendu à l'ÉGLISE, et l'enveloppe anonyme
-- =============================================================================
-- Reference : EF-FIN-34, RG-33. Demandes du 20 aout 2026, notes/todos.md §3
-- (« l'eglise lue, et le travail rendu a l'eglise »).
--
-- CE QUE CETTE MIGRATION CHANGE, EN UNE PHRASE : une ligne dont l'eglise a ete
-- RECONNUE (`dime_rapprochements.eglise_id`, migration 0058) devient visible
-- ET traitable par CETTE eglise, pas seulement par l'entite qui a collecte.
-- Avant `0072`, `eglise_id` n'etait qu'une etiquette d'affichage ; ici elle
-- devient une seconde porte d'acces.
--
-- POURQUOI DEUX PORTES, PAS UNE SEULE. Une ligne SANS eglise reconnue (le nom
-- ne correspondait a rien de connu) n'a QUE le collecteur pour la traiter —
-- rien ne change pour elle. Une ligne AVEC eglise reconnue, elle, concerne
-- deux entites a la fois : celle qui a physiquement recueilli l'argent
-- (`entite_id`, deja RLS avant cette migration) ET celle dont un membre est
-- concerne (`eglise_id`) — c'est ELLE qui connait les gens, et c'est ELLE qui
-- doit pouvoir rapprocher, creer une fiche, ou retrouver un porteur
-- d'enveloppe. RG-33 n'est PAS en cause ici : aucun solde ne bouge, seule la
-- VISIBILITE d'une file de travail s'elargit.
--
-- « RESOLU », REDEFINI SUR resolu_le, PAS SUR croyant_id. Une ligne se
-- fermait jusqu'ici uniquement en lui donnant un croyant. Or « basculer une
-- enveloppe en anonyme » (plus bas) ferme une ligne SANS jamais lui donner de
-- croyant — `croyant_id is null` resterait vrai indefiniment, et la ligne
-- resterait dans la file malgre la decision prise a son sujet. `resolu_le`
-- porte donc a lui seul la question « reste-t-il quelque chose a faire ? »,
-- quelle que soit la façon dont la ligne s'est fermee.
--
-- L'ENVELOPPE ANONYME VISE `nature_versement.ENVELOPPE_ANONYME` (migration
-- `0030`), deja prevue par la contrainte `dime_versements_nature_coherente`
-- pour un versement SANS croyant MAIS AVEC un numero — exactement le cas
-- d'une regle C (numero, sans nom) dont le porteur reste introuvable. Aucune
-- colonne nouvelle sur `dime_versements` : l'etat existait deja, il manquait
-- le chemin pour l'atteindre.
--
-- REJOUABLE (regle 23) : `create or replace` sur des signatures inchangees,
-- `drop policy if exists` avant chaque `create policy`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. « Resolu » se lit sur `resolu_le`, pas sur `croyant_id`.
-- -----------------------------------------------------------------------------
drop index if exists dime_rapprochements_attente_idx;
create index if not exists dime_rapprochements_attente_idx
  on dime_rapprochements (entite_id, created_at)
  where resolu_le is null;

create index if not exists dime_rapprochements_eglise_attente_idx
  on dime_rapprochements (eglise_id, created_at)
  where resolu_le is null and eglise_id is not null;


-- -----------------------------------------------------------------------------
-- 2. La RLS s'ouvre a l'eglise RECONNUE, en plus de l'entite collectrice.
-- -----------------------------------------------------------------------------
drop policy if exists dime_rapprochements_select on dime_rapprochements;
create policy dime_rapprochements_select on dime_rapprochements for select to authenticated
  using (
    entity_in_scope(entite_id)
    or (eglise_id is not null and entity_in_scope(eglise_id))
  );

drop policy if exists dime_rapprochements_write on dime_rapprochements;
create policy dime_rapprochements_write on dime_rapprochements for all to authenticated
  using (
    can('finance.dime.collect', entite_id)
    or (eglise_id is not null and can('finance.dime.collect', eglise_id))
  )
  with check (
    can('finance.dime.collect', entite_id)
    or (eglise_id is not null and can('finance.dime.collect', eglise_id))
  );


-- -----------------------------------------------------------------------------
-- 3. `fn_resoudre_rapprochement` : la meme extension de droit, et le meme
--    changement de definition de « resolu ».
-- -----------------------------------------------------------------------------
create or replace function fn_resoudre_rapprochement(
  p_rapprochement uuid,
  p_croyant       uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entite    uuid;
  v_eglise    uuid;
  v_versement uuid;
  v_enveloppe text;
  v_code      text;
  v_recu      text;
begin
  select r.entite_id, r.eglise_id, r.versement_id, r.enveloppe_source
    into v_entite, v_eglise, v_versement, v_enveloppe
    from dime_rapprochements r
   where r.id = p_rapprochement and r.resolu_le is null;

  if v_entite is null then
    raise exception 'Ce rapprochement est introuvable ou deja resolu.';
  end if;

  if not (
    can('finance.dime.collect', v_entite)
    or (v_eglise is not null and can('finance.dime.collect', v_eglise))
  ) then
    raise exception 'Vous n''avez pas le droit de resoudre ce rapprochement.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Le recu deja emis fait foi : il est peut-etre deja entre les mains du
  -- donateur.
  select recu_numero into v_recu from dime_versements where id = v_versement;

  if v_recu is null then
    select code into v_code from entities where id = v_entite;
    v_recu := fn_generer_recu_dime(v_code);
  end if;

  update dime_versements
     set croyant_id  = p_croyant,
         nature      = 'NOMINATIF',
         recu_numero = v_recu
   where id = v_versement;

  update dime_rapprochements
     set croyant_id = p_croyant,
         resolu_le  = now(),
         resolu_par = current_profile_id()
   where id = p_rapprochement;

  -- Regle B : le numero lu devient le sien, s'il n'appartient a personne.
  if v_enveloppe is not null then
    perform fn_attribuer_enveloppe(p_croyant, v_enveloppe);
  end if;

  return v_recu;
end $$;

revoke execute on function fn_resoudre_rapprochement from anon;


-- -----------------------------------------------------------------------------
-- 4. « Basculer une enveloppe en anonyme » — meme forme que la resolution,
--    ecriture en DEUX tables, indissociable (regle 20).
-- -----------------------------------------------------------------------------
create or replace function fn_marquer_enveloppe_anonyme(
  p_rapprochement uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entite    uuid;
  v_eglise    uuid;
  v_versement uuid;
  v_numero    text;
begin
  select r.entite_id, r.eglise_id, r.versement_id
    into v_entite, v_eglise, v_versement
    from dime_rapprochements r
   where r.id = p_rapprochement and r.resolu_le is null;

  if v_entite is null then
    raise exception 'Ce rapprochement est introuvable ou deja resolu.';
  end if;

  if not (
    can('finance.dime.collect', v_entite)
    or (v_eglise is not null and can('finance.dime.collect', v_eglise))
  ) then
    raise exception 'Vous n''avez pas le droit de resoudre ce rapprochement.'
      using errcode = 'insufficient_privilege';
  end if;

  select enveloppe_numero into v_numero from dime_versements where id = v_versement;

  if v_numero is null then
    raise exception
      'Cette ligne ne porte aucun numero d''enveloppe : rien a declarer anonyme.';
  end if;

  -- `dime_versements_nature_coherente` (0030) exige : ENVELOPPE_ANONYME =>
  -- croyant_id null ET enveloppe_numero non nul — deja le cas ici.
  update dime_versements
     set nature     = 'ENVELOPPE_ANONYME',
         croyant_id = null
   where id = v_versement;

  update dime_rapprochements
     set resolu_le  = now(),
         resolu_par = current_profile_id()
   where id = p_rapprochement;
end $$;

revoke execute on function fn_marquer_enveloppe_anonyme from anon;

comment on function fn_marquer_enveloppe_anonyme is
  'EF-FIN-34 : le porteur d''une enveloppe numerotee reste introuvable. '
  'Ferme la ligne SANS jamais lui donner de croyant — resolu_le porte seul '
  'la fermeture, dime_versements.nature passe a ENVELOPPE_ANONYME.';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0072')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0073_entite_logo.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0073 — L'en-tete propre a chaque entite, source du bloc Image
-- =============================================================================
-- Reference : EF-RAP-02, notes/todos.md §4 (« Logo televerse pour le bloc
-- Image »). Corrige le 22 aout 2026, en testant `0072` en conditions
-- reelles : le premier jet ne connaissait qu'UN logo, celui de
-- l'organisation entiere. L'utilisateur a demande la portee correcte —
-- « les entites auront peut-etre leur propre en-tete. Si l'entite n'a pas
-- d'en-tete alors le logo de l'organisation se placera » — AVANT que le
-- premier jet ne soit repousse en production.
--
-- DEUX NIVEAUX, PAS UNE HIERARCHIE A ESCALADER. L'entite visee par le
-- rapport porte son propre `logo_key` si elle en a un ; a defaut,
-- `organisation_settings.logo_key` (migration 0006, ecran pose la veille)
-- prend le relais. Rien n'escalade par les ancetres — une eglise sans
-- en-tete n'emprunte pas celui de sa paroisse : c'est le logo de
-- l'ORGANISATION qui sert de defaut, pas celui du parent le plus proche qui
-- en a un, ce qui rendrait la resolution dependante d'un parcours de l'arbre
-- a la generation (cout, et un defaut moins previsible).
--
-- AUCUNE RLS NOUVELLE : `logo_key` est une colonne de plus sur une ligne deja
-- lisible par la RLS existante (`entities_select`, migration 0003) et
-- modifiable par l'action deja gardee par `entity.update` (RG-25 —
-- DESCENDANTE par defaut, comme le reste de la fiche entite).
-- =============================================================================

alter table entities add column if not exists logo_key text;

comment on column entities.logo_key is
  'EF-RAP-02 — en-tete propre a l''entite (cle relative, regle 11), source du '
  'bloc Image a la generation d''un rapport. Absent : le logo de '
  'l''organisation (organisation_settings.logo_key) prend sa place.';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0073')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0074_evenements_dime_referentiel.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0074 — Référentiel des événements de collecte de dîmes
-- =============================================================================
-- Référence : EF-REF-01 à 04, EF-FIN-30, notes/todos.md §7.
--
-- LE PROBLÈME QU'ELLE RÉSOUD.
--
-- `type_evenement_dime` était un type énuméré PostgreSQL (migration `0027`), et
-- la liste des événements était figée dans le code TypeScript. Ajouter un
-- événement de collecte (ex: Culte d'action de grâce, Convention nationale)
-- exigeait une migration de schéma et une recompilation du code.
--
-- CE QUE CETTE MIGRATION APPORTE :
--
-- 1. Table `evenements_dime` (id, code, libellé, niveau_hote, ordre, is_active),
--    administrable depuis `/referentiels/evenements-dime` comme les grades,
--    fonctions, nationalités et catégories financières.
--
-- 2. `niveau_hote` (entity_type) : décide quelle entité peut héberger et
--    collecter chaque événement (ex: EGLISE pour un culte, DISTRICT pour un
--    rassemblement de district).
--
-- 3. `finance_entries.dime_evenement` est converti en TEXT avec clé étrangère
--    `references evenements_dime(code) on update cascade on delete restrict`.
--
-- 4. Remplacement de `fn_saisir_collecte_dime` : signature mise à jour avec
--    `p_evenement text` (drop préalable requis car le type du paramètre IN change).
--
-- REJOUABLE (règle 23) : `if not exists`, `on conflict do update`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table du référentiel
-- -----------------------------------------------------------------------------

create table if not exists evenements_dime (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  libelle     text not null,
  niveau_hote entity_type not null,
  ordre       smallint not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint evenements_dime_code_format check (code ~ '^[A-Z0-9_]+$')
);

comment on table evenements_dime is
  'EF-FIN-30 / EF-REF — Événements et rassemblements au cours desquels les dîmes sont collectées.';

comment on column evenements_dime.niveau_hote is
  'Niveau d''entité habilité à héberger et collecter cet événement (EGLISE, PAROISSE, DISTRICT, REGIONAL, SIEGE).';

comment on column evenements_dime.ordre is
  'Ordre d''affichage dans les sélecteurs de saisie de dîme.';

-- RLS
alter table evenements_dime enable row level security;

drop policy if exists evenements_dime_select on evenements_dime;
create policy evenements_dime_select on evenements_dime
  for select to authenticated
  using (true);

drop policy if exists evenements_dime_write on evenements_dime;
create policy evenements_dime_write on evenements_dime
  for all to authenticated
  using (has_perm('referentiel.manage'))
  with check (has_perm('referentiel.manage'));


-- -----------------------------------------------------------------------------
-- 2. Données initiales (reprise des valeurs de l'enum existant)
-- -----------------------------------------------------------------------------

insert into evenements_dime (code, libelle, niveau_hote, ordre, is_active)
values
  ('CULTE', 'Culte', 'EGLISE', 10, true),
  ('RASSEMBLEMENT_PAROISSE', 'Rassemblement de paroisse', 'PAROISSE', 20, true),
  ('RASSEMBLEMENT_DISTRICT', 'Rassemblement de district', 'DISTRICT', 30, true),
  ('RASSEMBLEMENT_REGIONAL', 'Rassemblement régional', 'REGIONAL', 40, true),
  ('EVENEMENT_NATIONAL', 'Événement national', 'SIEGE', 50, true)
on conflict (code) do update set
  libelle = excluded.libelle,
  niveau_hote = excluded.niveau_hote,
  ordre = excluded.ordre,
  is_active = excluded.is_active;


-- -----------------------------------------------------------------------------
-- 3. Conversion de finance_entries.dime_evenement vers text + foreign key
-- -----------------------------------------------------------------------------

alter table finance_entries
  alter column dime_evenement type text using dime_evenement::text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'finance_entries_dime_evenement_fkey'
  ) then
    alter table finance_entries
      add constraint finance_entries_dime_evenement_fkey
      foreign key (dime_evenement) references evenements_dime(code)
      on update cascade on delete restrict;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 4. Remplacement de la fonction fn_saisir_collecte_dime
-- -----------------------------------------------------------------------------

-- Drop préalable obligatoire car le type du paramètre p_evenement passe de
-- type_evenement_dime à text.
drop function if exists fn_saisir_collecte_dime(uuid, uuid, date, type_evenement_dime, text, text, jsonb);

create or replace function fn_saisir_collecte_dime(
  p_entite_collecte uuid,
  p_categorie       uuid,
  p_date_operation  date,
  p_evenement       text,
  p_libelle         text default null,
  p_reference       text default null,
  p_versements      jsonb default '[]'::jsonb
)
returns table (finance_entry_id uuid, recus jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siege       uuid := siege_id();
  v_code        text;
  v_profil      uuid := current_profile_id();
  v_total       numeric(14,2);
  v_entry       uuid;
  v_recus       jsonb := '[]'::jsonb;
  v_ligne       jsonb;
  v_recu        text;
  v_nature      nature_versement;
  v_croyant     uuid;
  v_versement   uuid;
  v_nom         text;
  v_prenom      text;
  v_libelle     text;
  v_prenom_lu   text;
  v_enveloppe   text;
  v_eglise_lu   text;
  v_eglise      uuid;
  v_sens        sens_finance;
  v_evenement   text;
begin
  if v_siege is null then
    raise exception 'Aucun Siège n''est défini : une dîme ne peut pas être rattachée.';
  end if;

  if not can('finance.dime.collect', p_entite_collecte) then
    raise exception 'Vous n''avez pas le droit de collecter les dîmes de cette entité.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite_collecte;
  if v_code is null then
    raise exception 'Cette entité est introuvable.';
  end if;

  select sens into v_sens from finance_categories where id = p_categorie;
  if v_sens is distinct from 'RECETTE' then
    raise exception 'RG-13 : une collecte de dîmes doit relever d''une catégorie de recette.';
  end if;

  -- Validation de l'événement contre le référentiel actif
  select code into v_evenement
    from evenements_dime
   where code = p_evenement and is_active = true;

  if v_evenement is null then
    raise exception 'Événement de dîme « % » inconnu ou inactif.', p_evenement;
  end if;

  select coalesce(sum((l->>'montant')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_versements) as l;

  if v_total <= 0 then
    raise exception 'Le montant de la collecte doit être supérieur à zéro.';
  end if;

  -- RG-33 : `entity_id` est le SIÈGE. `SOUMIS` : une collecte annonce sans
  -- encaisser, c'est la REMISE qui valide (EF-FIN-30).
  insert into finance_entries (
    entity_id, categorie_id, montant, date_operation, libelle, reference,
    entite_collecte_id, dime_evenement, statut, soumis_par, soumis_le,
    saisi_par, saisi_depuis_entity_id
  )
  values (
    v_siege, p_categorie, v_total, p_date_operation, p_libelle, p_reference,
    p_entite_collecte, v_evenement, 'SOUMIS', v_profil, now(),
    v_profil, p_entite_collecte
  )
  returning id into v_entry;

  for v_ligne in select * from jsonb_array_elements(p_versements)
  loop
    v_croyant   := nullif(v_ligne->>'croyant_id', '')::uuid;
    v_libelle   := nullif(trim(coalesce(v_ligne->>'nom_source', '')), '');
    v_prenom_lu := nullif(trim(coalesce(v_ligne->>'prenom_source', '')), '');
    v_enveloppe := nullif(trim(coalesce(v_ligne->>'enveloppe', '')), '');
    v_eglise_lu := nullif(trim(coalesce(v_ligne->>'eglise_source', '')), '');
    v_eglise    := nullif(v_ligne->>'eglise_id', '')::uuid;

    v_nature  := coalesce(
      nullif(v_ligne->>'nature', '')::nature_versement,
      (case when v_croyant is null then 'EN_VRAC' else 'NOMINATIF' end)::nature_versement
    );

    -- Le reçu suit LE NOM, plus la fiche (0057). Sans nom du tout, rien :
    -- consommer la séquence brouillerait la numérotation de ceux qui existent.
    v_recu := case
      when v_croyant is not null or v_libelle is not null
      then fn_generer_recu_dime(v_code)
    end;

    insert into dime_versements (
      finance_entry_id, croyant_id, enveloppe_numero, montant, recu_numero, nature
    )
    values (
      v_entry, v_croyant, v_enveloppe,
      (v_ligne->>'montant')::numeric, v_recu, v_nature
    )
    returning id into v_versement;

    if v_recu is not null then
      -- Le talon porte le nom qu'on a : celui de la fiche, ou celui du fichier.
      if v_croyant is not null then
        select c.nom, c.prenom into v_nom, v_prenom
          from croyants c where c.id = v_croyant;
      else
        v_nom    := v_libelle;
        v_prenom := v_prenom_lu;
      end if;

      v_recus := v_recus || jsonb_build_object(
        'croyant_id', v_ligne->>'croyant_id',
        'recu', v_recu,
        'nom', v_nom,
        'prenom', v_prenom,
        'enveloppe', v_enveloppe
      );
    end if;

    -- Règle B — un nom reconnu qui présente un numéro le GARDE.
    if v_croyant is not null and v_enveloppe is not null then
      perform fn_attribuer_enveloppe(v_croyant, v_enveloppe);
    end if;

    /**
     * Règles A et C — ce qui reste à identifier entre dans la file, avec
     * l'église lue quand le fichier en portait une. Elle ne sert qu'à amorcer
     * la création de fiche : aucun solde ne la lit.
     */
    if v_croyant is null and (v_libelle is not null or v_enveloppe is not null) then
      insert into dime_rapprochements (
        versement_id, entite_id, nom_source, prenom_source, enveloppe_source,
        eglise_source, eglise_id
      )
      values (
        v_versement, p_entite_collecte,
        coalesce(v_libelle, ''), v_prenom_lu, v_enveloppe,
        v_eglise_lu, v_eglise
      );
    end if;
  end loop;

  return query select v_entry, v_recus;
end $$;

revoke execute on function fn_saisir_collecte_dime from anon;


-- -----------------------------------------------------------------------------
-- 5. Mise à jour de fn_reordonner_referentiel pour evenements_dime
-- -----------------------------------------------------------------------------

create or replace function fn_reordonner_referentiel(p_table text, p_ids uuid[])
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_colonne text;
  v_touchees integer;
begin
  v_colonne := case p_table
    when 'grades'             then 'ordre'
    when 'finance_categories' then 'ordre'
    when 'fonctions'          then 'ordre_protocolaire'
    when 'evenements_dime'    then 'ordre'
    else null
  end;

  if v_colonne is null then
    raise exception 'Ce referentiel ne se reordonne pas : %', p_table
      using errcode = 'invalid_parameter_value';
  end if;

  execute format(
    'update %I t
        set %I = r.rang * 10
       from unnest($1) with ordinality as r(id, rang)
      where t.id = r.id',
    p_table, v_colonne
  ) using p_ids;

  get diagnostics v_touchees = row_count;
  return v_touchees;
end $$;

comment on function fn_reordonner_referentiel is
  'EF-REF-02 : pose l''ordre d''affichage d''un referentiel en UNE ecriture. '
  'SECURITY INVOKER — les politiques *_write exigent referentiel.manage. '
  'La liste blanche des tables doit rester alignee sur les entrees '
  'colonneOrdre de lib/domain/referentiels.ts.';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0074')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0075_grades_sexe_autorise.sql
-- #############################################################################

-- =============================================================================
-- Migration 0075 — Restriction des sexes assignables aux grades
--
-- Permet de réserver certains grades aux hommes (ex: Pasteur), aux femmes,
-- ou de les laisser ouverts à tous ('TOUS' par défaut).
-- =============================================================================

alter table grades
  add column if not exists sexe_autorise text not null default 'TOUS'
  check (sexe_autorise in ('TOUS', 'M', 'F'));

comment on column grades.sexe_autorise is
  'Restriction de sexe pour l''assignation de ce grade : TOUS, M (hommes uniquement), ou F (femmes uniquement).';

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0075')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0076_finance_annule_par.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0076 — Traçabilité de l'annulation d'un mouvement financier
-- =============================================================================
-- Traçabilité de l'auteur et de la date d'annulation (EF-FIN-20).
-- =============================================================================

alter table finance_entries
  add column if not exists annule_par uuid references profiles(id) on delete set null,
  add column if not exists annule_le  timestamptz;

comment on column finance_entries.annule_par is 'Profil ayant prononcé l''annulation du mouvement (EF-FIN-20)';
comment on column finance_entries.annule_le is 'Horodatage de l''annulation (EF-FIN-20)';

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
    if new.statut = 'ANNULE' and old.statut is distinct from 'ANNULE' then
      new.annule_le := coalesce(new.annule_le, now());
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

notify pgrst, 'reload schema';

insert into schema_migrations (version) values ('0076')
  on conflict (version) do nothing;

-- #############################################################################
-- ## seed.sql — amorce des donnees de reference
-- #############################################################################

-- =============================================================================
-- SYNOD — Amorce des donnees de reference
-- =============================================================================
-- Idempotent : rejouable sans effet de bord (on conflict do nothing).
-- Ne contient AUCUNE donnee personnelle (ENF-DCP-05).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Le Siege — racine unique de la hierarchie (RG-03)
-- -----------------------------------------------------------------------------
insert into entities (type, code, nom, description)
values ('SIEGE', 'SIEGE', 'Siege National', 'Administration nationale de l''organisation')
on conflict do nothing;


-- -----------------------------------------------------------------------------
-- Grades — EF-REF-01
-- -----------------------------------------------------------------------------
insert into grades (code, libelle, ordre) values
  ('PASTEUR',     'Pasteur',     10),
  ('EVANGELISTE', 'Evangeliste', 20),
  ('DIACRE',      'Diacre',      30),
  ('ANCIEN',      'Ancien',      40),
  ('CROYANT',     'Croyant',     50)
on conflict (code) do nothing;


-- -----------------------------------------------------------------------------
-- Nationalites — EF-REF-02
-- -----------------------------------------------------------------------------
insert into nationalites (code_iso, libelle) values
  ('BEN', 'Beninoise'),
  ('BFA', 'Burkinabe'),
  ('CIV', 'Ivoirienne'),
  ('CMR', 'Camerounaise'),
  ('COD', 'Congolaise (RDC)'),
  ('FRA', 'Francaise'),
  ('GHA', 'Ghaneenne'),
  ('MDG', 'Malgache'),
  ('MLI', 'Malienne'),
  ('NER', 'Nigerienne'),
  ('NGA', 'Nigeriane'),
  ('SEN', 'Senegalaise'),
  ('TGO', 'Togolaise')
on conflict (code_iso) do nothing;


-- -----------------------------------------------------------------------------
-- Fonctions de bureau — EF-REF-03
-- La hierarchie ne vit pas ici : elle est propre a chaque bureau (bureau_postes).
-- `est_financiere` alimente l'indicateur « membres de finances » (RG-31).
-- -----------------------------------------------------------------------------
insert into fonctions (code, libelle, categorie, est_financiere) values
  ('PRESIDENT',           'President',                   'DIRECTION',     false),
  ('VICE_PRESIDENT',      'Vice-President',              'DIRECTION',     false),
  ('SECRETAIRE',          'Secretaire',                  'DIRECTION',     false),
  ('SECRETAIRE_ADJOINT',  'Secretaire adjoint',          'DIRECTION',     false),
  ('TRESORIER',           'Tresorier',                   'FINANCE',       true),
  ('TRESORIER_ADJOINT',   'Tresorier adjoint',           'FINANCE',       true),
  ('DIR_FINANCES',        'Directeur des finances',      'FINANCE',       true),
  ('COMMISSAIRE_COMPTES', 'Commissaire aux comptes',     'FINANCE',       true),
  ('DIR_COMMUNICATIONS',  'Directeur des communications','COMMUNICATION', false),
  ('DIR_OEUVRES',         'Directeur des oeuvres',       'OEUVRES',       false),
  ('DIR_JEUNESSE',        'Directeur de la jeunesse',    'OEUVRES',       false),
  ('CONSEILLER',          'Conseiller',                  'AUTRE',         false)
on conflict (code) do nothing;

-- Le Commissaire aux comptes n'a de sens qu'a partir de la Paroisse.
update fonctions
   set niveaux_applicables = '{SIEGE,REGIONAL,DISTRICT,PAROISSE}'
 where code = 'COMMISSAIRE_COMPTES';


-- -----------------------------------------------------------------------------
-- Categories financieres — EF-REF-04, ARB-2
-- Le `sens` est porte par la categorie : il n'est jamais saisi a la main (RG-13).
-- -----------------------------------------------------------------------------
insert into finance_categories (code, libelle, sens, ordre) values
  -- Recettes
  ('DIME',            'Dime',                    'RECETTE',  10),
  ('QUETE',           'Quete',                   'RECETTE',  20),
  ('OFFRANDE',        'Offrande',                'RECETTE',  30),
  ('DON',             'Don',                     'RECETTE',  40),
  ('COTISATION',      'Cotisation',              'RECETTE',  50),
  ('AUTRE_RECETTE',   'Autre recette',           'RECETTE',  90),
  -- Depenses
  ('FONCTIONNEMENT',  'Fonctionnement',          'DEPENSE', 110),
  ('TRAVAUX',         'Travaux et entretien',    'DEPENSE', 120),
  ('AIDE_SOCIALE',    'Aide sociale',            'DEPENSE', 130),
  ('MISSION',         'Mission et evangelisation','DEPENSE', 140),
  ('TRANSPORT',       'Transport',               'DEPENSE', 150),
  ('EVENEMENT',       'Evenement',               'DEPENSE', 160),
  ('AUTRE_DEPENSE',   'Autre depense',           'DEPENSE', 190)
on conflict (code) do nothing;
