/**
 * Comportement réseau face à un hébergeur injoignable.
 *
 * Sans garde-fou, une coupure réseau se manifeste de la pire des façons :
 * chaque requête attend le délai par défaut d'undici — dix secondes — et une
 * session non vérifiable est prise pour une session absente, ce qui déconnecte
 * l'utilisateur au premier hoquet.
 */

/**
 * Un aller-retour vers l'hébergeur ne doit jamais bloquer une page plus de
 * quelques secondes. Mieux vaut un message clair rapidement qu'un écran figé.
 */
export const DELAI_RESEAU_MS = 6_000;

/** Le proxy s'exécute sur CHAQUE requête : son budget est plus serré encore. */
export const DELAI_RESEAU_PROXY_MS = 3_000;

/**
 * `fetch` borné dans le temps, à passer au client Supabase.
 *
 * `AbortSignal.any` préserve l'annulation d'origine — sans quoi une navigation
 * interrompue continuerait d'attendre côté serveur.
 */
export function fetchAvecDelai(delaiMs: number): typeof fetch {
  return (entree, init) => {
    const signaux = [AbortSignal.timeout(delaiMs)];
    if (init?.signal) signaux.push(init.signal);

    return fetch(entree, { ...init, signal: AbortSignal.any(signaux) });
  };
}

/**
 * L'échec vient-il du RÉSEAU plutôt que d'un refus d'authentification ?
 *
 * La distinction est décisive : un refus (401, 403) signifie « pas de
 * session » et justifie une redirection vers la connexion. Une panne réseau
 * signifie « je ne sais pas » — y répondre par une déconnexion ferait perdre
 * son travail à l'utilisateur pour une coupure de trois secondes.
 */
export function estPanneReseau(erreur: unknown): boolean {
  if (!erreur || typeof erreur !== 'object') return false;

  const e = erreur as { name?: string; status?: number; message?: string };

  // Supabase expose explicitement les échecs de transport.
  if (e.name === 'AuthRetryableFetchError') return true;
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return true;

  // `fetch failed`, `ConnectTimeoutError`, `ENOTFOUND`… remontent sans statut.
  const message = e.message ?? '';
  if (
    /fetch failed|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|ECONNRESET|Connect Timeout|network/i.test(
      message,
    )
  ) {
    return true;
  }

  // Statut absent ou panne serveur : on ne peut rien conclure sur la session.
  return e.status === undefined || e.status === 0 || e.status >= 500;
}

/** Message unique, pour ne pas décrire la même panne de trois façons. */
export const MESSAGE_PANNE_RESEAU =
  "La base de données est momentanément injoignable. Vérifiez votre connexion, puis réessayez.";
