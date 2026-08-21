import { ENTITY_LEVELS, ENTITY_TYPES, type EntityType } from './hierarchy';
import type { Permission } from './permissions';

/**
 * Le registre des blocs de rapport — EF-RAP-02, EF-RAP-03.
 *
 * DECLARATIF, comme `KPI_REGISTRY`. Un type de bloc s'ajoute en ecrivant une
 * entree ici : l'editeur en tire sa palette, le moteur de generation sait quelle
 * source interroger, et le rendu sait quel composant poser. Rien de tout cela
 * n'a besoin d'etre rouvert.
 *
 * CE FICHIER NE CONTIENT AUCUN COMPOSANT ET AUCUNE REQUETE. Il decrit ce qu'un
 * bloc EST — sa source, son habilitation, sa largeur — pas comment il se rend
 * ni comment il se remplit. C'est ce qui lui permet de traverser la frontiere
 * serveur -> client (regle 24) et d'etre teste sans base ni navigateur.
 */

// ---------------------------------------------------------------------------
// Les sources de donnees — EF-RAP-03
// ---------------------------------------------------------------------------

export const SOURCES = [
  'CROYANTS',
  'ENTITES',
  'BUREAUX',
  'FINANCES',
  'TRANSFERTS',
  'BAPTEMES',
] as const;
export type SourceRapport = (typeof SOURCES)[number];

export const LIBELLES_SOURCE: Record<SourceRapport, string> = {
  CROYANTS: 'Croyants',
  ENTITES: 'Entités',
  BUREAUX: 'Bureaux',
  FINANCES: 'Finances',
  TRANSFERTS: 'Transferts',
  BAPTEMES: 'Baptêmes',
};

/**
 * L'habilitation qu'une source EXIGE — RG-26.
 *
 * Elle est portee par la SOURCE et non par le type de bloc : un tableau de
 * finances et une courbe de finances demandent le meme droit, et le declarer
 * deux fois les ferait diverger le jour ou l'un des deux change.
 */
export const PERMISSION_SOURCE: Record<SourceRapport, Permission> = {
  CROYANTS: 'croyant.read',
  ENTITES: 'entity.read',
  BUREAUX: 'bureau.read',
  FINANCES: 'finance.read',
  TRANSFERTS: 'croyant.read',
  BAPTEMES: 'croyant.read',
};

// ---------------------------------------------------------------------------
// Les types de blocs — EF-RAP-02
// ---------------------------------------------------------------------------

export const TYPES_BLOC = [
  'TITRE',
  'TEXTE',
  'INDICATEUR',
  'TABLEAU',
  'GRAPHIQUE',
  'JAUGE',
  'FRISE',
  'ORGANIGRAMME',
  'IMAGE',
  'SAUT_DE_PAGE',
  'SIGNATURE',
] as const;
export type TypeBloc = (typeof TYPES_BLOC)[number];

/**
 * La largeur d'un bloc sur la grille d'une section — EF-RAP-04.
 *
 * TROIS VALEURS, ET PAS DAVANTAGE. Une grille libre en douziemes laisserait
 * composer des rangees qui ne bouclent pas, et le rendu A4 devrait alors
 * inventer ce qu'il en fait. Pleine, demie, tiers : trois largeurs qui se
 * combinent toujours en rangees pleines.
 */
export const LARGEURS_BLOC = ['PLEINE', 'DEMI', 'TIERS'] as const;
export type LargeurBloc = (typeof LARGEURS_BLOC)[number];

export const FRACTION_LARGEUR: Record<LargeurBloc, number> = {
  PLEINE: 1,
  DEMI: 1 / 2,
  TIERS: 1 / 3,
};

/**
 * Les trois familles de la palette — EF-RAP-01.
 *
 * Onze entrees d'affilee se parcourent mal : on cherche « le titre » dans une
 * liste ou il voisine avec « organigramme ». Les familles repondent a la
 * question qu'on se pose en composant — j'ecris, je montre des donnees, ou je
 * mets en page.
 */
export const GROUPES_BLOC = ['CONTENU', 'DONNEES', 'MISE_EN_PAGE'] as const;
export type GroupeBloc = (typeof GROUPES_BLOC)[number];

export const LIBELLES_GROUPE_BLOC: Record<GroupeBloc, string> = {
  CONTENU: 'Contenu',
  DONNEES: 'Données',
  MISE_EN_PAGE: 'Mise en page',
};

export interface DefinitionBloc {
  readonly type: TypeBloc;
  readonly libelle: string;
  readonly description: string;
  readonly groupe: GroupeBloc;
  /**
   * `null` pour un bloc de MISE EN PAGE — titre, texte, image, saut de page,
   * signature. Il n'interroge rien, donc aucune habilitation ne le conditionne
   * et RG-26 ne l'omet jamais : un rapport dont le titre disparaitrait faute de
   * droit serait illisible pour une raison qui n'a rien a voir avec lui.
   */
  readonly source: SourceRapport | null;
  readonly largeurParDefaut: LargeurBloc;
  /** Un bloc qui ne peut pas partager sa rangee — le saut de page, la frise. */
  readonly toujoursPleine?: boolean;
}

export const BLOCS_RAPPORT: readonly DefinitionBloc[] = [
  {
    type: 'TITRE',
    libelle: 'Titre',
    description: 'Un intertitre pour ouvrir une section.',
    groupe: 'CONTENU',
    source: null,
    largeurParDefaut: 'PLEINE',
    toujoursPleine: true,
  },
  {
    type: 'TEXTE',
    libelle: 'Paragraphe',
    description: 'Du texte libre, avec des champs dynamiques insérables.',
    groupe: 'CONTENU',
    source: null,
    largeurParDefaut: 'PLEINE',
  },
  {
    type: 'INDICATEUR',
    libelle: 'Indicateur',
    description: 'Une carte à un chiffre — effectif, montant, part.',
    groupe: 'DONNEES',
    source: 'CROYANTS',
    largeurParDefaut: 'TIERS',
  },
  {
    type: 'TABLEAU',
    libelle: 'Tableau',
    description: 'Une liste de lignes, filtrée et ordonnée.',
    groupe: 'DONNEES',
    source: 'CROYANTS',
    largeurParDefaut: 'PLEINE',
  },
  {
    type: 'GRAPHIQUE',
    libelle: 'Graphique',
    description: 'Courbe, barres ou camembert sur une période.',
    groupe: 'DONNEES',
    source: 'FINANCES',
    largeurParDefaut: 'DEMI',
  },
  {
    type: 'JAUGE',
    libelle: 'Jauge',
    description: 'Une couverture, un taux — ce qui est atteint sur ce qui est visé.',
    groupe: 'DONNEES',
    source: 'BUREAUX',
    largeurParDefaut: 'TIERS',
  },
  {
    type: 'FRISE',
    libelle: 'Frise chronologique',
    description: 'Les événements d’une période, dans l’ordre.',
    groupe: 'DONNEES',
    source: 'TRANSFERTS',
    largeurParDefaut: 'PLEINE',
    toujoursPleine: true,
  },
  {
    type: 'ORGANIGRAMME',
    libelle: 'Organigramme',
    description: 'La structure d’une entité, ou la composition d’un bureau.',
    groupe: 'DONNEES',
    source: 'BUREAUX',
    largeurParDefaut: 'PLEINE',
    toujoursPleine: true,
  },
  {
    type: 'IMAGE',
    libelle: 'Image',
    description: 'Un logo, une photographie.',
    groupe: 'CONTENU',
    source: null,
    largeurParDefaut: 'DEMI',
  },
  {
    type: 'SAUT_DE_PAGE',
    libelle: 'Saut de page',
    description: 'Ce qui suit commence sur une nouvelle feuille.',
    groupe: 'MISE_EN_PAGE',
    source: null,
    largeurParDefaut: 'PLEINE',
    toujoursPleine: true,
  },
  {
    type: 'SIGNATURE',
    libelle: 'Bloc de signature',
    description: 'Un cadre nommé, à signer à la main.',
    groupe: 'MISE_EN_PAGE',
    source: null,
    largeurParDefaut: 'DEMI',
  },
];

export function definitionBloc(type: string): DefinitionBloc | null {
  return BLOCS_RAPPORT.find((b) => b.type === type) ?? null;
}

export function blocsDuGroupe(groupe: GroupeBloc): readonly DefinitionBloc[] {
  return BLOCS_RAPPORT.filter((b) => b.groupe === groupe);
}

// ---------------------------------------------------------------------------
// La structure d'un modele
// ---------------------------------------------------------------------------

export interface BlocRapport {
  readonly id: string;
  readonly type: TypeBloc;
  readonly largeur: LargeurBloc;
  /** Titre du bloc, texte libre, filtres… — propre a chaque type. */
  readonly reglages: Readonly<Record<string, unknown>>;
}

export interface SectionRapport {
  readonly id: string;
  readonly titre: string;
  readonly blocs: readonly BlocRapport[];
}

/**
 * EF-RAP-06 — l'en-tete et le pied de page.
 *
 * TOUT Y EST FACULTATIF, et l'absence vaut « comme d'habitude » : une structure
 * ecrite avant cette version n'a aucun de ces champs, et doit continuer a rendre
 * un en-tete correct. C'est pourquoi les booleens se lisent `!== false` et non
 * `=== true` — un champ absent AFFICHE, il ne masque pas.
 */
export interface EnteteDocument {
  readonly avecLogo?: boolean;
  readonly avecEntite?: boolean;
  readonly avecPeriode?: boolean;
  /** Le titre du rapport. Vide : le nom du modele sert de titre. */
  readonly titre?: string;
  readonly sousTitre?: string;
}

export interface PiedDocument {
  readonly avecNumerotation?: boolean;
  readonly mentionConfidentialite?: string;
  /** Texte libre, a gauche du numero de page. */
  readonly texte?: string;
}

export interface StructureRapport {
  readonly sections: readonly SectionRapport[];
  readonly entete?: EnteteDocument;
  readonly pied?: PiedDocument;
  /** EF-RAP-05 — la marge du papier, en millimetres. */
  readonly marge?: number;
}

/**
 * LA MARGE DU PAPIER — EF-RAP-05.
 *
 * Elle etait figee a 16 mm dans la feuille de style, ce qui rendait l'apercu
 * MENTEUR des qu'on voulait autre chose : on composait sur une zone utile de
 * 178 mm, on imprimait sur une autre, et le tableau qui tenait tout juste
 * passait a la ligne. Un apercu qui n'engage pas l'impression ne sert a rien.
 *
 * 16 mm par defaut — l'ancienne valeur, pour que rien ne bouge sous les modeles
 * deja composes.
 *
 * LES BORNES INTERDISENT L'IMPOSSIBLE, PAS L'INHABITUEL (regle 26). Sous 5 mm,
 * la plupart des imprimantes de bureau rognent : le texte sort coupe sans que
 * rien ne l'ait annonce. Au-dela de 30 mm, la zone utile tombe sous 150 mm et
 * un tableau a quatre colonnes cesse de tenir — c'est large, mais ce n'est plus
 * faux, alors on laisse.
 */
export const MARGE_DEFAUT_MM = 16;
export const MARGE_MIN_MM = 5;
export const MARGE_MAX_MM = 30;

export function margeDocument(structure: StructureRapport): number {
  const declaree = structure.marge;
  if (typeof declaree !== 'number' || !Number.isFinite(declaree)) return MARGE_DEFAUT_MM;
  // Une valeur hors bornes vient d'une version anterieure ou d'un appel direct
  // a l'API : on la ramene plutot que de rendre une feuille inimprimable.
  return Math.min(MARGE_MAX_MM, Math.max(MARGE_MIN_MM, Math.round(declaree)));
}

/**
 * Un champ d'en-tete ou de pied est-il actif ?
 *
 * `!== false` et non `=== true` : une structure composee avant que le champ
 * n'existe ne le porte pas, et doit continuer a l'afficher. Lire `=== true`
 * ferait disparaitre le logo de tous les modeles existants le jour de la mise
 * a jour, sans que personne n'ait rien decide.
 */
export function afficheChamp(valeur: boolean | undefined): boolean {
  return valeur !== false;
}

export const STRUCTURE_VIDE: StructureRapport = { sections: [] };

// ---------------------------------------------------------------------------
// EF-RAP-03 — la source d'un bloc
// ---------------------------------------------------------------------------

/**
 * Ou ce bloc-la puise ses donnees.
 *
 * LE TYPE DONNE LA SOURCE PAR DEFAUT, LE BLOC PEUT EN CHANGER. Sans cela,
 * « Tableau » ne signifierait jamais qu'un tableau de croyants, et un rapport
 * financier n'aurait aucun moyen d'en presenter un — alors qu'EF-RAP-03 demande
 * que chaque bloc de donnees puise dans les sources de l'application.
 *
 * UN BLOC DE MISE EN PAGE N'A PAS DE SOURCE, quoi qu'en disent ses reglages.
 * Un titre qui se declarerait « FINANCES » se ferait omettre par RG-26 chez qui
 * n'a pas `finance.read` — un intertitre disparu pour une raison qui n'a rien a
 * voir avec lui.
 */
// ---------------------------------------------------------------------------
// EF-RAP-02 — les formes d'un graphique
// ---------------------------------------------------------------------------

/**
 * SIX FORMES, ET CHACUNE REPOND A UNE QUESTION DIFFERENTE.
 *
 * Ce n'est pas un choix d'apparence. « Dans quel sens allons-nous ? » se repond
 * par une pente — une ligne ou une aire. « Qui pese le plus ? » se repond par
 * des longueurs comparees — des barres. « Quelle part du tout ? » est la seule
 * question qu'un camembert sache poser, et il ne sait poser qu'elle.
 *
 * Les barres HORIZONTALES ne sont pas une variante decorative des verticales :
 * elles seules laissent lire un libelle long a cote de sa barre, ce qui les
 * rend obligatoires des qu'on classe des noms d'entites (meme raisonnement
 * qu'EF-DSH-05).
 */
export const TYPES_GRAPHIQUE = [
  'BARRES',
  'BARRES_HORIZONTALES',
  'LIGNE',
  'AIRE',
  'CAMEMBERT',
  'ANNEAU',
] as const;
export type TypeGraphique = (typeof TYPES_GRAPHIQUE)[number];

export const LIBELLES_GRAPHIQUE: Record<TypeGraphique, string> = {
  BARRES: 'Barres verticales',
  BARRES_HORIZONTALES: 'Barres horizontales',
  LIGNE: 'Courbe',
  AIRE: 'Aire',
  CAMEMBERT: 'Camembert',
  ANNEAU: 'Anneau',
};

/** Ce a quoi chaque forme sert — dit du point de vue de la question posee. */
export const USAGES_GRAPHIQUE: Record<TypeGraphique, string> = {
  BARRES: 'Comparer des valeurs mois par mois.',
  BARRES_HORIZONTALES: 'Classer des entités — le libellé se lit à côté de sa barre.',
  LIGNE: 'Montrer un sens : dans quelle direction allons-nous ?',
  AIRE: 'Un sens, avec le volume accumulé sous la courbe.',
  CAMEMBERT: 'La part de chacun dans un tout.',
  ANNEAU: 'La part de chacun, avec un total au centre.',
};

export const TYPE_GRAPHIQUE_PAR_DEFAUT: TypeGraphique = 'BARRES';

/** La forme choisie pour ce bloc, ou celle par defaut. */
export function typeGraphique(bloc: BlocRapport): TypeGraphique {
  const declare = bloc.reglages.graphique;
  return (TYPES_GRAPHIQUE as readonly unknown[]).includes(declare)
    ? (declare as TypeGraphique)
    : TYPE_GRAPHIQUE_PAR_DEFAUT;
}

export function sourceDuBloc(bloc: BlocRapport): SourceRapport | null {
  const definition = definitionBloc(bloc.type);
  if (!definition || definition.source === null) return null;

  const declaree = bloc.reglages.source;
  return (SOURCES as readonly unknown[]).includes(declaree)
    ? (declaree as SourceRapport)
    : definition.source;
}

/**
 * La largeur reellement admise pour ce type — EF-RAP-04.
 *
 * Un saut de page en tiers de colonne n'a pas de sens, une frise non plus : ils
 * se declarent `toujoursPleine`, et la contrainte est appliquee ICI plutot que
 * par l'ecran. Une structure ecrite par un appel direct a l'API, ou par une
 * version anterieure, passe par la meme porte.
 *
 * IDEMPOTENT : la sortie repassee en entree ne bouge plus (regle 12).
 */
export function largeurEffective(type: string, largeur: LargeurBloc): LargeurBloc {
  const definition = definitionBloc(type);
  if (!definition) return largeur;
  return definition.toujoursPleine ? 'PLEINE' : largeur;
}

// ---------------------------------------------------------------------------
// EF-RAP-01, EF-RAP-04 — composer : les operations sur une structure
// ---------------------------------------------------------------------------

/**
 * TOUTES PURES, TOUTES DANS LE DOMAINE.
 *
 * L'editeur ne fait qu'appeler celles-ci et rendre le resultat : deplacer un
 * bloc, c'est reecrire un tableau, pas manipuler un DOM. Ecrites dans le
 * composant, elles ne seraient testables qu'a travers un rendu — et ce sont
 * pourtant elles qui decident de ce qui part en base.
 */

function identifiant(prefixe: string): string {
  // `randomUUID` existe cote navigateur comme cote Node : l'editeur cree les
  // identifiants, le serveur les revalide sans jamais les reecrire — un bloc
  // renumerote a l'enregistrement perdrait la selection en cours.
  return `${prefixe}_${globalThis.crypto.randomUUID().slice(0, 8)}`;
}

export function nouveauBloc(type: TypeBloc): BlocRapport {
  const definition = definitionBloc(type);
  return {
    id: identifiant('b'),
    type,
    largeur: largeurEffective(type, definition?.largeurParDefaut ?? 'PLEINE'),
    reglages: {},
  };
}

export function nouvelleSection(titre = ''): SectionRapport {
  return { id: identifiant('s'), titre, blocs: [] };
}

/** Remplace une section par le resultat de `modif`, les autres intactes. */
function surSection(
  structure: StructureRapport,
  sectionId: string,
  modif: (section: SectionRapport) => SectionRapport,
): StructureRapport {
  return {
    ...structure,
    sections: structure.sections.map((s) => (s.id === sectionId ? modif(s) : s)),
  };
}

export function ajouterSection(structure: StructureRapport, titre = ''): StructureRapport {
  return { ...structure, sections: [...structure.sections, nouvelleSection(titre)] };
}

export function retirerSection(
  structure: StructureRapport,
  sectionId: string,
): StructureRapport {
  return { ...structure, sections: structure.sections.filter((s) => s.id !== sectionId) };
}

export function renommerSection(
  structure: StructureRapport,
  sectionId: string,
  titre: string,
): StructureRapport {
  return surSection(structure, sectionId, (s) => ({ ...s, titre }));
}

/**
 * Deplace une section d'un rang. `pas` vaut -1 ou +1.
 *
 * AU BORD, RIEN NE BOUGE — et surtout rien ne s'enroule. Une section qui
 * repasserait en tete depuis la fin donnerait un document reorganise par
 * surprise, sur un clic qu'on croyait sans effet.
 */
export function deplacerSection(
  structure: StructureRapport,
  sectionId: string,
  pas: -1 | 1,
): StructureRapport {
  const index = structure.sections.findIndex((s) => s.id === sectionId);
  const cible = index + pas;
  if (index === -1 || cible < 0 || cible >= structure.sections.length) return structure;

  const sections = [...structure.sections];
  [sections[index], sections[cible]] = [sections[cible]!, sections[index]!];
  return { ...structure, sections };
}

export function ajouterBloc(
  structure: StructureRapport,
  sectionId: string,
  type: TypeBloc,
  /** Rang d'insertion ; a la fin par defaut. */
  rang?: number,
): StructureRapport {
  const bloc = nouveauBloc(type);

  return surSection(structure, sectionId, (s) => {
    const blocs = [...s.blocs];
    blocs.splice(rang ?? blocs.length, 0, bloc);
    return { ...s, blocs };
  });
}

export function retirerBloc(structure: StructureRapport, blocId: string): StructureRapport {
  return {
    ...structure,
    sections: structure.sections.map((s) => ({
      ...s,
      blocs: s.blocs.filter((b) => b.id !== blocId),
    })),
  };
}

/** Change la largeur d'un bloc — la contrainte du type s'applique (EF-RAP-04). */
export function reglerLargeur(
  structure: StructureRapport,
  blocId: string,
  largeur: LargeurBloc,
): StructureRapport {
  return {
    ...structure,
    sections: structure.sections.map((s) => ({
      ...s,
      blocs: s.blocs.map((b) =>
        b.id === blocId ? { ...b, largeur: largeurEffective(b.type, largeur) } : b,
      ),
    })),
  };
}

/**
 * Fusionne des reglages dans un bloc.
 *
 * FUSION ET NON REMPLACEMENT : le panneau de reglages ne connait qu'une partie
 * des cles — celles du type courant. Ecraser l'objet entier effacerait ce
 * qu'une version ulterieure y aura pose, sans qu'aucun message ne le dise
 * (meme piege que la regle 19, un cran plus bas).
 *
 * Une valeur `undefined` RETIRE la cle : c'est ainsi qu'un reglage se remet a
 * son defaut, sans avoir a inventer une valeur « vide » par type.
 */
export function reglerBloc(
  structure: StructureRapport,
  blocId: string,
  reglages: Readonly<Record<string, unknown>>,
): StructureRapport {
  return {
    ...structure,
    sections: structure.sections.map((s) => ({
      ...s,
      blocs: s.blocs.map((b) => {
        if (b.id !== blocId) return b;

        const fusion: Record<string, unknown> = { ...b.reglages };
        for (const [cle, valeur] of Object.entries(reglages)) {
          if (valeur === undefined) delete fusion[cle];
          else fusion[cle] = valeur;
        }
        return { ...b, reglages: fusion };
      }),
    })),
  };
}

/**
 * Deplace un bloc — dans sa section, ou vers une autre.
 *
 * UNE SEULE FONCTION POUR LES DEUX. Deux chemins separes divergeraient sur le
 * cas limite qui les distingue a peine : reposer un bloc apres lui-meme dans sa
 * propre section. Ici, on le retire puis on l'insere, et le rang vise se
 * recalcule APRES le retrait — sans quoi deplacer un bloc vers la droite le
 * poserait systematiquement un cran trop loin.
 */
export function deplacerBloc(
  structure: StructureRapport,
  blocId: string,
  versSectionId: string,
  /** Rang visé dans la section d'arrivée, avant retrait du bloc déplacé. */
  versRang: number,
): StructureRapport {
  const origine = structure.sections.find((s) => s.blocs.some((b) => b.id === blocId));
  const bloc = origine?.blocs.find((b) => b.id === blocId);
  if (!origine || !bloc) return structure;

  const memeSection = origine.id === versSectionId;
  const rangActuel = origine.blocs.findIndex((b) => b.id === blocId);
  const rang = memeSection && rangActuel < versRang ? versRang - 1 : versRang;

  return {
    ...structure,
    sections: structure.sections.map((s) => {
      const sansLeBloc = s.blocs.filter((b) => b.id !== blocId);
      if (s.id !== versSectionId) return { ...s, blocs: sansLeBloc };

      const blocs = [...sansLeBloc];
      blocs.splice(Math.max(0, Math.min(rang, blocs.length)), 0, bloc);
      return { ...s, blocs };
    }),
  };
}

/**
 * Deplace un bloc d'UN rang dans sa section. `pas` vaut -1 ou +1.
 *
 * LE GLISSER NE SUFFIT PAS. Poser un bloc a la souris demande de viser, et une
 * grille a six colonnes n'offre pas toujours de cible evidente entre deux
 * rangees — sans compter qu'un ecran tactile ou un clavier n'ont pas de
 * glisser du tout (ENF-ACC). Deux fleches font le meme travail, exactement,
 * et sans viser.
 *
 * AU BORD, RIEN NE BOUGE — jamais d'enroulement, comme pour les sections : un
 * bloc qui repasserait en tete depuis la fin reorganiserait le document sur un
 * clic qu'on croyait sans effet.
 */
export function deplacerBlocDUnRang(
  structure: StructureRapport,
  blocId: string,
  pas: -1 | 1,
): StructureRapport {
  const section = structure.sections.find((s) => s.blocs.some((b) => b.id === blocId));
  if (!section) return structure;

  const index = section.blocs.findIndex((b) => b.id === blocId);
  const cible = index + pas;
  if (cible < 0 || cible >= section.blocs.length) return structure;

  const blocs = [...section.blocs];
  [blocs[index], blocs[cible]] = [blocs[cible]!, blocs[index]!];

  return {
    ...structure,
    sections: structure.sections.map((s) => (s.id === section.id ? { ...s, blocs } : s)),
  };
}

/**
 * Repartit les sections en FEUILLES, aux sauts de page demandes — EF-RAP-05.
 *
 * Le bloc SAUT_DE_PAGE ne se rend pas : il EST la coupure. Le rendre comme un
 * cadre vide laisserait un blanc en bas de page, qu'on prendrait pour un defaut
 * de mise en page.
 *
 * UNE SECTION COUPEE NE DEVIENT PAS DEUX SECTIONS : son titre reste sur le
 * premier morceau. Repete en tete de la feuille suivante, il ferait croire a un
 * second chapitre du meme nom.
 *
 * ON NE DECOUPE QUE CE QUI EST CERTAIN. Annoncer « page 3 sur 7 » demanderait
 * de MESURER le contenu rendu, ce qu'aucun calcul ne sait faire avant que le
 * navigateur n'ait compose le texte : un compte de pages calcule ici serait
 * faux des le premier paragraphe un peu long. Les coupures VOULUES sont sures ;
 * le reste, l'impression le repartit.
 */
export function decouperEnFeuilles(
  sections: readonly SectionRapport[],
): readonly (readonly SectionRapport[])[] {
  const feuilles: SectionRapport[][] = [[]];

  for (const section of sections) {
    const morceaux: BlocRapport[][] = [[]];
    for (const bloc of section.blocs) {
      if (bloc.type === 'SAUT_DE_PAGE') morceaux.push([]);
      else morceaux[morceaux.length - 1]!.push(bloc);
    }

    morceaux.forEach((blocs, i) => {
      if (i > 0) feuilles.push([]);
      feuilles[feuilles.length - 1]!.push({
        ...section,
        titre: i === 0 ? section.titre : '',
        blocs,
      });
    });
  }

  return feuilles.filter((f) => f.some((s) => s.blocs.length > 0 || s.titre));
}

/** Le bloc designe, ou `null` — l'editeur en a besoin a chaque rendu. */
export function trouverBloc(
  structure: StructureRapport,
  blocId: string | null,
): BlocRapport | null {
  if (!blocId) return null;
  for (const section of structure.sections) {
    const bloc = section.blocs.find((b) => b.id === blocId);
    if (bloc) return bloc;
  }
  return null;
}

/**
 * Une structure lue en base en est-elle vraiment une ?
 *
 * `structure` est du `jsonb` que rien ne contraint : elle a pu etre ecrite par
 * une version anterieure du produit, ou a la main par un appel direct a l'API.
 * Une valeur inattendue traversant vers le client ferait echouer la page
 * ENTIERE (regle 24) — et un editeur blanc pour un modele abime serait une
 * panne sans cause visible.
 *
 * On verifie la FORME, pas le detail des reglages : ceux-ci sont propres a
 * chaque type de bloc, et les valider ici obligerait a rouvrir ce fichier a
 * chaque nouveau reglage.
 */
export function estStructure(valeur: unknown): valeur is StructureRapport {
  if (typeof valeur !== 'object' || valeur === null) return false;
  const v = valeur as Record<string, unknown>;
  if (!Array.isArray(v.sections)) return false;

  return v.sections.every((section) => {
    if (typeof section !== 'object' || section === null) return false;
    const s = section as Record<string, unknown>;
    if (typeof s.id !== 'string' || typeof s.titre !== 'string') return false;
    if (!Array.isArray(s.blocs)) return false;

    return s.blocs.every((bloc) => {
      if (typeof bloc !== 'object' || bloc === null) return false;
      const b = bloc as Record<string, unknown>;
      return (
        typeof b.id === 'string' &&
        (TYPES_BLOC as readonly string[]).includes(b.type as string) &&
        (LARGEURS_BLOC as readonly string[]).includes(b.largeur as string)
      );
    });
  });
}

// ---------------------------------------------------------------------------
// EF-RAP-15 — ce qu'un bloc CONTIENT une fois resolu
// ---------------------------------------------------------------------------

/**
 * LE MEME TYPE POUR L'EXEMPLE ET POUR LE REEL, et c'est tout l'interet.
 *
 * L'apercu de composition rend des donnees simulees, le rapport genere rend des
 * donnees figees : si les deux ne parlaient pas la meme forme, il faudrait deux
 * rendus — et celui qu'on regarde le moins finirait par diverger de l'autre
 * (regle 16). Ici, `RenduRapport` ne sait meme pas lequel il affiche.
 *
 * C'est aussi ce qui part en base dans `report_instances.contenu` : un objet
 * simple, sans fonction ni classe, donc serialisable en `jsonb` et capable de
 * traverser la frontiere serveur -> client (regle 24).
 */
export type ContenuBloc =
  | { readonly genre: 'INDICATEUR'; readonly valeur: string; readonly legende: string }
  | {
      readonly genre: 'TABLEAU';
      readonly colonnes: readonly string[];
      readonly lignes: readonly (readonly string[])[];
    }
  | {
      readonly genre: 'SERIE';
      readonly libelles: readonly string[];
      readonly valeurs: readonly number[];
      readonly legende: string;
    }
  | {
      readonly genre: 'JAUGE';
      readonly atteint: number;
      readonly total: number;
      readonly legende: string;
    }
  | {
      readonly genre: 'FRISE';
      readonly evenements: readonly { readonly date: string; readonly texte: string }[];
    }
  | {
      readonly genre: 'ARBRE';
      readonly racine: string;
      readonly enfants: readonly string[];
    };

/** Le contenu FIGE d'un rapport : un genre par bloc, indexe par identifiant. */
export type ContenuRapport = Record<string, ContenuBloc>;

// ---------------------------------------------------------------------------
// RG-26 — l'omission des blocs non habilites
// ---------------------------------------------------------------------------

export interface BlocOmis {
  readonly blocId: string;
  readonly type: TypeBloc;
  readonly motif: string;
}

export interface ResolutionStructure {
  readonly sections: readonly SectionRapport[];
  readonly omis: readonly BlocOmis[];
}

/**
 * Retire d'une structure les blocs dont l'habilitation manque — RG-26.
 *
 * LES BLOCS SONT OMIS, PAS VIDES. Un tableau de finances rendu vide a qui n'a
 * pas `finance.read` afficherait « aucun mouvement » — ce qui est faux, et se
 * lit comme une information. L'omission, elle, se TRACE et se mentionne en pied
 * de page : le lecteur sait que le document est incomplet, et pourquoi.
 *
 * UNE SECTION QUI PERD TOUS SES BLOCS DISPARAIT. Un intertitre « Finances »
 * suivi de rien apprendrait qu'il existe des finances, ce que l'omission vise
 * precisement a taire — et laisserait un blanc qu'on prendrait pour un defaut
 * de mise en page.
 *
 * LES BLOCS DE MISE EN PAGE NE S'OMETTENT JAMAIS : ils n'interrogent rien.
 */
export function resoudreStructure(
  structure: StructureRapport,
  detient: (permission: Permission) => boolean,
): ResolutionStructure {
  const omis: BlocOmis[] = [];

  const sections = structure.sections
    .map((section) => ({
      ...section,
      blocs: section.blocs.filter((bloc) => {
        const definition = definitionBloc(bloc.type);
        // Un type inconnu vient d'une version anterieure : on l'ecarte en le
        // disant, plutot que de tenter un rendu qu'on ne sait pas faire.
        if (!definition) {
          omis.push({
            blocId: bloc.id,
            type: bloc.type,
            motif: 'Type de bloc inconnu de cette version.',
          });
          return false;
        }

        /**
         * La source du BLOC, pas celle de son type — EF-RAP-03.
         *
         * Un tableau peut puiser dans les finances ; l'habilitation exigee est
         * alors `finance.read`, pas `croyant.read`. Lire la source du type
         * omettrait le bon bloc pour le mauvais motif — ou, plus grave, le
         * laisserait passer.
         */
        const source = sourceDuBloc(bloc);
        if (source === null) return true;

        const requise = PERMISSION_SOURCE[source];
        if (detient(requise)) return true;

        omis.push({
          blocId: bloc.id,
          type: bloc.type,
          motif: `${LIBELLES_SOURCE[source]} — habilitation non détenue.`,
        });
        return false;
      }),
    }))
    .filter((section) => section.blocs.length > 0);

  return { sections, omis };
}

/**
 * La mention portee en pied de page — RG-26.
 *
 * ELLE COMPTE, ELLE N'ENUMERE PAS. Lister les blocs manquants apprendrait
 * exactement ce que l'omission cache : « tableau des recettes » dit qu'il y a
 * des recettes. Le nombre suffit a signaler que le document est incomplet.
 */
export function mentionOmissions(omis: readonly BlocOmis[]): string | null {
  if (omis.length === 0) return null;

  return omis.length === 1
    ? 'Un bloc a été omis : votre habilitation ne couvre pas sa source de données.'
    : `${omis.length} blocs ont été omis : votre habilitation ne couvre pas leurs sources de données.`;
}

// ---------------------------------------------------------------------------
// EF-RAP-09 — jusqu'ou un modele se voit
// ---------------------------------------------------------------------------

export const VISIBILITES = ['PRIVE', 'ENTITE', 'DESCENDANTS', 'GLOBAL'] as const;
export type VisibiliteModele = (typeof VISIBILITES)[number];

export const LIBELLES_VISIBILITE: Record<VisibiliteModele, string> = {
  PRIVE: 'Moi seul',
  ENTITE: 'Mon entite',
  DESCENDANTS: 'Mon entite et ses filles',
  GLOBAL: "Toute l'organisation",
};

/**
 * Ce que chaque portee CHANGE, dit du point de vue de qui choisit.
 *
 * Enoncer « visibilite : DESCENDANTS » ne renseigne personne : ce qui se decide
 * ici, c'est QUI ouvrira ce modele demain.
 */
export const DESCRIPTIONS_VISIBILITE: Record<VisibiliteModele, string> = {
  PRIVE: 'Un brouillon. Personne d’autre ne le voit, pas meme vos collegues.',
  ENTITE: 'Les comptes rattaches a l’entite proprietaire.',
  DESCENDANTS: 'L’entite et tout son sous-arbre — un modele de district sert ses eglises.',
  GLOBAL: 'Toutes les entites, quel que soit leur rattachement.',
};

export function estVisibilite(valeur: unknown): valeur is VisibiliteModele {
  return (VISIBILITES as readonly unknown[]).includes(valeur);
}

/**
 * Les portees qui debordent l'entite proprietaire — EF-RAP-08.
 *
 * `GLOBAL` rend un modele lisible par TOUTE l'organisation : c'est la portee du
 * Siege, pas celle d'une paroisse. La RLS ne peut pas s'en charger seule — elle
 * autorise l'ecriture des lors qu'on gere les modeles de l'entite proprietaire,
 * et une paroisse qui gere les siens pourrait donc s'annoncer a tous. Le refus
 * appartient a l'action, qui evalue `report.template.manage` AVEC la portee du
 * Siege (regle 3).
 *
 * Un modele OFFICIEL va plus loin encore : il n'appartient a aucune entite et se
 * propose comme une trame de l'organisation. Meme regle, meme portee.
 */
export function porteeReserveeAuSiege(
  visibilite: VisibiliteModele,
  estOfficiel: boolean,
): boolean {
  return estOfficiel || visibilite === 'GLOBAL';
}

/**
 * LES NIVEAUX AUXQUELS UNE ENTITE PEUT PROPOSER SON MODELE — EF-RAP-10.
 *
 * LE DEFAUT CORRIGE (signale le 20 aout 2026). L'ecran offrait les SIX niveaux
 * a tout le monde : un district cochait « Siege » et « Regional », et son
 * modele s'annoncait a des entites qui ne sont pas dans son perimetre.
 *
 * C'est la meme regle que le lot 6 avait deja tranchee — « une entite ne
 * compose que pour elle-meme » — qui fuyait par une autre porte. L'entite
 * PROPRIETAIRE ne se choisissait pas, donc elle ne pouvait pas se refuser ;
 * mais l'ETENDUE, elle, se choisissait librement.
 *
 * CE QU'ON AUTORISE : son propre niveau, et ceux qui sont EN DESSOUS. Un
 * district compose pour lui-meme et pour ses paroisses, ses eglises, ses
 * cellules — jamais pour le Siege, qui ne lui doit rien.
 *
 * LE SIEGE LES OBTIENT TOUS, non par exception mais par application : il est au
 * niveau 1, et tout est en dessous de lui.
 *
 * Un niveau INCONNU rend la liste vide plutot que complete : mieux vaut ne rien
 * proposer qu'ouvrir tout sur une valeur qu'on ne sait pas lire.
 */
export function niveauxProposables(
  niveauAuteur: EntityType | null | undefined,
): readonly EntityType[] {
  if (!niveauAuteur || !(niveauAuteur in ENTITY_LEVELS)) return [];

  const plancher = ENTITY_LEVELS[niveauAuteur];
  return ENTITY_TYPES.filter((t) => ENTITY_LEVELS[t] >= plancher);
}

/**
 * La liste de niveaux demandee est-elle tenable pour cet auteur ?
 *
 * `true` sur une liste VIDE, et ce n'est pas un oubli : ne cocher aucun niveau
 * signifie « a tous ceux que je peux atteindre », pas « a personne ». C'est deja
 * ce que l'ecran annonce, et la RLS borne de toute facon la lecture au
 * perimetre — ne rien restreindre n'ouvre donc rien de plus.
 */
export function niveauxTenables(
  niveaux: readonly EntityType[],
  niveauAuteur: EntityType | null | undefined,
): boolean {
  const permis = niveauxProposables(niveauAuteur);
  return niveaux.every((n) => permis.includes(n));
}

// ---------------------------------------------------------------------------
// EF-RAP-07 — l'organisation ouvre-t-elle la composition ?
// ---------------------------------------------------------------------------

/**
 * Cette personne peut-elle composer un modele pour son entite ?
 *
 * TROIS CONDITIONS, ET AUCUNE NE REMPLACE LES DEUX AUTRES.
 *
 *   1. `detientLeDroit` — `report.template.manage` AVEC la portee de sa propre
 *      entite (regle 3) ; l'appelant l'a deja evalue, le domaine ne connait pas
 *      les sessions.
 *   2. `compositionLibre` — le reglage d'organisation (migration 0045). Ferme,
 *      les entites se conforment aux modeles du Siege et a eux seuls.
 *   3. `estSiege` — LE SIEGE N'EST JAMAIS CONCERNE PAR SON PROPRE VERROU.
 *      Ferme, il ne pourrait plus poser la trame a laquelle les autres doivent
 *      se conformer : le reglage se retournerait contre ce qu'il sert, et
 *      personne ne pourrait le rouvrir en composant quoi que ce soit.
 *
 * DUPLIQUER, C'EST COMPOSER. Le duplicata est un nouveau modele qui appartient
 * a l'entite qui copie : l'autoriser quand la composition est fermee rendrait
 * le verrou decoratif, en une manipulation que personne ne songerait a
 * interdire.
 */
export function compositionAutorisee(options: {
  readonly detientLeDroit: boolean;
  readonly compositionLibre: boolean;
  readonly estSiege: boolean;
}): boolean {
  if (!options.detientLeDroit) return false;
  return options.estSiege || options.compositionLibre;
}

/**
 * Ce modele est-il EXPLOITABLE, la composition etant ce qu'elle est ?
 *
 * A distinguer de `compositionAutorisee`, qui dit si l'on peut en DESSINER un
 * nouveau. Ici la question est celle de l'usage : ce modele-la peut-il servir
 * a produire un rapport ?
 *
 * COMPOSITION FERMEE, UNE ENTITE N'EMPLOIE PAS LE MODELE D'UNE AUTRE.
 *
 * C'est le point qui donne son sens au verrou. Sans lui, une paroisse privee de
 * composition reprendrait le modele que son district partage a ses
 * descendants — et le fait de ne plus pouvoir en dessiner n'aurait plus aucune
 * consequence : la trame du Siege ne serait imposee que sur le papier.
 *
 * DEUX EXCEPTIONS, ET ELLES SONT LES BONNES :
 *
 *   · les modeles du SIEGE — c'est precisement ce qui est impose ;
 *   · les SIENS — fermer ne detruit rien. Ce qu'une entite a compose avant le
 *     verrou lui reste acquis, et redevient exploitable des qu'on lui rend
 *     l'habilitation. A defaut, c'est la trame du Siege qui s'applique.
 */
export function modeleExploitable(options: {
  readonly estOfficiel: boolean;
  /** Le modele appartient a l'entite de rattachement de l'utilisateur. */
  readonly estSien: boolean;
  readonly compositionLibre: boolean;
}): boolean {
  if (options.estOfficiel || options.estSien) return true;
  return options.compositionLibre;
}

// ---------------------------------------------------------------------------
// EF-RAP-11 — ce qu'on peut faire d'un modele
// ---------------------------------------------------------------------------

export interface CapacitesModele {
  readonly modifiable: boolean;
  readonly archivable: boolean;
  readonly duplicable: boolean;
  /** Pourquoi le modele ne se modifie pas. `null` quand il se modifie. */
  readonly motif: string | null;
}

/**
 * Ce qu'un utilisateur peut faire de CE modele.
 *
 * FONCTION PURE : elle recoit des booleens deja evalues, jamais une session.
 * L'habilitation se verifie AVEC SA PORTEE (regle 3) — sur l'entite
 * proprietaire pour modifier, sur la sienne pour dupliquer —, ce qui n'est pas
 * du ressort du domaine. Ce qui l'est, c'est la regle : trois refus differents,
 * et chacun se dit.
 *
 * UN MODELE ARCHIVE NE SE MODIFIE PAS. Il reste lisible — les rapports qu'il a
 * produits gardent leur filiation — mais le rouvrir a l'edition ferait
 * diverger ce qui est diffuse de ce qui l'a produit. On le desarchive d'abord :
 * un geste, donc une decision.
 *
 * UN MODELE OFFICIEL NE SE MODIFIE PAS NON PLUS, sauf par le Siege (EF-RAP-08).
 * C'est tout l'objet d'une trame officielle : chaque entite l'emploie telle
 * quelle, ou la DUPLIQUE pour l'adapter. Le duplicata lui appartient, et
 * l'original ne bouge pas sous les pieds des autres.
 */
export function capacitesModele(options: {
  readonly estArchive: boolean;
  readonly estOfficiel: boolean;
  /** `report.template.manage` sur l'entite PROPRIETAIRE du modele. */
  readonly peutGererLeModele: boolean;
  /** `report.template.manage` sur au moins une entite a soi — pour la copie. */
  readonly peutComposer: boolean;
}): CapacitesModele {
  const { estArchive, estOfficiel, peutGererLeModele, peutComposer } = options;

  // Dupliquer ne touche pas a l'original : un modele archive ou officiel se
  // copie parfaitement, et c'est meme la seule facon de repartir du second.
  const duplicable = peutComposer;

  if (!peutGererLeModele) {
    return {
      modifiable: false,
      archivable: false,
      duplicable,
      motif: estOfficiel
        ? 'Modele officiel : il s’emploie tel quel. Dupliquez-le pour l’adapter.'
        : 'Ce modele appartient a une autre entite.',
    };
  }

  if (estArchive) {
    return {
      modifiable: false,
      // Desarchiver EST une operation d'archivage : c'est le meme bouton.
      archivable: true,
      duplicable,
      motif: 'Modele archive. Desarchivez-le pour le reprendre.',
    };
  }

  return { modifiable: true, archivable: true, duplicable, motif: null };
}

/**
 * Les onglets de la bibliotheque — EF-RAP-08, EF-RAP-09.
 *
 * CETTE TABLE VIT DANS LE DOMAINE, ET C'EST UNE CORRECTION.
 *
 * Elle etait exportee depuis le composant client, que la page — un Server
 * Component — importait pour amorcer son etat depuis l'URL. Or un module
 * `'use client'` importe cote serveur ne rend pas ses valeurs : il rend des
 * REFERENCES, et `ONGLETS.includes` n'etait alors pas une fonction. L'ecran
 * tombait avant son premier rendu. Meme frontiere que la regle 24, dans
 * l'autre sens : ce qui doit etre lu des deux cotes se declare la ou aucun des
 * deux ne l'emporte.
 */
export const ONGLETS_BIBLIOTHEQUE = ['tous', 'miens', 'officiels', 'partages'] as const;
export type OngletBibliotheque = (typeof ONGLETS_BIBLIOTHEQUE)[number];

export function estOnglet(valeur: unknown): valeur is OngletBibliotheque {
  return (ONGLETS_BIBLIOTHEQUE as readonly unknown[]).includes(valeur);
}

/**
 * Dans quel onglet ce modele se range — et il ne s'en range QUE DANS UN.
 *
 * Un modele officiel que je gere depuis le Siege est *officiel*, pas
 * « officiel et mien » : compte deux fois, la somme des onglets depasserait la
 * bibliotheque et l'utilisateur chercherait le doublon. L'ordre de preseance
 * tranche une fois pour toutes.
 */
export function ongletDuModele(options: {
  readonly estOfficiel: boolean;
  /** Le modele appartient a l'entite de rattachement de l'utilisateur. */
  readonly estSien: boolean;
}): Exclude<OngletBibliotheque, 'tous'> {
  if (options.estOfficiel) return 'officiels';
  return options.estSien ? 'miens' : 'partages';
}

/**
 * Le nom d'un duplicata — EF-RAP-11.
 *
 * DEUX COPIES DU MEME MODELE NE PORTENT PAS LE MEME NOM. Rien en base ne
 * l'interdit, et c'est bien le probleme : trois lignes « Synthese trimestrielle
 * (copie) » dans une bibliotheque ne se distinguent que par leur date, qu'on ne
 * lit pas. Le suffixe se numerote donc a partir de ce qui existe DEJA.
 *
 * `existants` est la liste des noms visibles par l'utilisateur : la comparaison
 * ignore la casse et les espaces de bord, comme le ferait un lecteur.
 */
export function nomDuplique(nom: string, existants: readonly string[]): string {
  const pris = new Set(existants.map((n) => n.trim().toLocaleLowerCase('fr')));
  const base = nom.trim();

  // Une copie de copie ne s'appelle pas « X (copie) (copie) » : on repart du
  // nom d'origine et on renumerote.
  const origine = base.replace(/\s*\(copie(?: \d+)?\)$/iu, '').trim() || base;

  for (let rang = 1; rang < 100; rang += 1) {
    const candidat = rang === 1 ? `${origine} (copie)` : `${origine} (copie ${rang})`;
    if (!pris.has(candidat.toLocaleLowerCase('fr'))) return candidat;
  }

  // Cent copies : le nom cesse d'etre le probleme. On rend quelque chose de
  // valide plutot que de boucler.
  return `${origine} (copie ${Date.now()})`;
}

// ---------------------------------------------------------------------------
// Ce qu'un modele contient, dit en une ligne
// ---------------------------------------------------------------------------

export interface ResumeStructure {
  readonly nbSections: number;
  readonly nbBlocs: number;
  /** Les sources interrogees, sans doublon et dans l'ordre du registre. */
  readonly sources: readonly SourceRapport[];
}

/**
 * De quoi tenir dans une carte de liste.
 *
 * Les SOURCES plutot que les types de blocs : « Croyants, Finances » dit ce que
 * le rapport ira chercher — donc ce qu'il faudra etre habilite a lire (RG-26) —
 * la ou « 2 tableaux, 1 graphique » ne decrit qu'une mise en page.
 */
export function resumeStructure(structure: StructureRapport): ResumeStructure {
  const sources = new Set<SourceRapport>();
  let nbBlocs = 0;

  for (const section of structure.sections) {
    for (const bloc of section.blocs) {
      nbBlocs += 1;
      // La source du BLOC (EF-RAP-03) : la carte annonce ce que le rapport ira
      // vraiment chercher, pas ce que son type irait chercher par defaut.
      const source = sourceDuBloc(bloc);
      if (source) sources.add(source);
    }
  }

  return {
    nbSections: structure.sections.length,
    nbBlocs,
    // L'ordre du registre, et non celui de la rencontre : deux modeles au meme
    // contenu doivent se lire pareil.
    sources: SOURCES.filter((s) => sources.has(s)),
  };
}

// ---------------------------------------------------------------------------
// EF-RAP-10 — a quels niveaux un modele s'applique
// ---------------------------------------------------------------------------

/**
 * Ce modele se propose-t-il a cette entite ?
 *
 * Un modele « Synthese de district » n'a rien a faire dans la liste d'une
 * cellule de priere : il y produirait un document dont chaque bloc serait vide,
 * et l'utilisateur chercherait ce qu'il a mal fait.
 */
export function modeleSApplique(
  niveaux: readonly string[],
  typeEntite: string,
): boolean {
  // Une liste vide ne borne rien : c'est l'absence de restriction, pas une
  // restriction totale (regle 15 — une absence n'est pas un refus).
  return niveaux.length === 0 || niveaux.includes(typeEntite);
}

// ---------------------------------------------------------------------------
// Les filtres d'un bloc — EF-RAP-03
// ---------------------------------------------------------------------------

/**
 * CE QU'UN BLOC PEUT RESTREINDRE, source par source.
 *
 * LE BESOIN : un rapport de district veut « les baptemes des femmes » ou
 * « les depenses seulement ». Sans filtre, il fallait un bloc par cas et
 * l'omission des autres a la main — c'est-a-dire refaire le rapport.
 *
 * QUE DES ENSEMBLES CLOS ET CONNUS (regle 18). Sexe, sens, statut, niveau : on
 * les declare ici, et l'editeur les rend en menus. Un filtre par GRADE ou par
 * CATEGORIE serait ouvert — il demanderait de charger un referentiel dans
 * l'editeur, et surtout un modele fige le jour ou l'on renomme la categorie
 * qu'il designe. Ceux-la se feront quand le besoin sera nomme, pas avant.
 *
 * `null` OU ABSENT VEUT DIRE « TOUT », jamais « rien ». Un modele ecrit avant
 * cette version n'a aucun filtre, et doit continuer a rendre exactement ce
 * qu'il rendait.
 */
export interface OptionFiltre {
  readonly valeur: string;
  readonly label: string;
}

export interface DescriptionFiltre {
  readonly cle: string;
  readonly label: string;
  readonly options: readonly OptionFiltre[];
}

export const FILTRES_SOURCE: Record<SourceRapport, readonly DescriptionFiltre[]> = {
  CROYANTS: [
    {
      cle: 'sexe',
      label: 'Sexe',
      options: [
        { valeur: 'M', label: 'Hommes' },
        { valeur: 'F', label: 'Femmes' },
      ],
    },
    {
      cle: 'statut',
      label: 'Statut',
      options: [
        { valeur: 'ACTIF', label: 'Actifs' },
        { valeur: 'INACTIF', label: 'Inactifs' },
        { valeur: 'TRANSFERE', label: 'Transférés' },
        { valeur: 'DECEDE', label: 'Décédés' },
      ],
    },
  ],

  FINANCES: [
    {
      cle: 'sens',
      label: 'Sens',
      options: [
        { valeur: 'RECETTE', label: 'Recettes' },
        { valeur: 'DEPENSE', label: 'Dépenses' },
      ],
    },
  ],

  ENTITES: [
    {
      cle: 'niveau',
      label: 'Niveau',
      options: [
        { valeur: 'REGIONAL', label: 'Régionaux' },
        { valeur: 'DISTRICT', label: 'Districts' },
        { valeur: 'PAROISSE', label: 'Paroisses' },
        { valeur: 'EGLISE', label: 'Églises' },
        { valeur: 'CELLULE', label: 'Cellules' },
      ],
    },
  ],

  BUREAUX: [
    {
      cle: 'etat',
      label: 'État du mandat',
      options: [
        { valeur: 'EN_COURS', label: 'En cours' },
        { valeur: 'CLOS', label: 'Clos' },
      ],
    },
  ],

  TRANSFERTS: [
    {
      cle: 'statut',
      label: 'Statut',
      options: [
        { valeur: 'EN_ATTENTE', label: 'En attente' },
        { valeur: 'APPROUVE', label: 'Approuvés' },
        { valeur: 'REFUSE', label: 'Refusés' },
      ],
    },
  ],

  // Un bapteme n'a que sa date et son lieu : la periode du rapport la borne
  // deja, et le lieu est un texte libre — donc un ensemble ouvert.
  BAPTEMES: [],
};

/** Les filtres qu'un bloc peut regler, compte tenu de sa source. */
export function filtresDuBloc(bloc: BlocRapport): readonly DescriptionFiltre[] {
  const source = sourceDuBloc(bloc);
  return source ? FILTRES_SOURCE[source] : [];
}

/**
 * Les filtres POSES sur un bloc, nettoyes.
 *
 * On ne rend que ceux que la source connait ET dont la valeur figure dans ses
 * options : un modele dont la source a change garderait sinon un filtre
 * orphelin, qui ne s'affiche nulle part et restreint quand meme.
 */
export function filtresPoses(bloc: BlocRapport): Readonly<Record<string, string>> {
  const brut = bloc.reglages.filtres;
  if (typeof brut !== 'object' || brut === null) return {};

  const table = brut as Record<string, unknown>;
  const retenus: Record<string, string> = {};

  for (const filtre of filtresDuBloc(bloc)) {
    const valeur = table[filtre.cle];
    if (typeof valeur !== 'string') continue;
    if (filtre.options.some((o) => o.valeur === valeur)) retenus[filtre.cle] = valeur;
  }

  return retenus;
}

/** Combien de filtres restreignent ce bloc — l'editeur l'annonce sur la carte. */
export function compteFiltres(bloc: BlocRapport): number {
  return Object.keys(filtresPoses(bloc)).length;
}

/**
 * La phrase qui dit ce que le bloc montre — affichee sous son titre.
 *
 * UN FILTRE QUI NE SE VOIT PAS EST PIRE QUE PAS DE FILTRE : sur un document
 * imprime, personne ne peut ouvrir les reglages pour comprendre pourquoi le
 * total ne correspond pas. Le rapport DIT donc ce qu'il a retenu.
 */
export function mentionFiltres(bloc: BlocRapport): string | null {
  const poses = filtresPoses(bloc);
  const descriptions = filtresDuBloc(bloc);

  const libelles = Object.entries(poses).map(([cle, valeur]) => {
    const filtre = descriptions.find((f) => f.cle === cle);
    return filtre?.options.find((o) => o.valeur === valeur)?.label ?? valeur;
  });

  return libelles.length > 0 ? libelles.join(' · ') : null;
}
