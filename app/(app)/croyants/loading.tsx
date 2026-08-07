import { TableSkeleton } from '@/components/skeletons';

/** UI-15 — dix colonnes, comme la table finale : options comprises. */
export default function Loading() {
  return <TableSkeleton colonnes={10} lignes={10} />;
}
