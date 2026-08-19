import { PageHeaderSkeleton } from '@/components/skeletons';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** UI-15 — des cartes en trois colonnes, comme la liste des comptes. */
export default function Loading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 p-6">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-48" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-24 rounded-4xl" />
              </div>
              <div className="border-t border-border pt-3">
                <Skeleton className="h-3 w-36" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
