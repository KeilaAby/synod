'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatNombre } from '@/lib/utils/format';

/**
 * Pagination — EF-CRO-04.
 *
 * Elle ne navigue plus : les croyants du périmètre sont déjà en mémoire, elle
 * ne fait que découper l'affichage. Changer de page est donc instantané, et
 * borner le DOM reste nécessaire — quelques milliers de lignes rendues d'un
 * bloc suffisent à saccader le défilement.
 *
 * Volontairement sobre : précédent / suivant et le rang courant, plutôt qu'une
 * ribambelle de numéros. Ce sont les filtres qui font converger, pas la
 * navigation page à page.
 */
export function Pagination({
  page,
  nbPages,
  total,
  onPage,
}: {
  page: number;
  nbPages: number;
  total: number;
  onPage: (cible: number) => void;
}) {
  if (nbPages <= 1) return null;

  return (
    <nav
      className="flex items-center justify-between gap-4"
      aria-label="Pagination des croyants"
    >
      <p className="font-mono text-xs tabular-nums text-muted-foreground">
        Page {formatNombre(page)} sur {formatNombre(nbPages)} · {formatNombre(total)} croyants
      </p>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="h-10"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="mr-2 size-4" aria-hidden />
          Précédent
        </Button>

        <Button
          variant="outline"
          className="h-10"
          disabled={page >= nbPages}
          onClick={() => onPage(page + 1)}
        >
          Suivant
          <ChevronRight className="ml-2 size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
