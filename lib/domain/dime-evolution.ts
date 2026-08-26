/**
 * L'evolution des dimes d'un croyant, mois par mois — EF-FIN-35.
 *
 * CE QU'ELLE REPOND. Le tableau des versements dit « combien, quand » ligne a
 * ligne ; il ne dit pas « ou en est-il ». Douze lignes se lisent, trente ne se
 * lisent plus — et la question qu'on pose devant une fiche est celle d'une
 * TENDANCE : donne-t-il regulierement, a-t-il cesse, a-t-il repris ?
 *
 * LES MOIS VIDES VALENT ZERO, ILS NE DISPARAISSENT PAS (regle 15). C'est la
 * decision qui compte ici : un mois sans versement est une INFORMATION — c'est
 * meme celle qu'on vient chercher. Ne garder que les mois servis rapprocherait
 * janvier de septembre sur l'axe, et la courbe montrerait une regularite qui
 * n'existe pas.
 *
 * LA FENETRE SE COMPTE DEPUIS AUJOURD'HUI, pas depuis le dernier versement.
 * Sinon, quelqu'un qui a cesse de donner il y a deux ans verrait une courbe
 * pleine, arretee net a droite, et rien ne dirait que ce « droite » est ancien.
 *
 * Module PUR : aucune dependance a la base ni a React, donc directement
 * testable.
 */

export interface VersementDate {
  readonly montant: number;
  /** La date de CULTE, jamais celle de saisie : une feuille importee un mois
   *  plus tard placerait sinon un vieux culte dans le mois courant. */
  readonly date: string | null | undefined;
}

export interface PointDime {
  /** `YYYY-MM`, ce qui rend le tri lexicographique exact. */
  readonly mois: string;
  readonly montant: number;
  readonly nombre: number;
}

/** Le mois d'une date ISO, sans passer par `Date` : pas de fuseau, pas de derive. */
function moisDe(date: string): string {
  return date.slice(0, 7);
}

function moisPrecedent(mois: string): string {
  const annee = Number(mois.slice(0, 4));
  const m = Number(mois.slice(5, 7));
  return m === 1
    ? `${annee - 1}-12`
    : `${annee}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * Les `nbMois` derniers mois, du plus ancien au plus recent.
 *
 * `aujourdhui` est INJECTABLE : une fonction qui lit l'horloge ne se teste pas
 * deux fois de suite avec le meme resultat.
 */
export function evolutionDesDimes(
  versements: readonly VersementDate[],
  options: { readonly nbMois?: number; readonly aujourdhui?: Date } = {},
): PointDime[] {
  const nbMois = Math.max(1, options.nbMois ?? 12);
  const ancre = options.aujourdhui ?? new Date();

  // `toISOString` donne UTC ; on veut le mois tel que l'utilisateur le lit.
  const moisCourant = `${ancre.getFullYear()}-${String(ancre.getMonth() + 1).padStart(2, '0')}`;

  // La fenetre, du plus recent au plus ancien, puis retournee.
  const fenetre: string[] = [moisCourant];
  for (let i = 1; i < nbMois; i++) {
    fenetre.push(moisPrecedent(fenetre[fenetre.length - 1]!));
  }
  fenetre.reverse();

  const cumul = new Map<string, { montant: number; nombre: number }>();
  for (const mois of fenetre) cumul.set(mois, { montant: 0, nombre: 0 });

  for (const v of versements) {
    if (!v.date) continue;
    const mois = moisDe(v.date);
    const entree = cumul.get(mois);
    // Hors fenetre : ignore sans bruit. Le tableau, lui, garde tout.
    if (!entree) continue;

    entree.montant += Number(v.montant) || 0;
    entree.nombre += 1;
  }

  return fenetre.map((mois) => ({
    mois,
    montant: cumul.get(mois)!.montant,
    nombre: cumul.get(mois)!.nombre,
  }));
}

/**
 * Y a-t-il de quoi tracer une courbe ?
 *
 * UNE COURBE PLATE A ZERO N'APPREND RIEN et se lit comme une panne : mieux vaut
 * ne rien afficher et laisser le tableau dire qu'il n'y a aucun versement. Le
 * seuil porte sur la PERIODE affichee, pas sur le total du croyant — quelqu'un
 * qui a donne il y a trois ans n'a rien a montrer sur douze mois.
 */
export function courbeExploitable(points: readonly PointDime[]): boolean {
  return points.some((p) => p.montant > 0);
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

/** « 2026-03 » → « mars ». L'annee ne se repete pas sur chaque graduation. */
export function libelleMoisCourt(mois: string): string {
  const index = Number(mois.slice(5, 7)) - 1;
  return MOIS_COURTS[index] ?? mois;
}
