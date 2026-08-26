/**
 * L'evolution des dimes d'un croyant — EF-FIN-35.
 *
 * CE QU'ELLE REPOND. Le tableau des versements dit « combien, quand » ligne a
 * ligne ; il ne dit pas « ou en est-il ». Douze lignes se lisent, trente ne se
 * lisent plus — et la question qu'on pose devant une fiche est celle d'une
 * TENDANCE : donne-t-il regulierement, a-t-il cesse, a-t-il repris ?
 *
 * DEUX GRANULARITES, PARCE QUE CE SONT DEUX QUESTIONS.
 *
 *   `JOUR` — « qu'a-t-il donne CE MOIS-CI ? ». C'est la vue par defaut : on
 *   ouvre une fiche pour savoir ou en est le mois en cours, pas pour retracer
 *   une annee. A cette echelle, chaque culte se distingue.
 *
 *   `MOIS` — « comment cela evolue-t-il ? ». Un an de versements jour par jour
 *   ferait trois cent soixante-cinq points dont trois cent cinquante a zero :
 *   la tendance disparaitrait dans le bruit.
 *
 * LES PERIODES VIDES VALENT ZERO, ELLES NE DISPARAISSENT PAS (regle 15). C'est
 * la decision qui compte ici : une periode sans versement est une INFORMATION —
 * c'est meme celle qu'on vient chercher. Ne garder que les periodes servies
 * rapprocherait le 3 du 28 sur l'axe, et la courbe montrerait une regularite
 * qui n'existe pas.
 *
 * Module PUR : aucune dependance a la base ni a React, donc directement
 * testable.
 */

export type Granularite = 'JOUR' | 'MOIS';

export interface VersementDate {
  readonly montant: number;
  /** La date de CULTE, jamais celle de saisie : une feuille importee un mois
   *  plus tard placerait sinon un vieux culte dans le mois courant. */
  readonly date: string | null | undefined;
}

export interface PointDime {
  /** `AAAA-MM-JJ` au jour, `AAAA-MM` au mois : le tri lexicographique est exact. */
  readonly cle: string;
  /** Ce que porte la graduation — le quantieme, ou le mois abrege. */
  readonly libelle: string;
  readonly montant: number;
  readonly nombre: number;
}

/** Les bornes d'une vue. Deux cles de meme granularite, bornes INCLUSES. */
export interface Bornes {
  readonly granularite: Granularite;
  readonly debut: string;
  readonly fin: string;
}

const MOIS_COURTS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;

/** « 2026-03 » ou « 2026-03-14 » → « mars ». */
export function libelleMoisCourt(cle: string): string {
  const index = Number(cle.slice(5, 7)) - 1;
  return MOIS_COURTS[index] ?? cle;
}

/** Le jour du mois, sans zero inutile : « 2026-08-04 » → « 4 ». */
export function libelleJour(cle: string): string {
  return String(Number(cle.slice(8, 10)));
}

// ---------------------------------------------------------------------------

function jourIso(d: Date): string {
  // On lit les composantes LOCALES : `toISOString` bascule en UTC, et un
  // versement du 1er passerait au 31 du mois precedent a l'ouest de Greenwich.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function moisIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * LE MOIS EN COURS, DU PREMIER A AUJOURD'HUI — la vue par defaut.
 *
 * On s'arrete AUJOURD'HUI et non a la fin du mois : tracer jusqu'au 31 quand on
 * est le 14 dessinerait dix-sept jours a zero qui n'ont pas encore eu lieu, et
 * la courbe se lirait comme une chute.
 */
export function moisEnCours(aujourdhui: Date = new Date()): Bornes {
  const premier = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1);
  return { granularite: 'JOUR', debut: jourIso(premier), fin: jourIso(aujourdhui) };
}

/** Les `nbMois` derniers mois, celui en cours compris. */
export function derniersMois(nbMois = 12, aujourdhui: Date = new Date()): Bornes {
  const debut = new Date(
    aujourdhui.getFullYear(),
    aujourdhui.getMonth() - (nbMois - 1),
    1,
  );
  return { granularite: 'MOIS', debut: moisIso(debut), fin: moisIso(aujourdhui) };
}

/**
 * Toutes les cles de la periode, dans l'ordre — y compris celles sans versement.
 *
 * BORNE A DEUX CENTS POINTS. Au-dela, la courbe n'est plus lisible et le rendu
 * peine : une plage de dix ans jour par jour ferait trois mille six cents
 * points de quelques pixels. La borne est SILENCIEUSE ici — c'est a l'ecran de
 * dire qu'il a fallu resserrer, pas au domaine de decider a la place de
 * l'utilisateur.
 */
const PLAFOND_POINTS = 200;

function clesDeLaPeriode(bornes: Bornes): string[] {
  const cles: string[] = [];

  if (bornes.granularite === 'MOIS') {
    let annee = Number(bornes.debut.slice(0, 4));
    let mois = Number(bornes.debut.slice(5, 7));

    while (cles.length < PLAFOND_POINTS) {
      const cle = `${annee}-${String(mois).padStart(2, '0')}`;
      if (cle > bornes.fin) break;
      cles.push(cle);

      mois += 1;
      if (mois > 12) {
        mois = 1;
        annee += 1;
      }
    }
    return cles;
  }

  const [a, m, j] = bornes.debut.split('-').map(Number) as [number, number, number];
  const curseur = new Date(a, m - 1, j);

  while (cles.length < PLAFOND_POINTS) {
    const cle = jourIso(curseur);
    if (cle > bornes.fin) break;
    cles.push(cle);
    curseur.setDate(curseur.getDate() + 1);
  }
  return cles;
}

/**
 * Les points de la periode, du plus ancien au plus recent.
 *
 * `aujourdhui` est INJECTABLE partout dans ce module : une fonction qui lit
 * l'horloge ne se teste pas deux fois de suite avec le meme resultat.
 */
export function evolutionDesDimes(
  versements: readonly VersementDate[],
  bornes: Bornes,
): PointDime[] {
  const cles = clesDeLaPeriode(bornes);
  const taille = bornes.granularite === 'MOIS' ? 7 : 10;

  const cumul = new Map<string, { montant: number; nombre: number }>();
  for (const cle of cles) cumul.set(cle, { montant: 0, nombre: 0 });

  for (const v of versements) {
    if (!v.date) continue;
    const entree = cumul.get(v.date.slice(0, taille));
    // Hors periode : ignore sans bruit. Le tableau, lui, garde tout.
    if (!entree) continue;

    entree.montant += Number(v.montant) || 0;
    entree.nombre += 1;
  }

  return cles.map((cle) => ({
    cle,
    libelle: bornes.granularite === 'MOIS' ? libelleMoisCourt(cle) : libelleJour(cle),
    montant: cumul.get(cle)!.montant,
    nombre: cumul.get(cle)!.nombre,
  }));
}

/**
 * Y a-t-il de quoi tracer une courbe ?
 *
 * UNE COURBE PLATE A ZERO N'APPREND RIEN et se lit comme une panne : mieux vaut
 * ne rien afficher et laisser le tableau dire qu'il n'y a aucun versement. Le
 * seuil porte sur la PERIODE affichee, pas sur le total du croyant — quelqu'un
 * qui a donne il y a trois ans n'a rien a montrer sur le mois en cours.
 */
export function courbeExploitable(points: readonly PointDime[]): boolean {
  return points.some((p) => p.montant > 0);
}

/**
 * Ce que la periode couvre, EN TOUTES LETTRES.
 *
 * Une courbe sans periode annoncee se lit comme la totalite : le creux qu'on y
 * voit passerait pour un arret, alors qu'il n'est qu'une borne. Meme regle que
 * le releve imprime, qui dit toujours ce qu'il porte.
 */
export function libellePeriode(bornes: Bornes): string {
  const enJour = (cle: string) => {
    const [a, , j] = cle.split('-');
    return `${Number(j)} ${libelleMoisCourt(cle)} ${a}`.replace(/\.\s/, ' ');
  };
  const enMois = (cle: string) => `${libelleMoisCourt(cle)} ${cle.slice(0, 4)}`;

  const rendre = bornes.granularite === 'MOIS' ? enMois : enJour;

  return bornes.debut === bornes.fin
    ? rendre(bornes.debut)
    : `Du ${rendre(bornes.debut)} au ${rendre(bornes.fin)}`;
}

/** Une plage a l'envers ne rendrait aucun point, sans dire pourquoi. */
export function bornesValides(bornes: Bornes): boolean {
  return Boolean(bornes.debut) && Boolean(bornes.fin) && bornes.debut <= bornes.fin;
}

/**
 * Combien de points cette plage produirait-elle ?
 *
 * Sert a l'ecran pour AVERTIR avant de tracer : « du 1er janvier 2020 a
 * aujourd'hui, jour par jour » fait deux mille points, et mieux vaut le dire
 * que d'afficher une courbe tronquee sans explication.
 */
export function nombreDePoints(bornes: Bornes): number {
  return clesDeLaPeriode(bornes).length;
}

export { PLAFOND_POINTS };
