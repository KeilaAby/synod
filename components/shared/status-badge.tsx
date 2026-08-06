import { cn } from '@/lib/utils';

/**
 * Badge de statut — UI-08.
 *
 * Palette imposee par les designrules, sans variation possible : c'est ce qui
 * permet de lire un statut de la meme facon dans un tableau de mouvements, une
 * file de validation et un rapport PDF.
 */

export const TONES = {
  /** Valide · Approuve · Objectif atteint · Solde positif */
  success: 'bg-emerald-100 text-emerald-700',
  /** Soumis · En attente d'approbation · En risque */
  warning: 'bg-amber-100 text-amber-700',
  /** Rejete · Refuse · Critique · Solde negatif */
  danger: 'bg-rose-100 text-rose-700',
  /** Brouillon · Annule · Inactif */
  neutral: 'bg-slate-100 text-slate-700',
  /** En cours — reserve a l'accent, cf. UI-06 */
  accent: 'bg-indigo-50 text-indigo-700',
} as const;

export type Tone = keyof typeof TONES;

export function StatusBadge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Correspondance statut metier -> ton visuel.
 * Centralisee ici pour qu'un statut ne prenne jamais deux couleurs selon
 * l'ecran qui l'affiche.
 */
export const TON_MOUVEMENT: Record<string, Tone> = {
  BROUILLON: 'neutral',
  SOUMIS: 'warning',
  VALIDE: 'success',
  REJETE: 'danger',
  ANNULE: 'neutral',
};

export const TON_TRANSFERT: Record<string, Tone> = {
  DEMANDE: 'warning',
  APPROUVE: 'accent',
  EFFECTUE: 'success',
  REFUSE: 'danger',
  ANNULE: 'neutral',
};

export const TON_CROYANT: Record<string, Tone> = {
  ACTIF: 'success',
  INACTIF: 'neutral',
  TRANSFERE: 'accent',
  DECEDE: 'neutral',
};

/** UI-08 / EF-FIN-13 — un solde negatif se signale toujours en « Critique ». */
export function tonSolde(solde: number): Tone {
  return solde < 0 ? 'danger' : 'success';
}
