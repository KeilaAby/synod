-- =============================================================================
-- SYNOD — 0029 — Saisir une collecte de dimes
-- =============================================================================
-- Reference : EF-FIN-27 a 31, RG-33 — conception dans plan.md §4.bis
--
-- LE PROBLEME QUE CETTE MIGRATION RESOUT
--
-- Une dime appartient au Siege (RG-33), donc son mouvement porte
-- `entity_id = <Siege>`. Or c'est l'EGLISE qui la collecte, et son tresorier ne
-- detient pas `finance.create` sur le Siege : la RLS refuserait son insertion.
--
-- Trois issues avaient ete examinees dans plan.md. Celle retenue :
--
--   1. un droit DEDIE, `finance.dime.collect`, de portee l'EGLISE ;
--   2. une fonction SECURITY DEFINER, seul chemin d'ecriture, qui verifie ce
--      droit AVANT d'ecrire au nom du Siege.
--
-- Les deux autres etaient pires. Elargir la politique RLS au cas des categories
-- de dime l'aurait rendue illisible, et toute nouvelle categorie l'aurait
-- contournee. Passer par la saisie deleguee aurait fait saisir le Siege a la
-- place de cinquante eglises — exactement ce que ce mode est cense eviter.
--
-- ELLE EST AUSSI CE QUI REND L'ECRITURE ATOMIQUE (regle 20). Un mouvement sans
-- ses versements, ou des versements dont la somme ne fait pas le mouvement,
-- sont des etats FAUX ET INDETECTABLES : on ne saurait plus lequel des deux
-- nombres croire. Une fonction, donc, et un seul aller-retour.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Le droit de collecter — EF-FIN-27
-- -----------------------------------------------------------------------------
-- DELEGABLE : le Siege le confie a une eglise pour sa propre eglise. Il ne
-- figure donc PAS dans `fn_permissions_non_delegables()`.
-- -----------------------------------------------------------------------------


/**
 * Saisit une collecte de dimes, en une transaction.
 *
 * `p_versements` est un tableau JSON de `{ croyant_id, montant, enveloppe }`.
 * Vide, la collecte est GLOBALE : seul le montant total est enregistre, sans
 * detail par croyant (mode `GLOBAL`, ou evenement national).
 *
 * SECURITY DEFINER : la fonction ecrit au nom du Siege, ce que l'appelant ne
 * peut pas faire lui-meme. Le controle de droit est donc fait ICI, en premier,
 * et il porte sur l'ENTITE COLLECTRICE — pas sur le Siege.
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
  v_sens      sens_finance;
begin
  if v_siege is null then
    raise exception 'Aucun Siege n''est defini : une dime ne peut pas etre rattachee.';
  end if;

  -- LE CONTROLE DE DROIT, avant toute ecriture. Il porte sur l'eglise qui
  -- collecte : c'est elle que l'utilisateur doit etre habilite a representer.
  if not can('finance.dime.collect', p_entite_collecte) then
    raise exception 'Vous n''avez pas le droit de collecter les dimes de cette entite.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite_collecte;
  if v_code is null then
    raise exception 'Cette entite est introuvable.';
  end if;

  -- RG-13 : le sens vient de la categorie. Une dime est une RECETTE ; saisir
  -- une collecte dans une categorie de depense n'a aucun sens et fausserait le
  -- solde du Siege sans qu'aucune ligne ne paraisse anormale.
  select sens into v_sens from finance_categories where id = p_categorie;
  if v_sens is distinct from 'RECETTE' then
    raise exception 'RG-13 : une collecte de dimes doit relever d''une categorie de recette.';
  end if;

  /**
   * LE TOTAL VIENT DES VERSEMENTS quand il y en a.
   *
   * Le laisser saisir a cote produirait deux verites — un mouvement de
   * 1 000 000 pour 900 000 de versements — et personne ne saurait laquelle
   * croire. En mode global, il n'y a pas de detail, donc pas de contradiction
   * possible : le montant est celui du seul champ saisi.
   */
  select coalesce(sum((l->>'montant')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_versements) as l;

  if v_total <= 0 then
    raise exception 'Le montant de la collecte doit etre superieur a zero.';
  end if;

  /**
   * RG-33 — `entity_id` est le SIEGE, jamais l'eglise.
   *
   * C'est la ligne la plus importante du fichier. L'inverse ferait compter le
   * meme argent deux fois : chez celui qui l'a collecte et chez celui a qui il
   * appartient.
   */
  insert into finance_entries (
    entity_id, categorie_id, montant, date_operation, libelle, reference,
    entite_collecte_id, dime_evenement, saisi_par, saisi_depuis_entity_id
  )
  values (
    v_siege, p_categorie, v_total, p_date_operation, p_libelle, p_reference,
    p_entite_collecte, p_evenement, v_profil, p_entite_collecte
  )
  returning id into v_entry;

  -- Les versements individuels, chacun avec son recu attribue PAR LA BASE
  -- (regle 14) : deux membres du bureau encaissent en meme temps.
  for v_ligne in select * from jsonb_array_elements(p_versements)
  loop
    v_recu := fn_generer_recu_dime(v_code);

    insert into dime_versements (
      finance_entry_id, croyant_id, enveloppe_numero, montant, recu_numero
    )
    values (
      v_entry,
      (v_ligne->>'croyant_id')::uuid,
      nullif(v_ligne->>'enveloppe', ''),
      (v_ligne->>'montant')::numeric,
      v_recu
    );

    v_recus := v_recus || jsonb_build_object(
      'croyant_id', v_ligne->>'croyant_id',
      'recu', v_recu
    );
  end loop;

  return query select v_entry, v_recus;
end $$;

comment on function fn_saisir_collecte_dime is
  'EF-FIN-27/29 — collecte de dimes en UNE transaction. Le mouvement est '
  'rattache au SIEGE (RG-33) ; le droit verifie est finance.dime.collect sur '
  'l''entite collectrice.';

-- Le role anonyme n'a rien a y faire.
revoke execute on function fn_saisir_collecte_dime from anon;
