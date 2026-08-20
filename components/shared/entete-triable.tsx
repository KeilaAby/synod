'use client';

import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';

import { TableHead } from '@/components/ui/table';
import { type EtatTri, ariaSort } from '@/lib/domain/tri';
import { cn } from '@/lib/utils';

/**
 * Un en-tete de colonne sur lequel on peut cliquer pour trier — EF-CRO-04.
 *
 * UN BOUTON, PAS UN `onClick` SUR LA CELLULE. Une cellule cliquable n'est pas
 * atteignable au clavier, ne s'annonce pas comme actionnable et ne se declenche
 * pas a la barre d'espace. Le bouton coute trois lignes et rend la table
 * utilisable sans souris — §18.3 l'exige.
 *
 * LE CHEVRON EST TOUJOURS LA, meme sur les colonnes non triees : en gris pale
 * et a double pointe. Ne le montrer qu'au survol cacherait au clavier — et sur
 * un ecran tactile, ou il n'y a pas de survol, la fonction serait invisible.
 *
 * `aria-sort` porte pour le lecteur d'ecran ce que le chevron dit a l'oeil.
 */
export function EnteteTriable<C extends string>({
  colonne,
  etat,
  onTrier,
  children,
  className,
  alignementDroite,
}: {
  colonne: C;
  etat: EtatTri<C> | null;
  onTrier: (colonne: C) => void;
  children: React.ReactNode;
  className?: string;
  /** Les colonnes de nombres s'alignent a droite ; leur chevron suit. */
  alignementDroite?: boolean;
}) {
  const actif = etat?.colonne === colonne;
  const Chevron = !actif ? ChevronsUpDown : etat.sens === 'asc' ? ChevronUp : ChevronDown;

  return (
    <TableHead
      aria-sort={ariaSort(etat, colonne)}
      className={cn('p-0', alignementDroite && 'text-right', className)}
    >
      <button
        type="button"
        onClick={() => onTrier(colonne)}
        className={cn(
          'flex h-10 w-full items-center gap-1 px-2 font-medium transition-colors',
          'focus-visible:ring-ring hover:text-indigo-700 focus-visible:ring-2 focus-visible:outline-none',
          alignementDroite && 'justify-end',
        )}
      >
        {children}
        <Chevron
          className={cn(
            'size-3.5 shrink-0',
            actif ? 'text-indigo-700' : 'text-muted-foreground/50',
          )}
          aria-hidden
        />
      </button>
    </TableHead>
  );
}
