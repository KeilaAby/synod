import { TableSkeleton } from '@/components/skeletons';

/** UI-15 — six colonnes, comme la table finale : zero decalage a l'arrivee. */
export default function Loading() {
  return <TableSkeleton colonnes={6} lignes={8} />;
}
