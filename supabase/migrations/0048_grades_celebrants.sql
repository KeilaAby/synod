-- =============================================================================
-- SYNOD — 0048 — Les grades habilites a celebrer un bapteme
-- =============================================================================
-- Reference : EF-ADM-14, EF-BAP-03.
--
-- CE QUE CETTE MIGRATION CORRIGE.
--
-- La liste des grades pouvant celebrer un bapteme etait ECRITE EN DUR dans
-- `lib/data/baptemes.ts` — `CODES_GRADE_CELEBRANT = ['PASTEUR', 'DIACRE',
-- 'EVANGELISTE']`. Le referentiel des grades, lui, s'enrichit librement depuis
-- le lot 1.
--
-- La consequence se voit mal et se comprend tard : un grade cree apres coup ne
-- pourra JAMAIS celebrer, quoi qu'on fasse a l'ecran. L'administrateur ajoute
-- « Ancien », le retrouve partout ailleurs, et cherche pendant une heure
-- pourquoi il n'apparait pas dans la liste des celebrants. Rien ne refuse, rien
-- ne s'affiche : la liste est simplement plus courte.
--
-- C'est la limite que `plan.md` nommait deja au lot 7 : « le referentiel Grade
-- s'enrichit librement, mais un grade nouvellement cree ne pourra jamais
-- celebrer tant que la liste reste dans le code ».
--
-- LE DEFAUT EST `false`, ET LA REPRISE EST EXPLICITE.
--
-- Un defaut a `true` aurait ouvert la celebration a TOUS les grades — croyants
-- compris — le temps que quelqu'un s'en apercoive. On pose donc `false` partout,
-- puis on retablit nommement les trois codes qui etaient dans le code : l'etat
-- apres migration est exactement celui d'avant, et tout elargissement devient
-- une decision prise a l'ecran.
--
-- REJOUABLE (regle 23) : `add column if not exists`, et la mise a jour est
-- bornee aux trois codes — au second passage elle ne trouve rien de plus.
-- =============================================================================

alter table grades
  add column if not exists peut_celebrer boolean not null default false;

comment on column grades.peut_celebrer is
  'EF-ADM-14 — ce grade autorise-t-il a celebrer un bapteme ? Remplace la liste '
  'ecrite en dur dans le code, qui empechait tout grade cree apres coup de '
  'celebrer.';

/**
 * La reprise : les trois codes qui figuraient dans `CODES_GRADE_CELEBRANT`.
 *
 * Bornee a `peut_celebrer = false` pour rester rejouable ET pour ne jamais
 * defaire un choix fait a l'ecran : si quelqu'un a retire « Diacre » depuis,
 * une migration rejouee ne doit pas le remettre.
 */
update grades
   set peut_celebrer = true
 where code in ('PASTEUR', 'DIACRE', 'EVANGELISTE')
   and peut_celebrer = false;

/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, la colonne reste
 * invisible a l'API et la lecture des celebrants repondrait « column ... does
 * not exist » sur du SQL pourtant en place.
 */
notify pgrst, 'reload schema';
