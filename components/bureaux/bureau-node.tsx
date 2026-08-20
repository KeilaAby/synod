'use client';

import { Handle, type NodeProps, Position } from '@xyflow/react';
import {
  CircleSlash,
  CornerDownRight,
  EyeOff,
  MoreVertical,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';

import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  /** EF-BUR-08 — clôt le mandat du titulaire : la fonction redevient vacante. */
  surRetirerTitulaire?: (fonctionId: string) => void;
  /**
   * EF-BUR-07 — ôte le bloc du plan ; la fonction retourne dans la palette.
   * Le référentiel n'est jamais touché.
   */
  surOterDuPlan?: (fonctionId: string) => void;
  /**
   * EF-BUR-07 — le poste se dessine A CÔTÉ DU TRONC de son supérieur, pas dans
   * la rangée de ses frères : c'est l'adjoint, le cabinet.
   *
   * Il ne change ni la parenté ni le niveau — seulement le placement, et
   * seulement à l'impression : à l'écran, chacun pose ses blocs où il veut.
   */
  enDerivation?: boolean;
  /**
   * Injecte AU RENDU : les liens vivent dans l'etat de l'editeur, pas dans la
   * donnee du noeud. Sans superieur, il n'y a pas de tronc auquel s'accrocher.
   */
  aUnSuperieur?: boolean;
  surBasculerDerivation?: (fonctionId: string) => void;
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

  /**
   * Ce qu'on peut faire d'un bloc, et dans cet ordre.
   *
   * Retirer le titulaire vient AVANT ôter le bloc, parce que c'est l'ordre
   * réel : un poste occupé ne quitte pas le plan — le laisser partir
   * démettrait quelqu'un sans le dire (EF-BUR-08).
   */
  const menu = !d.peutGerer
    ? []
    : [
        ...(d.titulaire && d.surRetirerTitulaire
          ? [
              {
                libelle: 'Retirer le titulaire',
                icone: UserMinus,
                destructif: false,
                action: () => d.surRetirerTitulaire!(d.fonctionId),
              },
            ]
          : []),
        /*
          EF-BUR-07 — L'ENTRÉE N'APPARAÎT QUE SI LE BLOC A UN SUPÉRIEUR.

          Une dérivation s'accroche au tronc de quelqu'un ; sans lien, il n'y a
          pas de tronc, et le geste n'aurait nulle part où poser le bloc. La
          proposer quand même donnerait un réglage qui ne se voit pas — le
          contraire de ce qu'on veut d'un plan.
        */
        ...(d.surBasculerDerivation && d.aUnSuperieur
          ? [
              {
                libelle: d.enDerivation
                  ? 'Remettre dans la rangée'
                  : 'Poser en dérivation',
                icone: CornerDownRight,
                destructif: false,
                action: () => d.surBasculerDerivation!(d.fonctionId),
              },
            ]
          : []),
        ...(!d.titulaire && d.surOterDuPlan
          ? [
              {
                libelle: 'Ôter du plan',
                icone: EyeOff,
                destructif: true,
                action: () => d.surOterDuPlan!(d.fonctionId),
              },
            ]
          : []),
      ];

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
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-foreground text-xs font-semibold">{d.fonction}</span>
            {/* RG-31 — ce qui fait un « membre de finances ». */}
            {d.estFinanciere && <StatusBadge tone="accent">Finances</StatusBadge>}
            {/*
              EF-BUR-07 — LE RÉGLAGE SE VOIT À L'ÉCRAN, alors qu'il ne change
              que le papier. Sans ce repère, on ne saurait qu'un bloc est en
              dérivation qu'en imprimant — donc trop tard pour le corriger.
            */}
            {d.enDerivation && (
              <StatusBadge tone="neutral">
                <CornerDownRight className="mr-1 inline size-3" aria-hidden />
                Dérivation
              </StatusBadge>
            )}
          </span>

          {/* Le même menu ⋮ que partout ailleurs. Un raccourci clavier ne se
              découvre pas : ce qui se fait sur un bloc doit s'y lire. */}
          {menu.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Actions sur ${d.fonction}`}
                  className="nodrag text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-slate-100"
                >
                  <MoreVertical className="size-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-60">
                {menu.map((entree) => (
                  <DropdownMenuItem
                    key={entree.libelle}
                    className={entree.destructif ? 'text-destructive focus:text-destructive' : ''}
                    onSelect={entree.action}
                  >
                    <entree.icone className="mr-2 size-4" aria-hidden />
                    {entree.libelle}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {d.titulaire ? (
          <div className="flex items-center gap-3">
            <AvatarCroyant
              nom={d.titulaire.nom}
              prenom={d.titulaire.prenom}
              url={d.titulaire.photoUrl}
            />
            {/* Le nom se REPLIE au lieu d'être coupé : « RAKOTONIRINA Ma… » ne
                désigne personne, et c'est précisément ce qu'on vient lire sur
                un organigramme. La photo garde sa taille — c'est le texte qui
                cède, pas elle. */}
            <span className="min-w-0 flex-1">
              <span className="text-foreground block text-sm leading-tight font-medium break-words">
                {d.titulaire.nom} {d.titulaire.prenom}
              </span>
              <span className="text-muted-foreground mt-0.5 block font-mono text-xs tabular-nums">
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
