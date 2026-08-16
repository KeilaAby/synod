-- =============================================================================
-- SYNOD — 0036 — Le recu porte sa propre description
-- =============================================================================
-- Reference : EF-FIN-27.
--
-- LE DEFAUT
--
-- La fonction ne rendait que la reference du recu et un identifiant. Devant
-- dix recus, personne ne savait lequel allait sur quel talon — or c est
-- precisement ce qu on en fait : on les recopie, un par un, sur des
-- enveloppes posees devant soi.
--
-- Chaque recu porte desormais le NOM, le PRENOM et le NUMERO D ENVELOPPE.
-- Le nom vient de la FICHE, pas du fichier : c est celui qui figurera au
-- registre.
--
-- REJOUABLE (regle 23) : create or replace.
-- =============================================================================
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
  v_versement uuid;
  v_nom       text;
  v_prenom    text;
  v_libelle   text;
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
    v_libelle := nullif(trim(coalesce(v_ligne->>'nom_source', '')), '');

    /**
     * LES DEUX BRANCHES SONT TYPEES, et il le faut.
     *
     * `coalesce` exige des types compatibles : le premier argument est un
     * `nature_versement`, quand le `case` ne rendait que des litteraux non
     * types — donc du `text`. La conversion explicite du second terme leve
     * l'ambiguite.
     */
    v_nature  := coalesce(
      nullif(v_ligne->>'nature', '')::nature_versement,
      (case when v_croyant is null then 'EN_VRAC' else 'NOMINATIF' end)::nature_versement
    );

    -- Le recu n'existe que pour un versement NOMINATIF : on ne remet pas de
    -- recu a personne.
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
    )
    returning id into v_versement;

    if v_recu is not null then
      /**
       * LE RECU PORTE SA PROPRE DESCRIPTION.
       *
       * Il ne rendait que la reference et un identifiant : devant dix recus,
       * personne ne savait lequel allait sur quel talon. Or c'est precisement
       * ce qu'on en fait — on les recopie, un par un, sur des enveloppes
       * posees devant soi.
       *
       * Le nom vient de la fiche, pas du fichier : c'est celui qui figurera
       * sur le registre.
       */
      select c.nom, c.prenom into v_nom, v_prenom
        from croyants c where c.id = v_croyant;

      v_recus := v_recus || jsonb_build_object(
        'croyant_id', v_ligne->>'croyant_id',
        'recu', v_recu,
        'nom', v_nom,
        'prenom', v_prenom,
        'enveloppe', nullif(v_ligne->>'enveloppe', '')
      );
    end if;

    /**
     * EF-FIN-34 — la ligne PORTE UN NOM que rien ne reconnait.
     *
     * Le versement vient d'etre ecrit : le montant compte des maintenant,
     * l'argent est recu. Ce qui manque, c'est le NOM — et il attend dans
     * `/croyants` qu'on le retrouve.
     *
     * Une ligne SANS nom n'entre pas ici : il n'y aurait rien a rapprocher, et
     * la file se remplirait de lignes qu'aucun travail ne peut clore.
     */
    if v_croyant is null and v_libelle is not null then
      insert into dime_rapprochements (
        versement_id, entite_id, nom_source, prenom_source, enveloppe_source
      )
      values (
        v_versement,
        p_entite_collecte,
        v_libelle,
        nullif(trim(coalesce(v_ligne->>'prenom_source', '')), ''),
        nullif(v_ligne->>'enveloppe', '')
      );
    end if;
  end loop;

  return query select v_entry, v_recus;
end $$;

comment on function fn_saisir_collecte_dime is
  'EF-FIN-27/29/34 — collecte de dimes en UNE transaction. Le mouvement est '
  'rattache au SIEGE (RG-33) ; une ligne nommee mais non reconnue laisse un '
  'rapprochement a resoudre.';

revoke execute on function fn_saisir_collecte_dime from anon;

-- La signature ne change pas, mais le cache de PostgREST ne coute rien a
-- rafraichir — et son retard est le premier suspect a ecarter.
notify pgrst, 'reload schema';
