-- =============================================================================
-- SYNOD — 0031 — Voir tous les croyants pour une collecte de dimes
-- =============================================================================
-- Reference : EF-FIN-32 — un croyant de passage verse sa dime dans une autre
--             eglise que la sienne.
--
-- LE PROBLEME
--
-- Le menu de saisie ne proposait que les croyants du perimetre du saisissant,
-- la RLS de `croyants` ne livrant rien d'autre. Un visiteur venu d'un autre
-- district restait donc introuvable, et il fallait le saisir en anonyme —
-- perdant justement la trace que le recu doit porter.
--
-- CE QUI N'A PAS ETE FAIT, ET POURQUOI
--
-- Elargir la politique `select` de `croyants` aurait ouvert AVEC ELLE la liste
-- des croyants, les exports, les statistiques, les transferts et les rapports :
-- adresse, telephone, date de naissance, situation maritale de toute
-- l'organisation, a qui detient `croyant.read` quelque part. Un droit qui ouvre
-- plus que ce qu'on veut accorder n'est pas le bon droit — c'est la meme
-- lecon que `finance.workflow.manage`.
--
-- CE QUI EST FAIT
--
-- Une fonction dediee, qui borne DEUX choses a la fois :
--
--   - les COLONNES : de quoi identifier un donateur et rien de plus — nom,
--     prenom, matricule, eglise, portrait. Pas d'adresse, pas de telephone,
--     pas de date de naissance ;
--   - l'AUDIENCE : ceux qui detiennent `finance.dime.collect` quelque part.
--     Un lecteur sans ce droit n'y gagne rien.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

create or replace function fn_croyants_pour_dime()
returns table (
  id         uuid,
  nom        text,
  prenom     text,
  matricule  text,
  photo_key  text,
  eglise_nom text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  /**
   * LE DROIT EST VERIFIE ICI, ET SANS PORTEE — volontairement.
   *
   * `has_perm` sans entite repond « detient-il ce droit quelque part ? ». La
   * portee n'aurait pas de sens : la question n'est pas « peut-il collecter
   * pour l'eglise de ce croyant » — il ne collecte pas pour elle, il enregistre
   * un versement fait CHEZ LUI par quelqu'un venu d'ailleurs.
   */
  if not has_perm('finance.dime.collect') and not is_superadmin() then
    raise exception 'Droit insuffisant pour consulter les donateurs.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select c.id, c.nom, c.prenom, c.matricule, c.photo_key, e.nom
      from croyants c
      left join entities e on e.id = c.eglise_id
     where c.deleted_at is null
       -- Un croyant TRANSFERE ou decede ne verse plus : le proposer ferait
       -- rattacher une dime a une fiche close.
       and c.statut = 'ACTIF'
     order by c.nom, c.prenom
     -- Regle 17 : un volume trop grand se borne par un plafond ANNONCE a
     -- l'ecran, jamais par un retour silencieux a la pagination. L'appelant
     -- compare le nombre recu a cette valeur pour savoir s'il doit le dire.
     limit 5000;
end $$;

comment on function fn_croyants_pour_dime is
  'EF-FIN-32 — donateurs possibles d''une collecte, TOUTE l''organisation. '
  'Colonnes bornees a l''identite ; reserve aux detenteurs de '
  'finance.dime.collect. N''elargit PAS la RLS de croyants.';

revoke execute on function fn_croyants_pour_dime from anon;
