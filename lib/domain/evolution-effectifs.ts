/**
 * Évolution temporelle et jalons comparatifs des effectifs — EF-DSH.
 *
 * Permet de comparer les indicateurs clés des Croyants à 5 jalons passés :
 * - Semaine passée (S-1)
 * - Mois dernier (M-1, par défaut)
 * - Trimestre dernier (T-1)
 * - Semestre dernier (Sem-1)
 * - Année dernière (N-1)
 */

export const PERIODES_EVOLUTION = [
  'SEMAINE',
  'MOIS',
  'TRIMESTRE',
  'SEMESTRE',
  'ANNEE',
] as const;

export type PeriodeEvolution = (typeof PERIODES_EVOLUTION)[number];

export const LIBELLES_PERIODE_EVOLUTION: Record<PeriodeEvolution, string> = {
  SEMAINE: 'Semaine passée',
  MOIS: 'Mois dernier',
  TRIMESTRE: 'Trimestre dernier',
  SEMESTRE: 'Semestre dernier',
  ANNEE: 'Année dernière',
};

export const ABREVIATIONS_PERIODE_EVOLUTION: Record<PeriodeEvolution, string> = {
  SEMAINE: 'S-1',
  MOIS: 'M-1',
  TRIMESTRE: 'T-1',
  SEMESTRE: 'Sem-1',
  ANNEE: 'N-1',
};

export type SensVariation = 'HAUSSE' | 'BAISSE' | 'STABLE';

export interface VariationKpi {
  readonly valeurCourante: number;
  readonly valeurPrecedente: number;
  readonly difference: number;
  /** Pourcentage de variation par rapport à la valeur précédente (ex: +12.5 pour +12,5 %). `null` si la valeur précédente était 0 et valeur courante 0. */
  readonly pourcentage: number | null;
  readonly sens: SensVariation;
}

export interface PointSerieEffectifs {
  readonly mois: string;
  readonly libelle: string;
  readonly croyants: number;
  readonly femmes: number;
  readonly hommes: number;
  readonly encellules: number;
}

export interface DonneesEvolutionEffectifs {
  /** Map `indicateur` -> `PeriodeEvolution` -> `VariationKpi` */
  readonly variations: Record<string, Record<PeriodeEvolution, VariationKpi>>;
  readonly serie: PointSerieEffectifs[];
}

/**
 * Calcule la variation absolue et relative entre une valeur courante et une valeur passée.
 */
export function calculerVariation(courant: number, precedent: number): VariationKpi {
  const c = Number.isFinite(courant) ? courant : 0;
  const p = Number.isFinite(precedent) ? precedent : 0;
  const difference = c - p;

  let pourcentage: number | null = null;
  if (p > 0) {
    pourcentage = ((c - p) / p) * 100;
  } else if (p === 0 && c > 0) {
    pourcentage = 100;
  } else if (p === 0 && c === 0) {
    pourcentage = 0;
  }

  let sens: SensVariation = 'STABLE';
  if (difference > 0) sens = 'HAUSSE';
  else if (difference < 0) sens = 'BAISSE';

  return {
    valeurCourante: c,
    valeurPrecedente: p,
    difference,
    pourcentage,
    sens,
  };
}

/**
 * Formate un pourcentage d'évolution avec signe et virgule française.
 * Exemples : `+18,4 %`, `-12,6 %`, `0,0 %`.
 */
export function formatPourcentageVariation(pourcentage: number | null): string {
  if (pourcentage === null || !Number.isFinite(pourcentage)) return '—';
  const signe = pourcentage > 0 ? '+' : '';
  return `${signe}${pourcentage.toFixed(1).replace('.', ',')} %`;
}
