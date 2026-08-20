import { type NatureVersement } from './dime';
import { normaliser } from './import-croyants';

/**
 * Import d'une feuille de versements de dimes — EF-FIN-34.
 *
 * CE QUI DISTINGUE CET IMPORT DE CELUI DES CROYANTS
 *
 * A l'import de croyants (EF-CRO-11), une ligne fautive est REJETEE : rien
 * n'est perdu, la fiche n'existait pas.
 *
 * Ici, une ligne represente de l'ARGENT DEJA RECU. L'enveloppe est dans l'urne
 * ; elle ne disparaitra pas parce que le fichier est imparfait. Aucune ligne
 * portant un montant n'est donc rejetee — au pire, elle est comptee sans nom,
 * et le nom se retrouve ensuite.
 *
 * Module PUR : aucune dependance serveur, donc testable directement.
 */

export const CHAMPS_VERSEMENT = [
  'nom',
  'prenom',
  'enveloppe',
  'montant',
  'eglise',
] as const;
export type ChampVersement = (typeof CHAMPS_VERSEMENT)[number];

export interface DescriptionChampVersement {
  readonly cle: ChampVersement;
  readonly label: string;
  readonly requis: boolean;
  readonly aide?: string;
}

export const DESCRIPTION_VERSEMENT: readonly DescriptionChampVersement[] = [
  { cle: 'montant', label: 'Montant', requis: true, aide: 'Le seul champ obligatoire.' },
  { cle: 'nom', label: 'Nom', requis: false, aide: 'Vide = enveloppe anonyme.' },
  { cle: 'prenom', label: 'Prenom', requis: false },
  { cle: 'enveloppe', label: "N° d'enveloppe", requis: false },
  {
    cle: 'eglise',
    label: "Eglise de rattachement",
    requis: false,
    aide: "Nom ou code. Evite de la chercher au moment d'ouvrir la fiche.",
  },
];

export type CorrespondanceVersement = Partial<Record<ChampVersement, number | null>>;

const SYNONYMES: Record<ChampVersement, readonly string[]> = {
  nom: ['nom', 'nom de famille', 'patronyme', 'last name', 'lastname'],
  prenom: ['prenom', 'prenoms', 'first name', 'firstname'],
  enveloppe: ['enveloppe', 'no enveloppe', 'numero enveloppe', 'n enveloppe', 'env'],
  montant: ['montant', 'somme', 'dime', 'valeur', 'amount', 'ariary', 'mga'],
  eglise: ['eglise', 'paroisse', 'entite', 'rattachement', 'church', 'assemblee'],
};

/**
 * Devine la correspondance a partir des entetes.
 *
 * Une proposition, jamais une decision : l'utilisateur la corrige a l'ecran.
 * Deviner mal est sans gravite ; deviner bien evite quatre choix manuels.
 */
export function devinerVersement(entetes: readonly string[]): CorrespondanceVersement {
  const correspondance: CorrespondanceVersement = {};
  const pris = new Set<number>();

  for (const champ of CHAMPS_VERSEMENT) {
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

// -----------------------------------------------------------------------------
// Rapprochement
// -----------------------------------------------------------------------------

/**
 * La cle de rapprochement d'un donateur.
 *
 * Nom ET prenom, normalises : la casse et les accents ne se reproduisent pas
 * d'un fichier a l'autre, et « RAZAFINDRAPARANY Edmond » doit retrouver
 * « Razafindraparany  edmond ».
 *
 * On NE rapproche PAS sur le seul nom : deux freres portent le meme, et
 * attribuer la dime de l'un a l'autre serait pire que de ne rien attribuer.
 */
export function cleDonateur(nom: string, prenom: string): string {
  return `${normaliser(nom)}|${normaliser(prenom)}`;
}

export interface DonateurConnu {
  readonly id: string;
  readonly nom: string;
  readonly prenom: string;
}

/**
 * Index des donateurs connus, par cle de rapprochement.
 *
 * Une cle AMBIGUE — deux fiches pour « Rakoto Jean » — est ecartee : rendre
 * l'une des deux au hasard attribuerait la dime a la mauvaise personne, en
 * silence. La ligne partira donc en rapprochement manuel, ou quelqu'un
 * tranchera en connaissance de cause.
 */
export function indexerDonateurs(
  donateurs: readonly DonateurConnu[],
): Map<string, string | null> {
  const index = new Map<string, string | null>();

  for (const d of donateurs) {
    const cle = cleDonateur(d.nom, d.prenom);
    // `null` marque l'ambiguite : la cle existe, mais plus d'une fiche y repond.
    index.set(cle, index.has(cle) ? null : d.id);
  }

  return index;
}

// -----------------------------------------------------------------------------
// Analyse d'une feuille
// -----------------------------------------------------------------------------

export interface LigneVersement {
  /** Numero de la ligne DANS LE FICHIER, en-tete comprise : on doit la retrouver. */
  readonly ligne: number;
  readonly croyantId: string | null;
  readonly nomSource: string | null;
  readonly prenomSource: string | null;
  readonly enveloppe: string | null;
  readonly montant: number;
  readonly nature: NatureVersement;
  /** Vrai si la ligne porte un nom qu'aucune fiche ne reconnait. */
  readonly aRapprocher: boolean;
  /** Ce que la colonne « eglise » disait, TEL QUEL — la trace du fichier. */
  readonly egliseSource: string | null;
  /** L'entite reconnue, ou `null` si le libelle ne designe rien de connu. */
  readonly egliseId: string | null;
}

/**
 * Les eglises telles qu'on peut les DESIGNER dans un fichier.
 *
 * Nom ou code : les deux se retrouvent dans les fichiers reels, et exiger l'un
 * ferait rejeter l'autre pour rien.
 */
export interface EgliseConnue {
  readonly id: string;
  readonly nom: string;
  readonly code: string;
}

/**
 * Index des eglises, par nom ET par code normalises.
 *
 * MEME TRAITEMENT DE L'AMBIGUITE QUE POUR LES DONATEURS : deux eglises portant
 * le meme nom rendent `null`, et la ligne partira sans eglise. En choisir une
 * au hasard rattacherait le croyant a la mauvaise paroisse — en silence, et
 * pour toujours, puisque plus personne ne reverrait la question.
 */
export function indexerEglises(
  eglises: readonly EgliseConnue[],
): Map<string, string | null> {
  const index = new Map<string, string | null>();

  const poser = (cle: string, id: string) => {
    const propre = normaliser(cle);
    if (propre === '') return;

    // `null` marque l'ambiguite — mais SEULEMENT entre deux eglises
    // differentes. Une eglise dont le code s'ecrit comme le nom se
    // designerait elle-meme deux fois, et se rendrait introuvable.
    const deja = index.get(propre);
    index.set(propre, deja === undefined || deja === id ? id : null);
  };

  for (const e of eglises) {
    poser(e.nom, e.id);
    poser(e.code, e.id);
  }

  return index;
}

export interface RapportImportVersements {
  readonly retenues: LigneVersement[];
  /** Lignes ECARTEES : elles ne portaient aucun montant exploitable. */
  readonly ecartees: { readonly ligne: number; readonly motif: string }[];
  readonly total: number;
}

/** Le montant tel qu'un tableur le rend : virgule, espaces, parfois une devise. */
function lireMontant(brut: string): number | null {
  const propre = brut
    .replace(/[^\d.,-]/g, '')
    .replace(/\s/g, '')
    .replace(',', '.');

  if (propre === '') return null;
  const nombre = Number(propre);
  return Number.isFinite(nombre) && nombre > 0 ? Math.round(nombre * 100) / 100 : null;
}

/**
 * Analyse la feuille et classe CHAQUE ligne — EF-FIN-34.
 *
 * LES TROIS REGLES DE RAPPROCHEMENT, arretees le 20 aout 2026 :
 *
 *   A. NOM + PRENOM, SANS NUMERO
 *      reconnu -> nominatif, un recu sera emis ;
 *      inconnu -> versement anonyme ET ligne a rapprocher.
 *
 *   B. NOM + PRENOM, AVEC NUMERO
 *      reconnu -> nominatif, et le numero LUI EST ATTRIBUE s'il est nouveau
 *      (`fn_attribuer_enveloppe`, migration 0056) ;
 *      inconnu -> comme en A.
 *
 *   C. SANS NOM, AVEC NUMERO
 *      -> enveloppe anonyme ET ligne a rapprocher : la file proposera le
 *      dernier porteur du numero.
 *
 *   Sans nom NI numero -> en vrac, et rien a rapprocher.
 *
 * Seule une ligne SANS MONTANT est ecartee : il n'y a rien a compter.
 *
 * CE QUI A CHANGE LE 20 AOUT. Toute ligne sans nom etait exclue de la file :
 * « il n'y aurait rien a y rapprocher ». Le raisonnement etait juste TANT
 * QU'IL N'Y AVAIT RIEN POUR TRAVAILLER — un numero d'enveloppe est precisement
 * ce quelque chose. La regle est donc bornee a ce qu'elle couvrait vraiment :
 * sans nom NI numero.
 */
export function analyserVersements(
  lignes: readonly (readonly string[])[],
  correspondance: CorrespondanceVersement,
  donateurs: Map<string, string | null>,
  /**
   * Les eglises reconnaissables. FACULTATIF : un fichier sans colonne
   * « eglise » — le cas le plus courant — n'a rien a y chercher, et l'exiger
   * aurait casse tous les appels existants pour rien.
   */
  eglises: Map<string, string | null> = new Map(),
): RapportImportVersements {
  const retenues: LigneVersement[] = [];
  const ecartees: RapportImportVersements['ecartees'] = [];

  const valeur = (ligne: readonly string[], champ: ChampVersement): string => {
    const index = correspondance[champ];
    return index == null ? '' : (ligne[index] ?? '').trim();
  };

  lignes.forEach((ligne, i) => {
    // +2 : l'en-tete occupe la premiere ligne du fichier, et l'utilisateur
    // compte a partir de 1.
    const numero = i + 2;

    const montant = lireMontant(valeur(ligne, 'montant'));
    if (montant === null) {
      // Une ligne vide est SILENCIEUSEMENT ignoree — un tableur en produit des
      // dizaines apres la derniere donnee. Seule une ligne qui porte quelque
      // chose sans montant lisible merite d'etre signalee.
      const porteQuelqueChose = ligne.some((c) => c.trim() !== '');
      if (porteQuelqueChose) {
        ecartees.push({ ligne: numero, motif: 'Aucun montant lisible.' });
      }
      return;
    }

    const nom = valeur(ligne, 'nom');
    const prenom = valeur(ligne, 'prenom');
    const enveloppe = valeur(ligne, 'enveloppe');
    const egliseLue = valeur(ligne, 'eglise');

    /**
     * L'EGLISE RECONNUE, OU RIEN — et « rien » n'est pas un echec.
     *
     * Un libelle que l'index ne connait pas, ou qui designe deux eglises,
     * laisse `egliseId` a `null` : le rapprochement se fera alors comme avant,
     * en choisissant l'eglise a la main. On ne cree AUCUNE entite pour un nom
     * qu'on ne reconnait pas — elle entrerait dans la structure, recevrait un
     * code, apparaitrait dans chaque selecteur et dans les soldes consolides.
     *
     * Le libelle lu est conserve QUAND MEME : il dit ce que le fichier
     * annoncait, et c'est souvent assez pour trancher a l'oeil.
     */
    const egliseId = egliseLue ? (eglises.get(normaliser(egliseLue)) ?? null) : null;

    if (nom === '') {
      retenues.push({
        ligne: numero,
        croyantId: null,
        nomSource: null,
        prenomSource: null,
        enveloppe: enveloppe || null,
        montant,
        egliseSource: egliseLue || null,
        egliseId,
        nature: enveloppe ? 'ENVELOPPE_ANONYME' : 'EN_VRAC',
        /**
         * REGLE C — SANS NOM MAIS AVEC UN NUMERO, ELLE SE RAPPROCHE QUAND MEME.
         *
         * `0032` excluait toute ligne sans nom : « il n'y aurait rien a
         * rapprocher ». C'etait juste tant qu'il n'y avait rien pour
         * travailler — or le numero DIT quelque chose. Il a deja ete porte, la
         * file proposera son dernier porteur, et la question se tranche.
         *
         * Sans numero, en revanche, la raison d'origine tient toujours : rien
         * a rapprocher, et la file se remplirait de lignes qu'aucun travail ne
         * peut clore.
         */
        aRapprocher: enveloppe !== '',
      });
      return;
    }

    const trouve = donateurs.get(cleDonateur(nom, prenom));

    retenues.push({
      ligne: numero,
      // `null` couvre deux cas : inconnu, et ambigu (deux fiches homonymes).
      croyantId: trouve ?? null,
      nomSource: nom,
      prenomSource: prenom || null,
      enveloppe: enveloppe || null,
      montant,
      egliseSource: egliseLue || null,
      egliseId,
      /**
       * Un nom non reconnu donne une ENVELOPPE ANONYME, meme sans numero.
       *
       * Le montant doit compter des maintenant — l'argent est recu. La nature
       * exige alors un numero d'enveloppe (contrainte de la base) : a defaut,
       * on retombe sur le vrac, qui compte tout autant.
       */
      nature: trouve
        ? 'NOMINATIF'
        : enveloppe
          ? 'ENVELOPPE_ANONYME'
          : 'EN_VRAC',
      aRapprocher: !trouve,
    });
  });

  return {
    retenues,
    ecartees,
    total: retenues.reduce((s, l) => s + l.montant, 0),
  };
}

/** Les champs requis qui n'ont pas encore de colonne. */
export function champsVersementManquants(
  correspondance: CorrespondanceVersement,
): DescriptionChampVersement[] {
  return DESCRIPTION_VERSEMENT.filter(
    (c) => c.requis && correspondance[c.cle] == null,
  );
}
