import { z } from 'zod';

/**
 * Le gabarit réglable de l'attestation de transfert — EF-TRF-08, migration
 * `0070`. Partagé client/serveur (règle 12) : le serveur revalide ce que le
 * client a déjà transformé.
 */

/** Un texte vide vaut ABSENT, jamais chaîne vide (règle 12) — comme `courriel.ts`. */
function optionnel(max: number) {
  return z
    .preprocess((v) => {
      const normalise = typeof v === 'string' ? v.trim() : v;
      return normalise === '' || normalise === null ? undefined : normalise;
    }, z.string().max(max).optional())
    .transform((v) => v ?? null);
}

export const attestationTransfertSchema = z.object({
  texteCorps: z
    .string()
    .trim()
    .min(1, 'Le texte du corps est requis.')
    .max(2000, 'Deux mille caractères au maximum.'),
  mentionsLegales: optionnel(2000),
  cartoucheSignature: z
    .string()
    .trim()
    .min(1, 'Le cartouche de signature est requis.')
    .max(200, 'Deux cents caractères au maximum.'),
});

export type AttestationTransfertInput = z.infer<typeof attestationTransfertSchema>;
