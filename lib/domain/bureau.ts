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

/**
 * EF-BUR-07 — les postes groupes par RANG, pour l'organigramme.
 *
 * Deux fonctions de meme `ordre_protocolaire` sont de meme rang : elles
 * s'affichent cote a cote, sans que l'une paraisse superieure a l'autre. Le
 * tri vient de `composerBureau`, qui a deja applique l'ordre.
 *
 * CE QUE LE GRAPHE DIT, ET CE QU'IL NE DIT PAS
 *
 * Il rend une PRESEANCE, pas un lien de subordination : rien dans le modele ne
 * dit qu'un tresorier rend compte au secretaire. Les traits relient donc
 * chaque rang au rang qui le precede, et l'ecran le precise — un organigramme
 * qui laisse croire a une chaine de commandement invente une organisation.
 */
export interface RangProtocolaire {
  readonly ordre: number;
  readonly postes: readonly PosteBureau[];
}

export function rangsProtocolaires(
  postes: readonly PosteBureau[],
): RangProtocolaire[] {
  const rangs: RangProtocolaire[] = [];

  for (const poste of postes) {
    const dernier = rangs[rangs.length - 1];

    if (dernier && dernier.ordre === poste.fonction.ordreProtocolaire) {
      (dernier.postes as PosteBureau[]).push(poste);
    } else {
      rangs.push({ ordre: poste.fonction.ordreProtocolaire, postes: [poste] });
    }
  }

  return rangs;
}

/**
 * Anciennete dans la fonction — EF-BUR-07.
 *
 * En ANNEES des qu'il y en a une : « 2 ans » se retient, « 27 mois » se
 * recalcule. En dessous, le mois ; en dessous encore, le jour, parce qu'une
 * designation du matin doit se lire autrement qu'une erreur d'affichage.
 */
export function ancienneteMandat(
  dateDebut: string,
  aujourdHui: Date = new Date(),
): string {
  const debut = new Date(dateDebut);
  if (Number.isNaN(debut.getTime())) return '';

  const jours = Math.floor((aujourdHui.getTime() - debut.getTime()) / 86_400_000);
  if (jours < 0) return 'a venir';
  if (jours === 0) return "depuis aujourd'hui";
  if (jours < 31) return `${jours} jour${jours > 1 ? 's' : ''}`;

  const mois = Math.floor(jours / 30.4375);
  if (mois < 12) return `${mois} mois`;

  const annees = Math.floor(jours / 365.25);
  return `${annees} an${annees > 1 ? 's' : ''}`;
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
  /** NOM du bureau — « Bureau executif ». La periode se lit dans les dates. */
  readonly libelle: string;
  readonly dateDebut: string;
  readonly dateFin: string | null;
  readonly isActive: boolean;
}

/**
 * Deux bureaux portent-ils le MEME nom ?
 *
 * Casse et espaces de bord ecartes : « Bureau Executif » et
 * « bureau executif  » designent le meme organe. Doit rester aligne sur
 * l'index `bureaux_un_actif_par_nom` (migration 0017).
 */
export function memeBureau(a: string, b: string): boolean {
  const normaliser = (v: string) => v.trim().toLocaleLowerCase('fr');
  return normaliser(a) === normaliser(b);
}

/**
 * RG-10 — une entite a au plus un mandat actif PAR BUREAU.
 *
 * Elle peut en revanche faire coexister plusieurs bureaux de noms differents :
 * un « Bureau executif », un « Comite des finances », une « Commission des
 * jeunes ». La premiere redaction de la regle — un seul bureau actif par
 * entite — refusait le second (corrige le 7 aout 2026).
 *
 * Les mandats anterieurs sont conserves : c'est l'histoire du bureau, pas un
 * brouillon.
 */
export function bureauxActifs(mandats: readonly Mandat[]): Mandat[] {
  return mandats
    .filter((m) => m.isActive)
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
}

/** Le mandat en cours d'un bureau donne, s'il existe. */
export function mandatActifDe(
  mandats: readonly Mandat[],
  libelle: string,
): Mandat | null {
  return mandats.find((m) => m.isActive && memeBureau(m.libelle, libelle)) ?? null;
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
 * Intitule affiche d'un mandat — « Bureau executif 2026-2029 ».
 *
 * COMPOSE, jamais stocke : la periode se lit deja dans les dates, et la
 * dupliquer dans le libelle produirait un intitule faux le jour ou le mandat
 * est clos par anticipation.
 */
export function libelleAffichage(
  nomBureau: string,
  dateDebut: string,
  dateFin: string | null,
): string {
  const annee = (iso: string) => iso.slice(0, 4);
  const periode = dateFin
    ? `${annee(dateDebut)}-${annee(dateFin)}`
    : `depuis ${annee(dateDebut)}`;

  return `${nomBureau.trim()} ${periode}`;
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

// -----------------------------------------------------------------------------
// EF-BUR-01 / EF-STR-04 — ce que le menu d'une entite propose de son bureau
// -----------------------------------------------------------------------------

/**
 * Une SEULE entree dans le menu de l'entite, et laquelle depend de l'etat :
 *
 *   · `creer`     — aucun bureau : l'ouvrir, puis enchainer sur sa composition ;
 *   · `composer`  — un bureau existe mais n'a aucun titulaire : aller droit aux
 *                   fonctions a pourvoir, une liste vide de membres n'apprenant
 *                   rien a personne ;
 *   · `consulter` — le bureau est compose : en lister les titulaires ;
 *   · `null`      — rien a proposer : pas de bureau, et pas le droit d'en ouvrir.
 *
 * Proposer les trois en permanence obligerait a ouvrir chacune pour savoir
 * laquelle mene quelque part. Le calcul est ici, et non dans le composant,
 * parce que c'est une regle — et que c'est le seul moyen de l'eprouver.
 */
export type EntreeBureauEntite = 'creer' | 'composer' | 'consulter';

export function entreeBureauDeEntite(
  bureauxActifs: readonly { nbMembres: number }[],
  peutGerer: boolean,
): EntreeBureauEntite | null {
  if (bureauxActifs.length === 0) return peutGerer ? 'creer' : null;

  // Un seul titulaire, dans un seul des bureaux, suffit a rendre la liste
  // utile : c'est le total qui compte, pas le detail bureau par bureau.
  const titulaires = bureauxActifs.reduce((n, b) => n + b.nbMembres, 0);
  return titulaires === 0 ? 'composer' : 'consulter';
}
