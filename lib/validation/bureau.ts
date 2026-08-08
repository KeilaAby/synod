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

/**
 * La borne est `>=`, comme la contrainte `bureaux_periode` depuis la migration
 * 0020 : un mandat ne se clot pas AVANT d'avoir commence, mais le jour meme est
 * permis. Un schema plus strict que la base refuserait ce que la base accepte,
 * et le message de refus ne viendrait alors ni de l'un ni de l'autre.
 */
const finApresDebut = {
  message: 'La date de fin ne peut pas preceder la date de debut.',
  path: ['dateFin'],
};

export const ouvrirMandatSchema = z
  .object({
    entityId: z.uuid("Selectionnez l'entite."),
    libelle: z.string().trim().min(3, 'Le libelle est requis.').max(160),
    dateDebut: dateJour,
    dateFin: dateJourOptionnelle,
    /** EF-BUR-09 — reprendre la composition du mandat qui se clot. */
    reconduire: z.boolean().default(false),
  })
  .refine((d) => !d.dateFin || d.dateFin >= d.dateDebut, finApresDebut);

export type OuvrirMandatInput = z.input<typeof ouvrirMandatSchema>;

/**
 * EF-BUR-02 — modification d'un bureau : son NOM et ses DATES.
 *
 * `entityId` est absent, et ce n'est pas un oubli : deplacer un bureau d'une
 * entite a une autre invaliderait RG-09 pour chacun de ses titulaires — ils
 * appartiennent au sous-arbre de l'entite d'origine, pas de la nouvelle. Un tel
 * deplacement se fait en cloturant ici et en ouvrant la-bas.
 *
 * Le CYCLE DE VIE n'y figure pas non plus : ouvrir, clore et supprimer ont
 * chacun leur chemin. Un formulaire qui modifierait `is_active` en ferait un
 * quatrieme, muet sur ses consequences.
 */
export const modifierBureauSchema = z
  .object({
    bureauId: z.uuid(),
    libelle: z.string().trim().min(3, 'Le libelle est requis.').max(160),
    dateDebut: dateJour,
    dateFin: dateJourOptionnelle,
  })
  .refine((d) => !d.dateFin || d.dateFin >= d.dateDebut, finApresDebut);

export type ModifierBureauInput = z.input<typeof modifierBureauSchema>;

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
