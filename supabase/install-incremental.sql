-- =============================================================================
-- SYNOD — Mise a jour de la base
-- =============================================================================
-- FICHIER GENERE — ne pas editer a la main.
-- Regenerer avec : pnpm db:bundle --depuis 0013
--
-- Contient uniquement les migrations POSTERIEURES a « 0013 » :
--   · 0014_stockage_photos.sql
--
-- L'amorce (seed) n'est PAS incluse : elle a deja ete appliquee.
--
-- Genere le 2026-08-07T14:37:21.979Z
-- =============================================================================


-- #############################################################################
-- ## 0000_migrations.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0000 — Suivi des migrations appliquees
-- =============================================================================
-- Sans registre, rien ne distingue une base neuve d'une base deja installee :
-- rejouer `install.sql` echoue des le premier `create type`, et l'on ne sait
-- pas ou l'on en est.
--
-- Chaque section des fichiers generes s'enregistre ici. `diagnostic.sql` lit
-- cette table pour dire quelles migrations restent a appliquer.
-- =============================================================================

create table if not exists schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

comment on table schema_migrations is
  'Registre des migrations appliquees. Alimente par les fichiers generes.';

insert into schema_migrations (version) values ('0000')
  on conflict (version) do nothing;

-- #############################################################################
-- ## Rattrapage du registre — migrations deja appliquees
-- #############################################################################

insert into schema_migrations (version) values
  ('0001'),
  ('0002'),
  ('0003'),
  ('0004'),
  ('0005'),
  ('0006'),
  ('0007'),
  ('0008'),
  ('0009'),
  ('0010'),
  ('0011'),
  ('0012'),
  ('0013')
  on conflict (version) do nothing;

-- #############################################################################
-- ## 0014_stockage_photos.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0014 — Seau de stockage des fichiers
-- =============================================================================
-- EF-CRO-09, ENF-SEC-06, RG-25.
--
-- Le code applicatif suppose depuis le lot 0 un seau nomme `synod` (variable
-- STORAGE_BUCKET). Il n'existait pas : rien ne le creait.
--
-- POURQUOI AUCUNE POLITIQUE ICI
--
-- La premiere version de cette migration definissait quatre politiques sur
-- `storage.objects`. Elles ne peuvent pas etre creees : cette table appartient
-- a `supabase_storage_admin`, dont `postgres` n'est pas membre, et `CREATE
-- POLICY` exige d'etre proprietaire. L'editeur SQL retourne 42501.
--
-- Le seau reste donc SANS AUCUNE POLITIQUE, c'est-a-dire ferme a tout role
-- `authenticated` : personne n'y accede directement. Les fichiers transitent
-- exclusivement par les Server Actions, qui portent deja le controle
-- d'habilitation AVEC SA PORTEE (`requirePermission(session, …, chemin)`).
--
-- Ce n'est pas un repli : c'est plus sur. Une politique SQL aurait REECRIT en
-- SQL une regle de perimetre deja exprimee dans le domaine, et deux ecritures
-- d'une meme regle finissent toujours par diverger. Ici il n'y en a qu'une.
--
-- Contrepartie assumee : la couche stockage emprunte la cle de service, donc
-- contourne la RLS. Tout appel doit imperativement etre precede d'un controle
-- d'habilitation — voir `lib/storage/supabase-adapter.ts` et
-- `lib/actions/photos.ts`.
-- =============================================================================

-- PRIVE : l'acces passe exclusivement par des URL signees a duree limitee
-- (ENF-SEC-06). Un seau public rendrait la photo de chaque croyant accessible
-- a qui devine son identifiant.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'synod',
  'synod',
  false,
  5242880,                                              -- 5 Mo (EF-CRO-09)
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into schema_migrations (version) values ('0014')
  on conflict (version) do nothing;
