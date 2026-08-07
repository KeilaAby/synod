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
-- Genere le 2026-08-07T18:13:40.761Z
-- Migrations : 16 + amorce
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
--          RG-09 (le croyant appartient au sous-arbre), RG-10 (un seul bureau
--          actif par entite), RG-31 (membre de finances)
-- =============================================================================

create table bureaux (
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
create unique index bureaux_un_seul_actif on bureaux (entity_id)
  where is_active and deleted_at is null;

create index bureaux_entity_idx on bureaux (entity_id, date_debut desc);


create table bureau_membres (
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
create unique index membres_fonction_unique on bureau_membres (bureau_id, fonction_id)
  where date_fin is null;

-- Un croyant n'occupe pas deux fonctions dans le MEME bureau : il peut en
-- occuper dans deux bureaux distincts — tresorier de sa cellule et secretaire
-- de sa paroisse — ce que rien n'interdit ici.
create unique index membres_croyant_unique on bureau_membres (bureau_id, croyant_id)
  where date_fin is null;

create index membres_croyant_idx on bureau_membres (croyant_id);   -- EF-BUR-10


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

create policy bureaux_select on bureaux for select to authenticated
  using (entity_in_scope(entity_id));

create policy bureaux_insert on bureaux for insert to authenticated
  with check (can('bureau.manage', entity_id));

create policy bureaux_update on bureaux for update to authenticated
  using (can('bureau.manage', entity_id))
  with check (entity_in_scope(entity_id));

create policy bureaux_delete on bureaux for delete to authenticated
  using (is_superadmin());

-- Un membre se voit, et se gere, exactement comme son bureau. La politique
-- interroge `bureaux` plutot que de recopier sa regle de perimetre : deux
-- ecritures d'une meme regle finissent toujours par diverger.
create policy membres_select on bureau_membres for select to authenticated
  using (
    exists (select 1 from bureaux b where b.id = bureau_membres.bureau_id)
  );

create policy membres_insert on bureau_membres for insert to authenticated
  with check (
    exists (
      select 1 from bureaux b
       where b.id = bureau_membres.bureau_id
         and can('bureau.manage', b.entity_id)
    )
  );

create policy membres_update on bureau_membres for update to authenticated
  using (
    exists (
      select 1 from bureaux b
       where b.id = bureau_membres.bureau_id
         and can('bureau.manage', b.entity_id)
    )
  );

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
-- `ordre_protocolaire` pilote la disposition de l'organigramme (EF-BUR-07).
-- `est_financiere` alimente l'indicateur « membres de finances » (RG-31).
-- -----------------------------------------------------------------------------
insert into fonctions (code, libelle, categorie, est_financiere, ordre_protocolaire) values
  ('PRESIDENT',           'President',                  'DIRECTION',     false,  10),
  ('VICE_PRESIDENT',      'Vice-President',             'DIRECTION',     false,  20),
  ('SECRETAIRE',          'Secretaire',                 'DIRECTION',     false,  30),
  ('SECRETAIRE_ADJOINT',  'Secretaire adjoint',         'DIRECTION',     false,  40),
  ('TRESORIER',           'Tresorier',                  'FINANCE',       true,   50),
  ('TRESORIER_ADJOINT',   'Tresorier adjoint',          'FINANCE',       true,   60),
  ('DIR_FINANCES',        'Directeur des finances',     'FINANCE',       true,   70),
  ('COMMISSAIRE_COMPTES', 'Commissaire aux comptes',    'FINANCE',       true,   80),
  ('DIR_COMMUNICATIONS',  'Directeur des communications','COMMUNICATION', false,  90),
  ('DIR_OEUVRES',         'Directeur des oeuvres',      'OEUVRES',       false, 100),
  ('DIR_JEUNESSE',        'Directeur de la jeunesse',   'OEUVRES',       false, 110),
  ('CONSEILLER',          'Conseiller',                 'AUTRE',         false, 120)
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
