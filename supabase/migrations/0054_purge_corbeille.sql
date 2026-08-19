-- =============================================================================
-- SYNOD — 0054 — L'effacement definitif : un droit a part, non delegable
-- =============================================================================
-- Reference : EF-ADM-10 (corbeille), RG-24 (droits reserves au Siege),
--             RG-25 (portee du droit).
--
-- POURQUOI UN DROIT DE PLUS PLUTOT QUE `trash.restore`
--
-- Restaurer DEFAIT une suppression ; purger la rend definitive. Ce ne sont pas
-- deux degres du meme droit mais deux actes opposes, et le second est le seul
-- de l'application qui ne se rattrape par rien : ni la corbeille, ni le
-- journal, ni une restauration ne ramenent ce qu'il a retire.
--
-- NON DELEGABLE, pour cette raison meme. Un droit sans retour se decide au
-- Siege, une fois, et ne se repand pas de proche en proche.
--
-- PORTEE PROPRE (declaree cote TypeScript, `fn_permissions_portee_propre` la
-- porte en base depuis 0050 — a completer ci-dessous). Purger n'est pas un acte
-- qui descend : un district qui effacerait pour de bon les fiches de ses
-- eglises le ferait sans que personne, chez elles, ne s'en apercoive avant
-- qu'il soit trop tard.
--
-- CE QUE LA PURGE NE POURRA PAS FAIRE, ET C'EST VOULU. Les cles etrangeres
-- sont en `on delete restrict` a peu pres partout — un croyant qui a siege
-- dans un bureau, une entite qui porte des mouvements. La base REFUSERA de les
-- effacer, et c'est elle qui a raison : ces lignes sont citees ailleurs.
-- L'application se contente de traduire ce refus en francais.
--
-- ALIGNEMENT — cette liste DOIT rester identique a `NON_DELEGABLES` dans
-- `lib/domain/permissions.ts` ; un test lit ce fichier et compare. Sans lui
-- l'ecart serait invisible : l'ecran refuserait pendant que la base
-- accorderait, ou l'inverse.
--
-- UNE MIGRATION, UNE FONCTION. La portee PROPRE de `trash.purge` se pose dans
-- la migration SUIVANTE et non ici : le test d'alignement extrait le PREMIER
-- `select array[...]` du fichier, et deux listes dans un meme fichier lui
-- feraient comparer la mauvaise. Le decoupage n'est pas cosmetique — c'est ce
-- qui garde la verification honnete.
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
    'finance.periode.reopen',
    -- EF-ADM-10 : la seule operation sans retour de l'application.
    'trash.purge'
  ]::text[]
$$;

comment on function fn_permissions_non_delegables is
  'RG-24 : droits reserves au Siege, jamais delegables. DOIT rester aligne sur '
  'NON_DELEGABLES dans lib/domain/permissions.ts — verrouille par '
  'tests/unit/permissions.test.ts. Depuis 0051, finance.delegate n''y figure '
  'plus. Depuis 0054, trash.purge s''y ajoute.';

notify pgrst, 'reload schema';
