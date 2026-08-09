import 'server-only';

/**
 * Erreur de lecture — ENF-UTI-05.
 *
 * Le message porte est destine a l'utilisateur ; le detail technique part dans
 * les journaux serveur, jamais a l'ecran.
 */
/**
 * Ce qu'on ecrit dans les journaux a propos d'une cause.
 *
 * La version precedente ne relevait que les quatre champs de PostgREST — `code`,
 * `message`, `details`, `hint`. Quand la panne venait d'AILLEURS (une requete
 * interrompue, une coupure reseau, un `TypeError`), aucun n'etait renseigne et
 * la trace se reduisait a `{}`. Un journal qui dit « quelque chose a echoue »
 * sans dire quoi coute une session entiere de recherche.
 */
function decrire(cause: unknown): unknown {
  if (typeof cause !== 'object' || cause === null) return cause;

  const erreur = cause as Record<string, unknown>;
  const postgrest = {
    code: erreur.code,
    message: erreur.message,
    details: erreur.details,
    hint: erreur.hint,
  };

  if (Object.values(postgrest).some((v) => v !== undefined)) return postgrest;

  // Aucun champ PostgREST : on retombe sur ce que l'objet sait dire de lui.
  return {
    type: cause.constructor?.name ?? typeof cause,
    texte: String((erreur.message as string) ?? cause),
    cles: Object.keys(erreur),
  };
}

export class DataError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DataError';
    this.cause = cause;

    if (cause) {
      console.error(`[data] ${message}`, decrire(cause));
    }
  }
}
