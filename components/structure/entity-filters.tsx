'use client';

import { CircleCheck, CircleSlash, Layers, type LucideIcon, Search, WifiOff, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ENTITY_LABELS, ENTITY_TYPES, type EntityType } from '@/lib/domain/hierarchy';
import { cn } from '@/lib/utils';
import { formatNombre } from '@/lib/utils/format';

import { COULEURS_NIVEAU, ICONES_NIVEAU } from './type-badge';

/**
 * Filtres de la liste des entites — EF-STR-09.
 *
 * Des PICTOGRAMMES et non des listes deroulantes : les six niveaux et les
 * trois statuts sont des ensembles clos et connus. Une liste deroulante
 * demande trois gestes (ouvrir, parcourir, choisir) et cache l'etat courant
 * derriere un libelle ; ici tout est visible d'un coup d'oeil, et changer de
 * niveau ne coute qu'un clic.
 *
 * Chaque bouton porte l'effectif du niveau : on voit AVANT de cliquer qu'un
 * filtre ne donnera rien, au lieu de tomber sur une liste vide.
 */

export type FiltreActif = 'tous' | 'actifs' | 'inactifs';

export function EntityFilters({
  recherche,
  onRecherche,
  type,
  onType,
  actif,
  onActif,
  sansAcces,
  onSansAcces,
  comptesParType,
  affichees,
  total,
  onEffacer,
}: {
  recherche: string;
  onRecherche: (v: string) => void;
  type: EntityType | 'tous';
  onType: (v: EntityType | 'tous') => void;
  actif: FiltreActif;
  onActif: (v: FiltreActif) => void;
  sansAcces: boolean;
  onSansAcces: (v: boolean) => void;
  comptesParType: Record<EntityType, number>;
  affichees: number;
  total: number;
  onEffacer: () => void;
}) {
  const aDesFiltres =
    recherche !== '' || type !== 'tous' || actif !== 'tous' || sansAcces;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={recherche}
            onChange={(e) => onRecherche(e.target.value)}
            placeholder="Rechercher par nom ou par code…"
            aria-label="Rechercher une entite"
            className="h-10 w-64 pl-9"
          />
        </div>

        {/* --- Niveau hierarchique --- */}
        <div
          role="group"
          aria-label="Filtrer par niveau"
          className="flex items-center gap-1 rounded-lg border border-border bg-card p-1"
        >
          <BoutonFiltre
            icone={Layers}
            libelle="Tous les niveaux"
            actif={type === 'tous'}
            onClick={() => onType('tous')}
          />

          {ENTITY_TYPES.map((t) => (
            <BoutonFiltre
              key={t}
              icone={ICONES_NIVEAU[t]}
              libelle={ENTITY_LABELS[t].pluriel}
              badge={formatNombre(comptesParType[t])}
              actif={type === t}
              // Le filtre reprend la teinte du niveau : la meme couleur que le
              // badge de la colonne « Niveau », donc rien de nouveau a apprendre.
              classeActive={COULEURS_NIVEAU[t].badge}
              desactive={comptesParType[t] === 0}
              onClick={() => onType(type === t ? 'tous' : t)}
            />
          ))}
        </div>

        {/* --- Statut --- */}
        <div
          role="group"
          aria-label="Filtrer par statut"
          className="flex items-center gap-1 rounded-lg border border-border bg-card p-1"
        >
          <BoutonFiltre
            icone={CircleCheck}
            libelle="Entites actives"
            actif={actif === 'actifs'}
            classeActive="bg-emerald-100 text-emerald-700"
            onClick={() => onActif(actif === 'actifs' ? 'tous' : 'actifs')}
          />
          <BoutonFiltre
            icone={CircleSlash}
            libelle="Entites inactives"
            actif={actif === 'inactifs'}
            classeActive="bg-slate-200 text-slate-700"
            onClick={() => onActif(actif === 'inactifs' ? 'tous' : 'inactifs')}
          />
          {/* ARB-2 / EF-STR-10 : reperer les entites dont le Siege saisit les
              mouvements financiers demandait jusqu'ici de parcourir la liste. */}
          <BoutonFiltre
            icone={WifiOff}
            libelle="Sans acces a l'application"
            actif={sansAcces}
            classeActive="bg-amber-100 text-amber-700"
            onClick={() => onSansAcces(!sansAcces)}
          />
        </div>

        {aDesFiltres && (
          <Button variant="ghost" className="h-10" onClick={onEffacer}>
            <X className="mr-2 size-4" aria-hidden />
            Effacer
          </Button>
        )}

        <span
          className="ml-auto font-mono text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {formatNombre(affichees)} / {formatNombre(total)}
        </span>
      </div>
    </TooltipProvider>
  );
}

function BoutonFiltre({
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
