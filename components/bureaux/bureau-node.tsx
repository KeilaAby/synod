'use client';

import { Handle, type NodeProps, Position } from '@xyflow/react';
import { CircleSlash, UserPlus } from 'lucide-react';
import { useState } from 'react';

import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';

/**
 * Un poste dans l'organigramme d'un bureau — EF-BUR-07.
 *
 * Un poste VACANT n'est pas masqué et n'est pas relégué : il garde son rang, en
 * pointillé, avec l'action qui le comble. C'est ce qui rend le taux de
 * couverture lisible d'un coup d'œil — un organigramme qui ne montre que les
 * postes pourvus donne toujours l'image d'un bureau complet.
 */

export interface DonneesNoeudPoste extends Record<string, unknown> {
  fonctionId: string;
  fonction: string;
  estFinanciere: boolean;
  /** Absent si la fonction est vacante. */
  titulaire: { nom: string; prenom: string; matricule: string; photoUrl: string | null } | null;
  anciennete: string;
  peutGerer: boolean;
  surDesigner: (fonctionId: string) => void;
  /**
   * EF-BUR-07 — désignation par glisser-déposer depuis la liste des croyants
   * éligibles. Absent en lecture seule : le bloc n'est alors pas une cible, et
   * rien ne laisse croire qu'on peut y déposer quelque chose.
   */
  surDeposerCroyant?: (fonctionId: string, croyantId: string) => void;
}

/**
 * Les formats d'échange du glisser-déposer, tenus au même endroit.
 *
 * Deux formats DISTINCTS et non un seul avec un discriminant : c'est le format
 * qui décide de la cible. Un croyant ne se dépose que sur un bloc, une fonction
 * que sur le plan — et le navigateur écarte tout seul ce qui ne correspond pas.
 */
export const TYPE_CROYANT_GLISSE = 'application/x-synod-croyant';
export const TYPE_FONCTION_GLISSE = 'application/x-synod-fonction';

export function NoeudPoste({ data }: NodeProps) {
  const d = data as unknown as DonneesNoeudPoste;
  const [survole, setSurvole] = useState(false);

  const accepteDepot = d.surDeposerCroyant !== undefined && d.peutGerer;

  return (
    <div
      onDragOver={
        accepteDepot
          ? (e) => {
              // Sans `preventDefault`, le navigateur refuse le dépôt : c'est ce
              // qui distingue une cible d'une zone quelconque.
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setSurvole(true);
            }
          : undefined
      }
      onDragLeave={accepteDepot ? () => setSurvole(false) : undefined}
      onDrop={
        accepteDepot
          ? (e) => {
              e.preventDefault();
              setSurvole(false);
              const croyantId = e.dataTransfer.getData(TYPE_CROYANT_GLISSE);
              if (croyantId) d.surDeposerCroyant!(d.fonctionId, croyantId);
            }
          : undefined
      }
      className={cn(
        'w-56 rounded-xl border bg-card p-4 transition-colors',
        d.titulaire
          ? 'border-border hover:border-slate-300'
          : 'border-dashed border-amber-300 bg-amber-50/40',
        // La cible se signale PENDANT le geste : un survol qui ne change rien
        // laisse douter que le dépôt sera pris.
        survole && 'border-solid border-indigo-500 ring-2 ring-indigo-200',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2 !border-2 !border-card !bg-slate-300"
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground text-xs font-semibold">{d.fonction}</span>
          {/* RG-31 — ce qui fait un « membre de finances ». */}
          {d.estFinanciere && <StatusBadge tone="accent">Finances</StatusBadge>}
        </div>

        {d.titulaire ? (
          <div className="flex items-center gap-3">
            <AvatarCroyant
              nom={d.titulaire.nom}
              prenom={d.titulaire.prenom}
              url={d.titulaire.photoUrl}
            />
            <span className="min-w-0">
              <span className="text-foreground block truncate text-sm font-medium">
                {d.titulaire.nom} {d.titulaire.prenom}
              </span>
              <span className="text-muted-foreground block font-mono text-xs tabular-nums">
                {d.anciennete}
              </span>
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <span className="flex items-center gap-2 text-sm text-amber-700">
              <CircleSlash className="size-4" aria-hidden />
              Vacante
            </span>

            {d.peutGerer && (
              <button
                type="button"
                onClick={() => d.surDesigner(d.fonctionId)}
                className="nodrag flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-50"
              >
                <UserPlus className="size-3.5" aria-hidden />
                Désigner un membre
              </button>
            )}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-2 !border-2 !border-card !bg-slate-300"
      />
    </div>
  );
}
