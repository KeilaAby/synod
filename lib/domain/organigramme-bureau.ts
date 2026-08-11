import type { PosteBureau } from './bureau';
import { type ActionResult, ko, ok } from './result';

/**
 * Disposition de l'organigramme d'un bureau — EF-BUR-07.
 *
 * Module PUR : contrepartie applicative de `0021_organigramme_bureau.sql`. Le
 * domaine EXPLIQUE le refus a l'utilisateur, la base l'EMPECHE quoi qu'il
 * arrive — et les tests verrouillent l'accord entre les deux.
 *
 * DEUX CHOSES A NE PAS CONFONDRE
 *
 * Le RANG protocolaire vient du referentiel : il vaut pour toutes les entites,
 * et personne ne le redessine. La DISPOSITION appartient au bureau : elle dit
 * qui depend de qui ICI, et ou chaque bloc se trouve sur le plan.
 *
 * Une fonction sans disposition enregistree reste un poste du bureau, placee a
 * son rang. C'est le point le plus important de ce module : la disposition
 * ARRANGE des postes, elle ne les enumere pas. Sans cela, oublier de poser un
 * bloc ferait disparaitre le tresorier, et le bureau paraitrait complet.
 */

export interface DispositionPoste {
  readonly fonctionId: string;
  /** Superieur DANS CE BUREAU. `null` : racine de l'organigramme. */
  readonly parentFonctionId: string | null;
  readonly x: number;
  readonly y: number;
}

/** Grille de 8 px, jusque dans la disposition par defaut (UI-01). */
export const LARGEUR_BLOC = 224;
export const HAUTEUR_BLOC = 140;
const ESPACEMENT_X = 32;
const ESPACEMENT_Y = 88;

/** Blocs par rangee : au-dela, la grille deborde de l'ecran avant de se lire. */
const PAR_RANGEE = 4;

/**
 * Disposition de depart : une GRILLE, sans aucun lien.
 *
 * Elle deduisait la hierarchie du rang protocolaire, retire le 9 aout 2026.
 * Rien ne la remplace, et c'est la bonne reponse : sans le rang, plus aucune
 * donnee ne dit qui depend de qui. Inventer des traits reviendrait a affirmer
 * une organisation que personne n'a decrite — le defaut le plus couteux d'un
 * organigramme, parce qu'il se lit comme un fait.
 *
 * La grille pose donc les blocs a portee de main, tous racines, et laisse les
 * traits a l'utilisateur.
 */
export function dispositionParDefaut(
  postes: readonly PosteBureau[],
): DispositionPoste[] {
  const rangee = Math.min(postes.length, PAR_RANGEE);
  const largeur = rangee * LARGEUR_BLOC + (rangee - 1) * ESPACEMENT_X;

  return postes.map((poste, index) => ({
    fonctionId: poste.fonction.id,
    parentFonctionId: null,
    x: -largeur / 2 + (index % PAR_RANGEE) * (LARGEUR_BLOC + ESPACEMENT_X),
    y: Math.floor(index / PAR_RANGEE) * (HAUTEUR_BLOC + ESPACEMENT_Y),
  }));
}

/**
 * Ajoute les blocs MANQUANTS sous le plan existant, sans y toucher.
 *
 * POURQUOI PAS UN REDESSIN COMPLET
 *
 * « Tout poser » repartait de `dispositionParDefaut` sur TOUS les postes : les
 * positions arrangees a la main et, plus grave, les TRAITS deja tires
 * disparaissaient d'un clic. Or ces traits sont la seule chose qu'aucune donnee
 * ne porte — le rang protocolaire a ete retire, rien ne dit qui depend de qui
 * hors de ce que l'utilisateur a trace. Les lui reprendre lui demande de tout
 * refaire, et c'est ce qu'il a signale le 11 aout 2026.
 *
 * L'operation est donc PUREMENT ADDITIVE : elle rend les nouveaux blocs, ranges
 * en grille sous les anciens, tous racines. L'appelant les concatene.
 */
export function disposerLesManquantes(
  manquants: readonly PosteBureau[],
  planExistant: readonly DispositionPoste[],
): DispositionPoste[] {
  const grille = dispositionParDefaut(manquants);
  if (planExistant.length === 0) return grille;

  // Sous le bloc le plus bas : les nouveaux venus ne recouvrent jamais un
  // bloc deja pose, meme si le plan a ete etale a la main.
  const bas = Math.max(...planExistant.map((d) => d.y)) + HAUTEUR_BLOC + ESPACEMENT_Y;

  return grille.map((d) => ({ ...d, y: d.y + bas }));
}

/**
 * Ecarte d'un plan enregistre ce qui n'a plus de sens.
 *
 * Un plan vit plus longtemps que le referentiel qui l'a nourri : une fonction
 * se desactive, une entite change de niveau, et le plan garde un bloc dont
 * plus rien ne repond. On retire ces blocs, et l'on RACINE ceux qui en
 * dependaient — un trait vers un bloc absent laisserait un organigramme
 * incoherent a l'ecran, sans que rien n'explique pourquoi.
 */
export function nettoyerDisposition(
  postes: readonly PosteBureau[],
  enregistree: readonly DispositionPoste[],
): DispositionPoste[] {
  const applicables = new Set(postes.map((p) => p.fonction.id));

  return enregistree
    .filter((d) => applicables.has(d.fonctionId))
    .map((d) => ({
      ...d,
      parentFonctionId:
        d.parentFonctionId && applicables.has(d.parentFonctionId)
          ? d.parentFonctionId
          : null,
    }));
}

/**
 * Retire un bloc du plan.
 *
 * Ses subordonnes ne partent PAS avec lui : ils remontent en racine. Les faire
 * disparaitre effacerait d'un geste une branche entiere qu'on ne voulait pas
 * toucher — et le geste, lui, ne demande rien.
 *
 * Le referentiel n'est jamais concerne : ce qui sort du plan retourne dans la
 * palette, la fonction continue d'exister.
 */
export function retirerPoste(
  disposition: readonly DispositionPoste[],
  fonctionId: string,
): DispositionPoste[] {
  return disposition
    .filter((d) => d.fonctionId !== fonctionId)
    .map((d) => (d.parentFonctionId === fonctionId ? { ...d, parentFonctionId: null } : d));
}

// -----------------------------------------------------------------------------

/** Remonte la chaine des superieurs. Bornee : un cycle deja en base ne doit pas figer l'ecran. */
function ancetres(
  fonctionId: string,
  disposition: readonly DispositionPoste[],
): Set<string> {
  const parFonction = new Map(disposition.map((d) => [d.fonctionId, d]));
  const vus = new Set<string>();

  let courant = parFonction.get(fonctionId)?.parentFonctionId ?? null;
  while (courant && !vus.has(courant)) {
    vus.add(courant);
    courant = parFonction.get(courant)?.parentFonctionId ?? null;
  }
  return vus;
}

/**
 * EF-BUR-07 — un rattachement est-il recevable ?
 *
 * Trois refus, et le message doit dire lequel : un geste rejete sans raison se
 * relit comme une panne, et l'utilisateur recommence a l'identique.
 */
export function validerLien(
  fonction: { id: string; libelle: string },
  parent: { id: string; libelle: string },
  disposition: readonly DispositionPoste[],
): ActionResult<void> {
  if (fonction.id === parent.id) {
    return ko('Une fonction ne peut pas dependre d elle-meme.');
  }

  const actuel = disposition.find((d) => d.fonctionId === fonction.id);
  if (actuel?.parentFonctionId === parent.id) {
    return ko(`« ${fonction.libelle} » depend deja de « ${parent.libelle} ».`);
  }

  // Rattacher un superieur sous l'un de ses propres subordonnes detacherait la
  // branche : plus personne ne remonterait a la racine.
  if (ancetres(parent.id, disposition).has(fonction.id)) {
    return ko(
      `« ${parent.libelle} » depend deja de « ${fonction.libelle} » : ` +
        'ce rattachement creerait une boucle.',
    );
  }

  return ok();
}

/**
 * Racines du plan.
 *
 * Il peut y en avoir PLUSIEURS, et c'est voulu : un bureau se compose parfois
 * de branches sans sommet commun — un comite et une commission cote a cote.
 * Imposer une racine unique obligerait a inventer un poste qui n'existe pas.
 */
export function racines(disposition: readonly DispositionPoste[]): DispositionPoste[] {
  return disposition.filter((d) => d.parentFonctionId === null);
}
