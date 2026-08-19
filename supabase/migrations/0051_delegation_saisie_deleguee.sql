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
