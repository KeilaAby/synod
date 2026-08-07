-- =============================================================================
-- SYNOD — 0014 — Seau de stockage et politiques des photos
-- =============================================================================
-- EF-CRO-09, ENF-SEC-06, RG-25.
--
-- Le code applicatif suppose depuis le lot 0 un seau nomme `synod` (variable
-- STORAGE_BUCKET). Il n'existait pas : rien ne le creait, et `storage.objects`
-- etant protege par RLS, aucun televersement n'aurait abouti.
--
-- PRINCIPE — une photo herite de la visibilite de son croyant. La politique ne
-- reimplemente donc aucune regle de perimetre : elle interroge `croyants`, qui
-- porte deja la sienne. Une regle de securite recopiee est une regle qui
-- divergera.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Le seau
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- 2. Politiques — dossier `photos/`
-- -----------------------------------------------------------------------------

/**
 * La cle d'une photo est `photos/<uuid du croyant>.<ext>` : l'identifiant du
 * croyant se lit donc dans le nom du fichier. C'est ce qui permet d'autoriser
 * le DEPOT avant que `croyants.photo_key` ne soit renseigne — a l'insertion,
 * la colonne est encore nulle.
 */
create or replace function fn_croyant_de_la_cle(p_nom text) returns uuid
language sql immutable as $$
  select nullif(split_part(split_part(p_nom, '/', 2), '.', 1), '')::uuid
$$;

comment on function fn_croyant_de_la_cle(text) is
  'Extrait l''identifiant de croyant d''une cle `photos/<uuid>.<ext>`.';

alter table storage.objects enable row level security;

drop policy if exists synod_photos_lecture on storage.objects;
drop policy if exists synod_photos_depot on storage.objects;
drop policy if exists synod_photos_remplacement on storage.objects;
drop policy if exists synod_photos_suppression on storage.objects;

-- Voir la photo d'un croyant que l'on peut deja voir. `croyants` filtrant par
-- perimetre (RG-25), la portee suit sans etre reecrite ici.
create policy synod_photos_lecture on storage.objects
  for select to authenticated
  using (
    bucket_id = 'synod'
    and (storage.foldername(name))[1] = 'photos'
    and exists (
      select 1 from croyants c
       where c.id = fn_croyant_de_la_cle(storage.objects.name)
    )
  );

create policy synod_photos_depot on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'synod'
    and (storage.foldername(name))[1] = 'photos'
    and exists (
      select 1 from croyants c
       where c.id = fn_croyant_de_la_cle(storage.objects.name)
    )
  );

-- Le remplacement (`upsert`) est un UPDATE : sans cette politique, changer de
-- photo echouerait la ou l'ajout reussit.
create policy synod_photos_remplacement on storage.objects
  for update to authenticated
  using (
    bucket_id = 'synod'
    and (storage.foldername(name))[1] = 'photos'
    and exists (
      select 1 from croyants c
       where c.id = fn_croyant_de_la_cle(storage.objects.name)
    )
  );

create policy synod_photos_suppression on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'synod'
    and (storage.foldername(name))[1] = 'photos'
    and exists (
      select 1 from croyants c
       where c.id = fn_croyant_de_la_cle(storage.objects.name)
    )
  );

-- NOTE — les dossiers `justificatifs/`, `rapports/`, `logos/` et `imports/`
-- n'ont volontairement AUCUNE politique : ils sont donc fermes. Chacun recevra
-- la sienne avec le lot qui l'introduit (finances, rapports, parametres),
-- adossee a la table qui porte deja sa regle de perimetre.
