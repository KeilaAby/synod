import { DashboardSkeleton } from '@/components/skeletons';

/**
 * UI-15 — regle systematique : toute page qui charge des donnees affiche un
 * squelette calque sur sa structure finale. Jamais d'ecran blanc.
 */
export default function Loading() {
  return <DashboardSkeleton />;
}
