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
 * LES PHOTOS SONT EMBARQUEES, PAS LIEES
 *
 * Elles vivent derriere des URL signees. Liee, une image distante dans une
 * fenetre d'impression arrive APRES l'appel a `print()` : la feuille sortirait
 * vide une fois sur deux, et l'URL expirerait de toute facon. Elles sont donc
 * converties en `data:` avant la construction du document — voir
 * `imprimer-organigramme.ts`. Ce module ne connait que le resultat : une chaine
 * deja autonome, ou `null`, auquel cas les initiales prennent la place.
 *
 * Module PUR : aucune dependance, donc testable directement.
 */

export interface BlocImprime {
  readonly fonctionId: string;
  readonly x: number;
  readonly y: number;
  readonly fonction: string;
  /** `null` : fonction vacante — le bloc sort en pointille. */
  readonly titulaire: {
    nom: string;
    prenom: string;
    matricule: string;
    /**
     * Photo deja convertie en `data:image/...`. `null` ou absente : initiales.
     * Une URL distante est REFUSEE — elle n'arriverait pas a temps.
     */
    photo?: string | null;
  } | null;
  readonly estFinanciere: boolean;
  readonly parentFonctionId: string | null;
  /**
   * EF-BUR-07 — le poste se dessine A COTE DU TRONC de son superieur, pas dans
   * la rangee de ses freres : c'est l'adjoint, le cabinet.
   *
   * Il ne change NI la parente NI le niveau. Un rang intermediaire decalerait
   * toute la descendance d'un cran pour obtenir un effet de dessin.
   */
  readonly enDerivation?: boolean;
}

/**
 * Le bloc imprime est PLUS GRAND que celui de l'ecran.
 *
 * A l'ecran, un nom trop long se survole ou s'ouvre ; sur une feuille, il n'y a
 * pas de recours. Les vingt-quatre pixels de large et les vingt-huit de haut
 * gagnes ici sont ce qui permet a « RANOMENJANAHARY Christian Nicolas » de
 * tenir en entier — voir `replierTexte`.
 */
const LARGEUR = 248;
const HAUTEUR = 168;
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

/**
 * Largeur moyenne d'un caractere, en fraction de la taille de police.
 *
 * C'est une ESTIMATION, et elle ne peut pas etre autre chose : mesurer un
 * texte demande les metriques de la fonte, donc un DOM — que ce module n'a pas
 * et ne veut pas avoir. La valeur est prise haute, parce que les patronymes
 * s'ecrivent en capitales : `RAZANADRAKOTO` est plus large que `Razanadrakoto`
 * a taille egale. Mieux vaut reduire d'un point de trop que deborder.
 */
const LARGEUR_CARACTERE = 0.6;

export interface TexteReplie {
  readonly lignes: readonly string[];
  readonly taille: number;
}

/**
 * Replie un texte sur plusieurs lignes, en REDUISANT la police si necessaire.
 *
 * POURQUOI PAS UNE TRONCATURE
 *
 * Le nom d'un responsable etait coupe a vingt caracteres :
 * « RANOMENJANAHARY Christian Nicolas » sortait mutile sur une feuille remise
 * a des gens qui la liront. Un organigramme imprime sert justement a NOMMER —
 * abreger le nom lui retire sa raison d'etre.
 *
 * On coupe donc entre les MOTS, sur au plus `lignesMax` lignes, et l'on
 * descend d'un point de police tant que cela ne tient pas. Un mot unique plus
 * large que le bloc reste indivisible : a la plus petite taille, on le laisse
 * deborder legerement plutot que de l'amputer — il demeure lisible.
 */
export function replierTexte(
  texte: string,
  largeurDisponible: number,
  taillesPossibles: readonly number[],
  lignesMax: number,
): TexteReplie {
  const mots = texte.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return { lignes: [], taille: taillesPossibles[0] ?? 13 };

  for (const taille of taillesPossibles) {
    const parLigne = Math.floor(largeurDisponible / (taille * LARGEUR_CARACTERE));
    if (parLigne < 1) continue;

    const lignes: string[] = [];
    let courante = '';

    for (const mot of mots) {
      const essai = courante ? `${courante} ${mot}` : mot;
      if (essai.length <= parLigne) {
        courante = essai;
      } else {
        if (courante) lignes.push(courante);
        courante = mot;
      }
    }
    if (courante) lignes.push(courante);

    const tientEnLargeur = lignes.every((l) => l.length <= parLigne);
    if (lignes.length <= lignesMax && tientEnLargeur) return { lignes, taille };
  }

  /**
   * Dernier recours : la plus petite taille, et l'on garde TOUT — quitte a
   * depasser `lignesMax`. Rogner les lignes en trop reviendrait a tronquer le
   * nom par un autre chemin, ce que cette fonction existe precisement pour
   * eviter. Un bloc un peu charge se lit ; un nom ampute, non.
   */
  const taille = taillesPossibles[taillesPossibles.length - 1] ?? 9;
  const parLigne = Math.max(1, Math.floor(largeurDisponible / (taille * LARGEUR_CARACTERE)));

  const lignes: string[] = [];
  let courante = '';
  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (essai.length <= parLigne) courante = essai;
    else {
      if (courante) lignes.push(courante);
      courante = mot;
    }
  }
  if (courante) lignes.push(courante);

  return { lignes, taille };
}

function initiales(nom: string, prenom: string): string {
  return `${nom.trim()[0] ?? ''}${prenom.trim()[0] ?? ''}`.toLocaleUpperCase('fr');
}

/**
 * N'accepte qu'une image DEJA EMBARQUEE.
 *
 * Une URL `http(s)` glissee ici sortirait vide a l'impression et ferait sortir
 * du document une requete reseau au moment de l'ouverture de la fenetre. Le
 * refus est donc net, plutot qu'un rendu aleatoire : `null` rend les initiales,
 * qui sortent toujours.
 */
function photoEmbarquee(photo: string | null | undefined): string | null {
  return typeof photo === 'string' && photo.startsWith('data:image/') ? photo : null;
}

/** Rayon de la pastille — photo ou initiales occupent exactement la meme place. */
const RAYON_PASTILLE = 18;

/**
 * Un trait orthogonal entre deux blocs : sortie par le bas, entree par le haut,
 * coude a mi-hauteur. C'est le trace d'un organigramme, celui que l'oeil suit
 * sans le lire.
 */
function trait(parent: BlocImprime, enfant: BlocImprime): string {
  const departX = parent.x + LARGEUR / 2;
  const departY = parent.y + HAUTEUR;

  /**
   * EF-BUR-07 — UNE DERIVATION SE RACCROCHE AU TRONC, PAR LE COTE.
   *
   * Le trait ordinaire descend puis coude vers l'enfant, qui l'accueille par le
   * HAUT. Un adjoint pose a mi-hauteur du tronc n'a pas de haut a offrir : le
   * trait y arriverait en biais, ou par-dessus le bloc.
   *
   * On sort donc du tronc a la hauteur du bloc et on y entre par la GAUCHE.
   * C'est ce qui produit le « T » couche du modele — et ce qui fait lire
   * l'adjoint comme un rattachement lateral plutot que comme un subordonne de
   * plus.
   */
  if (enfant.enDerivation) {
    const milieu = enfant.y + HAUTEUR / 2;
    return `M ${departX} ${departY} V ${milieu} H ${enfant.x}`;
  }

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
  /**
   * EF-BUR-07 — LES POSTES EN DERIVATION SONT MIS DE COTE DES LE TRI.
   *
   * Ils dependent bien de leur superieur, mais ils ne participent NI a la
   * largeur du sous-arbre NI au centrage : les compter parmi les freres
   * decalerait la rangee entiere pour loger un bloc qui n'y figure pas.
   *
   * C'est le seul endroit ou la distinction se fait. Tout le reste — la
   * largeur, le centrage, la profondeur — ignore leur existence, et c'est ce
   * qui garde l'arbre identique a ce qu'il etait sans eux.
   */
  const derivations = new Map<string, BlocImprime[]>();
  const racines: BlocImprime[] = [];

  for (const bloc of blocs) {
    const parent = bloc.parentFonctionId;
    const rattache = parent && parId.has(parent) && parent !== bloc.fonctionId;

    if (!rattache) {
      // Une racine ne peut pas etre en derivation : il n'y a pas de tronc
      // au-dessus d'elle. La base l'interdit (0064) ; ici on retombe sur le
      // comportement ordinaire plutot que de perdre le bloc.
      racines.push(bloc);
      continue;
    }

    const table = bloc.enDerivation ? derivations : enfants;
    (table.get(parent) ?? table.set(parent, []).get(parent)!).push(bloc);
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

    /**
     * EF-BUR-07 — LES DERIVATIONS, APRES COUP ET A COTE DU TRONC.
     *
     * Elles se posent une fois le bloc place, donc en fonction de SA position,
     * et non de celle de la rangee : c'est ce qui les accroche au trait
     * vertical plutot qu'a la ligne des freres.
     *
     * A MI-HAUTEUR entre le superieur et ses subordonnes, la ou le trait
     * descend. Plus haut, elles toucheraient le bloc ; plus bas, elles se
     * confondraient avec la rangee, ce qu'on veut precisement eviter.
     *
     * A DROITE, et empilees s'il y en a plusieurs. Le modele fourni les met a
     * droite ; alterner les cotes pour « equilibrer » ferait changer de place
     * un adjoint parce qu'un autre est apparu.
     */
    const miHauteur = (HAUTEUR + ECART_Y) / 2;
    const place = places.get(bloc.fonctionId)!;

    (derivations.get(bloc.fonctionId) ?? []).forEach((adjoint, rang) => {
      if (poses.has(adjoint.fonctionId)) return;
      poses.add(adjoint.fonctionId);

      places.set(adjoint.fonctionId, {
        x: place.x + LARGEUR + ECART_X,
        y: place.y + miHauteur + rang * (HAUTEUR + ECART_X),
      });
    });
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

  /**
   * Les rognages circulaires des photos, declares une fois pour toutes.
   *
   * Un `clipPath` porte un identifiant, et deux blocs ne peuvent pas partager le
   * meme : le rang dans le plan le fournit, stable et sans caractere a
   * echapper.
   */
  const rognages: string[] = [];

  const cartes = plan
    .map((bloc, rang) => {
      const vacant = bloc.titulaire === null;
      const cadre =
        `<rect x="${bloc.x}" y="${bloc.y}" width="${LARGEUR}" height="${HAUTEUR}" ` +
        `rx="${RAYON}" fill="${vacant ? '#fffbeb' : '#ffffff'}" ` +
        `stroke="${vacant ? '#f59e0b' : '#cbd5e1'}" stroke-width="1.5"` +
        `${vacant ? ' stroke-dasharray="6 4"' : ''} />`;

      // « Secretaire general adjoint aux affaires sociales » debordait autant
      // que les noms : l'intitule se replie selon la meme regle.
      const titre = replierTexte(bloc.fonction, LARGEUR - 32, [13, 12, 11, 10], 2);
      const fonction = titre.lignes
        .map(
          (ligne, i) =>
            `<text x="${bloc.x + 16}" y="${bloc.y + 28 + i * (titre.taille + 4)}" ` +
            `font-size="${titre.taille}" font-weight="600" fill="#0f172a">` +
            `${echapperXml(ligne)}</text>`,
        )
        .join('\n    ');

      const basTitre = bloc.y + 28 + (titre.lignes.length - 1) * (titre.taille + 4);

      const finances = bloc.estFinanciere
        ? `<text x="${bloc.x + 16}" y="${basTitre + 18}" font-size="10" fill="#7c3aed">FINANCES</text>`
        : '';

      if (vacant) {
        return `${cadre}
    ${fonction}
    ${finances}
    <text x="${bloc.x + 16}" y="${bloc.y + HAUTEUR - 28}" font-size="13" fill="#b45309">Vacante</text>`;
      }

      const t = bloc.titulaire!;

      /**
       * Le nom EN ENTIER, replie et reduit s'il le faut.
       *
       * Le matricule reste ancre au bas du bloc et le nom se pose au-dessus de
       * lui : ainsi un nom d'une ligne et un nom de trois lignes s'impriment
       * dans le meme cadre, sans le deformer.
       */
      const nom = replierTexte(`${t.nom} ${t.prenom}`, LARGEUR - 78, [13, 12, 11, 10, 9], 3);
      const matriculeY = bloc.y + HAUTEUR - 20;
      const premiereLigne = matriculeY - 14 - (nom.lignes.length - 1) * (nom.taille + 3);

      const lignesNom = nom.lignes
        .map(
          (ligne, i) =>
            `<text x="${bloc.x + 62}" y="${premiereLigne + i * (nom.taille + 3)}" ` +
            `font-size="${nom.taille}" fill="#0f172a">${echapperXml(ligne)}</text>`,
        )
        .join('\n    ');

      // La pastille se centre sur le bloc nom + matricule, quelle qu'en soit la
      // hauteur : c'est ce qui garde la carte equilibree.
      const centrePastille = (premiereLigne - nom.taille + matriculeY) / 2;
      const centreX = bloc.x + 34;

      /**
       * La PHOTO si on l'a, les initiales sinon — jamais un trou.
       *
       * `slice` recadre comme le fait `object-cover` a l'ecran : un portrait ne
       * se deforme pas, il se rogne. Le cercle de contour passe par-dessus
       * l'image pour lui donner le meme bord que la pastille d'initiales.
       */
      const photo = photoEmbarquee(t.photo);
      let pastille: string;

      if (photo) {
        const cle = `photo-${rang}`;
        rognages.push(
          `<clipPath id="${cle}"><circle cx="${centreX}" cy="${centrePastille}" ` +
            `r="${RAYON_PASTILLE}" /></clipPath>`,
        );
        pastille =
          `<image href="${photo}" x="${centreX - RAYON_PASTILLE}" ` +
          `y="${centrePastille - RAYON_PASTILLE}" width="${RAYON_PASTILLE * 2}" ` +
          `height="${RAYON_PASTILLE * 2}" preserveAspectRatio="xMidYMid slice" ` +
          `clip-path="url(#${cle})" />
    <circle cx="${centreX}" cy="${centrePastille}" r="${RAYON_PASTILLE}" fill="none" ` +
          `stroke="#c7d2fe" stroke-width="1.5" />`;
      } else {
        pastille =
          `<circle cx="${centreX}" cy="${centrePastille}" r="${RAYON_PASTILLE}" fill="#e0e7ff" />
    <text x="${centreX}" y="${centrePastille + 5}" font-size="13" font-weight="600" ` +
          `fill="#4338ca" text-anchor="middle">${echapperXml(initiales(t.nom, t.prenom))}</text>`;
      }

      return `${cadre}
    ${fonction}
    ${finances}
    ${pastille}
    ${lignesNom}
    <text x="${bloc.x + 62}" y="${matriculeY}" font-size="10" fill="#64748b" ` +
        `font-family="ui-monospace, monospace">${echapperXml(t.matricule)}</text>`;
    })
    .join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${origineX} ${origineY} ${largeur} ${hauteur}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" font-family="system-ui, -apple-system, Segoe UI, sans-serif">
    <defs>${rognages.join('')}</defs>
    <rect x="${origineX}" y="${origineY}" width="${largeur}" height="${hauteur}" fill="#ffffff" />
    <text x="${origineX + MARGE}" y="${origineY + 44}" font-size="22" font-weight="700" fill="#0f172a">${echapperXml(entete.titre)}</text>
    <text x="${origineX + MARGE}" y="${origineY + 68}" font-size="13" fill="#475569">${echapperXml(`${entete.entite} — ${entete.periode}`)}</text>
    <text x="${origineX + largeur - MARGE}" y="${origineY + 68}" font-size="11" fill="#94a3b8" text-anchor="end">${echapperXml(`Édité le ${entete.edite}`)}</text>
    ${traits}
    ${cartes}
  </svg>`;
}
