import { SEXES, type Sexe } from './croyant';
import { type Index, normaliser } from './import-croyants';

/**
 * Import d'une feuille de nouveaux baptises — EF-BAP-07.
 *
 * CE QU'IL PARTAGE AVEC LA SAISIE EN LOT, ET POURQUOI C'EST VOLONTAIRE.
 *
 * Le fichier ne porte QUE des personnes. La ceremonie — date, lieu, session,
 * celebrants — se choisit a l'ecran, une fois, comme dans la saisie manuelle :
 * elle est commune a tout le lot par nature, et la repeter sur trente lignes
 * offrirait trente occasions de la contredire.
 *
 * Les lignes produites ont donc exactement la forme que `saisirBaptisesEnLot`
 * attend, et c'est CETTE action qui ecrit. Un second chemin d'ecriture aurait
 * fini par diverger sur une regle que l'autre tenait — RG-28, RG-30, la
 * resolution du grade, la detection des doublons : tout cela vit deja la-bas,
 * et rien n'aurait garanti qu'il y reste identique (regle 16).
 *
 * CE QUI LE DISTINGUE DE L'IMPORT DE CROYANTS. Un croyant importe peut n'avoir
 * jamais ete baptise ; ici, la date de bapteme est celle de la CEREMONIE, la
 * meme pour tous, et elle ne figure pas dans le fichier. Le grade non plus :
 * un nouveau baptise est « Croyant », le serveur le resout.
 *
 * Module PUR : aucune dependance serveur, donc directement testable.
 */

export const CHAMPS_BAPTEME = [
  'nom',
  'prenom',
  'sexe',
  'dateNaissance',
  'adresse',
  'telephone',
  'eglise',
  'cellule',
  'nationalite',
] as const;

export type ChampBapteme = (typeof CHAMPS_BAPTEME)[number];

export interface DescriptionChampBapteme {
  readonly cle: ChampBapteme;
  readonly label: string;
  readonly requis: boolean;
  readonly aide?: string;
}

/**
 * L'ORDRE EST CELUI DE LA SAISIE : on identifie la personne, on la rattache,
 * puis on la joint. Les colonnes obligatoires viennent en premier, ce qui rend
 * la correspondance plus rapide a verifier a l'ecran.
 */
export const DESCRIPTION_BAPTEME: readonly DescriptionChampBapteme[] = [
  { cle: 'nom', label: 'Nom', requis: true },
  { cle: 'prenom', label: 'Prenom', requis: true },
  {
    cle: 'sexe',
    label: 'Sexe',
    requis: true,
    aide: 'M ou F. « Homme » et « Femme » sont acceptes.',
  },
  {
    cle: 'dateNaissance',
    label: 'Date de naissance',
    requis: true,
    aide: 'JJ/MM/AAAA. Elle doit preceder la date du bapteme (RG-28).',
  },
  { cle: 'adresse', label: 'Adresse', requis: true },
  {
    cle: 'eglise',
    label: 'Eglise',
    requis: false,
    aide: "Nom ou code. Inutile si votre perimetre ne compte qu'une eglise.",
  },
  {
    cle: 'nationalite',
    label: 'Nationalite',
    requis: false,
    aide: 'Libelle ou code ISO. Vide : « Malagasy ».',
  },
  {
    cle: 'cellule',
    label: 'Cellule',
    requis: false,
    aide: "Nom ou code. Doit appartenir a l'eglise de la ligne (RG-05).",
  },
  { cle: 'telephone', label: 'Telephone', requis: false },
];

export type CorrespondanceBapteme = Partial<Record<ChampBapteme, number | null>>;

const SYNONYMES: Record<ChampBapteme, readonly string[]> = {
  nom: ['nom', 'nom de famille', 'patronyme', 'last name', 'lastname'],
  prenom: ['prenom', 'prenoms', 'first name', 'firstname'],
  sexe: ['sexe', 'genre', 'sex', 'gender'],
  dateNaissance: ['date de naissance', 'naissance', 'ne le', 'nee le', 'birth', 'dob'],
  adresse: ['adresse', 'domicile', 'address'],
  telephone: ['telephone', 'tel', 'portable', 'contact', 'phone'],
  eglise: ['eglise', 'paroisse', 'entite', 'rattachement', 'church'],
  cellule: ['cellule', 'cellule de priere', 'groupe'],
  nationalite: ['nationalite', 'pays', 'nationality'],
};

/**
 * Devine la correspondance a partir des entetes.
 *
 * Une proposition, jamais une decision : l'utilisateur la corrige a l'ecran.
 * Deviner mal est sans gravite ; deviner bien evite neuf choix manuels.
 */
export function devinerBapteme(entetes: readonly string[]): CorrespondanceBapteme {
  const correspondance: CorrespondanceBapteme = {};
  const pris = new Set<number>();

  for (const champ of CHAMPS_BAPTEME) {
    const index = entetes.findIndex((entete, i) => {
      if (pris.has(i)) return false;
      const propre = normaliser(entete);
      return SYNONYMES[champ].some((s) => propre === s || propre.includes(s));
    });

    if (index >= 0) {
      correspondance[champ] = index;
      pris.add(index);
    }
  }

  return correspondance;
}

/** Les colonnes obligatoires qui manquent encore a la correspondance. */
export function champsBaptemeManquants(
  correspondance: CorrespondanceBapteme,
): DescriptionChampBapteme[] {
  return DESCRIPTION_BAPTEME.filter((c) => c.requis && correspondance[c.cle] == null);
}

// -----------------------------------------------------------------------------
// Analyse
// -----------------------------------------------------------------------------

export interface ReferentielsBapteme {
  readonly eglises: Index;
  readonly cellules: Index;
  readonly nationalites: Index;
  /** Identifiant de cellule -> identifiant de son eglise, pour RG-05. */
  readonly egliseDeLaCellule: ReadonlyMap<string, string>;
  /** L'unique eglise du perimetre, quand il n'y en a qu'une. */
  readonly egliseImplicite: string | null;
}

/** Une ligne prete pour `saisirBaptisesEnLot` — meme forme que la grille. */
export interface LigneBaptiseImportee {
  readonly ligne: number;
  readonly nom: string;
  readonly prenom: string;
  readonly sexe: Sexe;
  readonly dateNaissance: string;
  readonly adresse: string;
  readonly telephone: string | null;
  readonly egliseId: string;
  readonly celluleId: string | null;
  readonly nationaliteId: string | null;
}

export interface ErreurLigneBapteme {
  readonly ligne: number;
  readonly champ: ChampBapteme | null;
  readonly message: string;
  /** Ce que le fichier contenait, pour le retrouver dans le tableur. */
  readonly valeur: string;
}

export interface RapportImportBaptemes {
  readonly valides: LigneBaptiseImportee[];
  readonly erreurs: ErreurLigneBapteme[];
}

/**
 * « 04/07/1988 » vers l'ISO, ou `null`.
 *
 * MEME LECTURE QUE LES CHAMPS DE SAISIE : le jour d'abord. Un fichier produit a
 * Madagascar ecrit « 04/07/1988 » pour le 4 juillet, et lire le mois en premier
 * donnerait le 7 avril — une erreur silencieuse, plausible onze mois sur douze.
 *
 * L'ISO est accepte aussi : un export de tableur le produit souvent, et le
 * refuser obligerait a reformater un fichier deja juste.
 */
function lireDate(brut: string): string | null {
  const propre = brut.trim();
  if (propre === '') return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(propre);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const fr = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(propre);
  if (!fr) return null;

  const jour = Number(fr[1]);
  const mois = Number(fr[2]);
  const annee = Number(fr[3]);

  // `new Date(1988, 1, 31)` rend le 2 mars sans broncher : le 31 fevrier
  // passerait, et la fiche porterait une date que personne n'a saisie.
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  if (
    d.getUTCFullYear() !== annee ||
    d.getUTCMonth() !== mois - 1 ||
    d.getUTCDate() !== jour
  ) {
    return null;
  }

  return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

/** « M », « Homme », « masculin »… — ce que les fichiers reels contiennent. */
function lireSexe(brut: string): Sexe | null {
  const propre = normaliser(brut);
  if (propre === '') return null;

  if (['m', 'h', 'homme', 'masculin', 'male', 'garcon'].includes(propre)) return 'M';
  if (['f', 'femme', 'feminin', 'female', 'fille'].includes(propre)) return 'F';

  return (SEXES as readonly string[]).includes(brut.trim().toUpperCase())
    ? (brut.trim().toUpperCase() as Sexe)
    : null;
}

/**
 * EF-BAP-07 — pre-validation : TOUTES les lignes sont analysees avant que la
 * moindre ne soit ecrite.
 *
 * Une ligne fautive n'interrompt pas l'analyse : l'utilisateur doit voir
 * l'ensemble de ses erreurs d'un coup, pas les decouvrir une par une en
 * relancant l'import treize fois.
 *
 * A LA DIFFERENCE DE L'IMPORT DE DIMES, une ligne fautive est REJETEE. Une dime
 * represente de l'argent deja recu — l'enveloppe est dans l'urne. Ici, la fiche
 * n'existe pas encore : une ligne incomplete ne perd rien, elle se corrige et
 * se rejoue.
 */
export function analyserBaptemes(
  lignes: readonly (readonly string[])[],
  correspondance: CorrespondanceBapteme,
  referentiels: ReferentielsBapteme,
  dateBapteme: string,
): RapportImportBaptemes {
  const valides: LigneBaptiseImportee[] = [];
  const erreurs: ErreurLigneBapteme[] = [];

  const valeur = (ligne: readonly string[], champ: ChampBapteme): string => {
    const index = correspondance[champ];
    return index == null ? '' : (ligne[index] ?? '').trim();
  };

  lignes.forEach((brute, i) => {
    // +2 : l'en-tete occupe la premiere ligne du fichier, et l'utilisateur
    // compte a partir de 1.
    const numero = i + 2;

    // Une ligne entierement vide est SILENCIEUSEMENT ignoree : un tableur en
    // produit des dizaines apres la derniere donnee.
    if (brute.every((c) => c.trim() === '')) return;

    const refuser = (champ: ChampBapteme | null, message: string, brut = '') => {
      erreurs.push({ ligne: numero, champ, message, valeur: brut });
    };

    const avant = erreurs.length;

    const nom = valeur(brute, 'nom');
    const prenom = valeur(brute, 'prenom');
    if (nom.length < 2) refuser('nom', 'Le nom est requis.', nom);
    if (prenom.length < 2) refuser('prenom', 'Le prenom est requis.', prenom);

    const sexeBrut = valeur(brute, 'sexe');
    const sexe = lireSexe(sexeBrut);
    if (!sexe) refuser('sexe', 'Sexe illisible : attendus M ou F.', sexeBrut);

    const naissanceBrute = valeur(brute, 'dateNaissance');
    const dateNaissance = lireDate(naissanceBrute);
    if (!dateNaissance) {
      refuser('dateNaissance', 'Date illisible : attendu JJ/MM/AAAA.', naissanceBrute);
    } else if (dateNaissance > dateBapteme) {
      /**
       * RG-28 — ON NE BAPTISE PAS QUELQU'UN QUI N'EST PAS NE. La regle vit
       * aussi dans le schema de saisie ; la verifier ICI evite d'envoyer au
       * serveur un lot dont on sait deja qu'il sera refuse, et nomme la LIGNE
       * fautive plutot que le lot entier.
       */
      refuser(
        'dateNaissance',
        'RG-28 : la naissance suit la date du bapteme.',
        naissanceBrute,
      );
    }

    const adresse = valeur(brute, 'adresse');
    if (adresse.length < 3) refuser('adresse', "L'adresse est requise.", adresse);

    /**
     * L'EGLISE : celle du fichier, sinon l'unique du perimetre.
     *
     * La colonne est facultative parce qu'un perimetre a une seule eglise n'a
     * rien a designer — l'exiger ferait recopier trente fois la meme valeur.
     */
    const egliseBrute = valeur(brute, 'eglise');
    const egliseId = egliseBrute
      ? (referentiels.eglises.get(normaliser(egliseBrute)) ?? null)
      : referentiels.egliseImplicite;

    if (!egliseId) {
      refuser(
        'eglise',
        egliseBrute
          ? 'Eglise inconnue dans votre perimetre.'
          : 'Eglise absente, et votre perimetre en compte plusieurs.',
        egliseBrute,
      );
    }

    /**
     * RG-05 — LA CELLULE APPARTIENT A L'EGLISE DE LA LIGNE.
     *
     * Une cellule d'une autre eglise serait acceptee par la colonne et refusee
     * par la base : autant le dire ici, avec le numero de ligne.
     */
    const celluleBrute = valeur(brute, 'cellule');
    let celluleId: string | null = null;

    if (celluleBrute) {
      celluleId = referentiels.cellules.get(normaliser(celluleBrute)) ?? null;

      if (!celluleId) {
        refuser('cellule', 'Cellule inconnue.', celluleBrute);
      } else if (egliseId && referentiels.egliseDeLaCellule.get(celluleId) !== egliseId) {
        refuser(
          'cellule',
          "RG-05 : cette cellule n'appartient pas a l'eglise indiquee.",
          celluleBrute,
        );
        celluleId = null;
      }
    }

    /**
     * LA NATIONALITE EST FACULTATIVE, mais un libelle ECRIT ET INCONNU est une
     * erreur, pas un silence. Retomber sur « Malagasy » ferait passer une
     * faute de frappe pour un choix, sur une donnee que personne ne relira.
     */
    const nationaliteBrute = valeur(brute, 'nationalite');
    let nationaliteId: string | null = null;

    if (nationaliteBrute) {
      nationaliteId = referentiels.nationalites.get(normaliser(nationaliteBrute)) ?? null;
      if (!nationaliteId)
        refuser('nationalite', 'Nationalite inconnue.', nationaliteBrute);
    }

    if (erreurs.length > avant) return;

    valides.push({
      ligne: numero,
      nom,
      prenom,
      sexe: sexe!,
      dateNaissance: dateNaissance!,
      adresse,
      telephone: valeur(brute, 'telephone') || null,
      egliseId: egliseId!,
      celluleId,
      nationaliteId,
    });
  });

  return { valides, erreurs };
}
