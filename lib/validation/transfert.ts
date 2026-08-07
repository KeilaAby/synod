import { z } from 'zod';

import { STATUTS_TRANSFERT } from '@/lib/domain/transfert';

/**
 * Schemas des transferts — EF-TRF-01 a 11, RG-11, RG-12.
 *
 * Le MEME schema alimente React Hook Form et la Server Action.
 */

/**
 * Demande de transfert.
 *
 * L'ORIGINE n'est pas saisie : elle se lit sur la fiche du croyant. La
 * demander ouvrirait la porte a une incoherence entre ce que l'ecran affiche
 * et ce que la requete transporte — et c'est l'origine qui determine
 * l'approbateur competent (RG-12).
 *
 * Le NIVEAU du transfert n'est pas saisi non plus : il se deduit du point de
 * divergence des deux chemins (`niveauDeTransfert`). Demander a l'utilisateur
 * de qualifier lui-meme son geste, c'est lui demander de se tromper.
 */
export const demanderTransfertSchema = z.object({
  croyantId: z.uuid(),
  toEgliseId: z.uuid("Selectionnez l'eglise de destination."),
  toCelluleId: z.uuid().optional().nullable(),
  // EF-TRF-06 — le motif est ce que lira l'approbateur. Il est donc exige :
  // une demande sans raison ne se decide pas, elle s'ignore.
  motif: z
    .string()
    .trim()
    .min(10, 'Expliquez le motif en quelques mots (10 caracteres au moins).')
    .max(500),
});

export type DemanderTransfertInput = z.input<typeof demanderTransfertSchema>;

export const approuverTransfertSchema = z.object({
  id: z.uuid(),
});

export const refuserTransfertSchema = z.object({
  id: z.uuid(),
  // Contrainte `transfert_refus_motive` en base : un refus sans motif serait
  // rejete par la base de toute facon. Autant le dire dans le formulaire.
  motifRefus: z
    .string()
    .trim()
    .min(10, 'Un refus doit etre motive (10 caracteres au moins).')
    .max(500),
});

export const annulerTransfertSchema = z.object({
  id: z.uuid(),
});

/** Filtres du journal — EF-TRF-08. */
export const filtresTransfertSchema = z.object({
  statut: z.enum(STATUTS_TRANSFERT).optional(),
  entiteId: z.uuid().optional(),
  depuis: z.coerce.date().optional(),
  jusqua: z.coerce.date().optional(),
});

export type FiltresTransfert = z.output<typeof filtresTransfertSchema>;
