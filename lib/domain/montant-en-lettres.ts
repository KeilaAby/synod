/**
 * Le montant ECRIT EN TOUTES LETTRES — EF-FIN-27.
 *
 * POURQUOI UN RECU LE PORTE. « 12 000 » devient « 112 000 » d'un trait de
 * stylo ; « douze mille ariary » ne se rallonge pas. C'est la seule raison
 * d'etre de cette fonction, et elle suffit : partout ailleurs, le chiffre en
 * `tabular-nums` se lit mieux et se compare a l'oeil.
 *
 * Le francais n'a pas de regle unique — « quatre-vingts » prend un s, mais
 * « quatre-vingt mille » n'en prend pas ; « deux cents » en prend un, mais
 * « deux cent mille » non. Ces accords ne sont pas de la coquetterie sur un
 * recu : c'est le document que le croyant garde, et une faute y est vue par
 * tout le monde.
 */

const UNITES = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
  'dix-sept',
  'dix-huit',
  'dix-neuf',
] as const;

const DIZAINES = [
  '',
  '',
  'vingt',
  'trente',
  'quarante',
  'cinquante',
  'soixante',
  'soixante',
  'quatre-vingt',
  'quatre-vingt',
] as const;

/** `mille` est INVARIABLE ; `million` et au-dela sont des noms, donc variables. */
const ECHELLES = ['', 'mille', 'million', 'milliard', 'billion'] as const;

/**
 * Le nom de la monnaie, au pluriel : c'est lui qui se lit sur le recu.
 *
 * Le code ISO sert de repli. « 12 000 MGA » reste juste ; c'est seulement moins
 * bien dit qu'« ariary », et mieux qu'une monnaie inventee.
 */
export const DEVISES_EN_LETTRES: Readonly<Record<string, string>> = {
  MGA: 'ariary',
  EUR: 'euros',
  USD: 'dollars',
  XOF: 'francs CFA',
  XAF: 'francs CFA',
};

/** 0 a 99. Le « et » de « vingt et un » ne vaut pas pour « quatre-vingt-un ». */
function sousCent(n: number): string {
  if (n < 20) return UNITES[n];

  const dizaine = Math.floor(n / 10);
  const unite = n % 10;

  // 70 et 90 se disent sur la dizaine precedente : « soixante-dix »,
  // « quatre-vingt-dix ». C'est la seule irregularite vraiment structurelle.
  if (dizaine === 7 || dizaine === 9) {
    const base = dizaine === 7 ? 'soixante' : 'quatre-vingt';
    const reste = UNITES[10 + unite];
    // « soixante et onze », mais « quatre-vingt-onze » — sans « et ».
    return unite === 1 && dizaine === 7 ? `${base} et ${reste}` : `${base}-${reste}`;
  }

  const base = DIZAINES[dizaine];
  if (unite === 0) return base;
  // « quatre-vingt-un » n'a pas de « et », contrairement a « vingt et un ».
  if (unite === 1 && dizaine !== 8) return `${base} et un`;
  return `${base}-${UNITES[unite]}`;
}

/**
 * Un groupe de trois chiffres.
 *
 * `accordable` dit si le groupe TERMINE le nombre du point de vue de l'accord :
 * `cent` et `vingt` ne prennent leur s que la, jamais devant `mille`.
 */
function groupeDeTrois(n: number, accordable: boolean): string {
  const centaines = Math.floor(n / 100);
  const reste = n % 100;

  const mots: string[] = [];
  if (centaines === 1) mots.push('cent');
  else if (centaines > 1) mots.push(`${UNITES[centaines]} cent`);
  if (reste > 0) mots.push(sousCent(reste));

  const texte = mots.join(' ');
  if (!accordable) return texte;

  // « deux cents », mais « deux cent un » : le s tombe des que quelque chose suit.
  if (reste === 0 && centaines > 1) return `${texte}s`;
  // « quatre-vingts », « cent quatre-vingts » — meme regle, meme condition.
  if (texte.endsWith('quatre-vingt')) return `${texte}s`;
  return texte;
}

/**
 * Un entier positif, en toutes lettres.
 *
 * Rend une chaine vide pour ce qui n'est pas un entier positif representable :
 * un recu n'a pas a inventer une lecture de `NaN`, il vaut mieux qu'il n'en
 * porte aucune que d'en porter une fausse.
 */
export function nombreEnLettres(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';

  const entier = Math.floor(n);
  if (entier === 0) return 'zéro';
  if (entier >= 1e15) return '';

  // Decoupage par tranches de trois, des unites vers les grands nombres.
  const groupes: number[] = [];
  let reste = entier;
  while (reste > 0) {
    groupes.push(reste % 1000);
    reste = Math.floor(reste / 1000);
  }

  const parties: string[] = [];
  for (let rang = groupes.length - 1; rang >= 0; rang--) {
    const groupe = groupes[rang];
    if (groupe === 0) continue;

    if (rang === 0) {
      parties.push(groupeDeTrois(groupe, true));
    } else if (rang === 1) {
      // « mille » ne se compte pas : on ne dit pas « un mille ». Et rien ne
      // s'accorde devant lui — « deux cent mille », « quatre-vingt mille ».
      parties.push(groupe === 1 ? 'mille' : `${groupeDeTrois(groupe, false)} mille`);
    } else {
      const echelle = ECHELLES[rang];
      parties.push(`${groupeDeTrois(groupe, true)} ${echelle}${groupe > 1 ? 's' : ''}`);
    }
  }

  return parties.join(' ');
}

/**
 * Le montant d'un recu, en toutes lettres, monnaie comprise.
 *
 * Les centimes sont dits SEPAREMENT et seulement s'il y en a. L'ariary n'a pas
 * de subdivision en usage : sur un recu malgache, « et zero centime » serait
 * une precision que personne n'attend et qui ferait douter du reste.
 */
export function montantEnLettres(montant: number, devise: string): string {
  if (!Number.isFinite(montant)) return '';

  const arrondi = Math.round(Math.abs(montant) * 100) / 100;
  const entier = Math.floor(arrondi);
  const centimes = Math.round((arrondi - entier) * 100);

  const unite = DEVISES_EN_LETTRES[devise] ?? devise;
  const lettres = nombreEnLettres(entier);
  if (!lettres) return '';

  const base = `${lettres} ${unite}`;
  if (centimes === 0) return base;

  return `${base} et ${nombreEnLettres(centimes)} centime${centimes > 1 ? 's' : ''}`;
}
