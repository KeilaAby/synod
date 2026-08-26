import { ALL_PERMISSIONS, type Permission } from './permissions';

/**
 * Les profils de privileges — raccourcis d'attribution (EF-ADM-04).
 *
 * POURQUOI DES RACCOURCIS PLUTOT QU'UN ROLE. Un role IMPOSE un jeu de droits et
 * le maintient : changer le role rechange tout, et deux comptes du meme role ne
 * peuvent plus differer. Un raccourci, lui, ne fait que COCHER — ce qu'il pose,
 * on le corrige ensuite librement, et le compte n'est plus rattache a rien.
 *
 * C'est la difference entre « cet agent EST un consultant » et « pose-moi les
 * droits d'un consultant, je verrai ensuite ». La seconde formulation est celle
 * qui survit aux cas particuliers, et il n'y a que des cas particuliers.
 *
 * LE PROFIL « ADMINISTRATEUR » N'EST PAS UNE LISTE FIGEE. Il prend TOUT ce que
 * le delegant peut transmettre : ecrire la liste a la main la ferait vieillir a
 * chaque droit ajoute au registre, et un administrateur cree l'an prochain
 * n'aurait pas les droits nes cette annee.
 */

export interface ProfilRaccourci {
  readonly cle: string;
  readonly libelle: string;
  readonly description: string;
  /**
   * `null` : le profil prend tout ce qui est delegable — voir ci-dessus.
   * Sinon, la liste exacte des droits qu'il pose.
   */
  readonly permissions: readonly Permission[] | null;
}

export const PROFILS_RACCOURCIS: readonly ProfilRaccourci[] = [
  {
    cle: 'ADMINISTRATEUR',
    libelle: 'Administrateur',
    description: 'Accès complet à son périmètre et aux réglages qu’il peut transmettre.',
    permissions: null,
  },
  {
    cle: 'RESPONSABLE',
    libelle: 'Responsable d’entité',
    description: 'Structure, croyants, bureaux et rapports de son entité.',
    permissions: [
      'entity.read',
      'entity.create',
      'entity.update',
      'croyant.read',
      'croyant.create',
      'croyant.update',
      'croyant.print',
      'croyant.transfer',
      'transfer.approve',
      'transfer.certify',
      'bapteme.create',
      'bureau.read',
      'bureau.manage',
      'report.read',
      'report.create',
      'dashboard.configure',
    ],
  },
  {
    cle: 'TRESORIER',
    libelle: 'Trésorier',
    description: 'Saisie, soumission et suivi des finances de son entité.',
    permissions: [
      'entity.read',
      'croyant.read',
      'finance.read',
      'finance.create',
      'finance.update',
      'finance.submit',
      'finance.dime.collect',
      'report.read',
      'export.data',
      'dashboard.configure',
    ],
  },
  {
    cle: 'SECRETAIRE',
    libelle: 'Secrétaire',
    description: 'Tenue du registre des croyants, transferts et baptêmes.',
    permissions: [
      'entity.read',
      'croyant.read',
      'croyant.create',
      'croyant.update',
      'croyant.print',
      'croyant.transfer',
      'transfer.certify',
      'bapteme.create',
      'bureau.read',
      'report.read',
    ],
  },
  {
    cle: 'CONSULTATION',
    libelle: 'Consultation',
    description: 'Lecture seule : aucune écriture, aucun mouvement.',
    permissions: [
      'entity.read',
      'croyant.read',
      'bureau.read',
      'finance.read',
      'report.read',
      'export.data',
      'dashboard.configure',
    ],
  },
];

/**
 * Les droits qu'un profil pose, bornes a ce que le delegant peut transmettre.
 *
 * RG-24 — un raccourci n'accorde JAMAIS plus que son auteur ne detient. Sans ce
 * filtre, cliquer « Administrateur » proposerait des droits que l'action
 * refuserait ensuite un par un, et l'utilisateur croirait a une panne.
 */
export function permissionsDuProfil(
  profil: ProfilRaccourci,
  delegables: readonly Permission[],
): Permission[] {
  const voulues = profil.permissions ?? ALL_PERMISSIONS;
  return voulues.filter((p) => delegables.includes(p));
}

/**
 * Ce profil est-il POSE en entier sur ce compte ?
 *
 * Sert a mettre la carte en evidence. On compare a ce qui est REELLEMENT
 * posable : un profil dont deux droits sont hors de portee du delegant reste
 * « applique » quand le reste y est, sinon aucune carte ne s'allumerait jamais
 * pour un administrateur de district.
 */
export function profilApplique(
  profil: ProfilRaccourci,
  accordees: readonly Permission[],
  delegables: readonly Permission[],
): boolean {
  const attendues = permissionsDuProfil(profil, delegables);
  return attendues.length > 0 && attendues.every((p) => accordees.includes(p));
}
