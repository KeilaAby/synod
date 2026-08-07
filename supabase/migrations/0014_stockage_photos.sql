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

-- PAS de `alter table storage.objects enable row level security` : elle l'est
-- deja dans tout projet Supabase, et cette instruction exige d'etre
-- PROPRIETAIRE de la table — ce que `postgres` n'est plus depuis que
-- `supabase_storage_admin` l'a reprise. La tentative echouait en 42501 et
-- interrompait la migration. Creer une politique, en revanche, reste permis :
-- c'est la voie documentee par Supabase.

-- Verification prealable : un 42501 nu ne dit pas quoi faire. Mieux vaut
-- echouer en nommant le role manquant et la marche a suivre.
do $$
declare v_proprietaire text;
begin
  select pg_get_userbyid(relowner) into v_proprietaire
    from pg_class where oid = 'storage.objects'::regclass;

  if not pg_has_role(current_user, v_proprietaire, 'member') then
    raise exception
      'Creer une politique sur storage.objects exige le role « % », dont « % » n''est pas membre.',
      v_proprietaire, current_user
      using hint =
        'Creez les quatre politiques depuis Supabase > Storage > Policies '
        'sur le seau « synod » (dossier photos/), ou rejouez ce fichier avec un '
        'role proprietaire. Le reste de la migration est deja applique.';
  end if;
end $$;

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
