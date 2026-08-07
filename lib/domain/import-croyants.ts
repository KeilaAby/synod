import { SEXES, type Sexe, STATUTS_MARITAUX, type StatutMarital } from './croyant';

/**
 * Import d'un lot de croyants — EF-CRO-11.
 *
 * Module PUR : il transforme des lignes de texte en croyants prets a inserer,
 * ou en erreurs situees. Aucune base, aucun fichier, donc entierement testable.
 *
 * DEUX PARTIS PRIS
 *
 * 1. CORRESPONDANCE DE COLONNES, pas de modele impose. Le fichier de
 *    l'utilisateur existe deja ; exiger nos entetes dans notre ordre
 *    reviendrait a lui faire ressaisir ce qu'il possede. On lit ses colonnes et
 *    on lui demande a quoi elles correspondent — une fois.
 *
 * 2. RESOLUTION PAR LIBELLE OU PAR CODE. Un fichier de reprise contient
 *    « IAVOAMBONY » ou « EGL-0007 », jamais un UUID. Les references se
 *    resolvent donc sur ce que l'utilisateur a REELLEMENT ecrit, accents et
 *    casse ignores.
 */

// -----------------------------------------------------------------------------
// Champs importables
// -----------------------------------------------------------------------------

export const CHAMPS_IMPORT = [
  'nom',
  'prenom',
  'sexe',
  'dateNaissance',
  'adresse',
  'telephone',
  'email',
  'statutMarital',
  'eglise',
  'cellule',
  'grade',
  'nationalite',
  'dateBapteme',
] as const;

export type ChampImport = (typeof CHAMPS_IMPORT)[number];

export interface DescriptionChamp {
  readonly cle: ChampImport;
  readonly label: string;
  readonly requis: boolean;
  readonly aide?: string;
}

export const DESCRIPTION_CHAMPS: readonly DescriptionChamp[] = [
  { cle: 'nom', label: 'Nom', requis: true },
  { cle: 'prenom', label: 'Prenom', requis: true },
  { cle: 'sexe', label: 'Sexe', requis: true, aide: 'M, F, Homme, Femme…' },
  { cle: 'dateNaissance', label: 'Date de naissance', requis: true, aide: 'JJ/MM/AAAA' },
  { cle: 'adresse', label: 'Adresse', requis: true },
  { cle: 'eglise', label: 'Eglise', requis: true, aide: 'Nom ou code' },
  { cle: 'grade', label: 'Grade', requis: true, aide: 'Libelle ou code' },
  { cle: 'nationalite', label: 'Nationalite', requis: true, aide: 'Libelle ou code' },
  { cle: 'cellule', label: 'Cellule', requis: false, aide: 'Nom ou code' },
  { cle: 'dateBapteme', label: 'Date de bapteme', requis: false, aide: 'JJ/MM/AAAA' },
  { cle: 'telephone', label: 'Telephone', requis: false },
  { cle: 'email', label: 'Adresse e-mail', requis: false },
  { cle: 'statutMarital', label: 'Statut marital', requis: false },
];

/** Champ importe -> index de la colonne du fichier, ou `null` si non fournie. */
export type Correspondance = Partial<Record<ChampImport, number | null>>;

// -----------------------------------------------------------------------------
// Normalisation
// -----------------------------------------------------------------------------

/** Casse, accents et espaces multiples ecartes : ce que l'humain a voulu ecrire. */
export function normaliser(valeur: string): string {
  return valeur
    .trim()
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Devine la correspondance a partir des entetes.
 *
 * Une proposition, jamais une decision : l'utilisateur la corrige a l'ecran.
 * Deviner mal est sans gravite ; deviner bien evite treize choix manuels.
 */
const SYNONYMES: Record<ChampImport, readonly string[]> = {
  nom: ['nom', 'nom de famille', 'patronyme', 'last name', 'lastname'],
  prenom: ['prenom', 'prenoms', 'first name', 'firstname'],
  sexe: ['sexe', 'genre', 'sex', 'gender'],
  dateNaissance: [
    'date de naissance',
    'naissance',
    'ne le',
    'nee le',
    'birth',
    'date naissance',
  ],
  adresse: ['adresse', 'domicile', 'lieu', 'address'],
  telephone: ['telephone', 'tel', 'portable', 'contact', 'phone', 'numero'],
  email: ['email', 'e-mail', 'mail', 'courriel'],
  statutMarital: ['statut marital', 'situation matrimoniale', 'etat civil', 'marital'],
  eglise: ['eglise', 'paroisse', 'assemblee', 'church'],
  cellule: ['cellule', 'cellule de priere', 'groupe'],
  grade: ['grade', 'fonction', 'titre', 'qualite'],
  nationalite: ['nationalite', 'pays', 'citoyennete'],
  dateBapteme: ['date de bapteme', 'bapteme', 'baptise le', 'date bapteme'],
};

export function deviner(entetes: readonly string[]): Correspondance {
  const correspondance: Correspondance = {};
  const pris = new Set<number>();

  for (const champ of CHAMPS_IMPORT) {
    const synonymes = SYNONYMES[champ];

    const index = entetes.findIndex((entete, i) => {
      if (pris.has(i)) return false;
      const normalisee = normaliser(entete);
      // Egalite d'abord, inclusion ensuite : « nom » ne doit pas capturer
      // « prenom », qui le contient.
      return synonymes.includes(normalisee);
    });

    if (index >= 0) {
      correspondance[champ] = index;
      pris.add(index);
    }
  }

  // Second passage, plus permissif, pour ce qui reste.
  for (const champ of CHAMPS_IMPORT) {
    if (correspondance[champ] != null) continue;

    const index = entetes.findIndex(
      (entete, i) =>
        !pris.has(i) && SYNONYMES[champ].some((s) => normaliser(entete).includes(s)),
    );
    if (index >= 0) {
      correspondance[champ] = index;
      pris.add(index);
    }
  }

  return correspondance;
}

// -----------------------------------------------------------------------------
// Conversions
// -----------------------------------------------------------------------------

/**
 * Date d'un fichier de reprise — JJ/MM/AAAA d'abord, ISO ensuite.
 *
 * Le format francais PRIME : dans un fichier saisi en France ou a Madagascar,
 * `03/04/2020` est le 3 avril. L'interpreter a l'americaine donnerait le
 * 4 mars, une erreur silencieuse et indetectable a la relecture.
 */
export function lireDate(valeur: string): Date | null {
  const brut = valeur.trim();
  if (brut === '') return null;

  const fr = brut.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (fr) {
    const [, j, m, a] = fr;
    const date = new Date(Number(a), Number(m) - 1, Number(j));
    return date.getMonth() === Number(m) - 1 ? date : null;
  }

  const iso = brut.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, a, m, j] = iso;
    const date = new Date(Number(a), Number(m) - 1, Number(j));
    return date.getMonth() === Number(m) - 1 ? date : null;
  }

  return null;
}

const SEXE_SYNONYMES: Record<string, Sexe> = {
  m: 'M',
  h: 'M',
  homme: 'M',
  masculin: 'M',
  male: 'M',
  f: 'F',
  femme: 'F',
  feminin: 'F',
  female: 'F',
};

export function lireSexe(valeur: string): Sexe | null {
  const normalise = normaliser(valeur);
  if (normalise === '') return null;

  const trouve = SEXE_SYNONYMES[normalise];
  if (trouve) return trouve;

  const majuscule = valeur.trim().toUpperCase();
  return (SEXES as readonly string[]).includes(majuscule) ? (majuscule as Sexe) : null;
}

const MARITAL_SYNONYMES: Record<string, StatutMarital> = {
  celibataire: 'CELIBATAIRE',
  marie: 'MARIE',
  mariee: 'MARIE',
  veuf: 'VEUF',
  veuve: 'VEUF',
  divorce: 'DIVORCE',
  divorcee: 'DIVORCE',
};

export function lireStatutMarital(valeur: string): StatutMarital | null {
  const normalise = normaliser(valeur);
  if (normalise === '') return null;

  const trouve = MARITAL_SYNONYMES[normalise];
  if (trouve) return trouve;

  const majuscule = valeur.trim().toUpperCase();
  return (STATUTS_MARITAUX as readonly string[]).includes(majuscule)
    ? (majuscule as StatutMarital)
    : null;
}

// -----------------------------------------------------------------------------
// Analyse d'un lot
// -----------------------------------------------------------------------------

/** Table de resolution : libelle OU code normalise -> identifiant. */
export type Index = ReadonlyMap<string, string>;

export interface Referentiels {
  readonly eglises: Index;
  readonly cellules: Index;
  readonly grades: Index;
  readonly nationalites: Index;
  /** Identifiant de cellule -> identifiant de son eglise, pour RG-05. */
  readonly egliseDeLaCellule: ReadonlyMap<string, string>;
}

export interface CroyantImporte {
  ligne: number;
  nom: string;
  prenom: string;
  sexe: Sexe;
  dateNaissance: string;
  adresse: string;
  telephone: string | null;
  email: string | null;
  statutMarital: StatutMarital | null;
  egliseId: string;
  celluleId: string | null;
  gradeId: string;
  nationaliteId: string;
  dateBapteme: string | null;
}

export interface ErreurLigne {
  /** Numero affiche a l'utilisateur : 1 = premiere ligne de donnees. */
  ligne: number;
  champ: ChampImport | null;
  message: string;
  /** Ce que le fichier contenait, pour le retrouver dans le tableur. */
  valeur: string;
}

export interface RapportImport {
  valides: CroyantImporte[];
  erreurs: ErreurLigne[];
}

function iso(date: Date): string {
  const mois = String(date.getMonth() + 1).padStart(2, '0');
  const jour = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mois}-${jour}`;
}

/**
 * EF-CRO-11 — pre-validation : TOUTES les lignes sont analysees avant que la
 * moindre ne soit ecrite.
 *
 * Une ligne fautive n'interrompt pas l'analyse : l'utilisateur doit voir
 * l'ensemble de ses erreurs d'un coup, pas les decouvrir une par une en
 * relancant l'import treize fois.
 */
export function analyserLot(
  lignes: readonly (readonly string[])[],
  correspondance: Correspondance,
  referentiels: Referentiels,
  aujourdhui: Date = new Date(),
): RapportImport {
  const valides: CroyantImporte[] = [];
  const erreurs: ErreurLigne[] = [];

  // Detecte les doublons INTERNES au fichier : deux fois la meme personne dans
  // le meme lot passerait les controles ligne a ligne sans etre vue.
  const vues = new Map<string, number>();

  lignes.forEach((cellules, i) => {
    const numero = i + 1;
    const lire = (champ: ChampImport): string => {
      const index = correspondance[champ];
      if (index == null) return '';
      return (cellules[index] ?? '').trim();
    };

    const ajouter = (champ: ChampImport | null, message: string, valeur = '') =>
      erreurs.push({ ligne: numero, champ, message, valeur });

    // Une ligne entierement vide est ignoree sans bruit : les tableurs en
    // produisent a la fin des fichiers.
    if (cellules.every((c) => c.trim() === '')) return;

    const avant = erreurs.length;

    const nom = lire('nom');
    const prenom = lire('prenom');
    if (nom.length < 2) ajouter('nom', 'Nom manquant ou trop court.', nom);
    if (prenom.length < 2) ajouter('prenom', 'Prenom manquant ou trop court.', prenom);

    const sexe = lireSexe(lire('sexe'));
    if (!sexe) ajouter('sexe', 'Sexe non reconnu (M, F, Homme, Femme).', lire('sexe'));

    const naissance = lireDate(lire('dateNaissance'));
    if (!naissance) {
      ajouter(
        'dateNaissance',
        'Date de naissance absente ou illisible.',
        lire('dateNaissance'),
      );
    } else if (naissance > aujourdhui) {
      ajouter('dateNaissance', 'Date de naissance dans le futur.', lire('dateNaissance'));
    }

    const adresse = lire('adresse');
    if (adresse.length < 3) ajouter('adresse', 'Adresse manquante.', adresse);

    // --- References ---
    const cleEglise = normaliser(lire('eglise'));
    const egliseId = referentiels.eglises.get(cleEglise);
    if (!egliseId) {
      ajouter('eglise', 'Eglise inconnue dans votre perimetre.', lire('eglise'));
    }

    const cleGrade = normaliser(lire('grade'));
    const gradeId = referentiels.grades.get(cleGrade);
    if (!gradeId) ajouter('grade', 'Grade inconnu.', lire('grade'));

    const cleNationalite = normaliser(lire('nationalite'));
    const nationaliteId = referentiels.nationalites.get(cleNationalite);
    if (!nationaliteId)
      ajouter('nationalite', 'Nationalite inconnue.', lire('nationalite'));

    let celluleId: string | null = null;
    const celluleBrute = lire('cellule');
    if (celluleBrute !== '') {
      celluleId = referentiels.cellules.get(normaliser(celluleBrute)) ?? null;
      if (!celluleId) {
        ajouter('cellule', 'Cellule inconnue.', celluleBrute);
      } else if (egliseId && referentiels.egliseDeLaCellule.get(celluleId) !== egliseId) {
        // RG-05 — la cellule doit appartenir a l'eglise du croyant.
        ajouter(
          'cellule',
          "RG-05 : cette cellule n'appartient pas a l'eglise indiquee.",
          celluleBrute,
        );
      }
    }

    // --- Facultatifs ---
    const baptemeBrut = lire('dateBapteme');
    let bapteme: Date | null = null;
    if (baptemeBrut !== '') {
      bapteme = lireDate(baptemeBrut);
      if (!bapteme) ajouter('dateBapteme', 'Date de bapteme illisible.', baptemeBrut);
      // RG-28 — un bapteme ne precede jamais une naissance.
      else if (naissance && bapteme < naissance) {
        ajouter('dateBapteme', 'RG-28 : bapteme anterieur a la naissance.', baptemeBrut);
      }
    }

    const maritalBrut = lire('statutMarital');
    const marital = lireStatutMarital(maritalBrut);
    if (maritalBrut !== '' && !marital) {
      ajouter('statutMarital', 'Statut marital non reconnu.', maritalBrut);
    }

    const email = lire('email');
    if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      ajouter('email', 'Adresse e-mail invalide.', email);
    }

    const telephone = lire('telephone');
    if (telephone !== '' && !/^\+?[0-9\s().-]{8,20}$/.test(telephone)) {
      ajouter('telephone', 'Numero de telephone invalide.', telephone);
    }

    if (erreurs.length > avant) return; // ligne fautive : rien a inserer

    // EF-CRO-13 — doublon INTERNE au fichier. Les doublons deja en base sont
    // detectes a l'insertion, ou la question se pose vraiment.
    const cle = `${normaliser(nom)}|${normaliser(prenom)}|${iso(naissance!)}`;
    const precedente = vues.get(cle);
    if (precedente !== undefined) {
      ajouter(
        null,
        `Doublon dans le fichier : deja present ligne ${precedente}.`,
        `${nom} ${prenom}`,
      );
      return;
    }
    vues.set(cle, numero);

    valides.push({
      ligne: numero,
      nom,
      prenom,
      sexe: sexe!,
      dateNaissance: iso(naissance!),
      adresse,
      telephone: telephone || null,
      email: email || null,
      statutMarital: marital,
      egliseId: egliseId!,
      celluleId,
      gradeId: gradeId!,
      nationaliteId: nationaliteId!,
      dateBapteme: bapteme ? iso(bapteme) : null,
    });
  });

  return { valides, erreurs };
}

/** Champs requis dont la colonne n'a pas ete designee. */
export function champsRequisManquants(
  correspondance: Correspondance,
): DescriptionChamp[] {
  return DESCRIPTION_CHAMPS.filter((c) => c.requis && correspondance[c.cle] == null);
}
