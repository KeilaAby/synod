import { z } from 'zod';

import { EVENEMENTS_DIME, MODES_DIME, NATURES_VERSEMENT } from '@/lib/domain/dime';

/**
 * Saisie d'une collecte de dimes — EF-FIN-27 a 31, RG-33.
 *
 * LE TOTAL N'EST PAS ICI, ET C'EST VOULU. En mode detaille, il vient de la
 * somme des versements : le laisser saisir a cote produirait deux verites — un
 * mouvement de 1 000 000 pour 900 000 de detail — et personne ne saurait
 * laquelle croire. `fn_saisir_collecte_dime` le calcule, ce schema ne le
 * transporte pas.
 *
 * En mode GLOBAL il n'y a pas de detail, donc pas de contradiction possible :
 * le montant est celui du seul champ saisi, et il arrive comme un versement
 * unique sans croyant.
 */

const optionnel = (schema: z.ZodType<string>) =>
  z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : v),
      schema.optional(),
    )
    .transform((v) => v ?? null);

/**
 * Le montant vient d'un `<input>` : une CHAINE. On accepte la virgule
 * decimale — sur un clavier francais, c'est elle qu'on frappe — et les espaces
 * de milliers, que le presse-papier apporte.
 */
const montant = z.preprocess(
  (v) => {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return v;

    const propre = v.replace(/[\s ]/g, '').replace(',', '.');
    if (propre === '') return undefined;

    const nombre = Number(propre);
    return Number.isFinite(nombre) ? nombre : v;
  },
  z
    .number({ message: 'Montant invalide.' })
    .positive('Le montant doit etre superieur a zero.')
    .max(999_999_999_999.99, 'Montant hors limites.')
    .transform((n) => Math.round(n * 100) / 100),
);

export const versementSchema = z
  .object({
    /**
     * `null` pour un versement ANONYME — il n'y a personne a rattacher
     * (EF-FIN-33). Inventer un croyant « Anonyme » aurait produit une fiche
     * fictive qui compterait dans les effectifs et finirait par recevoir un
     * transfert.
     */
    croyantId: optionnel(z.uuid()),
    montant,
    /**
     * L'enveloppe est FACULTATIVE pour un nominatif.
     *
     * Un croyant peut verser sans la sienne — il l'a oubliee, ou c'est sa
     * premiere fois. Exiger le numero ferait refuser une dime reellement
     * remise, ce qu'aucune regle ne demande.
     */
    enveloppe: optionnel(z.string().trim().max(30)),
    nature: z.enum(NATURES_VERSEMENT).default('NOMINATIF'),
  })
  // Les trois natures, chacune avec ce qu'elle exige. La base porte la meme
  // regle (`dime_versements_nature_coherente`) ; ici on l'explique.
  .refine((v) => v.nature !== 'NOMINATIF' || v.croyantId !== null, {
    message: 'Selectionnez le croyant, ou passez la ligne en anonyme.',
    path: ['croyantId'],
  })
  .refine((v) => v.nature !== 'EN_VRAC' || v.croyantId === null, {
    message: 'Un versement en vrac ne se rattache a personne.',
    path: ['croyantId'],
  })
  // Le vrac, ce sont des especes SANS enveloppe : c'est sa definition.
  .refine((v) => v.nature !== 'EN_VRAC' || v.enveloppe === null, {
    message: "Un versement en vrac n'a pas d'enveloppe.",
    path: ['enveloppe'],
  });

export type VersementInput = z.input<typeof versementSchema>;

/**
 * Au-dela, la saisie n'est plus un formulaire. Une collecte de grande eglise
 * depasse rarement trois cents enveloppes ; le plafond protege la requete, pas
 * l'utilisateur.
 */
export const VERSEMENTS_MAX = 500;

export const saisirCollecteSchema = z
  .object({
    entiteCollecteId: z.uuid("Selectionnez l'entite qui collecte."),
    /**
     *  NE FIGURE PAS ICI. Sur l'ecran des dimes, tout EST une
     * dime : le serveur la resout (). La laisser arriver
     * du client rouvrirait la porte a une collecte rangee sous « Offrande »,
     * qui disparaitrait du suivi des dimes.
     */
    dateOperation: z.coerce.date({ message: 'Date invalide.' }),
    evenement: z.enum(EVENEMENTS_DIME, { message: "Precisez le type d'evenement." }),
    libelle: optionnel(z.string().trim().max(255)),
    reference: optionnel(z.string().trim().max(80)),

    /** Mode GLOBAL ou evenement national : un seul montant, sans croyant. */
    montantGlobal: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : v),
      montant.optional(),
    ),

    versements: z
      .array(versementSchema)
      .max(VERSEMENTS_MAX, `Cinq cents versements au plus par collecte.`)
      .default([]),
  })
  /**
   * L'UN OU L'AUTRE, jamais les deux ni aucun.
   *
   * Accepter les deux rouvrirait la porte aux deux verites que la fonction SQL
   * ferme ; n'accepter aucun des deux enregistrerait une collecte a zero.
   */
  .refine((d) => d.versements.length > 0 || d.montantGlobal !== undefined, {
    message: 'Saisissez au moins un versement, ou le montant global de la collecte.',
    path: ['montantGlobal'],
  })
  .refine((d) => d.versements.length === 0 || d.montantGlobal === undefined, {
    message:
      'Le total se calcule a partir des versements : ne saisissez pas de montant global.',
    path: ['montantGlobal'],
  });

export type SaisirCollecteInput = z.input<typeof saisirCollecteSchema>;

/**
 * Reglage du mode de saisie d'une entite — EF-FIN-28.
 *
 * `null` n'est pas l'absence de reponse, c'est une reponse : « le defaut de
 * l'organisation ». Il ne signifie PAS « comme mon parent ».
 */
export const reglerModeDimeSchema = z.object({
  entiteId: z.uuid(),
  mode: z.union([z.enum(MODES_DIME), z.null()]),
});

export type ReglerModeDimeInput = z.input<typeof reglerModeDimeSchema>;

/**
 * Remise d'un lot de collectes au Siege — EF-FIN-30.
 *
 * Le bordereau DETAILLE la date de chaque culte dont il porte la collecte : un
 * regroupement de plusieurs dimanches est possible mais mal vu, et le detail
 * rend le retard visible au lieu de le noyer dans un total. C'est la liste des
 * collectes qui le produit — rien a saisir de plus.
 */
export const remettreCollectesSchema = z.object({
  entiteId: z.uuid(),
  collecteIds: z
    .array(z.uuid())
    .min(1, 'Selectionnez au moins une collecte a remettre.')
    .max(200, 'Deux cents collectes au plus par bordereau.'),
  /**
   * LE PORTEUR EST FACULTATIF a l'enregistrement.
   *
   * C'est normalement le tresorier principal ou son adjoint, mais l'exiger
   * ferait refuser une remise reellement faite parce que la fiche du porteur
   * n'est pas encore saisie. On l'inscrit quand on le sait.
   */
  porteurId: optionnel(z.uuid()),
  dateRemise: z.coerce.date({ message: 'Date invalide.' }),
  observation: optionnel(z.string().trim().max(500)),
});

export type RemettreCollectesInput = z.input<typeof remettreCollectesSchema>;

/**
 * Import d'une feuille de versements — EF-FIN-34.
 *
 * L'EN-TETE EST CELUI D'UNE COLLECTE. Un fichier ne porte que des lignes : la
 * date du culte, l'entite et l'evenement restent saisis a l'ecran, une fois
 * pour tout le lot. C'est aussi ce qui empeche d'importer par megarde une
 * feuille dans la mauvaise eglise.
 */
export const importerVersementsSchema = z.object({
  entiteCollecteId: z.uuid("Selectionnez l'entite qui collecte."),
  dateOperation: z.coerce.date({ message: 'Date invalide.' }),
  evenement: z.enum(EVENEMENTS_DIME, { message: "Precisez le type d'evenement." }),
  libelle: optionnel(z.string().trim().max(255)),
  reference: optionnel(z.string().trim().max(80)),

  /** Champ importe -> index de colonne. `null` : colonne non fournie. */
  correspondance: z.record(z.string(), z.number().int().nullable()),

  lignes: z
    .array(z.array(z.string()))
    // Au-dela, la feuille releve d'un traitement par lots, pas d'un import.
    .max(5000, 'Une feuille porte 5 000 lignes au plus.'),
});

export type ImporterVersementsInput = z.input<typeof importerVersementsSchema>;
