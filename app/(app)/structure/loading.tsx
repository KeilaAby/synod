import { FlowSkeleton, PageHeaderSkeleton } from '@/components/skeletons';

/** UI-15 — squelette calque sur la structure finale : en-tete + organigramme. */
export default function Loading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />
      <FlowSkeleton />
    </div>
  );
}
