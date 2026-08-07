'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Filtre a bascule represente par un pictogramme — UI-07.
 *
 * Employe partout ou l'ensemble des valeurs est CLOS et CONNU : niveaux
 * hierarchiques, statuts, sexe. Une liste deroulante y coute trois gestes
 * (ouvrir, parcourir, choisir) et cache l'etat courant derriere un libelle ;
 * ici tout est visible d'un coup d'oeil et bascule d'un clic.
 *
 * Pour un ensemble OUVERT — grades, nationalites, entites — la liste
 * deroulante ou le selecteur arborescent restent la bonne reponse.
 */
export function FiltreIcone({
  icone: Icone,
  libelle,
  badge,
  actif,
  classeActive = 'bg-slate-900 text-white',
  desactive = false,
  onClick,
}: {
  icone: LucideIcon;
  libelle: string;
  /** Effectif affiche dans l'infobulle : on voit avant de cliquer. */
  badge?: ReactNode;
  actif: boolean;
  classeActive?: string;
  desactive?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          // `aria-pressed` : un lecteur d'ecran annonce l'etat du filtre, que
          // la couleur seule ne transmet pas (ENF-ACC-02).
          aria-pressed={actif}
          aria-label={libelle}
          disabled={desactive && !actif}
          className={cn(
            'flex size-8 items-center justify-center rounded-md transition-colors',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            actif
              ? classeActive
              : 'text-muted-foreground hover:bg-slate-100 hover:text-foreground',
            desactive && !actif && 'cursor-not-allowed opacity-40 hover:bg-transparent',
          )}
        >
          <Icone className="size-4" aria-hidden />
        </button>
      </TooltipTrigger>

      <TooltipContent side="bottom">
        {libelle}
        {badge !== undefined && (
          <span className="font-mono tabular-nums opacity-70">{badge}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** Regroupe des `FiltreIcone` en un segment visuellement solidaire. */
export function GroupeFiltres({
  libelle,
  children,
}: {
  libelle: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={libelle}
      className="flex items-center gap-1 rounded-lg border border-border bg-card p-1"
    >
      {children}
    </div>
  );
}
