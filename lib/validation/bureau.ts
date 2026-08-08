import { z } from 'zod';

/**
 * Schemas des bureaux — EF-BUR-01 a 09.
 *
 * Le MEME schema alimente React Hook Form et la Server Action.
 */

const dateJour = z.coerce.date({ message: 'Date invalide.' });

/**
 * `z.preprocess` et non `z.coerce` sur un champ facultatif : `coerce.date('')`
 * donne le 1er janvier 1970, et le schema doit rester idempotent — le serveur
 * revalide ce que le client a deja transforme (regle 12).
 */
const dateJourOptionnelle = z
  .preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.date({ message: 'Date invalide.' }).optional(),
  )
  .transform((v) => v ?? null);

export const ouvrirMandatSchema = z
  .object({
    entityId: z.uuid("Selectionnez l'entite."),
    libelle: z.string().trim().min(3, 'Le libelle est requis.').max(160),
    dateDebut: dateJour,
    dateFin: dateJourOptionnelle,
    /** EF-BUR-09 — reprendre la composition du mandat qui se clot. */
    reconduire: z.boolean().default(false),
  })
  .refine((d) => !d.dateFin || d.dateFin > d.dateDebut, {
    message: 'La date de fin doit etre posterieure a la date de debut.',
    path: ['dateFin'],
  });

export type OuvrirMandatInput = z.input<typeof ouvrirMandatSchema>;

export const cloreMandatSchema = z.object({
  bureauId: z.uuid(),
  dateFin: dateJour,
});

export const designerMembreSchema = z.object({
  bureauId: z.uuid(),
  croyantId: z.uuid('Selectionnez un croyant.'),
  fonctionId: z.uuid('Selectionnez une fonction.'),
  notes: z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : v),
      z.string().trim().max(300).optional(),
    )
    .transform((v) => v ?? null),
});

export type DesignerMembreInput = z.input<typeof designerMembreSchema>;

/**
 * EF-BUR-08 — remplacement : cloture du mandat individuel ET designation du
 * suivant, en une seule intention. Les separer laisserait la fonction vacante
 * entre les deux, et un remplacement interrompu ressemblerait a un retrait.
 */
export const remplacerMembreSchema = z.object({
  membreId: z.uuid(),
  croyantId: z.uuid('Selectionnez le remplacant.'),
  notes: z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : v),
      z.string().trim().max(300).optional(),
    )
    .transform((v) => v ?? null),
});

export const retirerMembreSchema = z.object({
  membreId: z.uuid(),
});

/**
 * EF-BUR-08 — suppression, a distinguer de la cloture.
 *
 * Aucun champ de plus : rien ne se saisit, la confirmation se fait a l'ecran.
 * Le droit `bureau.delete`, distinct et non delegable, porte la protection.
 */
export const supprimerBureauSchema = z.object({
  bureauId: z.uuid(),
});
