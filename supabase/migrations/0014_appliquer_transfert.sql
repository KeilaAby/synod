-- =============================================================================
-- SYNOD — 0014 — Application effective d'un transfert
-- =============================================================================
-- EF-TRF-03, EF-TRF-06, RG-11, RG-12.
--
-- POURQUOI UNE FONCTION ET NON DEUX APPELS DEPUIS L'APPLICATION
--
-- Appliquer un transfert, c'est deux ecritures indissociables : deplacer le
-- croyant, et marquer le transfert « effectue ». Deux appels HTTP successifs
-- ne forment pas une transaction — une coupure entre les deux laisserait soit
-- un croyant deplace sans trace, soit un transfert clos sans effet. Les deux
-- etats sont faux, et aucun ne se detecte.
--
-- Une seule fonction, donc une seule transaction.
-- =============================================================================

create or replace function fn_appliquer_transfert(p_transfert uuid)
returns transferts
language plpgsql
security definer                    -- ecrit dans `croyants`, verrouille par RLS
set search_path = public
as $$
declare
  t transferts%rowtype;
begin
  -- `for update` : deux approbateurs cliquant en meme temps ne doivent pas
  -- appliquer deux fois le meme transfert.
  select * into t from transferts where id = p_transfert for update;

  if not found then
    raise exception 'Transfert introuvable' using errcode = 'no_data_found';
  end if;

  -- RG-11 — rien ne s'applique sans approbation prealable. La verification est
  -- refaite ICI : `security definer` a mis la RLS de cote, c'est donc le seul
  -- endroit ou la regle tient encore.
  if t.statut <> 'APPROUVE' then
    raise exception 'RG-11 : un transfert ne s''applique qu''une fois approuve (etat actuel : %)', t.statut
      using errcode = 'check_violation';
  end if;

  -- RG-12 — l'approbateur couvre le plus petit ancetre commun des deux
  -- entites, fige a la demande.
  if not can('transfer.approve', t.ancetre_commun_id) then
    raise exception 'RG-12 : votre perimetre ne couvre pas ce transfert'
      using errcode = 'insufficient_privilege';
  end if;

  update croyants
     set eglise_id  = t.to_eglise_id,
         cellule_id = t.to_cellule_id
   where id = t.croyant_id;

  -- EF-TRF-09 — la cloture des mandats de bureau de l'entite d'origine viendra
  -- avec le lot 3 : la table `bureau_membres` n'existe pas encore. Le point
  -- d'insertion est ici, entre le deplacement et la cloture du transfert.

  update transferts
     set statut     = 'EFFECTUE',
         date_effet = current_date
   where id = t.id
  returning * into t;

  return t;
end $$;

comment on function fn_appliquer_transfert(uuid) is
  'Deplace le croyant et clot le transfert, en une transaction — RG-11, RG-12.';

-- L'application passe par cette fonction, jamais par un UPDATE direct :
-- `authenticated` doit pouvoir l'appeler.
grant execute on function fn_appliquer_transfert(uuid) to authenticated;
