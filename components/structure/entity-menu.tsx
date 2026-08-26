'use client';

import { createContext, useContext, useMemo, useState } from 'react';

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
import { entreeBureauDeEntite, peutOuvrirUnAutreBureau } from '@/lib/domain/bureau';
import { ENTITY_LABELS, type EntityType, typeEnfantDe } from '@/lib/domain/hierarchy';
import { cn } from '@/lib/utils';

/**
 * UN SEUL MENU OUVERT A LA FOIS — signale le 26 aout 2026.
 *
 * LE DEFAUT. Sur l'organigramme, cliquer successivement le « ⋮ » de trois
 * entites laissait les TROIS menus ouverts, empiles sur le plan. Chaque
 * `DropdownMenu` de Radix gere son etat pour lui seul : c'est le clic « au
 * dehors » qui ferme le precedent, et React Flow intercepte les evenements
 * pointeur de son canevas avant que la couche de Radix ne les voie.
 *
 * POURQUOI ON NE CORRIGE PAS LA PROPAGATION. Parier sur l'ordre dans lequel
 * deux bibliotheques se passent un evenement pointeur, c'est reparer un
 * symptome dont la cause peut se deplacer a la prochaine mise a jour de l'une
 * ou de l'autre. Ici l'etat DEVIENT explicite : un seul identifiant ouvert,
 * tenu au-dessus des menus. Ouvrir le second ferme le premier PAR
 * CONSTRUCTION, quel que soit le chemin qu'a pris le clic.
 *
 * LE CONTEXTE EST FACULTATIF. Sans fournisseur, chaque menu reste autonome,
 * exactement comme avant — aucun appelant existant n'a a etre modifie pour
 * continuer de fonctionner. Les deux ecrans de la structure en posent un ;
 * un troisieme, plus tard, choisira.
 */
interface MenuUnique {
  readonly ouvertId: string | null;
  readonly setOuvertId: (id: string | null) => void;
}

const ContexteMenuUnique = createContext<MenuUnique | null>(null);

export function MenuEntiteUnique({ children }: { children: React.ReactNode }) {
  const [ouvertId, setOuvertId] = useState<string | null>(null);

  // La valeur est memoisee : sans cela, chaque rendu de l'ecran donnerait un
  // objet neuf, et TOUS les menus se re-rendraient a chaque frappe dans la
  // recherche.
  const valeur = useMemo<MenuUnique>(() => ({ ouvertId, setOuvertId }), [ouvertId]);

  return (
    <ContexteMenuUnique.Provider value={valeur}>{children}</ContexteMenuUnique.Provider>
  );
}

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
  /**
   * L'OUVERTURE EST CONTROLEE DES QU'UN FOURNISSEUR EST PRESENT.
   *
   * `open` et `onOpenChange` ne sont passes que dans ce cas : les fournir a
   * `undefined` ferait basculer Radix en mode controle avec un etat qui ne
   * change jamais, et le menu ne s'ouvrirait plus du tout.
   */
  const unique = useContext(ContexteMenuUnique);
  const controle = unique
    ? {
        open: unique.ouvertId === id,
        onOpenChange: (ouvert: boolean) => unique.setOuvertId(ouvert ? id : null),
      }
    : {};

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
    <DropdownMenu {...controle}>
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

        {/*
          RG-10 — UNE ENTITE PEUT AVOIR PLUSIEURS BUREAUX.

          L'entree ci-dessus dit OU EN EST le bureau ; celle-ci en ouvre un
          AUTRE. Sans elle, une entite qui avait deja un bureau n'en avait plus
          jamais un second : l'entree d'etat basculait sur « composer » ou
          « consulter », et « ouvrir un bureau » disparaissait du menu — alors
          que le pop-up des bureaux annonce la regle en toutes lettres.

          Elle ne s'affiche que la ou elle ajoute quelque chose : sans aucun
          bureau, l'entree d'etat vaut deja « creer ».
        */}
        {bureau && onBureaux && peutOuvrirUnAutreBureau(bureau.bureaux, bureau.peutGerer) && (
          <DropdownMenuItem onSelect={() => onBureaux(id, 'creer')}>
            <Briefcase className="mr-2 size-4" aria-hidden />
            Créer un nouveau bureau
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
