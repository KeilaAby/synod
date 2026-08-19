-- =============================================================================
-- SYNOD — 0050 — La portee est une propriete du DROIT
-- =============================================================================
-- Reference : RG-25, precise le 19 aout 2026.
--
-- LE CAS QUI A TRANCHE
--
-- Un administrateur de district a qui l'on accorde `finance.validate` validait,
-- de ce fait, les mouvements de ses paroisses et de ses eglises : `has_perm`
-- teste une INCLUSION DE CHEMIN, donc toute la descendance.
--
-- Or le lot 4 a pose l'inverse en doctrine : « chaque entite a son bureau et
-- chaque bureau gere ses finances ; la hierarchie ne fait que les CONSULTER ».
-- Le controle de droit ne l'avait jamais suivie.
--
-- CE QUI CHANGE, ET CE QUI NE CHANGE PAS
--
-- Certains actes portent naturellement sur la descendance : creer une eglise,
-- enregistrer un croyant, consulter des finances. Un district structure ses
-- paroisses — si son administrateur ne le pouvait pas, personne ne le ferait.
--
-- D'autres ne concernent QUE l'entite : valider ses ecritures, arreter ses
-- comptes, composer son bureau, ouvrir des comptes et distribuer des
-- habilitations. Ceux-la sont declares `PROPRE`.
--
-- La portee est donc une propriete du DROIT, pas de l'habilitation : ce n'est
-- pas a l'administrateur de decider si « valider une finance » descend.
--
-- ALIGNEMENT AVEC LE DOMAINE — `fn_permissions_portee_propre()` DOIT rester
-- identique aux droits marques `portee: 'PROPRE'` dans
-- `lib/domain/permissions.ts`. Un test lit ce fichier et compare les deux
-- listes : une regle ecrite a deux endroits ne diverge jamais le jour ou on
-- l'ecrit, elle diverge six mois plus tard.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

create or replace function fn_permissions_portee_propre() returns text[]
language sql immutable as $$
  select array[
    -- Chaque bureau gere SES finances ; la hierarchie les consulte (lot 4).
    'finance.create',
    'finance.update',
    'finance.submit',
    'finance.validate',
    'finance.validate_own',
    'finance.periode.close',
    'finance.periode.reopen',
    -- Composer le bureau d'une eglise ne revient pas au district.
    'bureau.manage',
    'bureau.delete',
    -- Les comptes et les habilitations d'une entite ne se pilotent pas d'en haut.
    'user.manage',
    'permission.delegate'
  ]::text[]
$$;

comment on function fn_permissions_portee_propre is
  'RG-25 — droits qui valent pour l''entite SEULE, jamais pour sa descendance. '
  'DOIT rester aligne sur les droits marques portee PROPRE dans '
  'lib/domain/permissions.ts — verrouille par tests/unit/permissions.test.ts.';


-- -----------------------------------------------------------------------------
-- Le controle de reference
-- -----------------------------------------------------------------------------
--
-- `p_entity_id is null` reste la DETENTION SEULE, sans portee : c'est ce qui
-- sert a decider si un bouton s'affiche, avant de savoir sur quelle entite il
-- portera.
--
-- Quand une portee est demandee, deux lectures s'opposent :
--   - portee `null` sur l'octroi = « tout le perimetre du compte ». Pour un
--     droit PROPRE, cela se lit « mon entite de rattachement », et rien de plus.
--   - portee posee = l'entite designee. Pour un droit PROPRE, il faut l'EGALITE
--     du chemin ; pour les autres, l'inclusion, comme avant.

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
             or exists (
                  select 1
                    from entities e
                   where e.id = p_entity_id
                     and (
                       case
                         when p_permission = any (fn_permissions_portee_propre())
                           -- PROPRE : l'entite visee EST la portee accordee.
                           then e.path = coalesce(se.path, current_scope_path())
                         else
                           -- DESCENDANTE : elle est sous la portee accordee.
                           e.path <@ coalesce(se.path, current_scope_path())
                       end
                     )
                )
           )
      )
$$;

comment on function has_perm is
  'RG-24, RG-25 — le droit est-il detenu, et sa portee couvre-t-elle l''entite ? '
  'Depuis 0050, la portee suit la NATURE du droit : PROPRE (l''entite seule) ou '
  'DESCENDANTE (elle et son sous-arbre). Voir fn_permissions_portee_propre().';

notify pgrst, 'reload schema';
