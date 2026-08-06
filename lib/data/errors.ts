import 'server-only';

/**
 * Erreur de lecture — ENF-UTI-05.
 *
 * Le message porte est destine a l'utilisateur ; le detail technique part dans
 * les journaux serveur, jamais a l'ecran.
 */
export class DataError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DataError';
    this.cause = cause;

    if (cause) {
      const detail =
        typeof cause === 'object' && cause !== null
          ? {
              code: (cause as { code?: string }).code,
              message: (cause as { message?: string }).message,
              details: (cause as { details?: string }).details,
              hint: (cause as { hint?: string }).hint,
            }
          : cause;
      console.error(`[data] ${message}`, detail);
    }
  }
}
