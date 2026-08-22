import { describe, expect, it } from 'vitest';

/**
 * EF-CRO-14 — le champ `conjointId`, validé par le schéma, doit être ÉCRIT
 * dans les DEUX Server Actions qui touchent la fiche.
 *
 * MÊME DÉFAUT QUE CELUI DÉJÀ PAYÉ (règle 19) : `photoKey` figurait dans un
 * schéma sans jamais être repris dans le `.update()` correspondant, et
 * enregistrer une fiche effaçait silencieusement la photo. `modifierCroyant`
 * construit son payload CHAMP PAR CHAMP plutôt qu'en reprenant `valeurs` en
 * bloc — chaque nouveau champ doit donc être ajouté à la main, et c'est
 * précisément l'endroit où un champ validé mais jamais écrit se cache.
 */
describe('EF-CRO-14 — conjointId est écrit dans creerCroyant ET modifierCroyant', () => {
  it('apparaît dans le payload des deux écritures', async () => {
    const { readFile } = await import('node:fs/promises');

    const source = await readFile(
      new URL('../../lib/actions/croyants.ts', import.meta.url),
      'utf8',
    );

    const occurrences = source.match(/conjoint_id:\s*data\.conjointId/g) ?? [];

    // Une par écriture : creerCroyant (insert) et modifierCroyant (update).
    // Un compte de UNE seule dirait qu'une des deux ecritures l'a perdu.
    expect(occurrences.length, source).toBe(2);
  });
});
