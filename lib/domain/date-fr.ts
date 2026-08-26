/**
 * Les dates saisies A LA FRANCAISE — jj/mm/aaaa.
 *
 * POURQUOI CE MODULE EXISTE. Un `<input type="date">` affiche la date dans la
 * langue DU NAVIGATEUR, pas dans celle de la page : `lang="fr"` n'y change
 * rien, et l'attribut n'est respecte ni par Firefox ni de facon fiable par
 * Chrome. Sur un poste configure en anglais, « 04/07/1988 » s'affiche donc
 * « 07/04/1988 » — et c'est le meme texte, avec deux sens opposes.
 *
 * LE DEFAUT EST SILENCIEUX ET GRAVE. Personne ne remarque qu'une date de
 * naissance a ete lue a l'envers : les deux formes sont plausibles onze mois
 * sur douze, et l'erreur ne se voit que le jour ou quelqu'un compare la fiche
 * a un acte de naissance. C'est exactement le genre d'ecart que ce projet
 * refuse de laisser au hasard de la configuration d'un poste.
 *
 * ON REPREND DONC LA MAIN : le champ est un texte, son format est ecrit dans
 * son etiquette, et la conversion se fait ici. Ce qui voyage vers la base reste
 * l'ISO `AAAA-MM-JJ`, comme partout ailleurs.
 *
 * Module PUR : aucune dependance a React ni au navigateur, donc directement
 * testable.
 */

/** Ce que l'utilisateur lit et tape. Sert d'espace reserve et de message. */
export const FORMAT_DATE_FR = 'jj/mm/aaaa';

/**
 * Le jour existe-t-il VRAIMENT ?
 *
 * `new Date(1988, 1, 31)` rend le 2 mars sans broncher : le 31 fevrier serait
 * accepte, et la fiche porterait une date que personne n'a saisie. On compare
 * donc les trois composantes apres construction.
 */
function jourReel(annee: number, mois: number, jour: number): boolean {
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  return (
    d.getUTCFullYear() === annee && d.getUTCMonth() === mois - 1 && d.getUTCDate() === jour
  );
}

/**
 * « 04/07/1988 » vers « 1988-07-04 », ou `null` si ce n'est pas une date.
 *
 * TOLERANT SUR LE SEPARATEUR, strict sur le reste : on accepte `/`, `-` et `.`
 * parce qu'un pave numerique n'a pas de barre oblique, et que la personne qui
 * tape vite ne doit pas etre reprise sur un detail de ponctuation.
 *
 * L'ANNEE EST EXIGEE SUR QUATRE CHIFFRES. « 88 » pourrait vouloir dire 1988 ou
 * 2088 : deviner reviendrait a inventer un siecle, et sur une date de
 * naissance l'erreur passerait inapercue pendant des annees.
 */
export function versIso(texte: string): string | null {
  const propre = texte.trim();
  if (propre === '') return null;

  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(propre);
  if (!m) return null;

  const jour = Number(m[1]);
  const mois = Number(m[2]);
  const annee = Number(m[3]);

  if (!jourReel(annee, mois, jour)) return null;

  return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

/** « 1988-07-04 » vers « 04/07/1988 ». Une valeur illisible rend `''`. */
export function versFrancais(iso: string | null | undefined): string {
  if (!iso) return '';

  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';

  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Pose les barres obliques PENDANT la frappe.
 *
 * Sans cela, il faudrait taper trois separateurs de plus par date — et sur un
 * pave numerique, ils ne sont meme pas sous les doigts. On ne garde que les
 * chiffres, et on les regroupe 2-2-4.
 *
 * LA SAISIE N'EST JAMAIS REFUSEE PENDANT LA FRAPPE : « 04/0 » est un etat
 * transitoire parfaitement normal. C'est `versIso` qui tranche, a la fin.
 */
export function masquerDateFr(saisie: string): string {
  const chiffres = saisie.replace(/\D/g, '').slice(0, 8);

  if (chiffres.length <= 2) return chiffres;
  if (chiffres.length <= 4) return `${chiffres.slice(0, 2)}/${chiffres.slice(2)}`;
  return `${chiffres.slice(0, 2)}/${chiffres.slice(2, 4)}/${chiffres.slice(4)}`;
}
