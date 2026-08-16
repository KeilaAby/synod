/**
 * Lecture d'un CSV — EF-CRO-11, EF-STR-11.
 *
 * POURQUOI PAS DE BIBLIOTHEQUE
 *
 * Le format tient en une trentaine de lignes, et les deux candidates posent
 * chacune un probleme : `xlsx` publie sur npm est fige depuis des annees avec
 * des vulnerabilites connues — sa version maintenue vit hors du registre —, et
 * `exceljs` pese pres d'un megaoctet pour un besoin de lecture.
 *
 * Un tableur exporte en CSV en deux clics. Le jour ou le XLSX s'impose
 * vraiment — classeurs multi-feuilles, cellules fusionnees —, le lecteur se
 * branchera ici sans rien changer au reste de la chaine, qui ne manipule que
 * des tableaux de chaines.
 *
 * Module PUR : aucune dependance, donc testable directement.
 */

/**
 * Separateur reellement employe.
 *
 * Excel en francais ecrit des points-virgules, la plupart des autres outils des
 * virgules. Imposer l'un des deux ferait echouer un fichier sur deux, avec une
 * seule colonne contenant toute la ligne — symptome que personne ne relie a un
 * probleme de separateur.
 *
 * On compte les occurrences hors guillemets sur la premiere ligne : la
 * ponctuation d'un libelle ne doit pas peser dans le verdict.
 */
export function detecterSeparateur(premiereLigne: string): string {
  const candidats = [';', ',', '\t'];
  let meilleur = ';';
  let record = -1;

  for (const separateur of candidats) {
    let compte = 0;
    let dansGuillemets = false;

    for (const caractere of premiereLigne) {
      if (caractere === '"') dansGuillemets = !dansGuillemets;
      else if (caractere === separateur && !dansGuillemets) compte++;
    }

    if (compte > record) {
      record = compte;
      meilleur = separateur;
    }
  }

  return meilleur;
}

/**
 * Analyse un CSV en tableau de lignes.
 *
 * Gere les champs entre guillemets, les guillemets doubles echappes (`""`), les
 * sauts de ligne A L'INTERIEUR d'un champ — une adresse sur deux lignes est
 * frequente — et les fins de ligne Windows.
 */
export function lireCsv(contenu: string): string[][] {
  // Le BOM d'Excel se retrouverait sinon colle au premier entete, qui ne
  // correspondrait plus a rien.
  const texte = contenu.replace(/^﻿/, '');
  if (texte.trim() === '') return [];

  const premiereLigne = texte.split(/\r?\n/, 1)[0] ?? '';
  const separateur = detecterSeparateur(premiereLigne);

  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let dansGuillemets = false;

  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]!;

    if (dansGuillemets) {
      if (c === '"') {
        // `""` a l'interieur d'un champ represente un guillemet litteral.
        if (texte[i + 1] === '"') {
          champ += '"';
          i++;
        } else {
          dansGuillemets = false;
        }
      } else {
        champ += c;
      }
      continue;
    }

    if (c === '"') {
      dansGuillemets = true;
    } else if (c === separateur) {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n') {
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else if (c !== '\r') {
      champ += c;
    }
  }

  // Derniere ligne sans saut final.
  if (champ !== '' || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }

  return lignes;
}

/** Separe les entetes des donnees, et ecarte les lignes vides de fin. */
export function separerEntetes(lignes: string[][]): {
  entetes: string[];
  donnees: string[][];
} {
  if (lignes.length === 0) return { entetes: [], donnees: [] };

  const [entetes = [], ...reste] = lignes;
  return {
    entetes: entetes.map((e) => e.trim()),
    donnees: reste.filter((l) => l.some((c) => c.trim() !== '')),
  };
}

/**
 * Ecriture d'un CSV — EF-FIN-25.
 *
 * LE POINT-VIRGULE, PAS LA VIRGULE. Excel choisit son separateur d'apres la
 * langue de l'installation, et en francais c'est le point-virgule : un fichier
 * a la virgule s'y ouvre en UNE colonne, ce que l'utilisateur lit comme un
 * export casse. `detecterSeparateur` fait le chemin inverse a la lecture.
 *
 * LE GUILLEMET SE DOUBLE, il ne s'echappe pas par une contre-oblique : c'est la
 * convention du format (RFC 4180), et la seule que les tableurs comprennent.
 *
 * CRLF EN FIN DE LIGNE, pour la meme raison de compatibilite.
 */
export function ecrireCsv(lignes: readonly (readonly string[])[], separateur = ';'): string {
  const champ = (valeur: string) => {
    // On ne cite QUE ce qui l'exige : un fichier tout entre guillemets se lit
    // mal a l'oeil, et l'oeil est le premier outil de verification d'un export.
    const doitCiter =
      valeur.includes(separateur) ||
      valeur.includes('"') ||
      valeur.includes('\n') ||
      valeur.includes('\r');

    return doitCiter ? `"${valeur.replace(/"/g, '""')}"` : valeur;
  };

  return lignes.map((ligne) => ligne.map(champ).join(separateur)).join('\r\n');
}

/**
 * La marque d'ordre des octets, qu'Excel EXIGE pour lire de l'UTF-8.
 *
 * Sans elle, « Antsahatsiresy » passe, mais « Andrianjafy Ratsimbazafy » perd
 * ses accents et le fichier se lit en latin-1. Trois octets qui epargnent une
 * conversion manuelle a chaque export.
 */
export const BOM_UTF8 = '\uFEFF';
