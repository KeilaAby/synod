-- =============================================================================
-- SYNOD — Mise a jour de la base
-- =============================================================================
-- FICHIER GENERE — ne pas editer a la main.
-- Regenerer avec : pnpm db:bundle --depuis 0021
--
-- Contient uniquement les migrations POSTERIEURES a « 0021 » :
--   · 0022_sans_ordre_protocolaire.sql
--
-- L'amorce (seed) n'est PAS incluse : elle a deja ete appliquee.
--
-- Genere le 2026-08-09T16:46:24.884Z
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
  ('0009'),
  ('0010'),
  ('0011'),
  ('0012'),
  ('0013'),
  ('0014'),
  ('0015'),
  ('0016'),
  ('0017'),
  ('0018'),
  ('0019'),
  ('0020'),
  ('0021')
  on conflict (version) do nothing;

-- #############################################################################
-- ## Preflight — la base est-elle bien a jour jusqu a ce point ?
-- #############################################################################

do $$
declare v_dernier text;
begin
  select max(version) into v_dernier from schema_migrations;

  -- Un trou : des migrations seraient inscrites sans avoir ete jouees.
  if v_dernier is null or v_dernier < '0021' then
    raise exception
      'Ce fichier suppose la base a jour jusqu a 0021, or elle en est a %.',
      coalesce(v_dernier, 'aucune migration')
      using hint =
        'Regenerez le fichier avec :  pnpm db:bundle --depuis ' ||
        coalesce(v_dernier, '0000') ||
        '   Sans cela, les migrations manquantes seraient inscrites comme ' ||
        'appliquees sans avoir ete jouees.';
  end if;

  -- Recouvrement : sans gravite, les migrations sont rejouables (regle 23).
  if v_dernier >= '0022' then
    raise notice 'Migrations % et suivantes deja appliquees : elles sont rejouees sans effet.', '0022';
  end if;
end $$;

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
