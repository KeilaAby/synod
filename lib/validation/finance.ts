import { z } from 'zod';

import { STATUTS_MOUVEMENT } from '@/lib/domain/finance';

/**
 * Saisie et workflow d'un mouvement financier — EF-FIN-01, EF-FIN-14 a 20.
 *
 * LE SENS N'EST PAS ICI, ET C'EST VOULU (RG-13). Il est porte par la categorie
 * et pose par le trigger : l'accepter du client permettrait d'enregistrer une
 * depense dans une categorie de recette, et le solde deviendrait faux sans
 * qu'aucune ligne ne paraisse anormale.
 */

/**
 * Le vide d'un champ facultatif doit rester du vide.
 *
 * `z.coerce` sur un champ optionnel produit des valeurs absurdes a partir de
 * `''` — c'est ce qui avait fait naitre des dates au 1er janvier 1970. On
 * normalise AVANT de valider, et le schema reste idempotent (regle 12).
 */
const optionnel = (schema: z.ZodType<string>) =>
  z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : v),
      schema.optional(),
    )
    .transform((v) => v ?? null);

/**
 * Le montant arrive d'un `<input>` : une CHAINE, avec ce que l'utilisateur y a
 * mis. On accepte la virgule decimale — sur un clavier francais, c'est elle
 * qu'on frappe — et les espaces de milliers, que le presse-papier apporte.
 *
 * Le refus est explicite plutot que silencieux : `Number('12,50')` vaut `NaN`,
 * et un `NaN` transmis a la base aurait donne « montant invalide » sans dire
 * lequel des dix champs etait en cause.
 */
const montant = z.preprocess(
  (v) => {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return v;

    const propre = v.replace(/[\s ]/g, '').replace(',', '.');
    if (propre === '') return undefined;

    const nombre = Number(propre);
    return Number.isFinite(nombre) ? nombre : v;
  },
  z
    .number({ message: 'Montant invalide.' })
    .positive('Le montant doit etre superieur a zero.')
    // 14,2 en base : au-dela, l'insertion echouerait sur un depassement.
    .max(999_999_999_999.99, 'Montant hors limites.')
    // Deux decimales, comme la colonne. Arrondir ici evite qu'un centime
    // disparaisse silencieusement a l'ecriture.
    .transform((n) => Math.round(n * 100) / 100),
);

const jour = z.coerce.date({ message: 'Date invalide.' });

export const saisirMouvementSchema = z.object({
  entiteId: z.uuid("Selectionnez l'entite."),
  categorieId: z.uuid('Selectionnez une categorie.'),
  montant,
  dateOperation: jour,
  libelle: optionnel(z.string().trim().max(255)),
  reference: optionnel(z.string().trim().max(80)),
  /**
   * EF-FIN-05 — saisie pour le compte d'une entite qui ne peut pas saisir.
   *
   * Le drapeau est DECLARE par le client mais REVALIDE par l'action : il ne
   * suffit pas de le cocher, il faut detenir `finance.delegate` sur l'entite.
   */
  estDelegue: z.preprocess((v) => v ?? false, z.boolean()),
});

export type SaisirMouvementInput = z.input<typeof saisirMouvementSchema>;

export const modifierMouvementSchema = saisirMouvementSchema.extend({
  id: z.uuid(),
});

export type ModifierMouvementInput = z.input<typeof modifierMouvementSchema>;

/**
 * Changement de statut — EF-FIN-14.
 *
 * Le motif est exige POUR LES DEUX etats qui en demandent un : rejeter sans
 * dire pourquoi laisse celui qui a saisi devant un refus muet, et annuler sans
 * motif efface une trace comptable sans explication (EF-FIN-20).
 */
export const changerStatutSchema = z
  .object({
    id: z.uuid(),
    statut: z.enum(STATUTS_MOUVEMENT),
    motif: optionnel(z.string().trim().min(3, 'Le motif est trop court.').max(500)),
  })
  .refine((d) => d.statut !== 'REJETE' || d.motif !== null, {
    message: 'Un rejet se motive : sans raison, la saisie ne peut pas etre corrigee.',
    path: ['motif'],
  })
  .refine((d) => d.statut !== 'ANNULE' || d.motif !== null, {
    message: "Une annulation se motive : elle retire un montant d'un solde deja publie.",
    path: ['motif'],
  });

export type ChangerStatutInput = z.input<typeof changerStatutSchema>;

/**
 * Suppression logique — RG-22.
 *
 * Schema a part plutot qu'un `.pick()` sur le precedent : `changerStatutSchema`
 * porte deux `refine`, ce qui en fait un pipe dont on ne peut plus extraire un
 * champ. Un schema de trois lignes vaut mieux qu'un contournement.
 */
export const supprimerMouvementSchema = z.object({ id: z.uuid() });

/**
 * Reglage du workflow POUR UNE ENTITE — EF-FIN-15 (adapte le 12 aout 2026).
 *
 * `null` n'est pas l'absence de reponse, c'est une reponse : « comme le defaut
 * de l'organisation ». Il ne signifie PAS « comme mon parent » — chaque entite
 * a son bureau, et chaque bureau gere ses finances ; la hierarchie les
 * consulte, elle ne les administre pas (decide le 12 aout 2026).
 */
export const reglerWorkflowSchema = z.object({
  entiteId: z.uuid(),
  actif: z.union([z.boolean(), z.null()]),
});

export type ReglerWorkflowInput = z.input<typeof reglerWorkflowSchema>;
