-- =============================================================================
-- SYNOD — Etat de l'installation
-- =============================================================================
-- UNE SEULE requete, volontairement : l'editeur SQL de Supabase n'affiche le
-- resultat que d'une instruction a la fois. Un diagnostic decoupe en plusieurs
-- SELECT ne montre donc qu'une partie de la reponse.
--
-- Sans effet de bord. A executer a tout moment.
--
-- Si l'execution echoue avec « relation "X" does not exist », c'est le
-- diagnostic lui-meme : la migration qui cree X n'a pas ete appliquee.
--   · schema_migrations manquante -> appliquer install-incremental.sql
--   · croyants / transferts manquantes -> migrations 0010 et 0011
-- =============================================================================

select
  controle,
  valeur,
  attendu,
  case when conforme then 'OK' else 'A VERIFIER' end as verdict
from (
  -- --- Schema -----------------------------------------------------------
  select 1 as ordre,
         'Derniere migration appliquee' as controle,
         coalesce((select max(version) from schema_migrations), 'aucune') as valeur,
         '0011' as attendu,
         coalesce((select max(version) from schema_migrations), '') >= '0011' as conforme

  union all
  select 2, 'Migrations enregistrees',
         (select count(*)::text from schema_migrations),
         '12', -- 0000 a 0011
         (select count(*) from schema_migrations) >= 12

  -- --- Structure --------------------------------------------------------
  union all
  select 10, 'Siege (racine unique)',
         (select count(*)::text from entities
           where type = 'SIEGE' and deleted_at is null),
         '1',
         (select count(*) from entities where type = 'SIEGE' and deleted_at is null) = 1

  union all
  select 11, 'Entites au total',
         (select count(*)::text from entities where deleted_at is null),
         '>= 1',
         (select count(*) from entities where deleted_at is null) >= 1

  -- --- Comptes ----------------------------------------------------------
  union all
  select 20, 'Comptes d authentification',
         (select count(*)::text from auth.users),
         '>= 1',
         (select count(*) from auth.users) >= 1

  union all
  select 21, 'Profils applicatifs',
         (select count(*)::text from profiles),
         '>= 1',
         (select count(*) from profiles) >= 1

  union all
  select 22, 'SuperAdmin rattache au Siege',
         (select count(*)::text from profiles p
            join entities e on e.id = p.entity_id
           where p.role = 'SUPERADMIN' and e.type = 'SIEGE'),
         '1',
         (select count(*) from profiles p
            join entities e on e.id = p.entity_id
           where p.role = 'SUPERADMIN' and e.type = 'SIEGE') = 1

  -- --- Referentiels -----------------------------------------------------
  union all
  select 30, 'Grades', (select count(*)::text from grades), '5',
         (select count(*) from grades) >= 5
  union all
  select 31, 'Nationalites', (select count(*)::text from nationalites), '13',
         (select count(*) from nationalites) >= 13
  union all
  select 32, 'Fonctions', (select count(*)::text from fonctions), '12',
         (select count(*) from fonctions) >= 12
  union all
  select 33, 'Categories financieres',
         (select count(*)::text from finance_categories), '13',
         (select count(*) from finance_categories) >= 13

  -- --- Lot 2 ------------------------------------------------------------
  union all
  select 40, 'Table croyants',
         case when to_regclass('public.croyants') is null then 'ABSENTE' else 'presente' end,
         'presente',
         to_regclass('public.croyants') is not null
  union all
  select 41, 'Table transferts',
         case when to_regclass('public.transferts') is null then 'ABSENTE' else 'presente' end,
         'presente',
         to_regclass('public.transferts') is not null
  union all
  select 42, 'Table baptemes',
         case when to_regclass('public.baptemes') is null then 'ABSENTE' else 'presente' end,
         'presente',
         to_regclass('public.baptemes') is not null
  union all
  select 43, 'Croyants enregistres',
         (select count(*)::text from croyants where deleted_at is null),
         'libre', true

  -- --- Securite ---------------------------------------------------------
  -- ENF-SEC-01 / regle non negociable n°9 : aucune table metier sans RLS.
  -- Toute valeur non nulle est une faille de cloisonnement.
  union all
  select 50, 'Tables publiques SANS RLS',
         (select count(*)::text
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
         '0',
         (select count(*)
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) = 0
) t
order by ordre;
