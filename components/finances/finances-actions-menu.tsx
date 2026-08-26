'use client';

import {
  CalendarCheck,
  ChartColumn,
  Coins,
  LayoutList,
  Menu,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { ClotureDialog } from '@/components/finances/cloture-dialog';
import { WorkflowDialog, type LigneReglage } from '@/components/finances/workflow-dialog';
import { PermissionGate } from '@/components/shared/permission-gate';
import type { OptionEntite } from '@/components/structure/entity-picker';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PeriodeClose } from '@/lib/data/finances';
import type { MouvementFiltrable } from '@/lib/domain/finance';

/**
 * Menu d'actions consolidé pour le module Finances — EF-FIN-01.
 *
 * Regroupe les navigations secondaires (Dîmes, Synthèse, Vue consolidée)
 * et les outils d'administration comptable (Clôture, Workflow) sous un bouton
 * hamburger épuré, tout en maintenant visibles les alertes directes
 * (« À valider » et « Accès à l'application »).
 */
export function FinancesActionsMenu({
  arbreLength,
  entites,
  closes,
  mouvements,
  reglages,
  defautOrganisation,
}: {
  arbreLength: number;
  entites: OptionEntite[];
  closes: PeriodeClose[];
  mouvements: readonly MouvementFiltrable[];
  reglages: LigneReglage[];
  defautOrganisation: boolean;
}) {
  const [clotureOuvert, setClotureOuvert] = useState(false);
  const [workflowOuvert, setWorkflowOuvert] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10"
            aria-label="Menu des options financières"
            title="Options"
          >
            <Menu className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-1.5">
            Navigation & Outils
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem asChild className="cursor-pointer px-3 py-2">
            <Link href="/finances/dimes" className="flex items-start gap-3">
              <Coins className="size-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden />
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-sm leading-tight text-foreground">Dîmes</span>
                <span className="text-xs text-muted-foreground font-normal leading-normal">
                  Relevé des collectes et versements par fidèle
                </span>
              </div>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild className="cursor-pointer px-3 py-2">
            <Link href="/finances/synthese" className="flex items-start gap-3">
              <ChartColumn className="size-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden />
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-sm leading-tight text-foreground">Synthèse</span>
                <span className="text-xs text-muted-foreground font-normal leading-normal">
                  Bilan périodique et répartition par catégorie
                </span>
              </div>
            </Link>
          </DropdownMenuItem>

          {arbreLength > 1 && (
            <DropdownMenuItem asChild className="cursor-pointer px-3 py-2">
              <Link href="/finances/consolide" className="flex items-start gap-3">
                <LayoutList className="size-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden />
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-sm leading-tight text-foreground">Vue consolidée</span>
                  <span className="text-xs text-muted-foreground font-normal leading-normal">
                    Comparaison des soldes de tout le périmètre
                  </span>
                </div>
              </Link>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <PermissionGate perm="finance.periode.close">
            <DropdownMenuItem
              onSelect={() => setClotureOuvert(true)}
              className="cursor-pointer px-3 py-2 flex items-start gap-3"
            >
              <CalendarCheck className="size-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden />
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm leading-tight text-foreground">Clôture</span>
                  {closes.length > 0 && (
                    <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums text-foreground">
                      {closes.length}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground font-normal leading-normal">
                  Arrêter et verrouiller les écritures d&apos;un mois
                </span>
              </div>
            </DropdownMenuItem>
          </PermissionGate>

          <PermissionGate perm="finance.workflow.manage">
            <DropdownMenuItem
              onSelect={() => setWorkflowOuvert(true)}
              className="cursor-pointer px-3 py-2 flex items-start gap-3"
            >
              <SlidersHorizontal className="size-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden />
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className="font-medium text-sm leading-tight text-foreground">Workflow de validation</span>
                <span className="text-xs text-muted-foreground font-normal leading-normal">
                  Circuit d&apos;approbation des écritures par entité
                </span>
              </div>
            </DropdownMenuItem>
          </PermissionGate>
        </DropdownMenuContent>
      </DropdownMenu>

      <ClotureDialog
        entites={entites}
        closes={closes}
        mouvements={mouvements}
        ouvert={clotureOuvert}
        surChangerOuvert={setClotureOuvert}
        sansDeclencheur
      />

      <WorkflowDialog
        lignes={reglages}
        defautOrganisation={defautOrganisation}
        ouvert={workflowOuvert}
        surChangerOuvert={setWorkflowOuvert}
        sansDeclencheur
      />
    </>
  );
}
