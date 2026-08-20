/**
 * Trier une liste chargee en memoire — EF-CRO-04.
 *
 * POURQUOI ICI ET PAS DANS L'ECRAN. Le tri est une regle, pas une decoration :
 * « les cellules vides passent en dernier », « les accents ne separent pas
 * Émile de Emile », « deux homonymes gardent leur ordre d'origine ». Trois
 * ecrans qui la reecriraient chacun de leur cote la reecriraient
 * differemment, et la liste des croyants ne se lirait pas comme celle des
 * comptes.
 *
 * MODULE PUR : aucune dependance a React ni a la base, donc directement
 * testable.
 *
 * REGLE 17 — le tri ne repart JAMAIS au serveur. Le perimetre est deja charge ;
 * demander a la base de le rendre dans un autre ordre coute un aller-retour
 * complet pour un travail que le navigateur fait en quelques millisecondes.
 */

export type SensTri = 'asc' | 'desc';

export interface EtatTri<C extends string> {
  readonly colonne: C;
  readonly sens: SensTri;
}

/**
 * Ce qu'une colonne sait extraire d'une ligne.
 *
 * `null` signifie « cette ligne n'a pas cette valeur » — une date de bapteme
 * absente, une cellule non renseignee. Ce n'est PAS zero, et ce n'est pas la
 * chaine vide : voir `comparer` plus bas.
 */
export type ValeurTriable = string | number | null;

/**
 * Comparateur francais, cree UNE fois.
 *
 * `Intl.Collator` coute cher a construire et rien dans notre usage ne varie :
 * l'instancier a chaque comparaison ferait un objet par paire de lignes.
 *
 * `sensitivity: 'base'` place « Émile » a cote de « Emile » plutot qu'apres
 * « Zoe » — ce que ferait une comparaison de codes de caracteres, et qui
 * rendrait une liste de noms malgaches et francais inutilisable.
 * `numeric: true` ordonne « Cellule 2 » avant « Cellule 10 ».
 */
const COLLATEUR = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/**
 * UNE ABSENCE N'EST PAS UNE PETITE VALEUR.
 *
 * Un croyant sans date de bapteme n'est pas « le premier baptise » ; une
 * cellule non renseignee n'est pas « la cellule A ». Les lignes sans valeur
 * partent donc EN DERNIER dans les deux sens — c'est ce qu'on attend d'une
 * liste : on trie pour rapprocher ce qui se compare, et l'inconnu ne se compare
 * a rien.
 *
 * L'inverser avec le sens ferait remonter en tete, sur un simple second clic,
 * exactement les lignes qu'on ne cherchait pas.
 */
function comparer(a: ValeurTriable, b: ValeurTriable): number {
  const aVide = a === null || a === '';
  const bVide = b === null || b === '';

  if (aVide && bVide) return 0;
  if (aVide) return 1;
  if (bVide) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;

  return COLLATEUR.compare(String(a), String(b));
}

/**
 * Trie une COPIE de la liste, selon la valeur extraite par `valeur`.
 *
 * Le tri est STABLE — c'est une garantie de `Array.prototype.sort` depuis
 * ES2019, et elle compte ici : deux croyants du meme grade restent dans l'ordre
 * ou la lecture precedente les avait mis, donc l'ordre par defaut sert de
 * second critere sans qu'on ait a l'ecrire.
 *
 * `sens` n'inverse que le resultat des lignes COMPARABLES : les absences
 * restent en queue, voir `comparer`.
 */
export function trierListe<T, C extends string>(
  lignes: readonly T[],
  etat: EtatTri<C> | null,
  valeur: (ligne: T, colonne: C) => ValeurTriable,
): T[] {
  if (!etat) return [...lignes];

  const facteur = etat.sens === 'asc' ? 1 : -1;

  return [...lignes].sort((a, b) => {
    const va = valeur(a, etat.colonne);
    const vb = valeur(b, etat.colonne);

    const aVide = va === null || va === '';
    const bVide = vb === null || vb === '';
    // Les absences ne suivent pas le sens : elles restent en queue.
    if (aVide || bVide) return comparer(va, vb);

    return comparer(va, vb) * facteur;
  });
}

/**
 * Le clic suivant sur un en-tete.
 *
 * DEUX ETATS, PAS TROIS. Un troisieme etat « aucun tri » rendrait la liste a
 * son ordre d'origine sans qu'aucun chevron ne l'explique — l'utilisateur
 * verrait un ordre changer sans savoir lequel il vient de demander. Une liste a
 * toujours un ordre ; ce qu'on choisit, c'est lequel.
 *
 * Une colonne nouvelle part TOUJOURS en ascendant : c'est le sens de lecture
 * naturel (A avant Z, le plus jeune avant le plus age), et partir en descendant
 * parce que la colonne precedente l'etait serait imprevisible.
 */
export function basculerTri<C extends string>(
  actuel: EtatTri<C> | null,
  colonne: C,
): EtatTri<C> {
  if (actuel?.colonne === colonne) {
    return { colonne, sens: actuel.sens === 'asc' ? 'desc' : 'asc' };
  }
  return { colonne, sens: 'asc' };
}

/**
 * La valeur de `aria-sort` pour l'en-tete d'une colonne.
 *
 * Les chevrons ne disent rien a un lecteur d'ecran. `aria-sort` porte la meme
 * information, et il n'est valide QUE sur la colonne active — le poser a
 * « none » partout ailleurs est le comportement attendu, pas un oubli.
 */
export function ariaSort<C extends string>(
  etat: EtatTri<C> | null,
  colonne: C,
): 'ascending' | 'descending' | 'none' {
  if (etat?.colonne !== colonne) return 'none';
  return etat.sens === 'asc' ? 'ascending' : 'descending';
}
