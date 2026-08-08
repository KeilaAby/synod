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
