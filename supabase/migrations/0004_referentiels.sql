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
