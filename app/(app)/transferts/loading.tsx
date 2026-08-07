import { TableSkeleton } from '@/components/skeletons';

/** UI-15 — six colonnes, comme le journal final. */
export default function Loading() {
  return <TableSkeleton colonnes={6} lignes={8} />;
}
