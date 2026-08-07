'use client';

import { ArrowLeftRight, ExternalLink, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Menu d'actions d'un croyant — EF-CRO-04, EF-CRO-07, EF-CRO-12.
 *
 * Meme icone, meme ordre d'entrees que le menu des entites : une application ou
 * chaque liste invente sa propre grammaire oblige a reapprendre chaque ecran.
 *
 * `peutModifier` et `peutSupprimer` sont evalues avec la PORTEE de l'eglise du
 * croyant (RG-25) ; chaque action reste revalidee cote serveur.
 */
export function CroyantMenu({
  id,
  nom,
  peutModifier,
  peutTransferer,
  peutSupprimer,
  onModifier,
  onTransferer,
  onSupprimer,
  className,
}: {
  id: string;
  nom: string;
  peutModifier: boolean;
  peutTransferer: boolean;
  peutSupprimer: boolean;
  onModifier: (id: string) => void;
  onTransferer: (id: string) => void;
  onSupprimer: (id: string) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground',
            className,
          )}
          aria-label={`Actions sur ${nom}`}
        >
          <MoreVertical className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href={`/croyants/${id}`}>
            <ExternalLink className="mr-2 size-4" aria-hidden />
            Ouvrir la fiche
          </Link>
        </DropdownMenuItem>

        {peutModifier && (
          <DropdownMenuItem onSelect={() => onModifier(id)}>
            <Pencil className="mr-2 size-4" aria-hidden />
            Modifier
          </DropdownMenuItem>
        )}

        {/* EF-TRF-01 — le rattachement ne se change QUE par transfert : il est
            absent du formulaire de modification, il doit donc etre ici. */}
        {peutTransferer && (
          <DropdownMenuItem onSelect={() => onTransferer(id)}>
            <ArrowLeftRight className="mr-2 size-4" aria-hidden />
            Transferer
          </DropdownMenuItem>
        )}

        {peutSupprimer && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onSupprimer(id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 size-4" aria-hidden />
              Supprimer
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
