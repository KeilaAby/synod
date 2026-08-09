import { FlowSkeleton, PageHeaderSkeleton } from '@/components/skeletons';

/**
 * Règle 4 — aucune page sans squelette. Ni écran blanc, ni spinner plein
 * écran : la forme de ce qui arrive est connue d'avance, autant la montrer.
 */
export default function ChargementOrganigramme() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />
      <FlowSkeleton />
    </div>
  );
}
