-- =============================================================================
-- SYNOD — 0022 — L'ordre protocolaire disparait
-- =============================================================================
-- EF-BUR-07, EF-REF-03. Arbitrage du 9 aout 2026.
--
-- POURQUOI IL EXISTAIT
--
-- Il servait a DEDUIRE l'organigramme d'un bureau : le rang 10 en racine, le
-- rang 20 en dessous, et ainsi de suite. C'etait la seule facon de dessiner un
-- organigramme que personne n'avait dessine.
--
-- POURQUOI IL DISPARAIT
--
-- Depuis la migration 0021, l'organigramme se DESSINE : on pose les blocs, on
-- tire les traits. Le rang ne decidait donc plus de rien — il restait une
-- colonne a saisir, a maintenir et a expliquer, pour un usage qui n'existait
-- plus. Un champ qui ne decide de rien devient un piege : quelqu'un finit par
-- croire qu'il compte encore.
--
-- CE QUI LE REMPLACE
--
-- L'ordre ALPHABETIQUE, partout ou une liste de fonctions s'affiche. Il ne
-- pretend rien dire de la preseance — c'est justement ce qu'on voulait : la
-- hierarchie reelle vit dans `bureau_postes`, propre a chaque bureau, et nulle
-- part ailleurs.
--
-- CE QUE CELA CONTREDIT, ET QUI L'A TRANCHE
--
-- EF-BUR-07 disait « ordonne par rang protocolaire » : l'exigence a ete
-- corrigee dans `cdg.md` a la meme date, sur decision de l'utilisateur.
-- =============================================================================

alter table fonctions drop column if exists ordre_protocolaire;

comment on table fonctions is
  'Role occupe au sein d''un bureau — EF-REF-03. '
  'La hierarchie ne vit pas ici : elle est propre a chaque bureau (bureau_postes).';
