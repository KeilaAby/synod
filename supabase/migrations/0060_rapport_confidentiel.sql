-- =============================================================================
-- SYNOD — 0060 — Un rapport reste confidentiel a son entite
-- =============================================================================
-- Reference : EF-RAP-18 (retire), RG-26, RG-27. Decision du 20 aout 2026.
--
-- CE QU'ON RETIRE, ET POURQUOI.
--
-- Un rapport pouvait etre PUBLIE : il devenait alors lisible par tout le
-- perimetre SANS `report.read`. C'etait la definition meme de « publier ».
--
-- Le defaut etait connu et documente des le lot 6, sans etre corrige. RG-26
-- omet les blocs qu'on n'a pas le droit de lire, mais elle le fait A LA
-- GENERATION, sous la session de CELUI QUI GENERE. Le contenu est ensuite fige
-- (RG-27). Un tresorier de district generait donc un rapport contenant ses
-- finances, le publiait, et TOUTE personne du district pouvait l'ouvrir — y
-- compris quelqu'un a qui `finance.read` avait ete refuse. L'omission avait
-- bien eu lieu, mais pour le mauvais lecteur.
--
-- Rejouer l'omission a la lecture aurait fait varier le document d'un lecteur a
-- l'autre : deux personnes citant « le rapport du 18 aout » n'auraient plus
-- parle du meme, et un rapport cesse alors d'etre un document. La seule autre
-- issue est de RESSERRER QUI PEUT L'OUVRIR — c'est celle-ci.
--
-- CE QUI DECIDE DESORMAIS : `report.read`, SEUL, AVEC SA PORTEE.
--
-- Un droit, une portee, une regle — la meme que partout ailleurs (RG-25). Il
-- n'y a plus deux chemins pour ouvrir un rapport, donc plus de chemin qu'on
-- oublie de refermer.
--
-- LES RAPPORTS DEJA PUBLIES NE SONT PAS REECRITS.
--
-- `statut = 'PUBLIE'` reste sur les lignes qui le portent, et `publie_le` avec.
-- C'est de l'HISTOIRE : ce rapport A ETE publie, quelqu'un l'a diffuse, et
-- effacer cette trace serait exactement ce que RG-27 interdit. Ce qui change
-- est que ce statut ne DONNE PLUS RIEN — il se lit, il n'ouvre plus.
--
-- La valeur 'PUBLIE' reste donc dans l'enumeration : la retirer casserait les
-- lignes existantes, et une enumeration ne se reduit pas sans reecrire ce qui
-- s'y refere.
--
-- REJOUABLE (regle 23) : `drop policy if exists` avant `create policy`, et
-- `create or replace` sur une fonction de trigger existante.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- La lecture ne depend plus que du droit
-- -----------------------------------------------------------------------------

drop policy if exists report_instances_select on report_instances;
create policy report_instances_select on report_instances
  for select to authenticated
  using (
    entity_in_scope(entity_id)
    and can('report.read', entity_id)
  );

comment on column report_instances.publie_le is
  'HISTORIQUE — la date a laquelle ce rapport a ete publie, du temps ou la '
  'publication existait (retiree le 20 aout 2026, migration 0060). Elle ne '
  'donne plus aucun acces : `report.read` decide seul.';


-- -----------------------------------------------------------------------------
-- Le trigger ne connait plus la publication
-- -----------------------------------------------------------------------------

/**
 * Identique a `0043` moins la branche de publication.
 *
 * RG-27 est INTACTE, et c'est l'essentiel de cette fonction : ni les donnees,
 * ni la structure qui les a produites, ni la periode d'un rapport genere ne
 * changent apres coup.
 *
 * PASSER A 'PUBLIE' EST DESORMAIS REFUSE. On aurait pu l'ignorer en silence —
 * le statut ne donnant plus rien, il serait devenu decoratif. Mais un statut
 * qu'on peut encore poser et qui ne fait rien est un piege pose pour plus
 * tard : quelqu'un le verrait dans l'enumeration, le poserait, et croirait
 * avoir diffuse. Le refus dit ce qui a change.
 */
create or replace function fn_rapport_before_update() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.statut = 'PUBLIE' and old.statut is distinct from 'PUBLIE' then
    raise exception
      'La publication a ete retiree : un rapport reste confidentiel a son '
      'entite, et son acces se decide par le droit de lecture.'
      using errcode = 'check_violation';
  end if;

  /**
   * RG-27 — UN RAPPORT GENERE EST FIGE.
   *
   * Ni ses donnees, ni la structure qui les a produites, ni sa periode ne
   * changent apres coup. Sans ce verrou, « corriger » un rapport diffuse
   * reecrirait l'histoire sans laisser de trace — et deux personnes citant le
   * meme rapport ne parleraient plus du meme document.
   */
  if (new.contenu, new.template_snapshot, new.periode_debut, new.periode_fin, new.entity_id)
     is distinct from
     (old.contenu, old.template_snapshot, old.periode_debut, old.periode_fin, old.entity_id)
  then
    raise exception
      'RG-27 : un rapport genere est fige ; regenerez-en un nouveau plutot que de le modifier.';
  end if;

  return new;
end $$;

comment on function fn_rapport_before_update is
  'RG-27 — un rapport genere est fige. Depuis 0060, la publication n''existe '
  'plus : `report.read` decide seul qui peut ouvrir un rapport.';


/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, l'API repondrait sur
 * une definition perimee de la fonction qu'on vient de remplacer.
 */
notify pgrst, 'reload schema';
