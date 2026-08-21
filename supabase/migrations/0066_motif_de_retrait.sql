-- =============================================================================
-- SYNOD — 0066 — Retirer un titulaire : une erreur, ou une decision
-- =============================================================================
-- Reference : EF-BUR-08, RG-08. Demande du 20 aout 2026.
--
-- DEUX GESTES QUE L'APPLICATION CONFONDAIT.
--
-- « Retirer » fermait le mandat du jour, sans rien demander. Or deux situations
-- tres differentes passaient par ce meme bouton :
--
--   1. UNE ERREUR D'ASSIGNATION. On a designe Rakoto au lieu de Rabe, on s'en
--      apercoit le lendemain. Ce n'est pas un evenement de la vie de Rakoto,
--      c'est une faute de frappe. La fermer laissait pourtant dans sa frise un
--      mandat d'un jour, que personne ne peut expliquer et que tout le monde
--      lira un jour comme une destitution.
--
--   2. UN RETRAIT EN COURS DE MANDAT. Deces, demission, sanction. La, c'est un
--      evenement, il compte, et il DOIT etre motive — un mandat interrompu sans
--      raison ecrite est exactement ce qu'on cherchera dans dix ans.
--
-- CE QUE CETTE MIGRATION APPORTE : `motif_retrait`.
--
-- Nullable, et il le restera. Un mandat se clot aussi par la FERMETURE DE SON
-- BUREAU (`fn_clore_bureau`) ou par un REMPLACEMENT : ni l'un ni l'autre n'est
-- un retrait, et exiger un motif les ferait echouer. La colonne dit donc « ce
-- mandat a ete interrompu, et voici pourquoi » — pas « tout mandat clos a un
-- motif ».
--
-- L'OBLIGATION VIT DANS L'ACTION, pas dans une contrainte : elle depend du
-- GESTE, que la base ne voit pas. Une contrainte ne saurait pas distinguer une
-- cloture de bureau d'un retrait individuel.
--
-- LA FENETRE DE 15 JOURS N'EST PAS ICI NON PLUS. Elle porte sur la SUPPRESSION
-- de la ligne — le cas 1 —, et une ligne supprimee ne laisse rien a contraindre.
-- C'est l'action qui la tient, et le journal d'audit qui garde la trace : la
-- fiche du croyant, elle, doit redevenir vierge, c'est tout l'objet du cas 1.
--
-- REJOUABLE (regle 23) : `add column if not exists`.
-- =============================================================================

alter table bureau_membres
  add column if not exists motif_retrait text;

comment on column bureau_membres.motif_retrait is
  'EF-BUR-08 — pourquoi ce mandat a ete INTERROMPU avant son terme : deces, '
  'demission, sanction. Reste NULL quand le mandat s''acheve normalement, par '
  'la cloture de son bureau ou par un remplacement — ce ne sont pas des '
  'retraits, et exiger un motif les ferait echouer.';


/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, la colonne resterait
 * invisible a l'API et l'ecriture repondrait « column ... does not exist » sur
 * du SQL pourtant en place.
 */
notify pgrst, 'reload schema';
