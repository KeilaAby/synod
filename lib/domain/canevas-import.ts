import { type FeuilleXlsx } from './xlsx-ecriture';

/**
 * Les CANEVAS D'IMPORT — EF-CRO-11, EF-FIN-34.
 *
 * CE QU'ILS SERVENT. Le pop-up d'import n'exige aucun modele : il lit les
 * colonnes du fichier de l'utilisateur et lui demande a quoi elles
 * correspondent. C'est le bon choix pour un fichier QUI EXISTE DEJA — on ne
 * fait pas ressaisir ce que quelqu'un possede.
 *
 * Mais quand il n'existe pas encore, « aucun modele impose » ne dit pas par ou
 * commencer : le saisiste ouvre un tableur vide et doit deviner quelles
 * colonnes Synod attend, et lesquelles il ne peut pas laisser vides. Ce canevas
 * repond a cela, et a cela seulement — il reste une AMORCE, jamais une
 * contrainte.
 *
 * POURQUOI ICI ET NON DANS UN FICHIER JOINT AU DEPOT. Un `.xlsx` depose dans
 * `public/` est une copie : le jour ou une colonne devient facultative, le code
 * le sait et le fichier l'ignore. Le saisiste, lui, remplit le fichier. On le
 * FABRIQUE donc a la demande, a partir des memes registres que l'import —
 * `DESCRIPTION_CHAMPS` et `DESCRIPTION_VERSEMENT` — et la divergence devient
 * impossible plutot qu'improbable.
 *
 * MODULE PUR : aucune dependance serveur ni React, donc directement testable.
 */

export interface ColonneCanevas {
  /**
   * L'en-tete ECRITE DANS LE FICHIER.
   *
   * Elle reprend le `label` du registre d'import, au caractere pres : c'est ce
   * qui permet a la reconnaissance automatique de proposer la bonne
   * correspondance, et une variante inventee ici demanderait un choix manuel
   * de plus a chaque import.
   */
  readonly entete: string;
  readonly requis: boolean;
  /** Ce qu'il faut savoir pour la remplir. Vide quand il n'y a rien a dire. */
  readonly aide: string;
}

export interface Canevas {
  /** Sert au nom du fichier et au titre du guide. */
  readonly titre: string;
  readonly colonnes: readonly ColonneCanevas[];
  /** Des lignes de DONNEES, pas des commentaires : elles s'effacent d'un coup. */
  readonly exemples: readonly (readonly string[])[];
  readonly notes: readonly string[];
}

// -----------------------------------------------------------------------------
// Croyants — EF-CRO-11
// -----------------------------------------------------------------------------

/**
 * L'ORDRE EST CELUI DE LA SAISIE, pas celui du registre.
 *
 * On identifie la personne, on la rattache, puis on la joint — comme le
 * formulaire de croyant, et comme une fiche d'etat civil. Le registre, lui,
 * range les champs par obligation : utile pour un ecran de correspondance, pas
 * pour quelqu'un qui remplit des lignes.
 */
export const CANEVAS_CROYANTS: Canevas = {
  titre: 'Importer des croyants',

  colonnes: [
    { entete: 'Nom', requis: true, aide: 'En majuscules ou non, peu importe.' },
    { entete: 'Prenom', requis: true, aide: '' },
    {
      entete: 'Sexe',
      requis: true,
      aide: 'M ou F. « Homme » et « Femme » sont aussi acceptes.',
    },
    {
      entete: 'Date de naissance',
      requis: true,
      aide: 'JJ/MM/AAAA — 04/07/1988. Une date future est refusee.',
    },
    {
      entete: 'Eglise',
      requis: true,
      aide: "Nom OU code de l'eglise, tel qu'il figure dans Synod. Accents et majuscules indifferents.",
    },
    {
      entete: 'Grade',
      requis: true,
      aide: 'Libelle ou code : Croyant, Diacre, Pasteur… Doit exister dans les referentiels.',
    },
    {
      entete: 'Nationalite',
      requis: true,
      aide: 'Libelle ou code ISO a trois lettres : Malgache, MDG, FRA…',
    },
    { entete: 'Adresse', requis: true, aide: 'Texte libre.' },
    {
      entete: 'Cellule',
      requis: false,
      aide: "Nom ou code. Doit appartenir a l'eglise indiquee, sinon la ligne est refusee.",
    },
    {
      entete: 'Date de bapteme',
      requis: false,
      aide: 'JJ/MM/AAAA. Ne peut pas preceder la naissance.',
    },
    { entete: 'Telephone', requis: false, aide: 'Texte libre.' },
    { entete: 'Adresse e-mail', requis: false, aide: '' },
    {
      entete: 'Statut marital',
      requis: false,
      aide: 'Celibataire, Marie, Veuf, Divorce, Autre.',
    },
  ],

  exemples: [
    [
      'RAKOTO',
      'Jean',
      'M',
      '04/07/1988',
      'Ambohipo',
      'Croyant',
      'Malgache',
      'Lot II A 45 Ambohipo',
      '',
      '12/04/2010',
      '034 12 345 67',
      'jean.rakoto@exemple.mg',
      'Marie',
    ],
    [
      'RASOA',
      'Hanitra',
      'F',
      '19/11/1995',
      'Ambohipo',
      'Diacre',
      'Malgache',
      'Lot III B 12 Analakely',
      'Cellule Nord',
      '',
      '',
      '',
      'Celibataire',
    ],
  ],

  notes: [
    "L'ORDRE DES COLONNES EST LIBRE. Synod vous demandera, une seule fois, a",
    'quoi correspond chacune des votres. Vous pouvez donc partir du fichier que',
    'vous avez deja, sans le reorganiser.',
    '',
    'LES EN-TETES PEUVENT ETRE RENOMMEES. Elles sont reconnues automatiquement',
    'quand elles ressemblent a ce qui est attendu ; sinon vous les designez a la',
    'main.',
    '',
    'EGLISE, GRADE, NATIONALITE et CELLULE se resolvent sur ce que vous ecrivez :',
    'le nom ou le code, accents et majuscules indifferents. Une valeur qui ne',
    'correspond a rien fait refuser LA LIGNE, jamais le fichier entier.',
    '',
    "LE MATRICULE N'EST PAS UNE COLONNE. Il est attribue par Synod, qui seul",
    "garantit son unicite face a deux creations simultanees. L'ecrire ici ne",
    'servirait a rien.',
    '',
    'LA PHOTO NE S’IMPORTE PAS. Elle se joint depuis la fiche, apres coup.',
    '',
    'LES DOUBLONS SONT SIGNALES, PAS BLOQUES : meme nom, meme prenom et meme date',
    "de naissance qu'une fiche existante vous sera montre avant toute ecriture.",
    '',
    "RIEN N'EST ECRIT AVANT VOTRE CONFIRMATION. Vous verrez d'abord ce qui sera",
    'cree et ce qui sera refuse.',
    '',
    "SUPPRIMEZ LES DEUX LIGNES D'EXEMPLE avant d'importer.",
  ],
};

// -----------------------------------------------------------------------------
// Dimes — EF-FIN-34
// -----------------------------------------------------------------------------

/**
 * LE MONTANT EST LE SEUL CHAMP OBLIGATOIRE, et ce n'est pas une facilite de
 * saisie : une ligne represente de l'ARGENT DEJA RECU. L'enveloppe est dans
 * l'urne, elle ne disparaitra pas parce que le fichier est imparfait.
 *
 * Rendre un autre champ obligatoire ferait rejeter des lignes portant un
 * montant — donc perdre de la collecte, en silence.
 */
export const CANEVAS_DIMES: Canevas = {
  titre: 'Importer une feuille de versements',

  colonnes: [
    {
      entete: 'Montant',
      requis: true,
      aide: "LE SEUL CHAMP OBLIGATOIRE. « 1 500,50 » et « 1500.50 » sont acceptes. Zero et negatif sont refuses.",
    },
    {
      entete: 'Nom',
      requis: false,
      aide: "Vide = enveloppe anonyme. Un nom inconnu n'est PAS rejete : il part en rapprochement.",
    },
    {
      entete: 'Prenom',
      requis: false,
      aide: 'Le rapprochement porte sur le nom ET le prenom : deux freres ne se confondent pas.',
    },
    {
      entete: "N° d'enveloppe",
      requis: false,
      aide: 'Si le nom est reconnu et le numero nouveau, il lui est attribue automatiquement.',
    },
    {
      entete: 'Eglise de rattachement',
      requis: false,
      aide: "Nom ou code. Evite d'avoir a chercher l'eglise au moment de creer la fiche.",
    },
  ],

  exemples: [
    ['125000', 'RAKOTO', 'Jean', '1245', 'Ambohipo'],
    ['80000', 'RASOA', 'Hanitra', '', 'Ambohipo'],
    ['50000', '', '', '1536', 'Ambohipo'],
    ['30000', '', '', '', ''],
  ],

  notes: [
    "UNE LIGNE SANS NOM N'EST PAS UNE ERREUR : c'est une enveloppe anonyme. Son",
    "montant compte immediatement, puisque l'argent est deja recu.",
    '',
    'UN NOM QUE SYNOD NE RECONNAIT PAS N’EST PAS REJETE NON PLUS. Le versement',
    'est enregistre, un recu est emis a ce nom, et la ligne entre dans la file',
    "des personnes non rattachees. Le travail qui reste est de l'identification,",
    'pas de la comptabilite.',
    '',
    'SEULE UNE LIGNE SANS MONTANT LISIBLE EST ECARTEE, et son numero de ligne',
    'vous est indique.',
    '',
    "LE NUMERO D'ENVELOPPE SUFFIT A RAPPROCHER : une ligne sans nom mais avec un",
    'numero deja connu vous proposera son dernier porteur.',
    '',
    "LA DIME APPARTIENT AU SIEGE, pas a l'eglise qui la collecte (RG-33).",
    "L'eglise indiquee sert la tracabilite et le rattachement des personnes ;",
    "elle n'entre dans aucun solde d'eglise.",
    '',
    'LES MONTANTS RESTENT DES NOMBRES. Evitez le format « texte » dans Excel : un',
    'montant devenu texte ne se somme plus.',
    '',
    "SUPPRIMEZ LES QUATRE LIGNES D'EXEMPLE avant d'importer.",
  ],
};

// -----------------------------------------------------------------------------

/**
 * Les deux feuilles du classeur — L'ORDRE COMPTE.
 *
 * `lib/domain/xlsx.ts` lit la PREMIERE FEUILLE DECLAREE : la saisie doit donc
 * venir en tete, sinon c'est le mode d'emploi qui serait importe. Et rien ne
 * s'ecrit au-dessus des en-tetes, qui occupent la premiere ligne — un titre
 * pose la deviendrait le nom des colonnes.
 */
export function feuillesDuCanevas(canevas: Canevas): FeuilleXlsx[] {
  return [
    { nom: 'Saisie', lignes: [enTetes(canevas), ...canevas.exemples] },
    { nom: 'Guide de remplissage', lignes: guide(canevas) },
  ];
}

/**
 * L'OBLIGATION EST DITE DANS L'EN-TETE, pas seulement dans le guide.
 *
 * Le saisiste travaille dans la feuille de saisie : c'est la qu'il doit voir ce
 * qui est exige. Une etoile au-dessus de la colonne se voit sans quitter la
 * ligne qu'on remplit, la ou une consigne rangee ailleurs demande de se
 * souvenir qu'elle existe.
 *
 * L'IMPORT N'EN SOUFFRE PAS : la reconnaissance des en-tetes compare des
 * fragments, et « Nom * » se reconnait comme « Nom ». Verifie par test.
 */
export function enTetes(canevas: Canevas): string[] {
  return canevas.colonnes.map((c) => (c.requis ? `${c.entete} *` : c.entete));
}

function guide(canevas: Canevas): (string | null)[][] {
  const lignes: (string | null)[][] = [
    [`${canevas.titre.toLocaleUpperCase('fr')} — canevas Synod`],
    [],
    ["Les colonnes marquees d'une etoile (*) sont OBLIGATOIRES."],
    ['Une ligne a laquelle il manque une valeur obligatoire est refusee, et elle'],
    ['vous est nommee — le reste du fichier passe.'],
    [],
    ['Colonne', 'Obligatoire', 'Comment la remplir'],
  ];

  for (const c of canevas.colonnes) {
    lignes.push([c.entete, c.requis ? 'OUI' : 'facultative', c.aide]);
  }

  lignes.push([], ['A SAVOIR'], ...canevas.notes.map((n) => [n]));
  return lignes;
}

/** Un nom de fichier sans rien qui gene un systeme de fichiers. */
export function nomDuCanevas(canevas: Canevas): string {
  const base = canevas.titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return `canevas-${base}.xlsx`;
}
