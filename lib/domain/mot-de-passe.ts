/**
 * Le mot de passe remis en main propre — EF-ADM-01, EF-ADM-08.
 *
 * POURQUOI UN GENERATEUR PLUTOT QU'UN CHAMP DE SAISIE.
 *
 * Les comptes ne se creent pas par invitation par courriel : l'administrateur
 * les ouvre et communique les identifiants directement. Laisser l'administrateur
 * CHOISIR le mot de passe produirait ce qu'on observe partout — le meme pour
 * tout le monde, ou le nom de l'entite suivi de l'annee. Un mot de passe genere
 * est le seul qui ne suive pas un motif devinable.
 *
 * IL DOIT SE LIRE A VOIX HAUTE ET SE RECOPIER SANS ERREUR. C'est la contrainte
 * qui commande tout le reste : il sera dicte au telephone, ecrit sur un papier,
 * retape sur un telephone. D'ou :
 *
 *   - AUCUN CARACTERE AMBIGU. `0` et `O`, `1`, `l` et `I` sont exclus : la
 *     moitie des echecs de premiere connexion vient de la. On y perd un peu
 *     d'entropie par caractere, on la reprend en longueur.
 *   - DES GROUPES SEPARES PAR DES TIRETS. « K7QM-3XRV-9BTP » se dicte en trois
 *     temps et se verifie d'un coup d'oeil ; quatorze caracteres d'affilee se
 *     relisent trois fois.
 *   - PAS DE PONCTUATION. Elle ne survit ni a la dictee — « underscore ou tiret
 *     du huit ? » — ni aux claviers de telephone.
 *
 * LA POLITIQUE RESTE RESPECTEE. `ENF-SEC-03` exige une minuscule, une majuscule
 * et un chiffre : le generateur les impose plutot que d'esperer les tirer.
 */

/** Sans `I`, `L`, `O` — ni les minuscules et chiffres qui leur ressemblent. */
const MAJUSCULES = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const MINUSCULES = 'abcdefghjkmnpqrstuvwxyz';
const CHIFFRES = '23456789';
const ALPHABET = MAJUSCULES + MINUSCULES + CHIFFRES;

const GROUPES = 3;
const PAR_GROUPE = 5;

/** Un entier dans `[0, borne[`, tire du generateur cryptographique. */
function tirage(borne: number): number {
  const tampon = new Uint32Array(1);
  globalThis.crypto.getRandomValues(tampon);

  /**
   * `% borne` biaise le tirage quand `borne` ne divise pas 2^32 — les premieres
   * valeurs sortent un peu plus souvent. Le biais est infime ici, mais le
   * rejeter coute une boucle qui s'execute presque jamais, et evite d'avoir a
   * expliquer plus tard pourquoi un generateur de mots de passe est « presque »
   * uniforme.
   */
  const plafond = Math.floor(0xffff_ffff / borne) * borne;
  return tampon[0]! >= plafond ? tirage(borne) : tampon[0]! % borne;
}

function unParmi(alphabet: string): string {
  return alphabet[tirage(alphabet.length)]!;
}

/**
 * Un mot de passe de quinze caracteres, en trois groupes de cinq.
 *
 * Quinze caracteres sur un alphabet de 55 valent environ 87 bits — largement
 * au-dela des douze caracteres qu'exige `MOT_DE_PASSE_LONGUEUR_MIN`, et la
 * marge paie le retrait des caracteres ambigus.
 */
export function genererMotDePasse(): string {
  // Les trois exigences de la politique sont POSEES, puis melangees : les
  // tirer au hasard en esperant qu'elles sortent produirait, une fois sur
  // quelques centaines, un mot de passe que le serveur refuserait lui-meme.
  const imposes = [unParmi(MAJUSCULES), unParmi(MINUSCULES), unParmi(CHIFFRES)];

  const total = GROUPES * PAR_GROUPE;
  const reste = Array.from({ length: total - imposes.length }, () => unParmi(ALPHABET));

  const caracteres = melanger([...imposes, ...reste]);

  return Array.from({ length: GROUPES }, (_, g) =>
    caracteres.slice(g * PAR_GROUPE, (g + 1) * PAR_GROUPE).join(''),
  ).join('-');
}

/** Fisher-Yates, avec le meme tirage non biaise. */
function melanger(valeurs: readonly string[]): string[] {
  const melange = [...valeurs];
  for (let i = melange.length - 1; i > 0; i -= 1) {
    const j = tirage(i + 1);
    [melange[i], melange[j]] = [melange[j]!, melange[i]!];
  }
  return melange;
}

/**
 * Le mot de passe genere est-il conforme a la politique ?
 *
 * Utilise par le test, et par personne d'autre : c'est un filet, pas une etape.
 * Il existe parce qu'un generateur qui produirait un mot de passe refuse par le
 * serveur echouerait a la CREATION du compte — donc devant l'utilisateur, et
 * sans qu'on sache pourquoi.
 */
export function respecteLaPolitique(motDePasse: string, longueurMin: number): boolean {
  const sansTirets = motDePasse.replaceAll('-', '');

  return (
    sansTirets.length >= longueurMin &&
    /[a-z]/.test(sansTirets) &&
    /[A-Z]/.test(sansTirets) &&
    /[0-9]/.test(sansTirets)
  );
}
