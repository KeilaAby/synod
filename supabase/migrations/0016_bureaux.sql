-- =============================================================================
-- SYNOD — 0016 — Bureaux et mandats
-- =============================================================================
-- Reference : plan.md §3.6 — EF-BUR-01 a 11
-- Regles : RG-07 (un membre est un croyant), RG-08 (une fonction, un titulaire),
--          RG-09 (le croyant appartient au sous-arbre), RG-10 (un seul bureau
--          actif par entite), RG-31 (membre de finances)
-- =============================================================================

create table bureaux (
  id         uuid primary key default gen_random_uuid(),
  entity_id  uuid not null references entities(id) on delete restrict,
  libelle    text not null,                 -- « Bureau District Avaradrano 2026-2029 »
  date_debut date not null,
  date_fin   date,
  is_active  boolean not null default true,
  deleted_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint bureaux_periode check (date_fin is null or date_fin > date_debut)
);

comment on table bureaux is 'Mandat d''un bureau d''entite — EF-BUR-01, EF-BUR-02';

-- RG-10 — au plus un bureau ACTIF par entite. L'index partiel dit la regle
-- mieux qu'un trigger : elle tient meme si l'application se trompe.
create unique index bureaux_un_seul_actif on bureaux (entity_id)
  where is_active and deleted_at is null;

create index bureaux_entity_idx on bureaux (entity_id, date_debut desc);


create table bureau_membres (
  id          uuid primary key default gen_random_uuid(),
  bureau_id   uuid not null references bureaux(id)   on delete cascade,
  -- RG-07 : un membre de bureau est TOUJOURS un croyant enregistre.
  -- `restrict` : on ne purge pas un croyant qui a exerce une fonction.
  croyant_id  uuid not null references croyants(id)  on delete restrict,
  fonction_id uuid not null references fonctions(id) on delete restrict,
  date_debut  date not null default current_date,
  date_fin    date,
  notes       text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint membres_periode check (date_fin is null or date_fin >= date_debut)
);

comment on table bureau_membres is
  'Mandat individuel au sein d''un bureau — EF-BUR-03, EF-BUR-08';

-- RG-08 — une fonction n'a qu'UN titulaire en cours. Les mandats clos
-- (`date_fin` renseignee) restent : c'est l'historique (EF-BUR-08).
create unique index membres_fonction_unique on bureau_membres (bureau_id, fonction_id)
  where date_fin is null;

-- Un croyant n'occupe pas deux fonctions dans le MEME bureau : il peut en
-- occuper dans deux bureaux distincts — tresorier de sa cellule et secretaire
-- de sa paroisse — ce que rien n'interdit ici.
create unique index membres_croyant_unique on bureau_membres (bureau_id, croyant_id)
  where date_fin is null;

create index membres_croyant_idx on bureau_membres (croyant_id);   -- EF-BUR-10


-- -----------------------------------------------------------------------------
-- RG-09 — le croyant appartient au sous-arbre de l'entite
-- -----------------------------------------------------------------------------

/**
 * SECURITY DEFINER : le trigger lit `entities` et `croyants`, toutes deux
 * verrouillees par RLS, et s'executerait sinon avec les droits de l'appelant —
 * qui peut legitimement ne pas voir l'entite d'origine d'un croyant.
 */
create or replace function fn_membre_dans_perimetre() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_path_entite  ltree;
  v_type         entity_type;
  v_path_croyant ltree;
  v_fonction     fonctions%rowtype;
  v_nom          text;
begin
  select e.path, e.type into v_path_entite, v_type
    from bureaux b
    join entities e on e.id = b.entity_id
   where b.id = new.bureau_id;

  if not found then
    raise exception 'Bureau introuvable' using errcode = 'foreign_key_violation';
  end if;

  select e.path, c.nom into v_path_croyant, v_nom
    from croyants c
    join entities e on e.id = c.eglise_id
   where c.id = new.croyant_id
     and c.deleted_at is null;

  if not found then
    raise exception 'RG-07 : le membre doit etre un croyant enregistre'
      using errcode = 'check_violation';
  end if;

  -- RG-09 — le bureau d'un district ne se compose que de croyants de ce
  -- district. Sans cette borne, une entite pourrait nommer n'importe qui.
  if not (v_path_croyant <@ v_path_entite) then
    raise exception 'RG-09 : « % » n''appartient pas au perimetre de cette entite', v_nom
      using errcode = 'check_violation';
  end if;

  select * into v_fonction from fonctions where id = new.fonction_id;
  if not found then
    raise exception 'Fonction introuvable' using errcode = 'foreign_key_violation';
  end if;

  -- EF-REF-03 — une fonction declare les niveaux ou elle a un sens : un
  -- « Directeur des finances » n'existe pas dans une cellule de priere.
  if not (v_type = any(v_fonction.niveaux_applicables)) then
    raise exception 'La fonction « % » ne s''applique pas au niveau %',
      v_fonction.libelle, v_type
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger trg_membre_perimetre
  before insert or update of bureau_id, croyant_id, fonction_id on bureau_membres
  for each row execute function fn_membre_dans_perimetre();


-- -----------------------------------------------------------------------------
-- EF-TRF-09 — un transfert effectif clot les mandats de l'entite d'origine
-- -----------------------------------------------------------------------------

/**
 * Le point d'insertion avait ete laisse en commentaire dans la migration 0014,
 * `bureau_membres` n'existant pas encore. La fonction est reecrite ici, entiere,
 * plutot que corrigee par un patch : deux versions d'une meme fonction dans
 * deux migrations rendent illisible ce qui s'execute reellement.
 */
create or replace function fn_appliquer_transfert(p_transfert uuid)
returns transferts
language plpgsql
security definer
set search_path = public
as $$
declare
  t transferts%rowtype;
  v_clos integer := 0;
begin
  select * into t from transferts where id = p_transfert for update;

  if not found then
    raise exception 'Transfert introuvable' using errcode = 'no_data_found';
  end if;

  if t.statut <> 'APPROUVE' then
    raise exception 'RG-11 : un transfert ne s''applique qu''une fois approuve (etat actuel : %)', t.statut
      using errcode = 'check_violation';
  end if;

  if not can('transfer.approve', t.ancetre_commun_id) then
    raise exception 'RG-12 : votre perimetre ne couvre pas ce transfert'
      using errcode = 'insufficient_privilege';
  end if;

  update croyants
     set eglise_id  = t.to_eglise_id,
         cellule_id = t.to_cellule_id
   where id = t.croyant_id;

  /**
   * EF-TRF-09 — les mandats detenus dans le sous-arbre d'ORIGINE se cloturent.
   *
   * Le critere porte sur le CHEMIN, pas sur l'eglise : un croyant transfere
   * peut sieger au bureau de sa paroisse ou de son district, et ces mandats
   * cessent aussi. On ne clot en revanche QUE ceux que la destination ne
   * couvre pas — un transfert entre deux eglises d'une meme paroisse ne
   * demet personne du bureau de cette paroisse.
   */
  with origine as (
    select path from entities where id = t.from_eglise_id
  ),
  destination as (
    select path from entities where id = t.to_eglise_id
  )
  update bureau_membres m
     set date_fin = current_date
    from bureaux b, entities e, origine o, destination d
   where m.bureau_id = b.id
     and b.entity_id = e.id
     and m.croyant_id = t.croyant_id
     and m.date_fin is null
     and o.path <@ e.path          -- le bureau couvre l'origine
     and not (d.path <@ e.path);   -- mais pas la destination

  get diagnostics v_clos = row_count;

  update transferts
     set statut     = 'EFFECTUE',
         date_effet = current_date
   where id = t.id
  returning * into t;

  if v_clos > 0 then
    raise notice 'EF-TRF-09 : % mandat(s) clos a l''origine', v_clos;
  end if;

  return t;
end $$;

comment on function fn_appliquer_transfert(uuid) is
  'Deplace le croyant, clot ses mandats d''origine et clot le transfert — RG-11, RG-12, EF-TRF-09.';


-- -----------------------------------------------------------------------------
-- RLS — le bureau se lit dans son perimetre, se gere avec le droit dedie
-- -----------------------------------------------------------------------------

alter table bureaux        enable row level security;
alter table bureau_membres enable row level security;

create policy bureaux_select on bureaux for select to authenticated
  using (entity_in_scope(entity_id));

create policy bureaux_insert on bureaux for insert to authenticated
  with check (can('bureau.manage', entity_id));

create policy bureaux_update on bureaux for update to authenticated
  using (can('bureau.manage', entity_id))
  with check (entity_in_scope(entity_id));

create policy bureaux_delete on bureaux for delete to authenticated
  using (is_superadmin());

-- Un membre se voit, et se gere, exactement comme son bureau. La politique
-- interroge `bureaux` plutot que de recopier sa regle de perimetre : deux
-- ecritures d'une meme regle finissent toujours par diverger.
create policy membres_select on bureau_membres for select to authenticated
  using (
    exists (select 1 from bureaux b where b.id = bureau_membres.bureau_id)
  );

create policy membres_insert on bureau_membres for insert to authenticated
  with check (
    exists (
      select 1 from bureaux b
       where b.id = bureau_membres.bureau_id
         and can('bureau.manage', b.entity_id)
    )
  );

create policy membres_update on bureau_membres for update to authenticated
  using (
    exists (
      select 1 from bureaux b
       where b.id = bureau_membres.bureau_id
         and can('bureau.manage', b.entity_id)
    )
  );

create policy membres_delete on bureau_membres for delete to authenticated
  using (
    exists (
      select 1 from bureaux b
       where b.id = bureau_membres.bureau_id
         and can('bureau.manage', b.entity_id)
    )
  );
