-- =============================================================================
-- SYNOD — 0003 — Hierarchie des entites
-- =============================================================================
-- Reference : plan.md §3.3 — RG-01, RG-02, RG-03
-- Table unique pour les 6 niveaux (DA-1) + chemin materialise ltree (DA-2).
-- =============================================================================

create table entities (
  id          uuid primary key default gen_random_uuid(),
  type        entity_type not null,
  code        text        not null,
  nom         text        not null,
  parent_id   uuid        references entities(id) on delete restrict,
  niveau      smallint    not null,   -- 1=SIEGE .. 6=CELLULE, derive de `type`
  path        ltree       not null,   -- chemin materialise racine -> noeud
  description text,

  -- ARB-2 / EF-STR-10 : autorise la saisie financiere deleguee par le Siege
  sans_acces_application boolean not null default false,

  is_active  boolean     not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,                     -- FK ajoutee en 0005 (dependance circulaire)
  updated_at timestamptz not null default now(),

  constraint entities_code_len    check (char_length(code) >= 3),                 -- RG-02
  constraint entities_code_format check (code ~ '^[A-Z0-9][A-Z0-9-]{2,15}$'),
  constraint entities_racine      check ((type = 'SIEGE') = (parent_id is null))  -- RG-03
);

comment on table  entities      is 'Noeuds de la structure ecclesiale, tous niveaux confondus (DA-1)';
comment on column entities.path is 'Chemin materialise ltree : permet "moi et mes descendants" via <@ (DA-2)';
comment on column entities.sans_acces_application is
  'Entite depourvue d''acces a l''application : le Siege saisit pour son compte (ARB-2)';

-- RG-02 : code unique sur toute l'application, tous niveaux confondus
create unique index entities_code_unique on entities (upper(code)) where deleted_at is null;

-- RG-03 : une seule et unique entite Siege
create unique index entities_siege_unique on entities (type)
  where type = 'SIEGE' and deleted_at is null;

create index entities_path_gist  on entities using gist (path);
create index entities_parent_idx on entities (parent_id) where deleted_at is null;
create index entities_type_idx   on entities (type)      where deleted_at is null;


-- -----------------------------------------------------------------------------
-- Etiquette ltree derivee d'un uuid.
-- Prefixe 'n' pour garantir une etiquette valide quel que soit l'uuid.
-- -----------------------------------------------------------------------------
create or replace function fn_ltree_label(p_id uuid) returns ltree
language sql immutable strict as $$
  select text2ltree('n' || replace(p_id::text, '-', '_'))
$$;


-- -----------------------------------------------------------------------------
-- RG-01 : hierarchie strictement ordonnee, aucun saut de niveau, aucun cycle.
-- Maintient `niveau` et `path` a chaque ecriture.
-- -----------------------------------------------------------------------------
create or replace function fn_entities_before_write() returns trigger
language plpgsql as $$
declare
  v_niveau smallint;
  v_parent entities%rowtype;
begin
  v_niveau := case new.type
    when 'SIEGE'    then 1
    when 'REGIONAL' then 2
    when 'DISTRICT' then 3
    when 'PAROISSE' then 4
    when 'EGLISE'   then 5
    when 'CELLULE'  then 6
  end;

  new.niveau := v_niveau;
  new.code   := upper(trim(new.code));

  if new.parent_id is null then
    if v_niveau <> 1 then
      raise exception 'RG-01 : une entite de type % doit avoir un parent', new.type
        using errcode = 'check_violation';
    end if;
    new.path := fn_ltree_label(new.id);
  else
    select * into v_parent from entities where id = new.parent_id;
    if not found then
      raise exception 'Entite parente introuvable' using errcode = 'foreign_key_violation';
    end if;

    -- Le parent doit etre du niveau immediatement superieur
    if v_parent.niveau <> v_niveau - 1 then
      raise exception
        'RG-01 : un(e) % ne peut etre rattache(e) qu''a un(e) %, pas a un(e) %',
        new.type,
        (array['SIEGE','REGIONAL','DISTRICT','PAROISSE','EGLISE'])[v_niveau - 1],
        v_parent.type
        using errcode = 'check_violation';
    end if;

    -- EF-STR-07 : un rattachement ne doit jamais creer de cycle
    if tg_op = 'UPDATE' and v_parent.path <@ fn_ltree_label(old.id) then
      raise exception 'RG-01 : rattachement impossible, cycle detecte'
        using errcode = 'check_violation';
    end if;

    new.path := v_parent.path || fn_ltree_label(new.id);
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger trg_entities_biu
  before insert or update of type, parent_id, code on entities
  for each row execute function fn_entities_before_write();


-- -----------------------------------------------------------------------------
-- EF-STR-07 : un rattachement deplace tout le sous-arbre.
-- Le garde pg_trigger_depth() evite la recursion : seule la mise a jour
-- de tete propage, en une seule instruction.
-- -----------------------------------------------------------------------------
create or replace function fn_entities_propagate_path() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if new.path is distinct from old.path then
    update entities
       set path   = new.path || subpath(path, nlevel(old.path)),
           niveau = new.niveau + (nlevel(path) - nlevel(old.path))
     where path <@ old.path
       and id <> new.id;
  end if;

  return null;
end $$;

create trigger trg_entities_aiu
  after update of path on entities
  for each row execute function fn_entities_propagate_path();


-- -----------------------------------------------------------------------------
-- EF-STR-08 : une entite ayant des sous-entites vivantes ne peut etre supprimee
-- logiquement ; l'interface propose une desactivation a la place.
-- -----------------------------------------------------------------------------
create or replace function fn_entities_before_soft_delete() returns trigger
language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if exists (
      select 1 from entities
       where parent_id = old.id and deleted_at is null
    ) then
      raise exception
        'EF-STR-08 : "%" possede des sous-entites actives et ne peut etre supprimee', old.nom
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger trg_entities_soft_delete
  before update of deleted_at on entities
  for each row execute function fn_entities_before_soft_delete();


-- -----------------------------------------------------------------------------
-- `updated_at` sur toute modification.
--
-- Trigger distinct de `trg_entities_biu` a dessein : ce dernier est restreint
-- aux colonnes type/parent_id/code, car il RECALCULE `path`. L'elargir ferait
-- entrer en conflit son calcul avec la propagation de sous-arbre.
-- -----------------------------------------------------------------------------
create or replace function fn_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_entities_touch
  before update on entities
  for each row execute function fn_touch_updated_at();
