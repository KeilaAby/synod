-- =============================================================================
-- SYNOD — Creation du premier compte SuperAdmin
-- =============================================================================
-- A executer APRES `install.sql`.
--
-- PREREQUIS : l'utilisateur doit d'abord exister cote authentification.
--   Tableau de bord Supabase > Authentication > Users > Add user
--   Cochez « Auto Confirm User » pour eviter la confirmation par e-mail.
--
-- Rappel (EF-ACT-2, RG-21) : un SuperAdmin est obligatoirement rattache au
-- Siege — un trigger le verifie et refusera tout autre rattachement.
--
-- Aucune ligne dans `user_permissions` n'est necessaire : `is_superadmin()`
-- court-circuite l'evaluation des habilitations (plan.md §4.1).
--
-- Idempotent : rejouable sans effet de bord. Si le profil existe deja, il est
-- remis en conformite (role, rattachement, activation).
-- =============================================================================

do $$
declare
  -- ⚠️  Les deux seules valeurs a personnaliser.
  v_email text := 'seorefchristian@gmail.com';
  v_nom   text := 'Christian';

  v_auth_id    uuid;
  v_siege_id   uuid;
  v_profile_id uuid;
  v_conflit    uuid;
begin
  -- --- 1. L'utilisateur d'authentification existe-t-il ? ---------------------
  select id into v_auth_id
    from auth.users
   where lower(email) = lower(v_email)
   limit 1;

  if v_auth_id is null then
    raise exception
      E'Aucun utilisateur d''authentification pour « % ».\n'
      '  > Creez-le d''abord : Supabase > Authentication > Users > Add user\n'
      '    (cochez « Auto Confirm User »), puis rejouez ce script.\n'
      '  > Pour lister les comptes existants :  select email from auth.users;',
      v_email;
  end if;

  -- --- 2. Le Siege existe-t-il ? --------------------------------------------
  select id into v_siege_id
    from entities
   where type = 'SIEGE' and deleted_at is null
   limit 1;

  if v_siege_id is null then
    raise exception
      E'Le Siege n''existe pas : l''amorce n''a pas ete appliquee.\n'
      '  > Executez la section seed.sql de install.sql.';
  end if;

  -- --- 3. Un autre profil occupe-t-il deja cette adresse ? -------------------
  -- `profiles.email` est unique : sans ce controle, le conflit remonterait
  -- sous forme d'erreur technique illisible.
  select id into v_conflit
    from profiles
   where lower(email) = lower(v_email)
     and auth_user_id is distinct from v_auth_id
   limit 1;

  if v_conflit is not null then
    raise exception
      E'Un profil (%) utilise deja l''adresse « % » mais est rattache a une\n'
      'autre identite. Supprimez-le ou corrigez son auth_user_id avant de rejouer.',
      v_conflit, v_email;
  end if;

  -- --- 4. Creation ou remise en conformite ----------------------------------
  insert into profiles (auth_user_id, email, nom_complet, role, entity_id)
  values (v_auth_id, lower(v_email), v_nom, 'SUPERADMIN', v_siege_id)
  on conflict (auth_user_id) do update
    set role        = 'SUPERADMIN',
        entity_id   = excluded.entity_id,
        nom_complet = excluded.nom_complet,
        is_active   = true
  returning id into v_profile_id;

  raise notice 'SuperAdmin operationnel : % — profil %', v_email, v_profile_id;
end $$;


-- -----------------------------------------------------------------------------
-- Verification — doit retourner EXACTEMENT une ligne.
-- -----------------------------------------------------------------------------
select
  p.email,
  p.nom_complet,
  p.role,
  e.type as entite_type,
  e.code as entite_code,
  e.nom  as entite_nom,
  p.is_active
from profiles p
join entities e on e.id = p.entity_id
where p.role = 'SUPERADMIN';
