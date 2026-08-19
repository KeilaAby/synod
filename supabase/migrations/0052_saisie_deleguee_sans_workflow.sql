-- =============================================================================
-- SYNOD — 0052 — La saisie deleguee ne passe par aucun workflow
-- =============================================================================
-- Reference : ARB-2, EF-STR-10, EF-FIN-05, EF-FIN-06, RG-16, RG-25.
--
-- LA REGLE, POSEE PAR L'UTILISATEUR LE 19 AOUT 2026
--
--   · Entite SANS acces a l'application : son ascendant saisit pour elle, et
--     SANS workflow de validation. Tout lui est delegue.
--   · Entite AVEC acces : elle monte un bureau et saisit elle-meme ; le
--     workflow de validation reste reglable par son administrateur ou par le
--     Siege — ce qui est deja le cas depuis le lot 4.
--
-- CE N'EST PAS QU'UNE PREFERENCE : L'ALTERNATIVE EST UN BLOCAGE
--
-- Depuis 0050, `finance.validate` est a portee PROPRE — un district ne valide
-- pas les mouvements de ses eglises, il les consulte. Et une entite declaree
-- sans acces n'a, par definition, aucun compte pour se connecter.
--
-- Une ecriture deleguee qui naitrait SOUMIS n'aurait donc PERSONNE pour la
-- valider : ni l'entite, qui ne se connecte pas ; ni l'ascendant qui l'a
-- saisie, dont le droit ne descend plus jusqu'a elle. Elle resterait en attente
-- indefiniment, comptee nulle part — le solde de l'entite serait faux et rien
-- ne le signalerait. La validation immediate est le seul etat coherent.
--
-- CE QUE CELA NE RELACHE PAS
--
-- La saisie deleguee reste bornee par deux conditions cumulatives, verifiees
-- dans `saisirMouvement` : la portee de l'octroi de `finance.delegate`, et
-- `sans_acces_application` sur l'entite visee. On ne peut donc pas se servir de
-- cette regle pour contourner le workflow d'une entite qui, elle, se connecte :
-- la saisie deleguee lui est refusee tout court.
--
-- Et l'ecriture porte `est_delegue` avec le nom de son auteur reel
-- (EF-FIN-06) : elle se distingue dans chaque liste, chaque filtre et chaque
-- rapport. Une validation sans controle qui ne se verrait pas serait un trou ;
-- celle-ci est nommee.
--
-- LES DIMES NE SONT PAS CONCERNEES. Une collecte naît SOUMIS parce qu'elle
-- annonce sans encaisser, et c'est la remise par bordereau qui la valide
-- (EF-FIN-30). `fn_saisir_collecte_dime` n'ecrit jamais `est_delegue` — il
-- reste a son defaut `false` —, donc la branche ci-dessous ne la voit pas.
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

    /**
     * ARB-2 — LA SAISIE DELEGUEE NE PASSE PAR AUCUN WORKFLOW.
     *
     * L'entite visee ne se connecte pas : elle n'a personne pour soumettre ni
     * pour valider. Et depuis 0050 son ascendant ne le peut pas non plus a sa
     * place. Laisser le workflow s'appliquer condamnerait l'ecriture a rester
     * SOUMIS pour toujours.
     */
    if new.est_delegue then
      v_workflow_actif := false;
    end if;

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
  'dime_remise_id sur une collecte validee est autorise. Depuis 0052 : une '
  'saisie deleguee ne passe par aucun workflow — l''entite visee ne se '
  'connecte pas, et depuis 0050 son ascendant ne valide pas a sa place.';

notify pgrst, 'reload schema';
