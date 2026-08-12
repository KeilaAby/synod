import {
  ArrowLeftRight,
  Briefcase,
  Droplets,
  LayoutDashboard,
  Network,
  SlidersHorizontal,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import type { Permission } from '@/lib/domain/permissions';

/**
 * Navigation principale — plan.md §9.1.
 *
 * Declaree une seule fois : la sidebar, le menu mobile et le fil d'Ariane
 * lisent tous cette table. Ajouter un module = ajouter une entree.
 *
 * `permission` conditionne l'AFFICHAGE de l'entree. Ce n'est pas une securite :
 * la page elle-meme revalide, et la RLS borne les donnees.
 */
export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Droit requis pour voir l'entree. `undefined` = visible par tous. */
  readonly permission?: Permission;
  /**
   * Droit qui donne acces a une file d'attente. Si l'utilisateur le detient,
   * un compteur d'elements a traiter s'affiche sur l'entree (UI-21).
   */
  readonly compteurPermission?: Permission;
  /** Cle du compteur, resolue par le layout. */
  readonly compteurCle?: 'transferts' | 'mouvements';
}

/**
 * Rapports (lot 6) et Administration (lot 7) n'ont pas encore de page. Leur
 * entree a ete retiree le 11 aout 2026 : un menu qui mene a une 404 est pire
 * qu'un menu incomplet — il fait douter du reste. Chaque lot remet la sienne
 * en meme temps que son ecran, comme Finances le 12 aout.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/tableau-de-bord',
    label: 'Tableau de bord',
    icon: LayoutDashboard,
  },
  {
    href: '/structure',
    label: 'Structure',
    icon: Network,
    permission: 'entity.read',
  },
  {
    href: '/croyants',
    label: 'Croyants',
    icon: Users,
    permission: 'croyant.read',
  },
  {
    href: '/transferts',
    label: 'Transferts',
    icon: ArrowLeftRight,
    permission: 'croyant.read',
    compteurPermission: 'transfer.approve',
    compteurCle: 'transferts',
  },
  {
    href: '/baptemes',
    label: 'Baptemes',
    icon: Droplets,
    permission: 'croyant.read',
  },
  {
    href: '/bureaux',
    label: 'Bureaux',
    icon: Briefcase,
    permission: 'bureau.read',
  },
  {
    href: '/finances',
    label: 'Finances',
    icon: Wallet,
    permission: 'finance.read',
    // UI-21 — ce qui attend une validation se compte sur l'entrée de menu.
    compteurPermission: 'finance.validate',
    compteurCle: 'mouvements',
  },
  {
    href: '/referentiels',
    label: 'Referentiels',
    icon: SlidersHorizontal,
    permission: 'referentiel.manage',
  },
];

/** Libelles du fil d'Ariane, derives de la table de navigation. */
export const LIBELLES_SEGMENTS: Record<string, string> = {
  ...Object.fromEntries(NAV_ITEMS.map((i) => [i.href.replace(/^\//, ''), i.label])),
  nouveau: 'Nouveau',
  modifier: 'Modifier',
  transferer: 'Transferer',
  liste: 'Liste',
  synthese: 'Synthese',
  'a-valider': 'A valider',
  'en-attente': 'En attente',
  delegation: 'Saisie deleguee',
  personnaliser: 'Personnaliser',
  modeles: 'Modeles',
  generer: 'Generer',
  generes: 'Rapports generes',
  editer: 'Editer',
  utilisateurs: 'Utilisateurs',
  habilitations: 'Habilitations',
  'profils-habilitation': "Profils d'habilitation",
  audit: 'Journal d audit',
  corbeille: 'Corbeille',
  parametres: 'Parametres',
  portabilite: 'Portabilite',
  'mon-compte': 'Mon compte',
};

/** Compteurs d'elements en attente, alimentes par le layout (UI-21). */
export interface CompteursAttente {
  readonly transferts?: number;
  readonly mouvements?: number;
}
