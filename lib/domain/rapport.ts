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

export interface DefinitionBloc {
  readonly type: TypeBloc;
  readonly libelle: string;
  readonly description: string;
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
    source: null,
    largeurParDefaut: 'PLEINE',
    toujoursPleine: true,
  },
  {
    type: 'TEXTE',
    libelle: 'Paragraphe',
    description: 'Du texte libre, avec des champs dynamiques insérables.',
    source: null,
    largeurParDefaut: 'PLEINE',
  },
  {
    type: 'INDICATEUR',
    libelle: 'Indicateur',
    description: 'Une carte à un chiffre — effectif, montant, part.',
    source: 'CROYANTS',
    largeurParDefaut: 'TIERS',
  },
  {
    type: 'TABLEAU',
    libelle: 'Tableau',
    description: 'Une liste de lignes, filtrée et ordonnée.',
    source: 'CROYANTS',
    largeurParDefaut: 'PLEINE',
  },
  {
    type: 'GRAPHIQUE',
    libelle: 'Graphique',
    description: 'Courbe, barres ou camembert sur une période.',
    source: 'FINANCES',
    largeurParDefaut: 'DEMI',
  },
  {
    type: 'JAUGE',
    libelle: 'Jauge',
    description: 'Une couverture, un taux — ce qui est atteint sur ce qui est visé.',
    source: 'BUREAUX',
    largeurParDefaut: 'TIERS',
  },
  {
    type: 'FRISE',
    libelle: 'Frise chronologique',
    description: 'Les événements d’une période, dans l’ordre.',
    source: 'TRANSFERTS',
    largeurParDefaut: 'PLEINE',
    toujoursPleine: true,
  },
  {
    type: 'ORGANIGRAMME',
    libelle: 'Organigramme',
    description: 'La structure d’une entité, ou la composition d’un bureau.',
    source: 'BUREAUX',
    largeurParDefaut: 'PLEINE',
    toujoursPleine: true,
  },
  {
    type: 'IMAGE',
    libelle: 'Image',
    description: 'Un logo, une photographie.',
    source: null,
    largeurParDefaut: 'DEMI',
  },
  {
    type: 'SAUT_DE_PAGE',
    libelle: 'Saut de page',
    description: 'Ce qui suit commence sur une nouvelle feuille.',
    source: null,
    largeurParDefaut: 'PLEINE',
    toujoursPleine: true,
  },
  {
    type: 'SIGNATURE',
    libelle: 'Bloc de signature',
    description: 'Un cadre nommé, à signer à la main.',
    source: null,
    largeurParDefaut: 'DEMI',
  },
];

export function definitionBloc(type: string): DefinitionBloc | null {
  return BLOCS_RAPPORT.find((b) => b.type === type) ?? null;
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

export interface StructureRapport {
  readonly sections: readonly SectionRapport[];
  /** EF-RAP-06 — en-tete et pied de page. */
  readonly entete?: {
    readonly avecLogo?: boolean;
    readonly avecEntite?: boolean;
    readonly avecPeriode?: boolean;
  };
  readonly pied?: {
    readonly avecNumerotation?: boolean;
    readonly mentionConfidentialite?: string;
  };
}

export const STRUCTURE_VIDE: StructureRapport = { sections: [] };

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

        if (definition.source === null) return true;

        const requise = PERMISSION_SOURCE[definition.source];
        if (detient(requise)) return true;

        omis.push({
          blocId: bloc.id,
          type: bloc.type,
          motif: `${LIBELLES_SOURCE[definition.source]} — habilitation non détenue.`,
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
