-- =============================================================================
-- SYNOD — 0055 — `trash.purge` a la portee de l'entite SEULE
-- =============================================================================
-- Reference : RG-25 (la portee est une propriete du DROIT — 0050), EF-ADM-10.
--
-- POURQUOI CE DROIT NE DESCEND PAS
--
-- La portee par defaut est DESCENDANTE : un droit accorde a un district vaut
-- pour ses paroisses et ses eglises. C'est le bon defaut pour presque tout —
-- consulter, saisir, composer. Ce n'en est pas un pour l'effacement definitif.
--
-- Un district qui purgerait les fiches de ses eglises le ferait sans que
-- personne, chez elles, ne puisse s'en apercevoir avant qu'il soit trop tard :
-- il n'y a ni corbeille ou le retrouver, ni restauration a demander. Le droit
-- se donne donc entite par entite, ce qui oblige a nommer ce qu'on autorise.
--
-- UNE MIGRATION, UNE FONCTION — voir 0054. Le test d'alignement extrait le
-- PREMIER `select array[...]` du fichier ; deux listes dans un meme fichier lui
-- feraient comparer la mauvaise, et la verification cesserait de verifier.
--
-- ALIGNEMENT — cette liste DOIT rester identique aux droits declares
-- `portee: 'PROPRE'` dans `lib/domain/permissions.ts` ; un test lit ce fichier
-- et compare.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

create or replace function fn_permissions_portee_propre() returns text[]
language sql immutable as $$
  select array[
    'finance.create','finance.update','finance.submit','finance.validate',
    'finance.validate_own','finance.periode.close','finance.periode.reopen',
    'bureau.manage','bureau.delete','user.manage','permission.delegate',
    -- EF-ADM-10 : l'effacement definitif se donne entite par entite.
    'trash.purge'
  ]::text[]
$$;

comment on function fn_permissions_portee_propre is
  'RG-25 : droits dont la portee est l''entite SEULE, sans descendance. DOIT '
  'rester aligne sur les entrees portee: PROPRE de lib/domain/permissions.ts — '
  'verrouille par tests/unit/permissions.test.ts. Depuis 0055 : trash.purge.';

notify pgrst, 'reload schema';
