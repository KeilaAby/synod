import { FormSkeleton } from '@/components/skeletons';

/** UI-15 — un formulaire court : entite, periode. */
export default function Loading() {
  return <FormSkeleton sections={1} champsParSection={3} />;
}
