import { StatCardSkeleton, TableSkeleton } from '@/components/skeletons';

/**
 * UI-15 — le triptyque puis le registre, dans la forme qu'ils auront.
 *
 * Un squelette qui ne ressemble pas à l'écran final fait sauter la mise en page
 * à l'arrivée des données : autant montrer un écran blanc.
 */
export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <TableSkeleton colonnes={7} lignes={10} />
    </div>
  );
}
