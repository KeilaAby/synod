'use client';

import dynamic from 'next/dynamic';

import { FlowSkeleton } from '@/components/skeletons';
import type { BureauComplet } from '@/lib/data/bureaux';
import type { FonctionBureau } from '@/lib/domain/bureau';
import type { DispositionPoste } from '@/lib/domain/organigramme-bureau';

import type { CandidatOption } from './designation-dialog';

/**
 * Chargement différé de l'éditeur d'organigramme — EF-BUR-07, ENF-PRF-09,
 * règle 7.
 *
 * `ssr: false` parce que le graphe mesure le DOM pour se disposer — le rendre
 * côté serveur produirait un saut de mise en page à l'hydratation.
 */
const OrganigrammeFlow = dynamic(() => import('./organigramme-flow'), {
  ssr: false,
  loading: () => <FlowSkeleton />,
});

export function OrganigrammeLoader(props: {
  bureau: BureauComplet;
  fonctions: FonctionBureau[];
  candidats: CandidatOption[];
  photos: Record<string, string>;
  dispositionInitiale: DispositionPoste[];
  peutGerer: boolean;
  /** EF-BUR-08 — délai de correction, pour le pop-up de retrait de titulaire. */
  joursDelai: number;
}) {
  return <OrganigrammeFlow {...props} />;
}
