'use client';

import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Frise horizontale de progression — UI-11.
 *
 * Un formulaire découpé sans repère visible désoriente : l'utilisateur ne sait
 * ni où il en est, ni combien il reste. La frise répond aux deux questions
 * d'un coup d'œil.
 *
 * En modification, les étapes sont cliquables : la fiche existe déjà et toutes
 * ses valeurs sont valides, rien ne justifie d'imposer un parcours linéaire
 * pour corriger un numéro de téléphone.
 */

export interface Etape {
  readonly cle: string;
  readonly titre: string;
  readonly description: string;
}

export function FriseEtapes({
  etapes,
  courante,
  onAller,
}: {
  etapes: readonly Etape[];
  /** Index de l'étape courante, à partir de 0. */
  courante: number;
  /** Fourni en modification : rend les étapes cliquables. */
  onAller?: (index: number) => void;
}) {
  return (
    <nav aria-label="Progression du formulaire">
      <ol className="flex items-center gap-2">
        {etapes.map((etape, index) => {
          const faite = index < courante;
          const active = index === courante;
          const cliquable = Boolean(onAller);

          return (
            <li key={etape.cle} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={cliquable ? () => onAller?.(index) : undefined}
                disabled={!cliquable}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                  cliquable && 'hover:bg-slate-50',
                  !cliquable && 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold transition-colors',
                    active && 'bg-slate-900 text-white',
                    faite && 'bg-emerald-100 text-emerald-700',
                    !active && !faite && 'bg-slate-100 text-slate-500',
                  )}
                >
                  {faite ? (
                    <Check className="size-4" aria-hidden />
                  ) : (
                    <span className="font-mono tabular-nums">{index + 1}</span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-sm font-medium',
                      active ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {etape.titre}
                  </span>
                  <span className="hidden truncate text-xs text-muted-foreground sm:block">
                    {etape.description}
                  </span>
                </span>
              </button>

              {/* Trait de liaison, jamais après la dernière étape. */}
              {index < etapes.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'hidden h-px w-8 shrink-0 md:block',
                    faite ? 'bg-emerald-300' : 'bg-border',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
