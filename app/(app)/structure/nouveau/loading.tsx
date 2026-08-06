import { FormSkeleton } from '@/components/skeletons';

/** UI-15 — trois cartes, comme le formulaire final : aucun decalage a l'arrivee. */
export default function Loading() {
  return <FormSkeleton sections={3} champsParSection={2} />;
}
