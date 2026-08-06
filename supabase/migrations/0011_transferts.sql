-- =============================================================================
-- SYNOD — 0011 — Transferts et workflow d'approbation
-- =============================================================================
-- Reference : plan.md §3.8 — EF-TRF-01 a 11, ARB-4
-- Regles : RG-11 (aucun transfert applique sans approbation),
--          RG-12 (l'approbateur couvre origine ET destination)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RG-12 — plus petit ancetre commun de deux entites.
--
-- C'est lui qui borne l'ensemble des approbateurs competents : seul un compte
-- dont le perimetre couvre a la fois l'origine et la destination peut arbitrer
-- un transfert. Sans cette borne, un district pourrait « aspirer » les croyants
-- d'un autre district.
-- -----------------------------------------------------------------------------
create or replace function fn_ancetre_commun(a uuid, b uuid) returns uuid
language sql stable as $$
  select e.id
    from entities e,
         (select path from entities where id = a) pa,
         (select path from entities where id = b) pb
   where pa.path <@ e.path
     and pb.path <@ e.path
     and e.deleted_at is null
   order by nlevel(e.path) desc     -- le plus PROCHE des deux, pas la racine
   limit 1
$$;


create table transferts (
  id               uuid primary key default gen_random_uuid(),
  croyant_id       uuid not null references croyants(id) on delete cascade,

  -- Niveau auquel le changement s'opere : sert a l'affichage et aux filtres.
  niveau_transfert entity_type not null,

  from_eglise_id   uuid references entities(id) on delete set null,
  to_eglise_id     uuid not null references entities(id) on delete restrict,
  from_cellule_id  uuid references entities(id) on delete set null,
  to_cellule_id    uuid references entities(id) on delete set null,

  statut         statut_transfert not null default 'DEMANDE',
  motif          text,
  motif_refus    text,

  date_demande   timestamptz not null default now(),
  demande_par    uuid references profiles(id) on delete set null,
  date_decision  timestamptz,
  decide_par     uuid references profiles(id) on delete set null,
  date_effet     date,

  -- Fige a la demande : si la structure evolue ensuite, l'approbateur
  -- competent reste celui qui l'etait au moment ou le transfert a ete demande.
  ancetre_commun_id uuid references entities(id) on delete set null,

  created_at timestamptz not null default now(),

  constraint transfert_refus_motive
    check (statut <> 'REFUSE' or motif_refus is not null),
  constraint transfert_effet_date
    check (statut <> 'EFFECTUE' or date_effet is not null),
  constraint transfert_destination_differente
    check (from_eglise_id is distinct from to_eglise_id
        or from_cellule_id is distinct from to_cellule_id)
);

comment on table transferts is
  'Workflow d''approbation des transferts — ARB-4, RG-11, RG-12';
comment on column transferts.ancetre_commun_id is
  'RG-12 : borne les approbateurs competents. Fige a la demande.';

create index transferts_croyant_idx on transferts (croyant_id, date_demande desc);
create index transferts_attente_idx on transferts (ancetre_commun_id)
  where statut = 'DEMANDE';
create index transferts_periode_idx on transferts (date_demande desc);


-- -----------------------------------------------------------------------------
-- Transitions autorisees — RG-11.
-- Un transfert DEMANDE ou REFUSE ne modifie AUCUNE donnee du croyant : seul le
-- passage a EFFECTUE, opere par la Server Action dans une transaction unique,
-- applique le changement.
-- -----------------------------------------------------------------------------
create or replace function fn_transfert_transitions() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.statut <> 'DEMANDE' then
      raise exception 'RG-11 : un transfert nait toujours a l''etat « demande »'
        using errcode = 'check_violation';
    end if;
    new.ancetre_commun_id :=
      fn_ancetre_commun(coalesce(new.from_eglise_id, new.to_eglise_id), new.to_eglise_id);
    return new;
  end if;

  if old.statut is distinct from new.statut then
    if not (
         (old.statut = 'DEMANDE'  and new.statut in ('APPROUVE', 'REFUSE', 'ANNULE'))
      or (old.statut = 'APPROUVE' and new.statut in ('EFFECTUE', 'ANNULE'))
    ) then
      raise exception 'Transition de statut interdite : % → %', old.statut, new.statut
        using errcode = 'check_violation';
    end if;

    if new.statut in ('APPROUVE', 'REFUSE') then
      new.date_decision := now();
    end if;
  end if;

  -- L'ancetre commun ne se recalcule jamais : il fige la competence.
  new.ancetre_commun_id := old.ancetre_commun_id;
  return new;
end $$;

create trigger trg_transfert_transitions
  before insert or update on transferts
  for each row execute function fn_transfert_transitions();


-- -----------------------------------------------------------------------------
-- RLS — le demandeur voit son transfert, l'approbateur competent le decide.
-- -----------------------------------------------------------------------------
alter table transferts enable row level security;

-- Visible depuis l'un OU l'autre cote : les deux entites sont concernees.
create policy transferts_select on transferts for select to authenticated
  using (
       (from_eglise_id is not null and entity_in_scope(from_eglise_id))
    or entity_in_scope(to_eglise_id)
  );

create policy transferts_insert on transferts for insert to authenticated
  with check (
    can('croyant.transfer', coalesce(from_eglise_id, to_eglise_id))
    and statut = 'DEMANDE'
  );

-- RG-12 : seul un approbateur dont le perimetre couvre l'ancetre commun decide.
create policy transferts_update on transferts for update to authenticated
  using (
       can('transfer.approve', ancetre_commun_id)
    -- EF-TRF-10 : le demandeur peut retirer sa propre demande tant qu'elle
    -- n'est pas tranchee.
    or (statut = 'DEMANDE' and demande_par = current_profile_id())
  )
  with check (
       can('transfer.approve', ancetre_commun_id)
    or (statut = 'ANNULE' and demande_par = current_profile_id())
  );

create policy transferts_delete on transferts for delete to authenticated
  using (is_superadmin());


-- -----------------------------------------------------------------------------
-- Baptemes — EF-BAP-01 a 07.
-- `croyants.date_bapteme` reste la source de verite des indicateurs ; cette
-- table porte les informations de ceremonie, qui n'ont pas leur place sur la
-- fiche du croyant.
-- -----------------------------------------------------------------------------
create table baptemes (
  id              uuid primary key default gen_random_uuid(),
  croyant_id      uuid not null unique references croyants(id) on delete cascade,
  entity_id       uuid not null references entities(id) on delete restrict,
  date_bapteme    date not null,
  lieu            text,
  celebrant_id    uuid references croyants(id) on delete set null,
  session_libelle text,
  saisi_par       uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index baptemes_date_idx   on baptemes (date_bapteme desc);
create index baptemes_entity_idx on baptemes (entity_id, date_bapteme desc);

alter table baptemes enable row level security;

create policy baptemes_select on baptemes for select to authenticated
  using (entity_in_scope(entity_id));

create policy baptemes_insert on baptemes for insert to authenticated
  with check (can('bapteme.create', entity_id));

create policy baptemes_update on baptemes for update to authenticated
  using (can('bapteme.create', entity_id)) with check (entity_in_scope(entity_id));

create policy baptemes_delete on baptemes for delete to authenticated
  using (is_superadmin());
