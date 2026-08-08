-- =============================================================================
-- SYNOD — Mise a jour de la base
-- =============================================================================
-- FICHIER GENERE — ne pas editer a la main.
-- Regenerer avec : pnpm db:bundle --depuis 0017
--
-- Contient uniquement les migrations POSTERIEURES a « 0017 » :
--   · 0018_reparer_chemins.sql
--   · 0019_bureau_suppression.sql
--
-- L'amorce (seed) n'est PAS incluse : elle a deja ete appliquee.
--
-- Genere le 2026-08-08T15:51:01.251Z
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
  ('0017')
  on conflict (version) do nothing;

-- #############################################################################
-- ## Preflight — la base est-elle bien a jour jusqu a ce point ?
-- #############################################################################

do $$
declare v_dernier text;
begin
  select max(version) into v_dernier from schema_migrations;

  -- Un trou : des migrations seraient inscrites sans avoir ete jouees.
  if v_dernier is null or v_dernier < '0017' then
    raise exception
      'Ce fichier suppose la base a jour jusqu a 0017, or elle en est a %.',
      coalesce(v_dernier, 'aucune migration')
      using hint =
        'Regenerez le fichier avec :  pnpm db:bundle --depuis ' ||
        coalesce(v_dernier, '0000') ||
        '   Sans cela, les migrations manquantes seraient inscrites comme ' ||
        'appliquees sans avoir ete jouees.';
  end if;

  -- Recouvrement : sans gravite, les migrations sont rejouables (regle 23).
  if v_dernier >= '0018' then
    raise notice 'Migrations % et suivantes deja appliquees : elles sont rejouees sans effet.', '0018';
  end if;
end $$;

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
