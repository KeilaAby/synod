-- =============================================================================
-- SYNOD — 0057 — Un nom lu suffit pour un recu
-- =============================================================================
-- Reference : EF-FIN-29, EF-FIN-33, EF-FIN-34. Constate a l'essai du 20 aout
-- 2026, sur un fichier de cinq lignes.
--
-- LE DEFAUT.
--
-- Le recu n'etait emis que pour un versement NOMINATIF, c'est-a-dire rattache a
-- une FICHE. Un fichier portant « KABORE Windyam Francois » sans qu'aucune
-- fiche ne le reconnaisse donnait donc un versement compte, un rapprochement en
-- attente… et AUCUN TALON A REMETTRE.
--
-- Or la personne est devant soi. Elle a donne, on sait qui elle est, et ce qui
-- manque n'est pas son identite mais son ENREGISTREMENT — un travail qui nous
-- appartient, pas a elle. Lui refuser son recu le temps qu'on ouvre sa fiche
-- lui fait porter le delai de notre propre administration.
--
-- CE QUI CHANGE : le recu suit LE NOM, plus la fiche.
--
--   - un nom RECONNU        -> recu, comme avant ;
--   - un nom LU mais inconnu -> recu AUSSI, au nom lu dans le fichier ;
--   - aucun nom              -> toujours pas de recu. Il n'y a personne a qui
--                              le remettre, et consommer la sequence pour rien
--                              brouillerait la numerotation de ceux qui
--                              existent vraiment (raison de `0030`, intacte).
--
-- LA CONSEQUENCE A NE PAS MANQUER : LE RECU NE SE RENUMEROTE PAS.
--
-- `fn_resoudre_rapprochement` emettait un recu a la resolution — c'etait le
-- moment ou quelqu'un apparaissait. Maintenant qu'il existe deja pour les
-- lignes nommees, en emettre un second donnerait DEUX recus pour UN versement :
-- le donateur detiendrait un papier dont le numero ne serait plus celui de la
-- base, et deux references pointeraient le meme argent. La resolution CONSERVE
-- donc le numero existant, et n'en genere un que s'il n'y en avait aucun —
-- c'est-a-dire pour une enveloppe sans nom (regle C).
--
-- La nature, elle, ne bouge pas a l'import : une ligne non rattachee reste
-- ENVELOPPE_ANONYME ou EN_VRAC, parce que `dime_versements_nature_coherente`
-- exige une fiche pour NOMINATIF. Aucune contrainte ne lie le recu a la
-- nature — verifie avant d'ecrire cette migration.
--
-- REJOUABLE (regle 23) : `create or replace` sur des signatures inchangees.
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
  v_prenom_lu text;
  v_enveloppe text;
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

  -- RG-33 : `entity_id` est le SIEGE. `SOUMIS` : une collecte annonce sans
  -- encaisser, c'est la REMISE qui valide (EF-FIN-30).
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
    v_croyant   := nullif(v_ligne->>'croyant_id', '')::uuid;
    v_libelle   := nullif(trim(coalesce(v_ligne->>'nom_source', '')), '');
    v_prenom_lu := nullif(trim(coalesce(v_ligne->>'prenom_source', '')), '');
    v_enveloppe := nullif(trim(coalesce(v_ligne->>'enveloppe', '')), '');

    v_nature  := coalesce(
      nullif(v_ligne->>'nature', '')::nature_versement,
      (case when v_croyant is null then 'EN_VRAC' else 'NOMINATIF' end)::nature_versement
    );

    /**
     * LE RECU SUIT LE NOM, PLUS LA FICHE.
     *
     * Une fiche reconnue, ou un nom lu dans le fichier : dans les deux cas il y
     * a quelqu'un a qui remettre le talon. Sans nom du tout, en revanche,
     * toujours rien — consommer la sequence brouillerait la numerotation de
     * ceux qui existent vraiment.
     */
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
      /**
       * LE TALON PORTE LE NOM QU'ON A. Celui de la fiche quand elle existe,
       * celui du fichier sinon — c'est le meme papier, remis a la meme
       * personne. Le matricule reste absent tant qu'il n'y a pas de fiche : en
       * inventer un sur un document qui fait foi serait pire que son absence.
       */
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

    -- Regle B — un nom reconnu qui presente un numero le GARDE.
    if v_croyant is not null and v_enveloppe is not null then
      perform fn_attribuer_enveloppe(v_croyant, v_enveloppe);
    end if;

    -- Regles A et C — ce qui reste a identifier entre dans la file. Une ligne
    -- sans nom ET sans numero reste dehors : rien a rapprocher.
    if v_croyant is null and (v_libelle is not null or v_enveloppe is not null) then
      insert into dime_rapprochements (
        versement_id, entite_id, nom_source, prenom_source, enveloppe_source
      )
      values (
        v_versement, p_entite_collecte,
        coalesce(v_libelle, ''), v_prenom_lu, v_enveloppe
      );
    end if;
  end loop;

  return query select v_entry, v_recus;
end $$;

revoke execute on function fn_saisir_collecte_dime from anon;


/**
 * LA RESOLUTION NE RENUMEROTE JAMAIS UN RECU DEJA EMIS.
 *
 * C'est la contrepartie directe du changement ci-dessus. Une ligne nommee porte
 * desormais son recu des l'import ; en emettre un second a la resolution
 * donnerait DEUX references pour UN versement, et le papier detenu par le
 * donateur cesserait de correspondre a la base.
 *
 * On n'en genere donc un que s'il n'y en avait aucun — le cas d'une enveloppe
 * sans nom (regle C), ou personne n'etait identifiable avant ce geste.
 */
create or replace function fn_resoudre_rapprochement(
  p_rapprochement uuid,
  p_croyant       uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entite    uuid;
  v_versement uuid;
  v_enveloppe text;
  v_code      text;
  v_recu      text;
begin
  select r.entite_id, r.versement_id, r.enveloppe_source
    into v_entite, v_versement, v_enveloppe
    from dime_rapprochements r
   where r.id = p_rapprochement and r.croyant_id is null;

  if v_entite is null then
    raise exception 'Ce rapprochement est introuvable ou deja resolu.';
  end if;

  if not can('finance.dime.collect', v_entite) then
    raise exception 'Vous n''avez pas le droit de resoudre ce rapprochement.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Le recu deja emis fait foi : il est peut-etre deja entre les mains du
  -- donateur.
  select recu_numero into v_recu from dime_versements where id = v_versement;

  if v_recu is null then
    select code into v_code from entities where id = v_entite;
    v_recu := fn_generer_recu_dime(v_code);
  end if;

  update dime_versements
     set croyant_id  = p_croyant,
         nature      = 'NOMINATIF',
         recu_numero = v_recu
   where id = v_versement;

  update dime_rapprochements
     set croyant_id = p_croyant,
         resolu_le  = now(),
         resolu_par = current_profile_id()
   where id = p_rapprochement;

  -- Regle B : le numero lu devient le sien, s'il n'appartient a personne.
  if v_enveloppe is not null then
    perform fn_attribuer_enveloppe(p_croyant, v_enveloppe);
  end if;

  return v_recu;
end $$;

revoke execute on function fn_resoudre_rapprochement from anon;


/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, l'API repondrait
 * « fonction inconnue » sur du SQL pourtant en place.
 */
notify pgrst, 'reload schema';
