import { PageHeaderSkeleton, TableSkeleton } from '@/components/skeletons';

/**
 * UI-15 — la file dans la forme qu'elle aura.
 *
 * Un squelette qui ne ressemble pas à l'écran final fait sauter la mise en page
 * à l'arrivée des données : autant montrer un écran blanc.
 */
export default function Loading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton avecActions={false} />
      <TableSkeleton colonnes={7} lignes={8} />
    </div>
  );
}
