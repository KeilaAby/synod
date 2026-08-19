import { describe, expect, it, vi } from 'vitest';

import { appelerAction } from '@/lib/utils/appeler-action';
import { estNavigationNext } from '@/lib/utils/erreurs-next';

/**
 * ENF-UTI-05 — une redirection n'est pas une panne.
 *
 * Le defaut observe le 19 aout 2026 : apres une action reussie, un pop-up
 * « Action non aboutie — le serveur n'a pas repondu » s'affichait, portant en
 * reference `NEXT_REDIRECT;push;/tableau-de-bord;307;`. Ce digest est la
 * consigne de navigation de Next, pas un echec.
 *
 * Deux degats, et le second est le pire : annoncer un echec apres un succes,
 * et — quand l'exception est AVALEE — supprimer la redirection elle-meme.
 */
describe('estNavigationNext — le flux de controle du framework', () => {
  it('reconnait la redirection d une Server Action', () => {
    // La forme EXACTE lue a l'ecran le 19 aout 2026.
    expect(
      estNavigationNext({ digest: 'NEXT_REDIRECT;push;/tableau-de-bord;307;' }),
    ).toBe(true);
  });

  it('reconnait `notFound()`', () => {
    expect(estNavigationNext({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })).toBe(true);
  });

  it('ne prend PAS une erreur serveur pour une navigation', () => {
    // Une erreur serveur masquee par React porte un digest HACHE : que des
    // chiffres, aucune sentinelle. La confondre rendrait l'incident muet.
    expect(estNavigationNext({ digest: '3855029047' })).toBe(false);
  });

  it('ne se laisse pas tromper par un digest qui CONTIENT la sentinelle', () => {
    // On teste le prefixe, pas l'inclusion : un message d'erreur qui cite
    // « NEXT_REDIRECT » reste une erreur.
    expect(estNavigationNext({ digest: 'echec de NEXT_REDIRECT' })).toBe(false);
  });

  it('tolere ce qui n a pas de digest, sans lever', () => {
    expect(estNavigationNext(new Error('connexion perdue'))).toBe(false);
    expect(estNavigationNext(null)).toBe(false);
    expect(estNavigationNext(undefined)).toBe(false);
    expect(estNavigationNext('NEXT_REDIRECT')).toBe(false);
    expect(estNavigationNext({ digest: 42 })).toBe(false);
  });
});

describe('appelerAction — la redirection se releve, elle ne se convertit pas', () => {
  it('RELEVE la redirection au lieu d en faire un echec', async () => {
    const redirection = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;push;/tableau-de-bord;307;',
    });

    // Si elle etait attrapee, l'appelant recevrait un `ActionResult` en erreur
    // — il annoncerait une panne, et la page d'arrivee ne viendrait jamais.
    await expect(
      appelerAction(() => Promise.reject(redirection)),
    ).rejects.toBe(redirection);
  });

  it('convertit toujours une VRAIE panne en resultat annoncable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const resultat = await appelerAction(() =>
      Promise.reject(new TypeError('fetch failed')),
    );

    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.error).toContain('serveur');
    }
  });
});
