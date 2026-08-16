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
