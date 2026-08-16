import { DashboardSkeleton } from '@/components/skeletons';

/**
 * UI-15 — regle systematique : toute page qui charge des donnees affiche un
 * squelette calque sur sa structure finale. Jamais d'ecran blanc.
 *
 * `data-fond` EST REPRIS ICI. Sans lui, l'ecran s'ouvrirait sur le gris de page
 * puis basculerait au blanc au moment ou les donnees se posent — un clignotement
 * que le squelette est precisement cense eviter (EF-DSH-11).
 */
export default function Loading() {
  return (
    <div data-fond="blanc">
      <DashboardSkeleton />
    </div>
  );
}
