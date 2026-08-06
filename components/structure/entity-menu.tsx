'use client';

import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ENTITY_LABELS, type EntityType, typeEnfantDe } from '@/lib/domain/hierarchy';
import { cn } from '@/lib/utils';

/**
 * Menu d'actions d'une entite — EF-STR-01, EF-STR-06, EF-STR-08.
 *
 * UN SEUL menu pour l'organigramme et pour la vue liste : le meme icone, les
 * memes entrees, dans le meme ordre. Deux menus jumeaux auraient diverge des
 * la premiere action ajoutee, et l'utilisateur aurait du reapprendre la vue
 * qu'il n'utilise pas au quotidien.
 *
 * Les habilitations sont evaluees par l'appelant (`peutModifier`), mais chaque
 * action reste revalidee cote serveur : ce composant n'est qu'un confort.
 */
export function EntityMenu({
  id,
  nom,
  type,
  peutModifier,
  onOuvrir,
  onCreerEnfant,
  onModifier,
  onSupprimer,
  repli,
  className,
}: {
  id: string;
  nom: string;
  type: EntityType;
  peutModifier: boolean;
  onOuvrir: (id: string) => void;
  onCreerEnfant: (id: string) => void;
  onModifier: (id: string) => void;
  onSupprimer: (id: string) => void;
  /** Propre a l'organigramme : la liste n'a pas de branches a replier. */
  repli?: { replie: boolean; nbEnfants: number; onBasculer: (id: string) => void };
  className?: string;
}) {
  const typeEnfant = typeEnfantDe(type);

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
        {peutModifier && typeEnfant && (
          <>
            <DropdownMenuItem onSelect={() => onCreerEnfant(id)}>
              <Plus className="mr-2 size-4" aria-hidden />
              Nouvelle structure
              <span className="ml-auto text-xs text-muted-foreground">
                {ENTITY_LABELS[typeEnfant].singulier}
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem onSelect={() => onOuvrir(id)}>
          <ExternalLink className="mr-2 size-4" aria-hidden />
          Ouvrir la fiche
        </DropdownMenuItem>

        {peutModifier && (
          <DropdownMenuItem onSelect={() => onModifier(id)}>
            <Pencil className="mr-2 size-4" aria-hidden />
            Modifier
          </DropdownMenuItem>
        )}

        {repli && repli.nbEnfants > 0 && (
          <DropdownMenuItem onSelect={() => repli.onBasculer(id)}>
            {repli.replie ? (
              <ChevronDown className="mr-2 size-4" aria-hidden />
            ) : (
              <ChevronRight className="mr-2 size-4" aria-hidden />
            )}
            {repli.replie ? 'Deployer la branche' : 'Replier la branche'}
          </DropdownMenuItem>
        )}

        {/* RG-03 : le Siege est la racine, il ne se supprime pas. */}
        {peutModifier && type !== 'SIEGE' && (
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
