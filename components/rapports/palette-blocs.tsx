'use client';

import {
  BarChart3,
  FileImage,
  Gauge,
  Heading,
  Network,
  PenLine,
  Pilcrow,
  Scissors,
  Sigma,
  Table2,
  Clock,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  GROUPES_BLOC,
  LIBELLES_GROUPE_BLOC,
  type TypeBloc,
  blocsDuGroupe,
} from '@/lib/domain/rapport';

/**
 * La palette de l'éditeur — EF-RAP-01, EF-RAP-02.
 *
 * DEUX FAÇONS DE POSER UN BLOC, et la seconde n'est pas un luxe : on le
 * **glisse** là où on le veut, ou on **clique** pour l'ajouter à la fin de la
 * section courante. Un éditeur qui n'obéit qu'au pointeur n'est pas un éditeur
 * pour tout le monde (ENF-ACC) — et le clic est de toute façon plus rapide
 * quand on remplit une section de haut en bas.
 *
 * Les icônes vivent ICI et non dans `BLOCS_RAPPORT` : une icône est une
 * fonction React, elle ne traverse pas la frontière serveur → client
 * (règle 24). Le registre porte la clé, le client la lit.
 */

/** Le type MIME du glisser : un bloc NEUF, tiré de la palette. */
export const TYPE_BLOC_NEUF = 'application/x-synod-bloc-neuf';
/** Un bloc DÉJÀ POSÉ qu'on déplace — les deux ne se confondent jamais. */
export const TYPE_BLOC_POSE = 'application/x-synod-bloc-pose';

export const ICONES_BLOC: Record<TypeBloc, LucideIcon> = {
  TITRE: Heading,
  TEXTE: Pilcrow,
  INDICATEUR: Sigma,
  TABLEAU: Table2,
  GRAPHIQUE: BarChart3,
  JAUGE: Gauge,
  FRISE: Clock,
  ORGANIGRAMME: Network,
  IMAGE: FileImage,
  SAUT_DE_PAGE: Scissors,
  SIGNATURE: PenLine,
};

export function PaletteBlocs({
  onAjouter,
  desactivee,
}: {
  onAjouter: (type: TypeBloc) => void;
  /** Aucune section où poser : le clic n'aurait nulle part où aboutir. */
  desactivee: boolean;
}) {
  return (
    <div className="space-y-6">
      {GROUPES_BLOC.map((groupe) => (
        <div key={groupe} className="space-y-2">
          <p className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {LIBELLES_GROUPE_BLOC[groupe]}
          </p>

          <ul className="space-y-1">
            {blocsDuGroupe(groupe).map((definition) => {
              const Icone = ICONES_BLOC[definition.type];

              return (
                <li key={definition.type}>
                  <Button
                    variant="ghost"
                    // Un bouton `draggable` : le clavier l'atteint et
                    // l'actionne, la souris peut aussi l'emporter ailleurs.
                    draggable={!desactivee}
                    disabled={desactivee}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(TYPE_BLOC_NEUF, definition.type);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => onAjouter(definition.type)}
                    className="h-auto w-full cursor-grab items-start justify-start gap-3 px-2 py-2 text-left whitespace-normal"
                  >
                    <Icone
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    {/*
                      LA DESCRIPTION SE REPLIE, elle ne se tronque pas.

                      « Une carte à un chiffre — effect… » n'apprend rien de
                      plus que le libellé qui la surmonte : la seule partie
                      utile est justement celle qu'on coupait. Une infobulle
                      n'aurait pas suffi — elle demande un survol, donc de
                      savoir qu'il y a quelque chose à survoler.

                      `whitespace-normal` sur le bouton : les boutons de
                      Shadcn posent `whitespace-nowrap`, qui rendait tout
                      repliement impossible.
                    */}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {definition.libelle}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug font-normal text-muted-foreground">
                        {definition.description}
                      </span>
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
