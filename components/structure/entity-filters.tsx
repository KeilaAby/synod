'use client';

import { CircleCheck, CircleSlash, Layers, Search, WifiOff, X } from 'lucide-react';

import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ENTITY_LABELS, ENTITY_TYPES, type EntityType } from '@/lib/domain/hierarchy';
import { formatNombre } from '@/lib/utils/format';

import { COULEURS_NIVEAU, ICONES_NIVEAU } from './type-badge';

/**
 * Filtres de la liste des entites — EF-STR-09.
 *
 * Des PICTOGRAMMES et non des listes deroulantes : les six niveaux et les
 * trois statuts sont des ensembles clos et connus (voir `FiltreIcone`).
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
        <GroupeFiltres libelle="Filtrer par niveau">
          <FiltreIcone
            icone={Layers}
            libelle="Tous les niveaux"
            actif={type === 'tous'}
            onClick={() => onType('tous')}
          />

          {ENTITY_TYPES.map((t) => (
            <FiltreIcone
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
        </GroupeFiltres>

        {/* --- Statut --- */}
        <GroupeFiltres libelle="Filtrer par statut">
          <FiltreIcone
            icone={CircleCheck}
            libelle="Entites actives"
            actif={actif === 'actifs'}
            classeActive="bg-emerald-100 text-emerald-700"
            onClick={() => onActif(actif === 'actifs' ? 'tous' : 'actifs')}
          />
          <FiltreIcone
            icone={CircleSlash}
            libelle="Entites inactives"
            actif={actif === 'inactifs'}
            classeActive="bg-slate-200 text-slate-700"
            onClick={() => onActif(actif === 'inactifs' ? 'tous' : 'inactifs')}
          />
          {/* ARB-2 / EF-STR-10 : reperer les entites dont le Siege saisit les
              mouvements financiers demandait jusqu'ici de parcourir la liste. */}
          <FiltreIcone
            icone={WifiOff}
            libelle="Sans acces a l'application"
            actif={sansAcces}
            classeActive="bg-amber-100 text-amber-700"
            onClick={() => onSansAcces(!sansAcces)}
          />
        </GroupeFiltres>

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
