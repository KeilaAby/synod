import { estDescendant } from './hierarchy';

/**
 * Dimes — EF-FIN-27 a 31, RG-33.
 *
 * LE POINT QUI COMMANDE TOUT LE RESTE : une dime n'est pas une recette de
 * l'eglise qui la collecte. Elle appartient au SIEGE, a qui elle est remise en
 * mains propres. L'eglise COLLECTE, elle n'ENCAISSE pas.
 *
 * Module PUR : contrepartie applicative de `0027`/`0029`. Le domaine EXPLIQUE
 * le refus a l'utilisateur, la base l'EMPECHE quoi qu'il arrive.
 */

// -----------------------------------------------------------------------------
// L'evenement de collecte — EF-FIN-30
// -----------------------------------------------------------------------------

export const EVENEMENTS_DIME = [
  'CULTE',
  'RASSEMBLEMENT_PAROISSE',
  'RASSEMBLEMENT_DISTRICT',
  'RASSEMBLEMENT_REGIONAL',
  'EVENEMENT_NATIONAL',
] as const;

export type EvenementDime = (typeof EVENEMENTS_DIME)[number];

export const LIBELLES_EVENEMENT: Record<EvenementDime, string> = {
  CULTE: 'Culte',
  RASSEMBLEMENT_PAROISSE: 'Rassemblement de paroisse',
  RASSEMBLEMENT_DISTRICT: 'Rassemblement de district',
  RASSEMBLEMENT_REGIONAL: 'Rassemblement régional',
  EVENEMENT_NATIONAL: 'Événement national',
};

/**
 * Le NIVEAU d'entite qui peut heberger chaque evenement.
 *
 * Un rassemblement de district se tient au district, pas dans une de ses
 * eglises : c'est ce qui justifie `entite_collecte_id` plutot que
 * `eglise_collecte_id`.
 */
export const NIVEAU_HOTE: Record<EvenementDime, string> = {
  CULTE: 'EGLISE',
  RASSEMBLEMENT_PAROISSE: 'PAROISSE',
  RASSEMBLEMENT_DISTRICT: 'DISTRICT',
  RASSEMBLEMENT_REGIONAL: 'REGIONAL',
  EVENEMENT_NATIONAL: 'SIEGE',
};

/**
 * Un evenement national se saisit-il en detail ?
 *
 * NON, et ce n'est pas un choix d'ecran : personne ne tient trois mille
 * enveloppes a la main. Le Siege encaisse lui-meme et saisit un montant global
 * par libelle (EF-FIN-30).
 */
export function admetLeDetail(evenement: EvenementDime): boolean {
  return evenement !== 'EVENEMENT_NATIONAL';
}

// -----------------------------------------------------------------------------
// Le mode de saisie — EF-FIN-28
// -----------------------------------------------------------------------------

export const MODES_DIME = ['DETAILLE', 'GLOBAL'] as const;
export type ModeDime = (typeof MODES_DIME)[number];

export const LIBELLES_MODE: Record<ModeDime, string> = {
  DETAILLE: 'Détaillé — une ligne par croyant',
  GLOBAL: 'Global — un seul montant',
};

/**
 * Le mode EFFECTIF d'une entite.
 *
 * `null` signifie « defaut de l'organisation », jamais « comme mon parent » :
 * chaque bureau gere ses finances, la hierarchie ne fait que les consulter.
 * Meme regle que pour le workflow de validation.
 */
export function modeEffectif(
  decide: ModeDime | null,
  defautOrganisation: ModeDime = 'DETAILLE',
): ModeDime {
  return decide ?? defautOrganisation;
}

/**
 * Un changement de mode ne CACHE RIEN — EF-FIN-28.
 *
 * Le mode decide de ce qu'on saisit DESORMAIS, jamais de ce qu'on peut relire.
 * Une collecte saisie en detail garde son detail apres le passage en global :
 * ce serait autrement effacer des recus que des croyants detiennent.
 */
export function detailConsultable(versements: number): boolean {
  return versements > 0;
}

// -----------------------------------------------------------------------------
// Qui peut verser ou l'on collecte — EF-FIN-30
// -----------------------------------------------------------------------------

/**
 * Un croyant peut-il verser sa dime lors de CETTE collecte ?
 *
 * Le critere est le SOUS-ARBRE de l'entite hote : lors d'un rassemblement de
 * district, tous les croyants de ce district peuvent verser, quelle que soit
 * leur eglise. Le chemin `ltree` porte la reponse — il n'y a rien d'autre a
 * interroger.
 */
export function peutVerser(cheminEglise: string, cheminHote: string): boolean {
  return estDescendant(cheminEglise, cheminHote);
}

// -----------------------------------------------------------------------------
// Le total, et la seule verite — EF-FIN-27
// -----------------------------------------------------------------------------

/**
 * EF-FIN-33 — toute dime n'a pas de nom.
 *
 * Une collecte reelle comprend des enveloppes nominatives, des enveloppes SANS
 * NOM — quelqu'un a oublie de s'inscrire, ou n'a pas voulu — et des especes EN
 * VRAC deposees dans l'urne. Les trois entrent dans le total ; seule la
 * premiere ouvre un recu, parce qu'on ne remet pas un recu a personne.
 */
export const NATURES_VERSEMENT = ['NOMINATIF', 'ENVELOPPE_ANONYME', 'EN_VRAC'] as const;
export type NatureVersement = (typeof NATURES_VERSEMENT)[number];

export const LIBELLES_NATURE: Record<NatureVersement, string> = {
  NOMINATIF: 'Nominatif',
  ENVELOPPE_ANONYME: 'Enveloppe sans nom',
  EN_VRAC: 'En vrac',
};

/** Seul un versement NOMINATIF ouvre un reçu : il faut quelqu'un à qui le remettre. */
export function ouvreUnRecu(nature: NatureVersement): boolean {
  return nature === 'NOMINATIF';
}

/**
 * Une enveloppe anonyme ADMET un numero, elle ne l'exige pas.
 *
 * La contrainte initiale renvoyait au vrac ce qui n'avait pas de numero.
 * C'etait une distinction d'informaticien, pas de tresorier : une enveloppe
 * sans numero reste une enveloppe — elle a ete pliee, remise, ouverte. Et
 * surtout, cela otait un CHOIX a l'utilisateur, seul juge de ce qu'il tient en
 * main.
 *
 * Le VRAC, lui, n'a ni nom ni enveloppe : c'est sa definition.
 */
export function admetUnNumero(nature: NatureVersement): boolean {
  return nature !== 'EN_VRAC';
}

/**
 * La categorie d'une collecte de dimes — EF-FIN-27.
 *
 * ELLE NE SE DEMANDE PAS. Sur l'ecran des dimes, tout EST une dime : le champ
 * n'offrait pas un choix mais une occasion de se tromper — enregistrer une
 * collecte sous « Offrande » et la voir disparaitre du suivi des dimes.
 *
 * Le serveur la RESOUT, il ne la recoit pas : un formulaire qui n'affiche pas
 * un champ n'a pas a l'envoyer (regle 19). Meme raisonnement que le grade d'un
 * nouveau baptise.
 *
 * Rend `null` si le referentiel n'en contient aucune — l'appelant le DIT,
 * plutot que de ranger une collecte sous une categorie prise au hasard.
 */
export function trouverCategorieDime(
  categories: readonly { readonly id: string; readonly libelle: string; readonly code?: string }[],
): string | null {
  const normaliser = (v: string) =>
    v
      .trim()
      .toLocaleLowerCase('fr')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');

  return (
    categories.find(
      (c) =>
        normaliser(c.libelle).includes('dime') ||
        (c.code ? normaliser(c.code).includes('dime') : false),
    )?.id ?? null
  );
}

export interface VersementDime {
  /** `null` pour un versement anonyme — il n'y a personne à rattacher. */
  readonly croyantId: string | null;
  readonly montant: number;
  readonly enveloppe?: string | null;
  readonly nature?: NatureVersement;
}

/**
 * Le total d'une collecte detaillee.
 *
 * IL SE CALCULE, IL NE SE SAISIT PAS. Un montant saisi a cote des versements
 * produirait deux verites — 1 000 000 annonces pour 900 000 de detail — et
 * personne ne saurait laquelle croire. La fonction SQL fait le meme calcul :
 * celle-ci sert a l'afficher pendant la saisie.
 */
export function totalCollecte(versements: readonly VersementDime[]): number {
  return versements.reduce((somme, v) => somme + v.montant, 0);
}

/**
 * Les croyants cites DEUX FOIS dans la meme collecte.
 *
 * Rendu par index, et jamais la premiere occurrence. Un croyant ne verse qu'une
 * enveloppe par collecte : deux lignes a son nom sont une erreur de saisie, et
 * la base ne peut pas la voir — rien n'y interdit deux versements du meme
 * croyant, puisque c'est licite d'une collecte a l'autre.
 */
export function doublonsDeCollecte(versements: readonly VersementDime[]): number[] {
  const vus = new Set<string>();
  const repetes: number[] = [];

  versements.forEach((v, index) => {
    // Un versement ANONYME n'a personne a repeter : dix enveloppes sans nom
    // dans la meme collecte sont dix enveloppes, pas neuf doublons.
    if (!v.croyantId) return;
    if (vus.has(v.croyantId)) repetes.push(index);
    else vus.add(v.croyantId);
  });

  return repetes;
}

// -----------------------------------------------------------------------------
// Le delai de remise — EF-FIN-30
// -----------------------------------------------------------------------------

/**
 * Les dimes d'un culte doivent parvenir au Siege au plus tard dans la SEMAINE
 * suivante. Au-dela, la collecte est en retard.
 */
export const DELAI_REMISE_JOURS = 7;

/**
 * Une collecte non remise est-elle EN RETARD ?
 *
 * C'est un CONSTAT, pas un blocage. Refuser une remise tardive empecherait de
 * regulariser — exactement l'inverse du but. Le retard se signale, il ne
 * s'interdit pas.
 *
 * Les deux dates sont des chaines « AAAA-MM-JJ » : une colonne `date` n'a pas
 * de fuseau, et lui en inventer un ferait basculer une collecte du 31 dans le
 * mois suivant.
 */
export function estEnRetard(
  jourCollecte: string,
  aujourdhui: string,
  delaiJours: number = DELAI_REMISE_JOURS,
): boolean {
  const collecte = Date.parse(`${jourCollecte}T00:00:00Z`);
  const jour = Date.parse(`${aujourdhui}T00:00:00Z`);
  if (Number.isNaN(collecte) || Number.isNaN(jour)) return false;

  const jours = (jour - collecte) / 86_400_000;
  return jours > delaiJours;
}

/**
 * Les dates de culte que porte un bordereau, ordonnees et sans repetition.
 *
 * Un regroupement de plusieurs dimanches est possible mais mal vu : le
 * bordereau doit alors DETAILLER chaque date, ce qui rend le retard visible au
 * lieu de le noyer dans un total (EF-FIN-30).
 */
export function datesDuBordereau(collectes: readonly { dateOperation: string }[]): string[] {
  return [...new Set(collectes.map((c) => c.dateOperation))].sort();
}
