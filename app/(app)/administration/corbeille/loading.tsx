import { TableSkeleton } from '@/components/skeletons';

/** UI-15 — une liste, comme la corbeille. */
export default function Loading() {
  return <TableSkeleton colonnes={4} lignes={8} avecFiltres={false} />;
}
