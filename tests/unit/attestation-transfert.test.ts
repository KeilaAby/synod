import { describe, expect, it } from 'vitest';

import { attestationTransfertSchema } from '@/lib/validation/attestation-transfert';

/**
 * EF-TRF-08 — le gabarit, le schéma et l'ÉCRITURE disent la même chose.
 *
 * Même défaut que celui payé le 20 août 2026 sur les paramètres généraux
 * (`apparence.test.ts`) : un champ ajouté au schéma et au formulaire, mais
 * jamais repris dans l'objet passé à `.update()`, laisse l'enregistrement
 * réussir SANS RIEN CHANGER — la panne la plus ingrate, parce qu'elle ne se
 * signale nulle part.
 */
describe('EF-TRF-08 — aucun champ du gabarit validé ne reste non écrit', () => {
  it('reprend dans l’action CHAQUE champ du schéma', async () => {
    const { readFile } = await import('node:fs/promises');

    const source = await readFile(
      new URL('../../lib/actions/attestation-transfert.ts', import.meta.url),
      'utf8',
    );

    const champs = Object.keys(attestationTransfertSchema.shape);

    // Au moins les trois champs connus : si le schema se vide par accident,
    // le test passerait sans rien verifier.
    expect(champs.length).toBeGreaterThanOrEqual(3);

    for (const champ of champs) {
      expect(
        source.includes(`v.${champ}`),
        `le champ « ${champ} » est validé mais jamais écrit`,
      ).toBe(true);
    }
  });
});
