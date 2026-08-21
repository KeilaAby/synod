import { z } from 'zod';

/**
 * Schemas de la promotion de grade — EF-CRO-12.
 *
 * Le MEME schema alimente React Hook Form et la Server Action.
 */

/**
 * UN REFUS SE MOTIVE, UNE APPROBATION NON.
 *
 * Approuver confirme ce que la demande disait deja ; refuser dit le contraire,
 * et celui qui a demande doit pouvoir comprendre pourquoi sans telephoner.
 *
 * Le `refine` porte la regle plutot qu'un champ obligatoire : exiger le motif
 * inconditionnellement ferait echouer l'approbation, qui n'en a pas et n'en
 * veut pas. La base porte la meme borne (`fn_decider_promotion`).
 */
export const deciderPromotionSchema = z
  .object({
    promotionId: z.uuid(),
    approuver: z.boolean(),
    motif: z
      .preprocess(
        (v) => (v === '' || v === null || v === undefined ? undefined : v),
        z.string().trim().max(300).optional(),
      )
      .transform((v) => v ?? null),
  })
  .refine((d) => d.approuver || (d.motif ?? '').length >= 3, {
    message: 'Indiquez pourquoi la promotion est refusee.',
    path: ['motif'],
  });

export type DeciderPromotionInput = z.input<typeof deciderPromotionSchema>;

export const retirerPromotionSchema = z.object({ promotionId: z.uuid() });
