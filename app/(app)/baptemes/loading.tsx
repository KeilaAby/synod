import { TableSkeleton } from '@/components/skeletons';

/** UI-15 — sept colonnes, comme le registre final. */
export default function Loading() {
  return <TableSkeleton colonnes={7} lignes={10} />;
}
