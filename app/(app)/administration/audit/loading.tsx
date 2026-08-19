import { TableSkeleton } from '@/components/skeletons';

/** UI-15 — une liste dense, comme le journal. */
export default function Loading() {
  return <TableSkeleton colonnes={5} lignes={12} />;
}
