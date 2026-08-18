import { PageHeaderSkeleton } from '@/components/skeletons';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * UI-15 — le squelette est calqué sur la grille RÉELLE.
 *
 * Une barre, quatre onglets, puis des cartes en trois colonnes : c'est
 * exactement ce que rend `rapports-client`. Un squelette qui ment fait sauter
 * la page au moment où les données se posent — et ce saut se remarque bien plus
 * qu'une attente.
 */
export default function Loading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton avecActions={false} />

      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-10 min-w-64 flex-1" />
          <Skeleton className="h-10 w-40" />
        </div>

        <Skeleton className="h-9 w-96" /> {/* les quatre onglets */}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-4 p-6">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-20 rounded-4xl" />
                  <Skeleton className="h-5 w-24 rounded-4xl" />
                </div>
                <div className="border-t border-border pt-4">
                  <Skeleton className="h-3 w-48" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
