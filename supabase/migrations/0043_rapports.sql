-- =============================================================================
-- SYNOD — 0043 — Modeles et rapports generes
-- =============================================================================
-- Reference : EF-RAP-07 a 18, RG-26, RG-27 — conception dans `plan.md` §3.11.
--
-- DEUX TABLES, ET LA SECONDE NE DEPEND PAS DE LA PREMIERE.
--
-- `report_templates` decrit COMMENT composer ; `report_instances` conserve CE
-- QUI A ETE PRODUIT. Un rapport genere porte donc une COPIE de la structure du
-- modele (`template_snapshot`) en plus de ses donnees : modifier un modele —
-- ou l'archiver — ne doit rien changer a ce qui a deja ete diffuse. C'est la
-- meme raison qui fait garder `on delete set null` sur `template_id` : le
-- rapport survit a la disparition de son modele.
--
-- RG-27 — UN RAPPORT GENERE EST FIGE. Ses donnees sont capturees a l'instant de
-- la generation et ne sont plus recalculees. C'est ce que porte `contenu`, et
-- c'est la seule facon qu'un chiffre diffuse en conseil reste celui qu'on
-- retrouve trois mois plus tard. Un rapport qui se recalculerait a chaque
-- ouverture ne serait pas un rapport, mais un ecran.
--
-- RG-26 — LES BLOCS NON HABILITES SONT OMIS, et l'omission se TRACE
-- (`blocs_omis`). Le pied de page la mentionne : un rapport plus court sans que
-- rien ne le dise se lit comme un rapport complet, et c'est ainsi qu'on conclut
-- d'une absence de finances qu'il n'y a pas eu de mouvement.
--
-- REJOUABLE (regle 23).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Les modeles
-- -----------------------------------------------------------------------------

create table if not exists report_templates (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  description text,

  /**
   * L'entite PROPRIETAIRE. `null` designe le Siege — EF-RAP-08 : les modeles
   * officiels n'appartiennent a aucune entite en particulier, ils sont mis a
   * disposition de toutes.
   */
  entity_id   uuid references entities (id) on delete cascade,

  -- EF-RAP-10 : un modele « Synthese de district » ne se propose qu'aux districts.
  niveaux_applicables entity_type[] not null
    default '{SIEGE,REGIONAL,DISTRICT,PAROISSE,EGLISE}',

  /**
   * EF-RAP-09 — jusqu'ou le modele se voit.
   *
   *   PRIVE       : son auteur seul ;
   *   ENTITE      : les comptes de l'entite proprietaire ;
   *   DESCENDANTS : elle et tout son sous-arbre ;
   *   GLOBAL      : toute l'organisation.
   */
  visibilite   visibilite_modele not null default 'ENTITE',

  -- EF-RAP-08 : pose par le Siege, utilisable sans modification, duplicable.
  est_officiel boolean not null default false,

  -- La composition : sections et blocs (cf. `lib/domain/rapport.ts`).
  structure    jsonb not null default '{"sections":[]}'::jsonb,

  -- EF-RAP-11 : versionnement et archivage.
  version      integer not null default 1,
  archived_at  timestamptz,

  created_by   uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint report_templates_nom_check check (length(trim(nom)) >= 3),
  -- Un modele officiel appartient au Siege, donc a aucune entite : les deux
  -- ensemble donneraient un modele « officiel mais reserve a une paroisse ».
  constraint report_templates_officiel_check
    check (not est_officiel or entity_id is null)
);

create index if not exists report_templates_entity_idx
  on report_templates (entity_id)
  where archived_at is null;

create index if not exists report_templates_officiel_idx
  on report_templates (est_officiel)
  where est_officiel and archived_at is null;

comment on table report_templates is
  'EF-RAP-07 a 11 — composition reutilisable d''un rapport.';


-- -----------------------------------------------------------------------------
-- Les rapports generes
-- -----------------------------------------------------------------------------

create table if not exists report_instances (
  id uuid primary key default gen_random_uuid(),

  -- `set null` : le rapport SURVIT a la disparition de son modele. Ce qui a ete
  -- diffuse ne peut pas s'effacer parce qu'on a fait le menage dans les modeles.
  template_id       uuid references report_templates (id) on delete set null,
  -- RG-27 — la structure du modele AU MOMENT de la generation.
  template_snapshot jsonb not null,

  nom               text not null,
  entity_id         uuid not null references entities (id) on delete restrict,
  periode_debut     date not null,
  periode_fin       date not null,
  parametres        jsonb not null default '{}'::jsonb,

  -- RG-27 — les donnees FIGEES. Rien ne les recalcule.
  contenu           jsonb not null default '{}'::jsonb,
  -- RG-26 — les blocs ecartes faute d'habilitation, et leur motif.
  blocs_omis        jsonb not null default '[]'::jsonb,

  -- ENF-POR-03 — cle d'objet RELATIVE, jamais une URL signee (regle 11).
  pdf_key           text,

  statut            statut_rapport not null default 'GENERE',
  genere_par        uuid references profiles (id) on delete set null,
  genere_le         timestamptz not null default now(),
  publie_le         timestamptz,

  -- Regle 26 : une contrainte interdit l'IMPOSSIBLE, pas l'inhabituel. Un
  -- rapport sur une seule journee est bref, pas faux.
  constraint report_periode check (periode_fin >= periode_debut)
);

create index if not exists report_instances_entity_idx
  on report_instances (entity_id, genere_le desc);

create index if not exists report_instances_template_idx
  on report_instances (template_id, genere_le desc);

comment on table report_instances is
  'EF-RAP-12 a 18 — rapport genere. RG-27 : `contenu` est fige a la generation.';


-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table report_templates  enable row level security;
alter table report_instances  enable row level security;

/**
 * LECTURE D'UN MODELE — EF-RAP-08, EF-RAP-09.
 *
 * Quatre chemins, du plus large au plus etroit. `GLOBAL` et les modeles
 * officiels sont lisibles par tous : c'est ce qui permet au Siege de mettre une
 * trame a disposition sans la copier vingt fois.
 *
 * `DESCENDANTS` se lit dans le sens de la HIERARCHIE : un modele de district
 * sert ses eglises. L'inverse n'aurait pas de sens — une eglise ne compose pas
 * pour son district.
 */
drop policy if exists report_templates_select on report_templates;
create policy report_templates_select on report_templates
  for select to authenticated
  using (
    est_officiel
    or visibilite = 'GLOBAL'
    or created_by = current_profile_id()
    or (visibilite = 'ENTITE' and entity_id is not null and entity_in_scope(entity_id))
    or (
      visibilite = 'DESCENDANTS'
      and entity_id is not null
      and exists (
        select 1
        from entities proprietaire
        where proprietaire.id = entity_id
          -- `current_scope_path()` est le chemin de MON entite de rattachement.
          -- `<@` lit « est descendant de, ou egal a » : je vois le modele si je
          -- suis sous son proprietaire.
          and current_scope_path() <@ proprietaire.path
      )
    )
  );

/**
 * ECRITURE D'UN MODELE — `report.template.manage`, AVEC SA PORTEE (RG-25).
 *
 * Un modele OFFICIEL n'a pas d'entite : sa portee est celle du Siege, et lui
 * seul peut donc le poser. C'est exactement ce que dit EF-RAP-08.
 */
drop policy if exists report_templates_write on report_templates;
create policy report_templates_write on report_templates
  for all to authenticated
  using (
    case
      when entity_id is null then can('report.template.manage', siege_id())
      else can('report.template.manage', entity_id)
    end
  )
  with check (
    case
      when entity_id is null then can('report.template.manage', siege_id())
      else can('report.template.manage', entity_id)
    end
  );

/**
 * LECTURE D'UN RAPPORT — RG-26 par la RLS elle-meme.
 *
 * Le perimetre borne ce qu'on voit ; `report.read` decide si l'on voit quelque
 * chose. Un rapport PUBLIE (EF-RAP-18) se lit dans son perimetre sans autre
 * condition — c'est ce que publier veut dire.
 */
drop policy if exists report_instances_select on report_instances;
create policy report_instances_select on report_instances
  for select to authenticated
  using (
    entity_in_scope(entity_id)
    and (statut = 'PUBLIE' or can('report.read', entity_id))
  );

drop policy if exists report_instances_write on report_instances;
create policy report_instances_write on report_instances
  for all to authenticated
  using (can('report.create', entity_id))
  with check (can('report.create', entity_id));

/**
 * PUBLIER EST UN DROIT A PART (EF-RAP-18).
 *
 * `report.publish` ne se confond pas avec `report.create` : composer un rapport
 * pour soi et le rendre lisible par tout un perimetre ne sont pas le meme geste.
 * Le trigger le verifie, parce qu'une politique RLS ne sait pas comparer
 * l'ancien statut au nouveau.
 */
create or replace function fn_rapport_before_update() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.statut = 'PUBLIE' and old.statut is distinct from 'PUBLIE' then
    if not can('report.publish', new.entity_id) then
      raise exception 'EF-RAP-18 : vous n''avez pas le droit de publier un rapport pour cette entite.'
        using errcode = 'insufficient_privilege';
    end if;
    new.publie_le := now();
  end if;

  /**
   * RG-27 — UN RAPPORT GENERE EST FIGE.
   *
   * Ni ses donnees, ni la structure qui les a produites, ni sa periode ne
   * changent apres coup. Sans ce verrou, « corriger » un rapport diffuse
   * reecrirait l'histoire sans laisser de trace — et deux personnes citant le
   * meme rapport ne parleraient plus du meme document.
   */
  if (new.contenu, new.template_snapshot, new.periode_debut, new.periode_fin, new.entity_id)
     is distinct from
     (old.contenu, old.template_snapshot, old.periode_debut, old.periode_fin, old.entity_id)
  then
    raise exception
      'RG-27 : un rapport genere est fige ; regenerez-en un nouveau plutot que de le modifier.';
  end if;

  return new;
end $$;

drop trigger if exists trg_rapport_bu on report_instances;
create trigger trg_rapport_bu
  before update on report_instances
  for each row execute function fn_rapport_before_update();

-- `updated_at` d'un modele : il change, lui — c'est tout l'objet d'un modele.
create or replace function fn_report_template_bu() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  -- EF-RAP-11 — toute modification de la STRUCTURE incremente la version. Le
  -- renommer n'en est pas une : la version dit ce que le modele PRODUIT.
  if new.structure is distinct from old.structure then
    new.version := old.version + 1;
  end if;
  return new;
end $$;

drop trigger if exists trg_report_template_bu on report_templates;
create trigger trg_report_template_bu
  before update on report_templates
  for each row execute function fn_report_template_bu();

notify pgrst, 'reload schema';
