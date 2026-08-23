-- =============================================================================
-- SYNOD — 0074 — Référentiel des événements de collecte de dîmes
-- =============================================================================
-- Référence : EF-REF-01 à 04, EF-FIN-30, notes/todos.md §7.
--
-- LE PROBLÈME QU'ELLE RÉSOUD.
--
-- `type_evenement_dime` était un type énuméré PostgreSQL (migration `0027`), et
-- la liste des événements était figée dans le code TypeScript. Ajouter un
-- événement de collecte (ex: Culte d'action de grâce, Convention nationale)
-- exigeait une migration de schéma et une recompilation du code.
--
-- CE QUE CETTE MIGRATION APPORTE :
--
-- 1. Table `evenements_dime` (id, code, libellé, niveau_hote, ordre, is_active),
--    administrable depuis `/referentiels/evenements-dime` comme les grades,
--    fonctions, nationalités et catégories financières.
--
-- 2. `niveau_hote` (entity_type) : décide quelle entité peut héberger et
--    collecter chaque événement (ex: EGLISE pour un culte, DISTRICT pour un
--    rassemblement de district).
--
-- 3. `finance_entries.dime_evenement` est converti en TEXT avec clé étrangère
--    `references evenements_dime(code) on update cascade on delete restrict`.
--
-- 4. Remplacement de `fn_saisir_collecte_dime` : signature mise à jour avec
--    `p_evenement text` (drop préalable requis car le type du paramètre IN change).
--
-- REJOUABLE (règle 23) : `if not exists`, `on conflict do update`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table du référentiel
-- -----------------------------------------------------------------------------

create table if not exists evenements_dime (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  libelle     text not null,
  niveau_hote entity_type not null,
  ordre       smallint not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint evenements_dime_code_format check (code ~ '^[A-Z0-9_]+$')
);

comment on table evenements_dime is
  'EF-FIN-30 / EF-REF — Événements et rassemblements au cours desquels les dîmes sont collectées.';

comment on column evenements_dime.niveau_hote is
  'Niveau d''entité habilité à héberger et collecter cet événement (EGLISE, PAROISSE, DISTRICT, REGIONAL, SIEGE).';

comment on column evenements_dime.ordre is
  'Ordre d''affichage dans les sélecteurs de saisie de dîme.';

-- RLS
alter table evenements_dime enable row level security;

drop policy if exists evenements_dime_select on evenements_dime;
create policy evenements_dime_select on evenements_dime
  for select to authenticated
  using (true);

drop policy if exists evenements_dime_write on evenements_dime;
create policy evenements_dime_write on evenements_dime
  for all to authenticated
  using (has_perm('referentiel.manage'))
  with check (has_perm('referentiel.manage'));


-- -----------------------------------------------------------------------------
-- 2. Données initiales (reprise des valeurs de l'enum existant)
-- -----------------------------------------------------------------------------

insert into evenements_dime (code, libelle, niveau_hote, ordre, is_active)
values
  ('CULTE', 'Culte', 'EGLISE', 10, true),
  ('RASSEMBLEMENT_PAROISSE', 'Rassemblement de paroisse', 'PAROISSE', 20, true),
  ('RASSEMBLEMENT_DISTRICT', 'Rassemblement de district', 'DISTRICT', 30, true),
  ('RASSEMBLEMENT_REGIONAL', 'Rassemblement régional', 'REGIONAL', 40, true),
  ('EVENEMENT_NATIONAL', 'Événement national', 'SIEGE', 50, true)
on conflict (code) do update set
  libelle = excluded.libelle,
  niveau_hote = excluded.niveau_hote,
  ordre = excluded.ordre,
  is_active = excluded.is_active;


-- -----------------------------------------------------------------------------
-- 3. Conversion de finance_entries.dime_evenement vers text + foreign key
-- -----------------------------------------------------------------------------

alter table finance_entries
  alter column dime_evenement type text using dime_evenement::text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'finance_entries_dime_evenement_fkey'
  ) then
    alter table finance_entries
      add constraint finance_entries_dime_evenement_fkey
      foreign key (dime_evenement) references evenements_dime(code)
      on update cascade on delete restrict;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 4. Remplacement de la fonction fn_saisir_collecte_dime
-- -----------------------------------------------------------------------------

-- Drop préalable obligatoire car le type du paramètre p_evenement passe de
-- type_evenement_dime à text.
drop function if exists fn_saisir_collecte_dime(uuid, uuid, date, type_evenement_dime, text, text, jsonb);

create or replace function fn_saisir_collecte_dime(
  p_entite_collecte uuid,
  p_categorie       uuid,
  p_date_operation  date,
  p_evenement       text,
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
  v_siege       uuid := siege_id();
  v_code        text;
  v_profil      uuid := current_profile_id();
  v_total       numeric(14,2);
  v_entry       uuid;
  v_recus       jsonb := '[]'::jsonb;
  v_ligne       jsonb;
  v_recu        text;
  v_nature      nature_versement;
  v_croyant     uuid;
  v_versement   uuid;
  v_nom         text;
  v_prenom      text;
  v_libelle     text;
  v_prenom_lu   text;
  v_enveloppe   text;
  v_eglise_lu   text;
  v_eglise      uuid;
  v_sens        sens_finance;
  v_evenement   text;
begin
  if v_siege is null then
    raise exception 'Aucun Siège n''est défini : une dîme ne peut pas être rattachée.';
  end if;

  if not can('finance.dime.collect', p_entite_collecte) then
    raise exception 'Vous n''avez pas le droit de collecter les dîmes de cette entité.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite_collecte;
  if v_code is null then
    raise exception 'Cette entité est introuvable.';
  end if;

  select sens into v_sens from finance_categories where id = p_categorie;
  if v_sens is distinct from 'RECETTE' then
    raise exception 'RG-13 : une collecte de dîmes doit relever d''une catégorie de recette.';
  end if;

  -- Validation de l'événement contre le référentiel actif
  select code into v_evenement
    from evenements_dime
   where code = p_evenement and is_active = true;

  if v_evenement is null then
    raise exception 'Événement de dîme « % » inconnu ou inactif.', p_evenement;
  end if;

  select coalesce(sum((l->>'montant')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_versements) as l;

  if v_total <= 0 then
    raise exception 'Le montant de la collecte doit être supérieur à zéro.';
  end if;

  -- RG-33 : `entity_id` est le SIÈGE. `SOUMIS` : une collecte annonce sans
  -- encaisser, c'est la REMISE qui valide (EF-FIN-30).
  insert into finance_entries (
    entity_id, categorie_id, montant, date_operation, libelle, reference,
    entite_collecte_id, dime_evenement, statut, soumis_par, soumis_le,
    saisi_par, saisi_depuis_entity_id
  )
  values (
    v_siege, p_categorie, v_total, p_date_operation, p_libelle, p_reference,
    p_entite_collecte, v_evenement, 'SOUMIS', v_profil, now(),
    v_profil, p_entite_collecte
  )
  returning id into v_entry;

  for v_ligne in select * from jsonb_array_elements(p_versements)
  loop
    v_croyant   := nullif(v_ligne->>'croyant_id', '')::uuid;
    v_libelle   := nullif(trim(coalesce(v_ligne->>'nom_source', '')), '');
    v_prenom_lu := nullif(trim(coalesce(v_ligne->>'prenom_source', '')), '');
    v_enveloppe := nullif(trim(coalesce(v_ligne->>'enveloppe', '')), '');
    v_eglise_lu := nullif(trim(coalesce(v_ligne->>'eglise_source', '')), '');
    v_eglise    := nullif(v_ligne->>'eglise_id', '')::uuid;

    v_nature  := coalesce(
      nullif(v_ligne->>'nature', '')::nature_versement,
      (case when v_croyant is null then 'EN_VRAC' else 'NOMINATIF' end)::nature_versement
    );

    -- Le reçu suit LE NOM, plus la fiche (0057). Sans nom du tout, rien :
    -- consommer la séquence brouillerait la numérotation de ceux qui existent.
    v_recu := case
      when v_croyant is not null or v_libelle is not null
      then fn_generer_recu_dime(v_code)
    end;

    insert into dime_versements (
      finance_entry_id, croyant_id, enveloppe_numero, montant, recu_numero, nature
    )
    values (
      v_entry, v_croyant, v_enveloppe,
      (v_ligne->>'montant')::numeric, v_recu, v_nature
    )
    returning id into v_versement;

    if v_recu is not null then
      -- Le talon porte le nom qu'on a : celui de la fiche, ou celui du fichier.
      if v_croyant is not null then
        select c.nom, c.prenom into v_nom, v_prenom
          from croyants c where c.id = v_croyant;
      else
        v_nom    := v_libelle;
        v_prenom := v_prenom_lu;
      end if;

      v_recus := v_recus || jsonb_build_object(
        'croyant_id', v_ligne->>'croyant_id',
        'recu', v_recu,
        'nom', v_nom,
        'prenom', v_prenom,
        'enveloppe', v_enveloppe
      );
    end if;

    -- Règle B — un nom reconnu qui présente un numéro le GARDE.
    if v_croyant is not null and v_enveloppe is not null then
      perform fn_attribuer_enveloppe(v_croyant, v_enveloppe);
    end if;

    /**
     * Règles A et C — ce qui reste à identifier entre dans la file, avec
     * l'église lue quand le fichier en portait une. Elle ne sert qu'à amorcer
     * la création de fiche : aucun solde ne la lit.
     */
    if v_croyant is null and (v_libelle is not null or v_enveloppe is not null) then
      insert into dime_rapprochements (
        versement_id, entite_id, nom_source, prenom_source, enveloppe_source,
        eglise_source, eglise_id
      )
      values (
        v_versement, p_entite_collecte,
        coalesce(v_libelle, ''), v_prenom_lu, v_enveloppe,
        v_eglise_lu, v_eglise
      );
    end if;
  end loop;

  return query select v_entry, v_recus;
end $$;

revoke execute on function fn_saisir_collecte_dime from anon;


-- -----------------------------------------------------------------------------
-- 5. Mise à jour de fn_reordonner_referentiel pour evenements_dime
-- -----------------------------------------------------------------------------

create or replace function fn_reordonner_referentiel(p_table text, p_ids uuid[])
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_colonne text;
  v_touchees integer;
begin
  v_colonne := case p_table
    when 'grades'             then 'ordre'
    when 'finance_categories' then 'ordre'
    when 'fonctions'          then 'ordre_protocolaire'
    when 'evenements_dime'    then 'ordre'
    else null
  end;

  if v_colonne is null then
    raise exception 'Ce referentiel ne se reordonne pas : %', p_table
      using errcode = 'invalid_parameter_value';
  end if;

  execute format(
    'update %I t
        set %I = r.rang * 10
       from unnest($1) with ordinality as r(id, rang)
      where t.id = r.id',
    p_table, v_colonne
  ) using p_ids;

  get diagnostics v_touchees = row_count;
  return v_touchees;
end $$;

comment on function fn_reordonner_referentiel is
  'EF-REF-02 : pose l''ordre d''affichage d''un referentiel en UNE ecriture. '
  'SECURITY INVOKER — les politiques *_write exigent referentiel.manage. '
  'La liste blanche des tables doit rester alignee sur les entrees '
  'colonneOrdre de lib/domain/referentiels.ts.';

notify pgrst, 'reload schema';
