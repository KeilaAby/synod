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
