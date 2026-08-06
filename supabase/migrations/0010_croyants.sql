-- =============================================================================
-- SYNOD — 0010 — Croyants
-- =============================================================================
-- Reference : plan.md §3.5 — EF-CRO-01 a 13
-- Regles : RG-04 (une seule eglise), RG-05 (cellule fille de l'eglise),
--          RG-06 (grade et nationalite au referentiel), RG-28 (coherence des
--          dates), RG-29 (matricule immuable)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sequence de matricules — EF-CRO-02.
-- Une sequence PAR EGLISE ET PAR ANNEE : le matricule reste lisible et parlant
-- (EGL-COT-2026-0147), la ou une sequence globale produirait des numeros sans
-- rapport avec l'entite.
-- -----------------------------------------------------------------------------
create table matricule_sequences (
  cle     text primary key,            -- '<CODE_EGLISE>:<ANNEE>'
  dernier integer not null default 0
);

create or replace function fn_generer_matricule(p_code_eglise text) returns text
language plpgsql as $$
declare v_cle text; v_seq integer;
begin
  v_cle := p_code_eglise || ':' || extract(year from current_date)::text;

  -- `on conflict do update` rend l'increment atomique : deux saisies
  -- simultanees dans la meme eglise ne peuvent pas obtenir le meme numero.
  insert into matricule_sequences (cle, dernier)
  values (v_cle, 1)
  on conflict (cle) do update set dernier = matricule_sequences.dernier + 1
  returning dernier into v_seq;

  return format('%s-%s-%s', p_code_eglise, extract(year from current_date),
                lpad(v_seq::text, 4, '0'));
end $$;


-- -----------------------------------------------------------------------------
-- Croyants
-- -----------------------------------------------------------------------------
create table croyants (
  id             uuid primary key default gen_random_uuid(),
  matricule      text not null unique,                    -- RG-29, immuable
  photo_key      text,                                    -- cle d'objet relative (ENF-POR-03)
  nom            text not null,
  prenom         text not null,
  sexe           sexe_type not null,
  statut_marital statut_marital,
  email          text,
  telephone      text,
  date_naissance date not null,
  date_bapteme   date not null,
  adresse        text not null,

  -- RG-04 : rattachement principal, obligatoire et unique
  eglise_id      uuid not null references entities(id) on delete restrict,
  -- RG-05 : facultatif, et necessairement fille de l'eglise ci-dessus
  cellule_id     uuid references entities(id) on delete set null,

  grade_id       uuid not null references grades(id)       on delete restrict,
  nationalite_id uuid not null references nationalites(id) on delete restrict,

  statut         statut_croyant not null default 'ACTIF',

  saisi_par      uuid references profiles(id) on delete set null,
  saisi_depuis   uuid references entities(id) on delete set null,

  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- RG-28
  constraint croyants_dates_coherentes check (date_bapteme >= date_naissance),
  constraint croyants_naissance_passee check (date_naissance <= current_date),
  constraint croyants_bapteme_passe    check (date_bapteme  <= current_date),
  constraint croyants_email_valide
    check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$')
);

comment on table croyants is 'Personne physique membre de l''organisation — EF-CRO-01';
comment on column croyants.matricule is 'RG-29 : immuable, y compris apres transfert';
comment on column croyants.photo_key is 'ENF-POR-03 : cle relative, jamais une URL signee';

-- EF-CRO-05 — recherche en texte libre tolerante aux fautes.
-- Colonne generee plutot qu'index sur expression : PostgREST peut ainsi la
-- filtrer directement (`ilike`), tout en s'appuyant sur l'index trigram.
alter table croyants
  add column recherche text
  generated always as (
    nom || ' ' || prenom || ' ' || matricule || ' ' ||
    coalesce(email, '') || ' ' || coalesce(telephone, '')
  ) stored;

create index croyants_recherche_trgm on croyants using gin (recherche gin_trgm_ops);
create index croyants_eglise_idx     on croyants (eglise_id)  where deleted_at is null;
create index croyants_cellule_idx    on croyants (cellule_id) where deleted_at is null;
create index croyants_statut_idx     on croyants (statut, sexe) where deleted_at is null;
create index croyants_bapteme_idx    on croyants (date_bapteme desc) where deleted_at is null;
create index croyants_nom_idx        on croyants (nom, prenom) where deleted_at is null;
-- EF-CRO-13 : detection de doublons a la creation
create index croyants_doublon_idx    on croyants (lower(nom), lower(prenom), date_naissance)
  where deleted_at is null;


-- -----------------------------------------------------------------------------
-- Coherence des rattachements et immuabilite du matricule.
-- -----------------------------------------------------------------------------
create or replace function fn_croyants_check() returns trigger
language plpgsql as $$
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
    new.matricule := fn_generer_matricule(v_eglise.code);
  else
    new.matricule := old.matricule;   -- RG-29
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger trg_croyants_biu
  before insert or update on croyants
  for each row execute function fn_croyants_check();


-- -----------------------------------------------------------------------------
-- EF-ADM-07 — un compte peut etre lie a une fiche croyant.
-- La contrainte n'a pu etre posee en 0005 : `croyants` n'existait pas encore.
-- -----------------------------------------------------------------------------
alter table profiles
  add constraint profiles_croyant_id_fkey
  foreign key (croyant_id) references croyants(id) on delete set null;


-- -----------------------------------------------------------------------------
-- RLS — RG-20 : un croyant n'est visible que depuis le perimetre de son eglise.
-- -----------------------------------------------------------------------------
alter table croyants enable row level security;

create policy croyants_select on croyants for select to authenticated
  using (entity_in_scope(eglise_id));

create policy croyants_insert on croyants for insert to authenticated
  with check (can('croyant.create', eglise_id));

create policy croyants_update on croyants for update to authenticated
  using      (can('croyant.update', eglise_id) or can('croyant.transfer', eglise_id))
  with check (entity_in_scope(eglise_id));

-- La suppression est LOGIQUE (deleted_at) : la suppression physique reste
-- reservee au Siege, pour la purge de corbeille (RG-22).
create policy croyants_delete on croyants for delete to authenticated
  using (is_superadmin());

-- Les sequences de matricules ne sont manipulees que par le trigger,
-- qui s'execute avec les droits du proprietaire de la table.
alter table matricule_sequences enable row level security;
create policy matricule_sequences_aucun_acces on matricule_sequences
  for all to authenticated using (false);
