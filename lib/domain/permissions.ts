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
  /**
   * UN DROIT A PART, ET C'EST LA DEMANDE (20 aout 2026) : « un document signe
   * n'est pas une lecture de liste ».
   *
   * Consulter un transfert dit ce qui s'est passe ; en delivrer l'attestation
   * ENGAGE l'entite — le papier porte son en-tete, il sera presente ailleurs, et
   * il vaut preuve. Le confondre avec `croyant.transfer` donnerait le pouvoir
   * d'attester a qui n'a que celui de demander.
   */
  'transfer.certify': {
    label: 'Delivrer une attestation de transfert',
    group: 'Croyants',
    description:
      "Editer le document officiel d'un transfert approuve, sous l'en-tete de l'entite.",
  },
  /**
   * EF-CRO-12 — DECIDER N'EST PAS DEMANDER.
   *
   * Demander une promotion reste sous `croyant.update` : c'est le meme geste
   * qu'avant le circuit, seul change qui tranche. Approuver, en revanche,
   * engage l'organisation entiere — un grade vaut partout, « Pasteur » doit
   * designer la meme chose d'une eglise a l'autre.
   *
   * La PORTEE fait le reste : ce droit s'evalue sur l'entite SUPERIEURE figee a
   * la demande, si bien qu'un compte borne a l'eglise ne peut pas s'approuver
   * lui-meme. Aucune regle de plus a ecrire pour cela.
   */
  'croyant.grade.approve': {
    label: 'Approuver une promotion de grade',
    group: 'Croyants',
    description:
      "Trancher les demandes de changement de grade des entites qui dependent de vous.",
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
    portee: 'PROPRE',
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
    portee: 'PROPRE',
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
    portee: 'PROPRE',
    label: 'Saisir un mouvement',
    group: 'Finances',
    description: 'Enregistrer une recette ou une depense sur le perimetre.',
  },
  'finance.update': {
    portee: 'PROPRE',
    label: 'Modifier un brouillon',
    group: 'Finances',
    description: 'Corriger un mouvement tant qu il n est ni soumis ni valide.',
  },
  'finance.submit': {
    portee: 'PROPRE',
    label: 'Soumettre pour validation',
    group: 'Finances',
    description: 'Presenter un brouillon au circuit de validation.',
  },
  'finance.validate': {
    portee: 'PROPRE',
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
   * EF-FIN-27 — collecter les dimes d'une entite.
   *
   * DROIT DEDIE, et il ne pouvait pas en etre autrement. Une dime appartient au
   * Siege (RG-33), donc son mouvement y est rattache — mais c'est l'EGLISE qui
   * la collecte, et son tresorier ne detient pas `finance.create` sur le Siege.
   *
   * Ce droit porte sur l'entite COLLECTRICE : le detenir pour son eglise permet
   * d'ecrire une recette du Siege, et rien d'autre. C'est
   * `fn_saisir_collecte_dime` qui le verifie, seul chemin d'ecriture.
   *
   * DELEGABLE : le Siege le confie a chaque eglise pour elle-meme.
   */
  'finance.dime.collect': {
    label: 'Collecter les dimes',
    group: 'Finances',
    description:
      "Enregistrer une collecte de dimes et delivrer les recus. La dime revient au "
      + 'Siege ; cette entite en tient le detail.',
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
    portee: 'PROPRE',
    label: 'Valider ses propres mouvements',
    group: 'Finances',
    description:
      'Leve la separation entre saisie et validation. A reserver aux entites ou une '
      + 'seule personne tient les comptes.',
  },
  /**
   * EF-FIN-26 — arreter les comptes d'un mois.
   *
   * DELEGABLE, et il doit l'etre : c'est le bureau qui arrete ses propres
   * comptes, pas le Siege a sa place. Il s'evalue AVEC SA PORTEE (RG-25), y
   * compris quand la cloture est demandee pour tout un perimetre — les entites
   * hors portee sont alors ignorees, jamais closes en silence.
   */
  'finance.periode.close': {
    portee: 'PROPRE',
    label: 'Cloturer une periode',
    group: 'Finances',
    description:
      'Arreter les comptes d un mois : plus aucune ecriture ne peut y entrer ni en '
      + 'sortir. Refuse tant qu un mouvement y attend une decision.',
  },
  /**
   * EF-FIN-26 — rouvrir, et l'exigence est explicite : « sans reouverture par
   * le SuperAdmin ».
   *
   * NON DELEGABLE. Si celui qui clot pouvait s'accorder de quoi rouvrir, la
   * cloture ne serait plus qu'une convention entre soi — elle n'arreterait
   * rien, elle ajouterait une etape.
   */
  'finance.periode.reopen': {
    portee: 'PROPRE',
    label: 'Rouvrir une periode cloturee',
    group: 'Finances',
    description:
      'Lever le verrou d un mois arrete, sur motif. Reserve au Siege : celui qui '
      + 'clot ne rouvre pas.',
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
  /**
   * `report.publish` A ETE RETIRE le 20 aout 2026 (migration `0060`).
   *
   * Publier rendait un rapport lisible par tout le perimetre SANS
   * `report.read` — c'en etait la definition. Or RG-26 omet les blocs non
   * habilites A LA GENERATION, sous la session de celui qui genere, et le
   * contenu est ensuite fige (RG-27) : un rapport publie montrait donc ses
   * finances a quelqu'un a qui `finance.read` avait ete refuse.
   *
   * LE DROIT DISPARAIT DU REGISTRE PLUTOT QUE DE DEVENIR DECORATIF. Un
   * interrupteur qu'on peut encore poser et qui n'accorde rien est un piege
   * pose pour plus tard : quelqu'un le cocherait et croirait avoir diffuse.
   *
   * Les octrois deja enregistres en base restent, inertes : ce sont des
   * chaines, plus rien ne les lit. Les effacer aurait touche des lignes que
   * le journal d'audit cite.
   */
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
    portee: 'PROPRE',
    label: 'Gerer les comptes',
    group: 'Administration',
    description: 'Inviter, activer et desactiver les comptes du perimetre.',
  },
  'permission.delegate': {
    portee: 'PROPRE',
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
  /**
   * EF-ADM-10 — L'EFFACEMENT REEL, ET IL EST SANS RETOUR.
   *
   * `trash.restore` defait une suppression ; celui-ci la rend definitive. Ce ne
   * sont pas deux degres du meme droit mais deux actes opposes, et le second
   * n'a aucun rattrapage : le detenir doit se decider a part.
   *
   * Portee PROPRE : purger n'est pas un acte qui descend. Un district qui
   * effacerait definitivement les fiches de ses eglises le ferait sans que
   * personne, chez elles, ne puisse s'en apercevoir avant qu'il soit trop tard.
   */
  'trash.purge': {
    label: 'Effacer definitivement',
    group: 'Administration',
    description:
      'Retirer pour de bon un element de la corbeille. Sans retour possible.',
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

/**
 * Un octroi tel que compose a l'ecran — EF-ADM-03, RG-25, notes/todos.md §5
 * (« Portee par droit dans l'octroi »).
 *
 * `user_permissions.scope_entity_id` existe depuis la toute premiere
 * migration (`0005`) et `has_perm`/`peut()` savent deja le lire : ce type ne
 * comble pas un manque cote base, seulement cote formulaire, qui a toujours
 * force la portee a l'entite de rattachement du compte.
 */
export interface OctroiPortee {
  readonly permission: Permission;
  /** `null` = toute l'entite de rattachement du compte beneficiaire. */
  readonly scopeEntityId: string | null;
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
 * EF-ADM-03, RG-25 — resout et valide la portee choisie pour UN octroi.
 *
 * `scope_entity_id` existe en base depuis `0005` : `null` signifie « toute
 * l'entite de rattachement du compte », un id EXPLICITE la restreint. On
 * NORMALISE en `null` quand l'entite choisie est celle du compte lui-meme —
 * les deux sont equivalents, et l'ecrire quand meme figerait la portee si le
 * compte etait un jour re-rattache, la ou `null` suit toujours son entite
 * courante.
 *
 * LA PORTEE NE PEUT QUE RETRECIR : elle doit rester dans le sous-arbre du
 * compte beneficiaire, jamais ailleurs — c'est le sens de « restreint a
 * cette sous-structure » du commentaire d'origine de `user_permissions`.
 * `peutDeleguer` verifie ENSUITE que cette portee reste dans celle que le
 * delegant detient lui-meme (RG-24) ; les deux controles sont distincts et
 * necessaires l'un et l'autre.
 *
 * `arbre` est reduit a `{ id, path }[]` — pas `NoeudEntite[]` — pour rester
 * une fonction PURE, testable sans base ni session (regle 24).
 */
export function resoudrePortee(
  scopeEntityId: string | null,
  cible: { id: string; path: string },
  arbre: readonly { id: string; path: string }[],
): ActionResult<{ scopeEntityId: string | null; cheminPortee: string | null }> {
  if (!scopeEntityId || scopeEntityId === cible.id) {
    return ok({ scopeEntityId: null, cheminPortee: null });
  }

  const portee = arbre.find((e) => e.id === scopeEntityId);
  if (!portee) return ko("L'entite choisie pour restreindre un octroi est introuvable.");

  if (!estDescendant(portee.path, cible.path)) {
    return ko(
      'La portee d’un octroi doit rester dans l’entite de rattachement du compte, ou ' +
        'l’une de ses descendantes.',
    );
  }

  return ok({ scopeEntityId: portee.id, cheminPortee: portee.path });
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
