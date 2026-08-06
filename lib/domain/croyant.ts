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

/** `<CODE_ÉGLISE>-<ANNÉE>-<SÉQUENCE>` — ex. `EGL-COT-2026-0147`. */
export const MATRICULE_PATTERN = /^([A-Z0-9][A-Z0-9-]{2,15})-(\d{4})-(\d{4,})$/;

export interface MatriculeDecompose {
  codeEglise: string;
  annee: number;
  sequence: number;
}

export function decomposerMatricule(matricule: string): MatriculeDecompose | null {
  const m = MATRICULE_PATTERN.exec(matricule.trim().toUpperCase());
  if (!m) return null;
  return {
    codeEglise: m[1]!,
    annee: Number(m[2]),
    sequence: Number(m[3]),
  };
}

/**
 * Contrepartie de `fn_generer_matricule`. Utilisée pour l'affichage et les
 * tests ; la génération réelle reste en base, seule capable de garantir
 * l'unicité de la séquence face à deux saisies simultanées.
 */
export function composerMatricule(
  codeEglise: string,
  annee: number,
  sequence: number,
): string {
  return `${codeEglise.toUpperCase()}-${annee}-${String(sequence).padStart(4, '0')}`;
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

export function nomComplet(nom: string, prenom: string): string {
  return `${prenom.trim()} ${nom.trim().toLocaleUpperCase('fr')}`;
}
