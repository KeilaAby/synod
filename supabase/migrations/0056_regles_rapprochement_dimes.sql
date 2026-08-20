-- =============================================================================
-- SYNOD — 0056 — Les trois regles de rapprochement des dimes
-- =============================================================================
-- Reference : EF-FIN-34, EF-FIN-27, RG-33. Regles arretees le 20 aout 2026.
--
-- CE QUE L'IMPORT FAISAIT, ET CE QU'IL LUI MANQUAIT.
--
-- Il savait deja rattacher un nom reconnu, et laisser un nom inconnu dans la
-- file de rapprochement. Deux situations lui echappaient, et chacune coutait
-- un travail refait a la main :
--
--   1. UN NOM RECONNU QUI PRESENTE UN NUMERO NOUVEAU. Le versement gardait le
--      numero, mais le CROYANT ne le recevait pas : `dime_enveloppes` restait
--      muette. La collecte suivante reposait donc la meme question,
--      indefiniment — le numero n'apprenait jamais rien, et quelqu'un le
--      ressaisissait chaque mois.
--
--   2. UNE ENVELOPPE SANS NOM MAIS AVEC UN NUMERO. Elle etait classee anonyme
--      et sortait du champ. Or le numero DIT quelque chose — il a deja ete
--      porte, et par quelqu'un. La ligne etait perdue alors qu'une question
--      simple restait posable.
--
-- LES TROIS REGLES, telles qu'elles ont ete arretees :
--
--   A. NOM + PRENOM, SANS NUMERO
--      Reconnu -> rattache. Inconnu -> file des personnes non rattachees.
--      (Deja en place ; rien ne change.)
--
--   B. NOM + PRENOM, AVEC NUMERO
--      Reconnu et numero NOUVEAU -> rattache ET le numero lui est attribue.
--      Inconnu -> file des personnes non rattachees.
--
--   C. SANS NOM, AVEC NUMERO
--      -> la ligne entre dans la file, ou le dernier porteur du numero sera
--      propose. Numero inconnu -> elle reste une enveloppe sans nom.
--
-- CE QUI CHANGE DANS LA DOCTRINE — et c'est le point a ne pas manquer.
--
-- `0032` disait : « une ligne SANS nom n'entre pas dans la file : il n'y aurait
-- rien a rapprocher, et la file se remplirait de lignes qu'aucun travail ne
-- peut clore ». Le raisonnement etait juste TANT QU'IL N'Y AVAIT RIEN POUR
-- TRAVAILLER. Un numero d'enveloppe est precisement ce quelque chose : il a un
-- dernier porteur, la question se pose, elle se tranche.
--
-- La regle devient donc : une ligne sans nom entre dans la file SI ELLE PORTE
-- UN NUMERO, et elle seule. Une ligne sans nom ET sans numero reste dehors —
-- la, il n'y a toujours rien a rapprocher. La raison d'origine n'est pas
-- abandonnee : elle est bornee a ce qu'elle couvrait vraiment.
--
-- REJOUABLE (regle 23) : `create or replace function` sur des signatures
-- INCHANGEES, et l'attribution des numeros se conditionne d'elle-meme.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Attribuer un numero d'enveloppe a un croyant — regle B
-- -----------------------------------------------------------------------------

/**
 * Attribue `p_numero` a `p_croyant`, dans l'eglise DU CROYANT.
 *
 * TROIS REFUS, ET AUCUN N'EST UNE ERREUR — d'ou le `boolean` plutot qu'une
 * exception : l'appelant continue sa collecte, il n'a rien a rattraper.
 *
 *   - le numero est deja le sien -> il n'y a rien a faire ;
 *   - le numero appartient a QUELQU'UN D'AUTRE dans cette eglise -> on ne le
 *     prend pas. Deux personnes ne partagent pas un numero
 *     (`dime_enveloppes_unicite`), et le voler en silence attribuerait les
 *     dimes suivantes a la mauvaise personne ;
 *   - le croyant n'a pas d'eglise lisible -> il n'y a rien a quoi rattacher.
 *
 * L'EGLISE EST CELLE DU CROYANT, jamais l'entite collectrice : une ceremonie de
 * district reunit des donateurs de vingt eglises, et un numero appartient a une
 * eglise — `dime_enveloppes_unicite` porte sur le couple.
 *
 * L'ANCIEN NUMERO EST DESACTIVE, PAS SUPPRIME. Il figure sur des recus deja
 * remis, et `dime_enveloppe_active_idx` ne contraint que les actifs : l'effacer
 * rendrait illisible un papier que quelqu'un detient.
 *
 * SECURITY DEFINER : appelee par des fonctions elles-memes DEFINER, qui ont
 * deja verifie `finance.dime.collect` sur l'entite collectrice. Le reverifier
 * ici sur l'eglise du croyant refuserait une collecte de district legitime.
 */
create or replace function fn_attribuer_enveloppe(
  p_croyant uuid,
  p_numero  text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eglise  uuid;
  v_numero  text;
  v_proprio uuid;
begin
  v_numero := nullif(trim(coalesce(p_numero, '')), '');
  if p_croyant is null or v_numero is null then
    return false;
  end if;

  select eglise_id into v_eglise from croyants where id = p_croyant;
  if v_eglise is null then
    return false;
  end if;

  -- Qui detient deja ce numero dans cette eglise ?
  select croyant_id into v_proprio
    from dime_enveloppes
   where eglise_id = v_eglise
     and numero    = v_numero;

  -- Deja le sien : rien a faire, et surtout pas une seconde ligne.
  if v_proprio = p_croyant then
    return false;
  end if;

  -- A quelqu'un d'autre : on ne le prend pas. Le silence serait pire que le
  -- conflit — il attribuerait les dimes suivantes au mauvais nom.
  if v_proprio is not null then
    return false;
  end if;

  -- Le precedent numero cesse d'etre actif ; il reste en base pour les recus.
  update dime_enveloppes
     set is_active = false
   where eglise_id  = v_eglise
     and croyant_id = p_croyant
     and is_active;

  insert into dime_enveloppes (eglise_id, croyant_id, numero, is_active)
  values (v_eglise, p_croyant, v_numero, true);

  return true;
end $$;

comment on function fn_attribuer_enveloppe is
  'EF-FIN-27, regle B du rapprochement — attribue un numero d''enveloppe au '
  'croyant, dans SON eglise. Ne prend jamais un numero deja detenu par un '
  'autre : le conflit se tranche a l''ecran, pas en silence.';

revoke execute on function fn_attribuer_enveloppe from anon;


-- -----------------------------------------------------------------------------
-- La saisie d'une collecte applique les regles B et C
-- -----------------------------------------------------------------------------

/**
 * Identique a `0038` pour TOUT ce qui touche a l'argent — le total, le
 * rattachement au Siege (RG-33), le statut `SOUMIS` pose explicitement
 * (EF-FIN-30), les recus et leur description. Rien de cela ne change.
 *
 * DEUX AJOUTS, ET RIEN D'AUTRE :
 *   - regle B : un nom reconnu qui presente un numero se voit attribuer ce
 *     numero — `fn_attribuer_enveloppe` refuse d'elle-meme les conflits ;
 *   - regle C : une ligne sans nom mais AVEC un numero entre dans la file.
 *
 * POURQUOI `''` ET NON `null` POUR LE NOM D'UNE LIGNE SANS NOM.
 * `dime_rapprochements.nom_source` est `not null` depuis `0030`, et la rendre
 * nullable obligerait a reprendre toutes les lectures qui s'y fient. La chaine
 * vide dit exactement ce qui s'est passe — le fichier ne portait pas de nom —
 * et l'ecran la lit comme telle : « Enveloppe 1234, sans nom », pas un blanc.
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
  v_versement uuid;
  v_nom       text;
  v_prenom    text;
  v_libelle   text;
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

  /**
   * RG-33 : `entity_id` est le SIEGE, jamais l'eglise.
   *
   * `statut = 'SOUMIS'` est pose explicitement : une collecte est une ANNONCE
   * — « voici ce que nous avons recueilli » — et non un encaissement. C'est la
   * REMISE qui valide (EF-FIN-30).
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
    v_croyant   := nullif(v_ligne->>'croyant_id', '')::uuid;
    v_libelle   := nullif(trim(coalesce(v_ligne->>'nom_source', '')), '');
    v_enveloppe := nullif(trim(coalesce(v_ligne->>'enveloppe', '')), '');

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
      v_enveloppe,
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
        'enveloppe', v_enveloppe
      );
    end if;

    /**
     * REGLE B — un nom reconnu qui presente un numero le GARDE.
     *
     * Sans cela le numero restait sur le seul versement : la collecte suivante
     * reposait la meme question, et quelqu'un le ressaisissait chaque mois.
     */
    if v_croyant is not null and v_enveloppe is not null then
      perform fn_attribuer_enveloppe(v_croyant, v_enveloppe);
    end if;

    /**
     * REGLES A et C — ce qui reste a identifier entre dans la file.
     *
     * Un nom que rien ne reconnait (A), ou AUCUN nom mais un numero (C). Dans
     * les deux cas le montant compte deja — l'argent est recu — et ce qui
     * manque est une identite, que quelqu'un retrouvera dans `/croyants`.
     *
     * Une ligne sans nom ET sans numero reste dehors : il n'y aurait rien a
     * rapprocher, et la file se remplirait de lignes qu'aucun travail ne peut
     * clore. C'est la raison de `0032`, bornee a ce qu'elle couvrait vraiment.
     */
    if v_croyant is null and (v_libelle is not null or v_enveloppe is not null) then
      insert into dime_rapprochements (
        versement_id, entite_id, nom_source, prenom_source, enveloppe_source
      )
      values (
        v_versement,
        p_entite_collecte,
        -- `''` dit « le fichier ne portait pas de nom ». La colonne est
        -- `not null` depuis 0030 et l'ecran lit la chaine vide comme telle.
        coalesce(v_libelle, ''),
        nullif(trim(coalesce(v_ligne->>'prenom_source', '')), ''),
        v_enveloppe
      );
    end if;
  end loop;

  return query select v_entry, v_recus;
end $$;

revoke execute on function fn_saisir_collecte_dime from anon;


-- -----------------------------------------------------------------------------
-- La resolution applique elle aussi la regle B
-- -----------------------------------------------------------------------------

/**
 * Identique a `0032` — deux ecritures indissociables (regle 20), et le recu
 * emis au moment ou il y a quelqu'un a qui le remettre.
 *
 * UN SEUL AJOUT : le numero lu devient celui du croyant.
 *
 * Rapprocher une ligne, c'est reconnaitre la personne. Si la ligne portait un
 * numero, il est desormais le sien — exactement comme a l'import. Ne le faire
 * qu'a l'import laisserait ce meme numero reposer la meme question a la
 * collecte suivante, alors qu'on vient tout juste d'y repondre.
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

  select code into v_code from entities where id = v_entite;
  v_recu := fn_generer_recu_dime(v_code);

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
 * « fonction inconnue » sur du SQL pourtant en place — constate deux fois.
 */
notify pgrst, 'reload schema';
