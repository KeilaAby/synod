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
function decrire(cause: unknown): string {
  if (typeof cause !== 'object' || cause === null) return String(cause);

  const erreur = cause as Record<string, unknown>;

  /**
   * UNE CHAINE, ET PLUS UN OBJET.
   *
   * `console.error` recevait un objet. Dans le terminal il s'affichait ; dans la
   * superposition d'erreurs de Next, il devenait « {} » — et l'on repartait
   * chercher une panne dont le seul indice avait ete mange par l'affichage.
   * Une chaine se lit partout de la meme facon.
   */
  const morceaux = [
    ['code', erreur.code],
    ['message', erreur.message],
    ['details', erreur.details],
    ['hint', erreur.hint],
  ]
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([cle, v]) => `${cle}=${String(v)}`);

  if (morceaux.length > 0) return morceaux.join(' · ');

  /**
   * Aucun champ PostgREST : la panne vient d'ailleurs — requete interrompue,
   * coupure reseau, `TypeError`. On rend alors ce que l'objet sait dire de
   * lui-meme, y compris ses proprietes NON ENUMERABLES : `Error.message` en
   * est une, et `Object.keys` la manque.
   */
  const nom = (cause as { constructor?: { name?: string } }).constructor?.name ?? 'objet';
  const texte = String(erreur.message ?? cause);
  const cles = Object.keys(erreur);

  return `${nom} — ${texte}${cles.length > 0 ? ` (clés : ${cles.join(', ')})` : ''}`;
}

export class DataError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DataError';
    this.cause = cause;

    if (cause) {
      // Un seul argument : la superposition de Next n'affiche fidelement que
      // le premier, et le detail est justement ce qu'on vient y chercher.
      console.error(`[data] ${message} — ${decrire(cause)}`);
    }
  }
}
