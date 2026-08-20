import {
  ArrowLeftRight,
  Briefcase,
  Droplets,
  FileText,
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
 * Administration (lot 7) n'a pas encore de page. Son entree a ete retiree le
 * 11 aout 2026 : un menu qui mene a une 404 est pire qu'un menu incomplet — il
 * fait douter du reste. Chaque lot remet la sienne en meme temps que son ecran
 * — Finances le 12 aout, Rapports le 18.
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
    /**
     * UI-21 — ce qui attend une validation se compte sur l'entree de menu.
     *
     * Le badge ne DETOURNE pas le lien : « Finances » mene aux finances. C'est
     * l'ecran qui renvoie ensuite vers la file (EF-FIN-21), par un bandeau
     * qu'on ne peut pas manquer — un menu dont l'entree change de destination
     * selon un compteur est un menu auquel on cesse de se fier.
     */
    compteurPermission: 'finance.validate',
    compteurCle: 'mouvements',
  },
  {
    /**
     * EF-RAP-07 a 11 — la bibliotheque de modeles.
     *
     * `report.read` et non `report.create` : consulter les modeles mis a
     * disposition est le cas le plus courant, composer est le geste rare. Une
     * entree conditionnee au droit d'ecrire cacherait la bibliotheque a ceux
     * qui n'en lisent que le contenu.
     */
    href: '/rapports',
    label: 'Rapports',
    icon: FileText,
    permission: 'report.read',
  },
  {
    href: '/referentiels',
    label: 'Referentiels',
    icon: SlidersHorizontal,
    permission: 'referentiel.manage',
  },
];

/**
 * Les ecrans qui reclament toute la largeur — UI-21.
 *
 * La bibliotheque de modeles range ses cartes en trois colonnes, et l'editeur
 * pose trois panneaux dont deux ont une largeur FIXE : tout ce qu'on prend
 * ailleurs est retire a la composition, au milieu, qui est la seule chose qu'on
 * regarde. La navigation s'y replie donc d'elle-meme.
 *
 * ELLE RESTE DEPLOYABLE : le repli est un DEFAUT, pas un verrou. Et il ne
 * touche pas a la preference memorisee — on la retrouve intacte en sortant,
 * sans avoir eu a la reposer.
 */
export const CHEMINS_LARGES: readonly string[] = [
  '/rapports',
  /*
   * L'organigramme est un GRAPHE : il se dispose lui-meme, en largeur, et une
   * branche de six niveaux n'a nulle part ou aller si la fenetre se retrecit.
   * C'est exactement le cas ou la navigation prend la place de ce qu'on est
   * venu regarder. La vue liste partage le chemin et en profite aussi : sa
   * table porte huit colonnes.
   */
  '/structure',
];

export function estEcranLarge(chemin: string): boolean {
  return CHEMINS_LARGES.some((p) => chemin === p || chemin.startsWith(`${p}/`));
}

/** Libelles du fil d'Ariane, derives de la table de navigation. */
export const LIBELLES_SEGMENTS: Record<string, string> = {
  ...Object.fromEntries(NAV_ITEMS.map((i) => [i.href.replace(/^\//, ''), i.label])),
  nouveau: 'Nouveau',
  modifier: 'Modifier',
  transferer: 'Transferer',
  liste: 'Liste',
  synthese: 'Synthese',
  'a-valider': 'A valider',
  consolide: 'Vue consolidee',
  dimes: 'Dimes',
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
