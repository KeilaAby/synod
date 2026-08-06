import DOMPurify from 'isomorphic-dompurify';

/**
 * Assainissement des entrees — ENF-SEC-04, plan.md §4.4.
 *
 * Toute chaine libre saisie par un utilisateur (nom, adresse, libelle, motif,
 * notes, texte des blocs de rapport) traverse ce module AVANT persistance.
 * Aucune de ces valeurs n'est jamais rendue via `dangerouslySetInnerHTML`.
 */

/**
 * Texte brut : tout balisage est supprime, pas echappe.
 * C'est le cas par defaut — un nom de croyant n'a aucune raison de contenir
 * du HTML.
 */
export function sanitize(valeur: string): string {
  return DOMPurify.sanitize(valeur, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  }).trim();
}

/**
 * Texte enrichi minimal — reserve aux blocs `texte` du generateur de rapports
 * (EF-RAP-02). La liste blanche est volontairement etroite : mise en forme
 * seulement, ni lien, ni image, ni script.
 */
export function sanitizeTexteRiche(valeur: string): string {
  return DOMPurify.sanitize(valeur, {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: [],
  });
}

/**
 * Assainit recursivement toutes les chaines d'un objet de saisie.
 * A appeler dans les Server Actions, apres la validation Zod : Zod garantit
 * la FORME, ce module garantit l'INNOCUITE du contenu.
 */
export function sanitizeAll<T>(valeur: T): T {
  if (typeof valeur === 'string') {
    return sanitize(valeur) as T;
  }
  if (Array.isArray(valeur)) {
    return valeur.map((v) => sanitizeAll(v)) as T;
  }
  if (valeur !== null && typeof valeur === 'object') {
    if (valeur instanceof Date) return valeur;

    const resultat: Record<string, unknown> = {};
    for (const [cle, v] of Object.entries(valeur)) {
      resultat[cle] = sanitizeAll(v);
    }
    return resultat as T;
  }
  return valeur;
}
