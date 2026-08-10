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
/**
 * Une SECONDE tentative, et pour les lectures seulement — ENF-PRF-01.
 *
 * Le lien vers l'hebergeur produit des `TypeError: fetch failed` isoles. Une
 * page qui enchaine cinq requetes voit alors la probabilite d'echec se cumuler,
 * et l'ecran annonce une panne pour un paquet perdu.
 *
 * POURQUOI PAS LES ECRITURES
 *
 * Un echec de transport ne dit PAS que le serveur n'a rien fait : la requete a
 * pu aboutir et seule la reponse se perdre. Rejouer un `insert` creerait alors
 * un doublon silencieux — un croyant en double vaut bien pire qu'un message
 * d'erreur. Les mutations echouent donc franchement, et c'est l'utilisateur qui
 * decide de recommencer.
 *
 * `GET` et `HEAD` sont les seules methodes sur lesquelles PostgREST ne modifie
 * rien : ce sont exactement celles qu'on peut rejouer sans y penser.
 */
const METHODES_REJOUABLES = new Set(['GET', 'HEAD']);

/**
 * Cet echec vaut-il d'etre REJOUE ?
 *
 * Question plus stricte que celle d'`estPanneReseau`, et il a fallu un test
 * pour s'en apercevoir. Cette derniere repond « oui » a toute erreur sans
 * statut — c'est voulu la ou elle sert : dans le doute, ne pas deconnecter
 * l'utilisateur. Mais « je ne sais pas » ne justifie pas de rejouer : une URL
 * malformee ou un bogue de programmation echoueraient a l'identique, en
 * doublant l'attente.
 *
 * On ne retient donc que les echecs de TRANSPORT reconnaissables.
 */
function estEchecDeTransport(erreur: unknown): boolean {
  if (!erreur || typeof erreur !== 'object') return false;

  const e = erreur as { name?: string; message?: string };
  if (e.name === 'TimeoutError' || e.name === 'AuthRetryableFetchError') return true;

  return /fetch failed|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|ECONNRESET|Connect Timeout|socket hang up/i.test(
    e.message ?? '',
  );
}

export function fetchAvecDelai(delaiMs: number, essais = 2): typeof fetch {
  return async (entree, init) => {
    const methode = (init?.method ?? 'GET').toUpperCase();
    const rejouable = METHODES_REJOUABLES.has(methode);

    let derniere: unknown;

    for (let tentative = 0; tentative < (rejouable ? essais : 1); tentative++) {
      const signaux = [AbortSignal.timeout(delaiMs)];
      if (init?.signal) signaux.push(init.signal);

      try {
        return await fetch(entree, { ...init, signal: AbortSignal.any(signaux) });
      } catch (erreur) {
        derniere = erreur;

        // Une annulation VOULUE — navigation interrompue — ne se rejoue pas :
        // plus personne n'attend la reponse.
        if (init?.signal?.aborted) throw erreur;
        if (!estEchecDeTransport(erreur)) throw erreur;
      }
    }

    throw derniere;
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
