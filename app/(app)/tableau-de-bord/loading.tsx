import { DashboardSkeleton } from '@/components/skeletons';

/**
 * UI-15 — regle systematique : toute page qui charge des donnees affiche un
 * squelette calque sur sa structure finale. Jamais d'ecran blanc.
 *
 * LE FOND BLANC VIENT DU GABARIT depuis le 20 aout 2026 : ce squelette n'a plus
 * a le redemander. Il l'a longtemps fait, sinon l'ecran s'ouvrait sur le gris de
 * page puis basculait au blanc quand les donnees se posaient — un clignotement
 * que le squelette est precisement cense eviter (EF-DSH-11).
 */
export default function Loading() {
  return <DashboardSkeleton />;
}
