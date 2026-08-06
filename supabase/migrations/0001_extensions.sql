-- =============================================================================
-- SYNOD — 0001 — Extensions
-- =============================================================================
-- ENF-POR-01 : uniquement des extensions PostgreSQL courantes, disponibles chez
-- tout hebergeur. Aucune extension proprietaire.
-- =============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists ltree;      -- chemins materialises (DA-2)
create extension if not exists pg_trgm;    -- recherche floue sur les croyants


-- -----------------------------------------------------------------------------
-- Role applicatif.
--
-- Les politiques RLS s'adressent toutes au role `authenticated`. Supabase le
-- fournit d'origine ; un PostgreSQL nu, non. Sans ce garde, la restauration
-- chez un hebergeur tiers (ENF-POR-07, CA-16) echouerait des la premiere
-- politique.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;
