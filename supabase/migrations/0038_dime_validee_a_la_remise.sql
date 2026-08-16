-- =============================================================================
-- SYNOD — 0038 — La dime n'alimente le Siege qu'une fois RECUE
-- =============================================================================
-- Reference : EF-FIN-30 — « Elle n'alimente le solde du Siege qu'une fois
--             RECUE : la remise physique est ce que constate la validation. »
--
-- CE QUI N'ALLAIT PAS
--
-- La collecte creait un mouvement dont le statut etait laisse au workflow du
-- SIEGE. Deux consequences, opposees et toutes deux fausses :
--
--   - workflow du Siege ACTIF : la collecte restait en brouillon, et le solde
--     du Siege ne bougeait jamais — meme apres la remise. C'est ce qui a ete
--     constate ;
--   - workflow du Siege INACTIF : elle comptait AUSSITOT, avant meme que
--     l'argent ait quitte l'eglise. Le Siege aurait vu une recette pour des
--     billets encore dans une urne a quarante kilometres.
--
-- Le second cas est le plus grave, parce qu'il ne se voit pas.
--
-- CE QUE DIT LA REALITE, ET DESORMAIS LE CODE
--
-- Une collecte est une ANNONCE : « voici ce que nous avons recueilli ». Elle
-- nait donc SOUMISE. La remise en mains propres est ce qui la rend vraie —
-- c'est elle, et elle seule, qui VALIDE le mouvement.
--
-- RG-18 fait alors exactement ce qu'il faut : tant que la remise n'a pas eu
-- lieu, la dime ne compte au solde de personne. Et l'ecart entre le collecte et
-- le recu devient l'indicateur qu'un tresorier veut voir.
--
-- REJOUABLE (regle 23) : `create or replace`.
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

  /**
   * RG-33 : `entity_id` est le SIEGE, jamais l'eglise.
   *
   * `statut = 'SOUMIS'` est POSE ICI, et c'est le coeur de cette migration.
   * Une collecte est une ANNONCE — « voici ce que nous avons recueilli » — et
   * non un encaissement. La laisser au workflow du Siege la faisait soit
   * dormir en brouillon pour toujours, soit compter avant que l'argent ait
   * quitte l'eglise. Le trigger respecte un statut explicite.
   */
  insert into finance_entries (
    entity_id, categorie_id, montant, date_operation, libelle, reference,
    entite_collecte_id, dime_evenement, statut, soumis_par, soumis_le,
    saisi_par, saisi_depuis_entity_id
  )
  values (
    v_siege, p_categorie, v_total, p_date_operation, p_libelle, p_reference,
    p_entite_collecte, p_evenement, 'SOUMIS', v_profil, now(),
    v_profil, p_entite_collecte
  )
  returning id into v_entry;

  for v_ligne in select * from jsonb_array_elements(p_versements)
  loop
    v_croyant := nullif(v_ligne->>'croyant_id', '')::uuid;
    v_libelle := nullif(trim(coalesce(v_ligne->>'nom_source', '')), '');

    -- `coalesce` exige des types compatibles : les deux branches sont typees.
    v_nature  := coalesce(
      nullif(v_ligne->>'nature', '')::nature_versement,
      (case when v_croyant is null then 'EN_VRAC' else 'NOMINATIF' end)::nature_versement
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
    )
    returning id into v_versement;

    if v_recu is not null then
      -- Le recu porte sa propre description : nom, prenom, enveloppe.
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

    -- EF-FIN-34 — la ligne porte un nom que rien ne reconnait.
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

revoke execute on function fn_saisir_collecte_dime from anon;


-- -----------------------------------------------------------------------------
-- La remise VALIDE les collectes : c'est elle qui alimente le Siege
-- -----------------------------------------------------------------------------

create or replace function fn_remettre_collectes(
  p_entite      uuid,
  p_collectes   uuid[],
  p_porteur     uuid default null,
  p_date_remise date default current_date,
  p_observation text default null
)
returns table (remise_id uuid, reference text, collectes integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code      text;
  v_reference text;
  v_remise    uuid;
  v_nombre    integer;
  v_profil    uuid := current_profile_id();
begin
  if not can('finance.dime.collect', p_entite) then
    raise exception 'Vous n''avez pas le droit de remettre les dimes de cette entite.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite;
  if v_code is null then
    raise exception 'Cette entite est introuvable.';
  end if;

  v_reference := fn_generer_bordereau(v_code);

  insert into dime_remises (
    entite_id, porteur_id, date_remise, reference, observation, saisi_par
  )
  values (
    p_entite, p_porteur, p_date_remise, v_reference, p_observation, v_profil
  )
  returning id into v_remise;

  /**
   * LA REMISE VALIDE — EF-FIN-30, RG-18.
   *
   * C'est ici, et nulle part ailleurs, que la dime entre au solde du Siege :
   * la remise physique est ce que constate la validation.
   *
   * `statut <> 'VALIDE'` protege les collectes anterieures a cette migration,
   * creees deja validees : RG-17 refuse toute ecriture sur un mouvement valide,
   * et les inclure ferait echouer le bordereau entier.
   *
   * `dime_remise_id is null` n'est pas une precaution de style : deux
   * utilisateurs peuvent preparer le meme bordereau en meme temps, et
   * rattacher une collecte deja remise la ferait compter DEUX FOIS.
   */
  update finance_entries f
     set dime_remise_id = v_remise,
         statut         = 'VALIDE',
         valide_par     = v_profil
   where f.id = any (p_collectes)
     and f.entite_collecte_id = p_entite
     and f.dime_remise_id is null
     and f.deleted_at is null
     and f.statut <> 'VALIDE';

  /**
   * Les collectes DEJA VALIDES sont rattachees a part, sans toucher au statut.
   *
   * Elles datent d'avant cette migration. RG-17 refuse toute ecriture sur un
   * mouvement valide — les inclure ci-dessus ferait echouer le bordereau
   * entier —, mais il doit tout de meme les porter : sans cela, elles
   * resteraient eternellement « a remettre » alors qu'elles ont ete portees.
   */
  update finance_entries f
     set dime_remise_id = v_remise
   where f.id = any (p_collectes)
     and f.entite_collecte_id = p_entite
     and f.dime_remise_id is null
     and f.deleted_at is null
     and f.statut = 'VALIDE';

  -- Le compte se LIT une fois tout rattache : additionner deux `row_count`
  -- oblige a se demander lequel a deja ete consomme.
  select count(*)::integer into v_nombre
    from finance_entries f where f.dime_remise_id = v_remise;

  if v_nombre = 0 then
    raise exception
      'Aucune de ces collectes n''est a remettre : elles ont deja ete portees au Siege.';
  end if;

  return query select v_remise, v_reference, v_nombre;
end $$;

revoke execute on function fn_remettre_collectes from anon;

notify pgrst, 'reload schema';
