-- =============================================================================
-- SYNOD — 0027 — Dimes
-- =============================================================================
-- Reference : EF-FIN-27 a 31, RG-33 — conception dans plan.md §4.bis
--
-- LE POINT QUI COMMANDE TOUT LE RESTE
--
-- Une dime N'EST PAS une recette de l'eglise qui la collecte. Elle appartient
-- au SIEGE, a qui elle est remise en mains propres. Le mouvement financier
-- porte donc `entity_id = <Siege>` et JAMAIS l'eglise : sans cela,
-- `fn_finance_solde` compterait le meme argent deux fois — chez celui qui l'a
-- collecte et chez celui a qui il appartient, deux soldes plausibles et tous
-- deux faux.
--
-- Le lien avec le collecteur passe par `entite_collecte_id`, qui sert la
-- TRACABILITE et n'entre dans aucun calcul de solde.
--
-- REJOUABLE (regle 23) : `if not exists`, `create or replace`, et un
-- `drop ... if exists` avant chaque politique et chaque trigger.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Le contexte de collecte, sur le mouvement — EF-FIN-29, RG-33
-- -----------------------------------------------------------------------------

/**
 * `entite_collecte_id`, et non `eglise_collecte_id`.
 *
 * Une PAROISSE, un DISTRICT ou un REGIONAL peut collecter, lors d'un
 * rassemblement de son niveau (EF-FIN-30) : le nom initial aurait force a
 * ranger une collecte de district sous une eglise arbitraire, ou a laisser la
 * colonne vide — deux facons de perdre l'information.
 */
alter table finance_entries
  add column if not exists entite_collecte_id uuid references entities(id) on delete restrict;

comment on column finance_entries.entite_collecte_id is
  'RG-33 : l''entite qui a COLLECTE la dime. Le mouvement reste rattache au '
  'Siege par entity_id ; cette colonne sert la tracabilite, jamais le solde.';

do $$ begin
  create type type_evenement_dime as enum (
    'CULTE',                  -- le dimanche ordinaire, dans l'eglise
    'RASSEMBLEMENT_PAROISSE',
    'RASSEMBLEMENT_DISTRICT',
    'RASSEMBLEMENT_REGIONAL',
    'EVENEMENT_NATIONAL'      -- le Siege encaisse lui-meme, sans detail
  );
exception when duplicate_object then null;
end $$;

alter table finance_entries
  add column if not exists dime_evenement type_evenement_dime;

-- Retrouver « ce que mon eglise a collecte » sans parcourir toute la table.
create index if not exists finance_collecte_idx
  on finance_entries (entite_collecte_id, date_operation desc)
  where entite_collecte_id is not null;


/**
 * L'EGLISE DOIT VOIR CE QU'ELLE A COLLECTE — EF-FIN-31.
 *
 * La politique de lecture ne testait que `entity_in_scope(entity_id)`. Un
 * mouvement de dime etant rattache au SIEGE, il serait donc invisible a
 * l'eglise qui l'a collecte : elle ne pourrait pas repondre au croyant qui lui
 * demande la trace de sa dime, alors qu'elle lui en a remis le recu.
 */
drop policy if exists finance_entries_select on finance_entries;
create policy finance_entries_select on finance_entries for select to authenticated
  using (
       entity_in_scope(entity_id)
    or (entite_collecte_id is not null and entity_in_scope(entite_collecte_id))
  );


-- -----------------------------------------------------------------------------
-- Le mode de saisie, par eglise — EF-FIN-28
-- -----------------------------------------------------------------------------

/**
 * Comme `finance_validation_active` : propre a l'entite, AUCUN heritage.
 * Chaque bureau gere ses finances ; la hierarchie ne fait que les consulter.
 *
 *   null       -> defaut de l'organisation (detaille)
 *   DETAILLE   -> une ligne par croyant, avec enveloppe et recu
 *   GLOBAL     -> un seul montant pour la collecte
 */
do $$ begin
  create type mode_dime as enum ('DETAILLE', 'GLOBAL');
exception when duplicate_object then null;
end $$;

alter table entities
  add column if not exists dime_mode mode_dime;

comment on column entities.dime_mode is
  'EF-FIN-28 : mode de saisie des dimes, propre a l''entite. null = defaut de '
  'l''organisation. Aucun heritage depuis le parent.';


-- -----------------------------------------------------------------------------
-- L'enveloppe numerotee — EF-FIN-27
-- -----------------------------------------------------------------------------

/**
 * L'enveloppe APPARTIENT au croyant, dans une eglise donnee, et SURVIT aux
 * collectes : c'est son identite de donateur, pas un numero de transaction.
 */
create table if not exists dime_enveloppes (
  id         uuid primary key default gen_random_uuid(),
  eglise_id  uuid not null references entities(id) on delete restrict,
  croyant_id uuid not null references croyants(id) on delete restrict,
  numero     text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),

  -- Deux croyants ne partagent pas un numero dans la meme eglise.
  constraint dime_enveloppes_unicite unique (eglise_id, numero)
);

-- Un croyant n'a qu'une enveloppe ACTIVE par eglise : l'index partiel le dit
-- sans interdire de conserver les anciennes, qui figurent sur des recus remis.
create unique index if not exists dime_enveloppe_active_idx
  on dime_enveloppes (eglise_id, croyant_id)
  where is_active;

alter table dime_enveloppes enable row level security;

drop policy if exists dime_enveloppes_select on dime_enveloppes;
create policy dime_enveloppes_select on dime_enveloppes for select to authenticated
  using (entity_in_scope(eglise_id));

drop policy if exists dime_enveloppes_write on dime_enveloppes;
create policy dime_enveloppes_write on dime_enveloppes for all to authenticated
  using (can('finance.create', eglise_id))
  with check (can('finance.create', eglise_id));


-- -----------------------------------------------------------------------------
-- Le recu : une sequence PAR ENTITE ET PAR ANNEE — EF-FIN-27, regle 14
-- -----------------------------------------------------------------------------

create table if not exists dime_recu_sequences (
  cle     text primary key,          -- '<CODE_ENTITE>:<ANNEE>'
  dernier integer not null default 0
);

/**
 * Le numero de recu est attribue PAR LA BASE, jamais par le client (regle 14).
 *
 * Deux membres du bureau encaissent en meme temps, au fond de la meme salle :
 * seule la base peut garantir qu'ils n'obtiendront pas le meme numero.
 * `on conflict do update` rend l'increment atomique.
 */
create or replace function fn_generer_recu_dime(p_code_entite text) returns text
language plpgsql as $$
declare v_cle text; v_seq integer;
begin
  v_cle := p_code_entite || ':' || extract(year from current_date)::text;

  insert into dime_recu_sequences (cle, dernier)
  values (v_cle, 1)
  on conflict (cle) do update set dernier = dime_recu_sequences.dernier + 1
  returning dernier into v_seq;

  return format('DIM-%s-%s-%s', p_code_entite, extract(year from current_date),
                lpad(v_seq::text, 5, '0'));
end $$;


-- -----------------------------------------------------------------------------
-- Le versement individuel — EF-FIN-27
-- -----------------------------------------------------------------------------

/**
 * Le DETAIL d'une collecte. Le mouvement financier reste la piece comptable ;
 * ces lignes en expliquent la composition et portent les recus.
 */
create table if not exists dime_versements (
  id               uuid primary key default gen_random_uuid(),
  finance_entry_id uuid not null references finance_entries(id) on delete cascade,
  croyant_id       uuid not null references croyants(id) on delete restrict,

  /**
   * Le numero est RECOPIE, pas seulement reference.
   *
   * Un croyant peut changer d'enveloppe ; le recu remis il y a deux ans porte
   * l'ANCIEN numero, et c'est celui-la qui doit ressortir d'une recherche.
   */
  enveloppe_numero text,
  montant          numeric(14,2) not null check (montant > 0),
  recu_numero      text not null unique,
  created_at       timestamptz not null default now()
);

create index if not exists dime_versements_entry_idx
  on dime_versements (finance_entry_id);
create index if not exists dime_versements_croyant_idx
  on dime_versements (croyant_id, created_at desc);

alter table dime_versements enable row level security;

/**
 * La lecture suit celle du mouvement : l'eglise collectrice voit ses versements
 * (EF-FIN-31), le Siege les voit tous. On s'appuie sur la politique de
 * `finance_entries` plutot que de la reecrire — deux regles ecrites a deux
 * endroits divergent toujours.
 */
drop policy if exists dime_versements_select on dime_versements;
create policy dime_versements_select on dime_versements for select to authenticated
  using (
    exists (select 1 from finance_entries f where f.id = finance_entry_id)
  );

drop policy if exists dime_versements_write on dime_versements;
create policy dime_versements_write on dime_versements for all to authenticated
  using (
    exists (
      select 1 from finance_entries f
      where f.id = finance_entry_id
        and f.entite_collecte_id is not null
        and can('finance.create', f.entite_collecte_id)
    )
  )
  with check (
    exists (
      select 1 from finance_entries f
      where f.id = finance_entry_id
        and f.entite_collecte_id is not null
        and can('finance.create', f.entite_collecte_id)
    )
  );


-- -----------------------------------------------------------------------------
-- Le bordereau de remise — EF-FIN-30
-- -----------------------------------------------------------------------------

/**
 * La remise se fait EN MAINS PROPRES, portee par le tresorier principal de
 * l'eglise ou son adjoint. Les dimes d'un culte doivent parvenir au Siege au
 * plus tard dans la semaine suivante.
 *
 * Le regroupement de plusieurs cultes est possible mais mal vu : c'est un
 * retard, pas une organisation. Il n'est donc ni interdit ni encourage — le
 * bordereau DETAILLE la date de chaque culte dont il porte la collecte, ce qui
 * rend le retard visible au lieu de le noyer dans un total.
 */
create table if not exists dime_remises (
  id           uuid primary key default gen_random_uuid(),
  entite_id    uuid not null references entities(id) on delete restrict,  -- qui remet
  porteur_id   uuid references croyants(id) on delete set null,           -- tresorier ou adjoint
  date_remise  date not null default current_date,
  reference    text not null unique,
  observation  text,
  saisi_par    uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint dime_remises_date_passee check (date_remise <= current_date)
);

/**
 * Le lien remise <-> collectes. Une remise rassemble N mouvements de dime, et
 * un mouvement n'appartient qu'a une remise.
 *
 * `unique` sur `finance_entry_id` : remettre deux fois la meme collecte est
 * l'erreur qui ferait croire a un double encaissement.
 */
alter table finance_entries
  add column if not exists dime_remise_id uuid references dime_remises(id) on delete set null;

create index if not exists finance_remise_idx
  on finance_entries (dime_remise_id)
  where dime_remise_id is not null;

alter table dime_remises enable row level security;

drop policy if exists dime_remises_select on dime_remises;
create policy dime_remises_select on dime_remises for select to authenticated
  using (entity_in_scope(entite_id));

drop policy if exists dime_remises_write on dime_remises;
create policy dime_remises_write on dime_remises for all to authenticated
  using (can('finance.create', entite_id))
  with check (can('finance.create', entite_id));

create table if not exists dime_remise_sequences (
  cle     text primary key,
  dernier integer not null default 0
);

create or replace function fn_generer_bordereau(p_code_entite text) returns text
language plpgsql as $$
declare v_cle text; v_seq integer;
begin
  v_cle := p_code_entite || ':' || extract(year from current_date)::text;

  insert into dime_remise_sequences (cle, dernier)
  values (v_cle, 1)
  on conflict (cle) do update set dernier = dime_remise_sequences.dernier + 1
  returning dernier into v_seq;

  return format('BOR-%s-%s-%s', p_code_entite, extract(year from current_date),
                lpad(v_seq::text, 4, '0'));
end $$;
