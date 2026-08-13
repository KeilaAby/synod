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
