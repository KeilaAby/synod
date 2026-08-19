import { z } from 'zod';

/**
 * Schemas des comptes — EF-ADM-01, EF-ADM-07, EF-ADM-08.
 *
 * AUCUN CHAMP DE MOT DE PASSE, nulle part. Il est GENERE par le serveur et rendu
 * une fois : le laisser choisir a l'administrateur produirait ce qu'on observe
 * partout — le meme pour tous, ou le nom de l'entite suivi de l'annee.
 */

export const creerCompteSchema = z.object({
  /**
   * L'ADRESSE EST FACULTATIVE — beaucoup de croyants n'en ont pas.
   *
   * Elle reste obligatoire EN BASE (`not null unique`) et chez le fournisseur
   * d'identite, qui n'authentifie que par adresse. Quand elle manque, le
   * serveur en FABRIQUE une a partir du matricule : c'est un identifiant
   * technique, pas une boite aux lettres — aucun message n'y est jamais
   * envoye, et l'interesse se connecte par son matricule.
   */
  email: z
    .preprocess((v) => {
      const normalise = typeof v === 'string' ? v.trim().toLowerCase() : v;
      return normalise === '' || normalise === null ? undefined : normalise;
    }, z.email('Adresse e-mail invalide.').optional())
    .transform((v) => v ?? null),

  nomComplet: z
    .string()
    .trim()
    .min(2, 'Le nom complet est requis.')
    .max(160),

  /**
   * LE ROLE N'EST PLUS DEMANDE, il est POSE.
   *
   * Choisir un role puis corriger ses droits un par un faisait deux reglages
   * pour une seule question, et le premier decidait de choses que le second
   * defaisait sans le dire. Ce qui compte est l'habilitation fine, avec sa
   * portee (RG-25) : le role reste le socle le plus etroit, et tout se gagne
   * explicitement.
   *
   * `SUPERADMIN` ne s'accorde donc JAMAIS par cet ecran — il se pose en base,
   * a la mise en service, et le trigger `fn_profile_rattachement` exige qu'il
   * soit rattache au Siege.
   */
  role: z.literal('LECTEUR').default('LECTEUR'),

  /**
   * Les habilitations accordees a l'ouverture — RG-24, RG-25.
   *
   * Chacune est verifiee par `peutDeleguer` : on n'accorde que ce qu'on
   * detient, a un compte de son perimetre, pour une portee incluse dans la
   * sienne. La portee est celle de l'entite de rattachement du compte.
   */
  permissions: z.array(z.string()).max(64).default([]),

  entityId: z.uuid("Choisissez l'entite de rattachement."),

  /**
   * EF-ADM-07, EF-AUT-01 — LE LIEN AVEC LE CROYANT PORTE LA CONNEXION PAR
   * MATRICULE.
   *
   * Sans lui, le compte n'a pas de matricule et ne se connecte que par adresse.
   * Facultatif malgre tout : un compte technique — le Siege a la mise en
   * service — n'est rattache a personne.
   */
  croyantId: z.union([z.uuid(), z.null()]).default(null),
});

export type CreerCompteInput = z.input<typeof creerCompteSchema>;

export const reinitialiserCompteSchema = z.object({
  profileId: z.uuid(),
});

/**
 * EF-ADM-01 — modifier un compte.
 *
 * `entityId` et `croyantId` N'Y FIGURENT PAS. Le rattachement decide du
 * perimetre et porte le matricule de connexion : le deplacer changerait d'un
 * coup ce que le compte voit ET la facon dont son detenteur se connecte, sans
 * que rien ne le previenne. Un compte mal rattache se ferme et se rouvre.
 *
 * Les HABILITATIONS, elles, se modifient : c'est meme la raison principale de
 * rouvrir un compte. Elles sont REMPLACEES par la liste envoyee — le formulaire
 * les affiche toutes, il en est donc la source complete (regle 19).
 */
export const modifierCompteSchema = z.object({
  profileId: z.uuid(),
  nomComplet: z.string().trim().min(2, 'Le nom complet est requis.').max(160),
  email: z
    .preprocess((v) => {
      const normalise = typeof v === 'string' ? v.trim().toLowerCase() : v;
      return normalise === '' || normalise === null ? undefined : normalise;
    }, z.email('Adresse e-mail invalide.').optional())
    .transform((v) => v ?? null),
  permissions: z.array(z.string()).max(64).default([]),
});

export type ModifierCompteInput = z.input<typeof modifierCompteSchema>;

export const supprimerCompteSchema = z.object({
  profileId: z.uuid(),
});

/**
 * EF-ADM-01 — designer le responsable informatique d'une entite.
 *
 * UN SEUL PAR ENTITE, garanti par un index unique partiel (migration 0047).
 * Le booleen est explicite : retirer la designation est une decision au meme
 * titre que la poser.
 */
export const responsableInformatiqueSchema = z.object({
  profileId: z.uuid(),
  responsable: z.boolean(),
});

/**
 * EF-ADM-07 — activer, desactiver.
 *
 * UN BOOLEEN EXPLICITE plutot qu'une bascule : sans lui, l'action devrait
 * deviner l'etat courant, et deux clics rapides partis de la meme lecture le
 * renverseraient deux fois pour finir la ou on ne voulait pas.
 */
export const activerCompteSchema = z.object({
  profileId: z.uuid(),
  actif: z.boolean(),
});
