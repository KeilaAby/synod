import { z } from 'zod';

/**
 * Schémas des transferts et des baptêmes — ARB-4, EF-BAP-01.
 */

export const demanderTransfertSchema = z.object({
  croyantId: z.uuid(),
  /** Église de destination — obligatoire même pour un simple changement de cellule. */
  toEgliseId: z.uuid("Sélectionnez l'église de destination."),
  toCelluleId: z.uuid().optional().nullable(),
  motif: z.string().trim().max(500).optional().or(z.literal('')),
});

export type DemanderTransfertInput = z.input<typeof demanderTransfertSchema>;

export const deciderTransfertSchema = z
  .object({
    transfertId: z.uuid(),
    decision: z.enum(['APPROUVE', 'REFUSE']),
    // Un refus non motivé est un refus incompréhensible pour le demandeur.
    motifRefus: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .refine((d) => d.decision !== 'REFUSE' || (d.motifRefus ?? '').trim().length >= 3, {
    message: 'Un refus doit être motivé.',
    path: ['motifRefus'],
  });

export type DeciderTransfertInput = z.input<typeof deciderTransfertSchema>;

export const annulerTransfertSchema = z.object({ transfertId: z.uuid() });

/** Traitement par lot de la file d'approbation — EF-TRF-07. */
export const deciderLotSchema = z
  .object({
    transfertIds: z.array(z.uuid()).min(1, 'Sélectionnez au moins un transfert.'),
    decision: z.enum(['APPROUVE', 'REFUSE']),
    motifRefus: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .refine((d) => d.decision !== 'REFUSE' || (d.motifRefus ?? '').trim().length >= 3, {
    message: 'Un refus doit être motivé.',
    path: ['motifRefus'],
  });

export const filtresTransfertSchema = z.object({
  statut: z.enum(['DEMANDE', 'APPROUVE', 'REFUSE', 'ANNULE', 'EFFECTUE']).optional(),
  entiteId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  taille: z.coerce.number().int().min(1).max(100).default(25),
});

export type FiltresTransfert = z.output<typeof filtresTransfertSchema>;

// -----------------------------------------------------------------------------
// Baptêmes — EF-BAP-01 à 07
// -----------------------------------------------------------------------------

/**
 * EF-BAP-02 — la saisie d'un baptisé CRÉE le croyant.
 *
 * Le formulaire est volontairement plus court que celui du croyant : on saisit
 * un baptême sur le terrain, souvent en série. Les champs facultatifs de la
 * fiche seront complétés plus tard.
 */
export const saisirBaptiseSchema = z.object({
  nom: z.string().trim().min(2, 'Le nom est requis.').max(80),
  prenom: z.string().trim().min(2, 'Le prénom est requis.').max(80),
  sexe: z.enum(['M', 'F'], { message: 'Le sexe est requis.' }),
  dateNaissance: z.coerce.date({ message: 'Date invalide.' }),
  adresse: z.string().trim().min(3, "L'adresse est requise.").max(255),

  egliseId: z.uuid("Sélectionnez l'église."),
  celluleId: z.uuid().optional().nullable(),
  gradeId: z.uuid('Sélectionnez un grade.'),
  nationaliteId: z.uuid('Sélectionnez une nationalité.'),

  dateBapteme: z.coerce.date({ message: 'Date invalide.' }),
  lieu: z.string().trim().max(160).optional().or(z.literal('')),
  celebrantId: z.uuid().optional().nullable(),
  sessionLibelle: z.string().trim().max(160).optional().or(z.literal('')),
});

export type SaisirBaptiseInput = z.input<typeof saisirBaptiseSchema>;

/** EF-BAP-07 — une cérémonie baptise plusieurs personnes le même jour. */
export const saisirBaptisesLotSchema = z.object({
  egliseId: z.uuid("Sélectionnez l'église."),
  dateBapteme: z.coerce.date({ message: 'Date invalide.' }),
  lieu: z.string().trim().max(160).optional().or(z.literal('')),
  celebrantId: z.uuid().optional().nullable(),
  sessionLibelle: z.string().trim().max(160).optional().or(z.literal('')),
  gradeId: z.uuid('Sélectionnez un grade.'),
  nationaliteId: z.uuid('Sélectionnez une nationalité.'),

  baptises: z
    .array(
      z.object({
        nom: z.string().trim().min(2).max(80),
        prenom: z.string().trim().min(2).max(80),
        sexe: z.enum(['M', 'F']),
        dateNaissance: z.coerce.date(),
        adresse: z.string().trim().min(3).max(255),
        celluleId: z.uuid().optional().nullable(),
      }),
    )
    .min(1, 'Ajoutez au moins un baptisé.')
    .max(100, 'Saisissez au plus 100 baptisés à la fois.'),
});

export type SaisirBaptisesLotInput = z.input<typeof saisirBaptisesLotSchema>;
