'use client';

import {
  Briefcase,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  UserRoundPlus,
  Users,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { entreeBureauDeEntite } from '@/lib/domain/bureau';
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
  bureau,
  peutAjouterCroyant,
  onOuvrir,
  onCreerEnfant,
  onModifier,
  onSupprimer,
  onBureaux,
  onAjouterCroyant,
  repli,
  className,
}: {
  id: string;
  nom: string;
  type: EntityType;
  peutModifier: boolean;
  /**
   * Etat des bureaux de l'entite — EF-BUR-01. Un compte par bureau suffit a
   * choisir l'entree ; la composition elle-meme ne se charge qu'a l'ouverture
   * du pop-up, et seulement pour l'entite qu'on regarde.
   */
  bureau?: { bureaux: readonly { nbMembres: number }[]; peutGerer: boolean };
  /** RG-04 — un croyant se rattache a une eglise, eventuellement a une cellule. */
  peutAjouterCroyant?: boolean;
  onOuvrir: (id: string) => void;
  onCreerEnfant: (id: string) => void;
  onModifier: (id: string) => void;
  onSupprimer: (id: string) => void;
  onBureaux?: (id: string, action: 'creer' | 'consulter') => void;
  onAjouterCroyant?: (id: string) => void;
  /** Propre a l'organigramme : la liste n'a pas de branches a replier. */
  repli?: { replie: boolean; nbEnfants: number; onBasculer: (id: string) => void };
  className?: string;
}) {
  const typeEnfant = typeEnfantDe(type);

  // La REGLE est dans le domaine (`entreeBureauDeEntite`) ; ici, seulement de
  // quoi l'habiller — un mot et un pictogramme.
  const entree =
    bureau && onBureaux ? entreeBureauDeEntite(bureau.bureaux, bureau.peutGerer) : null;

  const HABILLAGE = {
    creer: { libelle: 'Composer un bureau', icone: Briefcase },
    composer: {
      libelle: bureau?.peutGerer ? 'Composer le bureau' : 'Bureau de cette entite',
      icone: UserPlus,
    },
    consulter: { libelle: 'Membres du bureau', icone: Users },
  } as const;

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

        {/* RG-04 / RG-05 — un croyant se rattache a une EGLISE, et seulement a
            une cellule de cette eglise. L'entree n'a donc de sens qu'a ces deux
            niveaux : la proposer sur un district conduirait a un formulaire
            dont le rattachement resterait a choisir, ce que le geste promettait
            d'eviter. */}
        {peutAjouterCroyant && onAjouterCroyant && (type === 'EGLISE' || type === 'CELLULE') && (
          <DropdownMenuItem onSelect={() => onAjouterCroyant(id)}>
            <UserRoundPlus className="mr-2 size-4" aria-hidden />
            Ajouter un croyant
          </DropdownMenuItem>
        )}

        {/* EF-BUR-01 — le bureau se compose depuis la structure : c'est la que
            l'on regarde une entite, et le bureau EST une de ses proprietes. */}
        {entree && (
          <DropdownMenuItem
            onSelect={() => onBureaux!(id, entree === 'creer' ? 'creer' : 'consulter')}
          >
            {(() => {
              const Icone = HABILLAGE[entree].icone;
              return <Icone className="mr-2 size-4" aria-hidden />;
            })()}
            {HABILLAGE[entree].libelle}
            {entree === 'consulter' && (
              <span className="text-muted-foreground ml-auto font-mono text-xs tabular-nums">
                {bureau!.bureaux.reduce((n, b) => n + b.nbMembres, 0)}
              </span>
            )}
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
