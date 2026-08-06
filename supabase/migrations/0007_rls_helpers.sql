-- =============================================================================
-- SYNOD — 0007 — Fonctions de contexte pour la RLS
-- =============================================================================
-- Reference : plan.md §4.1 — RG-20, RG-25, ENF-SEC-01, ENF-POR-02
--
-- Toutes les fonctions sont STABLE + SECURITY DEFINER : elles doivent lire
-- `profiles` et `user_permissions` sans etre elles-memes soumises a la RLS,
-- faute de quoi les politiques s'auto-referenceraient a l'infini.
--
-- Elles echouent TOUJOURS en fermeture : sans profil actif, current_scope_path()
-- vaut NULL, `path <@ NULL` vaut NULL, et aucune ligne n'est retournee.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ENF-POR-02 : SEUL point de couplage avec le fournisseur d'identite.
-- Aujourd'hui Supabase (auth.uid()) ; ailleurs, un parametre de session
-- standard (app.user_id) pose par la couche applicative.
-- -----------------------------------------------------------------------------
create or replace function app_current_auth_id() returns uuid
language plpgsql stable as $$
begin
  begin
    return auth.uid();
  exception when others then
    return nullif(current_setting('app.user_id', true), '')::uuid;
  end;
end $$;

comment on function app_current_auth_id is
  'ENF-POR-02 : encapsule auth.uid() et retombe sur le parametre de session app.user_id';


create or replace function current_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id
    from profiles
   where auth_user_id = app_current_auth_id()
     and is_active
   limit 1
$$;


-- RG-20 : le perimetre d'un compte est le sous-arbre de son entite de rattachement.
create or replace function current_scope_path() returns ltree
language sql stable security definer set search_path = public as $$
  select e.path
    from profiles p
    join entities e on e.id = p.entity_id
   where p.id = current_profile_id()
     and e.deleted_at is null
   limit 1
$$;


create or replace function is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
     where id = current_profile_id()
       and role = 'SUPERADMIN'
  )
$$;


-- RG-20 : l'entite visee est-elle dans le perimetre du compte ?
create or replace function entity_in_scope(p_entity_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_superadmin()
      or exists (
        select 1 from entities e
         where e.id = p_entity_id
           and e.path <@ current_scope_path()
      )
$$;


-- -----------------------------------------------------------------------------
-- RG-25 : le droit est-il detenu, et sa portee couvre-t-elle l'entite visee ?
--   p_entity_id NULL => on teste la seule DETENTION du droit, sans portee.
-- -----------------------------------------------------------------------------
create or replace function has_perm(p_permission text, p_entity_id uuid default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select is_superadmin()
      or exists (
        select 1
          from user_permissions up
          left join entities se on se.id = up.scope_entity_id
         where up.user_id = current_profile_id()
           and up.permission = p_permission
           and (
                p_entity_id is null            -- detention seule
             or up.scope_entity_id is null     -- portee = tout le perimetre du compte
             or exists (
                  select 1 from entities e
                   where e.id = p_entity_id
                     and e.path <@ se.path     -- portee restreinte : inclusion de chemin
                )
           )
      )
$$;

comment on function has_perm is
  'RG-25 : detention du droit ET couverture de portee. Ne verifie PAS le perimetre : voir can().';


-- Controle complet : droit detenu + portee couvrante + entite dans le perimetre.
create or replace function can(p_permission text, p_entity_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select entity_in_scope(p_entity_id) and has_perm(p_permission, p_entity_id)
$$;

comment on function can is
  'Controle de reference cote base : toujours prefere a has_perm() seul';


-- Identifiant du Siege — utile aux politiques portant sur des ressources globales.
create or replace function siege_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from entities where type = 'SIEGE' and deleted_at is null limit 1
$$;


-- Les fonctions de contexte ne doivent pas etre appelables par un role anonyme.
revoke execute on function current_profile_id, current_scope_path, is_superadmin,
                          entity_in_scope, has_perm, can, siege_id
  from public;
grant execute on function current_profile_id, current_scope_path, is_superadmin,
                          entity_in_scope, has_perm, can, siege_id
  to authenticated;
