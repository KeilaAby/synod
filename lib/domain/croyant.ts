import { type ActionResult, ko, ok } from './result';

/**
 * Règles métier du croyant — cdg.md §5.2, RG-28, RG-29.
 *
 * Module PUR : contrepartie applicative des triggers de `0010_croyants.sql`.
 * Les deux doivent rester d'accord, et les tests unitaires verrouillent
 * cet accord.
 */

// -----------------------------------------------------------------------------
// Énumérations
// -----------------------------------------------------------------------------

export const SEXES = ['M', 'F'] as const;
export type Sexe = (typeof SEXES)[number];

export const LIBELLES_SEXE: Record<Sexe, string> = { M: 'Homme', F: 'Femme' };

export const STATUTS_MARITAUX = [
  'CELIBATAIRE',
  'MARIE',
  'VEUF',
  'DIVORCE',
  'AUTRE',
] as const;
export type StatutMarital = (typeof STATUTS_MARITAUX)[number];

export const LIBELLES_STATUT_MARITAL: Record<StatutMarital, string> = {
  CELIBATAIRE: 'Célibataire',
  MARIE: 'Marié(e)',
  VEUF: 'Veuf/Veuve',
  DIVORCE: 'Divorcé(e)',
  AUTRE: 'Autre',
};

export const STATUTS_CROYANT = ['ACTIF', 'INACTIF', 'TRANSFERE', 'DECEDE'] as const;
export type StatutCroyant = (typeof STATUTS_CROYANT)[number];

export const LIBELLES_STATUT_CROYANT: Record<StatutCroyant, string> = {
  ACTIF: 'Actif',
  INACTIF: 'Inactif',
  TRANSFERE: 'Transféré',
  DECEDE: 'Décédé',
};

/** RG-12 : seuls les croyants ACTIFS alimentent les effectifs consolidés. */
export function compteDansLesEffectifs(statut: StatutCroyant): boolean {
  return statut === 'ACTIF';
}

// -----------------------------------------------------------------------------
// Matricule — EF-CRO-02, RG-29
// -----------------------------------------------------------------------------

/**
 * `<INITIALES>-<SÉQUENCE 5 chiffres>-<AA>` — ex. `MNK-00001-26`.
 *
 * Les initiales rendent le matricule reconnaissable à l'œil ; la séquence,
 * globale par année, porte seule l'unicité. Les matricules attribués sous
 * l'ancien format (`EGL-COT-2026-0147`) restent valides : un matricule est
 * immuable (RG-29).
 */
export const MATRICULE_PATTERN = /^([A-Z]{1,3})-(\d{5})-(\d{2})$/;
export const MATRICULE_PATTERN_HISTORIQUE = /^([A-Z0-9][A-Z0-9-]{2,15})-(\d{4})-(\d{4,})$/;

export interface MatriculeDecompose {
  initiales: string;
  sequence: number;
  /** Deux derniers chiffres de l'année d'enregistrement. */
  annee: number;
}

export function decomposerMatricule(matricule: string): MatriculeDecompose | null {
  const m = MATRICULE_PATTERN.exec(matricule.trim().toUpperCase());
  if (!m) return null;
  return { initiales: m[1]!, sequence: Number(m[2]), annee: Number(m[3]) };
}

/**
 * Initiales du nom puis des prénoms, dans l'ordre de saisie, trois au plus.
 *
 * Contrepartie de `fn_initiales` en SQL. Les accents sont repliés sur leur
 * lettre de base : un matricule se saisit au clavier, parfois sur un poste
 * sans disposition française.
 */
export function initialesMatricule(nom: string, prenom: string): string {
  const source = `${nom ?? ''} ${prenom ?? ''}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  const initiales = source
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((mot) => mot[0]!.toUpperCase())
    .join('');

  return initiales || 'XXX';
}

/**
 * Contrepartie de `fn_generer_matricule`. Sert à l'affichage et aux tests ; la
 * génération réelle reste en base, seule capable de garantir l'unicité de la
 * séquence face à deux saisies simultanées.
 */
export function composerMatricule(
  nom: string,
  prenom: string,
  sequence: number,
  annee: number = new Date().getFullYear(),
): string {
  const aa = String(annee % 100).padStart(2, '0');
  return `${initialesMatricule(nom, prenom)}-${String(sequence).padStart(5, '0')}-${aa}`;
}

// -----------------------------------------------------------------------------
// Dates — RG-28
// -----------------------------------------------------------------------------

function memeJourOuAvant(a: Date, b: Date): boolean {
  return a.setHours(0, 0, 0, 0) <= new Date(b).setHours(0, 0, 0, 0);
}

/**
 * RG-28 — `date_bapteme >= date_naissance`, et aucune des deux dans le futur.
 *
 * Le message nomme la date fautive : « dates incohérentes » obligerait
 * l'utilisateur à deviner laquelle corriger.
 */
export function validerDatesCroyant(
  dateNaissance: Date,
  dateBapteme: Date | null | undefined,
  aujourdhui: Date = new Date(),
): ActionResult<void> {
  if (!memeJourOuAvant(new Date(dateNaissance), aujourdhui)) {
    return ko('La date de naissance ne peut pas être dans le futur.');
  }

  // La date de bapteme est FACULTATIVE : une fiche se cree souvent avant
  // qu'elle ne soit connue. Les regles ne s'appliquent que si elle est la.
  if (!dateBapteme) return ok();

  if (!memeJourOuAvant(new Date(dateBapteme), aujourdhui)) {
    return ko('La date de baptême ne peut pas être dans le futur.');
  }
  if (!memeJourOuAvant(new Date(dateNaissance), new Date(dateBapteme))) {
    return ko('La date de baptême ne peut pas précéder la date de naissance.');
  }
  return ok();
}

/** Âge révolu en années. */
export function calculerAge(dateNaissance: Date, aujourdhui: Date = new Date()): number {
  const naissance = new Date(dateNaissance);
  let age = aujourdhui.getFullYear() - naissance.getFullYear();
  const mois = aujourdhui.getMonth() - naissance.getMonth();
  if (mois < 0 || (mois === 0 && aujourdhui.getDate() < naissance.getDate())) age--;
  return age;
}

/** Tranches d'âge des statistiques — EF-DSH-05 (pyramide des âges). */
export const TRANCHES_AGE = [
  { cle: '0-14', libelle: '0 à 14 ans', min: 0, max: 14 },
  { cle: '15-24', libelle: '15 à 24 ans', min: 15, max: 24 },
  { cle: '25-34', libelle: '25 à 34 ans', min: 25, max: 34 },
  { cle: '35-49', libelle: '35 à 49 ans', min: 35, max: 49 },
  { cle: '50-64', libelle: '50 à 64 ans', min: 50, max: 64 },
  { cle: '65+', libelle: '65 ans et plus', min: 65, max: Infinity },
] as const;

export function trancheAge(age: number): (typeof TRANCHES_AGE)[number]['cle'] {
  return (TRANCHES_AGE.find((t) => age >= t.min && age <= t.max) ?? TRANCHES_AGE[0]).cle;
}

// -----------------------------------------------------------------------------
// Nouveaux baptisés — RG-30
// -----------------------------------------------------------------------------

/** Valeur par défaut d'`organisation_settings` (ARB-5). */
export const FENETRE_NOUVEAUX_BAPTISES_JOURS = 15;

export function estNouveauBaptise(
  dateBapteme: Date | null | undefined,
  fenetreJours: number = FENETRE_NOUVEAUX_BAPTISES_JOURS,
  aujourdhui: Date = new Date(),
): boolean {
  // Sans date de bapteme, la question ne se pose pas.
  if (!dateBapteme) return false;

  const seuil = new Date(aujourdhui);
  seuil.setDate(seuil.getDate() - fenetreJours);
  seuil.setHours(0, 0, 0, 0);
  return new Date(dateBapteme).getTime() >= seuil.getTime();
}

// -----------------------------------------------------------------------------
// Doublons — EF-CRO-13
// -----------------------------------------------------------------------------

/**
 * Clé de rapprochement : même nom, même prénom, même date de naissance.
 *
 * Volontairement stricte. Un rapprochement approximatif produirait des
 * avertissements permanents sur les patronymes fréquents, que l'utilisateur
 * apprendrait à ignorer — et la détection ne servirait plus à rien.
 */
export function cleDoublon(nom: string, prenom: string, dateNaissance: Date): string {
  const normaliser = (v: string) =>
    v
      .trim()
      .toLocaleLowerCase('fr')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // accents
      .replace(/[\s-]+/g, ' ');

  const iso = new Date(dateNaissance).toISOString().slice(0, 10);
  return `${normaliser(nom)}|${normaliser(prenom)}|${iso}`;
}

/**
 * Affichage d'une personne : **NOM en capitales, puis prénoms**.
 *
 * « RAKOTONIRINA Mamitiana Nantenaina », et non l'inverse. C'est l'usage des
 * registres et des listes d'appel : le nom porte le tri et la reconnaissance,
 * il vient donc en tête.
 */
export function nomComplet(nom: string, prenom: string): string {
  return `${nom.trim().toLocaleUpperCase('fr')} ${prenom.trim()}`.trim();
}

/**
 * Deux lettres pour un avatar : initiale du nom, initiale du premier prénom.
 *
 * Distinct de `initialesMatricule`, qui en prend jusqu'à trois : ici la
 * contrainte est la lisibilité dans un cercle de 32 pixels.
 */
export function initialesAvatar(nom: string, prenom: string): string {
  const lettre = (v: string) =>
    (v ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .charAt(0)
      .toUpperCase();

  return `${lettre(nom)}${lettre(prenom)}` || '?';
}

// -----------------------------------------------------------------------------
// Filtrage de la liste — EF-CRO-04, EF-CRO-05
//
// Module PUR : c'est la contrepartie applicative des `where` SQL, deplacee
// dans le navigateur pour que le filtrage soit INSTANTANE (voir
// `lib/data/croyants.ts` pour la raison du deplacement et sa limite).
// -----------------------------------------------------------------------------

/** Normalisation commune a la recherche : casse, accents, espaces. */
export function normaliserRecherche(valeur: string): string {
  return valeur
    .trim()
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export interface CroyantFiltrable {
  nom: string;
  prenom: string;
  matricule: string;
  telephone: string | null;
  email: string | null;
  sexe: Sexe;
  statut: string;
  date_naissance: string;
  eglise_id: string;
  cellule_id: string | null;
  grade_id: string;
  nationalite_id: string;
}

export interface FiltresListeCroyants {
  recherche: string;
  /** Identifiant d'eglise, ou `null` pour tout le perimetre. */
  egliseId: string | null;
  sexe: Sexe | null;
  statut: StatutCroyant;
  /** `null` : peu importe. */
  enCellule: boolean | null;
  gradeId: string | null;
  nationaliteId: string | null;
  ageMin: number | null;
  ageMax: number | null;
}

export const FILTRES_LISTE_VIDES: FiltresListeCroyants = {
  recherche: '',
  egliseId: null,
  sexe: null,
  // Le defaut n'est pas « tous » : une liste ne montre pas les decedes sans
  // qu'on l'ait demande.
  statut: 'ACTIF',
  enCellule: null,
  gradeId: null,
  nationaliteId: null,
  ageMin: null,
  ageMax: null,
};

export function aDesFiltres(filtres: FiltresListeCroyants): boolean {
  return (
    filtres.recherche !== FILTRES_LISTE_VIDES.recherche ||
    filtres.egliseId !== FILTRES_LISTE_VIDES.egliseId ||
    filtres.sexe !== FILTRES_LISTE_VIDES.sexe ||
    filtres.statut !== FILTRES_LISTE_VIDES.statut ||
    filtres.enCellule !== FILTRES_LISTE_VIDES.enCellule ||
    filtres.gradeId !== FILTRES_LISTE_VIDES.gradeId ||
    filtres.nationaliteId !== FILTRES_LISTE_VIDES.nationaliteId ||
    filtres.ageMin !== FILTRES_LISTE_VIDES.ageMin ||
    filtres.ageMax !== FILTRES_LISTE_VIDES.ageMax
  );
}

/**
 * EF-CRO-05 — recherche libre sur nom, prenom, matricule, telephone, e-mail.
 *
 * Chaque MOT de la requete doit se retrouver quelque part : taper
 * « rakoto mami » trouve « RAKOTONIRINA Mamitiana » sans imposer l'ordre ni
 * l'exactitude des espaces. Les accents sont ignores des deux cotes.
 *
 * Le telephone est compare chiffres a chiffres : personne ne saisit un numero
 * avec les memes espaces que ceux enregistres.
 */
export function correspondRecherche(croyant: CroyantFiltrable, terme: string): boolean {
  const requete = normaliserRecherche(terme);
  if (requete === '') return true;

  const texte = normaliserRecherche(
    [croyant.nom, croyant.prenom, croyant.matricule, croyant.email ?? ''].join(' '),
  );
  const chiffres = (croyant.telephone ?? '').replace(/\D/g, '');

  return requete.split(' ').every((mot) => {
    if (texte.includes(mot)) return true;
    const motChiffres = mot.replace(/\D/g, '');
    return motChiffres !== '' && chiffres.includes(motChiffres);
  });
}

export function filtrerCroyants<T extends CroyantFiltrable>(
  croyants: readonly T[],
  filtres: FiltresListeCroyants,
  aujourdhui: Date = new Date(),
): T[] {
  return croyants.filter((c) => {
    if (c.statut !== filtres.statut) return false;
    if (filtres.egliseId && c.eglise_id !== filtres.egliseId) return false;
    if (filtres.sexe && c.sexe !== filtres.sexe) return false;
    if (filtres.gradeId && c.grade_id !== filtres.gradeId) return false;
    if (filtres.nationaliteId && c.nationalite_id !== filtres.nationaliteId) return false;

    if (filtres.enCellule === true && c.cellule_id === null) return false;
    if (filtres.enCellule === false && c.cellule_id !== null) return false;

    if (filtres.ageMin !== null || filtres.ageMax !== null) {
      const age = calculerAge(new Date(c.date_naissance), aujourdhui);
      if (filtres.ageMin !== null && age < filtres.ageMin) return false;
      if (filtres.ageMax !== null && age > filtres.ageMax) return false;
    }

    return correspondRecherche(c, filtres.recherche);
  });
}
