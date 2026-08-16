'use client';

import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';

import {
  type TableauExportable,
  exporterCsv,
  exporterPdf,
  exporterXlsx,
} from '@/components/finances/exporter';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatNombre } from '@/lib/utils/format';

/**
 * Le déclencheur des trois exports — EF-FIN-25.
 *
 * LE TABLEAU EST CONSTRUIT À L'OUVERTURE, pas à chaque rendu : `tableau` est
 * une fonction. La sélection d'un registre change à chaque frappe dans la
 * recherche, et reconstruire quelques milliers de lignes de tableur à chacune
 * ferait ramer la saisie pour un fichier que personne n'a demandé.
 *
 * LE NOMBRE DE LIGNES EST ANNONCÉ sur le menu. C'est ce qui rattache le fichier
 * à ce qu'on vient de lire : « 34 lignes » confirme qu'on exporte bien la
 * sélection filtrée, et non tout le périmètre.
 */
export function BoutonExport({
  tableau,
  nombre,
  libelle = 'Exporter',
  formats = ['XLSX', 'CSV', 'PDF'],
}: {
  tableau: () => TableauExportable;
  nombre: number;
  libelle?: string;
  /**
   * Les formats offerts — les trois par défaut.
   *
   * Un écran qui s'imprime lui-même (le tableau de bord) retire le PDF d'ici :
   * deux boutons produisant deux PDF différents du même écran feraient hésiter
   * avant chaque clic, et l'un des deux serait toujours le mauvais.
   */
  formats?: readonly ('XLSX' | 'CSV' | 'PDF')[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-10" disabled={nombre === 0}>
          <Download className="mr-2 size-4" aria-hidden />
          {libelle}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="font-normal">
          <span className="tabular-nums">{formatNombre(nombre)}</span> ligne
          {nombre > 1 ? 's' : ''} — la sélection affichée.
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* L'ordre suit l'usage : retravailler, reprendre ailleurs, transmettre. */}
        {formats.includes('XLSX') && (
          <DropdownMenuItem onSelect={() => exporterXlsx(tableau())}>
            <FileSpreadsheet className="mr-2 size-4" aria-hidden />
            <span className="flex flex-col">
              Classeur Excel
              <span className="text-muted-foreground text-xs">
                Les montants restent des nombres.
              </span>
            </span>
          </DropdownMenuItem>
        )}

        {formats.includes('CSV') && (
          <DropdownMenuItem onSelect={() => exporterCsv(tableau())}>
            <FileText className="mr-2 size-4" aria-hidden />
            <span className="flex flex-col">
              CSV
              <span className="text-muted-foreground text-xs">
                Pour un autre logiciel.
              </span>
            </span>
          </DropdownMenuItem>
        )}

        {formats.includes('PDF') && (
          <DropdownMenuItem onSelect={() => exporterPdf(tableau())}>
            <Printer className="mr-2 size-4" aria-hidden />
            <span className="flex flex-col">
              PDF
              <span className="text-muted-foreground text-xs">
                Une pièce datée, qu&apos;on ne retouche pas.
              </span>
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
