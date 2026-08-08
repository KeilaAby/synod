'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight, Users, WifiOff } from 'lucide-react';
import { memo } from 'react';

import { ENTITY_LABELS, type EntityType } from '@/lib/domain/hierarchy';
import { formatNombre } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

import { EntityMenu } from './entity-menu';
import { COULEURS_NIVEAU } from './type-badge';

/**
 * Noeud de l'organigramme — EF-STR-05, EF-STR-01.
 *
 * `memo` est indispensable : sans lui, chaque deplacement du canevas
 * re-rendrait l'integralite des noeuds (ENF-PRF-03, 60 fps sur 1 000 noeuds).
 *
 * Les poignees (`Handle`) sont ce qui rend le rattachement direct possible :
 * tirer un trait de la poignee basse d'une entite mere vers la poignee haute
 * d'une autre la rattache (EF-STR-07).
 */

export interface DonneesNoeudEntite extends Record<string, unknown> {
  nom: string;
  code: string;
  type: EntityType;
  nbDescendants: number;
  nbEnfants: number;
  sansAcces: boolean;
  actif: boolean;
  replie: boolean;
  peutModifier: boolean;
  /** EF-BUR-01 — de quoi choisir l'entree « bureau » du menu, sans plus. */
  bureau: { bureaux: readonly { nbMembres: number }[]; peutGerer: boolean };
  /** RG-04 — vrai seulement la ou un croyant peut effectivement etre cree. */
  peutAjouterCroyant: boolean;
  surReplier: (id: string) => void;
  surOuvrir: (id: string) => void;
  surCreerEnfant: (id: string) => void;
  surModifier: (id: string) => void;
  surSupprimer: (id: string) => void;
  surBureaux: (id: string, action: 'creer' | 'consulter') => void;
  surAjouterCroyant: (id: string) => void;
}

function NoeudEntiteBrut({ id, data, selected, dragging }: NodeProps) {
  const d = data as unknown as DonneesNoeudEntite;
  const couleurs = COULEURS_NIVEAU[d.type];

  return (
    <div
      className={cn(
        'w-56 rounded-xl border border-l-4 border-border bg-card p-4 transition-colors',
        couleurs.bordure,
        selected ? 'border-slate-400 ring-2 ring-ring/40' : 'hover:border-slate-300',
        // Pendant le glissement, le noeud s'allege pour laisser voir la cible.
        dragging && 'opacity-80 shadow-lg',
        !d.actif && 'opacity-60',
      )}
    >
      {/* Cible de rattachement : c'est ici qu'on relache un trait venu d'un parent. */}
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2.5 !border-2 !border-card !bg-slate-400"
      />

      <div className="flex items-start justify-between gap-2">
        <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', couleurs.badge)}>
          {ENTITY_LABELS[d.type].singulier}
        </span>

        <div className="flex items-center gap-1">
          {/* ARB-2 / EF-STR-10 : entite dont la saisie est assuree par le Siege. */}
          {d.sansAcces && (
            <span title="Sans acces a l'application — saisie assuree par le Siege">
              <WifiOff className="size-4 text-slate-400" aria-hidden />
            </span>
          )}

          {/* `nodrag` : sans cette classe, React Flow intercepterait le clic
              pour demarrer un glissement et le menu ne s'ouvrirait pas. */}
          <EntityMenu
            id={id}
            nom={d.nom}
            type={d.type}
            peutModifier={d.peutModifier}
            bureau={d.bureau}
            peutAjouterCroyant={d.peutAjouterCroyant}
            onOuvrir={d.surOuvrir}
            onCreerEnfant={d.surCreerEnfant}
            onModifier={d.surModifier}
            onSupprimer={d.surSupprimer}
            onBureaux={d.surBureaux}
            onAjouterCroyant={d.surAjouterCroyant}
            repli={{
              replie: d.replie,
              nbEnfants: d.nbEnfants,
              onBasculer: d.surReplier,
            }}
            className="nodrag"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => d.surOuvrir(id)}
        className="nodrag mt-2 block w-full text-left transition-colors hover:text-indigo-700"
      >
        <p className="truncate text-sm font-semibold text-foreground">{d.nom}</p>
        <p className="font-mono text-xs text-muted-foreground">{d.code}</p>
      </button>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" aria-hidden />
          <span className="font-mono tabular-nums">{formatNombre(d.nbDescendants)}</span>
          <span>sous-entite{d.nbDescendants > 1 ? 's' : ''}</span>
        </span>

        {d.nbEnfants > 0 && (
          <button
            type="button"
            onClick={() => d.surReplier(id)}
            aria-label={d.replie ? 'Deployer la branche' : 'Replier la branche'}
            aria-expanded={!d.replie}
            className="nodrag flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground"
          >
            {d.replie ? (
              <ChevronRight className="size-4" aria-hidden />
            ) : (
              <ChevronDown className="size-4" aria-hidden />
            )}
          </button>
        )}
      </div>

      {d.replie && d.nbEnfants > 0 && (
        <p className="mt-2 rounded-md bg-slate-50 px-2 py-1 text-center text-xs text-muted-foreground">
          {formatNombre(d.nbEnfants)} branche{d.nbEnfants > 1 ? 's' : ''} repliee
          {d.nbEnfants > 1 ? 's' : ''}
        </p>
      )}

      {/* Source de rattachement : on tire un trait d'ici vers une entite fille. */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-2.5 !border-2 !border-card !bg-slate-400"
      />
    </div>
  );
}

export const NoeudEntite = memo(NoeudEntiteBrut);
