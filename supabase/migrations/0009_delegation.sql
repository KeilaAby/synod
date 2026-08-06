-- =============================================================================
-- SYNOD — 0009 — Delegation d'habilitations
-- =============================================================================
-- Reference : plan.md §5.3 — ARB-3, RG-24, ENF-SEC-11
--
-- RG-24 : on ne delegue QUE ce que l'on detient, a un compte de SON perimetre,
-- pour une portee INCLUSE dans la sienne. Aucune elevation de privilege.
--
-- Ce controle existe en double : dans lib/domain/permissions.ts (message clair
-- a l'utilisateur) et ici (tient meme en cas d'appel SQL direct).
-- =============================================================================

-- Droits jamais delegables — doit rester aligne sur NON_DELEGABLES
-- dans lib/domain/permissions.ts.
create or replace function fn_permissions_non_delegables() returns text[]
language sql immutable as $$
  select array[
    'entity.delete',
    'referentiel.manage',
    'settings.manage',
    'finance.delegate'
  ]::text[]
$$;


create or replace function fn_check_delegation() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_moi              uuid := current_profile_id();
  v_cible_path       ltree;
  v_portee_detenue   ltree;
  v_portee_accordee  ltree;
begin
  -- Le SuperAdmin accorde sans restriction.
  if is_superadmin() then
    new.granted_by := coalesce(new.granted_by, v_moi);
    return new;
  end if;

  -- Amorcage / migrations hors session applicative : aucun profil courant.
  if v_moi is null then
    return new;
  end if;

  if not has_perm('permission.delegate') then
    raise exception 'RG-24 : vous ne pouvez pas deleguer d''habilitations'
      using errcode = 'insufficient_privilege';
  end if;

  if new.permission = any (fn_permissions_non_delegables()) then
    raise exception 'RG-24 : le droit "%" n''est pas delegable', new.permission
      using errcode = 'insufficient_privilege';
  end if;

  -- Le compte cible doit appartenir au perimetre du delegant.
  select e.path into v_cible_path
    from profiles p
    join entities e on e.id = p.entity_id
   where p.id = new.user_id;

  if v_cible_path is null or not (v_cible_path <@ current_scope_path()) then
    raise exception 'RG-24 : le compte cible est hors de votre perimetre'
      using errcode = 'insufficient_privilege';
  end if;

  -- Le delegant doit detenir le droit. On retient sa portee la PLUS LARGE
  -- (nlevel le plus faible) : c'est la borne superieure de ce qu'il peut accorder.
  select coalesce(se.path, current_scope_path())
    into v_portee_detenue
    from user_permissions up
    left join entities se on se.id = up.scope_entity_id
   where up.user_id = v_moi
     and up.permission = new.permission
   order by nlevel(coalesce(se.path, current_scope_path())) asc
   limit 1;

  if v_portee_detenue is null then
    raise exception
      'RG-24 : vous ne detenez pas le droit "%" et ne pouvez donc pas l''accorder',
      new.permission
      using errcode = 'insufficient_privilege';
  end if;

  -- La portee accordee (ou, a defaut, le perimetre du compte cible)
  -- doit etre incluse dans la portee detenue.
  if new.scope_entity_id is null then
    v_portee_accordee := v_cible_path;
  else
    select path into v_portee_accordee from entities where id = new.scope_entity_id;
    if v_portee_accordee is null then
      raise exception 'RG-24 : portee introuvable' using errcode = 'foreign_key_violation';
    end if;
  end if;

  if not (v_portee_accordee <@ v_portee_detenue) then
    raise exception 'RG-24 : la portee accordee depasse celle de votre habilitation'
      using errcode = 'insufficient_privilege';
  end if;

  new.granted_by := v_moi;
  return new;
end $$;

create trigger trg_check_delegation
  before insert or update on user_permissions
  for each row execute function fn_check_delegation();


-- -----------------------------------------------------------------------------
-- Tracabilite des octrois et revocations — EF-ADM-09.
-- Ecrite en base et non seulement dans les Server Actions, car ces lignes
-- sont le pivot de la securite applicative.
-- -----------------------------------------------------------------------------
create or replace function fn_audit_permissions() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_entity uuid;
begin
  if tg_op = 'INSERT' then
    select entity_id into v_entity from profiles where id = new.user_id;
    insert into audit_log (user_id, action, table_name, record_id, entity_id, diff)
    values (
      current_profile_id(), 'GRANT', 'user_permissions', new.id, v_entity,
      jsonb_build_object(
        'beneficiaire', new.user_id,
        'permission',   new.permission,
        'portee',       new.scope_entity_id,
        'source',       new.source
      )
    );
    return new;
  else
    select entity_id into v_entity from profiles where id = old.user_id;
    insert into audit_log (user_id, action, table_name, record_id, entity_id, diff)
    values (
      current_profile_id(), 'REVOKE', 'user_permissions', old.id, v_entity,
      jsonb_build_object(
        'beneficiaire', old.user_id,
        'permission',   old.permission,
        'portee',       old.scope_entity_id
      )
    );
    return old;
  end if;
end $$;

create trigger trg_audit_permissions
  after insert or delete on user_permissions
  for each row execute function fn_audit_permissions();
