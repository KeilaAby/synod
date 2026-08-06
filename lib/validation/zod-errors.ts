import type { z } from 'zod';

/**
 * Convertit les erreurs Zod en map `champ -> messages`, directement exploitable
 * par React Hook Form via `setError`.
 *
 * Le serveur revalide toujours (regle non negociable n°2) : sans cette
 * conversion, une erreur cote serveur s'afficherait comme un message global au
 * lieu de se poser sur le champ fautif.
 */
export function champsEnErreur(erreur: z.ZodError): Record<string, string[]> {
  const map: Record<string, string[]> = {};

  for (const probleme of erreur.issues) {
    const cle = probleme.path.map(String).join('.') || '_';
    (map[cle] ??= []).push(probleme.message);
  }

  return map;
}
