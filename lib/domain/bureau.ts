import type { EntityType } from './hierarchy';
import { estDescendant } from './hierarchy';
import { type ActionResult, ko, ok } from './result';

/**
 * Bureaux et mandats — EF-BUR-01 a 11, RG-07 a RG-10, RG-31.
 *
 * Module PUR : contrepartie applicative des contraintes de
 * `0016_bureaux.sql`. Les deux doivent rester d'accord, et les tests
 * verrouillent cet accord.
 */

// -----------------------------------------------------------------------------
// Fonctions et rang protocolaire
// -----------------------------------------------------------------------------

export interface FonctionBureau {
  readonly id: string;
  readonly code: string;
  readonly libelle: string;
  readonly ordreProtocolaire: number;
  /** RG-31 — un titulaire de cette fonction est « membre de finances ». */
  readonly estFinanciere: boolean;
  readonly niveauxApplicables: readonly EntityType[];
  readonly isActive: boolean;
}

/**
 * EF-REF-03 — une fonction declare les niveaux ou elle a un sens.
 *
 * Un « Directeur des finances » n'existe pas dans une cellule de priere :
 * proposer la fonction la ferait refuser a l'enregistrement, apres coup.
 */
export function fonctionApplicable(
  fonction: FonctionBureau,
  niveau: EntityType,
): boolean {
  return fonction.isActive && fonction.niveauxApplicables.includes(niveau);
}

export function fonctionsDuNiveau(
  fonctions: readonly FonctionBureau[],
  niveau: EntityType,
): FonctionBureau[] {
  return fonctions
    .filter((f) => fonctionApplicable(f, niveau))
    .sort(
      (a, b) =>
        a.ordreProtocolaire - b.ordreProtocolaire ||
        a.libelle.localeCompare(b.libelle, 'fr'),
    );
}

// -----------------------------------------------------------------------------
// Mandats
// -----------------------------------------------------------------------------

export interface MandatMembre {
  readonly id: string;
  readonly croyantId: string;
  readonly fonctionId: string;
  readonly dateDebut: string;
  /** `null` : mandat EN COURS. Renseignee : mandat clos, conserve. */
  readonly dateFin: string | null;
}

/** RG-08 — seul un mandat sans date de fin occupe reellement la fonction. */
export function estEnCours(mandat: MandatMembre): boolean {
  return mandat.dateFin === null;
}

/**
 * Composition d'un bureau : une entree par fonction applicable, occupee ou non.
 *
 * EF-BUR-07 — les fonctions VACANTES sont visibles. Un bureau se lit autant a
 * ce qui lui manque qu'a ce qu'il a : masquer les vacances laisserait croire un
 * bureau complet alors qu'il n'a ni tresorier ni secretaire.
 */
export interface PosteBureau {
  readonly fonction: FonctionBureau;
  readonly mandat: MandatMembre | null;
}

export function composerBureau(
  fonctions: readonly FonctionBureau[],
  mandats: readonly MandatMembre[],
  niveau: EntityType,
): PosteBureau[] {
  const enCours = new Map<string, MandatMembre>();
  for (const mandat of mandats) {
    if (estEnCours(mandat)) enCours.set(mandat.fonctionId, mandat);
  }

  return fonctionsDuNiveau(fonctions, niveau).map((fonction) => ({
    fonction,
    mandat: enCours.get(fonction.id) ?? null,
  }));
}

export function comptePostes(postes: readonly PosteBureau[]): {
  total: number;
  pourvus: number;
  vacants: number;
} {
  const pourvus = postes.filter((p) => p.mandat !== null).length;
  return { total: postes.length, pourvus, vacants: postes.length - pourvus };
}

/** RG-31 — membres de finances : titulaires d'une fonction financiere. */
export function membresDeFinances(postes: readonly PosteBureau[]): PosteBureau[] {
  return postes.filter((p) => p.fonction.estFinanciere && p.mandat !== null);
}

// -----------------------------------------------------------------------------
// Regles de composition
// -----------------------------------------------------------------------------

export interface CandidatBureau {
  readonly croyantId: string;
  readonly nom: string;
  /** Chemin ltree de l'eglise du croyant. */
  readonly cheminEglise: string;
  readonly statut: string;
}

/**
 * RG-09 — le croyant designe appartient au sous-arbre de l'entite.
 *
 * Le bureau d'un district ne se compose que de croyants de ce district. Sans
 * cette borne, une entite pourrait nommer n'importe qui dans l'organisation.
 */
export function croyantEligible(
  candidat: CandidatBureau,
  cheminEntite: string,
): boolean {
  return estDescendant(candidat.cheminEglise, cheminEntite);
}

export function candidatsEligibles(
  candidats: readonly CandidatBureau[],
  cheminEntite: string,
): CandidatBureau[] {
  return candidats.filter(
    // Un croyant transfere, decede ou inactif n'exerce plus : le proposer
    // reviendrait a composer un bureau avec des absents.
    (c) => c.statut === 'ACTIF' && croyantEligible(c, cheminEntite),
  );
}

/**
 * Une designation est-elle recevable ? Regroupe les controles qui ne
 * demandent pas la base, pour que l'interface REFUSE le geste avec sa raison
 * plutot que de laisser la contrainte SQL trancher apres coup.
 */
export function validerDesignation(
  candidat: CandidatBureau,
  fonction: FonctionBureau,
  cheminEntite: string,
  niveauEntite: EntityType,
  mandatsEnCours: readonly MandatMembre[],
): ActionResult<void> {
  if (!croyantEligible(candidat, cheminEntite)) {
    return ko(`RG-09 : « ${candidat.nom} » n'appartient pas au perimetre de cette entite.`);
  }

  if (candidat.statut !== 'ACTIF') {
    return ko(`« ${candidat.nom} » n'est pas un croyant actif.`);
  }

  if (!fonctionApplicable(fonction, niveauEntite)) {
    return ko(`La fonction « ${fonction.libelle} » ne s'applique pas a ce niveau.`);
  }

  // RG-08 — une fonction, un titulaire a la fois.
  if (mandatsEnCours.some((m) => m.fonctionId === fonction.id)) {
    return ko(
      `La fonction « ${fonction.libelle} » est deja occupee. ` +
        'Remplacez son titulaire plutot que d\'ajouter un second.',
    );
  }

  // Un croyant n'occupe pas deux fonctions dans le MEME bureau. Il peut en
  // occuper dans deux bureaux distincts, ce que rien n'interdit.
  if (mandatsEnCours.some((m) => m.croyantId === candidat.croyantId)) {
    return ko(`« ${candidat.nom} » occupe deja une fonction dans ce bureau.`);
  }

  return ok();
}

// -----------------------------------------------------------------------------
// Mandat du bureau — RG-10
// -----------------------------------------------------------------------------

export interface Mandat {
  readonly id: string;
  readonly entityId: string;
  readonly libelle: string;
  readonly dateDebut: string;
  readonly dateFin: string | null;
  readonly isActive: boolean;
}

/**
 * RG-10 — une entite n'a qu'UN bureau actif. Les mandats anterieurs sont
 * conserves : c'est l'histoire du bureau, pas un brouillon.
 */
export function bureauActif(mandats: readonly Mandat[]): Mandat | null {
  return mandats.find((m) => m.isActive) ?? null;
}

export function validerPeriodeMandat(
  dateDebut: string,
  dateFin: string | null,
): ActionResult<void> {
  if (dateFin && dateFin <= dateDebut) {
    return ko('La date de fin doit etre posterieure a la date de debut.');
  }
  return ok();
}

/**
 * Libelle propose pour un nouveau mandat.
 *
 * « Bureau IAVOAMBONY 2026-2029 » : l'entite et la periode. Ce que l'on
 * cherche dans une liste de mandats, c'est l'annee — la mettre dans le libelle
 * evite d'avoir a ouvrir chaque ligne.
 */
export function libelleMandat(
  nomEntite: string,
  dateDebut: string,
  dateFin: string | null,
): string {
  const annee = (iso: string) => iso.slice(0, 4);
  const periode = dateFin
    ? `${annee(dateDebut)}-${annee(dateFin)}`
    : `depuis ${annee(dateDebut)}`;

  return `Bureau ${nomEntite} ${periode}`;
}

/**
 * EF-BUR-09 — reconduction : la composition du mandat clos est reprise dans le
 * suivant.
 *
 * Ne sont reconduits que les mandats EN COURS a la cloture : reprendre ceux
 * deja clos ressusciterait des titulaires remplaces en cours de route.
 */
export function aReconduire(mandats: readonly MandatMembre[]): MandatMembre[] {
  return mandats.filter(estEnCours);
}
