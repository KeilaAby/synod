-- =============================================================================
-- SYNOD — 0030 — Versements anonymes et rapprochement differe
-- =============================================================================
-- Reference : EF-FIN-33 (anonymes), EF-FIN-34 (import), EF-FIN-35 (historique)
--
-- CE QUE CETTE MIGRATION RECONNAIT
--
-- Toute dime n'a pas de nom. Une collecte reelle comprend :
--
--   - des enveloppes NOMINATIVES, rattachees a un croyant ;
--   - des enveloppes SANS NOM, numerotees mais non attribuees — quelqu'un a
--     oublie de s'inscrire, ou n'a pas voulu ;
--   - des especes EN VRAC, deposees dans l'urne sans enveloppe.
--
-- Les trois entrent dans le total. Seule la premiere ouvre un recu nominatif :
-- on ne remet pas un recu a personne.
--
-- REJOUABLE (regle 23).
-- =============================================================================


do $$ begin
  create type nature_versement as enum (
    'NOMINATIF',           -- une enveloppe, un croyant
    'ENVELOPPE_ANONYME',   -- une enveloppe numerotee, sans nom
    'EN_VRAC'              -- especes dans l'urne, sans enveloppe
  );
exception when duplicate_object then null;
end $$;

alter table dime_versements
  add column if not exists nature nature_versement not null default 'NOMINATIF';

/**
 * `croyant_id` DEVIENT NULLABLE, et c'est le coeur de cette migration.
 *
 * Un versement anonyme n'a personne a qui se rattacher. Le forcer aurait
 * conduit a inventer un croyant « Anonyme » — une fiche fictive qui
 * apparaitrait dans les effectifs, les statistiques par sexe, la repartition
 * par grade, et finirait par recevoir un transfert.
 */
alter table dime_versements
  alter column croyant_id drop not null;

/**
 * Le recu aussi devient facultatif.
 *
 * On ne remet pas de recu a une enveloppe sans nom : il n'y a personne pour le
 * recevoir. Le laisser obligatoire aurait fait consommer la sequence pour rien
 * et brouille la numerotation de ceux qui existent vraiment.
 */
alter table dime_versements
  alter column recu_numero drop not null;

-- La coherence des trois natures, dite une fois pour toutes.
alter table dime_versements
  drop constraint if exists dime_versements_nature_coherente;

alter table dime_versements
  add constraint dime_versements_nature_coherente check (
    (nature = 'NOMINATIF'         and croyant_id is not null)
    -- Une enveloppe anonyme porte un NUMERO : c'est ce qui la distingue du
    -- vrac, et ce qui permettra de la rattacher plus tard si son porteur se
    -- manifeste.
 or (nature = 'ENVELOPPE_ANONYME' and croyant_id is null and enveloppe_numero is not null)
 or (nature = 'EN_VRAC'           and croyant_id is null and enveloppe_numero is null)
  );

comment on column dime_versements.nature is
  'EF-FIN-33 : nominatif, enveloppe anonyme ou especes en vrac. Les trois '
  'entrent dans le total ; seul le nominatif ouvre un recu.';


-- -----------------------------------------------------------------------------
-- Les lignes d'import SANS correspondance — EF-FIN-34
-- -----------------------------------------------------------------------------

/**
 * POURQUOI UNE TABLE, ET NON UN REJET.
 *
 * A l'import d'une feuille de versements, un nom peut ne correspondre a aucune
 * fiche : le croyant n'est pas encore enregistre, ou son nom est ecrit
 * autrement. Refuser la ligne perdrait un ARGENT REELLEMENT RECU — l'enveloppe
 * est dans l'urne, elle ne disparaitra pas parce que le fichier est imparfait.
 *
 * On enregistre donc le versement (en anonyme, il compte dans le total) ET la
 * ligne du fichier, qui attend d'etre rapprochee dans `/croyants`. La collecte
 * est juste des le premier jour ; le nom se retrouve ensuite.
 */
create table if not exists dime_rapprochements (
  id               uuid primary key default gen_random_uuid(),
  versement_id     uuid not null references dime_versements(id) on delete cascade,
  entite_id        uuid not null references entities(id) on delete restrict,

  -- Ce que le fichier disait, conserve TEL QUEL : c'est la seule trace de ce
  -- qui a ete lu, et le rapprochement se fera contre elle.
  nom_source       text not null,
  prenom_source    text,
  enveloppe_source text,

  -- Rempli a la resolution : la fiche retenue, ou creee.
  croyant_id       uuid references croyants(id) on delete set null,
  resolu_le        timestamptz,
  resolu_par       uuid references profiles(id) on delete set null,

  created_at       timestamptz not null default now()
);

create index if not exists dime_rapprochements_attente_idx
  on dime_rapprochements (entite_id, created_at)
  where croyant_id is null;

alter table dime_rapprochements enable row level security;

drop policy if exists dime_rapprochements_select on dime_rapprochements;
create policy dime_rapprochements_select on dime_rapprochements for select to authenticated
  using (entity_in_scope(entite_id));

drop policy if exists dime_rapprochements_write on dime_rapprochements;
create policy dime_rapprochements_write on dime_rapprochements for all to authenticated
  using (can('finance.dime.collect', entite_id))
  with check (can('finance.dime.collect', entite_id));

comment on table dime_rapprochements is
  'EF-FIN-34 : ligne de fichier sans correspondance. Le versement est deja '
  'enregistre — l''argent est recu ; seul le NOM attend d''etre retrouve.';


-- -----------------------------------------------------------------------------
-- L'historique des versements d'un croyant — EF-FIN-35
-- -----------------------------------------------------------------------------

/**
 * Le numero d'enveloppe est deja RECOPIE sur chaque versement (0027) : un
 * changement d'enveloppe ne reecrit donc jamais le passe, et un recu remis il y
 * a deux ans reste retrouvable par son ancien numero.
 *
 * Cet index sert la lecture depuis la fiche du croyant : ses versements, du
 * plus recent au plus ancien, dimes comme autres collectes.
 */
create index if not exists dime_versements_historique_idx
  on dime_versements (croyant_id, created_at desc)
  where croyant_id is not null;


-- -----------------------------------------------------------------------------
-- La saisie, revue pour les trois natures — EF-FIN-33
-- -----------------------------------------------------------------------------

/**
 * `p_versements` porte desormais `nature` par ligne.
 *
 * LE RECU N'EST ATTRIBUE QU'AU NOMINATIF. On ne remet pas de recu a une
 * enveloppe sans nom : il n'y a personne pour le recevoir, et consommer la
 * sequence brouillerait la numerotation de ceux qui existent vraiment.
 *
 * Les trois natures entrent en revanche dans le TOTAL : l'argent est dans
 * l'urne, quelle que soit la facon dont il y est arrive.
 */
create or replace function fn_saisir_collecte_dime(
  p_entite_collecte uuid,
  p_categorie       uuid,
  p_date_operation  date,
  p_evenement       type_evenement_dime,
  p_libelle         text default null,
  p_reference       text default null,
  p_versements      jsonb default '[]'::jsonb
)
returns table (finance_entry_id uuid, recus jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siege     uuid := siege_id();
  v_code      text;
  v_profil    uuid := current_profile_id();
  v_total     numeric(14,2);
  v_entry     uuid;
  v_recus     jsonb := '[]'::jsonb;
  v_ligne     jsonb;
  v_recu      text;
  v_nature    nature_versement;
  v_croyant   uuid;
  v_sens      sens_finance;
begin
  if v_siege is null then
    raise exception 'Aucun Siege n''est defini : une dime ne peut pas etre rattachee.';
  end if;

  if not can('finance.dime.collect', p_entite_collecte) then
    raise exception 'Vous n''avez pas le droit de collecter les dimes de cette entite.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite_collecte;
  if v_code is null then
    raise exception 'Cette entite est introuvable.';
  end if;

  select sens into v_sens from finance_categories where id = p_categorie;
  if v_sens is distinct from 'RECETTE' then
    raise exception 'RG-13 : une collecte de dimes doit relever d''une categorie de recette.';
  end if;

  select coalesce(sum((l->>'montant')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_versements) as l;

  if v_total <= 0 then
    raise exception 'Le montant de la collecte doit etre superieur a zero.';
  end if;

  -- RG-33 : `entity_id` est le SIEGE, jamais l'eglise.
  insert into finance_entries (
    entity_id, categorie_id, montant, date_operation, libelle, reference,
    entite_collecte_id, dime_evenement, saisi_par, saisi_depuis_entity_id
  )
  values (
    v_siege, p_categorie, v_total, p_date_operation, p_libelle, p_reference,
    p_entite_collecte, p_evenement, v_profil, p_entite_collecte
  )
  returning id into v_entry;

  for v_ligne in select * from jsonb_array_elements(p_versements)
  loop
    v_croyant := nullif(v_ligne->>'croyant_id', '')::uuid;
    v_nature  := coalesce(
      nullif(v_ligne->>'nature', '')::nature_versement,
      case when v_croyant is null then 'EN_VRAC' else 'NOMINATIF' end
    );

    -- Le recu n'existe que pour un versement NOMINATIF.
    v_recu := case when v_nature = 'NOMINATIF' then fn_generer_recu_dime(v_code) end;

    insert into dime_versements (
      finance_entry_id, croyant_id, enveloppe_numero, montant, recu_numero, nature
    )
    values (
      v_entry,
      v_croyant,
      nullif(v_ligne->>'enveloppe', ''),
      (v_ligne->>'montant')::numeric,
      v_recu,
      v_nature
    );

    if v_recu is not null then
      v_recus := v_recus || jsonb_build_object(
        'croyant_id', v_ligne->>'croyant_id',
        'recu', v_recu
      );
    end if;
  end loop;

  return query select v_entry, v_recus;
end $$;

revoke execute on function fn_saisir_collecte_dime from anon;
