import {
  ChartSkeleton,
  PageHeaderSkeleton,
  StatCardSkeleton,
  TableSkeleton,
} from '@/components/skeletons';

/** Règle 4 — aucune page sans squelette, jamais d'écran blanc. */
export default function Loading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton avecActions={false} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      <ChartSkeleton />
      <TableSkeleton colonnes={5} lignes={6} avecEntete={false} avecFiltres={false} />
    </div>
  );
}
