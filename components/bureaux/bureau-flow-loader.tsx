'use client';

import dynamic from 'next/dynamic';

import { Skeleton } from '@/components/ui/skeleton';
import type { MembreBureau } from '@/lib/data/bureaux';
import type { PosteBureau } from '@/lib/domain/bureau';

/**
 * Chargement différé de l'organigramme de bureau — EF-BUR-07, ENF-PRF-09,
 * règle 7.
 *
 * React Flow pèse ~120 ko. La vue par défaut d'une composition est le
 * TABLEAU — celui qui compose ne fait que ça — et l'écrasante majorité des
 * ouvertures ne réclame jamais le graphe : le charger d'emblée ferait payer à
 * tous ce dont peu se servent.
 *
 * `ssr: false` parce que le graphe mesure le DOM pour se disposer.
 *
 * Le repli est un squelette AUX DIMENSIONS DÉFINITIVES — même hauteur que le
 * graphe — pour que le pop-up ne sursaute pas à l'arrivée du module (UI-15).
 */
const BureauFlow = dynamic(() => import('./bureau-flow'), {
  ssr: false,
  loading: () => (
    <div className="border-border h-[28rem] w-full space-y-6 rounded-xl border bg-slate-50/60 p-8">
      <Skeleton className="mx-auto h-32 w-56 rounded-xl" />
      <div className="flex justify-center gap-8">
        <Skeleton className="h-32 w-56 rounded-xl" />
        <Skeleton className="h-32 w-56 rounded-xl" />
      </div>
    </div>
  ),
});

export function BureauFlowLoader(props: {
  postes: PosteBureau[];
  membres: MembreBureau[];
  photos: Record<string, string>;
  peutGerer: boolean;
  onDesigner: (fonctionId: string) => void;
}) {
  return <BureauFlow {...props} />;
}
