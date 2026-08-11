/**
 * Assainissement des entrees — ENF-SEC-04, plan.md §4.4.
 *
 * Toute chaine libre saisie par un utilisateur (nom, adresse, libelle, motif,
 * notes) traverse ce module AVANT persistance. Aucune de ces valeurs n'est
 * jamais rendue via `dangerouslySetInnerHTML` : React echappe deja tout ce
 * qu'il affiche. Ce module est une defense EN PROFONDEUR, pour ce qui sortira
 * un jour de React — un export CSV, un PDF, un courriel.
 *
 * POURQUOI SANS DEPENDANCE
 *
 * Il s'appuyait sur `isomorphic-dompurify`, qui entraine `jsdom` cote serveur.
 * En production, le 11 aout 2026, Vercel a echoue a le charger :
 *
 *     Failed to load external module jsdom-… : ERR_REQUIRE_ESM
 *
 * L'erreur survenait a l'EVALUATION du module, donc AVANT le corps de la
 * Server Action : `executerAction` ne pouvait rien attraper, et l'ecran
 * n'affichait rien. Chaque mutation qui assainit une chaine — creer un
 * croyant, ouvrir un bureau, modifier un referentiel — etait morte.
 *
 * Or aucun de ces usages n'a besoin d'un DOM. Retirer du balisage d'un nom
 * propre est une operation de TEXTE. Embarquer un moteur HTML complet dans une
 * fonction sans serveur pour cela, c'etait payer dix megaoctets et une classe
 * entiere de pannes pour vingt lignes.
 */

const ECHAPPEMENTS: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function echapper(valeur: string): string {
  return valeur.replace(/[&<>"']/g, (c) => ECHAPPEMENTS[c]!);
}

/**
 * Retire tout balisage, en BOUCLANT jusqu'a stabilite.
 *
 * Une seule passe se contourne par imbrication : `<scr<script>ipt>` devient
 * `<script>` apres un unique remplacement. On repete donc tant que la chaine
 * change — elle ne peut que raccourcir, la boucle se termine.
 *
 * Le motif accepte une balise NON TERMINEE (`<script` en fin de chaine) : sans
 * cela, un chevron ouvrant survivrait a l'operation.
 */
function retirerBalises(valeur: string): string {
  let precedent: string;
  let courant = valeur;

  do {
    precedent = courant;
    courant = precedent.replace(/<[^>]*>?/g, '');
  } while (courant !== precedent);

  return courant;
}

/**
 * Les caracteres de controle n'ont aucun sens dans une saisie et brouillent
 * les exports : un NUL tronque un CSV, un retour chariot isole casse une
 * ligne. La tabulation et le saut de ligne sont conserves — une adresse tient
 * parfois sur deux lignes.
 */
function retirerControles(valeur: string): string {
  return valeur.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/**
 * Texte brut : tout balisage est SUPPRIME, pas echappe.
 *
 * Un nom de croyant n'a aucune raison de contenir du HTML ; le garder sous
 * forme echappee laisserait « &lt;b&gt;Jean&lt;/b&gt; » dans la base et sur
 * les etiquettes.
 */
export function sanitize(valeur: string): string {
  return retirerControles(retirerBalises(valeur)).trim();
}

/** Balises tolerees dans un bloc de texte enrichi. Aucune ne porte d'attribut. */
const BALISES_AUTORISEES = [
  'b',
  'strong',
  'i',
  'em',
  'u',
  'br',
  'p',
  'ul',
  'ol',
  'li',
] as const;

/**
 * Texte enrichi minimal — reserve aux blocs `texte` du generateur de rapports
 * (EF-RAP-02, lot 6). Mise en forme seulement : ni lien, ni image, ni script.
 *
 * LA METHODE, ET POURQUOI ELLE EST SURE
 *
 * On echappe TOUT d'abord, puis on retablit les seules balises autorisees, une
 * par une, sous leur forme exacte et sans attribut. C'est l'inverse de la
 * demarche habituelle — analyser puis filtrer — et c'est ce qui la rend
 * verifiable : ce qui n'a pas ete explicitement retabli reste echappe.
 *
 * `<b onclick="…">` ne correspond a aucun motif retabli : il demeure
 * `&lt;b onclick=…&gt;`, du texte inerte. Aucune imbrication, aucun encodage
 * exotique ne peut produire une balise que la liste ne nomme pas.
 */
export function sanitizeTexteRiche(valeur: string): string {
  let resultat = retirerControles(echapper(valeur));

  for (const balise of BALISES_AUTORISEES) {
    resultat = resultat
      .replaceAll(`&lt;${balise}&gt;`, `<${balise}>`)
      .replaceAll(`&lt;/${balise}&gt;`, `</${balise}>`)
      .replaceAll(`&lt;${balise}/&gt;`, `<${balise}/>`);
  }

  return resultat;
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
