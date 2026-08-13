# Plan de conception détaillé — **SYNOD**
### Architecture, modèle de données, design system et plan de réalisation

| | |
|---|---|
| **Version** | 1.1 |
| **Date** | 6 août 2026 |
| **Document parent** | [`cdg.md`](cdg.md) — cahier des charges v1.1 |
| **Références** | `Brouillon.md`, `.agents/rules/designrules.md`, maquettes de référence *Stratrack* |

### Journal des modifications

| Version | Modifications |
|---|---|
| **1.0** | Version initiale |
| **1.1** | Renommage **SYNOD** · niveau **Siège** ajouté à la hiérarchie (6 niveaux) · modèle financier **recettes/dépenses + solde + saisie déléguée + workflow de validation** · **workflow d'approbation des transferts** · **habilitations fines avec portée et délégation** · **module Générateur de rapports** · **couche de portabilité** (auth, stockage, migrations) · devise unique |

---

## Sommaire

1. [Architecture générale](#1-architecture-générale)
2. [Arborescence du projet](#2-arborescence-du-projet)
3. [Modèle de données](#3-modèle-de-données)
4. [Sécurité, périmètres et RLS](#4-sécurité-périmètres-et-rls)
5. [Habilitations fines et délégation](#5-habilitations-fines-et-délégation)
6. [Workflows](#6-workflows)
7. [Architecture applicative](#7-architecture-applicative)
8. [Design system](#8-design-system)
9. [Inventaire et maquettage des écrans](#9-inventaire-et-maquettage-des-écrans)
10. [Composants clés](#10-composants-clés)
11. [Moteur de tableau de bord configurable](#11-moteur-de-tableau-de-bord-configurable)
12. [Générateur de rapports](#12-générateur-de-rapports)
13. [Visualisations React Flow](#13-visualisations-react-flow)
14. [Portabilité et réversibilité](#14-portabilité-et-réversibilité)
15. [Performance](#15-performance)
16. [Stratégie de tests](#16-stratégie-de-tests)
17. [Plan de réalisation par lots](#17-plan-de-réalisation-par-lots)
18. [Conventions de développement](#18-conventions-de-développement)

---

## 1. Architecture générale

### 1.1 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────┐
│                          NAVIGATEUR (Client)                         │
│  React Server Components (HTML)      ·  Client Components            │
│  ├── Shadcn/UI + Tailwind + Lucide   ·  React Flow (organigrammes)   │
│  ├── React Hook Form + Zod           ·  Recharts (graphiques)        │
│  └── TanStack Query (listes)         ·  dnd-kit (dashboard, rapports)│
└─────────────────────────────┬────────────────────────────────────────┘
                              │ HTTPS
┌─────────────────────────────▼────────────────────────────────────────┐
│                      NEXT.JS 15 — App Router                         │
│  Middleware ── session, garde de route                               │
│  Server Components ── lecture      ·  Server Actions ── mutations    │
│  Route Handlers ── exports, PDF, tâches planifiées, export intégral  │
│                                                                      │
│  /lib/domain    règles de gestion pures (RG-01…RG-32), 100 % testées │
│  /lib/data      requêtes typées, une par cas d'usage                 │
│  /lib/auth      ◄── ADAPTATEUR D'IDENTITÉ (portabilité ENF-POR-02)   │
│  /lib/storage   ◄── ADAPTATEUR DE STOCKAGE (portabilité ENF-POR-03)  │
│  /lib/reports   registre de blocs, résolution, rendu paginé          │
└─────────────────────────────┬────────────────────────────────────────┘
                              │ SQL standard uniquement (ENF-POR-01)
┌─────────────────────────────▼────────────────────────────────────────┐
│                POSTGRESQL 15+  (hébergé par Supabase)                │
│  ltree (périmètres) · pg_trgm (recherche) · RLS sur 100 % des tables │
│  Triggers d'intégrité et d'audit  ·  Vues matérialisées d'agrégats   │
│                                                                      │
│  Fournis par l'hébergeur, isolés derrière les adaptateurs :          │
│  Auth (JWT)          Storage (photos, justificatifs, PDF)            │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 Décisions d'architecture

| Réf. | Décision | Justification |
|---|---|---|
| **DA-1** | **Table unique `entities`** pour les 6 niveaux (`type` + `parent_id`) plutôt que 6 tables | Bureaux, finances, habilitations, rapports et statistiques deviennent génériques : une implémentation au lieu de six. Ajouter un niveau ne coûte qu'une valeur d'énumération. |
| **DA-2** | **Chemin matérialisé `ltree`** sur `entities.path` | « Moi et mes descendants » devient un opérateur indexé (`<@`), utilisable directement dans les politiques RLS — sans CTE récursive à chaque contrôle de droit. |
| **DA-3** | **Le Siège est une entité de niveau 1**, racine unique | *(ARB-2)* Il peut ainsi porter son propre bureau et ses propres finances, et le SuperAdmin y est rattaché : son périmètre couvre toute la hiérarchie par construction, sans traitement d'exception. |
| **DA-4** | **Sécurité au niveau base (RLS)**, l'interface n'étant qu'une couche de confort | ENF-SEC-01/05 : même un appel direct à l'API reste cloisonné. |
| **DA-5** | **Server Actions** pour toutes les mutations | Validation Zod, contrôle d'habilitation **et de portée**, règles de gestion, audit — un seul point de passage. |
| **DA-6** | **Vues matérialisées** pour les compteurs et les soldes | Un tableau de bord de 12 indicateurs sur 200 000 croyants et 500 000 mouvements ne peut recalculer 12 agrégations à chaque affichage. |
| **DA-7** | **Registre déclaratif** pour les indicateurs (`KPI_REGISTRY`) et pour les blocs de rapport (`REPORT_BLOCKS`) | Ajouter un indicateur ou un type de bloc = ajouter une entrée. Aucune modification des écrans consommateurs. |
| **DA-8** | **Sens du mouvement porté par la catégorie**, dénormalisé sur la ligne à l'insertion | Une catégorie est intrinsèquement une recette ou une dépense ; la dénormalisation rend le calcul du solde indexable et fige le sens à la validation (RG-13). |
| **DA-9** | **Adaptateurs d'identité et de stockage** ; `profiles` a sa propre clé primaire, indépendante du fournisseur d'authentification | *(ARB-8)* Changer d'hébergeur n'impacte que deux modules, jamais le modèle métier ni les politiques RLS. |
| **DA-10** | **Habilitation = (clé, portée)** plutôt que clé seule | Permet « droits par catégorie et périmètres d'accès par structure » et rend la délégation vérifiable par inclusion de chemins. |
| **DA-11** | **Rapport généré figé** dans un `jsonb` + PDF stocké | Un rapport diffusé doit rester reproductible même si les données changent (RG-27). |
| **DA-12** | Colonne `organisation_id` prévue sur les tables racines, **non exploitée en V1** | Ouvre le multi-tenant futur sans migration destructive. |

---

## 2. Arborescence du projet

```
synod/
├── app/
│   ├── (auth)/  connexion · mot-de-passe-oublie · reinitialiser
│   ├── (app)/
│   │   ├── layout.tsx                    # Sidebar + Topbar + garde de session
│   │   ├── tableau-de-bord/              page · loading · personnaliser/
│   │   ├── structure/
│   │   │   ├── page.tsx (organigramme) · loading.tsx · liste/
│   │   │   └── [entityId]/  page · croyants · bureau · finances · rapports · statistiques
│   │   ├── croyants/        page · nouveau · [id]/(page · modifier · transferer)
│   │   ├── transferts/      page (journal) · en-attente/    ← file d'approbation
│   │   ├── baptemes/        page · nouveau
│   │   ├── bureaux/         page · [bureauId]/
│   │   ├── finances/
│   │   │   ├── page.tsx · nouveau/ · synthese/
│   │   │   ├── a-valider/                ← file de validation
│   │   │   └── delegation/               ← saisie pour le compte d'une entité
│   │   ├── rapports/
│   │   │   ├── page.tsx                  # Bibliothèque de modèles
│   │   │   ├── modeles/[id]/editer/      # Éditeur de blocs
│   │   │   ├── generer/[templateId]/     # Choix périmètre + période
│   │   │   └── generes/[instanceId]/     # Rendu figé + export PDF
│   │   ├── referentiels/    grades · nationalites · fonctions · categories-finance
│   │   ├── administration/  utilisateurs · habilitations · profils-habilitation
│   │   │                    audit · corbeille · parametres · portabilite
│   │   └── mon-compte/
│   ├── api/
│   │   ├── export/croyants · export/dashboard-pdf · export/rapport-pdf
│   │   ├── export/integral                ← export portable (ENF-POR-06)
│   │   └── cron/refresh-kpi · cron/rapports-periodiques
│   └── layout.tsx · globals.css · error.tsx · not-found.tsx
│
├── components/
│   ├── ui/                  # Shadcn — non modifié à la main
│   ├── layout/              AppSidebar · Topbar · ScopeSwitcher · PendingBadge
│   ├── dashboard/           DashboardGrid · StatCard · ChartCard · GaugeCard · WidgetPicker
│   ├── structure/           EntityFlow · EntityNode · EntityForm · EntityPicker
│   ├── croyants/            CroyantForm · CroyantTable · PhotoUploader · TransferDialog
│   ├── transferts/          ApprovalQueue · TransferTimeline
│   ├── bureaux/             BureauFlow · BureauForm · MemberRow · MandatTimeline
│   ├── finances/            MouvementForm · MouvementTable · SoldeCard · ValidationQueue
│   │                        DelegationBanner · SyntheseChart
│   ├── reports/             ReportEditor · BlockPalette · BlockRenderer · A4Preview
│   │                        ReportToolbar · TemplateLibrary
│   ├── admin/               PermissionMatrix · ScopeSelector · DelegationDialog
│   ├── shared/              PageHeader · EmptyState · ConfirmDialog · PermissionGate
│   └── skeletons/           un squelette par page (règle UI-15)
│
├── lib/
│   ├── auth/                ADAPTATEUR — session, identité, mot de passe (ENF-POR-02)
│   ├── storage/             ADAPTATEUR — objets, URL signées (ENF-POR-03)
│   ├── db/                  client PostgreSQL, types générés
│   ├── domain/              RÈGLES MÉTIER PURES — 100 % testées
│   │   ├── hierarchy.ts     niveaux, parents autorisés, chemins
│   │   ├── croyant.ts       matricule, âge, cohérence des dates
│   │   ├── bureau.ts        unicité de fonction, appartenance au périmètre
│   │   ├── finance.ts       sens, solde, transitions de statut, délégation
│   │   ├── transfert.ts     éligibilité, approbateur compétent, cascade
│   │   ├── permissions.ts   catalogue, portées, règles de délégation
│   │   ├── kpi-registry.ts  catalogue déclaratif des indicateurs
│   │   └── report-blocks.ts catalogue déclaratif des blocs de rapport
│   ├── data/                lectures typées, une fonction par cas d'usage
│   ├── actions/             Server Actions (mutations)
│   ├── reports/             résolution des blocs, mise en page A4, moteur PDF
│   ├── validation/          schémas Zod partagés client/serveur
│   └── utils/               format, dates, sanitize, cn
│
├── supabase/
│   ├── migrations/          SQL standard, ordonné, applicable par tout client PG
│   └── seed.sql             référentiels + Siège + jeu de démonstration
│
├── scripts/
│   ├── export-integral.ts   dump + objets + manifeste (ENF-POR-06)
│   └── restore.md           procédure de restauration (ENF-POR-07)
│
└── tests/  unit/ · integration/ · e2e/
```

---

## 3. Modèle de données

### 3.1 Diagramme relationnel

```
                        ┌──────────────────┐
                        │    entities      │◄──┐ parent_id
                        │ type · code      │───┘ (SIEGE → … → CELLULE)
                        │ path (ltree)     │
                        │ sans_acces_appli │
                        └────────┬─────────┘
        ┌────────────────┬───────┴────────┬─────────────────┐
   ┌────▼─────┐   ┌──────▼──────┐  ┌──────▼─────────┐ ┌─────▼──────────┐
   │ croyants │   │  bureaux    │  │finance_entries │ │report_templates│
   │ eglise_id│   │ entity_id   │  │ entity_id      │ │ entity_id      │
   │cellule_id│   │ mandat      │  │ sens · statut  │ │ structure jsonb│
   └─┬──┬──┬──┘   └──────┬──────┘  │ est_delegue    │ └────────┬───────┘
     │  │  │             │         └───────┬────────┘          │
     │  │  │      ┌──────▼────────┐        │           ┌───────▼────────┐
     │  │  │      │bureau_membres │  ┌─────▼──────────┐│report_instances│
     │  │  │      │ croyant_id    │  │finance_         ││ contenu jsonb  │
     │  │  │      │ fonction_id ──┼─►│  categories     ││ (figé) · pdf   │
     │  │  │      └───────────────┘  │ sens           │└────────────────┘
     │  │  │             │            └────────────────┘
     │  │  └──► grades   └──► fonctions (est_financiere, ordre_protocolaire)
     │  └─────► nationalites
     └────────► baptemes          ┌──────────────┐
                                  │  transferts  │ workflow d'approbation
   ┌────────────┐                 └──────────────┘
   │  profiles  │──► user_permissions (permission + scope_entity_id)
   │ auth_user_ │──► permission_profiles
   │ id · role  │──► dashboard_layouts
   │ entity_id  │──► audit_log
   └────────────┘
   ┌──────────────────────┐
   │ organisation_settings│  workflow financier · fenêtre baptisés · devise
   └──────────────────────┘
```

### 3.2 Types énumérés

```sql
create type entity_type      as enum ('SIEGE','REGIONAL','DISTRICT','PAROISSE','EGLISE','CELLULE');
create type sexe_type        as enum ('M','F');
create type statut_marital   as enum ('CELIBATAIRE','MARIE','VEUF','DIVORCE','AUTRE');
create type statut_croyant   as enum ('ACTIF','INACTIF','TRANSFERE','DECEDE');
create type user_role        as enum ('SUPERADMIN','ENTITE_ADMIN','ENTITE_OPERATEUR','LECTEUR');
create type sens_finance     as enum ('RECETTE','DEPENSE');
create type statut_mouvement as enum ('BROUILLON','SOUMIS','VALIDE','REJETE','ANNULE');
create type statut_transfert as enum ('DEMANDE','APPROUVE','REFUSE','ANNULE','EFFECTUE');
create type categorie_fonction as enum ('DIRECTION','FINANCE','COMMUNICATION','OEUVRES','AUTRE');
create type visibilite_modele as enum ('PRIVE','ENTITE','DESCENDANTS','GLOBAL');
create type statut_rapport   as enum ('BROUILLON','GENERE','PUBLIE','ARCHIVE');
```

### 3.3 Table `entities` — la hiérarchie *(RG-01 à RG-03)*

```sql
create extension if not exists ltree;
create extension if not exists pg_trgm;

create table entities (
  id          uuid primary key default gen_random_uuid(),
  type        entity_type not null,
  code        text        not null,
  nom         text        not null,
  parent_id   uuid        references entities(id) on delete restrict,
  niveau      smallint    not null,       -- 1=SIEGE … 6=CELLULE, dérivé de `type`
  path        ltree       not null,       -- chemin matérialisé racine → nœud
  description text,
  -- ARB-2 : autorise la saisie financière déléguée par le Siège (EF-STR-10)
  sans_acces_application boolean not null default false,
  is_active   boolean     not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),

  constraint entities_code_len    check (char_length(code) >= 3),           -- RG-02
  constraint entities_code_format check (code ~ '^[A-Z0-9][A-Z0-9-]{2,15}$'),
  constraint entities_racine      check ((type = 'SIEGE') = (parent_id is null))
);

create unique index entities_code_unique on entities (upper(code)) where deleted_at is null;
create unique index entities_siege_unique on entities ((true))                -- RG-03
  where type = 'SIEGE' and deleted_at is null;
create index entities_path_gist  on entities using gist (path);
create index entities_parent_idx on entities (parent_id) where deleted_at is null;
create index entities_type_idx   on entities (type)      where deleted_at is null;
```

**Trigger d'intégrité hiérarchique** — garantit RG-01 et maintient `niveau` / `path` :

```sql
create or replace function fn_entities_before_write() returns trigger
language plpgsql as $$
declare v_niveau smallint; v_parent entities%rowtype;
begin
  v_niveau := case new.type
    when 'SIEGE' then 1 when 'REGIONAL' then 2 when 'DISTRICT' then 3
    when 'PAROISSE' then 4 when 'EGLISE' then 5 when 'CELLULE' then 6 end;
  new.niveau := v_niveau;
  new.code   := upper(trim(new.code));

  if new.parent_id is null then
    if v_niveau <> 1 then
      raise exception 'RG-01 : une entité de type % doit avoir un parent', new.type;
    end if;
    new.path := text2ltree(replace(new.id::text,'-','_'));
  else
    select * into v_parent from entities where id = new.parent_id;
    if not found then raise exception 'Entité parente introuvable'; end if;

    -- RG-01 : parent du niveau immédiatement supérieur, aucun saut
    if v_parent.niveau <> v_niveau - 1 then
      raise exception 'RG-01 : un(e) % ne peut être rattaché(e) qu''à un(e) %, pas à un(e) %',
        new.type,
        (array['SIEGE','REGIONAL','DISTRICT','PAROISSE','EGLISE'])[v_niveau - 1],
        v_parent.type;
    end if;

    -- Interdiction des cycles lors d'un rattachement (EF-STR-07)
    if tg_op = 'UPDATE' and v_parent.path <@ text2ltree(replace(old.id::text,'-','_')) then
      raise exception 'Rattachement impossible : cycle détecté';
    end if;

    new.path := v_parent.path || text2ltree(replace(new.id::text,'-','_'));
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger trg_entities_biu before insert or update of type, parent_id, code
  on entities for each row execute function fn_entities_before_write();

-- Propagation du chemin à tout le sous-arbre après un rattachement (EF-STR-07)
create or replace function fn_entities_propagate_path() returns trigger
language plpgsql as $$
begin
  if new.path is distinct from old.path then
    update entities
       set path   = new.path || subpath(path, nlevel(old.path)),
           niveau = new.niveau + (nlevel(path) - nlevel(old.path))
     where path <@ old.path and id <> new.id;
  end if;
  return null;
end $$;

create trigger trg_entities_aiu after update of path
  on entities for each row execute function fn_entities_propagate_path();
```

### 3.4 Référentiels *(EF-REF-01 à 06)*

```sql
create table grades (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, libelle text not null,
  ordre smallint not null default 100, is_active boolean not null default true
);
-- Amorce : PASTEUR · DIACRE · EVANGELISTE · ANCIEN · CROYANT

create table nationalites (
  id uuid primary key default gen_random_uuid(),
  code_iso char(3) not null unique, libelle text not null,
  is_active boolean not null default true
);
-- Amorce : BEN Béninoise · FRA Française · MLI Malienne · CIV Ivoirienne · TGO Togolaise…

create table fonctions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  libelle text not null,
  categorie categorie_fonction not null default 'AUTRE',
  est_financiere boolean not null default false,          -- RG-31
  ordre_protocolaire smallint not null default 100,
  niveaux_applicables entity_type[] not null
    default '{SIEGE,REGIONAL,DISTRICT,PAROISSE,EGLISE,CELLULE}',
  is_active boolean not null default true
);
-- Amorce : PRESIDENT(1) · VICE_PRESIDENT(2) · SECRETAIRE(3) · SECRETAIRE_ADJOINT(4)
--          TRESORIER(5, financière) · DIR_FINANCES(6, financière)
--          DIR_COMMUNICATIONS(7) · DIR_OEUVRES(8) · COMMISSAIRE_COMPTES(9, financière)

create table finance_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, libelle text not null,
  sens sens_finance not null,                             -- RG-13 : porte le sens
  ordre smallint not null default 100, is_active boolean not null default true
);
-- Recettes : DIME · QUETE · OFFRANDE · DON · COTISATION · AUTRE_RECETTE
-- Dépenses : FONCTIONNEMENT · TRAVAUX · AIDE_SOCIALE · MISSION · TRANSPORT · AUTRE_DEPENSE
```

> **EF-REF-05** — Suppression bloquée par `on delete restrict` ; l'interface propose la désactivation (`is_active = false`), qui masque la valeur des nouvelles saisies sans altérer l'historique.

### 3.5 Table `croyants` *(RG-04 à RG-06, RG-28, RG-29)*

```sql
create table croyants (
  id             uuid primary key default gen_random_uuid(),
  matricule      text not null unique,                    -- RG-29, immuable
  photo_key      text,                                    -- clé d'objet relative (ENF-POR-03)
  nom            text not null,
  prenom         text not null,
  sexe           sexe_type not null,
  statut_marital statut_marital,
  email          text,
  telephone      text,
  date_naissance date not null,
  date_bapteme   date not null,
  adresse        text not null,
  eglise_id      uuid not null references entities(id) on delete restrict,   -- RG-04
  cellule_id     uuid references entities(id) on delete set null,
  grade_id       uuid not null references grades(id)       on delete restrict,
  nationalite_id uuid not null references nationalites(id) on delete restrict,
  statut         statut_croyant not null default 'ACTIF',
  saisi_par      uuid references profiles(id),
  saisi_depuis   uuid references entities(id),
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint croyants_dates_coherentes check (date_bapteme >= date_naissance),  -- RG-28
  constraint croyants_naissance_passee check (date_naissance <= current_date),
  constraint croyants_bapteme_passe    check (date_bapteme  <= current_date),
  constraint croyants_email_valide     check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$')
);

create index croyants_eglise_idx  on croyants (eglise_id)   where deleted_at is null;
create index croyants_cellule_idx on croyants (cellule_id)  where deleted_at is null;
create index croyants_statut_idx  on croyants (statut, sexe) where deleted_at is null;
create index croyants_bapteme_idx on croyants (date_bapteme desc) where deleted_at is null;
create index croyants_search_trgm on croyants using gin
  ((nom || ' ' || prenom || ' ' || matricule) gin_trgm_ops);
```

**Triggers de cohérence** *(RG-05, RG-29)* :

```sql
create or replace function fn_croyants_check() returns trigger
language plpgsql as $$
declare v_eglise entities%rowtype; v_cellule entities%rowtype;
begin
  select * into v_eglise from entities where id = new.eglise_id;
  if v_eglise.type <> 'EGLISE' then
    raise exception 'RG-04 : le rattachement principal doit être une Église';
  end if;

  if new.cellule_id is not null then
    select * into v_cellule from entities where id = new.cellule_id;
    if v_cellule.type <> 'CELLULE' then
      raise exception 'La cellule doit être de type CELLULE';
    end if;
    if v_cellule.parent_id <> new.eglise_id then                      -- RG-05
      raise exception 'RG-05 : la cellule "%" n''appartient pas à l''église "%"',
        v_cellule.nom, v_eglise.nom;
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.matricule := fn_generer_matricule(v_eglise.code);
  else
    new.matricule := old.matricule;                                   -- RG-29
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger trg_croyants_biu before insert or update on croyants
  for each row execute function fn_croyants_check();
```

**Génération du matricule** — `<CODE_ÉGLISE>-<ANNÉE>-<SÉQUENCE>` (ex. `EGL-COT-2026-0147`) :

```sql
create table matricule_sequences (
  cle text primary key,                    -- '<CODE_EGLISE>:<ANNEE>'
  dernier integer not null default 0
);

create or replace function fn_generer_matricule(p_code_eglise text) returns text
language plpgsql as $$
declare v_cle text; v_seq integer;
begin
  v_cle := p_code_eglise || ':' || extract(year from current_date)::text;
  insert into matricule_sequences (cle, dernier) values (v_cle, 1)
    on conflict (cle) do update set dernier = matricule_sequences.dernier + 1
    returning dernier into v_seq;
  return format('%s-%s-%s', p_code_eglise, extract(year from current_date),
                lpad(v_seq::text, 4, '0'));
end $$;
```

### 3.6 Bureaux *(RG-07 à RG-10)*

```sql
create table bureaux (
  id uuid primary key default gen_random_uuid(),
  entity_id  uuid not null references entities(id) on delete restrict,
  libelle    text not null,                  -- NOM du bureau : « Bureau executif »
  date_debut date not null,
  date_fin   date,
  is_active  boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint bureaux_periode check (date_fin is null or date_fin > date_debut)
);

-- RG-10 : au plus un mandat actif PAR BUREAU. Une entite fait coexister un
-- « Bureau executif » et un « Comite des finances » ; deux « Bureau executif »
-- ouverts en meme temps restent une erreur.
create unique index bureaux_un_actif_par_nom
  on bureaux (entity_id, lower(btrim(libelle)))
  where is_active and deleted_at is null;

create table bureau_membres (
  id uuid primary key default gen_random_uuid(),
  bureau_id   uuid not null references bureaux(id)   on delete cascade,
  croyant_id  uuid not null references croyants(id)  on delete restrict,   -- RG-07
  fonction_id uuid not null references fonctions(id) on delete restrict,
  date_debut  date not null default current_date,
  date_fin    date,
  notes       text,
  created_at  timestamptz not null default now(),
  constraint membres_periode check (date_fin is null or date_fin >= date_debut)
);

create unique index membres_fonction_unique on bureau_membres (bureau_id, fonction_id)
  where date_fin is null;                                                   -- RG-08
create unique index membres_croyant_unique on bureau_membres (bureau_id, croyant_id)
  where date_fin is null;
create index membres_croyant_idx on bureau_membres (croyant_id);            -- EF-BUR-10
```

**Trigger d'appartenance au périmètre** *(RG-09)* :

```sql
create or replace function fn_membre_dans_perimetre() returns trigger
language plpgsql as $$
declare v_path_entite ltree; v_path_croyant ltree;
        v_type entity_type; v_fonction fonctions%rowtype;
begin
  select e.path, e.type into v_path_entite, v_type
    from bureaux b join entities e on e.id = b.entity_id where b.id = new.bureau_id;
  select e.path into v_path_croyant
    from croyants c join entities e on e.id = c.eglise_id where c.id = new.croyant_id;

  if not (v_path_croyant <@ v_path_entite) then
    raise exception 'RG-09 : ce croyant n''appartient pas au périmètre de l''entité';
  end if;

  select * into v_fonction from fonctions where id = new.fonction_id;
  if not (v_type = any(v_fonction.niveaux_applicables)) then
    raise exception 'La fonction "%" n''est pas applicable au niveau %', v_fonction.libelle, v_type;
  end if;
  return new;
end $$;

create trigger trg_membre_perimetre before insert or update on bureau_membres
  for each row execute function fn_membre_dans_perimetre();
```

### 3.7 Finances *(ARB-2 / ARB-3 — RG-13 à RG-18)*

```sql
create table finance_entries (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references entities(id) on delete restrict,
  categorie_id   uuid not null references finance_categories(id) on delete restrict,
  sens           sens_finance not null,          -- DA-8 : dénormalisé depuis la catégorie
  montant        numeric(14,2) not null check (montant > 0),
  date_operation date not null,
  periode        date not null,                  -- 1er jour du mois, calculé
  libelle        text,
  reference      text,
  justificatif_key text,                         -- clé d'objet relative (ENF-POR-03)

  -- Workflow de validation (ARB-3)
  statut         statut_mouvement not null default 'BROUILLON',
  soumis_par     uuid references profiles(id),
  soumis_le      timestamptz,
  valide_par     uuid references profiles(id),
  valide_le      timestamptz,
  motif_rejet    text,
  motif_annulation text,

  -- Saisie déléguée (ARB-2, RG-15)
  est_delegue        boolean not null default false,
  saisi_par          uuid references profiles(id),
  saisi_depuis_entity_id uuid references entities(id),

  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint finance_date_passee check (date_operation <= current_date),
  constraint finance_rejet_motive check (statut <> 'REJETE' or motif_rejet is not null),
  constraint finance_annul_motive check (statut <> 'ANNULE' or motif_annulation is not null)
);

-- Index dédié au calcul du solde : seuls les mouvements validés y participent (RG-18)
create index finance_solde_idx on finance_entries (entity_id, periode, sens)
  where statut = 'VALIDE' and deleted_at is null;
create index finance_statut_idx on finance_entries (statut, entity_id)
  where deleted_at is null;
create index finance_categorie_idx on finance_entries (categorie_id, periode desc);
create index finance_delegue_idx on finance_entries (est_delegue) where est_delegue;
```

**Trigger de sens, de période, de workflow et d'immuabilité** *(RG-13, RG-16, RG-17)* :

```sql
create or replace function fn_finance_before_write() returns trigger
language plpgsql as $$
declare v_workflow_actif boolean;
begin
  new.periode := date_trunc('month', new.date_operation)::date;

  -- RG-13 : le sens est déduit de la catégorie et figé après validation
  if tg_op = 'INSERT' or new.categorie_id is distinct from old.categorie_id then
    select sens into new.sens from finance_categories where id = new.categorie_id;
  end if;

  select finance_validation_active into v_workflow_actif from organisation_settings limit 1;

  if tg_op = 'INSERT' then
    -- RG-16 : workflow désactivé ⇒ validation immédiate
    if not v_workflow_actif and new.statut = 'BROUILLON' then
      new.statut := 'VALIDE'; new.valide_le := now();
    end if;
  else
    -- RG-17 : un mouvement validé est immuable, sauf annulation motivée
    if old.statut = 'VALIDE' then
      if not (new.statut = 'ANNULE' and new.motif_annulation is not null) then
        raise exception
          'RG-17 : un mouvement validé est immuable ; seule une annulation motivée est possible';
      end if;
      if (new.montant, new.categorie_id, new.entity_id, new.date_operation, new.sens)
         is distinct from (old.montant, old.categorie_id, old.entity_id, old.date_operation, old.sens)
      then
        raise exception 'RG-17 : les données d''un mouvement validé ne peuvent être modifiées';
      end if;
    end if;

    -- Transitions autorisées
    if old.statut = 'BROUILLON' and new.statut not in ('BROUILLON','SOUMIS','VALIDE','ANNULE')
    or old.statut = 'SOUMIS'    and new.statut not in ('SOUMIS','VALIDE','REJETE','ANNULE')
    or old.statut = 'REJETE'    and new.statut not in ('REJETE','BROUILLON','ANNULE')
    or old.statut = 'ANNULE'    and new.statut <> 'ANNULE' then
      raise exception 'Transition de statut interdite : % → %', old.statut, new.statut;
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

create trigger trg_finance_biu before insert or update on finance_entries
  for each row execute function fn_finance_before_write();
```

> **Séparation saisie / validation** *(EF-FIN-18)* — contrôlée dans l'action serveur `validerMouvement` : si `organisation_settings.separation_saisie_validation` est vrai, `valide_par <> soumis_par` est exigé.

### 3.8 Transferts *(ARB-4 — RG-11, RG-12)*

```sql
create table transferts (
  id uuid primary key default gen_random_uuid(),
  croyant_id       uuid not null references croyants(id) on delete cascade,
  niveau_transfert entity_type not null,     -- niveau auquel le changement s'opère
  from_eglise_id   uuid references entities(id),
  to_eglise_id     uuid not null references entities(id),
  from_cellule_id  uuid references entities(id),
  to_cellule_id    uuid references entities(id),

  statut         statut_transfert not null default 'DEMANDE',
  motif          text,
  motif_refus    text,
  date_demande   timestamptz not null default now(),
  demande_par    uuid references profiles(id),
  date_decision  timestamptz,
  decide_par     uuid references profiles(id),
  date_effet     date,                        -- renseignée au passage à EFFECTUE

  -- Ancêtre commun des deux entités : borne l'ensemble des approbateurs compétents (RG-12)
  ancetre_commun_id uuid references entities(id),

  created_at timestamptz not null default now(),
  constraint transfert_refus_motive check (statut <> 'REFUSE' or motif_refus is not null)
);

create index transferts_croyant_idx  on transferts (croyant_id, date_demande desc);
create index transferts_attente_idx  on transferts (statut, ancetre_commun_id)
  where statut = 'DEMANDE';
```

**Calcul de l'ancêtre commun** — l'approbateur compétent est celui dont le périmètre le couvre :

```sql
create or replace function fn_ancetre_commun(a uuid, b uuid) returns uuid
language sql stable as $$
  with pa as (select path from entities where id = a),
       pb as (select path from entities where id = b)
  select e.id from entities e, pa, pb
   where pa.path <@ e.path and pb.path <@ e.path
   order by nlevel(e.path) desc limit 1;      -- le plus petit ancêtre commun
$$;
```

> **RG-11** — Le passage à `EFFECTUE` s'exécute dans **une seule transaction** (action `appliquerTransfert`) : clôture des mandats de bureau détenus dans l'entité d'origine (`date_fin = date_effet`), mise à jour de `croyants.eglise_id` / `cellule_id`, statut du transfert, écriture d'audit. Un transfert `DEMANDE` ou `REFUSE` ne modifie **aucune** donnée du croyant.

### 3.9 Baptêmes *(EF-BAP-01 à 07)*

```sql
create table baptemes (
  id uuid primary key default gen_random_uuid(),
  croyant_id      uuid not null unique references croyants(id) on delete cascade,
  entity_id       uuid not null references entities(id),      -- entité déclarante
  date_bapteme    date not null,
  lieu            text,
  celebrant_id    uuid references croyants(id),
  session_libelle text,
  saisi_par       uuid references profiles(id),
  created_at      timestamptz not null default now()
);
create index baptemes_date_idx on baptemes (date_bapteme desc);
```

> **EF-BAP-02** — L'action `saisirBaptise` crée le croyant **et** la ligne `baptemes` dans la même transaction. `croyants.date_bapteme` reste la source de vérité des indicateurs ; `baptemes` porte les informations de cérémonie.
> **RG-30** — Un « nouveau baptisé » est un croyant dont `date_bapteme >= current_date - organisation_settings.fenetre_nouveaux_baptises_jours` (**15 jours** par défaut, *ARB-5*).

### 3.10 Comptes, habilitations et paramètres

```sql
-- Clé primaire propre, indépendante du fournisseur d'identité (DA-9 / ENF-POR-02)
create table profiles (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,                    -- identifiant chez le fournisseur d'auth
  email        text not null unique,
  nom_complet  text not null,
  role         user_role not null default 'LECTEUR',
  entity_id    uuid not null references entities(id) on delete restrict,  -- périmètre
  croyant_id   uuid references croyants(id) on delete set null,
  is_active    boolean not null default true,
  derniere_connexion timestamptz,
  created_at   timestamptz not null default now()
);

-- RG-21 : aucun compte rattaché à une Cellule ; le SuperAdmin est rattaché au Siège
create or replace function fn_profile_rattachement() returns trigger
language plpgsql as $$
declare v_type entity_type;
begin
  select type into v_type from entities where id = new.entity_id;
  if v_type = 'CELLULE' then
    raise exception 'RG-21 : une Cellule ne peut disposer d''un compte d''accès';
  end if;
  if new.role = 'SUPERADMIN' and v_type <> 'SIEGE' then
    raise exception 'Un SuperAdmin doit être rattaché au Siège';
  end if;
  return new;
end $$;
create trigger trg_profile_rattachement before insert or update on profiles
  for each row execute function fn_profile_rattachement();

-- Habilitation = clé + portée facultative (DA-10, RG-25)
create table user_permissions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  permission      text not null,
  scope_entity_id uuid references entities(id) on delete cascade,  -- null = tout le périmètre
  source          text not null default 'INDIVIDUEL',              -- ROLE | PROFIL | INDIVIDUEL
  granted_by      uuid references profiles(id),
  granted_at      timestamptz not null default now()
);
create unique index user_permissions_unique on user_permissions
  (user_id, permission, coalesce(scope_entity_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index user_permissions_user_idx on user_permissions (user_id);

-- Profils d'habilitation réutilisables (EF-ADM-05)
create table permission_profiles (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  description text,
  entity_id uuid references entities(id) on delete cascade,   -- null = profil global (Siège)
  permissions text[] not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table dashboard_layouts (
  user_id uuid primary key references profiles(id) on delete cascade,
  layout  jsonb not null,
  updated_at timestamptz not null default now()
);

create table dashboard_templates (
  id uuid primary key default gen_random_uuid(),
  nom text not null, role_cible user_role, niveau_cible entity_type,
  layout jsonb not null, is_default boolean not null default false
);

-- Paramètres globaux (EF-ADM-11) — une seule ligne
create table organisation_settings (
  id smallint primary key default 1 check (id = 1),
  nom_organisation text not null default 'SYNOD',
  logo_key text,
  devise char(3) not null default 'XOF',                    -- ARB-7 : devise unique
  fuseau_horaire text not null default 'Africa/Porto-Novo',
  format_matricule text not null default '{CODE}-{ANNEE}-{SEQ}',
  fenetre_nouveaux_baptises_jours smallint not null default 15,   -- ARB-5
  finance_validation_active boolean not null default false,       -- ARB-3
  separation_saisie_validation boolean not null default true,     -- EF-FIN-18
  transfert_auto_approbation_interne boolean not null default true, -- EF-TRF-05
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
insert into organisation_settings (id) values (1) on conflict do nothing;

-- Journal d'audit : insertion seule (ENF-SEC-08)
create table audit_log (
  id bigserial primary key,
  user_id    uuid references profiles(id),
  action     text not null,   -- CREATE|UPDATE|DELETE|TRANSFER|APPROVE|SUBMIT|VALIDATE|
                              -- REJECT|CANCEL|GRANT|REVOKE|REPORT|EXPORT|LOGIN|DENIED
  table_name text not null,
  record_id  uuid,
  entity_id  uuid references entities(id),
  diff       jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_created_idx on audit_log (created_at desc);
create index audit_record_idx  on audit_log (table_name, record_id);
create index audit_action_idx  on audit_log (action, created_at desc);
```

### 3.11 Rapports *(module Générateur de rapports)*

```sql
create table report_templates (
  id uuid primary key default gen_random_uuid(),
  nom         text not null,
  description text,
  entity_id   uuid references entities(id) on delete cascade,  -- null = modèle du Siège
  niveaux_applicables entity_type[] not null
    default '{SIEGE,REGIONAL,DISTRICT,PAROISSE,EGLISE}',       -- EF-RAP-10
  visibilite  visibilite_modele not null default 'ENTITE',
  est_officiel boolean not null default false,                 -- EF-RAP-08
  structure   jsonb not null,                                  -- cf. §12.2
  version     integer not null default 1,
  archived_at timestamptz,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index report_templates_entity_idx on report_templates (entity_id) where archived_at is null;

create table report_instances (
  id uuid primary key default gen_random_uuid(),
  template_id       uuid references report_templates(id) on delete set null,
  template_snapshot jsonb not null,          -- structure du modèle au moment de la génération
  nom               text not null,
  entity_id         uuid not null references entities(id) on delete restrict,
  periode_debut     date not null,
  periode_fin       date not null,
  parametres        jsonb not null default '{}'::jsonb,
  contenu           jsonb not null,          -- RG-27 : données FIGÉES
  blocs_omis        jsonb not null default '[]'::jsonb,  -- RG-26 : traçabilité des omissions
  pdf_key           text,                    -- clé d'objet relative
  statut            statut_rapport not null default 'GENERE',
  genere_par        uuid references profiles(id),
  genere_le         timestamptz not null default now(),
  publie_le         timestamptz,
  constraint report_periode check (periode_fin >= periode_debut)
);
create index report_instances_entity_idx on report_instances (entity_id, genere_le desc);
```

### 3.12 Agrégats pour tableaux de bord et rapports *(DA-6)*

```sql
-- Effectifs et gouvernance, consolidés sur le sous-arbre
create materialized view mv_entity_kpis as
select
  e.id as entity_id, e.path, e.type,
  count(distinct c.id) filter (where c.statut = 'ACTIF')                  as croyants_total,
  count(distinct c.id) filter (where c.statut = 'ACTIF' and c.sexe = 'F') as croyants_femmes,
  count(distinct c.id) filter (where c.statut = 'ACTIF' and c.sexe = 'M') as croyants_hommes,
  count(distinct c.id) filter (where c.statut = 'ACTIF' and c.cellule_id is not null)
                                                                          as croyants_encellules,
  count(distinct c.id) filter (
    where c.date_bapteme >= current_date
        - (select fenetre_nouveaux_baptises_jours from organisation_settings limit 1)
  )                                                                       as nouveaux_baptises,
  count(distinct d.id) filter (where d.type = 'CELLULE')  as nb_cellules,
  count(distinct d.id) filter (where d.type = 'EGLISE')   as nb_eglises,
  count(distinct d.id) filter (where d.type = 'PAROISSE') as nb_paroisses,
  count(distinct d.id) filter (where d.type = 'DISTRICT') as nb_districts,
  count(distinct d.id) filter (where d.type = 'REGIONAL') as nb_regionaux,
  count(distinct bm.id)                                   as membres_bureau,
  count(distinct bm.id) filter (where f.est_financiere)   as membres_finances
from entities e
left join entities d        on d.path <@ e.path and d.deleted_at is null
left join croyants c        on c.eglise_id = d.id and c.deleted_at is null
left join bureaux  b        on b.entity_id = d.id and b.is_active and b.deleted_at is null
left join bureau_membres bm on bm.bureau_id = b.id and bm.date_fin is null
left join fonctions f       on f.id = bm.fonction_id
where e.deleted_at is null
group by e.id, e.path, e.type;

create unique index mv_entity_kpis_pk   on mv_entity_kpis (entity_id);
create index        mv_entity_kpis_path on mv_entity_kpis using gist (path);

-- Recettes, dépenses et SOLDE, par entité et par période (ARB-2, RG-14)
create materialized view mv_finance_kpis as
select
  e.id as entity_id, e.path, fe.periode,
  -- Consolidé : l'entité et tout son sous-arbre
  coalesce(sum(fe.montant) filter (where fe.sens = 'RECETTE'), 0) as recettes,
  coalesce(sum(fe.montant) filter (where fe.sens = 'DEPENSE'), 0) as depenses,
  coalesce(sum(case when fe.sens = 'RECETTE' then fe.montant else -fe.montant end), 0) as solde,
  -- Propre : l'entité seule (EF-FIN-12)
  coalesce(sum(fe.montant) filter (where fe.sens = 'RECETTE' and fe.entity_id = e.id), 0)
                                                                  as recettes_propres,
  coalesce(sum(fe.montant) filter (where fe.sens = 'DEPENSE' and fe.entity_id = e.id), 0)
                                                                  as depenses_propres,
  count(*)                                        as nb_mouvements,
  count(*) filter (where fe.est_delegue)          as nb_mouvements_delegues
from entities e
join entities d         on d.path <@ e.path and d.deleted_at is null
join finance_entries fe on fe.entity_id = d.id
                       and fe.statut = 'VALIDE'          -- RG-18
                       and fe.deleted_at is null
where e.deleted_at is null
group by e.id, e.path, fe.periode;

create unique index mv_finance_kpis_pk   on mv_finance_kpis (entity_id, periode);
create index        mv_finance_kpis_path on mv_finance_kpis using gist (path);

-- Détail par catégorie, pour les graphiques et les blocs de rapport
create materialized view mv_finance_par_categorie as
select e.id as entity_id, e.path, fe.periode, fe.categorie_id,
       fc.code as categorie_code, fc.libelle as categorie_libelle, fc.sens,
       sum(fe.montant) as total, count(*) as nb_mouvements
from entities e
join entities d         on d.path <@ e.path and d.deleted_at is null
join finance_entries fe on fe.entity_id = d.id and fe.statut = 'VALIDE' and fe.deleted_at is null
join finance_categories fc on fc.id = fe.categorie_id
where e.deleted_at is null
group by e.id, e.path, fe.periode, fe.categorie_id, fc.code, fc.libelle, fc.sens;

create unique index mv_finance_cat_pk on mv_finance_par_categorie (entity_id, periode, categorie_id);
```

> **Solde cumulé depuis l'origine** *(EF-FIN-10)* — obtenu en sommant `mv_finance_kpis.solde` sur toutes les périodes `<= P` pour l'entité : une agrégation sur un index unique, sans nouvelle vue.
>
> **Rafraîchissement** — `refresh materialized view concurrently` toutes les 15 minutes via `app/api/cron/refresh-kpi`, et immédiatement après toute mutation structurante (création de croyant, transfert effectif, validation ou annulation de mouvement). La date du dernier rafraîchissement est affichée dans le tableau de bord.

---

## 4. Sécurité, périmètres et RLS

### 4.1 Fonctions de contexte

```sql
-- Identité du fournisseur d'auth — SEUL point de couplage (ENF-POR-02)
create or replace function app_current_auth_id() returns uuid
language plpgsql stable as $$
begin
  begin
    return auth.uid();                                    -- fournisseur actuel : Supabase
  exception when others then
    return nullif(current_setting('app.user_id', true), '')::uuid;  -- repli portable
  end;
end $$;

create or replace function current_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where auth_user_id = app_current_auth_id() and is_active
$$;

create or replace function current_scope_path() returns ltree
language sql stable security definer set search_path = public as $$
  select e.path from profiles p join entities e on e.id = p.entity_id
   where p.id = current_profile_id()
$$;

create or replace function is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles
                  where id = current_profile_id() and role = 'SUPERADMIN')
$$;

-- RG-20 : l'entité est-elle dans le périmètre du compte ?
create or replace function entity_in_scope(p_entity_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_superadmin()
      or exists (select 1 from entities e
                  where e.id = p_entity_id and e.path <@ current_scope_path())
$$;

-- RG-25 : le droit est-il détenu, et sa portée couvre-t-elle l'entité visée ?
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
                p_entity_id is null              -- on teste la seule détention du droit
             or up.scope_entity_id is null       -- portée = tout le périmètre du compte
             or exists (select 1 from entities e
                         where e.id = p_entity_id and e.path <@ se.path)
           )
      )
$$;

-- Contrôle complet : droit détenu + portée + périmètre
create or replace function can(p_permission text, p_entity_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select entity_in_scope(p_entity_id) and has_perm(p_permission, p_entity_id)
$$;
```

### 4.2 Politiques RLS

```sql
alter table entities            enable row level security;
alter table croyants            enable row level security;
alter table bureaux             enable row level security;
alter table bureau_membres      enable row level security;
alter table finance_entries     enable row level security;
alter table transferts          enable row level security;
alter table baptemes            enable row level security;
alter table profiles            enable row level security;
alter table user_permissions    enable row level security;
alter table report_templates    enable row level security;
alter table report_instances    enable row level security;
alter table audit_log           enable row level security;

-- ENTITÉS ------------------------------------------------------------------
create policy entities_select on entities for select
  using (is_superadmin() or path <@ current_scope_path() or current_scope_path() <@ path);
  --      ↑ mes descendants                      ↑ mes ancêtres (fil d'Ariane lisible)

create policy entities_insert on entities for insert
  with check (has_perm('entity.create', parent_id)
              and (is_superadmin()
                   or exists (select 1 from entities p
                               where p.id = parent_id and p.path <@ current_scope_path())));

create policy entities_update on entities for update
  using (can('entity.update', id)) with check (entity_in_scope(id));

create policy entities_delete on entities for delete using (is_superadmin());

-- CROYANTS -----------------------------------------------------------------
create policy croyants_select on croyants for select using (entity_in_scope(eglise_id));
create policy croyants_insert on croyants for insert
  with check (can('croyant.create', eglise_id));
create policy croyants_update on croyants for update
  using (can('croyant.update', eglise_id)) with check (entity_in_scope(eglise_id));
create policy croyants_delete on croyants for delete
  using (can('croyant.delete', eglise_id));

-- BUREAUX ------------------------------------------------------------------
create policy bureaux_select on bureaux for select using (entity_in_scope(entity_id));
create policy bureaux_all    on bureaux for all
  using (can('bureau.manage', entity_id)) with check (can('bureau.manage', entity_id));

create policy membres_select on bureau_membres for select
  using (exists (select 1 from bureaux b where b.id = bureau_id and entity_in_scope(b.entity_id)));
create policy membres_all on bureau_membres for all
  using (exists (select 1 from bureaux b
                  where b.id = bureau_id and can('bureau.manage', b.entity_id)))
  with check (exists (select 1 from bureaux b
                       where b.id = bureau_id and can('bureau.manage', b.entity_id)));

-- FINANCES (ARB-2 / ARB-3) -------------------------------------------------
create policy finance_select on finance_entries for select
  using (can('finance.read', entity_id));

-- RG-15 : saisie dans son périmètre, OU saisie déléguée par un porteur de finance.delegate
create policy finance_insert on finance_entries for insert
  with check (
       (can('finance.create', entity_id) and statut in ('BROUILLON','SOUMIS','VALIDE'))
    or (has_perm('finance.delegate') and est_delegue)
  );

create policy finance_update on finance_entries for update
  using (
       (can('finance.update',   entity_id) and statut in ('BROUILLON','REJETE'))
    or  can('finance.submit',   entity_id)
    or  can('finance.validate', entity_id)          -- RG-16 : validation AU NIVEAU DE L'ENTITÉ
    or (has_perm('finance.delegate') and est_delegue)
  )
  with check (entity_in_scope(entity_id) or has_perm('finance.delegate'));

create policy finance_delete on finance_entries for delete
  using (is_superadmin());

-- TRANSFERTS (ARB-4) -------------------------------------------------------
create policy transferts_select on transferts for select
  using (entity_in_scope(to_eglise_id) or entity_in_scope(from_eglise_id));

create policy transferts_insert on transferts for insert
  with check (can('croyant.transfer', from_eglise_id) and statut = 'DEMANDE');

-- RG-12 : seul un approbateur dont le périmètre couvre l'ancêtre commun peut décider
create policy transferts_update on transferts for update
  using (has_perm('transfer.approve', ancetre_commun_id)
         and entity_in_scope(ancetre_commun_id))
  with check (entity_in_scope(ancetre_commun_id));

-- RAPPORTS -----------------------------------------------------------------
create policy templates_select on report_templates for select
  using (
       is_superadmin()
    or visibilite = 'GLOBAL'
    or (entity_id is not null and entity_id = (select entity_id from profiles
                                                where id = current_profile_id()))
    or (visibilite = 'DESCENDANTS' and current_scope_path() <@
         (select path from entities where id = report_templates.entity_id))
  );
create policy templates_write on report_templates for all
  using (has_perm('report.create') and entity_in_scope(coalesce(entity_id, entities_siege_id())))
  with check (has_perm('report.create'));

create policy instances_select on report_instances for select
  using (entity_in_scope(entity_id) and has_perm('report.read'));
create policy instances_insert on report_instances for insert
  with check (can('report.create', entity_id));

-- HABILITATIONS : lecture de ses propres droits, écriture encadrée par RG-24 (§5.3)
create policy perms_select on user_permissions for select
  using (user_id = current_profile_id() or has_perm('user.manage'));
create policy perms_write on user_permissions for all
  using (has_perm('permission.delegate')) with check (has_perm('permission.delegate'));

-- AUDIT : lecture seule, jamais de modification ni de suppression (ENF-SEC-08)
create policy audit_select on audit_log for select
  using (has_perm('audit.read') and (entity_id is null or entity_in_scope(entity_id)));
create policy audit_insert on audit_log for insert with check (true);
revoke update, delete on audit_log from authenticated;

-- RÉFÉRENTIELS : lisibles par tous les authentifiés, gérés par le SuperAdmin
create policy ref_select on grades for select to authenticated using (true);
create policy ref_write  on grades for all using (has_perm('referentiel.manage'))
                                    with check (has_perm('referentiel.manage'));
-- (politiques identiques sur nationalites, fonctions, finance_categories)
```

### 4.3 Défense en profondeur

| Couche | Contrôle |
|---|---|
| **Middleware Next.js** | Session valide, redirection vers `/connexion`, rafraîchissement du jeton |
| **Layout applicatif** | Chargement du profil et des habilitations **avec leurs portées**, une fois, transmis par contexte |
| **`<PermissionGate perm scope>`** | Masque les actions non autorisées — **confort d'affichage uniquement** |
| **Server Action** | Revalidation systématique : session → habilitation → **portée** → périmètre → règles de gestion → audit |
| **PostgreSQL / RLS** | Filet ultime : une requête hors périmètre ne retourne **aucune ligne** |

### 4.4 Assainissement des entrées

Toute chaîne libre (`nom`, `adresse`, `libelle`, `motif`, `notes`, **texte des blocs de rapport**) traverse `sanitize()` (`lib/utils/sanitize.ts`, DOMPurify côté serveur) **avant persistance**, et n'est jamais rendue via `dangerouslySetInnerHTML`. Les téléversements sont contrôlés sur leur **signature de fichier**, pas sur leur extension.

---

## 5. Habilitations fines et délégation

> *ARB-3 : « une habilitation fine comme Stratrack, configurable depuis le SuperAdmin et un Admin d'une Entité ».*
> Reprend le modèle « **droits par catégorie** + **périmètres d'accès par structure** ».

### 5.1 Catalogue déclaratif

```ts
// lib/domain/permissions.ts
export const PERMISSION_GROUPS = [
  'Structure', 'Croyants', 'Bureaux', 'Finances', 'Rapports', 'Pilotage', 'Administration',
] as const;

export const PERMISSIONS = {
  'entity.read':         { label: 'Consulter la structure',            group: 'Structure' },
  'entity.create':       { label: 'Créer une entité',                  group: 'Structure' },
  'entity.update':       { label: 'Modifier une entité',               group: 'Structure' },
  'entity.delete':       { label: 'Supprimer une entité',              group: 'Structure' },

  'croyant.read':        { label: 'Consulter les croyants',            group: 'Croyants' },
  'croyant.create':      { label: 'Créer un croyant',                  group: 'Croyants' },
  'croyant.update':      { label: 'Modifier un croyant',               group: 'Croyants' },
  'croyant.delete':      { label: 'Supprimer un croyant',              group: 'Croyants' },
  'croyant.transfer':    { label: 'Demander un transfert',             group: 'Croyants' },
  'transfer.approve':    { label: 'Approuver un transfert',            group: 'Croyants' },
  'bapteme.create':      { label: 'Saisir un nouveau baptisé',         group: 'Croyants' },

  'bureau.read':         { label: 'Consulter les bureaux',             group: 'Bureaux' },
  'bureau.manage':       { label: 'Gérer les bureaux',                 group: 'Bureaux' },

  'finance.read':        { label: 'Consulter les finances et le solde', group: 'Finances' },
  'finance.create':      { label: 'Saisir un mouvement',               group: 'Finances' },
  'finance.update':      { label: 'Modifier un brouillon',             group: 'Finances' },
  'finance.submit':      { label: 'Soumettre pour validation',         group: 'Finances' },
  'finance.validate':    { label: 'Valider ou rejeter un mouvement',   group: 'Finances' },
  'finance.delegate':    { label: 'Saisir pour le compte d\'une entité', group: 'Finances' },

  'report.read':         { label: 'Consulter les rapports',            group: 'Rapports' },
  'report.create':       { label: 'Composer et générer un rapport',    group: 'Rapports' },
  'report.publish':      { label: 'Publier un rapport',                group: 'Rapports' },
  'report.template.manage': { label: 'Gérer les modèles partagés',     group: 'Rapports' },

  'dashboard.configure': { label: 'Personnaliser son tableau de bord', group: 'Pilotage' },
  'export.data':         { label: 'Exporter les données',              group: 'Pilotage' },

  'referentiel.manage':  { label: 'Gérer les référentiels',            group: 'Administration' },
  'user.manage':         { label: 'Gérer les comptes',                 group: 'Administration' },
  'permission.delegate': { label: 'Déléguer des habilitations',        group: 'Administration' },
  'settings.manage':     { label: 'Modifier les paramètres généraux',  group: 'Administration' },
  'audit.read':          { label: 'Consulter le journal d\'audit',     group: 'Administration' },
  'trash.restore':       { label: 'Restaurer depuis la corbeille',     group: 'Administration' },
} as const;

export type Permission = keyof typeof PERMISSIONS;

/** Droits jamais délégables : réservés au SuperAdmin (§4.3 du cahier des charges). */
export const NON_DELEGABLES: Permission[] = [
  'entity.delete', 'referentiel.manage', 'settings.manage', 'finance.delegate',
];

/** Gabarits appliqués à la création d'un compte, ajustables droit par droit ensuite. */
export const ROLE_TEMPLATES: Record<UserRole, Permission[]> = {
  SUPERADMIN: Object.keys(PERMISSIONS) as Permission[],
  ENTITE_ADMIN: [
    'entity.read','entity.create','entity.update',
    'croyant.read','croyant.create','croyant.update','croyant.transfer','transfer.approve',
    'bapteme.create','bureau.read','bureau.manage',
    'finance.read','finance.create','finance.update','finance.submit','finance.validate',
    'report.read','report.create','report.publish','report.template.manage',
    'dashboard.configure','export.data','user.manage','permission.delegate',
    'audit.read','trash.restore',
  ],
  ENTITE_OPERATEUR: [
    'entity.read','croyant.read','croyant.create','croyant.update','bapteme.create',
    'bureau.read','finance.read','finance.create','finance.submit',
    'report.read','report.create','dashboard.configure',
  ],
  LECTEUR: [
    'entity.read','croyant.read','bureau.read','finance.read','report.read',
    'export.data','dashboard.configure',
  ],
};
```

### 5.2 Habilitation avec portée *(RG-25)*

Une habilitation est le couple **(clé, portée)**. La portée est `null` — tout le périmètre du compte — ou une **sous-structure** de ce périmètre.

```
Compte : Admin du District AVARADRANO   (périmètre = District + ses 12 paroisses)

  finance.read       portée = null            → lit les finances de tout le district
  finance.create     portée = PAR-ANTANANARIVO → ne saisit QUE pour cette paroisse
                                                 et ses églises/cellules
  finance.validate   portée = null            → valide partout dans le district
  transfer.approve   portée = null            → approuve les transferts internes au district
```

### 5.3 Règles de délégation *(RG-24)*

```ts
// lib/domain/permissions.ts
export function peutDeleguer(
  delegant: SessionUser,
  cible: { entityId: string; entityPath: string },
  octroi: { permission: Permission; scopeEntityId: string | null; scopePath: string | null },
): Result {
  if (delegant.role === 'SUPERADMIN') return ok();

  if (!delegant.can('permission.delegate'))
    return ko('Vous ne pouvez pas déléguer d\'habilitations.');

  if (NON_DELEGABLES.includes(octroi.permission))
    return ko(`« ${PERMISSIONS[octroi.permission].label} » est réservé à l'administration du Siège.`);

  // Le compte cible doit être dans le périmètre du délégant
  if (!estDescendant(cible.entityPath, delegant.scopePath))
    return ko('Ce compte n\'appartient pas à votre périmètre.');

  // On ne délègue que ce que l'on détient soi-même
  const detenu = delegant.permissions.find(p => p.permission === octroi.permission);
  if (!detenu) return ko('Vous ne détenez pas ce droit et ne pouvez donc pas l\'accorder.');

  // La portée accordée doit être INCLUSE dans la portée détenue
  const portéeDétenue = detenu.scopePath ?? delegant.scopePath;
  const portéeAccordée = octroi.scopePath ?? cible.entityPath;
  if (!estDescendant(portéeAccordée, portéeDétenue))
    return ko('La portée demandée dépasse celle de votre propre habilitation.');

  return ok();
}
```

Le même contrôle est appliqué **en base** par un trigger sur `user_permissions`, pour que RG-24 tienne même en cas d'appel direct :

```sql
create or replace function fn_check_delegation() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cible_path ltree; v_portee_accordee ltree; v_portee_detenue ltree;
begin
  if is_superadmin() then return new; end if;

  if not has_perm('permission.delegate') then
    raise exception 'RG-24 : vous ne pouvez pas déléguer d''habilitations';
  end if;

  if new.permission in ('entity.delete','referentiel.manage','settings.manage','finance.delegate') then
    raise exception 'RG-24 : le droit "%" n''est pas délégable', new.permission;
  end if;

  select e.path into v_cible_path
    from profiles p join entities e on e.id = p.entity_id where p.id = new.user_id;
  if not (v_cible_path <@ current_scope_path()) then
    raise exception 'RG-24 : le compte cible est hors de votre périmètre';
  end if;

  -- Le délégant doit détenir le droit, et la portée accordée être incluse dans la sienne
  select coalesce(se.path, current_scope_path()) into v_portee_detenue
    from user_permissions up left join entities se on se.id = up.scope_entity_id
   where up.user_id = current_profile_id() and up.permission = new.permission
   order by nlevel(coalesce(se.path, current_scope_path())) asc limit 1;

  if v_portee_detenue is null then
    raise exception 'RG-24 : vous ne détenez pas le droit "%"', new.permission;
  end if;

  select coalesce(e.path, v_cible_path) into v_portee_accordee
    from (select 1) x left join entities e on e.id = new.scope_entity_id;

  if not (v_portee_accordee <@ v_portee_detenue) then
    raise exception 'RG-24 : la portée accordée dépasse celle de votre habilitation';
  end if;

  new.granted_by := current_profile_id();
  return new;
end $$;

create trigger trg_check_delegation before insert or update on user_permissions
  for each row execute function fn_check_delegation();
```

> **ENF-SEC-11** — Chaque rejet écrit une ligne d'audit `action = 'DENIED'` avec le droit et la portée demandés.

### 5.4 Consommation

```tsx
// Interface — confort d'affichage, jamais une sécurité
<PermissionGate perm="finance.validate" scope={mouvement.entityId}>
  <Button onClick={valider}>Valider</Button>
</PermissionGate>
```

```ts
// Serveur — obligatoire
export async function validerMouvement(input: unknown) {
  const session = await requireSession();
  const { id } = validerSchema.parse(input);
  const mvt = await db.finance.byId(id);

  await requirePermission(session, 'finance.validate', mvt.entityId);   // droit + portée
  await requireEntityInScope(session, mvt.entityId);                    // périmètre (RG-20)
  assertTransitionAutorisee(mvt.statut, 'VALIDE');                      // RG-16

  const settings = await getSettings();
  if (settings.separationSaisieValidation && mvt.soumisPar === session.profileId)
    return ko('La séparation saisie/validation interdit de valider votre propre soumission.');

  const updated = await db.finance.update(id, {
    statut: 'VALIDE', validePar: session.profileId,
  });
  await audit({ action: 'VALIDATE', table: 'finance_entries', recordId: id,
                entityId: mvt.entityId, diff: { avant: mvt.statut, apres: 'VALIDE' } });

  revalidatePath('/finances'); revalidateTag(`solde:${mvt.entityId}`);
  return ok(updated);
}
```

---

## 6. Workflows

### 6.1 Transfert d'un croyant *(ARB-4 — RG-11, RG-12)*

```
┌──────────┐  demanderTransfert     ┌──────────┐
│  (aucun) │ ─────────────────────► │ DEMANDE  │
└──────────┘  croyant.transfer      └────┬─────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              │ approuverTransfert        │ refuserTransfert          │ annulerDemande
              │ transfer.approve          │ transfer.approve          │ (le demandeur)
              │ sur l'ancêtre commun      │ + motif obligatoire       │
              ▼                           ▼                           ▼
        ┌───────────┐                ┌─────────┐                 ┌─────────┐
        │ APPROUVE  │                │ REFUSE  │                 │ ANNULE  │
        └─────┬─────┘                └─────────┘                 └─────────┘
              │ appliquerTransfert (transaction unique)
              ▼
        ┌───────────┐   • MAJ croyants.eglise_id / cellule_id
        │ EFFECTUE  │   • Clôture des mandats de bureau de l'entité d'origine
        └───────────┘   • date_effet, audit, rafraîchissement des agrégats
```

**Auto-approbation intra-périmètre** *(EF-TRF-05)* — si `organisation_settings.transfert_auto_approbation_interne` est vrai, que les deux entités sont dans le périmètre du demandeur et que celui-ci détient `transfer.approve` sur l'ancêtre commun, l'action enchaîne `DEMANDE → APPROUVE → EFFECTUE` en une transaction, en écrivant les trois lignes d'audit. La traçabilité est identique ; seule l'attente disparaît.

### 6.2 Mouvement financier *(ARB-3 — RG-16, RG-17)*

```
                    organisation_settings.finance_validation_active
        ┌────────────────── false ──────────────────┬───────── true ─────────────────┐
        ▼                                            ▼                                │
  creerMouvement                              creerMouvement                          │
  finance.create                              finance.create                          │
        │                                            │                                │
        ▼                                            ▼                                │
  ┌───────────┐                              ┌────────────┐  modifierMouvement        │
  │  VALIDE   │  (immédiat, RG-16)           │ BROUILLON  │◄─── finance.update ───┐   │
  └─────┬─────┘                              └─────┬──────┘                        │  │
        │                                          │ soumettre (finance.submit)    │  │
        │                                          ▼                               │  │
        │                                    ┌──────────┐                          │  │
        │                                    │  SOUMIS  │                          │  │
        │                                    └────┬─────┘                          │  │
        │                     valider ◄───────────┼───────────► rejeter (motivé)   │  │
        │                 finance.validate        │          finance.validate      │  │
        │                 AU NIVEAU DE L'ENTITÉ   │                                │  │
        │                          ▼              │              ▼                 │  │
        │                    ┌──────────┐         │        ┌──────────┐            │  │
        └───────────────────►│  VALIDE  │         │        │  REJETE  │────────────┘  │
                             └────┬─────┘         │        └──────────┘               │
                                  │ annuler (motif obligatoire)                       │
                                  ▼                                                   │
                             ┌──────────┐   La ligne d'origine est conservée (RG-17)  │
                             │  ANNULE  │   Seuls les VALIDE alimentent le solde      │
                             └──────────┘   (RG-18)                                   │
                                                                                       ┘
```

**Saisie déléguée** *(RG-15)* — le Siège saisit un mouvement dont `entity_id` désigne l'**entité bénéficiaire**, avec `est_delegue = true`, `saisi_par = <SuperAdmin>` et `saisi_depuis_entity_id = <Siège>`. Le mouvement appartient comptablement à l'entité bénéficiaire — il entre dans **son** solde — tout en restant identifiable comme délégué dans les listes, les synthèses et les rapports *(EF-FIN-06)*.

### 6.3 Calcul du solde *(RG-14)*

```
Solde(entité E, période P) = Σ montant(RECETTE) − Σ montant(DEPENSE)
                             sur { mouvements VALIDÉS des entités D telles que D.path <@ E.path }

Restitution à l'écran (EF-FIN-10, EF-FIN-12) :
┌──────────────────────┬──────────────────────┬──────────────────────┐
│ RECETTES             │ DÉPENSES             │ SOLDE DISPONIBLE     │
│ 12 450 000 XOF       │ − 8 900 000 XOF      │ 3 550 000 XOF        │
│ dont 2 100 000 propre│ dont 1 200 000 propre│ cumulé : 9 870 000   │
└──────────────────────┴──────────────────────┴──────────────────────┘
Solde négatif ⇒ badge « Critique » bg-rose-100 text-rose-700 (UI-08, EF-FIN-13)
```

---

## 7. Architecture applicative

### 7.1 Répartition Server / Client Components

| Type | Rendu | Exemples |
|---|---|---|
| **Server Component** (défaut) | Serveur | Pages, listes, fiches, en-têtes, calcul des indicateurs, **résolution des blocs de rapport** |
| **Client Component** (`'use client'`) | Navigateur | Formulaires, `<DataTable />`, React Flow, Recharts, dialogues, grille de tableau de bord, **éditeur de rapport** |

**Règle** — la frontière client est poussée **le plus bas possible** : une page est un Server Component qui rend un îlot client uniquement là où l'interactivité l'exige.

### 7.2 Couche d'accès aux données

Une fonction par cas d'usage, typée, dans `lib/data/`. Aucun appel base dispersé dans les composants.

```ts
// lib/data/finances.ts
import 'server-only';

export async function getSoldeEntite(entityId: string, periode: { debut: Date; fin: Date }) {
  const sb = await createServerClient();                   // RLS appliquée automatiquement
  const { data, error } = await sb
    .from('mv_finance_kpis')
    .select('periode, recettes, depenses, solde, recettes_propres, depenses_propres, nb_mouvements_delegues')
    .eq('entity_id', entityId)
    .gte('periode', toPeriode(periode.debut))
    .lte('periode', toPeriode(periode.fin));

  if (error) throw new DataError('Impossible de calculer le solde', error);

  return data.reduce(agregerSolde, SOLDE_VIDE);            // logique pure, testée isolément
}
```

### 7.3 Contrat des Server Actions

```ts
export type ActionResult<T = void> =
  | { ok: true;  data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
```

**Inventaire** :

| Domaine | Actions |
|---|---|
| Structure | `creerEntite` · `modifierEntite` · `rattacherEntite` · `marquerSansAcces` · `supprimerEntite` · `restaurerEntite` · `importerStructure` |
| Croyants | `creerCroyant` · `modifierCroyant` · `supprimerCroyant` · `restaurerCroyant` · `importerCroyants` · `televerserPhoto` |
| Transferts | `demanderTransfert` · `approuverTransfert` · `refuserTransfert` · `annulerDemande` · `appliquerTransfert` · `demanderTransfertLot` |
| Baptêmes | `saisirBaptise` · `saisirBaptisesLot` |
| Bureaux | `creerBureau` · `cloturerBureau` · `reconduireBureau` · `ajouterMembre` · `remplacerMembre` · `retirerMembre` |
| Finances | `creerMouvement` · `creerMouvementDelegue` · `modifierMouvement` · `soumettreMouvement` · `validerMouvement` · `validerMouvementsLot` · `rejeterMouvement` · `annulerMouvement` · `cloturerPeriode` |
| Rapports | `creerModele` · `modifierModele` · `dupliquerModele` · `archiverModele` · `genererRapport` · `publierRapport` · `exporterRapportPdf` |
| Référentiels | `creerValeurRef` · `modifierValeurRef` · `activerValeurRef` |
| Administration | `creerUtilisateur` · `accorderHabilitation` · `retirerHabilitation` · `appliquerProfilHabilitation` · `creerProfilHabilitation` · `activerUtilisateur` · `reinitialiserMotDePasse` · `modifierParametres` · `purgerCorbeille` · `lancerExportIntegral` |
| Tableau de bord | `enregistrerLayout` · `appliquerModele` · `reinitialiserLayout` |

### 7.4 Validation partagée (Zod)

```ts
// lib/validation/finance.ts
export const mouvementSchema = z.object({
  entityId:     z.string().uuid('Sélectionnez une entité'),
  categorieId:  z.string().uuid('Sélectionnez une catégorie'),
  montant:      z.coerce.number().positive('Le montant doit être supérieur à zéro')
                  .max(9_999_999_999.99),
  dateOperation: z.coerce.date().max(new Date(), 'La date ne peut être future'),
  libelle:      z.string().trim().max(255).optional(),
  reference:    z.string().trim().max(60).optional(),
  justificatifKey: z.string().max(255).optional().nullable(),
  estDelegue:   z.boolean().default(false),
});

// Le même schéma alimente React Hook Form (zodResolver) et l'action serveur :
// un seul message d'erreur, une seule source de vérité.
```

### 7.5 Gestion du cache

| Mécanisme | Usage |
|---|---|
| `revalidatePath()` | Après mutation, sur les routes de liste concernées |
| `revalidateTag('kpi:<entityId>')` | Après mutation d'effectif (création, transfert effectif) |
| `revalidateTag('solde:<entityId>')` | Après validation ou annulation d'un mouvement |
| `unstable_cache` | Référentiels et `organisation_settings` — TTL 1 h |
| TanStack Query | Listes filtrées : conservation des filtres au retour arrière, pagination fluide |

---

## 8. Design system

> Traduction opérationnelle de `.agents/rules/designrules.md` et du langage visuel sobre des maquettes de référence.

### 8.1 Jetons de design

```css
/* app/globals.css */
@layer base {
  :root {
    /* Surfaces — UI-03 */
    --background:        0 0% 98%;      /* Gray-50  #F9FAFB — fond de page */
    --card:              0 0% 100%;     /* White    #FFFFFF — cartes */
    --border:          220 13% 91%;     /* Gray-200 #E5E7EB — bordure fine */

    /* Typographie — UI-03 */
    --foreground:      222 47% 11%;     /* Slate-900 — titres */
    --muted-foreground:215 16% 47%;     /* Slate-500 — métadonnées */

    /* Actions */
    --primary:         222 47% 11%;     /* Slate-900 — bouton principal (maquettes) */
    --primary-foreground: 0 0% 100%;
    --accent:          239 84% 67%;     /* Indigo-500 — eyebrow, état « en cours » */

    /* Sémantique — UI-08 */
    --success:         160 84% 39%;     /* Emerald — validé, solde positif */
    --warning:          38 92% 50%;     /* Amber   — en attente, soumis */
    --danger:          347 77% 50%;     /* Rose    — rejeté, solde négatif */

    --radius:          0.75rem;         /* rounded-xl — cartes (UI-02) */
    --radius-md:       0.375rem;        /* rounded-md — boutons, inputs */
  }
}
```

### 8.2 Typographie

```ts
// app/layout.tsx
import localFont from 'next/font/local';

const googleSans = localFont({
  src: [
    { path: './fonts/GoogleSans-Regular.woff2', weight: '400' },
    { path: './fonts/GoogleSans-Medium.woff2',  weight: '500' },
    { path: './fonts/GoogleSans-Bold.woff2',    weight: '700' },
  ],
  variable: '--font-sans',
  display: 'swap',                      // évite le FOIT ; aucun décalage (UI-17)
  fallback: ['Inter', 'system-ui', 'sans-serif'],
});
```

| Rôle | Classes | Usage |
|---|---|---|
| Titre de page | `text-3xl font-bold tracking-tight text-slate-900` | En-tête d'écran |
| Titre de section | `text-xl font-semibold text-slate-900` | Blocs de contenu |
| *Eyebrow* | `text-xs font-medium uppercase tracking-[0.14em] text-indigo-600` | Sur-titre de section |
| Titre de carte | `text-sm font-semibold text-slate-900` | Cartes de statistique |
| Corps | `text-sm text-slate-600` | Texte courant |
| Métadonnée | `text-xs text-slate-500` | Légendes, horodatages |
| **Valeur numérique** | `font-mono tabular-nums text-slate-900` | **Obligatoire** (UI-07) |
| **Montant négatif** | `font-mono tabular-nums text-rose-600` | Dépenses, solde négatif (UI-13) |

### 8.3 Grille de 8 px *(UI-01)*

| Contexte | Classe | Pixels |
|---|---|---|
| Intérieur de carte | `p-6` | 24 |
| Espace entre cartes | `gap-4` | 16 |
| Espace entre sections | `space-y-8` | 32 |
| Champ ↔ libellé | `gap-2` | 8 |
| Padding de page | `px-4 md:px-8 py-6` | 16/32 · 24 |
| Hauteur de bouton | `h-10` | 40 |
| Hauteur de ligne de tableau | `h-12` | 48 |

> **Contrôle** — règle ESLint interdisant les valeurs arbitraires d'espacement non multiples de 8 (`p-[13px]` rejeté).

### 8.4 Composants de référence

**Carte de statistique** :

```tsx
export function StatCard({ label, value, delta, icon: Icon, format = 'number' }: StatCardProps) {
  return (
    <Card className="rounded-xl border-slate-200 shadow-none transition-colors hover:border-slate-300">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className={cn('font-mono text-3xl font-bold tabular-nums',
                             value < 0 ? 'text-rose-600' : 'text-slate-900')}>
              {formatValue(value, format)}
            </p>
          </div>
          <div className="flex size-10 items-center justify-center rounded-md bg-slate-50 text-slate-600">
            <Icon className="size-5" strokeWidth={1.75} />
          </div>
        </div>
        {delta !== undefined && (
          <div className="mt-4 flex items-center gap-2">
            <StatusBadge tone={delta >= 0 ? 'success' : 'danger'}>
              {delta >= 0 ? '+' : ''}{delta.toFixed(1)} %
            </StatusBadge>
            <span className="text-xs text-slate-500">vs période précédente</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Badge de statut** *(UI-08)* :

```tsx
const TONES = {
  success: 'bg-emerald-100 text-emerald-700',   // Validé · Approuvé · Solde positif
  warning: 'bg-amber-100 text-amber-700',       // Soumis · En attente d'approbation
  danger:  'bg-rose-100 text-rose-700',         // Rejeté · Refusé · Solde négatif
  neutral: 'bg-slate-100 text-slate-700',       // Brouillon · Annulé
} as const;

export const StatusBadge = ({ tone = 'neutral', children }: BadgeProps) => (
  <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', TONES[tone])}>
    {children}
  </span>
);
```

**En-tête de page** *(UI-11)* :

```tsx
export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-indigo-600">{eyebrow}</p>
        )}
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
```

### 8.5 Squelettes de chargement *(UI-15 à UI-18 — règle systématique)*

Chaque page possède un squelette **calqué sur sa structure finale**, dans `components/skeletons/`, exposé via `loading.tsx` :

```tsx
export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2 border-b border-slate-200 pb-6">
        <Skeleton className="h-3 w-32" />         {/* eyebrow */}
        <Skeleton className="h-9 w-72" />         {/* titre   */}
        <Skeleton className="h-4 w-96" />         {/* sous-titre */}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="rounded-xl border-slate-200 shadow-none">
            <CardContent className="space-y-4 p-6">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-20" />   {/* hauteur de text-3xl : zéro layout shift */}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
```

**Inventaire** : `DashboardSkeleton` · `TableSkeleton` · `FormSkeleton` · `DetailSkeleton` · `FlowSkeleton` · `ChartSkeleton` · `ReportEditorSkeleton` · `A4PreviewSkeleton`.

> Le spinner `Loader2` est **strictement réservé** aux actions ponctuelles (UI-16) :
> `<Button disabled={pending}>{pending && <Loader2 className="mr-2 size-4 animate-spin" />}Valider</Button>`

---

## 9. Inventaire et maquettage des écrans

### 9.1 Inventaire

| # | Écran | Route | Habilitation | Composants clés |
|---|---|---|---|---|
| 1 | Connexion | `/connexion` | Public | Formulaire centré sur `Gray-50` |
| 2 | Mot de passe oublié | `/mot-de-passe-oublie` | Public | — |
| 3 | **Tableau de bord** | `/tableau-de-bord` | Tous | `DashboardGrid`, `StatCard`, `ChartCard` |
| 4 | Personnalisation | `/tableau-de-bord/personnaliser` | `dashboard.configure` | `WidgetPicker`, dnd-kit |
| 5 | **Organigramme de structure** | `/structure` | `entity.read` | `EntityFlow` (React Flow) |
| 6 | Liste des entités | `/structure/liste` | `entity.read` | `DataTable` + filtres par type |
| 7 | Fiche entité (6 onglets) | `/structure/[id]` | `entity.read` | `Tabs`, `StatCard`, `SoldeCard` |
| 8 | **Liste des croyants** | `/croyants` | `croyant.read` | `DataTable`, `FilterBar` |
| 9 | Nouveau croyant | `/croyants/nouveau` | `croyant.create` | `CroyantForm`, `PhotoUploader` |
| 10 | Fiche croyant | `/croyants/[id]` | `croyant.read` | Identité, historiques, fonctions |
| 11 | Modifier un croyant | `/croyants/[id]/modifier` | `croyant.update` | `CroyantForm` |
| 12 | Demander un transfert | `/croyants/[id]/transferer` | `croyant.transfer` | `TransferDialog`, `EntityPicker` |
| 13 | **Transferts à approuver** | `/transferts/en-attente` | `transfer.approve` | `ApprovalQueue`, traitement par lot |
| 14 | Journal des transferts | `/transferts` | `croyant.read` | `DataTable`, `TransferTimeline` |
| 15 | **Nouveaux baptisés** | `/baptemes` | `croyant.read` | Liste + filtres de période |
| 16 | Saisie de baptisé(s) | `/baptemes/nouveau` | `bapteme.create` | Formulaire simplifié, mode lot |
| 17 | Bureaux | `/bureaux` | `bureau.read` | Liste par entité, taux de couverture |
| 18 | **Fiche bureau** | `/bureaux/[id]` | `bureau.read` | `BureauFlow`, `MandatTimeline` |
| 19 | Mouvements financiers | `/finances` | `finance.read` | `DataTable`, `SoldeCard`, filtres |
| 20 | Saisie de mouvement | `/finances/nouveau` | `finance.create` | `MouvementForm` |
| 21 | **Mouvements à valider** | `/finances/a-valider` | `finance.validate` | `ValidationQueue`, lot |
| 22 | **Saisie déléguée** | `/finances/delegation` | `finance.delegate` | `DelegationBanner`, `EntityPicker` |
| 23 | Synthèse financière | `/finances/synthese` | `finance.read` | Courbes, barres, comparatifs |
| 24 | **Bibliothèque de rapports** | `/rapports` | `report.read` | `TemplateLibrary`, onglets Officiels/Mes modèles |
| 25 | **Éditeur de rapport** | `/rapports/modeles/[id]/editer` | `report.create` | `ReportEditor`, `BlockPalette`, `A4Preview` |
| 26 | Génération d'un rapport | `/rapports/generer/[templateId]` | `report.create` | Choix périmètre + période |
| 27 | Rapport généré | `/rapports/generes/[id]` | `report.read` | Rendu figé, export PDF |
| 28 | Référentiels (×4) | `/referentiels/*` | `referentiel.manage` | `DataTable` + dialogue |
| 29 | Utilisateurs | `/administration/utilisateurs` | `user.manage` | `DataTable`, invitation |
| 30 | **Habilitations** | `/administration/habilitations` | `permission.delegate` | `PermissionMatrix`, `ScopeSelector` |
| 31 | Profils d'habilitation | `/administration/profils-habilitation` | `permission.delegate` | Liste + composition |
| 32 | Journal d'audit | `/administration/audit` | `audit.read` | Table chronologique, filtres |
| 33 | Corbeille | `/administration/corbeille` | `trash.restore` | Onglets par type, restauration |
| 34 | Paramètres | `/administration/parametres` | `settings.manage` | Workflow, fenêtre baptisés, devise |
| 35 | **Portabilité** | `/administration/portabilite` | `settings.manage` | Export intégral, historique |
| 36 | Mon compte | `/mon-compte` | Tous | Profil, mot de passe, mes habilitations |

### 9.2 Gabarit d'application

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌───────────────────────────────────────────────────────┐ │
│ │  SIDEBAR     │ │ TOPBAR                                                │ │
│ │  w-64        │ │ Fil d'Ariane   [Sélecteur de périmètre ▾] 🔔③ [Avatar]│ │
│ │ (w-16 réduit)│ ├───────────────────────────────────────────────────────┤ │
│ │              │ │                          ↑ compteur d'éléments en      │ │
│ │ ◧ Tableau    │ │  ┌─ PageHeader ─────────── attente (UI-21) ───────────┐│ │
│ │   de bord    │ │  │ EYEBROW EN MAJUSCULES                             ││ │
│ │ ⌗ Structure  │ │  │ Titre de la page                    [Action ▪]    ││ │
│ │ ⚇ Croyants   │ │  │ Sous-titre explicatif en Slate-500                ││ │
│ │ ⇄ Transferts②│ │  └───────────────────────────────────────────────────┘│ │
│ │ ✚ Baptêmes   │ │                                                       │ │
│ │ ⚏ Bureaux    │ │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │ │
│ │ ⛁ Finances ① │ │  │ Carte   │ │ Carte   │ │ Carte   │ │ Carte   │     │ │
│ │ ▤ Rapports   │ │  │rounded-xl│ │         │ │         │ │         │     │ │
│ │ ⚙ Référentiels│ │  └─────────┘ └─────────┘ └─────────┘ └─────────┘     │ │
│ │ ⛨ Administration│ │           gap-4 (16 px) · grille de 8 px            │ │
│ │ ───────────  │ │                                                       │ │
│ │ Mon compte   │ │                                                       │ │
│ └──────────────┘ └───────────────────────────────────────────────────────┘ │
│  Fond : Gray-50 (#F9FAFB) · Cartes : White + border-slate-200              │
└────────────────────────────────────────────────────────────────────────────┘

Mobile (< 768 px) : sidebar en Sheet ; cartes empilées ; DataTable en cartes.
```

### 9.3 Tableau de bord

```
EYEBROW : PÉRIMÈTRE — DISTRICT AVARADRANO
Tableau de bord                                [Période ▾] [⚙ Personnaliser]
Vue consolidée de votre district et de ses 12 paroisses.
────────────────────────────────────────────────────────────────────────────
┌───────────────┐┌───────────────┐┌───────────────┐┌───────────────┐
│ CROYANTS      ││ FEMMES        ││ MEMBRES BUREAU││ SOLDE DISPONIBLE│
│ 12 480        ││ 7 116         ││ 284           ││ 3 550 000 XOF │
│ +4,2 % ▲      ││ 57,0 %        ││ 18 fonctions  ││ +12,4 % ▲     │
└───────────────┘└───────────────┘└───────────────┘└───────────────┘
   ↑ font-mono tabular-nums · icône Lucide dans un carré rounded-md

┌──────────────────────────────┐┌──────────────────────────────┐
│ ÉVOLUTION DU SOLDE           ││ RECETTES PAR CATÉGORIE       │
│  ╭─────────────────╮         ││  Dîme       ▬▬▬▬▬▬▬▬ 7 200 000│
│  │      ╱╲    ╱────│         ││  Quête      ▬▬▬▬     3 100 000│
│  │  ╱──╯  ╲──╯     │         ││  Offrande   ▬▬       1 600 000│
│  ╰─────────────────╯         ││  Don        ▬          550 000│
└──────────────────────────────┘└──────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ PAROISSES DU DISTRICT                          [Exporter ▾]    │
│ Paroisse       Code     Croyants  Bureau   Recettes    Solde   │
│ ──────────────────────────────────────────────────────────────│
│ Antananarivo   PAR-ATN    3 240  ● Actif  5 400 000  1 980 000 │
│ Ambohimanga    PAR-AMB    1 875  ● Actif  3 100 000    740 000 │
│ Ambatondrazaka PAR-ABZ      942  ○ Aucun    620 000   −180 000 │
│        ↑ pas de bordures verticales · font-mono · négatif rose │
└────────────────────────────────────────────────────────────────┘
```

### 9.4 Formulaire croyant

```
┌─ IDENTITÉ ──────────────────────────────────────────────────────┐
│  ┌────────┐   Nom *              Prénom *                       │
│  │ photo  │   [___________]      [___________]                  │
│  │  96px  │   Sexe *             Date de naissance *            │
│  │ ⊕      │   ( ) Homme (•) Femme  [__/__/____] 📅              │
│  └────────┘   Statut marital      Nationalité *                 │
│  Facultative  [Sélectionner ▾]    [Sélectionner ▾]              │
└─────────────────────────────────────────────────────────────────┘
┌─ COORDONNÉES ───────────────────────────────────────────────────┐
│  E-mail (facultatif)          Téléphone (facultatif)            │
│  [_____________________]      [_____________________]           │
│  Adresse *                                                      │
│  [_____________________________________________________]        │
└─────────────────────────────────────────────────────────────────┘
┌─ RATTACHEMENT ECCLÉSIAL ────────────────────────────────────────┐
│  Église d'appartenance *      Cellule de prière (facultatif)    │
│  [Rechercher… ▾]              [Sélectionner ▾]                  │
│                               ⓘ Liste filtrée selon l'église    │
│  Grade *                      Date de baptême *                 │
│  [Croyant ▾]                  [__/__/____] 📅                   │
└─────────────────────────────────────────────────────────────────┘
                          [Annuler]  [⟳ Enregistrer le croyant]
```

### 9.5 File de validation financière *(EF-FIN-21)*

```
EYEBROW : FINANCES — DISTRICT AVARADRANO
Mouvements à valider                          [Tout sélectionner] [✓ Valider (3)]
14 mouvements soumis attendent votre décision.
────────────────────────────────────────────────────────────────────────────
☑ Date        Entité              Catégorie   Sens      Montant   Soumis par
──────────────────────────────────────────────────────────────────────────────
☑ 04/08/2026  EGL-COT Cotonou     Dîme        Recette   420 000  A. KOFFI
☑ 03/08/2026  EGL-COT Cotonou     Travaux     Dépense  −150 000  A. KOFFI
☑ 02/08/2026  PAR-ATN ⚑délégué    Quête       Recette    95 000  Siège (pour PAR-ATN)
☐ 01/08/2026  EGL-ABJ Abomey      Fonctionn.  Dépense   −38 000  M. DOSSOU  [📎]
                                                          ↑ font-mono, dépense en rose
                                              ⚑ = saisie déléguée (EF-FIN-06)
[Rejeter avec motif]                                   [Valider la sélection]
```

### 9.6 Éditeur de rapport *(EF-RAP-01, EF-RAP-05)*

```
┌─ BLOCS ─────────┐┌─ COMPOSITION ────────────────┐┌─ APERÇU A4 ──────────┐
│ 🔍 Rechercher   ││ ╔══ Section 1 ═════════════╗ ││ ┌──────────────────┐ │
│                 ││ ║ ▤ Titre                  ║ ││ │ [logo]  SYNOD    │ │
│ CONTENU         ││ ║   « Rapport trimestriel »║ ││ │ District Avara…  │ │
│  ▤ Titre        ││ ╟──────────────────────────╢ ││ │ T2 2026          │ │
│  ¶ Texte        ││ ║ ▦ Indicateur  ▦ Indicat. ║ ││ ├──────────────────┤ │
│  🖼 Image       ││ ║   Croyants      Solde    ║ ││ │ RAPPORT TRIMES…  │ │
│                 ││ ╟──────────────────────────╢ ││ │                  │ │
│ DONNÉES         ││ ║ ▥ Graphique (barres)     ║ ││ │ ┌─────┐ ┌─────┐  │ │
│  ▦ Indicateur   ││ ║   Recettes par catégorie ║ ││ │ │12480│ │3,55M│  │ │
│  ▤ Tableau      ││ ╟──────────────────────────╢ ││ │ └─────┘ └─────┘  │ │
│  ▥ Graphique    ││ ║ ▤ Tableau                ║ ││ │  ▁▃▅▇▅▃          │ │
│  ◔ Jauge        ││ ║   Paroisses du district  ║ ││ │                  │ │
│  ⌗ Organigramme ││ ╚══════════════════════════╝ ││ │ ─────────────    │ │
│  ⌚ Frise        ││                              ││ │ Page 1 / 3       │ │
│                 ││  [+ Ajouter une section]     ││ └──────────────────┘ │
│ MISE EN PAGE    ││                              ││ [🖨 Exporter PDF]    │
│  ⤓ Saut de page ││  Glisser un bloc pour le     ││                      │
│  ✎ Signature    ││  réordonner (dnd-kit)        ││                      │
└─────────────────┘└──────────────────────────────┘└──────────────────────┘
        w-64                  flex-1                       w-96
```

---

## 10. Composants clés

### 10.1 `<EntityPicker />` — sélection hiérarchique

Combobox arborescente utilisée partout où une entité doit être choisie.

```tsx
interface EntityPickerProps {
  value?: string;
  onChange: (id: string) => void;
  types?: EntityType[];        // ex. ['EGLISE'] pour le rattachement d'un croyant
  parentId?: string;           // ex. l'église, pour ne proposer que ses cellules (RG-05)
  scopeOnly?: boolean;         // limité au périmètre (défaut : true)
  permission?: Permission;     // ne propose que les entités où le droit est effectif (RG-25)
}
```

Recherche instantanée sur nom et code, chemin complet affiché en métadonnée (`Siège › Régional Nord › District Avaradrano`), navigation clavier complète, chargement paresseux des branches au-delà de 500 entités.

### 10.2 `<CroyantTable />`

`<DataTable />` Shadcn **sans bordures verticales** (UI-07), avec tri et pagination serveur, colonnes masquables mémorisées, sélection multiple pour actions groupées, filtres persistés dans l'URL, `TableSkeleton` au chargement, `EmptyState` si vide, bascule en cartes empilées sur mobile.

### 10.3 `<TransferDialog />` *(ARB-4)*

Assistant en trois étapes : **1.** niveau de transfert → **2.** entité de destination (`EntityPicker`) → **3.** récapitulatif. L'étape 3 affiche explicitement : les mandats de bureau qui seront clos (RG-11), l'**approbateur compétent calculé** à partir de l'ancêtre commun (RG-12), et indique si la demande sera **auto-approuvée** (EF-TRF-05) ou mise en attente.

### 10.4 `<SoldeCard />` *(EF-FIN-10, EF-FIN-12)*

Trois colonnes — Recettes / Dépenses / Solde — en `font-mono tabular-nums`, avec sous-ligne « dont propre à l'entité », solde cumulé depuis l'origine, et badge `Critique` en `bg-rose-100` si le solde de la période est négatif (EF-FIN-13).

### 10.5 `<MouvementForm />`

Saisie optimisée pour l'usage répétitif : entité pré-remplie depuis le périmètre, catégorie mémorisée, **sens affiché automatiquement** d'après la catégorie choisie, montant en `font-mono` avec séparateurs de milliers, bouton **« Enregistrer et saisir un autre »**. En mode délégation, un `DelegationBanner` ambré rappelle en permanence l'entité bénéficiaire.

### 10.6 `<PermissionMatrix />` *(ARB-3)*

Matrice à cocher **groupée par catégorie** (Structure, Croyants, Bureaux, Finances, Rapports, Pilotage, Administration). Chaque ligne offre un `<ScopeSelector />` permettant de restreindre le droit à une sous-structure. Les droits que le délégant ne détient pas sont **désactivés et expliqués** au survol plutôt que masqués — l'utilisateur comprend pourquoi il ne peut pas les accorder. Un bandeau rappelle la règle RG-24.

---

## 11. Moteur de tableau de bord configurable

### 11.1 Registre d'indicateurs *(DA-7)*

```ts
// lib/domain/kpi-registry.ts
export interface KpiDefinition {
  key: string;
  label: string;
  description: string;
  group: 'Effectifs' | 'Structure' | 'Gouvernance' | 'Finances' | 'Dynamique' | 'À traiter';
  icon: LucideIcon;
  renderers: WidgetRenderer[];
  defaultRenderer: WidgetRenderer;
  format: 'number' | 'percent' | 'currency';
  requires?: Permission;                    // masqué si non détenu (EF-DSH-12)
  resolve: (ctx: KpiContext) => Promise<KpiResult>;
  drilldown?: (ctx: KpiContext) => string;  // URL de la liste sous-jacente (EF-DSH-09)
}

export type WidgetRenderer = 'stat' | 'gauge' | 'line' | 'bar' | 'pie' | 'table';

export const KPI_REGISTRY: Record<string, KpiDefinition> = {
  // ── Effectifs
  croyants_total:    { label: 'Nombre de croyants', group: 'Effectifs', icon: Users,
                       renderers: ['stat','line','bar'], defaultRenderer: 'stat', format: 'number',
                       resolve: c => readEntityKpi(c, 'croyants_total'),
                       drilldown: c => `/croyants?entite=${c.entityId}&statut=ACTIF` },
  croyants_femmes:   { label: 'Nombre de femmes',  group: 'Effectifs', icon: UserRound },
  croyants_hommes:   { label: 'Nombre d\'hommes',  group: 'Effectifs', icon: User },
  // ── Structure
  nb_cellules:       { label: 'Nombre de cellules',   group: 'Structure', icon: Network },
  nb_eglises:        { label: 'Nombre d\'églises',    group: 'Structure', icon: Church },
  nb_paroisses:      { label: 'Nombre de paroisses',  group: 'Structure', icon: Landmark },
  nb_districts:      { label: 'Nombre de districts',  group: 'Structure', icon: Map },
  nb_regionaux:      { label: 'Nombre de régionaux',  group: 'Structure', icon: Globe },
  // ── Gouvernance
  membres_bureau:    { label: 'Membres de bureau',    group: 'Gouvernance', icon: Briefcase },
  membres_finances:  { label: 'Membres de finances',  group: 'Gouvernance', icon: Wallet },
  couverture_bureaux:{ label: 'Couverture des bureaux', group: 'Gouvernance',
                       format: 'percent', defaultRenderer: 'gauge' },
  // ── Finances (ARB-2)
  finance_recettes:  { label: 'Recettes de la période', group: 'Finances', icon: TrendingUp,
                       format: 'currency', requires: 'finance.read',
                       resolve: c => readFinanceKpi(c, 'recettes'),
                       drilldown: c => `/finances?entite=${c.entityId}&sens=RECETTE` },
  finance_depenses:  { label: 'Dépenses de la période', group: 'Finances', icon: TrendingDown,
                       format: 'currency', requires: 'finance.read' },
  solde_disponible:  { label: 'Solde disponible',      group: 'Finances', icon: Wallet,
                       format: 'currency', requires: 'finance.read',
                       renderers: ['stat','line'], defaultRenderer: 'stat',
                       resolve: c => readFinanceKpi(c, 'solde') },
  solde_cumule:      { label: 'Solde cumulé',          group: 'Finances', format: 'currency',
                       requires: 'finance.read' },
  evolution_solde:   { label: 'Évolution du solde',    group: 'Finances',
                       defaultRenderer: 'line', requires: 'finance.read' },
  finance_par_categorie: { label: 'Recettes / dépenses par catégorie', group: 'Finances',
                       defaultRenderer: 'bar', requires: 'finance.read' },
  entites_solde_negatif: { label: 'Entités en solde négatif', group: 'Finances',
                       defaultRenderer: 'table', requires: 'finance.read' },
  // ── Dynamique
  nouveaux_baptises: { label: 'Nouveaux baptisés (15 j)', group: 'Dynamique', icon: Droplets },
  taux_encellulement:{ label: 'Taux d\'encellulement', group: 'Dynamique',
                       format: 'percent', defaultRenderer: 'gauge' },
  repartition_grade: { label: 'Répartition par grade', group: 'Dynamique', defaultRenderer: 'pie' },
  repartition_age:   { label: 'Pyramide des âges',     group: 'Dynamique', defaultRenderer: 'bar' },
  evolution_effectifs:{ label: 'Évolution des effectifs', group: 'Dynamique', defaultRenderer: 'line' },
  classement_entites:{ label: 'Classement des entités filles', group: 'Dynamique',
                       defaultRenderer: 'table' },
  // ── À traiter (UI-21)
  transferts_en_attente: { label: 'Transferts à approuver', group: 'À traiter', icon: Inbox,
                       requires: 'transfer.approve', drilldown: () => '/transferts/en-attente' },
  mouvements_a_valider:  { label: 'Mouvements à valider',  group: 'À traiter', icon: CheckSquare,
                       requires: 'finance.validate', drilldown: () => '/finances/a-valider' },
};
```

**Ajouter un indicateur = ajouter une entrée.** Aucune modification de la page de tableau de bord.

### 11.2 Format de configuration persisté

```jsonc
// dashboard_layouts.layout
{
  "version": 1,
  "widgets": [
    { "id": "w1", "kpi": "croyants_total",   "renderer": "stat", "span": 3,
      "options": { "scope": "SUBTREE", "period": "CURRENT_YEAR" } },
    { "id": "w2", "kpi": "croyants_femmes",  "renderer": "stat", "span": 3 },
    { "id": "w3", "kpi": "membres_bureau",   "renderer": "stat", "span": 3 },
    { "id": "w4", "kpi": "solde_disponible", "renderer": "stat", "span": 3 },
    { "id": "w5", "kpi": "evolution_solde",  "renderer": "line", "span": 6,
      "options": { "granularity": "MONTH", "months": 12 } },
    { "id": "w6", "kpi": "finance_par_categorie", "renderer": "bar", "span": 6 }
  ]
}
```

`span` s'exprime sur une grille de 12 colonnes (`col-span-3` = un quart, 4 cartes par ligne sur desktop ; 1 colonne sur mobile).

### 11.3 Rendu

```tsx
export function DashboardGrid({ layout, context }: DashboardGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
      {layout.widgets.map(w => {
        const def = KPI_REGISTRY[w.kpi];
        if (!def) return null;                                   // indicateur retiré : ignoré
        if (def.requires && !can(def.requires, context.entityId)) return null;  // EF-DSH-12
        return (
          <div key={w.id} className={cn('lg:col-span-' + w.span)}>
            <Suspense fallback={<WidgetSkeleton renderer={w.renderer} />}>
              <WidgetRenderer def={def} widget={w} context={context} />
            </Suspense>
          </div>
        );
      })}
    </div>
  );
}
```

Chaque widget a son propre `<Suspense>` : les indicateurs rapides s'affichent immédiatement, les plus lents complètent la grille sans bloquer ni décaler la mise en page (UI-17).

### 11.4 Écran de personnalisation *(EF-DSH-07)*

Deux panneaux : à gauche le catalogue groupé par famille avec recherche ; à droite la grille réordonnable par glisser-déposer (`dnd-kit`), chaque widget offrant ses réglages (rendu, périmètre, période, taille). Un bouton **« Appliquer un modèle »** charge un gabarit prédéfini (EF-DSH-08). L'enregistrement appelle `enregistrerLayout` et revalide `/tableau-de-bord`.

---

## 12. Générateur de rapports

> *« Un Générateur de rapport flexible comme Stratrack, pour le Siège et pour chaque Entité »* — assembler ses propres rapports (graphiques, jauges, frises) et les exporter en PDF, en quelques minutes.

### 12.1 Registre de blocs *(DA-7)*

```ts
// lib/domain/report-blocks.ts
export interface ReportBlockDefinition<P = unknown> {
  type: ReportBlockType;
  label: string;
  icon: LucideIcon;
  group: 'Contenu' | 'Données' | 'Mise en page';
  defaultProps: P;
  propsSchema: z.ZodType<P>;
  requires?: Permission;                       // RG-26 : bloc omis si non détenu
  /** Exécuté côté serveur, sous la session du générateur : la RLS borne le résultat. */
  resolve: (ctx: ReportContext, props: P) => Promise<ResolvedBlock>;
  /** Rendu du contenu figé — ne relit jamais la base (RG-27). */
  render: (resolved: ResolvedBlock) => ReactNode;
}

export type ReportBlockType =
  | 'titre' | 'texte' | 'image'                       // Contenu
  | 'kpi' | 'tableau' | 'graphique' | 'jauge'
  | 'frise' | 'organigramme'                          // Données
  | 'saut_page' | 'signature';                        // Mise en page

export const REPORT_BLOCKS: Record<ReportBlockType, ReportBlockDefinition> = {
  titre:   { label: 'Titre', group: 'Contenu', icon: Heading,
             defaultProps: { texte: 'Titre de section', niveau: 2 } },

  texte:   { label: 'Paragraphe', group: 'Contenu', icon: AlignLeft,
             // Champs dynamiques : {{entite.nom}} {{periode}} {{croyants_total}} {{solde}}
             defaultProps: { contenu: '', champsDynamiques: true } },

  kpi:     { label: 'Indicateur', group: 'Données', icon: Gauge,
             defaultProps: { kpiKey: 'croyants_total', afficherEvolution: true },
             // Réutilise KPI_REGISTRY : un indicateur ajouté au tableau de bord
             // devient immédiatement disponible dans les rapports.
             requires: undefined,
             resolve: (ctx, p) => KPI_REGISTRY[p.kpiKey].resolve(ctx) },

  tableau: { label: 'Tableau', group: 'Données', icon: Table,
             defaultProps: { source: 'croyants', colonnes: ['nom','prenom','eglise','grade'],
                             filtres: {}, tri: 'nom', limite: 50 } },

  graphique:{ label: 'Graphique', group: 'Données', icon: BarChart3,
             defaultProps: { type: 'bar', source: 'finance_par_categorie',
                             granularite: 'MONTH', series: [] } },

  jauge:   { label: 'Jauge', group: 'Données', icon: CircleGauge,
             defaultProps: { kpiKey: 'taux_encellulement', seuils: [50, 80] } },

  frise:   { label: 'Frise chronologique', group: 'Données', icon: GitCommitHorizontal,
             defaultProps: { source: 'transferts', limite: 20 } },

  organigramme: { label: 'Organigramme', group: 'Données', icon: Network,
             defaultProps: { mode: 'STRUCTURE', profondeur: 2 } },   // ou 'BUREAU'

  image:   { label: 'Image', group: 'Contenu', icon: Image,
             defaultProps: { objectKey: null, legende: '' } },

  saut_page:{ label: 'Saut de page', group: 'Mise en page', icon: SeparatorHorizontal,
             defaultProps: {} },

  signature:{ label: 'Bloc de signature', group: 'Mise en page', icon: PenLine,
             defaultProps: { lignes: [{ fonction: 'Le Président', nom: '' }] } },
};
```

> Les blocs `tableau`, `graphique`, `frise` et `organigramme` déclarent `requires: 'finance.read'` lorsque leur source est financière — c'est ce qui déclenche l'omission RG-26.

### 12.2 Structure d'un modèle

```jsonc
// report_templates.structure
{
  "version": 1,
  "entete": {
    "afficherLogo": true,
    "titre": "Rapport trimestriel — {{entite.nom}}",
    "sousTitre": "{{periode.libelle}}",
    "mentionConfidentialite": "Document interne"
  },
  "piedDePage": { "numerotation": true, "texte": "SYNOD — {{date_generation}}" },
  "sections": [
    {
      "id": "s1", "titre": "Vue d'ensemble",
      "blocs": [
        { "id": "b1", "type": "titre", "span": 12, "props": { "texte": "Vue d'ensemble" } },
        { "id": "b2", "type": "kpi",   "span": 4,  "props": { "kpiKey": "croyants_total" } },
        { "id": "b3", "type": "kpi",   "span": 4,  "props": { "kpiKey": "nouveaux_baptises" } },
        { "id": "b4", "type": "kpi",   "span": 4,  "props": { "kpiKey": "solde_disponible" } }
      ]
    },
    {
      "id": "s2", "titre": "Finances",
      "blocs": [
        { "id": "b5", "type": "graphique", "span": 12,
          "props": { "type": "bar", "source": "finance_par_categorie", "granularite": "MONTH" } },
        { "id": "b6", "type": "tableau", "span": 12,
          "props": { "source": "entites_filles",
                     "colonnes": ["nom","croyants","recettes","depenses","solde"] } }
      ]
    },
    { "id": "s3", "blocs": [ { "id": "b7", "type": "signature", "span": 12,
        "props": { "lignes": [{ "fonction": "Le Président" }, { "fonction": "Le Trésorier" }] } } ] }
  ]
}
```

### 12.3 Chaîne de génération *(RG-26, RG-27)*

```
1. CHOIX          périmètre (EntityPicker borné au périmètre) + période
                        │
2. RÉSOLUTION     pour chaque bloc, côté serveur, SOUS LA SESSION DU GÉNÉRATEUR :
                    ├─ bloc.requires détenu ?  ── non ──► OMIS, consigné dans blocs_omis
                    └─ oui ► bloc.resolve(ctx, props)
                             (les requêtes passent par la RLS ⇒ jamais hors périmètre)
                        │
3. GEL            contenu ← { blocs résolus, valeurs, libellés, horodatage }
                  template_snapshot ← structure du modèle au moment T
                  ⇒ le rapport reste reproductible même si les données changent
                        │
4. RENDU          mise en page A4 (HTML paginé, CSS @page, 210×297 mm, marges 16 mm)
                        │
5. PDF            moteur PDF côté serveur, en Route Handler avec réponse en flux
                  pdf_key ← clé d'objet stockée via l'adaptateur de stockage
                        │
6. TRAÇABILITÉ    audit { action: 'REPORT', entity_id, record_id: instance.id }
                  mention en pied de page : « N blocs omis : habilitation insuffisante »
```

### 12.4 Éditeur

| Aspect | Choix |
|---|---|
| **Disposition** | Trois panneaux : palette de blocs (`w-64`) · composition (`flex-1`) · aperçu A4 (`w-96`) |
| **Interaction** | `dnd-kit` — glisser depuis la palette, réordonner dans une section, déplacer entre sections |
| **Réglages** | Panneau latéral contextuel au bloc sélectionné, formulaire piloté par `propsSchema` |
| **Aperçu** | Rendu réel des composants, mis à l'échelle dans un conteneur au ratio A4 — fidèle au PDF |
| **Sauvegarde** | Brouillon auto-sauvegardé toutes les 10 s (ENF-UTI-06) ; avertissement avant abandon |
| **Chargement** | Éditeur en import dynamique + `ReportEditorSkeleton` (UI-18) |
| **Accessibilité** | Réordonnancement possible **au clavier** (dnd-kit expose les annonces ARIA) |

### 12.5 Bibliothèque de modèles

Trois onglets : **Officiels** (fournis par le Siège, `est_officiel`, utilisables sans modification ou duplicables) · **Mes modèles** (propres à l'entité) · **Partagés** (hérités d'une entité ascendante en visibilité `DESCENDANTS`). Chaque carte affiche nom, description, niveaux applicables, auteur, date, et les actions Générer · Dupliquer · Modifier · Archiver.

---

## 13. Visualisations React Flow

> Exigence explicite : *« Pour la représentation des hiérarchies des Entités et Bureaux, utiliser React Flow. »*

### 13.1 `<EntityFlow />` — organigramme de structure *(EF-STR-04, EF-STR-05)*

| Aspect | Choix |
|---|---|
| **Disposition** | Arbre vertical descendant calculé avec **Dagre** (`rankdir: TB`, `nodesep: 40`, `ranksep: 80` — multiples de 8) |
| **Nœud** | `EntityNode` : carte `rounded-xl border-slate-200 bg-white p-4`, badge de type, nom en `text-sm font-semibold`, code en `font-mono text-xs text-slate-500`, effectif du sous-arbre, pastille de bureau, **solde en `font-mono`** si `finance.read` est détenu |
| **Arêtes** | `smoothstep`, `stroke-slate-300`, 1,5 px, sans flèche |
| **Interactions** | Zoom, déplacement, mini-carte, repli/dépliage, double-clic → fiche entité, recherche avec centrage animé |
| **Performance** | Chargement des enfants **à la demande** au-delà de 300 nœuds ; `onlyRenderVisibleElements` ; `nodeTypes` mémoïsé hors composant (ENF-PRF-03) |
| **Chargement** | Import dynamique + `FlowSkeleton` en `fallback` (UI-18) — React Flow pèse ~120 ko |
| **Export** | PNG via `html-to-image`, PDF via le moteur PDF — chargés au clic |

```tsx
const EntityFlow = dynamic(() => import('@/components/structure/entity-flow'), {
  ssr: false,
  loading: () => <FlowSkeleton />,      // UI-15 : jamais d'écran blanc
});
```

**Code couleur par niveau** (bordure gauche) : Siège `border-l-slate-900` · Régional `border-l-indigo-500` · District `border-l-sky-500` · Paroisse `border-l-teal-500` · Église `border-l-amber-500` · Cellule `border-l-slate-400`.

Les entités marquées `sans_acces_application` portent une icône `WifiOff` en `Slate-400` avec une infobulle « Saisie assurée par le Siège » *(EF-STR-10)*.

### 13.2 `<BureauFlow />` — organigramme de bureau *(EF-BUR-07)*

Disposition **dessinée par l'utilisateur** — voir l'éditeur ci-dessous. Tant que rien n'a été dessiné, les blocs sont posés en **grille et sans aucun trait** : depuis le retrait de l'ordre protocolaire (migration `0022`), plus aucune donnée ne dit qui dépend de qui, et en dessiner un l'inventerait. Chaque nœud affiche la photo du croyant (`Avatar` avec initiales en repli), son nom, sa fonction et son ancienneté dans le mandat. Les fonctions **vacantes** apparaissent en nœud `border-dashed` avec une action « Désigner un membre » — le taux de couverture devient immédiatement lisible.

**Le graphe rend une préséance, pas une subordination.** Rien dans le modèle ne dit qu'un trésorier rend compte au secrétaire : les traits relient chaque rang au précédent, par son poste principal, et l'écran le précise sous le graphe. Deux fonctions de **même** `ordre_protocolaire` forment une bande horizontale — les empiler laisserait croire à une primauté que le référentiel n'exprime pas. Un organigramme qui suggère une chaîne de commandement invente une organisation.

#### L'éditeur — `/bureaux/[id]/organigramme` *(9 août 2026)*

La préséance ne dit pas comment une entité s'organise *réellement*. `bureau_postes` (migration `0021`) porte donc, **par bureau**, un `parent_fonction_id` et une position libre. Le rang reste ce qu'il est : l'ordre du référentiel, valable partout, et il fournit la disposition de départ — un plan vierge n'invite pas à l'organiser, il donne l'impression d'un outil cassé.

| Geste | Ce qu'il signifie |
|---|---|
| **Poser** une fonction, glissée de la palette | Le bloc entre dans le plan. |
| **Déplacer** un bloc | De la mise en page. N'engage rien. |
| **Tirer un trait** d'une poignée à l'autre | La dépendance — et c'est le **seul** geste qui la décide. |
| **Glisser un croyant** sur un bloc | La désignation (RG-09 filtre la liste à la source). |
| **Suppr.** sur un bloc | Il quitte le plan et retourne dans la palette. Refusé s'il a un titulaire. |

**Pourquoi séparer déplacement et rattachement**, alors que `/structure` rattache en lâchant un nœud sur un autre : là-bas la position ne veut rien dire, ici elle porte la mise en page. Un rattachement déclenché par un simple survol la rendrait impraticable.

**La palette *(9 août, révision)*** — colonne de gauche : les fonctions applicables au niveau (EF-REF-03) qui ne sont pas encore posées. `bureau_postes` énumère donc les **blocs du plan**, et un bureau jamais dessiné démarre sur un plan vide. Le bouton « Tout poser » place d'un coup toutes les fonctions applicables, en grille et sans lien.

**Ce que `bureau_postes` ne décide toujours pas** : la composition tabulaire continue de lister toutes les fonctions applicables et d'en compter les vacances. Le plan est un **dessin**, pas la définition des postes — une fonction non posée reste à pourvoir. Retirer un bloc ne touche jamais le référentiel : la fonction retourne dans la palette.

Le graphe de la composition affiche le **plan dessiné** dès qu'il en existe un, et retombe sur le rang sinon — deux représentations du même bureau ne doivent pas se contredire. La légende dit laquelle des deux on regarde.

Enregistrement automatique en fin de geste, **tout le plan à la fois** : un bouton « Enregistrer » créerait un travail à perdre, des écritures bloc par bloc laisseraient un trait pointer vers une position non enregistrée. Le cycle est refusé par le domaine (message) *et* par un trigger `SECURITY DEFINER` (garantie).

**Une page et non un pop-up** : la règle 16 vise les formulaires, or ceci est un plan de travail — largeur, zoom, liste de croyants à côté. Même choix que `/structure`, pour la même raison.

*Livré le 9 août 2026 : `bureau-flow.tsx`, `bureau-node.tsx`, `bureau-flow-loader.tsx` ; règles pures `rangsProtocolaires` et `ancienneteMandat`.*

---

## 14. Portabilité et réversibilité

> *ARB-8 : Supabase, mais des données transférables vers d'autres hébergeurs.*

### 14.1 Règles d'implémentation *(ENF-POR-01 à 05)*

| Domaine | Règle |
|---|---|
| **Schéma** | PostgreSQL standard uniquement : types, contraintes, triggers, vues matérialisées, RLS, et les extensions courantes `ltree`, `pg_trgm`, `pgcrypto`. Aucune extension propriétaire. |
| **Identité** | `profiles` possède sa **propre clé primaire** ; `auth_user_id` est le seul lien vers le fournisseur. `app_current_auth_id()` (§4.1) encapsule `auth.uid()` et retombe sur un paramètre de session standard (`app.user_id`). Changer de fournisseur ne touche ni les politiques RLS ni le modèle métier. |
| **Stockage** | La base ne stocke que des **clés d'objet relatives** (`photo_key`, `justificatif_key`, `pdf_key`, `logo_key`) — jamais d'URL signée ni de chemin propre à un hébergeur. Tout passe par `lib/storage`. |
| **Logique** | Aucune règle métier dans des fonctions edge ou des services propriétaires. Les tâches planifiées sont des Route Handlers appelés par un ordonnanceur externe interchangeable. |
| **Migrations** | Fichiers SQL numérotés, applicables par `psql` ou tout client PostgreSQL, indépendamment de l'outillage de l'hébergeur. |
| **Temps réel** | Aucune dépendance au temps réel de l'hébergeur dans le chemin critique ; les compteurs d'attente sont rafraîchis par revalidation. |

### 14.2 Adaptateurs

```ts
// lib/auth/index.ts — SEUL module à réécrire en cas de changement de fournisseur
export interface AuthAdapter {
  getSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<Result<Session>>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<Result>;
  resetPassword(token: string, password: string): Promise<Result>;
  createUser(email: string, password: string): Promise<Result<{ authUserId: string }>>;
}

// lib/storage/index.ts — la base ne connaît que des clés relatives
export interface StorageAdapter {
  put(key: string, file: File | Buffer, opts?: { contentType?: string }): Promise<Result<string>>;
  signedUrl(key: string, ttlSeconds: number): Promise<Result<string>>;
  delete(key: string): Promise<Result>;
  list(prefix: string): Promise<Result<string[]>>;
}
```

Implémentations fournies : `SupabaseAuthAdapter` / `SupabaseStorageAdapter` en V1 ; `S3StorageAdapter` livré et testé comme **preuve d'interchangeabilité**.

### 14.3 Export intégral *(ENF-POR-06)*

`scripts/export-integral.ts`, déclenchable depuis `/administration/portabilite` :

```
export-synod-2026-08-06T14-30-00Z/
├── manifest.json          version du schéma, date, comptages par table, empreintes
├── database.sql           pg_dump --format=plain --no-owner --no-privileges
├── database.dump          pg_dump --format=custom  (restauration sélective)
├── storage/
│   ├── photos/…           arborescence identique aux clés stockées en base
│   ├── justificatifs/…
│   └── rapports/…
└── RESTORE.md             procédure de restauration pas à pas
```

`manifest.json` porte les **comptages par table** et une **empreinte SHA-256** par fichier : la restauration est vérifiable, pas seulement exécutable.

### 14.4 Procédure de restauration *(ENF-POR-07, ENF-POR-08)*

1. Provisionner un PostgreSQL 15+ avec `ltree`, `pg_trgm`, `pgcrypto`.
2. `pg_restore` du dump ; vérifier les comptages contre `manifest.json`.
3. Provisionner un stockage compatible S3 ; téléverser `storage/` en conservant l'arborescence.
4. Configurer les variables d'environnement des adaptateurs (`AUTH_PROVIDER`, `STORAGE_PROVIDER`).
5. Réimporter ou recréer les comptes chez le nouveau fournisseur d'identité, puis réaligner `profiles.auth_user_id`.
6. Lancer la suite de tests d'intégration contre la nouvelle instance.

> **CA-16** — Cette procédure est **exécutée et vérifiée en recette** avant la mise en production, avec une instance PostgreSQL et un stockage S3 tiers.

---

## 15. Performance

| Réf. | Mesure | Exigence servie |
|---|---|---|
| **P-1** | Vues matérialisées pour tous les compteurs et soldes, rafraîchies en `concurrently` | ENF-PRF-02 |
| **P-2** | Index GiST sur `entities.path` — les requêtes de périmètre restent quasi constantes quelle que soit la profondeur | ENF-PRF-01 |
| **P-3** | Index partiel `finance_solde_idx` restreint aux mouvements `VALIDE` : le calcul du solde ne balaie jamais les brouillons | ENF-PRF-01 |
| **P-4** | Index trigram sur la recherche de croyants (`pg_trgm`) | EF-CRO-05 |
| **P-5** | Pagination serveur systématique au-delà de 50 lignes ; jamais de `select *` sans `range()` | ENF-PRF-08 |
| **P-6** | Import dynamique de React Flow, Recharts, moteur PDF, éditeur de rapport, xlsx, éditeur d'image | ENF-PRF-09 |
| **P-7** | Résolution des blocs de rapport **parallélisée** (`Promise.all`) avec plafond de concurrence | ENF-PRF-04 |
| **P-8** | `next/image`, format WebP, redimensionnement client avant téléversement | ENF-PRF-07 |
| **P-9** | Police locale `woff2` en `display: swap` — aucune requête vers un CDN externe | ENF-PRF-07 |
| **P-10** | Streaming SSR : `<Suspense>` par widget de tableau de bord et par bloc lourd | ENF-PRF-02 |
| **P-11** | `unstable_cache` sur les référentiels et `organisation_settings` (TTL 1 h) | ENF-PRF-01 |
| **P-12** | Squelettes aux dimensions exactes du contenu final : CLS proche de zéro | UI-17 |
| **P-13** | Exports et PDF traités en Route Handler avec réponse en flux, jamais en Server Action | ENF-PRF-01 |
| **P-14** | Budget de performance vérifié en CI : rejet si le bundle initial dépasse 200 ko gzip | ENF-PRF-07 |

---

## 16. Stratégie de tests

### 16.1 Pyramide

| Niveau | Outil | Périmètre | Cible |
|---|---|---|---|
| **Unitaire** | Vitest | `lib/domain/**` — règles pures | **100 % des 32 règles** du §6 du cahier des charges |
| **Intégration** | Vitest + PostgreSQL local | Server Actions, triggers SQL, politiques RLS, délégation | Tous les chemins de mutation |
| **Bout en bout** | Playwright | Parcours critiques en navigateur réel | 12 scénarios (§16.3) |
| **Visuel** | Playwright screenshots | Conformité au design system | Écrans principaux, mobile |
| **Accessibilité** | axe-core (Playwright) | WCAG 2.1 AA | Zéro violation bloquante |
| **Portabilité** | Script + Vitest | Restauration sur PostgreSQL nu + S3 | Suite d'intégration verte après restauration |

### 16.2 Traçabilité règle → test *(CA-02)*

```ts
describe('RG-01 — intégrité de la hiérarchie', () => {
  it('refuse le rattachement d\'une Église directement à un District (saut de niveau)', async () => {
    await expect(creerEntite({ type: 'EGLISE', parentId: districtId, code: 'EGL-X', nom: 'Test' }))
      .rejects.toThrow(/RG-01/);
  });
  it('refuse un cycle lors d\'un rattachement', async () => { /* … */ });
});

describe('RG-14 — calcul du solde disponible', () => {
  it('soustrait les dépenses des recettes sur tout le sous-arbre', async () => {
    await creerMouvementValide({ entityId: egliseA, categorie: 'DIME',   montant: 100_000 });
    await creerMouvementValide({ entityId: egliseB, categorie: 'QUETE',  montant:  50_000 });
    await creerMouvementValide({ entityId: egliseA, categorie: 'TRAVAUX', montant: 30_000 });
    expect(await getSolde(paroisseParente)).toBe(120_000);
  });
  it('ignore les brouillons, les soumis, les rejetés et les annulés', async () => { /* RG-18 */ });
});

describe('RG-16 — workflow de validation financière', () => {
  it('valide immédiatement quand le workflow est désactivé', async () => { /* … */ });
  it('impose Brouillon → Soumis → Validé quand il est activé', async () => { /* … */ });
  it('refuse une validation par un compte dont le périmètre ne couvre pas l\'entité', async () => {
    await activerWorkflow();
    const mvt = await soumettre({ entityId: egliseDistrictA });
    await expect(validerAvec(adminDistrictB, mvt.id)).rejects.toThrow();
  });
});

describe('RG-24 — délégation d\'habilitation', () => {
  it('refuse d\'accorder un droit que le délégant ne détient pas', async () => {
    const admin = await compteAvec(['permission.delegate', 'croyant.read']);
    await expect(accorder(admin, cible, 'finance.validate')).rejects.toThrow(/RG-24/);
  });
  it('refuse une portée qui dépasse celle du délégant', async () => { /* … */ });
  it('refuse un compte cible hors du périmètre du délégant', async () => { /* … */ });
  it('journalise chaque refus en audit avec action DENIED', async () => { /* ENF-SEC-11 */ });
});

describe('RG-20 — cloisonnement des périmètres', () => {
  it('un admin de District B ne lit aucun croyant du District A', async () => {
    const client = await connecterEn(adminDistrictB);
    const { data } = await client.from('croyants').select('id').eq('eglise_id', egliseDistrictA);
    expect(data).toHaveLength(0);       // RLS, pas seulement l'interface
  });
});

describe('RG-26 / RG-27 — rapports', () => {
  it('omet un bloc financier pour un compte sans finance.read et le consigne', async () => { /* … */ });
  it('restitue les mêmes valeurs après modification des données sous-jacentes', async () => { /* … */ });
});
```

### 16.3 Scénarios de bout en bout

1. Connexion → tableau de bord → personnalisation → rechargement → configuration conservée.
2. Création de la structure Siège → Régional → District → Paroisse → Église → Cellule, puis vérification de l'organigramme.
3. Création d'un croyant avec photo, cellule et grade → recherche par matricule → fiche.
4. **Transfert avec approbation** : demande par l'Église A → apparition dans la file du District → approbation → application → historique et clôture du mandat de bureau.
5. **Transfert refusé** : le croyant reste rattaché à son église d'origine, le motif est consultable.
6. Constitution d'un bureau de district complet → organigramme → remplacement d'un membre → historique conservé.
7. **Finances, workflow désactivé** : 3 mouvements saisis → solde immédiatement à jour au niveau du district.
8. **Finances, workflow activé** : saisie → soumission → validation par l'entité → solde à jour ; tentative de validation par une entité sœur → refus.
9. **Saisie déléguée** : le Siège saisit pour une église marquée « sans accès » → le mouvement entre dans le solde de l'église, marqué délégué dans les listes et rapports.
10. **Rapport** : composition d'un modèle à 6 blocs → génération sur un district → export PDF → modification des données → le rapport figé reste identique.
11. **Délégation** : un Admin de district accorde `finance.create` limité à une paroisse → l'opérateur ne peut saisir que pour cette paroisse ; tentative ailleurs → refus.
12. **Cloisonnement** : un utilisateur du District B tente d'accéder à une URL et à un appel API du District A → refus dans les deux cas.

---

## 17. Plan de réalisation par lots

### Lot 0 — Socle *(2 semaines)*

- [ ] Next.js 15 (App Router, TS strict), Tailwind, Shadcn/UI, Lucide.
- [ ] Jetons de design §8.1, police Google Sans locale, `globals.css`.
- [ ] PostgreSQL/Supabase, migrations initiales, types générés.
- [ ] **Adaptateurs `lib/auth` et `lib/storage`** dès le premier jour (ENF-POR-02/03).
- [ ] Authentification : connexion, mot de passe oublié, middleware de session.
- [ ] Layout : sidebar rétractable, topbar, fil d'Ariane, sélecteur de périmètre, compteurs d'attente.
- [ ] Transverses : `PageHeader`, `EmptyState`, `ConfirmDialog`, `StatusBadge`, `PermissionGate`.
- [ ] **Tous les squelettes** de `components/skeletons/`.
- [ ] CI : lint, types, tests, build.

### Lot 1 — Structure et référentiels *(3 semaines)*

- [ ] `entities` avec **niveau Siège**, triggers de hiérarchie, propagation de chemin, RLS.
- [ ] CRUD des entités, `EntityPicker`, indicateur « sans accès à l'application », import Excel.
- [ ] `EntityFlow` : disposition Dagre, nœuds personnalisés, repli/dépliage, recherche.
- [ ] Fiche entité à 6 onglets.
- [ ] Les 4 référentiels : tables, CRUD, désactivation, amorce (dont catégories recettes **et** dépenses).
- [ ] Tests : RG-01, RG-02, RG-03, RG-23.

### Lot 2 — Croyants et transferts *(4 semaines)*

- [ ] `croyants` : triggers de cohérence, matricule, RLS.
- [ ] `CroyantForm` en 3 sections, `PhotoUploader` avec recadrage.
- [ ] `CroyantTable` : filtres, recherche trigram, tri/pagination serveur, exports.
- [ ] Fiche croyant, détection de doublons, corbeille.
- [ ] **Workflow d'approbation des transferts** : table, `fn_ancetre_commun`, actions, file d'attente, auto-approbation intra-périmètre, notifications.
- [x] Import CSV avec correspondance de colonnes et pré-validation (EF-CRO-11).
- [x] Lecture XLSX (ARB-6) — `lib/domain/xlsx.ts`, **sans dépendance** : un
      .xlsx est une archive ZIP de XML, et `DecompressionStream` est déjà là.
      Chargé en différé (règle 7). La promesse tient : CSV et XLSX rendent le
      même `string[][]`, le reste de la chaîne n'a pas bougé d'une ligne.
- [ ] Tests : RG-04 à RG-06, RG-11, RG-12, RG-28, RG-29.

### Lot 3 — Bureaux *(2 semaines)*

- [x] `bureaux` et `bureau_membres`, triggers de périmètre et d'unicité, RLS
      (migrations `0016` et `0017`).
- [x] EF-TRF-09 — clôture des mandats d'origine à l'application d'un transfert.
- [x] Mandats : création, clôture, reconduction. Membres : ajout, remplacement,
      retrait. **Server Actions livrées ; écrans à construire.**
- [x] Composition tabulaire, fonctions vacantes visibles, en pop-up.
- [x] `BureauFlow` — organigramme React Flow (EF-BUR-07), en **seconde
      représentation** de la composition et non en second écran : le tableau
      pour composer, le graphe pour présenter. Import dynamique (règle 7),
      squelette aux dimensions définitives. Disposition posée directement —
      les rangs sont des bandes, Dagre n'a rien à y résoudre et réordonnerait
      des frères de même rang d'un affichage à l'autre.
- [x] Fonctions occupées sur la fiche croyant — intégrées à la **frise**
      chronologique plutôt qu'à un onglet séparé : une prise de fonction est un
      événement de la vie du croyant, au même titre qu'un transfert (EF-BUR-10).
- [x] Tests : RG-08 à RG-10, RG-31 — 25 tests. *(RG-07 est portée par la clé
      étrangère et le trigger : aucune contrepartie applicative à tester.)*

### Lot 4 — Finances *(3 semaines)*

- [x] `finance_entries` avec **sens**, **saisie déléguée** et **workflow de statuts** ; triggers ; RLS. *(12 août 2026)*
- [x] Activation du workflow **par entité**, sans héritage — `entities.finance_validation_active`. *(12 août 2026)*
- [x] `MouvementForm` en pop-up partagé création/modification ; registre filtré en mémoire ; triptyque propre/consolidé.
- [x] Rejet motivé ; annulation motivée ; reprise d'une saisie rejetée.
- [x] Saisie en série (EF-FIN-08) et pièce justificative (EF-FIN-07). *(13 août 2026)*
- [x] **File de validation** avec traitement par lot (EF-FIN-21). *(13 août 2026)*
- [x] Écran de réglage du workflow, par entité, avec `finance.workflow.manage` **délégable**. *(13 août 2026)*
- [ ] **Écran de saisie déléguée** dédié, réservé à `finance.delegate`.
- [ ] **Dîmes** — voir §4.bis ci-dessous.
- [ ] `mv_finance_kpis`, `mv_finance_par_categorie`, `SoldeCard`, synthèse (courbes, barres, comparatifs).
- [ ] Vue consolidée du Siège, entité par entité (EF-FIN-11) ; export PDF.
- [ ] Tests : RG-13 à RG-18.

#### 4.bis — Les dîmes, un cas particulier *(spécifié le 12 août 2026, à construire)*

**Le besoin.** Chaque croyant dispose d'une **enveloppe numérotée** qui lui est
propre : il y met sa dîme et la verse pendant le culte ou lors d'un
rassemblement. Le membre du bureau de l'église qui la reçoit lui remet un
**reçu**.

##### Ce qui change tout : la dîme n'est pas une recette de l'église

*(RG-33, EF-FIN-29 à 31 — précisé le 12 août 2026.)*

L'église **collecte**, elle n'**encaisse** pas. La dîme appartient au **Siège**,
à qui elle est remise **en mains propres** ; elle y est comptabilisée en recette
et y finance ses dépenses. Elle n'entre donc **ni dans le solde de l'église, ni
dans le consolidé de sa paroisse ou de son district**.

C'est la conséquence la plus lourde de tout le module, parce qu'elle contredit
le réflexe naturel : « l'argent est passé par mes mains, donc il est à moi ». Si
la collecte créait un mouvement rattaché à l'église, `fn_finance_solde`
l'additionnerait au solde de l'église **et** le ferait remonter dans le
consolidé de chaque ancêtre — le même argent compté deux fois, une fois chez
celui qui l'a collecté et une fois chez celui à qui il appartient. Rien à
l'écran ne trahirait l'erreur : deux soldes plausibles, tous les deux faux.

**La règle de modélisation qui en découle :**

> Le mouvement financier d'une dîme porte `entity_id = <Siège>`, **jamais**
> l'église. Le lien avec l'église collectrice est une colonne à part,
> `eglise_collecte_id`, qui sert la **traçabilité** et n'entre dans aucun calcul
> de solde.

**Deux moments, pas un.** L'argent voyage physiquement : il est collecté un
dimanche et remis au Siège plus tard. Le workflow existant dit déjà ces deux
moments, il n'y a rien à inventer :

| Moment | Statut | Ce que cela veut dire |
|---|---|---|
| L'église clôt sa collecte | `SOUMIS` | « Voici ce que nous avons recueilli. » |
| Le Siège reçoit l'enveloppe | `VALIDE` | « Nous l'avons effectivement en main. » |

RG-18 fait alors exactement ce qu'il faut : tant que la remise n'a pas eu lieu,
la dîme ne compte au solde de personne. Une somme annoncée mais jamais arrivée
ne gonfle pas les comptes du Siège — et l'écart entre le collecté et le reçu
devient précisément l'indicateur qu'un trésorier veut voir.

**Le problème de droit à résoudre.** Un trésorier d'église ne détient pas
`finance.create` sur le Siège — la RLS refusera donc son insertion. Trois issues,
à trancher avant d'écrire :

1. Une permission dédiée, `finance.dime.collect`, de portée l'**église**, et une
   fonction `SECURITY DEFINER` qui crée le mouvement au Siège après avoir vérifié
   que l'appelant peut collecter pour cette église. *(Recommandé : le droit dit
   ce qu'il autorise vraiment, et la fonction est le seul chemin.)*
2. Élargir la politique d'insertion de `finance_entries` au cas des catégories de
   dîme. *(Écarté : une politique RLS qui raisonne sur la catégorie devient
   illisible, et toute nouvelle catégorie de dîme la contournerait.)*
3. Traiter chaque remise en **saisie déléguée** par le Siège. *(Écarté : le Siège
   saisirait à la place de cinquante églises, ce que le mode déléguée est censé
   éviter.)*

**Deux modes, et le choix appartient à l'église.** Certaines veulent la trace
individuelle, d'autres n'ont ni le temps ni le personnel pour la tenir :

| Mode | Ce qui est saisi | Ce qu'on y gagne, ce qu'on y perd |
|---|---|---|
| **Détaillé** | Une ligne par croyant : numéro d'enveloppe, montant, reçu émis | La traçabilité et le reçu. Coûte une ligne par versement. |
| **Global** | Un seul montant pour la collecte | Rapide. Aucune trace individuelle, donc aucun reçu. |

Le réglage est **administré par le SuperAdmin** et **individualisé église par
église** — comme le workflow de validation, et pour la même raison : chaque
bureau gère ses finances, la hiérarchie les consulte.

**Modèle de données envisagé** *(à valider avant écriture)* :

```sql
-- Le mode, sur l'entite. Pas d'heritage, comme finance_validation_active.
alter table entities add column dime_mode text;   -- 'DETAILLE' | 'GLOBAL' | null

-- RG-33 : l'eglise qui a COLLECTE. Le mouvement, lui, reste rattache au Siege
-- par `entity_id` — cette colonne sert la tracabilite, jamais le solde.
alter table finance_entries
  add column eglise_collecte_id uuid references entities(id) on delete restrict;

-- L'enveloppe APPARTIENT au croyant, dans une eglise donnee. Elle survit aux
-- collectes : c'est son identite de donateur, pas un numero de transaction.
create table dime_enveloppes (
  id uuid primary key default gen_random_uuid(),
  eglise_id uuid not null references entities(id) on delete restrict,
  croyant_id uuid not null references croyants(id) on delete restrict,
  numero text not null,
  is_active boolean not null default true,
  unique (eglise_id, numero)          -- deux croyants ne partagent pas un numero
);

-- Le DETAIL d'une collecte. Le mouvement financier reste la piece comptable ;
-- ces lignes en expliquent la composition et portent les recus.
create table dime_versements (
  id uuid primary key default gen_random_uuid(),
  finance_entry_id uuid not null references finance_entries(id) on delete cascade,
  croyant_id uuid not null references croyants(id) on delete restrict,
  enveloppe_numero text,              -- copie figee : le numero peut changer ensuite
  montant numeric(14,2) not null check (montant > 0),
  recu_numero text not null,          -- attribue PAR LA BASE (regle 14)
  created_at timestamptz not null default now()
);
```

**La lecture de l'église ne passe donc pas par son solde.** Elle lit ses
collectes par `eglise_collecte_id`, avec leur statut : ce qu'elle a recueilli, ce
qu'elle a remis, ce qui reste à remettre. La RLS de `finance_entries` doit s'en
souvenir — sa politique `select` teste aujourd'hui `entity_in_scope(entity_id)`,
et un mouvement rattaché au Siège serait **invisible** à l'église qui l'a
collecté. Il faut y ajouter `or entity_in_scope(eglise_collecte_id)`, faute de
quoi EF-FIN-31 est impossible à tenir : une église ne pourrait pas répondre au
croyant qui lui demande la trace de sa dîme.

**Trois points de conception à ne pas manquer :**

1. **Le mouvement financier reste la pièce comptable.** Les versements
   individuels en détaillent la composition ; ils ne s'additionnent pas *à côté*
   du solde. Un trigger doit garantir que `sum(dime_versements.montant)` égale
   `finance_entries.montant`, sinon les deux vérités divergeront et personne ne
   saura laquelle croire.
2. **Le numéro de reçu est attribué par la base**, jamais par le client
   (règle 14) : elle seule garantit l'unicité face à deux membres du bureau qui
   encaissent en même temps, au fond de la même salle. Séquence par église et
   par année, comme le matricule.
3. **`enveloppe_numero` est recopié**, pas seulement référencé. Un croyant peut
   changer d'enveloppe ; le reçu remis il y a deux ans porte l'ancien numéro, et
   c'est celui-là qui doit ressortir d'une recherche.

4. **Le solde des dîmes d'une église est un solde de COLLECTE**, pas un solde
   disponible. Il répond à « combien avons-nous recueilli et remis », jamais à
   « de combien disposons-nous ». Les deux ne doivent pas se ressembler à
   l'écran : même mise en forme, même carte, même couleur, et un trésorier
   engagera une dépense sur un argent qui ne lui appartient pas. À nommer
   explicitement — « Dîmes collectées », « Remises au Siège », « En attente de
   remise » — et à tenir **hors** du triptyque Recettes / Dépenses / Solde.

**Ce qui reste à décider** :

- Le reçu s'imprime-t-il (feuille A4, comme l'organigramme) ou suffit-il de le
  numéroter à l'écran ?
- Le mode se change-t-il en cours d'exercice, et que deviennent alors les
  collectes déjà saisies ?
- La remise au Siège se fait-elle **collecte par collecte** ou par **bordereau**
  regroupant plusieurs dimanches ? Le second est ce qui se pratique
  vraisemblablement — on ne traverse pas la ville chaque semaine — et il change
  le modèle : la remise devient une entité à part, qui rassemble des collectes.
- Une dîme peut-elle être versée **ailleurs qu'à son église de rattachement**,
  lors d'un grand rassemblement ? Si oui, `eglise_collecte_id` diffère de
  l'église du croyant, et le reçu doit le dire.

### Lot 5 — Tableaux de bord *(3 semaines)*

- [ ] `mv_entity_kpis` + tâche planifiée de rafraîchissement.
- [ ] `KPI_REGISTRY` complet (≈ 24 indicateurs, finances incluses).
- [ ] `DashboardGrid` avec `<Suspense>` par widget et masquage par habilitation.
- [ ] Personnalisation : catalogue, glisser-déposer, réglages, modèles prédéfinis.
- [ ] Drill-down et export PDF.
- [ ] Tests : EF-DSH-03, EF-DSH-06, EF-DSH-07, EF-DSH-12.

### Lot 6 — Générateur de rapports *(3 semaines)*

- [ ] `report_templates` et `report_instances`, RLS, visibilités.
- [ ] `REPORT_BLOCKS` : les 11 types de blocs, `resolve` et `render`.
- [ ] `ReportEditor` : palette, composition dnd-kit, panneau de réglages, auto-sauvegarde.
- [ ] `A4Preview` : mise en page paginée fidèle au PDF.
- [ ] Chaîne de génération : résolution, **omission RG-26**, **gel RG-27**, rendu, PDF, audit.
- [ ] Bibliothèque de modèles : officiels, personnels, partagés ; duplication, archivage.
- [ ] Tests : RG-26, RG-27, EF-RAP-13 à 16.

### Lot 7 — Habilitations et administration *(3 semaines)*

- [ ] Comptes, invitations, activation, réinitialisation de mot de passe.
- [ ] `user_permissions` **avec portée**, `PermissionMatrix`, `ScopeSelector`.
- [ ] **Délégation** : `peutDeleguer`, trigger `fn_check_delegation`, audit des refus.
- [ ] Profils d'habilitation globaux et locaux.
- [ ] Journal d'audit : triggers d'écriture, écran de consultation.
- [ ] Corbeille multi-types, paramètres généraux.
- [ ] **Centralisation des options configurables** — EF-ADM-13. Écran unique
      `/administration/parametres`, alimenté par `organisation_settings`.
      Recensement à tenir à jour au fil des lots ; chaque option identifiée en
      cours de développement y est ajoutée après arbitrage de l'utilisateur.

      **Les quatre référentiels sont DÉJÀ configurables** — grades, nationalités,
      fonctions, catégories financières ont leur CRUD complet depuis le lot 1
      (`/referentiels`, EF-REF-01 à 04, droit `referentiel.manage`). Ce qui
      manque n'est pas la fonctionnalité mais son EMPLACEMENT : rien ne les
      relie à l'administration, et le SuperAdmin ne sait pas qu'ils existent.
      À rattacher, sans les réécrire :
  - [ ] Référentiels accessibles depuis `/administration` — renvoi ou
        intégration, pas un second CRUD (règle 16 : un seul chemin par opération).
  - [ ] Grades habilités à célébrer un baptême (EF-ADM-14) — aujourd'hui
        `CODES_GRADE_CELEBRANT` en dur dans `lib/data/baptemes.ts`. C'est ici
        que se voit la limite : le référentiel Grade s'enrichit librement, mais
        un grade nouvellement créé ne pourra jamais célébrer tant que la liste
        reste dans le code.
  - [ ] Fenêtre « nouveaux baptisés » — **déjà en base**, écran à construire.
  - [ ] Auto-approbation des transferts internes — **déjà en base**, idem.
  - [ ] Workflow de validation financière, séparation saisie/validation —
        **déjà en base**, idem.
  - [ ] Plafond de chargement intégral des listes — aujourd'hui constante.
  - [ ] Durée de vie des URL signées de photos — aujourd'hui constante.
- [ ] Tests : RG-19 à RG-25, ENF-SEC-11.

### Lot 8 — Portabilité, recette et mise en production *(3 semaines)*

- [ ] `scripts/export-integral.ts` + écran `/administration/portabilite`.
- [ ] `S3StorageAdapter` livré et testé ; procédure `RESTORE.md`.
- [ ] **Restauration prouvée chez un hébergeur tiers** — suite d'intégration verte *(CA-16)*.
- [ ] Campagne de performance sur 200 000 croyants et 500 000 mouvements générés.
- [ ] Audit d'accessibilité axe-core et corrections.
- [ ] Audit de sécurité : cloisonnement, élévation de privilège, en-têtes, revue RLS.
- [ ] Audit visuel de conformité au design system.
- [ ] Documentation, guides utilisateurs, formation, bascule, sauvegardes, supervision.

---

## 18. Conventions de développement

### 18.1 Nommage

| Élément | Convention | Exemple |
|---|---|---|
| Fichiers de composants | `kebab-case.tsx` | `mouvement-form.tsx` |
| Composants React | `PascalCase` | `MouvementForm` |
| Fonctions et variables | `camelCase` | `getSoldeEntite` |
| Tables et colonnes SQL | `snake_case` | `finance_entries`, `date_bapteme` |
| Valeurs d'énumération SQL | `SCREAMING_SNAKE_CASE` | `'ENTITE_ADMIN'` |
| Routes | français, `kebab-case` | `/tableau-de-bord`, `/finances/a-valider` |
| Clés d'habilitation | `domaine.action` | `finance.validate` |
| Clés d'objet stockées | `<domaine>/<uuid>.<ext>` | `justificatifs/9f3c…-a1.pdf` |

> **Langue** — les identifiants métier restent en français (`croyants`, `bureaux`, `eglise_id`) : ils correspondent au vocabulaire du cahier des charges et évitent toute ambiguïté de traduction. Les termes techniques (`created_at`, `is_active`, `deleted_at`) restent en anglais.

### 18.2 Règles non négociables

1. **Aucune écriture directe en base depuis un composant** — tout passe par une Server Action.
2. **Aucune mutation sans validation Zod** côté serveur, même si le formulaire valide côté client.
3. **Aucun contrôle de droit sans sa portée** : toujours `can(permission, entityId)`, jamais la seule clé.
4. **Aucune page sans squelette** (règle de `designrules.md`) — vérifiée à la revue de code.
5. **Aucune valeur numérique ou monétaire sans `font-mono`** dans les tableaux et les cartes.
6. **Aucun espacement hors grille de 8 px** — contrôlé par règle ESLint.
7. **Aucune bibliothèque lourde importée statiquement** — React Flow, Recharts, moteur PDF, éditeur de rapport et xlsx sont toujours en import dynamique.
8. **Aucune mutation sans écriture d'audit**.
9. **Aucune table métier sans RLS activée** — vérifié par un test qui énumère `pg_tables`.
10. **Aucun appel direct au SDK de l'hébergeur hors de `lib/auth` et `lib/storage`** — vérifié par une règle ESLint `no-restricted-imports` *(ENF-POR-02/03)*.
11. **Aucune URL absolue de fichier stockée en base** — uniquement des clés relatives.

### 18.3 Définition de « terminé »

Une fonctionnalité est terminée lorsque :

- [ ] Le comportement correspond à l'exigence référencée du cahier des charges.
- [ ] Les règles de gestion concernées sont couvertes par un test nommé (`RG-xx — …`).
- [ ] La politique RLS est en place et vérifiée par un test de cloisonnement.
- [ ] Les contrôles d'habilitation **et de portée** sont testés, y compris les cas de refus.
- [ ] L'écran dispose de son squelette, de son état vide et de son état d'erreur.
- [ ] L'interface respecte la grille de 8 px, les rayons et la palette du §8.
- [ ] La navigation clavier fonctionne et axe-core ne remonte aucune violation.
- [ ] Le rendu est vérifié sur 360 px, 768 px et 1440 px.
- [ ] Toute mutation est journalisée dans l'audit.
- [ ] Aucun appel direct au SDK de l'hébergeur n'a été introduit hors des adaptateurs.

---

*Fin du plan de conception — voir [`cdg.md`](cdg.md) pour les exigences contractuelles.*
