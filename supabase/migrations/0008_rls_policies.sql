-- =============================================================================
-- SYNOD — 0008 — Politiques RLS du socle
-- =============================================================================
-- Reference : plan.md §4.2 — RG-20, RG-21, RG-25, ENF-SEC-01
--
-- Regle non negociable (plan.md §18.2 n°9) : AUCUNE table metier sans RLS.
-- Un test d'integration enumere pg_tables et echoue si une table y echappe.
-- =============================================================================

alter table entities            enable row level security;
alter table profiles            enable row level security;
alter table user_permissions    enable row level security;
alter table permission_profiles enable row level security;
alter table dashboard_layouts   enable row level security;
alter table dashboard_templates enable row level security;
alter table organisation_settings enable row level security;
alter table audit_log           enable row level security;
alter table grades              enable row level security;
alter table nationalites        enable row level security;
alter table fonctions           enable row level security;
alter table finance_categories  enable row level security;


-- -----------------------------------------------------------------------------
-- ENTITES
-- Lecture : mes descendants (mon perimetre) ET mes ancetres (fil d'Ariane
-- lisible : un district doit pouvoir nommer son regional et le Siege).
-- -----------------------------------------------------------------------------
create policy entities_select on entities for select to authenticated
  using (
       is_superadmin()
    or path <@ current_scope_path()      -- mes descendants
    or current_scope_path() <@ path      -- mes ancetres
  );

create policy entities_insert on entities for insert to authenticated
  with check (
    has_perm('entity.create', parent_id)
    and (
         is_superadmin()
      or exists (
           select 1 from entities p
            where p.id = parent_id
              and p.path <@ current_scope_path()
         )
    )
  );

create policy entities_update on entities for update to authenticated
  using      (can('entity.update', id))
  with check (entity_in_scope(id));

-- entity.delete n'est pas delegable : reserve au Siege (NON_DELEGABLES)
create policy entities_delete on entities for delete to authenticated
  using (is_superadmin());


-- -----------------------------------------------------------------------------
-- PROFILS
-- Chacun lit son propre profil ; les gestionnaires de comptes lisent
-- ceux de leur perimetre.
-- -----------------------------------------------------------------------------
create policy profiles_select on profiles for select to authenticated
  using (
       id = current_profile_id()
    or (has_perm('user.manage') and entity_in_scope(entity_id))
  );

create policy profiles_insert on profiles for insert to authenticated
  with check (can('user.manage', entity_id));

create policy profiles_update on profiles for update to authenticated
  using (
       id = current_profile_id()                        -- son propre profil
    or can('user.manage', entity_id)
  )
  with check (
       id = current_profile_id()
    or can('user.manage', entity_id)
  );

-- Un compte n'est jamais supprime : il est desactive (is_active = false).
create policy profiles_delete on profiles for delete to authenticated
  using (is_superadmin());


-- -----------------------------------------------------------------------------
-- HABILITATIONS
-- Lecture de ses propres droits (EF-AUT-05) ou de ceux du perimetre gere.
-- L'ecriture est encadree par le trigger de delegation (0009), qui applique
-- RG-24. La politique ne fait que le premier filtrage.
-- -----------------------------------------------------------------------------
create policy user_permissions_select on user_permissions for select to authenticated
  using (
       user_id = current_profile_id()
    or has_perm('user.manage')
    or has_perm('permission.delegate')
  );

create policy user_permissions_insert on user_permissions for insert to authenticated
  with check (has_perm('permission.delegate'));

create policy user_permissions_delete on user_permissions for delete to authenticated
  using (has_perm('permission.delegate'));

-- Un octroi ne se modifie pas : il se revoque puis se re-accorde (tracabilite).
create policy user_permissions_update on user_permissions for update to authenticated
  using (false);


-- -----------------------------------------------------------------------------
-- PROFILS D'HABILITATION — EF-ADM-05
-- entity_id NULL = profil global du Siege, lisible par tous.
-- -----------------------------------------------------------------------------
create policy permission_profiles_select on permission_profiles for select to authenticated
  using (entity_id is null or entity_in_scope(entity_id));

-- Parentheses explicites : un profil GLOBAL (entity_id null) est reserve au
-- Siege, un profil LOCAL suit le perimetre. Sans elles, la precedence de `and`
-- sur `or` donnerait un resultat different de l'intention.
create policy permission_profiles_write on permission_profiles for all to authenticated
  using (
    has_perm('permission.delegate')
    and (
         (entity_id is null and is_superadmin())
      or (entity_id is not null and entity_in_scope(entity_id))
    )
  )
  with check (
    has_perm('permission.delegate')
    and (
         (entity_id is null and is_superadmin())
      or (entity_id is not null and entity_in_scope(entity_id))
    )
  );


-- -----------------------------------------------------------------------------
-- TABLEAU DE BORD — strictement personnel
-- -----------------------------------------------------------------------------
create policy dashboard_layouts_own on dashboard_layouts for all to authenticated
  using      (user_id = current_profile_id())
  with check (user_id = current_profile_id());

create policy dashboard_templates_select on dashboard_templates for select to authenticated
  using (true);

create policy dashboard_templates_write on dashboard_templates for all to authenticated
  using (is_superadmin()) with check (is_superadmin());


-- -----------------------------------------------------------------------------
-- PARAMETRES GENERAUX
-- Lisibles par tous (l'application en depend : devise, fenetre baptises...),
-- modifiables par le seul detenteur de settings.manage (non delegable).
-- -----------------------------------------------------------------------------
create policy settings_select on organisation_settings for select to authenticated
  using (true);

create policy settings_update on organisation_settings for update to authenticated
  using (has_perm('settings.manage')) with check (has_perm('settings.manage'));


-- -----------------------------------------------------------------------------
-- AUDIT — lecture filtree par perimetre, insertion libre, jamais de modification
-- -----------------------------------------------------------------------------
create policy audit_select on audit_log for select to authenticated
  using (
    has_perm('audit.read')
    and (entity_id is null or entity_in_scope(entity_id))
  );

create policy audit_insert on audit_log for insert to authenticated
  with check (true);

-- ENF-SEC-08 : double verrou — privileges revoques ET trigger d'immuabilite (0006)
revoke update, delete on audit_log from authenticated;


-- -----------------------------------------------------------------------------
-- REFERENTIELS — lisibles par tout compte authentifie, geres par le Siege
-- (referentiel.manage figure dans NON_DELEGABLES)
-- -----------------------------------------------------------------------------
create policy grades_select on grades for select to authenticated using (true);
create policy grades_write  on grades for all to authenticated
  using (has_perm('referentiel.manage')) with check (has_perm('referentiel.manage'));

create policy nationalites_select on nationalites for select to authenticated using (true);
create policy nationalites_write  on nationalites for all to authenticated
  using (has_perm('referentiel.manage')) with check (has_perm('referentiel.manage'));

create policy fonctions_select on fonctions for select to authenticated using (true);
create policy fonctions_write  on fonctions for all to authenticated
  using (has_perm('referentiel.manage')) with check (has_perm('referentiel.manage'));

create policy finance_categories_select on finance_categories for select to authenticated
  using (true);
create policy finance_categories_write on finance_categories for all to authenticated
  using (has_perm('referentiel.manage')) with check (has_perm('referentiel.manage'));
