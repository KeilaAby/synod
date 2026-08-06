/**
 * Contrat de retour unique — plan.md §7.3.
 *
 * Toutes les Server Actions et toutes les regles de gestion retournent cette
 * forme. Les formulaires la consomment de maniere uniforme : un seul chemin
 * d'affichage d'erreur dans toute l'application.
 */

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok(): ActionResult<void>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | void> {
  return { ok: true, data: data as T };
}

export function ko<T = never>(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<T> {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}

/** Retrecit le type a la branche succes. */
export function estSucces<T>(
  resultat: ActionResult<T>,
): resultat is { ok: true; data: T } {
  return resultat.ok;
}
