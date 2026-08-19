import { FormSkeleton } from '@/components/skeletons';

/** UI-15 — quatre groupes en carte, comme l'ecran des parametres. */
export default function Loading() {
  return <FormSkeleton sections={4} champsParSection={2} />;
}
