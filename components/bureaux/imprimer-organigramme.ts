'use client';

import { toast } from 'sonner';

import type { BureauComplet, MembreBureau } from '@/lib/data/bureaux';
import { type PosteBureau, libelleAffichage } from '@/lib/domain/bureau';
import type { DispositionPoste } from '@/lib/domain/organigramme-bureau';
import { type BlocImprime, construireSvg } from '@/lib/domain/organigramme-svg';
import { formatDate } from '@/lib/utils/format';

/**
 * Impression de l'organigramme — EF-BUR-11.
 *
 * UN SEUL CHEMIN pour deux ecrans : l'editeur et le pop-up de composition
 * impriment la meme chose, par la meme fonction. Deux implementations jumelles
 * auraient diverge des la premiere retouche de mise en page, et un bureau se
 * serait imprime differemment selon l'endroit d'ou on l'a demande.
 */

/**
 * Le PLAN decide des blocs a imprimer.
 *
 * Une fonction applicable mais jamais posee n'apparait pas sur l'organigramme :
 * elle attend dans la palette. L'impression rend ce qui est dessine, pas ce qui
 * pourrait l'etre.
 */
function blocs(
  postes: readonly PosteBureau[],
  membres: readonly MembreBureau[],
  plan: readonly DispositionPoste[],
): BlocImprime[] {
  const parFonction = new Map(postes.map((p) => [p.fonction.id, p]));
  const parMandat = new Map(membres.map((m) => [m.id, m]));

  return plan
    .map((place) => {
      const poste = parFonction.get(place.fonctionId);
      if (!poste) return null;

      const croyant = poste.mandat
        ? (parMandat.get(poste.mandat.id)?.croyant ?? null)
        : null;

      return {
        fonctionId: place.fonctionId,
        // Les coordonnees sont transmises pour memoire : `construireSvg` les
        // ecarte et redessine l'arbre. Voir `disposerEnArbre`.
        x: place.x,
        y: place.y,
        fonction: poste.fonction.libelle,
        estFinanciere: poste.fonction.estFinanciere,
        parentFonctionId: place.parentFonctionId,
        titulaire: croyant
          ? { nom: croyant.nom, prenom: croyant.prenom, matricule: croyant.matricule }
          : null,
      } satisfies BlocImprime;
    })
    .filter((b) => b !== null);
}

/**
 * Ouvre la fenetre d'impression du navigateur, qui sait enregistrer en PDF.
 *
 * `@page size: A4 landscape` fixe le format ; le SVG porte un cadre deja mis au
 * rapport de la page et se centre dedans. Deux bureaux s'impriment ainsi a la
 * meme echelle, quelle que soit la mise en page choisie a l'ecran.
 */
export function imprimerOrganigramme(
  bureau: BureauComplet,
  postes: readonly PosteBureau[],
  plan: readonly DispositionPoste[],
): void {
  const svg = construireSvg(blocs(postes, bureau.membres, plan), {
    titre: bureau.libelle,
    entite: bureau.entite?.nom ?? '',
    periode: libelleAffichage(bureau.libelle, bureau.date_debut, bureau.date_fin),
    edite: formatDate(new Date()),
  });

  if (!svg) {
    // Une feuille blanche ne dit pas pourquoi elle est blanche.
    toast.error("Aucun bloc n'est posé : il n'y a rien à imprimer.");
    return;
  }

  const fenetre = window.open('', '_blank', 'width=1024,height=768');
  if (!fenetre) {
    toast.error("La fenêtre d'impression a été bloquée. Autorisez les pop-ups pour ce site.");
    return;
  }

  const titre = `${bureau.libelle} — ${bureau.entite?.nom ?? ''}`;

  fenetre.document.write(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
      `<title>${titre.replace(/[<>&]/g, '')}</title>` +
      '<style>' +
      '@page { size: A4 landscape; margin: 8mm }' +
      'html, body { height: 100%; margin: 0 }' +
      // Le SVG occupe la page entiere ; son `preserveAspectRatio` le centre
      // sans jamais le rogner.
      'svg { display: block; width: 100%; height: 100% }' +
      '</style></head><body>' +
      svg +
      '</body></html>',
  );
  fenetre.document.close();

  // L'impression attend que le document soit posé : lancée trop tôt, elle
  // sortirait une page blanche.
  fenetre.addEventListener('load', () => fenetre.print());
}
