-- =============================================================================
-- SYNOD — 0032 — L'import de versements ecrit ses rapprochements
-- =============================================================================
-- Reference : EF-FIN-34 — une ligne portant un nom sans correspondance est
--             conservee pour etre resolue dans `/croyants`.
--
-- POURQUOI LA MEME FONCTION, ET NON UNE SECONDE ECRITURE
--
-- Le rapprochement porte l'identifiant du VERSEMENT auquel il se rapporte, et
-- cet identifiant n'existe qu'une fois le versement ecrit. Le faire depuis
-- l'application demanderait de relire les versements pour les apparier — par
-- leur rang, ou par montant et enveloppe — deux appariements fragiles pour un
-- lien que la base peut poser sans hesiter.
--
-- Surtout, les deux sont INDISSOCIABLES (regle 20). Un versement anonyme dont
-- le rapprochement manquerait serait indistinguable d'une vraie enveloppe sans
-- nom : le nom lu dans le fichier serait perdu, et personne ne saurait qu'il a
-- existe. C'est un etat FAUX ET INDETECTABLE — donc une transaction.
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
    v_nom     := nullif(trim(coalesce(v_ligne->>'nom_source', '')), '');

    v_nature  := coalesce(
      nullif(v_ligne->>'nature', '')::nature_versement,
      case when v_croyant is null then 'EN_VRAC' else 'NOMINATIF' end
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
      v_recus := v_recus || jsonb_build_object(
        'croyant_id', v_ligne->>'croyant_id',
        'recu', v_recu
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
    if v_croyant is null and v_nom is not null then
      insert into dime_rapprochements (
        versement_id, entite_id, nom_source, prenom_source, enveloppe_source
      )
      values (
        v_versement,
        p_entite_collecte,
        v_nom,
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


/**
 * Resoudre un rapprochement : la ligne trouve enfin sa fiche.
 *
 * DEUX ECRITURES INDISSOCIABLES (regle 20) : le versement devient nominatif ET
 * le rapprochement se ferme. L'un sans l'autre laisserait soit un versement
 * attribue dont la file garde la trace comme non resolue, soit une file vide
 * pour un versement toujours anonyme.
 *
 * Le recu est emis A CE MOMENT : c'est maintenant qu'il y a quelqu'un a qui le
 * remettre.
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
  v_code      text;
  v_recu      text;
begin
  select r.entite_id, r.versement_id
    into v_entite, v_versement
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

  return v_recu;
end $$;

revoke execute on function fn_resoudre_rapprochement from anon;
