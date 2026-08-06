'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { formatNombre } from '@/lib/utils/format';

/**
 * Pagination serveur — ENF-PRF-08.
 *
 * Volontairement sobre : précédent / suivant et le rang courant, plutôt qu'une
 * ribambelle de numéros. Sur 8 000 pages, une liste de numéros n'aide personne ;
 * ce sont les filtres qui font converger, pas la navigation page à page.
 */
export function Pagination({
  page,
  nbPages,
  total,
}: {
  page: number;
  nbPages: number;
  total: number;
}) {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  const [enCours, demarrer] = useTransition();

  if (nbPages <= 1) return null;

  function aller(cible: number) {
    const suivants = new URLSearchParams(params.toString());
    if (cible <= 1) suivants.delete('page');
    else suivants.set('page', String(cible));

    demarrer(() => {
      router.replace(`${chemin}${suivants.size ? `?${suivants}` : ''}`, { scroll: true });
    });
  }

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
          disabled={page <= 1 || enCours}
          onClick={() => aller(page - 1)}
        >
          <ChevronLeft className="mr-2 size-4" aria-hidden />
          Précédent
        </Button>

        <Button
          variant="outline"
          className="h-10"
          disabled={page >= nbPages || enCours}
          onClick={() => aller(page + 1)}
        >
          Suivant
          <ChevronRight className="ml-2 size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
