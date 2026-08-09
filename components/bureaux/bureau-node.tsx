'use client';

import { Handle, type NodeProps, Position } from '@xyflow/react';
import { CircleSlash, UserPlus } from 'lucide-react';

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
}

export function NoeudPoste({ data }: NodeProps) {
  const d = data as unknown as DonneesNoeudPoste;

  return (
    <div
      className={cn(
        'w-56 rounded-xl border bg-card p-4 transition-colors',
        d.titulaire
          ? 'border-border hover:border-slate-300'
          : 'border-dashed border-amber-300 bg-amber-50/40',
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
