import { cleDoublon } from './croyant';

/**
 * Saisie d'un lot de baptises — EF-BAP-07.
 *
 * UNE CEREMONIE, PLUSIEURS BAPTISES. Ce qui est commun au lot — la date, le
 * lieu, les celebrants, le libelle de session — se saisit UNE fois ; ce qui
 * distingue les personnes se saisit ligne par ligne. C'est tout le propos :
 * un bapteme collectif de trente personnes demandait trente fois les memes
 * huit champs de ceremonie.
 *
 * L'EGLISE EST UNE COLONNE, PAS UN EN-TETE. Une ceremonie de district reunit
 * au bord de la meme riviere des baptises de cinq eglises differentes : chacun
 * reste rattache a la sienne (RG-04). Elle disparait de l'ecran dans le seul
 * cas ou elle ne se discute pas — voir `egliseImplicite`.
 *
 * Module PUR : aucune dependance serveur, donc testable directement.
 */

export interface LigneLot {
  readonly nom: string;
  readonly prenom: string;
  readonly dateNaissance: string;
}

/**
 * L'eglise que l'utilisateur n'a pas a renseigner.
 *
 * POURQUOI PAS « SUPERADMIN OU NON »
 *
 * Le besoin est venu ainsi — le SuperAdmin renseigne la colonne, les autres
 * non, « ils sont deja rattaches a une eglise ». C'est vrai du gestionnaire
 * d'une eglise ; ce ne l'est pas de celui d'un district ou d'une paroisse, qui
 * n'est pas SuperAdmin et compte pourtant vingt eglises sous lui. Prendre son
 * entite de rattachement lui rangerait tous ses baptises sous un DISTRICT —
 * ce que RG-04 interdit — ou sous une eglise au hasard, en silence.
 *
 * La question n'est donc pas QUI est l'utilisateur mais ce que son perimetre
 * CONTIENT : une seule eglise ne laisse aucun choix a faire, et le seul choix
 * possible n'a pas a etre demande. Au-dela, la colonne s'impose — SuperAdmin
 * compris, puisqu'il les voit toutes.
 */
export function egliseImplicite(
  eglises: readonly { readonly id: string }[],
): string | null {
  return eglises.length === 1 ? (eglises[0]?.id ?? null) : null;
}

/**
 * Le grade d'un nouveau baptise — EF-BAP-01.
 *
 * IL NE SE DEMANDE PLUS. Un nouveau baptise est « Croyant », toujours : le
 * champ n'offrait donc pas un choix, il offrait une OCCASION DE SE TROMPER, et
 * trente fois de suite dans un lot. Le rare cas particulier — un ancien
 * responsable rebaptise — se corrige sur la fiche, en un ecran pour une
 * personne plutot qu'un champ pour toutes.
 *
 * Le serveur le RESOUT lui-meme, il ne le recoit pas : un formulaire qui
 * n'affiche pas un champ n'a pas a l'envoyer, et une action n'ecrit que les
 * champs dont son formulaire est la source (regle 19).
 *
 * Rend `null` si le referentiel ne contient aucun « Croyant » — l'appelant le
 * DIT, plutot que de ranger tout un lot sous un grade pris au hasard.
 */
export function trouverGradeCroyant(
  grades: readonly { readonly id: string; readonly libelle: string }[],
): string | null {
  const normaliser = (v: string) =>
    v
      .trim()
      .toLocaleLowerCase('fr')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');

  return grades.find((g) => normaliser(g.libelle) === 'croyant')?.id ?? null;
}

/**
 * Les lignes qui repetent une personne DEJA presente dans le meme lot.
 *
 * Rendue par INDEX, et jamais la premiere occurrence : c'est la repetition
 * qu'on ecarte, pas la personne. Une saisie de trente lignes se fait souvent
 * par copier-coller depuis une liste manuscrite, et la meme ligne collee deux
 * fois passerait autrement les deux controles — la base ne voit qu'une
 * insertion a la fois, et `chercherDoublons` ne voit que ce qui est deja
 * enregistre.
 */
export function doublonsInternes(lignes: readonly LigneLot[]): number[] {
  const vues = new Set<string>();
  const repetees: number[] = [];

  lignes.forEach((ligne, index) => {
    // Une ligne incomplete n'est pas un doublon : elle sera refusee ailleurs,
    // avec son propre motif. La confondre ici donnerait un message faux.
    if (!ligne.nom.trim() || !ligne.prenom.trim() || !ligne.dateNaissance) return;

    const cle = cleDoublon(ligne.nom, ligne.prenom, new Date(ligne.dateNaissance));
    if (vues.has(cle)) repetees.push(index);
    else vues.add(cle);
  });

  return repetees;
}
