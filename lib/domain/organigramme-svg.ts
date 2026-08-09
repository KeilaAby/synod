/**
 * Organigramme d'un bureau en SVG imprimable — EF-BUR-11.
 *
 * POURQUOI PAS UNE BIBLIOTHEQUE PDF
 *
 * Le besoin est « imprimer l'organigramme », pas « produire un PDF par
 * programme » : le navigateur sait deja imprimer, et sait deja enregistrer en
 * PDF. Ce qui manque, c'est un DESSIN COMPLET — le graphe a l'ecran est cadre,
 * zoome, et une capture n'emporterait que ce qu'on voit.
 *
 * On redessine donc le plan entier en SVG, a partir des memes coordonnees. Le
 * resultat est vectoriel, lisible a toute echelle, et ne coute aucune
 * dependance — ni `jspdf`, ni `html-to-image`, ni leurs mises a jour.
 *
 * CE QUI N'Y FIGURE PAS
 *
 * Les photos. Elles vivent derriere des URL signees : une image distante dans
 * une fenetre d'impression arrive apres l'appel a `print()`, et sortirait vide
 * une fois sur deux. Les initiales disent la meme chose et sortent toujours.
 *
 * Module PUR : aucune dependance, donc testable directement.
 */

export interface BlocImprime {
  readonly fonctionId: string;
  readonly x: number;
  readonly y: number;
  readonly fonction: string;
  /** `null` : fonction vacante — le bloc sort en pointille. */
  readonly titulaire: { nom: string; prenom: string; matricule: string } | null;
  readonly estFinanciere: boolean;
  readonly parentFonctionId: string | null;
}

/** Memes dimensions qu'a l'ecran : le dessin doit ressembler a ce qu'on a arrange. */
const LARGEUR = 224;
const HAUTEUR = 140;
const MARGE = 48;
const RAYON = 12;

/**
 * Echappe ce qui casserait le document.
 *
 * Un nom de famille contenant `&` — « Ratsimba & Fils » pour une commission —
 * suffit a rendre le SVG illisible par l'analyseur du navigateur, qui
 * n'affiche alors RIEN plutot qu'un caractere de travers.
 */
export function echapperXml(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Coupe un libelle trop long : un texte SVG ne se replie pas tout seul. */
export function tronquer(texte: string, maximum: number): string {
  const propre = texte.trim();
  return propre.length <= maximum ? propre : `${propre.slice(0, maximum - 1)}…`;
}

function initiales(nom: string, prenom: string): string {
  return `${nom.trim()[0] ?? ''}${prenom.trim()[0] ?? ''}`.toLocaleUpperCase('fr');
}

/**
 * Un trait orthogonal entre deux blocs : sortie par le bas, entree par le haut,
 * coude a mi-hauteur. C'est le trace d'un organigramme, celui que l'oeil suit
 * sans le lire.
 */
function trait(parent: BlocImprime, enfant: BlocImprime): string {
  const departX = parent.x + LARGEUR / 2;
  const departY = parent.y + HAUTEUR;
  const arriveeX = enfant.x + LARGEUR / 2;
  const arriveeY = enfant.y;
  const coude = departY + (arriveeY - departY) / 2;

  return `M ${departX} ${departY} V ${coude} H ${arriveeX} V ${arriveeY}`;
}

export interface EnTeteImpression {
  readonly titre: string;
  readonly entite: string;
  readonly periode: string;
  /** Date d'edition : un organigramme imprime se perime, il doit se dater. */
  readonly edite: string;
}

/**
 * Le plan complet, en un SVG autonome.
 *
 * Retourne `null` si rien n'est pose : une feuille vide n'a pas a s'imprimer,
 * et le bouton doit le dire plutot que de sortir une page blanche.
 */
export function construireSvg(
  blocs: readonly BlocImprime[],
  entete: EnTeteImpression,
): string | null {
  if (blocs.length === 0) return null;

  const parId = new Map(blocs.map((b) => [b.fonctionId, b]));

  const minX = Math.min(...blocs.map((b) => b.x));
  const minY = Math.min(...blocs.map((b) => b.y));
  const maxX = Math.max(...blocs.map((b) => b.x + LARGEUR));
  const maxY = Math.max(...blocs.map((b) => b.y + HAUTEUR));

  // L'en-tete occupe une bande au-dessus du plan : le decalage la lui reserve.
  const HAUTEUR_ENTETE = 88;
  const largeur = maxX - minX + MARGE * 2;
  const hauteur = maxY - minY + MARGE * 2 + HAUTEUR_ENTETE;
  const origineX = minX - MARGE;
  const origineY = minY - MARGE - HAUTEUR_ENTETE;

  const traits = blocs
    .filter((b) => b.parentFonctionId && parId.has(b.parentFonctionId))
    .map(
      (b) =>
        `<path d="${trait(parId.get(b.parentFonctionId!)!, b)}" fill="none" ` +
        `stroke="#94a3b8" stroke-width="1.5" />`,
    )
    .join('\n    ');

  const cartes = blocs
    .map((bloc) => {
      const vacant = bloc.titulaire === null;
      const cadre =
        `<rect x="${bloc.x}" y="${bloc.y}" width="${LARGEUR}" height="${HAUTEUR}" ` +
        `rx="${RAYON}" fill="${vacant ? '#fffbeb' : '#ffffff'}" ` +
        `stroke="${vacant ? '#f59e0b' : '#cbd5e1'}" stroke-width="1.5"` +
        `${vacant ? ' stroke-dasharray="6 4"' : ''} />`;

      const fonction =
        `<text x="${bloc.x + 16}" y="${bloc.y + 30}" font-size="13" font-weight="600" ` +
        `fill="#0f172a">${echapperXml(tronquer(bloc.fonction, 26))}</text>`;

      const finances = bloc.estFinanciere
        ? `<text x="${bloc.x + 16}" y="${bloc.y + 50}" font-size="10" fill="#7c3aed">FINANCES</text>`
        : '';

      if (vacant) {
        return `${cadre}
    ${fonction}
    ${finances}
    <text x="${bloc.x + 16}" y="${bloc.y + 92}" font-size="13" fill="#b45309">Vacante</text>`;
      }

      const t = bloc.titulaire!;
      return `${cadre}
    ${fonction}
    ${finances}
    <circle cx="${bloc.x + 34}" cy="${bloc.y + 92}" r="18" fill="#e0e7ff" />
    <text x="${bloc.x + 34}" y="${bloc.y + 97}" font-size="13" font-weight="600" ` +
        `fill="#4338ca" text-anchor="middle">${echapperXml(initiales(t.nom, t.prenom))}</text>
    <text x="${bloc.x + 62}" y="${bloc.y + 89}" font-size="13" fill="#0f172a">` +
        `${echapperXml(tronquer(`${t.nom} ${t.prenom}`, 20))}</text>
    <text x="${bloc.x + 62}" y="${bloc.y + 106}" font-size="10" fill="#64748b" ` +
        `font-family="ui-monospace, monospace">${echapperXml(t.matricule)}</text>`;
    })
    .join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${origineX} ${origineY} ${largeur} ${hauteur}" width="${largeur}" height="${hauteur}" font-family="system-ui, -apple-system, Segoe UI, sans-serif">
    <rect x="${origineX}" y="${origineY}" width="${largeur}" height="${hauteur}" fill="#ffffff" />
    <text x="${origineX + MARGE}" y="${origineY + 44}" font-size="22" font-weight="700" fill="#0f172a">${echapperXml(entete.titre)}</text>
    <text x="${origineX + MARGE}" y="${origineY + 68}" font-size="13" fill="#475569">${echapperXml(`${entete.entite} — ${entete.periode}`)}</text>
    <text x="${origineX + largeur - MARGE}" y="${origineY + 68}" font-size="11" fill="#94a3b8" text-anchor="end">${echapperXml(`Édité le ${entete.edite}`)}</text>
    ${traits}
    ${cartes}
  </svg>`;
}
