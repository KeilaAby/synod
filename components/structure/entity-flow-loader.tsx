'use client';

import dynamic from 'next/dynamic';

import { FlowSkeleton } from '@/components/skeletons';

import type { OptionsCroyant } from '@/components/croyants/croyant-dialog';
import type { ApercuBureaux } from '@/lib/data/bureaux';
import type { ChiffresStructure } from '@/lib/data/structure-chiffres';

import type { EntiteFlux } from './entite';

/**
 * Chargement differe de React Flow — ENF-PRF-09, UI-18.
 *
 * La bibliotheque pese ~120 ko : elle n'a rien a faire dans le bundle initial.
 * `ssr: false` parce que le graphe mesure le DOM pour se disposer — le rendre
 * cote serveur produirait un saut de mise en page a l'hydratation.
 *
 * Le `fallback` est le squelette d'organigramme, aux dimensions definitives :
 * jamais d'ecran blanc (UI-15).
 */
const EntityFlow = dynamic(() => import('./entity-flow'), {
  ssr: false,
  loading: () => <FlowSkeleton />,
});

export function EntityFlowLoader({
  entites,
  apercuBureaux,
  optionsCroyant,
  chiffresStructure,
  joursDelai,
}: {
  entites: EntiteFlux[];
  apercuBureaux: ApercuBureaux;
  optionsCroyant: OptionsCroyant;
  chiffresStructure: ChiffresStructure;
  /** EF-BUR-08 — délai de correction, pour le pop-up de retrait de titulaire. */
  joursDelai: number;
}) {
  return (
    <EntityFlow
      entites={entites}
      apercuBureaux={apercuBureaux}
      optionsCroyant={optionsCroyant}
      chiffresStructure={chiffresStructure}
      joursDelai={joursDelai}
    />
  );
}
