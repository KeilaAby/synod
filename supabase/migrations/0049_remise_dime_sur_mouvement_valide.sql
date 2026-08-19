-- =============================================================================
-- SYNOD — 0049 — Rattacher un bordereau n'est pas modifier le mouvement
-- =============================================================================
-- Reference : RG-17 (un mouvement valide est immuable), EF-FIN-30 (la remise
--             physique est ce que constate la validation).
--
-- CE QUI N'ALLAIT PAS, ET POURQUOI PERSONNE NE POUVAIT LE VOIR EN LISANT LE SQL
--
-- `fn_remettre_collectes` rattache les collectes au bordereau en DEUX passes :
-- celles qui restent a valider, puis celles qui sont DEJA validees — ces
-- dernieres sans toucher au statut, precisement pour ne pas heurter RG-17.
--
-- Le commentaire de la migration 0038 disait : « RG-17 refuse toute ecriture
-- sur un mouvement valide, les inclure ci-dessus ferait echouer le bordereau
-- entier ». C'etait juste. Mais la seconde passe est une ECRITURE elle aussi, et
-- le garde-fou de `fn_finance_before_write` ne regarde PAS ce qui a change :
--
--     if old.statut = 'VALIDE' then
--       if not (new.statut = 'ANNULE' and ...) then raise ...
--
-- Il se declenche donc sur TOUT `update` d'une ligne validee, y compris celui
-- qui ne pose qu'un `dime_remise_id`. Separer les deux passes ne changeait rien :
-- la seconde etait vouee a echouer a coup sur, et avec elle la remise entiere.
--
-- Symptome constate le 19 aout 2026 : remise du District Avaradrano, 512 000 MGA,
-- refusee avec « RG-17 : un mouvement valide est immuable ». Aucune collecte
-- anterieure a 0038 ne pouvait donc etre portee au Siege.
--
-- CE QUE RG-17 PROTEGE VRAIMENT
--
-- RG-17 defend les DONNEES d'un mouvement : son montant, sa categorie, son
-- entite, sa date, son sens, son statut. Le bordereau de remise n'en fait pas
-- partie — c'est la trace d'un geste POSTERIEUR, la remise en mains propres au
-- Siege. L'enregistrer ne reecrit pas l'histoire, il la complete.
--
-- Le seul changement tolere est donc le passage de `dime_remise_id` de NULL a
-- une valeur, et rien d'autre dans la meme ecriture. Le REMPLACEMENT d'un
-- bordereau par un autre reste refuse : il ferait compter la meme collecte sur
-- deux bordereaux.
--
-- REJOUABLE (regle 23) : `create or replace` sur une fonction `returns trigger`
-- dont le type de retour ne change pas.
-- =============================================================================

create or replace function fn_finance_before_write() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow_actif boolean;
  v_rattache_bordereau boolean;
begin
  new.periode := date_trunc('month', new.date_operation)::date;

  -- RG-13 : le sens est DEDUIT de la categorie, jamais saisi a la main.
  if tg_op = 'INSERT' or new.categorie_id is distinct from old.categorie_id then
    select sens into new.sens from finance_categories where id = new.categorie_id;
  end if;

  -- EF-FIN-26 : rien n'entre dans une periode close.
  if fn_periode_est_close(new.entity_id, new.date_operation) then
    raise exception
      'EF-FIN-26 : la periode % de cette entite est cloturee ; sa reouverture est necessaire.',
      to_char(new.periode, 'MM/YYYY')
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'INSERT' then
    v_workflow_actif := fn_finance_workflow_actif(new.entity_id);

    -- RG-16 : workflow inactif POUR CETTE ENTITE => validation immediate.
    if not v_workflow_actif and new.statut = 'BROUILLON' then
      new.statut := 'VALIDE';
      new.valide_le := now();
    end if;

  else
    /**
     * Rien ne SORT non plus d'une periode close — ni par un changement de
     * date, ni par un changement d'entite.
     */
    if old.date_operation is distinct from new.date_operation
    or old.entity_id is distinct from new.entity_id
    then
      if fn_periode_est_close(old.entity_id, old.date_operation) then
        raise exception
          'EF-FIN-26 : ce mouvement appartient a la periode cloturee % ; sa reouverture est necessaire.',
          to_char(old.periode, 'MM/YYYY')
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    /**
     * EF-FIN-30 — LE RATTACHEMENT A UN BORDEREAU DE REMISE.
     *
     * Vrai quand l'ecriture ne fait QUE poser `dime_remise_id` sur une collecte
     * qui n'en avait pas : le statut, le montant, la categorie, l'entite, la
     * date et le sens restent identiques. C'est la trace d'un geste posterieur
     * — la remise en mains propres —, pas une reecriture du mouvement.
     *
     * Le remplacement d'un bordereau par un autre n'entre PAS dans ce cas :
     * `old.dime_remise_id is null` l'exige. Une collecte ne se remet qu'une
     * fois, sans quoi le meme argent figurerait sur deux bordereaux.
     */
    v_rattache_bordereau :=
      old.dime_remise_id is null
      and new.dime_remise_id is not null
      and (new.statut, new.montant, new.categorie_id, new.entity_id,
           new.date_operation, new.sens)
          is not distinct from
          (old.statut, old.montant, old.categorie_id, old.entity_id,
           old.date_operation, old.sens);

    -- RG-17 : un mouvement valide est immuable, sauf annulation motivee.
    if old.statut = 'VALIDE' and not v_rattache_bordereau then
      if not (new.statut = 'ANNULE' and new.motif_annulation is not null) then
        raise exception
          'RG-17 : un mouvement valide est immuable ; seule une annulation motivee est possible';
      end if;
      if (new.montant, new.categorie_id, new.entity_id, new.date_operation, new.sens)
         is distinct from
         (old.montant, old.categorie_id, old.entity_id, old.date_operation, old.sens)
      then
        raise exception
          'RG-17 : les donnees d''un mouvement valide ne peuvent pas etre modifiees';
      end if;
    end if;

    -- Transitions autorisees. Chaque branche enumere les etats ATTEIGNABLES
    -- depuis l'etat courant ; tout le reste est refuse.
    if (old.statut = 'BROUILLON' and new.statut not in ('BROUILLON','SOUMIS','VALIDE','ANNULE'))
    or (old.statut = 'SOUMIS'    and new.statut not in ('SOUMIS','VALIDE','REJETE','ANNULE'))
    or (old.statut = 'REJETE'    and new.statut not in ('REJETE','BROUILLON','ANNULE'))
    or (old.statut = 'ANNULE'    and new.statut <> 'ANNULE')
    then
      raise exception 'Transition de statut interdite : % -> %', old.statut, new.statut;
    end if;

    if new.statut = 'SOUMIS' and old.statut is distinct from 'SOUMIS' then
      new.soumis_le := now();
    end if;
    if new.statut = 'VALIDE' and old.statut is distinct from 'VALIDE' then
      new.valide_le := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

comment on function fn_finance_before_write is
  'RG-13, RG-16, RG-17, EF-FIN-26, EF-FIN-30. Depuis 0049 : poser un '
  'dime_remise_id sur une collecte validee est autorise — c''est la trace de la '
  'remise physique, pas une modification du mouvement.';

notify pgrst, 'reload schema';
