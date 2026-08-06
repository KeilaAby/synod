import 'server-only';

import { DataError } from '@/lib/data/errors';
import { type ActionResult, ko } from '@/lib/domain/result';
import { ErreurAcces } from '@/lib/session';

/**
 * Enveloppe commune des Server Actions.
 *
 * POURQUOI : une Server Action qui laisse échapper une exception ne dit rien à
 * l'utilisateur. Next affiche « An unexpected response was received from the
 * server » — un message qui ne nomme ni la cause, ni le champ, ni l'action.
 * Le défaut n'est pas l'erreur elle-même, c'est qu'elle devienne muette.
 *
 * Ici, TOUT est converti en `ActionResult` :
 *   - `ErreurAcces`  -> le message est déjà destiné à l'utilisateur
 *   - `DataError`    -> idem, le détail technique est déjà parti dans les logs
 *   - le reste       -> message générique PORTEUR D'UNE RÉFÉRENCE, et trace
 *                       serveur complète sous la même référence
 *
 * La référence est ce qui rend un incident diagnosticable : l'utilisateur la
 * lit à l'écran, elle se retrouve telle quelle dans la console du serveur.
 */
export async function executerAction<T>(
  nom: string,
  operation: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await operation();
  } catch (erreur) {
    if (erreur instanceof ErreurAcces) {
      return ko<T>(erreur.message);
    }

    if (erreur instanceof DataError) {
      return ko<T>(erreur.message);
    }

    // `redirect()` et `notFound()` de Next passent par une exception dédiée
    // qu'il ne faut SURTOUT pas avaler : elle porte la navigation.
    if (
      erreur !== null &&
      typeof erreur === 'object' &&
      'digest' in erreur &&
      typeof (erreur as { digest?: unknown }).digest === 'string' &&
      (erreur as { digest: string }).digest.startsWith('NEXT_')
    ) {
      throw erreur;
    }

    const reference = Math.random().toString(36).slice(2, 8).toUpperCase();
    console.error(`[action:${nom}] échec inattendu — référence ${reference}`, erreur);

    return ko<T>(
      `L'opération a échoué pour une raison inattendue (référence ${reference}). ` +
        'Le détail figure dans les journaux du serveur.',
    );
  }
}
