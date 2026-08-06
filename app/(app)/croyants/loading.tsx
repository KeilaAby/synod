import { TableSkeleton } from '@/components/skeletons';

/** UI-15 — neuf colonnes, comme la table finale. */
export default function Loading() {
  return <TableSkeleton colonnes={9} lignes={10} />;
}
