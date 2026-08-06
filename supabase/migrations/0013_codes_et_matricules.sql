-- =============================================================================
-- SYNOD — 0013 — Codes d'entite automatiques et nouveau format de matricule
-- =============================================================================
-- 1. Le code d'une entite est genere : <PREFIXE>-<SEQUENCE 4 chiffres>.
-- 2. Le matricule devient <INITIALES>-<SEQUENCE 5 chiffres>-<AA>.
--
-- Les valeurs DEJA attribuees ne changent pas : un code et un matricule sont
-- des references stables, imprimees sur des listes et citees ailleurs. Seules
-- les prochaines creations suivent le nouveau format.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Codes d'entite — EF-STR-02, RG-02
-- -----------------------------------------------------------------------------

create table if not exists entity_code_sequences (
  type    entity_type primary key,
  dernier integer not null default 0
);

comment on table entity_code_sequences is
  'Compteur par niveau hierarchique. Interne : jamais lu ni ecrit directement.';

alter table entity_code_sequences enable row level security;
create policy entity_code_sequences_aucun_acces on entity_code_sequences
  for all to authenticated using (false);

/**
 * Prefixe par niveau. Volontairement court et parlant : un code se lit a voix
 * haute et se recopie a la main sur un registre papier.
 */
create or replace function fn_prefixe_entite(p_type entity_type) returns text
language sql immutable strict as $$
  select case p_type
    when 'SIEGE'    then 'SG'
    when 'REGIONAL' then 'REG'
    when 'DISTRICT' then 'DIS'
    when 'PAROISSE' then 'PAR'
    when 'EGLISE'   then 'EGL'
    when 'CELLULE'  then 'CEL'
  end
$$;

-- SECURITY DEFINER : ecrit dans une table fermee a tous par RLS.
create or replace function fn_generer_code_entite(p_type entity_type) returns text
language plpgsql security definer set search_path = public as $$
declare v_seq integer;
begin
  insert into entity_code_sequences (type, dernier)
  values (p_type, 1)
  on conflict (type) do update set dernier = entity_code_sequences.dernier + 1
  returning dernier into v_seq;

  return format('%s-%s', fn_prefixe_entite(p_type), lpad(v_seq::text, 4, '0'));
end $$;

-- Aligne les compteurs sur l'existant : sans cela, la premiere generation
-- repartirait de 0001 et pourrait entrer en collision.
insert into entity_code_sequences (type, dernier)
select e.type, count(*)
  from entities e
 group by e.type
on conflict (type) do update set dernier = greatest(
  entity_code_sequences.dernier,
  excluded.dernier
);


-- -----------------------------------------------------------------------------
-- 2. Initiales et matricule — EF-CRO-02
-- -----------------------------------------------------------------------------

/**
 * Initiales du nom puis des prenoms, dans l'ordre de saisie, trois au plus.
 * Les accents sont replies sur leur lettre de base : un matricule se saisit au
 * clavier, parfois sur un poste sans disposition francaise.
 */
create or replace function fn_initiales(p_nom text, p_prenom text) returns text
language plpgsql immutable as $$
declare
  v_source text;
  v_mot    text;
  v_init   text := '';
begin
  v_source := coalesce(p_nom, '') || ' ' || coalesce(p_prenom, '');
  v_source := translate(
    v_source,
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'
  );

  for v_mot in
    select m
      from unnest(regexp_split_to_array(v_source, '[^A-Za-z]+')) as m
     where m <> ''
  loop
    v_init := v_init || upper(left(v_mot, 1));
    exit when char_length(v_init) >= 3;
  end loop;

  -- Un nom entierement non alphabetique reste possible : on ne laisse jamais
  -- le matricule sans prefixe.
  return coalesce(nullif(v_init, ''), 'XXX');
end $$;

/**
 * <INITIALES>-<SEQUENCE 5 chiffres>-<AA>, ex. MNK-00001-26.
 *
 * La sequence est GLOBALE par annee, non par jeu d'initiales : c'est elle qui
 * porte l'unicite. Deux homonymes obtiennent ainsi des numeros differents,
 * la ou une sequence par initiales les aurait fait entrer en collision.
 */
create or replace function fn_generer_matricule(p_nom text, p_prenom text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_annee text := to_char(current_date, 'YY');
  v_seq   integer;
begin
  insert into matricule_sequences (cle, dernier)
  values ('CROYANT:' || v_annee, 1)
  on conflict (cle) do update set dernier = matricule_sequences.dernier + 1
  returning dernier into v_seq;

  return format('%s-%s-%s', fn_initiales(p_nom, p_prenom), lpad(v_seq::text, 5, '0'), v_annee);
end $$;


-- -----------------------------------------------------------------------------
-- 3. Triggers : generer ce qui n'a pas ete fourni
-- -----------------------------------------------------------------------------

/**
 * `code` reste NOT NULL, mais un trigger BEFORE s'execute AVANT la verification
 * de cette contrainte : l'application peut donc omettre la colonne et laisser
 * la base attribuer le code. C'est ce qui garantit l'unicite face a deux
 * creations simultanees, qu'un compteur cote application ne pourrait pas tenir.
 */
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

  if tg_op = 'INSERT' and (new.code is null or btrim(new.code) = '') then
    new.code := fn_generer_code_entite(new.type);
  else
    new.code := upper(btrim(new.code));
  end if;

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

    if v_parent.niveau <> v_niveau - 1 then
      raise exception
        'RG-01 : un(e) % ne peut etre rattache(e) qu''a un(e) %, pas a un(e) %',
        new.type,
        (array['SIEGE','REGIONAL','DISTRICT','PAROISSE','EGLISE'])[v_niveau - 1],
        v_parent.type
        using errcode = 'check_violation';
    end if;

    if tg_op = 'UPDATE' and v_parent.path <@ fn_ltree_label(old.id) then
      raise exception 'RG-01 : rattachement impossible, cycle detecte'
        using errcode = 'check_violation';
    end if;

    new.path := v_parent.path || fn_ltree_label(new.id);
  end if;

  new.updated_at := now();
  return new;
end $$;

-- Le trigger doit desormais reagir aussi a un `code` absent a l'insertion.
drop trigger if exists trg_entities_biu on entities;
create trigger trg_entities_biu
  before insert or update of type, parent_id, code on entities
  for each row execute function fn_entities_before_write();


-- Le matricule se derive du nom, plus du code de l'eglise.
create or replace function fn_croyants_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_eglise entities%rowtype; v_cellule entities%rowtype;
begin
  select * into v_eglise from entities where id = new.eglise_id;
  if not found or v_eglise.type <> 'EGLISE' then
    raise exception 'RG-04 : le rattachement principal doit etre une Eglise'
      using errcode = 'check_violation';
  end if;

  if new.cellule_id is not null then
    select * into v_cellule from entities where id = new.cellule_id;
    if not found or v_cellule.type <> 'CELLULE' then
      raise exception 'RG-05 : la cellule indiquee n''est pas une Cellule de priere'
        using errcode = 'check_violation';
    end if;
    if v_cellule.parent_id is distinct from new.eglise_id then
      raise exception 'RG-05 : la cellule « % » n''appartient pas a l''eglise « % »',
        v_cellule.nom, v_eglise.nom
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.matricule := fn_generer_matricule(new.nom, new.prenom);
  else
    new.matricule := old.matricule;   -- RG-29
  end if;

  new.updated_at := now();
  return new;
end $$;

-- L'ancienne signature n'a plus d'appelant : la laisser exposerait deux
-- fonctions de meme nom aux intentions differentes.
drop function if exists fn_generer_matricule(text);
