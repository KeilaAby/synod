'use client';

import { avertir } from '@/components/shared/messages';
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
 * Cote du portrait embarque, en pixels.
 *
 * La pastille mesure 36 unites SVG, soit environ 7 mm sur une A4 paysage : a
 * 300 points par pouce, une centaine de pixels suffit. Embarquer l'original —
 * souvent 1 a 3 Mo — gonflerait le document d'un tiers de plus en base64 pour
 * une image que personne ne verra a cette taille, et rendrait l'ouverture de la
 * fenetre penible.
 */
const COTE_PORTRAIT = 128;

/**
 * Convertit une photo en `data:`, recadree en carre et reduite.
 *
 * POURQUOI NE PAS SIMPLEMENT LIER L'URL
 *
 * Une image distante dans une fenetre d'impression se charge APRES l'appel a
 * `print()` : la feuille sort vide une fois sur deux. Et l'URL est signee, donc
 * perimee des le lendemain — un PDF garde ne montrerait plus rien.
 *
 * L'echec est SILENCIEUX et rend `null` : le bloc retombe sur les initiales.
 * Une photo manquante ne doit pas empecher d'imprimer l'organigramme.
 */
async function embarquerPhoto(url: string): Promise<string | null> {
  try {
    const reponse = await fetch(url);
    if (!reponse.ok) return null;

    const blob = await reponse.blob();
    if (!blob.type.startsWith('image/')) return null;

    const image = await createImageBitmap(blob);
    const toile = document.createElement('canvas');
    toile.width = COTE_PORTRAIT;
    toile.height = COTE_PORTRAIT;

    const ctx = toile.getContext('2d');
    if (!ctx) return null;

    // Recadrage carre CENTRE, comme `object-cover` a l'ecran : un portrait se
    // rogne, il ne s'etire pas.
    const cote = Math.min(image.width, image.height);
    ctx.drawImage(
      image,
      (image.width - cote) / 2,
      (image.height - cote) / 2,
      cote,
      cote,
      0,
      0,
      COTE_PORTRAIT,
      COTE_PORTRAIT,
    );
    image.close();

    return toile.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  }
}

/**
 * Embarque les photos des titulaires, toutes en parallele.
 *
 * Une seule cle par photo, meme si deux blocs la partagent : un tresorier qui
 * cumule deux fonctions ne paie pas deux fois. Les images sont deja dans le
 * cache du navigateur — elles s'affichent a l'ecran juste au-dessus.
 */
async function photosEmbarquees(
  membres: readonly MembreBureau[],
  photos: Record<string, string>,
): Promise<Map<string, string>> {
  const cles = [
    ...new Set(
      membres
        .map((m) => m.croyant?.photo_key)
        .filter((k): k is string => typeof k === 'string' && Boolean(photos[k])),
    ),
  ];

  const resultats = await Promise.all(cles.map((cle) => embarquerPhoto(photos[cle]!)));

  return new Map(
    cles
      .map((cle, i) => [cle, resultats[i]] as const)
      .filter((paire): paire is readonly [string, string] => paire[1] !== null),
  );
}

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
  portraits: Map<string, string>,
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
          ? {
              nom: croyant.nom,
              prenom: croyant.prenom,
              matricule: croyant.matricule,
              photo: croyant.photo_key ? (portraits.get(croyant.photo_key) ?? null) : null,
            }
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
export async function imprimerOrganigramme(
  bureau: BureauComplet,
  postes: readonly PosteBureau[],
  plan: readonly DispositionPoste[],
  photos: Record<string, string> = {},
): Promise<void> {
  if (plan.length === 0) {
    // Une feuille blanche ne dit pas pourquoi elle est blanche.
    avertir("Aucun bloc n'est posé : il n'y a rien à imprimer.");
    return;
  }

  /**
   * La fenetre s'ouvre AVANT tout `await`.
   *
   * Un `window.open` qui suit une attente n'est plus rattache au clic qui l'a
   * declenche : le navigateur le prend pour une pop-up intempestive et le
   * bloque. On l'ouvre donc tout de suite, avec un mot pendant que les photos
   * se preparent, et le document definitif remplace celui-ci.
   */
  const fenetre = window.open('', '_blank', 'width=1024,height=768');
  if (!fenetre) {
    avertir("La fenêtre d'impression a été bloquée. Autorisez les pop-ups pour ce site.");
    return;
  }

  const titre = `${bureau.libelle} — ${bureau.entite?.nom ?? ''}`;
  const enTete =
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    `<title>${titre.replace(/[<>&]/g, '')}</title>`;

  fenetre.document.write(
    `${enTete}<style>body{font:14px system-ui,sans-serif;color:#475569;padding:32px}` +
      "</style></head><body>Préparation de l'impression…</body></html>",
  );
  fenetre.document.close();

  const portraits = await photosEmbarquees(bureau.membres, photos);

  const svg = construireSvg(blocs(postes, bureau.membres, plan, portraits), {
    titre: bureau.libelle,
    entite: bureau.entite?.nom ?? '',
    periode: libelleAffichage(bureau.libelle, bureau.date_debut, bureau.date_fin),
    edite: formatDate(new Date()),
  });

  if (!svg) {
    fenetre.close();
    avertir("Aucun bloc n'est posé : il n'y a rien à imprimer.");
    return;
  }

  fenetre.document.open();
  fenetre.document.write(
    `${enTete}<style>` +
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

  /**
   * L'impression attend que le document soit posé — lancée trop tôt, elle
   * sortirait une page blanche.
   *
   * Deux chemins, parce que `load` a pu se produire pendant `close()` : le
   * verrou garantit qu'un seul aboutit. Depuis que les portraits sont
   * embarqués, `load` couvre aussi leur décodage — c'est l'avantage d'une
   * image qui ne vient pas du réseau.
   */
  let lance = false;
  const imprimer = () => {
    if (lance) return;
    lance = true;
    fenetre.print();
  };

  fenetre.addEventListener('load', imprimer);
  if (fenetre.document.readyState === 'complete') imprimer();
}
