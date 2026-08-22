import { dansLeDelaiDeCorrection } from './delai-correction';
import { estDescendant } from './hierarchy';
import type { Permission, SessionUtilisateur } from './permissions';
import { peut } from './permissions';

/**
 * La forme MINIMALE d'une entite pour ce module.
 *
 * Declaree ici plutot qu'importee de `lib/data` : une regle metier n'a pas a
 * dependre de ce que PostgREST renvoie, et le domaine ne doit rien savoir du
 * serveur. Meme decision que `CroyantFiltrable`.
 */
export interface EntiteDeLArbre {
  readonly id: string;
  readonly nom: string;
  readonly path: string;
  readonly parent_id: string | null;
}

/**
 * La promotion de grade — EF-CRO-12, RG-06.
 *
 * CE QUE CE CIRCUIT PROTEGE. Changer le grade d'un croyant n'est pas une
 * correction de fiche : c'est une reconnaissance, et elle vaut dans TOUTE
 * l'organisation. « Pasteur a Antananarivo » et « Pasteur a Toamasina » doivent
 * designer la meme chose, sans quoi le referentiel ne veut plus rien dire.
 *
 * IL S'ACTIVE, IL NE S'IMPOSE PAS. Le reglage
 * `promotion_grade_validation` est ferme par defaut : une organisation qui
 * n'en veut pas continue de poser les grades directement, comme avant. Le
 * reglage se lit A CHAQUE ECRITURE (regle 21) — l'activer referme la porte
 * immediatement, sans qu'aucun ecran n'ait a etre redemarre.
 *
 * MODULE PUR : aucune dependance a la base ni a React, donc directement
 * testable.
 */

export const STATUTS_PROMOTION = ['DEMANDE', 'APPROUVE', 'REFUSE', 'ANNULE'] as const;
export type StatutPromotion = (typeof STATUTS_PROMOTION)[number];

export const LIBELLES_STATUT_PROMOTION: Record<StatutPromotion, string> = {
  DEMANDE: 'En attente',
  APPROUVE: 'Approuvée',
  REFUSE: 'Refusée',
  ANNULE: 'Retirée',
};

/** Le droit de TRANCHER — demander reste sous `croyant.update`. */
export const PERMISSION_PROMOTION: Permission = 'croyant.grade.approve';

/**
 * L'ENTITE SUPERIEURE COMPETENTE — le parent de l'eglise du croyant.
 *
 * POURQUOI LE PARENT, ET NON UN ANCETRE QUELCONQUE. « Superieure » veut dire
 * « celle dont l'eglise depend », et c'est le parent immediat. Remonter plus
 * haut ferait trancher le Siege des promotions de cellule ; s'arreter a
 * l'eglise ne serait plus une validation par un tiers.
 *
 * `null` quand l'eglise n'a pas de parent — le Siege lui-meme. Une promotion
 * decidee au Siege n'a personne au-dessus : l'appelant en tire qu'elle ne peut
 * pas entrer dans le circuit, et le grade se pose directement. Refuser tout
 * changement de grade au Siege serait pire que l'absence de circuit.
 */
export function arbitreDePromotion(
  eglisePath: string,
  arbre: readonly EntiteDeLArbre[],
): EntiteDeLArbre | null {
  const eglise = arbre.find((e) => e.path === eglisePath);
  if (!eglise?.parent_id) return null;

  return arbre.find((e) => e.id === eglise.parent_id) ?? null;
}

/**
 * Le circuit s'applique-t-il a cette ecriture ?
 *
 * TROIS CONDITIONS, et l'ordre compte. Le reglage d'abord — ferme, rien ne
 * change. Le grade ensuite : reenregistrer une fiche sans toucher au grade ne
 * doit ouvrir aucune demande, sinon la file se remplirait de promotions vers le
 * grade deja porte. L'arbitre enfin : sans entite superieure, il n'y a personne
 * a qui demander.
 */
export function promotionSoumiseAValidation(options: {
  readonly validationActive: boolean;
  readonly gradeActuelId: string | null;
  readonly gradeDemandeId: string;
  readonly arbitreId: string | null;
}): boolean {
  if (!options.validationActive) return false;
  if (options.gradeActuelId === options.gradeDemandeId) return false;
  return options.arbitreId !== null;
}

/**
 * Ce compte peut-il trancher cette demande ?
 *
 * LA PORTEE FAIT TOUT LE TRAVAIL. Le droit s'evalue sur l'entite SUPERIEURE
 * figee a la demande : un compte borne a l'eglise ne la couvre pas, donc ne
 * peut pas s'approuver lui-meme. Il n'y a aucune regle de plus a ecrire — et
 * c'est ce qui la rend difficile a contourner par megarde.
 *
 * Une demande DEJA TRANCHEE ne se retranche pas : le second verdict ecraserait
 * le premier sans que personne ne l'ait voulu.
 */
export function peutDeciderPromotion(
  session: SessionUtilisateur,
  demande: { readonly statut: StatutPromotion; readonly arbitrePath: string | null },
): boolean {
  if (demande.statut !== 'DEMANDE') return false;
  if (!demande.arbitrePath) return false;
  return peut(session, PERMISSION_PROMOTION, demande.arbitrePath);
}

/**
 * Ce compte peut-il RETIRER cette demande ?
 *
 * Celle qui l'a faite, et elle seule, tant que rien n'est tranche. Se raviser
 * n'est pas trancher : cela ne demande donc pas le droit de l'arbitre — mais
 * cela ne permet pas non plus de retirer la demande d'une autre eglise.
 */
export function peutRetirerPromotion(
  session: SessionUtilisateur,
  demande: { readonly statut: StatutPromotion; readonly eglisePath: string },
): boolean {
  if (demande.statut !== 'DEMANDE') return false;
  return (
    peut(session, 'croyant.update', demande.eglisePath) &&
    estDescendant(demande.eglisePath, session.scopePath)
  );
}

// ---------------------------------------------------------------------------
// EF-CRO-12 — monter, ou descendre
// ---------------------------------------------------------------------------

/**
 * LE RANG D'UN GRADE EST SON `ordre`, ET LE PLUS PETIT EST LE PLUS ELEVE.
 *
 * Le referentiel se range au glisser-deposer, comme les fonctions (migrations
 * `0061`/`0062`), et `fn_reordonner_referentiel` renumerote de dix en dix dans
 * l'ordre de la liste. Cette liste va du grade le PLUS HAUT au plus bas —
 * « Pasteur » en tete avec 10, « Croyant » plus bas avec un nombre plus grand.
 *
 * CE SENS A ETE ECRIT A L'ENVERS DEUX FOIS AVANT D'ETRE VERIFIE, et il faut
 * dire comment il a ete tranche : par un ESSAI, le 21 aout 2026. Promouvoir un
 * Croyant en Diacre declenchait le pop-up de retrogradation — donc, dans les
 * donnees reelles, « Diacre » porte un `ordre` PLUS PETIT que « Croyant » tout
 * en lui etant superieur.
 *
 * La lecon vaut d'etre gardee : sur une convention de tri, l'enonce et la
 * donnee peuvent diverger, et c'est la donnee qui a raison. Le test verrouille
 * donc les DEUX directions — se tromper de sens fait exiger un motif sur les
 * promotions tout en laissant passer les retrogradations sans rien, et aucun
 * des deux ne se remarque tant que personne n'essaie.
 *
 * `null` DE CHAQUE COTE VEUT DIRE « ON NE SAIT PAS COMPARER ». On ne conclut
 * alors PAS a une retrogradation : exiger un motif sur une promotion ordinaire
 * ferait taper une justification pour rien, et l'utilisateur apprendrait a
 * ecrire n'importe quoi dans ce champ — ce qui viderait de sens ceux qui
 * comptent.
 */
export function estRetrogradation(
  ordreActuel: number | null | undefined,
  ordreDemande: number | null | undefined,
): boolean {
  if (typeof ordreActuel !== 'number' || typeof ordreDemande !== 'number') return false;
  return ordreDemande > ordreActuel;
}

/**
 * Une descente en grade doit-elle etre refusee faute de motif ?
 *
 * MEME PRINCIPE QUE LE RETRAIT D'UN TITULAIRE : ce qui retire quelque chose a
 * quelqu'un se motive, ce qui lui en donne non. Une promotion se justifie
 * d'elle-meme — on reconnait ce qui est deja la ; une retrogradation, jamais.
 *
 * ET LE MOTIF SE DONNE A LA DEMANDE, pas a la decision. Celui qui descend le
 * grade sait pourquoi ; l'entite superieure, elle, se prononce SUR ce motif.
 * L'inverse lui ferait juger sans savoir de quoi.
 */
export function motifDeRetrogradationManquant(options: {
  readonly ordreActuel: number | null | undefined;
  readonly ordreDemande: number | null | undefined;
  readonly motif: string | null;
}): boolean {
  if (!estRetrogradation(options.ordreActuel, options.ordreDemande)) return false;
  return (options.motif ?? '').trim().length < 3;
}

/**
 * DEUX GESTES POUR UN CHANGEMENT DE GRADE — meme distinction que le retrait
 * d'un titulaire (EF-BUR-08), et pour la meme raison.
 *
 *   - `ERREUR`   -> on a coche le mauvais grade. Ce n'est pas un evenement de
 *     la vie du croyant, c'est une faute de saisie : rien n'entre dans son
 *     historique, et aucune demande ne part. Un « Diacre » de trois jours
 *     inscrit au journal se lirait plus tard comme une degradation.
 *   - `DECISION` -> une montee ou une descente reelle. Elle s'inscrit, avec son
 *     operateur et, s'il y en a un, son validateur ; et une DESCENTE se motive.
 *
 * LA FENETRE DE QUINZE JOURS EMPECHE LE CONTOURNEMENT. Sans elle, « erreur de
 * saisie » deviendrait la porte par laquelle on retrograde quelqu'un sans rien
 * ecrire. Le meme delai que pour un mandat : c'est la meme idee — au-dela, ce
 * n'est plus une correction, c'est une decision.
 */
export type NatureChangementGrade = 'ERREUR' | 'DECISION';

/**
 * Peut-on encore corriger ce grade comme une ERREUR DE SAISIE ?
 *
 * `posePar` est la date a laquelle le grade COURANT a ete pose — la derniere
 * ligne du journal, ou a defaut la creation de la fiche, qui est bien le moment
 * ou son grade initial a ete choisi.
 *
 * LE DELAI EST LE MEME QUE POUR UN MANDAT, ET C'EST LITTERALEMENT LE MEME
 * PARAMETRE depuis le 21 aout 2026 : `organisation_settings.jours_correction_saisie`
 * (migration `0069`), lu a CHAQUE rendu (regle 21). La comparaison vit dans
 * `lib/domain/delai-correction.ts`, partagee avec le retrait d'un titulaire de
 * bureau — deux endroits qui portaient la meme regle avec leur propre
 * constante a 15, et qui auraient fini par diverger le jour ou l'un des deux
 * aurait ete retouche sans l'autre.
 */
export function correctionDeGradePossible(
  posePar: string,
  joursDelai: number,
  maintenant: Date = new Date(),
): boolean {
  return dansLeDelaiDeCorrection(posePar, joursDelai, maintenant);
}
