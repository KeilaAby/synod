import { afterEach, describe, expect, it, vi } from 'vitest';

import { estPanneReseau, fetchAvecDelai } from '@/lib/supabase/reseau';

/**
 * ENF-PRF-01 — une seconde tentative, et pour les lectures seulement.
 *
 * Ces tests fixent la frontiere qui compte : une lecture se rejoue, une
 * ecriture jamais. Un echec de transport ne dit pas que le serveur n'a rien
 * fait — la requete a pu aboutir et seule la reponse se perdre.
 */

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
  vi.restoreAllMocks();
});

/** Un `fetch` qui echoue les `n` premieres fois, puis repond. */
function fetchQuiEchoue(n: number, erreur: Error = new TypeError('fetch failed')) {
  let appels = 0;
  const faux = vi.fn(async () => {
    appels += 1;
    if (appels <= n) throw erreur;
    return new Response('ok');
  });
  globalThis.fetch = faux as unknown as typeof fetch;
  return faux;
}

describe('Une LECTURE se rejoue', () => {
  it('reussit a la seconde tentative apres un paquet perdu', async () => {
    const faux = fetchQuiEchoue(1);
    const reponse = await fetchAvecDelai(1000)('https://exemple.test');

    expect(reponse.ok).toBe(true);
    expect(faux).toHaveBeenCalledTimes(2);
  });

  it('abandonne apres le nombre d essais prevu', async () => {
    // Deux tentatives, pas davantage : au-dela, l'utilisateur attend une
    // reponse qui ne viendra pas plutot que de lire un message.
    const faux = fetchQuiEchoue(99);

    await expect(fetchAvecDelai(1000)('https://exemple.test')).rejects.toThrow(
      'fetch failed',
    );
    expect(faux).toHaveBeenCalledTimes(2);
  });

  it('ne rejoue PAS une erreur qui n est pas une panne reseau', async () => {
    // Un refus applicatif se reproduirait a l'identique : le rejouer ne fait
    // que doubler l'attente.
    const faux = fetchQuiEchoue(99, new TypeError('Invalid URL'));

    await expect(fetchAvecDelai(1000)('https://exemple.test')).rejects.toThrow(
      'Invalid URL',
    );
    expect(faux).toHaveBeenCalledTimes(1);
  });
});

describe('Une ECRITURE ne se rejoue jamais', () => {
  it('echoue franchement sur un POST', async () => {
    // Rejouer un `insert` creerait un doublon silencieux — un croyant en double
    // vaut bien pire qu'un message d'erreur.
    const faux = fetchQuiEchoue(1);

    await expect(
      fetchAvecDelai(1000)('https://exemple.test', { method: 'POST' }),
    ).rejects.toThrow('fetch failed');
    expect(faux).toHaveBeenCalledTimes(1);
  });

  it('couvre aussi PATCH et DELETE', async () => {
    for (const method of ['PATCH', 'DELETE', 'PUT']) {
      const faux = fetchQuiEchoue(1);
      await expect(
        fetchAvecDelai(1000)('https://exemple.test', { method }),
      ).rejects.toThrow();
      expect(faux, method).toHaveBeenCalledTimes(1);
    }
  });

  it('rejoue HEAD, qui ne modifie rien', async () => {
    const faux = fetchQuiEchoue(1);
    await fetchAvecDelai(1000)('https://exemple.test', { method: 'HEAD' });
    expect(faux).toHaveBeenCalledTimes(2);
  });
});

describe('Une annulation VOULUE ne se rejoue pas', () => {
  it('respecte un signal deja interrompu', async () => {
    // Navigation interrompue : plus personne n'attend la reponse.
    const faux = fetchQuiEchoue(99);
    const controleur = new AbortController();
    controleur.abort();

    await expect(
      fetchAvecDelai(1000)('https://exemple.test', { signal: controleur.signal }),
    ).rejects.toThrow();
    expect(faux).toHaveBeenCalledTimes(1);
  });
});

describe('Ce qui compte comme panne reseau', () => {
  it('reconnait les echecs de transport, quel que soit leur libelle', () => {
    expect(estPanneReseau(new TypeError('fetch failed'))).toBe(true);
    expect(estPanneReseau({ name: 'TimeoutError' })).toBe(true);
    expect(estPanneReseau({ name: 'AuthRetryableFetchError' })).toBe(true);
    expect(estPanneReseau({ message: 'ECONNRESET' })).toBe(true);
  });

  it('ne confond pas un REFUS avec une panne', () => {
    // La distinction decide d'une deconnexion : un 401 signifie « pas de
    // session », une panne signifie « je ne sais pas ».
    expect(estPanneReseau({ status: 401 })).toBe(false);
    expect(estPanneReseau({ status: 403 })).toBe(false);
  });

  it('traite une panne SERVEUR comme une indisponibilite', () => {
    expect(estPanneReseau({ status: 503 })).toBe(true);
  });
});
