-- =============================================================================
-- SYNOD — Etat de l'installation
-- =============================================================================
-- Requete de controle, sans effet de bord. A executer a tout moment pour
-- savoir ou en est la base.
-- =============================================================================

select
  (select count(*) from auth.users)                          as comptes_auth,
  (select count(*) from entities where type = 'SIEGE'
                                   and deleted_at is null)   as siege,
  (select count(*) from entities where deleted_at is null)   as entites,
  (select count(*) from profiles)                            as profils,
  (select count(*) from profiles where role = 'SUPERADMIN')  as superadmins,
  (select count(*) from grades)                              as grades,
  (select count(*) from nationalites)                        as nationalites,
  (select count(*) from fonctions)                           as fonctions,
  (select count(*) from finance_categories)                  as categories_finance;

-- Attendu apres install.sql :
--   siege = 1 · entites = 1 · grades = 5 · nationalites = 13
--   fonctions = 12 · categories_finance = 13
-- Attendu apres bootstrap-superadmin.sql :
--   comptes_auth >= 1 · profils = 1 · superadmins = 1


-- -----------------------------------------------------------------------------
-- Detail des comptes d'authentification.
-- Comparez l'adresse exacte avec celle du script d'amorcage : c'est la cause
-- n°1 d'un amorcage qui « passe » sans rien creer.
-- -----------------------------------------------------------------------------
select id, email, email_confirmed_at, created_at
  from auth.users
 order by created_at;


-- -----------------------------------------------------------------------------
-- ENF-SEC-01 / regle non negociable n°9 : aucune table metier sans RLS.
-- Toute ligne retournee ici est une faille de cloisonnement.
-- -----------------------------------------------------------------------------
select c.relname as table_sans_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and not c.relrowsecurity
 order by c.relname;
