/**
 * La periode d'une synthese financiere — EF-FIN-24.
 *
 * TOUT EST EN CHAINES « AAAA-MM-JJ », jamais en `Date`. Une colonne `date` de
 * PostgreSQL n'a pas de fuseau ; lui en inventer un a deja fait basculer une
 * collecte du 31 aout dans le mois de septembre, parce que `getMonth()` lit
 * l'heure LOCALE. Ici, une periode d'aout doit commencer le 1er aout pour tout
 * le monde, a Antananarivo comme ailleurs.
 *
 * Les seuls calculs qui passent par `Date` le font en UTC et sur le seul point
 * ou l'arithmetique de chaines ne suffit pas : le nombre de jours d'un mois.
 */

export const GRANULARITES = ['MOIS', 'TRIMESTRE', 'ANNEE'] as const;
export type Granularite = (typeof GRANULARITES)[number];

export const LIBELLES_GRANULARITE: Record<Granularite, string> = {
  MOIS: 'Mensuelle',
  TRIMESTRE: 'Trimestrielle',
  ANNEE: 'Annuelle',
};

/**
 * Une granularite lue d'une URL en est-elle vraiment une ?
 *
 * Un parametre d'URL est du TEXTE QUELCONQUE. Le passer tel quel a
 * `bornesPeriode` donnerait les bornes du mois — le repli du `else` final —
 * sous un libelle qui annoncerait autre chose : l'ecran mentirait sur ce qu'il
 * compte, sans erreur nulle part.
 */
export function estGranularite(valeur: unknown): valeur is Granularite {
  return typeof valeur === 'string' && (GRANULARITES as readonly string[]).includes(valeur);
}

const MOIS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

export interface Bornes {
  readonly debut: string;
  readonly fin: string;
}

/** Le nombre de jours d'un mois — le seul calcul que les chaines ne rendent pas. */
function dernierJour(annee: number, mois: number): number {
  // Le jour 0 du mois suivant EST le dernier du mois courant. En UTC, donc
  // insensible au fuseau de la machine qui execute.
  return new Date(Date.UTC(annee, mois, 0)).getUTCDate();
}

function decomposer(jour: string): { annee: number; mois: number } {
  return {
    annee: Number.parseInt(jour.slice(0, 4), 10),
    mois: Number.parseInt(jour.slice(5, 7), 10),
  };
}

const deuxChiffres = (n: number) => String(n).padStart(2, '0');

/**
 * Les bornes de la periode qui CONTIENT ce jour.
 *
 * L'ancre est un jour quelconque de la periode, pas son premier : l'ecran
 * s'ouvre sur « aujourd'hui », et c'est la periode d'aujourd'hui qu'on veut.
 */
export function bornesPeriode(granularite: Granularite, ancre: string): Bornes {
  const { annee, mois } = decomposer(ancre);

  if (granularite === 'ANNEE') {
    return { debut: `${annee}-01-01`, fin: `${annee}-12-31` };
  }

  if (granularite === 'TRIMESTRE') {
    // Le trimestre se deduit du mois, jamais d'un reglage : janvier a mars est
    // le premier, quel que soit l'exercice comptable — l'organisation n'en a
    // pas declare d'autre.
    const premier = Math.floor((mois - 1) / 3) * 3 + 1;
    const dernier = premier + 2;
    return {
      debut: `${annee}-${deuxChiffres(premier)}-01`,
      fin: `${annee}-${deuxChiffres(dernier)}-${dernierJour(annee, dernier)}`,
    };
  }

  return {
    debut: `${annee}-${deuxChiffres(mois)}-01`,
    fin: `${annee}-${deuxChiffres(mois)}-${dernierJour(annee, mois)}`,
  };
}

/**
 * La periode voisine — `pas` negatif pour reculer.
 *
 * Rend le PREMIER JOUR de la periode obtenue : reculer d'un mois depuis le
 * 31 mars donnerait sinon un 31 fevrier, que `Date` corrigerait en 3 mars et
 * l'on aurait saute fevrier entier.
 */
export function decalerPeriode(
  granularite: Granularite,
  ancre: string,
  pas: number,
): string {
  const { debut } = bornesPeriode(granularite, ancre);
  const { annee, mois } = decomposer(debut);

  const enMois = granularite === 'ANNEE' ? 12 : granularite === 'TRIMESTRE' ? 3 : 1;
  const total = (annee * 12 + (mois - 1)) + pas * enMois;

  return `${Math.floor(total / 12)}-${deuxChiffres((total % 12) + 1)}-01`;
}

/** Ce qui s'affiche au-dessus de la synthese : « Août 2026 », « T3 2026 ». */
export function libellePeriode(granularite: Granularite, ancre: string): string {
  const { annee, mois } = decomposer(bornesPeriode(granularite, ancre).debut);

  if (granularite === 'ANNEE') return `Année ${annee}`;
  if (granularite === 'TRIMESTRE') {
    return `T${Math.floor((mois - 1) / 3) + 1} ${annee}`;
  }

  const nom = MOIS_FR[mois - 1];
  return `${nom.charAt(0).toLocaleUpperCase('fr')}${nom.slice(1)} ${annee}`;
}

/** L'abscisse d'un point de la courbe : « août », et l'annee si elle change. */
export function libelleMois(jour: string, avecAnnee = false): string {
  const { annee, mois } = decomposer(jour);
  const nom = MOIS_FR[mois - 1];
  return avecAnnee ? `${nom.slice(0, 4)} ${String(annee).slice(2)}` : nom.slice(0, 4);
}

export interface LigneCategorie {
  readonly sens: string;
  readonly montant: number;
}

export interface TotauxSynthese {
  readonly recettes: number;
  readonly depenses: number;
  readonly solde: number;
}

/**
 * Les trois nombres qui coiffent la synthese.
 *
 * Le solde est une SOUSTRACTION, pas une lecture : `fn_finance_solde` repond
 * pour un cumul depuis toujours, quand une synthese repond pour une periode
 * bornee. Confondre les deux ferait afficher un solde de tresorerie sous un
 * titre qui annonce un resultat de periode — deux nombres plausibles, et un
 * seul repond a la question posee.
 */
export function totauxDeSynthese(lignes: readonly LigneCategorie[]): TotauxSynthese {
  const recettes = lignes
    .filter((l) => l.sens === 'RECETTE')
    .reduce((s, l) => s + Number(l.montant), 0);
  const depenses = lignes
    .filter((l) => l.sens === 'DEPENSE')
    .reduce((s, l) => s + Number(l.montant), 0);

  return { recettes, depenses, solde: recettes - depenses };
}

/**
 * La part d'une categorie dans son sens, en pourcentage.
 *
 * Rapportee au TOTAL DE SON SENS, jamais au total general : « les dimes font
 * 60 % » se comprend comme 60 % des recettes, et rapporter une recette a la
 * somme des recettes et des depenses donnerait un nombre que personne
 * n'interprete.
 */
export function partDeCategorie(montant: number, totalDuSens: number): number {
  if (totalDuSens <= 0) return 0;
  return (Number(montant) / totalDuSens) * 100;
}
