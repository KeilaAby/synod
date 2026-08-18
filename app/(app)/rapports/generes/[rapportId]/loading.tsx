import { Skeleton } from '@/components/ui/skeleton';

/** UI-15 — une feuille A4, comme le rendu qui va s'y poser. */
export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full max-w-2xl" />
      <div className="flex justify-center bg-slate-100 p-6">
        <Skeleton className="aspect-[210/297] w-full max-w-[210mm]" />
      </div>
    </div>
  );
}
