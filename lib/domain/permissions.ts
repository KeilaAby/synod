/**
 * Habilitations fines et delegation — plan.md §5, cdg.md §4.2, RG-24, RG-25.
 *
 * Modele : une habilitation est le couple (cle, portee).
 *   - portee `null`  -> le droit couvre tout le perimetre du compte
 *   - portee definie -> le droit est restreint a cette sous-structure et a ses
 *                       descendants
 *
 * Module PUR, entierement testable. Il double les controles SQL de
 * `0009_delegation.sql` : le SQL protege contre les appels directs, ce module
 * produit les messages destines a l'utilisateur. Les deux doivent rester
 * d'accord — les tests unitaires verrouillent cet accord.
 */

import { estDescendant } from './hierarchy';
import { type ActionResult, ko, ok } from './result';

// -----------------------------------------------------------------------------
// Catalogue
// -----------------------------------------------------------------------------

export const PERMISSION_GROUPS = [
  'Structure',
  'Croyants',
  'Bureaux',
  'Finances',
  'Rapports',
  'Pilotage',
  'Administration',
] as const;

export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

interface PermissionMeta {
  readonly label: string;
  readonly group: PermissionGroup;
  readonly description: string;
}

export const PERMISSIONS = {
  // --- Structure -------------------------------------------------------------
  'entity.read': {
    label: 'Consulter la structure',
    group: 'Structure',
    description: "Voir l'organigramme et les fiches des entites du perimetre.",
  },
  'entity.create': {
    label: 'Creer une entite',
    group: 'Structure',
    description: 'Ajouter une sous-entite sous une entite du perimetre.',
  },
  'entity.update': {
    label: 'Modifier une entite',
    group: 'Structure',
    description: 'Renommer, recoder ou rattacher une entite du perimetre.',
  },
  'entity.delete': {
    label: 'Supprimer une entite',
    group: 'Structure',
    description: 'Supprimer definitivement une entite. Reserve au Siege.',
  },

  // --- Croyants --------------------------------------------------------------
  'croyant.read': {
    label: 'Consulter les croyants',
    group: 'Croyants',
    description: 'Lister et ouvrir les fiches des croyants du perimetre.',
  },
  'croyant.create': {
    label: 'Creer un croyant',
    group: 'Croyants',
    description: 'Enregistrer un nouveau croyant dans une eglise du perimetre.',
  },
  'croyant.update': {
    label: 'Modifier un croyant',
    group: 'Croyants',
    description: "Corriger l'identite, les coordonnees ou le rattachement.",
  },
  'croyant.delete': {
    label: 'Supprimer un croyant',
    group: 'Croyants',
    description: 'Placer une fiche en corbeille. La suppression est reversible.',
  },
  'croyant.transfer': {
    label: 'Demander un transfert',
    group: 'Croyants',
    description: "Initier le transfert d'un croyant vers une autre entite.",
  },
  'transfer.approve': {
    label: 'Approuver un transfert',
    group: 'Croyants',
    description: 'Decider des demandes de transfert dont le perimetre vous revient.',
  },
  'bapteme.create': {
    label: 'Saisir un nouveau baptise',
    group: 'Croyants',
    description: 'Declarer un bapteme ; le croyant correspondant est cree.',
  },

  // --- Bureaux ---------------------------------------------------------------
  'bureau.read': {
    label: 'Consulter les bureaux',
    group: 'Bureaux',
    description: 'Voir la composition et les mandats des bureaux du perimetre.',
  },
  'bureau.manage': {
    label: 'Gerer les bureaux',
    group: 'Bureaux',
    description: 'Ouvrir un mandat, designer, remplacer ou retirer un membre.',
  },
  /**
   * Droit DISTINCT de `bureau.manage` — EF-BUR-08.
   *
   * Clore un mandat le conserve : c'est l'histoire du bureau. SUPPRIMER
   * l'efface, avec les mandats individuels qui en dependent, et les fonctions
   * occupees disparaissent des fiches des croyants concernes. Une operation qui
   * reecrit le passe ne s'accorde pas avec celle qui gere le present.
   */
  'bureau.delete': {
    label: 'Supprimer un bureau',
    group: 'Bureaux',
    description:
      "Effacer un bureau et son historique. Irreversible : preferez la cloture, qui conserve.",
  },

  // --- Finances (ARB-2 / ARB-3) ---------------------------------------------
  'finance.read': {
    label: 'Consulter les finances et le solde',
    group: 'Finances',
    description: 'Voir les mouvements, les syntheses et le solde disponible.',
  },
  'finance.create': {
    label: 'Saisir un mouvement',
    group: 'Finances',
    description: 'Enregistrer une recette ou une depense sur le perimetre.',
  },
  'finance.update': {
    label: 'Modifier un brouillon',
    group: 'Finances',
    description: 'Corriger un mouvement tant qu il n est ni soumis ni valide.',
  },
  'finance.submit': {
    label: 'Soumettre pour validation',
    group: 'Finances',
    description: 'Presenter un brouillon au circuit de validation.',
  },
  'finance.validate': {
    label: 'Valider ou rejeter un mouvement',
    group: 'Finances',
    description: 'Decider des mouvements soumis. La validation les rend immuables.',
  },
  'finance.delegate': {
    label: "Saisir pour le compte d'une entite",
    group: 'Finances',
    description:
      "Enregistrer un mouvement au nom d'une entite privee d'acces. Reserve au Siege.",
  },
  /**
   * EF-FIN-15 (adapte) — regler le workflow d'une entite.
   *
   * DISTINCT DE `settings.manage`, ET DELEGABLE. Le reglage passait par
   * `settings.manage`, qui n'est pas delegable : seul le Siege pouvait donc
   * decider, entite par entite, pour toute l'organisation. Un district qui
   * structure ses eglises devait le demander au Siege a chaque fois.
   *
   * Le lui accorder par `settings.manage` aurait ouvert AVEC lui la devise, le
   * format des matricules et la fenetre des nouveaux baptises — des reglages
   * d'organisation qu'un district n'a pas a toucher. Un droit qui ouvre plus
   * que ce qu'on veut accorder n'est pas le bon droit.
   *
   * Il se delegue AVEC SA PORTEE (RG-25) : un district le recoit pour son
   * district, et ne regle donc que ses propres eglises.
   */
  'finance.workflow.manage': {
    label: 'Regler le workflow de validation',
    group: 'Finances',
    description:
      "Activer ou desactiver la validation des ecritures, entite par entite, dans la "
      + 'portee accordee.',
  },
  /**
   * EF-FIN-18 — la levee de la separation saisie/validation.
   *
   * Elle SE DETIENT, elle ne se suppose pas. Une eglise de trois personnes n'a
   * personne d'autre pour valider ; ailleurs, laisser une seule main saisir et
   * constater efface la difference entre une comptabilite et une declaration.
   * Le droit rend donc l'exception VISIBLE — dans la matrice d'habilitation, et
   * dans le journal d'audit.
   */
  'finance.validate_own': {
    label: 'Valider ses propres mouvements',
    group: 'Finances',
    description:
      'Leve la separation entre saisie et validation. A reserver aux entites ou une '
      + 'seule personne tient les comptes.',
  },

  // --- Rapports --------------------------------------------------------------
  'report.read': {
    label: 'Consulter les rapports',
    group: 'Rapports',
    description: 'Ouvrir les modeles et les rapports generes du perimetre.',
  },
  'report.create': {
    label: 'Composer et generer un rapport',
    group: 'Rapports',
    description: 'Assembler des blocs, enregistrer un modele et produire un PDF.',
  },
  'report.publish': {
    label: 'Publier un rapport',
    group: 'Rapports',
    description: 'Rendre un rapport genere visible aux comptes du perimetre.',
  },
  'report.template.manage': {
    label: 'Gerer les modeles partages',
    group: 'Rapports',
    description: 'Publier des modeles reutilisables pour les entites filles.',
  },

  // --- Pilotage --------------------------------------------------------------
  'dashboard.configure': {
    label: 'Personnaliser son tableau de bord',
    group: 'Pilotage',
    description: 'Choisir, ordonner et dimensionner ses propres indicateurs.',
  },
  'export.data': {
    label: 'Exporter les donnees',
    group: 'Pilotage',
    description: 'Produire des exports Excel, CSV et PDF sur le perimetre.',
  },

  // --- Administration --------------------------------------------------------
  'referentiel.manage': {
    label: 'Gerer les referentiels',
    group: 'Administration',
    description: 'Grades, nationalites, fonctions et categories. Reserve au Siege.',
  },
  'user.manage': {
    label: 'Gerer les comptes',
    group: 'Administration',
    description: 'Inviter, activer et desactiver les comptes du perimetre.',
  },
  'permission.delegate': {
    label: 'Deleguer des habilitations',
    group: 'Administration',
    description:
      'Accorder a un compte du perimetre un sous-ensemble des droits que vous detenez.',
  },
  'settings.manage': {
    label: 'Modifier les parametres generaux',
    group: 'Administration',
    description:
      'Devise, fenetre des nouveaux baptises, workflow de validation. Reserve au Siege.',
  },
  'audit.read': {
    label: "Consulter le journal d'audit",
    group: 'Administration',
    description: 'Lire la trace horodatee des operations du perimetre.',
  },
  'trash.restore': {
    label: 'Restaurer depuis la corbeille',
    group: 'Administration',
    description: 'Remettre en service un element supprime logiquement.',
  },
} as const satisfies Record<string, PermissionMeta>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function estPermissionConnue(valeur: string): valeur is Permission {
  return valeur in PERMISSIONS;
}

export function permissionsDuGroupe(groupe: PermissionGroup): Permission[] {
  return ALL_PERMISSIONS.filter((p) => PERMISSIONS[p].group === groupe);
}

/**
 * RG-24 : droits jamais delegables, quel que soit le delegant.
 * DOIT rester aligne sur `fn_permissions_non_delegables()` (0009_delegation.sql).
 */
export const NON_DELEGABLES: readonly Permission[] = [
  'entity.delete',
  // Effacer l'histoire d'un bureau se decide au Siege, pas en cascade.
  'bureau.delete',
  'referentiel.manage',
  'settings.manage',
  'finance.delegate',
  /**
   * EF-FIN-18 — se dispenser de la separation saisie/validation ne se delegue
   * pas. Un compte qui le detient pourrait sinon l'accorder a celui qu'il
   * controle, et la separation ne tiendrait plus qu'a la bonne volonte de
   * celui-la meme qu'elle surveille.
   */
  'finance.validate_own',
];

export function estDelegable(permission: Permission): boolean {
  return !NON_DELEGABLES.includes(permission);
}

// -----------------------------------------------------------------------------
// Roles
// -----------------------------------------------------------------------------

export const USER_ROLES = [
  'SUPERADMIN',
  'ENTITE_ADMIN',
  'ENTITE_OPERATEUR',
  'LECTEUR',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPERADMIN: 'Administrateur du Siege',
  ENTITE_ADMIN: "Administrateur d'entite",
  ENTITE_OPERATEUR: 'Operateur de saisie',
  LECTEUR: 'Lecteur',
};

/**
 * Gabarits appliques a la CREATION d'un compte — cdg.md §4.3.
 * Ce ne sont que des points de depart : chaque droit reste ajustable
 * individuellement ensuite (EF-ADM-02).
 */
export const ROLE_TEMPLATES: Record<UserRole, readonly Permission[]> = {
  SUPERADMIN: ALL_PERMISSIONS,

  ENTITE_ADMIN: [
    'entity.read',
    'entity.create',
    'entity.update',
    'croyant.read',
    'croyant.create',
    'croyant.update',
    'croyant.delete',
    'croyant.transfer',
    'transfer.approve',
    'bapteme.create',
    'bureau.read',
    'bureau.manage',
    'finance.read',
    'finance.create',
    'finance.update',
    'finance.submit',
    'finance.validate',
    'finance.workflow.manage',
    'report.read',
    'report.create',
    'report.publish',
    'report.template.manage',
    'dashboard.configure',
    'export.data',
    'user.manage',
    'permission.delegate',
    'audit.read',
    'trash.restore',
  ],

  ENTITE_OPERATEUR: [
    'entity.read',
    'croyant.read',
    'croyant.create',
    'croyant.update',
    'bapteme.create',
    'bureau.read',
    'finance.read',
    'finance.create',
    'finance.update',
    'finance.submit',
    'report.read',
    'report.create',
    'dashboard.configure',
  ],

  LECTEUR: [
    'entity.read',
    'croyant.read',
    'bureau.read',
    'finance.read',
    'report.read',
    'export.data',
    'dashboard.configure',
  ],
};

// -----------------------------------------------------------------------------
// Session et evaluation
// -----------------------------------------------------------------------------

/** Un octroi : la cle, et le chemin de sa portee (null = tout le perimetre). */
export interface OctroiHabilitation {
  readonly permission: Permission;
  /** Chemin ltree de la sous-structure ; `null` = tout le perimetre du compte. */
  readonly scopePath: string | null;
}

/** L'utilisateur courant, tel que le charge le layout applicatif une seule fois. */
export interface SessionUtilisateur {
  readonly profileId: string;
  readonly role: UserRole;
  readonly entityId: string;
  /** Chemin ltree de l'entite de rattachement : la racine du perimetre (RG-20). */
  readonly scopePath: string;
  readonly permissions: readonly OctroiHabilitation[];
}

export function estSuperAdmin(session: SessionUtilisateur): boolean {
  return session.role === 'SUPERADMIN';
}

/**
 * Le droit est-il DETENU, quelle que soit sa portee ?
 * A n'utiliser que pour l'affichage d'une entree de menu. Toute action
 * concrete doit passer par `peut()`, qui evalue aussi la portee.
 */
export function detient(session: SessionUtilisateur, permission: Permission): boolean {
  if (estSuperAdmin(session)) return true;
  return session.permissions.some((o) => o.permission === permission);
}

/**
 * Controle de reference — contrepartie exacte de la fonction SQL `can()`.
 *
 * Trois conditions cumulatives :
 *   1. l'entite visee est dans le perimetre du compte  (RG-20)
 *   2. le droit est detenu                             (RG-24)
 *   3. la portee de l'octroi couvre l'entite visee     (RG-25)
 */
export function peut(
  session: SessionUtilisateur,
  permission: Permission,
  cheminEntite: string,
): boolean {
  if (estSuperAdmin(session)) return true;

  // 1. perimetre
  if (!estDescendant(cheminEntite, session.scopePath)) return false;

  // 2 + 3. detention et portee
  return session.permissions.some(
    (o) =>
      o.permission === permission &&
      (o.scopePath === null || estDescendant(cheminEntite, o.scopePath)),
  );
}

/**
 * Portee effective d'un droit : la plus LARGE des portees detenues.
 * C'est la borne superieure de ce que le compte peut deleguer (RG-24).
 * Retourne `null` si le droit n'est pas detenu du tout.
 */
export function porteeEffective(
  session: SessionUtilisateur,
  permission: Permission,
): string | null {
  if (estSuperAdmin(session)) return session.scopePath;

  const portees = session.permissions
    .filter((o) => o.permission === permission)
    .map((o) => o.scopePath ?? session.scopePath);

  if (portees.length === 0) return null;

  // La portee la plus large est celle dont le chemin est le plus court.
  return portees.reduce((la, plus) => (plus.split('.').length < la.split('.').length ? plus : la));
}

// -----------------------------------------------------------------------------
// Delegation — RG-24
// -----------------------------------------------------------------------------

export interface CibleDelegation {
  /** Chemin ltree de l'entite de rattachement du compte beneficiaire. */
  readonly cheminEntite: string;
}

export interface OctroiDemande {
  readonly permission: Permission;
  /** Chemin ltree de la portee demandee ; `null` = tout le perimetre de la cible. */
  readonly cheminPortee: string | null;
}

/**
 * RG-24 — on ne delegue QUE ce que l'on detient, a un compte de SON perimetre,
 * pour une portee INCLUSE dans la sienne.
 *
 * Les messages sont destines a l'utilisateur : ils disent *pourquoi* le refus,
 * pour que l'administrateur comprenne au lieu de subir (plan.md §10.6).
 */
export function peutDeleguer(
  delegant: SessionUtilisateur,
  cible: CibleDelegation,
  octroi: OctroiDemande,
): ActionResult<void> {
  if (estSuperAdmin(delegant)) return ok();

  if (!detient(delegant, 'permission.delegate')) {
    return ko("Vous n'etes pas autorise a deleguer des habilitations.");
  }

  if (!estDelegable(octroi.permission)) {
    return ko(
      `« ${PERMISSIONS[octroi.permission].label} » est reserve a l'administration du Siege ` +
        'et ne peut pas etre delegue.',
    );
  }

  if (!estDescendant(cible.cheminEntite, delegant.scopePath)) {
    return ko("Ce compte n'appartient pas a votre perimetre.");
  }

  const porteeDetenue = porteeEffective(delegant, octroi.permission);
  if (porteeDetenue === null) {
    return ko(
      `Vous ne detenez pas « ${PERMISSIONS[octroi.permission].label} » ` +
        "et ne pouvez donc pas l'accorder.",
    );
  }

  const porteeAccordee = octroi.cheminPortee ?? cible.cheminEntite;
  if (!estDescendant(porteeAccordee, porteeDetenue)) {
    return ko(
      'La portee demandee depasse celle de votre propre habilitation ' +
        `sur « ${PERMISSIONS[octroi.permission].label} ».`,
    );
  }

  return ok();
}

/**
 * Droits qu'un delegant peut effectivement proposer dans l'interface.
 * Sert a griser — et non a masquer — les cases inaccessibles (plan.md §10.6).
 */
export function permissionsDeleguables(delegant: SessionUtilisateur): Permission[] {
  if (estSuperAdmin(delegant)) return ALL_PERMISSIONS;
  if (!detient(delegant, 'permission.delegate')) return [];
  return ALL_PERMISSIONS.filter((p) => estDelegable(p) && detient(delegant, p));
}
