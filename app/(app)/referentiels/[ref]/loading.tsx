import { TableSkeleton } from '@/components/skeletons';

/** UI-15 — table de referentiel : quatre colonnes, sans barre de filtres. */
export default function Loading() {
  return <TableSkeleton colonnes={4} lignes={6} avecFiltres={false} />;
}
