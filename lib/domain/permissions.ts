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

/**
 * JUSQU'OU PORTE UN DROIT ACCORDE — RG-25 (precise le 19 aout 2026).
 *
 * `DESCENDANTE` : le droit vaut pour l'entite designee ET tout son sous-arbre.
 * `PROPRE`      : il vaut pour cette entite SEULE.
 *
 * LA PORTEE EST UNE PROPRIETE DU DROIT, PAS DE L'HABILITATION. Ce n'est pas
 * a l'administrateur de decider si « valider une finance » descend : cela
 * depend de la NATURE de l'acte.
 *
 * Le cas qui a tranche : un administrateur de district a qui on accorde
 * `finance.validate` validait, de ce fait, les mouvements de ses paroisses et
 * de ses eglises. Or chaque bureau gere ses propres finances et la hierarchie
 * ne fait que les CONSULTER — c'est la doctrine posee au lot 4, que le
 * controle de droit n'avait jamais suivie.
 *
 * A l'inverse, creer une eglise ou enregistrer un croyant sont des actes qui
 * portent naturellement sur la descendance : un district structure ses
 * paroisses, sinon personne ne le ferait.
 */
export const PORTEES = ['PROPRE', 'DESCENDANTE'] as const;
export type PorteeDroit = (typeof PORTEES)[number];

interface PermissionMeta {
  readonly label: string;
  readonly group: PermissionGroup;
  readonly description: string;
  /** `DESCENDANTE` par defaut : seuls les droits `PROPRE` sont declares. */
  readonly portee?: PorteeDroit;
}

export const PERMISSIONS = {
  // --- Structure -------------------------------------------------------------
  'entity.read': {
    label: 'Consulter la structure',
    group: 'Structure',
    description: 'Afficher l’organigramme, la liste et les fiches des entités du périmètre.',
  },
  'entity.create': {
    label: 'Créer une entité',
    group: 'Structure',
    description: 'Ajouter une sous-entité (direction, région, district, paroisse, église ou cellule).',
  },
  'entity.update': {
    label: 'Modifier une entité',
    group: 'Structure',
    description: 'Mettre à jour les informations, l’en-tête officiel ou le rattachement hiérarchique.',
  },
  'entity.delete': {
    label: 'Supprimer une entité',
    group: 'Structure',
    description: 'Supprimer définitivement une entité. Réservé au Siège.',
  },

  // --- Croyants --------------------------------------------------------------
  'croyant.read': {
    label: 'Consulter les croyants',
    group: 'Croyants',
    description: 'Lister et consulter les fiches individuelles et historiques des croyants du périmètre.',
  },
  'croyant.create': {
    label: 'Créer un croyant',
    group: 'Croyants',
    description: 'Enregistrer un nouveau croyant au sein d’une église du périmètre.',
  },
  'croyant.update': {
    label: 'Modifier un croyant',
    group: 'Croyants',
    description: 'Mettre à jour l’identité, les coordonnées, le lien conjugal ou le statut d’une fiche.',
  },
  'croyant.delete': {
    label: 'Supprimer un croyant',
    group: 'Croyants',
    description: 'Placer une fiche en corbeille (suppression réversible conservant l’historique).',
  },
  /**
   * EF-CRO-06 — IMPRIMER N'EST PAS CONSULTER, et c'est un revirement assume.
   *
   * Ce droit n'existait pas : l'impression etait ouverte a quiconque voyait la
   * fiche, au motif qu'elle ne fait que mettre sur papier ce que la RLS laisse
   * deja lire. Le raisonnement etait juste sur les DONNEES et faux sur le
   * DOCUMENT.
   *
   * Ce qui sort n'est pas un ecran : c'est une piece qui porte l'en-tete de
   * l'entite, le portrait et le matricule, qui circule hors de l'application et
   * qu'on presente ailleurs. Un releve de dimes remis a la mauvaise personne ne
   * se rattrape pas — le papier est deja parti. Consulter se corrige en fermant
   * l'onglet ; imprimer, non.
   *
   * DELEGABLE, parce qu'une eglise edite les documents de SES croyants ; portee
   * DESCENDANTE par defaut, comme la lecture qu'il accompagne.
   */
  'croyant.print': {
    label: 'Imprimer les documents d’un croyant',
    group: 'Croyants',
    description:
      'Éditer la fiche, le relevé de dîmes ou l’historique d’un croyant en PDF imprimable.',
  },
  'croyant.transfer': {
    label: 'Demander un transfert',
    group: 'Croyants',
    description: 'Initier une demande de transfert de membre vers une autre entité.',
  },
  'transfer.approve': {
    label: 'Approuver un transfert',
    group: 'Croyants',
    description: 'Examiner, approuver ou refuser les demandes de transfert relevant de votre arbitrage.',
  },
  'transfer.certify': {
    label: 'Délivrer une attestation de transfert',
    group: 'Croyants',
    description:
      'Éditer et imprimer l’attestation officielle de transfert sous l’en-tête de l’entité.',
  },
  'croyant.grade.approve': {
    label: 'Approuver une promotion de grade',
    group: 'Croyants',
    description:
      'Valider ou rejeter les propositions de promotion de grade soumises par les entités rattachées.',
  },
  'bapteme.create': {
    label: 'Saisir un baptême',
    group: 'Croyants',
    description: 'Enregistrer une cérémonie de baptême (crée automatiquement les fiches de croyants correspondantes).',
  },

  // --- Bureaux ---------------------------------------------------------------
  'bureau.read': {
    label: 'Consulter les bureaux',
    group: 'Bureaux',
    description: 'Consulter la composition, les mandats et l’organigramme des bureaux du périmètre.',
  },
  'bureau.manage': {
    portee: 'PROPRE',
    label: 'Gérer les bureaux',
    group: 'Bureaux',
    description: 'Ouvrir un mandat, composer les postes, désigner, remplacer ou retirer un membre.',
  },
  'bureau.delete': {
    portee: 'PROPRE',
    label: 'Supprimer un bureau',
    group: 'Bureaux',
    description:
      'Effacer définitivement un bureau et son historique. À réserver aux ouvertures erronées.',
  },

  // --- Finances --------------------------------------------------------------
  'finance.read': {
    label: 'Consulter les finances',
    group: 'Finances',
    description: 'Visualiser le registre des mouvements, les synthèses périodiques et le solde de trésorerie.',
  },
  'finance.create': {
    portee: 'PROPRE',
    label: 'Saisir un mouvement',
    group: 'Finances',
    description: 'Enregistrer une recette ou une dépense pour son entité.',
  },
  'finance.update': {
    portee: 'PROPRE',
    label: 'Modifier un brouillon',
    group: 'Finances',
    description: 'Corriger un mouvement financier tant qu’il n’est ni soumis ni validé.',
  },
  'finance.submit': {
    portee: 'PROPRE',
    label: 'Soumettre pour validation',
    group: 'Finances',
    description: 'Transmettre un brouillon financier au circuit de validation.',
  },
  'finance.validate': {
    portee: 'PROPRE',
    label: 'Valider un mouvement',
    group: 'Finances',
    description: 'Approuver ou rejeter les mouvements financiers soumis (la validation fige l’écriture).',
  },
  'finance.delegate': {
    label: 'Saisie déléguée',
    group: 'Finances',
    description:
      'Enregistrer un mouvement financier au nom d’une entité sans accès ou sans bureau constitué.',
  },
  'finance.workflow.manage': {
    label: 'Régler le workflow financier',
    group: 'Finances',
    description:
      'Activer ou désactiver l’exigence de validation préalable des écritures pour les entités du périmètre.',
  },
  'finance.dime.collect': {
    label: 'Collecter les dîmes',
    group: 'Finances',
    description:
      'Enregistrer les collectes, importer les versements et délivrer les reçus individuels de dîmes.',
  },
  'finance.validate_own': {
    portee: 'PROPRE',
    label: 'Valider ses propres mouvements',
    group: 'Finances',
    description:
      'Lève la séparation entre saisie et validation (à réserver aux entités à trésorier unique).',
  },
  'finance.periode.close': {
    portee: 'PROPRE',
    label: 'Clôturer une période',
    group: 'Finances',
    description:
      'Arrêter définitivement les comptes d’un mois : fige et verrouille toutes les écritures de la période.',
  },
  'finance.periode.reopen': {
    portee: 'PROPRE',
    label: 'Rouvrir une période clôturée',
    group: 'Finances',
    description:
      'Lever exceptionnellement le verrou d’un mois arrêté, sur motif justifié. Réservé au Siège.',
  },

  // --- Rapports --------------------------------------------------------------
  'report.read': {
    label: 'Consulter les rapports',
    group: 'Rapports',
    description: 'Consulter les modèles enregistrés et ouvrir les rapports générés du périmètre.',
  },
  'report.create': {
    label: 'Composer et générer un rapport',
    group: 'Rapports',
    description: 'Assembler des blocs modulaires, enregistrer des modèles et générer des documents PDF.',
  },
  'report.template.manage': {
    label: 'Gérer les modèles partagés',
    group: 'Rapports',
    description: 'Publier et diffuser des modèles de rapports officiels pour les entités rattachées.',
  },

  // --- Pilotage --------------------------------------------------------------
  'dashboard.configure': {
    label: 'Personnaliser le tableau de bord',
    group: 'Pilotage',
    description: 'Organiser, dimensionner et agencer ses indicateurs et graphiques favoris.',
  },
  'export.data': {
    label: 'Exporter les données',
    group: 'Pilotage',
    description: 'Télécharger les données du périmètre aux formats Excel (XLSX), CSV ou PDF.',
  },

  // --- Administration --------------------------------------------------------
  'referentiel.manage': {
    label: 'Gérer les référentiels',
    group: 'Administration',
    description: 'Grades, fonctions, nationalités, catégories financières et événements de dîmes. Réservé au Siège.',
  },
  'user.manage': {
    portee: 'PROPRE',
    label: 'Gérer les comptes',
    group: 'Administration',
    description: 'Créer, activer, suspendre et réinitialiser les comptes d’accès du périmètre.',
  },
  'permission.delegate': {
    portee: 'PROPRE',
    label: 'Gérer les habilitations & profils',
    group: 'Administration',
    description:
      'Accorder des droits aux comptes d’accès ou administrer les profils d’habilitations locaux.',
  },
  'settings.manage': {
    label: 'Modifier les paramètres généraux',
    group: 'Administration',
    description:
      'Devise, délais de correction, apparence visuelle, notifications et courriels. Réservé au Siège.',
  },
  'audit.read': {
    label: 'Consulter le journal d’audit',
    group: 'Administration',
    description: 'Consulter l’historique horodaté et détaillé des opérations réalisées sur le périmètre.',
  },
  'trash.restore': {
    label: 'Restaurer depuis la corbeille',
    group: 'Administration',
    description: 'Remettre en service un croyant, une entité ou un élément placé en corbeille.',
  },
  'trash.purge': {
    label: 'Purger la corbeille',
    group: 'Administration',
    description:
      'Supprimer définitivement et de façon irréversible les éléments placés en corbeille.',
    portee: 'PROPRE',
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
  /**
   * `finance.delegate` N'EST PLUS RESERVE AU SIEGE — 19 aout 2026.
   *
   * Il ne pouvait pas etre delegue, si bien que seul le Siege pouvait saisir
   * pour une entite privee d'acces. Un district dont trois eglises n'ont pas
   * de connexion devait donc lui envoyer chaque recette, alors que la
   * doctrine du lot 4 place les finances au plus pres du bureau.
   *
   * Ce qui le borne desormais n'est plus la non-delegation, mais DEUX
   * conditions cumulatives et verifiees :
   *   - la portee de l'octroi (RG-25) : un district le recoit pour sa branche ;
   *   - `sans_acces_application` sur l'entite visee (ARB-2), verifie a la
   *     saisie depuis le 19 aout — avant, le drapeau ne decidait de rien.
   *
   * Et l'ecriture reste marquee « saisie deleguee » avec le nom de son auteur
   * reel (EF-FIN-06) : elle se voit dans chaque liste.
   */
  /**
   * EF-FIN-18 — se dispenser de la separation saisie/validation ne se delegue
   * pas. Un compte qui le detient pourrait sinon l'accorder a celui qu'il
   * controle, et la separation ne tiendrait plus qu'a la bonne volonte de
   * celui-la meme qu'elle surveille.
   */
  'finance.validate_own',
  /**
   * EF-FIN-26 — rouvrir une periode cloturee. Si celui qui clot pouvait
   * s'accorder de quoi rouvrir, la cloture ne serait plus qu'une convention
   * entre soi : elle n'arreterait rien, elle ajouterait une etape.
   */
  'finance.periode.reopen',
  /**
   * EF-ADM-10 — l'effacement definitif ne se delegue pas.
   *
   * C'est la seule operation de l'application qui ne se rattrape pas : ni la
   * corbeille, ni le journal, ni une restauration ne ramenent ce qu'elle a
   * retire. Un droit sans retour se decide au Siege, une fois, et ne se
   * repand pas de proche en proche.
   */
  'trash.purge',
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
    'croyant.print',
    'croyant.transfer',
    'transfer.approve',
    'transfer.certify',
    'croyant.grade.approve',
    'bapteme.create',
    'bureau.read',
    'bureau.manage',
    'finance.read',
    'finance.create',
    'finance.update',
    'finance.submit',
    'finance.validate',
    'finance.workflow.manage',
    'finance.dime.collect',
    // EF-FIN-26 — c'est le bureau qui arrete ses propres comptes. La
    // REOUVERTURE, elle, reste au Siege : elle n'est dans aucun gabarit.
    'finance.periode.close',
    'report.read',
    'report.create',
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
    'finance.dime.collect',
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
 * La portee d'un droit — `DESCENDANTE` sauf declaration contraire.
 *
 * Le defaut n'est pas neutre : il conserve le comportement de tous les droits
 * qui n'ont pas ete examines. Un droit ajoute demain descend donc, comme
 * avant — et le declarer `PROPRE` est une decision explicite, prise une fois,
 * lisible au registre.
 */
export function porteeDe(permission: Permission): PorteeDroit {
  /**
   * L'ELARGISSEMENT EST NECESSAIRE, et ce n'est pas un contournement.
   *
   * `PERMISSIONS` est fige par `as const` : chaque entree a son propre type
   * litteral, et celles qui ne declarent pas `portee` n'ont tout simplement
   * pas la propriete. Le lire a travers `PermissionMeta` rend le champ
   * facultatif, ce qui est exactement ce qu il est.
   */
  const meta: PermissionMeta = PERMISSIONS[permission];
  return meta.portee ?? 'DESCENDANTE';
}

/**
 * La portee d'un octroi couvre-t-elle l'entite visee ? — RG-25.
 *
 * `porteeOctroi` est le chemin de l'entite sur laquelle le droit a ete
 * accorde. Pour un droit `DESCENDANTE`, l'entite visee doit etre sous ce
 * chemin ; pour un droit `PROPRE`, elle doit ETRE ce chemin.
 *
 * C'est ici, et nulle part ailleurs, que se joue le cas du district : son
 * administrateur detient `finance.validate` avec pour portee son district, et
 * ce droit etant `PROPRE`, il ne couvre pas l'eglise qui est dessous.
 */
export function porteeCouvre(
  permission: Permission,
  porteeOctroi: string,
  cheminEntite: string,
): boolean {
  return porteeDe(permission) === 'PROPRE'
    ? cheminEntite === porteeOctroi
    : estDescendant(cheminEntite, porteeOctroi);
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
      porteeCouvre(permission, o.scopePath ?? session.scopePath, cheminEntite),
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
