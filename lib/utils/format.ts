/**
 * Formatage — UI-07, UI-13.
 *
 * Toutes les valeurs numeriques de l'application passent par ici : c'est ce qui
 * garantit qu'un montant s'affiche de la meme facon dans un tableau, une carte
 * de statistique et un bloc de rapport.
 *
 * Module pur : utilisable cote serveur comme cote client.
 */

const LOCALE = 'fr-FR';

/**
 * ARB-7 — devise unique. L'eglise est malgache : l'ariary (MGA).
 *
 * Ce n'est qu'un REPLI : la devise reelle vient de `organisation_settings` et
 * se lit a chaque rendu (regle 21). Elle ne sert que quand un appelant n'a pas
 * de parametres sous la main.
 */
export const DEVISE_PAR_DEFAUT = 'MGA';

/** Entier avec separateurs de milliers : « 12 480 ». */
export function formatNombre(valeur: number | null | undefined): string {
  if (valeur === null || valeur === undefined || Number.isNaN(valeur)) return '—';
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(valeur);
}

/**
 * Montant en devise : « 3 550 000 Ar ».
 * Les centimes ne sont affiches que s'ils existent — l'ariary n'en a pas.
 */
export function formatMontant(
  valeur: number | null | undefined,
  devise: string = DEVISE_PAR_DEFAUT,
): string {
  if (valeur === null || valeur === undefined || Number.isNaN(valeur)) return '—';

  const aDesDecimales = !Number.isInteger(valeur);
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: devise,
    minimumFractionDigits: aDesDecimales ? 2 : 0,
    maximumFractionDigits: aDesDecimales ? 2 : 0,
  }).format(valeur);
}

/**
 * Montant compact pour les cartes de statistique : « 3,6 M ».
 * Reserve aux widgets ; les tableaux et les rapports affichent la valeur exacte.
 */
export function formatMontantCompact(
  valeur: number | null | undefined,
  devise: string = DEVISE_PAR_DEFAUT,
): string {
  if (valeur === null || valeur === undefined || Number.isNaN(valeur)) return '—';
  if (Math.abs(valeur) < 10_000) return formatMontant(valeur, devise);

  return new Intl.NumberFormat(LOCALE, {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(valeur);
}

/** Pourcentage : « 57,0 % ». */
export function formatPourcentage(valeur: number | null | undefined, decimales = 1): string {
  if (valeur === null || valeur === undefined || Number.isNaN(valeur)) return '—';
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valeur) + ' %';
}

/** Variation signee : « +4,2 % » / « −1,8 % » (vrai signe moins typographique). */
export function formatVariation(valeur: number | null | undefined, decimales = 1): string {
  if (valeur === null || valeur === undefined || Number.isNaN(valeur)) return '—';
  const formate = formatPourcentage(Math.abs(valeur), decimales);
  if (valeur === 0) return formate;
  return `${valeur > 0 ? '+' : '−'}${formate}`;
}

export function formatDate(valeur: Date | string | null | undefined): string {
  if (!valeur) return '—';
  const date = typeof valeur === 'string' ? new Date(valeur) : valeur;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'short' }).format(date);
}

export function formatDateLongue(valeur: Date | string | null | undefined): string {
  if (!valeur) return '—';
  const date = typeof valeur === 'string' ? new Date(valeur) : valeur;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long' }).format(date);
}

export function formatDateHeure(valeur: Date | string | null | undefined): string {
  if (!valeur) return '—';
  const date = typeof valeur === 'string' ? new Date(valeur) : valeur;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

/** Age revolu en annees, a partir d'une date de naissance. */
export function calculerAge(dateNaissance: Date | string): number {
  const naissance =
    typeof dateNaissance === 'string' ? new Date(dateNaissance) : dateNaissance;
  const maintenant = new Date();

  let age = maintenant.getFullYear() - naissance.getFullYear();
  const mois = maintenant.getMonth() - naissance.getMonth();
  if (mois < 0 || (mois === 0 && maintenant.getDate() < naissance.getDate())) {
    age--;
  }
  return age;
}

/** Initiales pour un `<Avatar>` sans photo : « Jean-Paul KOFFI » -> « JK ». */
export function initiales(nom: string, prenom?: string): string {
  const source = prenom ? `${prenom} ${nom}` : nom;
  return source
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? '')
    .join('');
}

/** Formatage generique pilote par le registre d'indicateurs (plan.md §11.1). */
export type FormatIndicateur = 'number' | 'percent' | 'currency';

export function formatValeur(
  valeur: number | null | undefined,
  format: FormatIndicateur,
  devise: string = DEVISE_PAR_DEFAUT,
): string {
  switch (format) {
    case 'currency':
      return formatMontantCompact(valeur, devise);
    case 'percent':
      return formatPourcentage(valeur);
    default:
      return formatNombre(valeur);
  }
}
