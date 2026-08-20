-- =============================================================================
-- SYNOD — 0058 — L'eglise de rattachement lue dans le fichier
-- =============================================================================
-- Reference : EF-FIN-34, EF-CRO-01. Demande du 20 aout 2026.
--
-- LE PROBLEME QU'ELLE RESOUT.
--
-- Une ligne non rattachee finit dans la file des personnes non rattachees, et
-- s'y resout de trois facons : le numero propose, la recherche trouve, la
-- creation ouvre une fiche. Le troisieme chemin butait toujours au meme
-- endroit : L'EGLISE. Le formulaire s'ouvre amorce du nom lu, mais l'eglise se
-- choisit dans un selecteur de toute l'organisation — et celui qui saisit ne la
-- connait pas forcement.
--
-- L'eglise etait pourtant DANS LE FICHIER, la plupart du temps : c'est celui
-- qui a tenu la collecte qui l'a ecrite, et lui la connait. On la perdait en
-- route.
--
-- DEUX COLONNES, ET DEUX RAISONS DIFFERENTES.
--
--   `eglise_source` — CE QUE LE FICHIER DISAIT, tel quel. Meme role que
--   `nom_source` : c'est la seule trace de ce qui a ete lu, et elle vaut meme
--   quand rien ne la reconnait — « Ambohipo » suffit souvent a trancher a
--   l'oeil, la ou un champ vide ne dit rien.
--
--   `eglise_id` — L'ENTITE RECONNUE, ou `null`. Resolue A L'IMPORT, une fois,
--   contre les entites du perimetre de celui qui importe. La resoudre a
--   l'affichage la ferait dependre du lecteur : deux personnes ouvrant la meme
--   file verraient deux propositions differentes.
--
-- `null` N'EST PAS UN ECHEC. Un libelle inconnu — ou qui designe deux eglises —
-- laisse la ligne sans eglise, et le rapprochement se fait alors comme avant,
-- en la choisissant a la main. AUCUNE ENTITE N'EST CREEE pour un nom qu'on ne
-- reconnait pas : elle entrerait dans la structure, recevrait un code,
-- apparaitrait dans chaque selecteur et dans les soldes consolides, et
-- quelqu'un finirait par y transferer un vrai croyant. C'est la meme decision
-- que pour l'« eglise inconnue » refusee au lot des dimes.
--
-- `on delete set null` SUR L'ENTITE : supprimer une eglise ne doit pas
-- emporter une ligne d'argent recu. La proposition disparait, le montant reste.
--
-- REJOUABLE (regle 23) : `add column if not exists`, et la fonction est
-- remplacee sur une signature inchangee.
-- =============================================================================

alter table dime_rapprochements
  add column if not exists eglise_source text,
  add column if not exists eglise_id     uuid references entities(id) on delete set null;

comment on column dime_rapprochements.eglise_source is
  'EF-FIN-34 — l''eglise telle que le FICHIER l''ecrivait, conservee meme si '
  'rien ne la reconnait : elle suffit souvent a trancher a l''oeil.';

comment on column dime_rapprochements.eglise_id is
  'EF-FIN-34 — l''entite reconnue a l''import, ou NULL. Resolue une fois, cote '
  'serveur : la resoudre a l''affichage la ferait dependre du lecteur.';


-- -----------------------------------------------------------------------------
-- La saisie transporte l'eglise jusqu'a la file
-- -----------------------------------------------------------------------------

/**
 * Identique a `0057` — le total, le rattachement au Siege (RG-33), le statut
 * `SOUMIS`, le recu qui suit le nom lu, les regles A, B et C. Rien de cela ne
 * change.
 *
 * UN SEUL AJOUT : les deux colonnes d'eglise sont ecrites sur la ligne de
 * rapprochement. Elles ne servent qu'a la creation de fiche, et n'entrent dans
 * aucun solde — l'argent, lui, appartient toujours au Siege.
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
  v_prenom_lu text;
  v_enveloppe text;
  v_eglise_lu text;
  v_eglise    uuid;
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
    v_eglise_lu := nullif(trim(coalesce(v_ligne->>'eglise_source', '')), '');
    v_eglise    := nullif(v_ligne->>'eglise_id', '')::uuid;

    v_nature  := coalesce(
      nullif(v_ligne->>'nature', '')::nature_versement,
      (case when v_croyant is null then 'EN_VRAC' else 'NOMINATIF' end)::nature_versement
    );

    -- Le recu suit LE NOM, plus la fiche (0057). Sans nom du tout, rien :
    -- consommer la sequence brouillerait la numerotation de ceux qui existent.
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

    -- Regle B — un nom reconnu qui presente un numero le GARDE.
    if v_croyant is not null and v_enveloppe is not null then
      perform fn_attribuer_enveloppe(v_croyant, v_enveloppe);
    end if;

    /**
     * Regles A et C — ce qui reste a identifier entre dans la file, avec
     * l'eglise lue quand le fichier en portait une. Elle ne sert qu'a amorcer
     * la creation de fiche : aucun solde ne la lit.
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


/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, les deux colonnes
 * resteraient invisibles a l'API et la lecture de la file repondrait
 * « column ... does not exist » sur du SQL pourtant en place.
 */
notify pgrst, 'reload schema';
