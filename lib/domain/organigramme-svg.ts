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

/** Espacements de la disposition imprimee. Grille de 8 px, comme a l'ecran. */
const ECART_X = 32;
const ECART_Y = 72;

/**
 * Dispose les blocs EN ARBRE, en ignorant les coordonnees de l'ecran.
 *
 * POURQUOI NE PAS REPRENDRE LA DISPOSITION DE L'UTILISATEUR
 *
 * Sur le plan, il place les blocs pour travailler : a portee de souris, quitte
 * a les laisser en vrac ou tres etales. Sortie telle quelle, cette disposition
 * donne une feuille A4 aux trois quarts vide avec des blocs alignes n'importe
 * comment — c'est ce qu'on a imprime le 11 aout 2026.
 *
 * Ce qu'une impression doit rendre, c'est la HIERARCHIE : qui depend de qui.
 * Elle est dans les liens, pas dans les positions. On la redessine donc
 * proprement, et le resultat est le meme quelle que soit la mise en page
 * choisie a l'ecran.
 *
 * L'algorithme est le classique parcours suffixe : chaque sous-arbre annonce
 * sa largeur, le parent se centre au-dessus des siens. Les racines multiples
 * se suivent — un bureau peut avoir plusieurs branches sans sommet commun.
 */
export function disposerEnArbre(blocs: readonly BlocImprime[]): BlocImprime[] {
  const parId = new Map(blocs.map((b) => [b.fonctionId, b]));

  const enfants = new Map<string, BlocImprime[]>();
  const racines: BlocImprime[] = [];

  for (const bloc of blocs) {
    const parent = bloc.parentFonctionId;
    if (parent && parId.has(parent) && parent !== bloc.fonctionId) {
      (enfants.get(parent) ?? enfants.set(parent, []).get(parent)!).push(bloc);
    } else {
      racines.push(bloc);
    }
  }

  const places = new Map<string, { x: number; y: number }>();
  const largeurs = new Map<string, number>();

  /**
   * Largeur du sous-arbre, memoisee.
   *
   * `enCours` protege d'une boucle : le trigger `fn_poste_sans_cycle` l'interdit
   * en base, mais une reprise de donnees pourrait en introduire une, et une
   * impression qui tourne indefiniment est pire qu'une impression fausse.
   */
  const enCours = new Set<string>();

  function largeur(bloc: BlocImprime): number {
    const connue = largeurs.get(bloc.fonctionId);
    if (connue !== undefined) return connue;
    if (enCours.has(bloc.fonctionId)) return LARGEUR;

    enCours.add(bloc.fonctionId);
    const fils = enfants.get(bloc.fonctionId) ?? [];
    const total =
      fils.length === 0
        ? LARGEUR
        : Math.max(
            LARGEUR,
            fils.reduce((n, f) => n + largeur(f), 0) + (fils.length - 1) * ECART_X,
          );
    enCours.delete(bloc.fonctionId);

    largeurs.set(bloc.fonctionId, total);
    return total;
  }

  const poses = new Set<string>();

  function poser(bloc: BlocImprime, gauche: number, profondeur: number): void {
    if (poses.has(bloc.fonctionId)) return;
    poses.add(bloc.fonctionId);

    // Le parent se CENTRE au-dessus de ses enfants : c'est ce qui fait lire un
    // organigramme comme un arbre plutot que comme une liste indentee.
    places.set(bloc.fonctionId, {
      x: gauche + (largeur(bloc) - LARGEUR) / 2,
      y: profondeur * (HAUTEUR + ECART_Y),
    });

    let curseur = gauche;
    for (const fils of enfants.get(bloc.fonctionId) ?? []) {
      poser(fils, curseur, profondeur + 1);
      curseur += largeur(fils) + ECART_X;
    }
  }

  let curseur = 0;
  for (const racine of racines) {
    poser(racine, curseur, 0);
    curseur += largeur(racine) + ECART_X;
  }

  return blocs.map((bloc) => ({
    ...bloc,
    ...(places.get(bloc.fonctionId) ?? { x: 0, y: 0 }),
  }));
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

  /**
   * La disposition de l'ecran est ECARTEE au profit de l'arbre.
   * Voir `disposerEnArbre` : une impression rend une hierarchie, pas une mise
   * en page de travail.
   */
  const plan = disposerEnArbre(blocs);
  const parId = new Map(plan.map((b) => [b.fonctionId, b]));

  const minX = Math.min(...plan.map((b) => b.x));
  const minY = Math.min(...plan.map((b) => b.y));
  const maxX = Math.max(...plan.map((b) => b.x + LARGEUR));
  const maxY = Math.max(...plan.map((b) => b.y + HAUTEUR));

  // L'en-tete occupe une bande au-dessus du plan : le decalage la lui reserve.
  const HAUTEUR_ENTETE = 88;
  const contenuLargeur = maxX - minX + MARGE * 2;
  const contenuHauteur = maxY - minY + MARGE * 2 + HAUTEUR_ENTETE;

  /**
   * Le cadre est COMPLETE au format A4 paysage, jamais rogne.
   *
   * Sans cela, un organigramme large sort en bande etroite et un organigramme
   * profond en colonne : la feuille reste aux trois quarts vide, et deux
   * bureaux ne s'impriment pas a la meme echelle. En portant la zone visible au
   * rapport de la page — 297 sur 210 —, le dessin se centre et occupe toujours
   * la feuille de la meme facon.
   *
   * On n'agrandit que la dimension qui manque : le contenu n'est jamais coupe.
   */
  const RATIO_A4 = 297 / 210;
  const largeur = Math.max(contenuLargeur, contenuHauteur * RATIO_A4);
  const hauteur = Math.max(contenuHauteur, contenuLargeur / RATIO_A4);

  const origineX = minX - MARGE - (largeur - contenuLargeur) / 2;
  const origineY = minY - MARGE - HAUTEUR_ENTETE - (hauteur - contenuHauteur) / 2;

  const traits = plan
    .filter((b) => b.parentFonctionId && parId.has(b.parentFonctionId))
    .map(
      (b) =>
        `<path d="${trait(parId.get(b.parentFonctionId!)!, b)}" fill="none" ` +
        `stroke="#94a3b8" stroke-width="1.5" />`,
    )
    .join('\n    ');

  const cartes = plan
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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${origineX} ${origineY} ${largeur} ${hauteur}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" font-family="system-ui, -apple-system, Segoe UI, sans-serif">
    <rect x="${origineX}" y="${origineY}" width="${largeur}" height="${hauteur}" fill="#ffffff" />
    <text x="${origineX + MARGE}" y="${origineY + 44}" font-size="22" font-weight="700" fill="#0f172a">${echapperXml(entete.titre)}</text>
    <text x="${origineX + MARGE}" y="${origineY + 68}" font-size="13" fill="#475569">${echapperXml(`${entete.entite} — ${entete.periode}`)}</text>
    <text x="${origineX + largeur - MARGE}" y="${origineY + 68}" font-size="11" fill="#94a3b8" text-anchor="end">${echapperXml(`Édité le ${entete.edite}`)}</text>
    ${traits}
    ${cartes}
  </svg>`;
}
