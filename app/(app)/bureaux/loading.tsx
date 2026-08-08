import { TableSkeleton } from '@/components/skeletons';

/** UI-15 — cinq colonnes, comme la composition finale. */
export default function Loading() {
  return <TableSkeleton colonnes={5} lignes={8} />;
}
