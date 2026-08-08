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
