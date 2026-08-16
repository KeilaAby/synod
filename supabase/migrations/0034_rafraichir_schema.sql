-- =============================================================================
-- SYNOD — 0034 — Forcer PostgREST a relire le schema
-- =============================================================================
-- POURQUOI CE FICHIER EXISTE
--
-- PostgREST garde en memoire la signature de chaque fonction exposee. Quand une
-- migration en REMPLACE une — `0032` l'a fait pour `fn_saisir_collecte_dime` —
-- le cache peut rester en retard quelques instants, parfois davantage. L'appel
-- echoue alors avec « Could not find the function ... in the schema cache »,
-- alors que la fonction existe bel et bien et qu'un `select` direct la trouve.
--
-- Le symptome est deroutant : la base est juste, le code est juste, et l'ecran
-- dit non. Cette notification remet les deux d'accord.
--
-- REJOUABLE (regle 23) : une notification n'a pas d'etat.
-- =============================================================================

notify pgrst, 'reload schema';
