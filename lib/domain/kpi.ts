import type { Permission } from './permissions';

/**
 * Le registre des indicateurs du tableau de bord — EF-DSH-03, EF-DSH-04.
 *
 * DECLARATIF, comme le registre des referentiels. Un indicateur s'ajoute en
 * ecrivant une ligne ici : ni ecran a modifier, ni requete a etendre. La
 * fonction `fn_tableau_de_bord` rend toutes les mesures d'un coup, et ce
 * registre decide de ce qui s'affiche, dans quel ordre, et sous quelle
 * habilitation.
 *
 * L'HABILITATION EST PORTEE PAR L'INDICATEUR (EF-DSH-12). Un tableau de bord
 * qui afficherait « Solde : — » a qui n'a pas `finance.read` apprendrait deja
 * qu'il existe un solde, et ferait chercher un droit manquant. Le bloc DISPARAIT
 * — c'est aussi ce que fait `fn_tableau_de_bord`, dont la RLS renvoie zero sur
 * ce qu'on ne peut pas lire : sans ce masquage, on lirait ce zero comme une
 * caisse vide.
 */

export type FormatKpi = 'NOMBRE' | 'MONTANT';

export const GROUPES_KPI = ['EFFECTIFS', 'STRUCTURE', 'GOUVERNANCE', 'FINANCES'] as const;
export type GroupeKpi = (typeof GROUPES_KPI)[number];

export const LIBELLES_GROUPE_KPI: Record<GroupeKpi, string> = {
  EFFECTIFS: 'Effectifs',
  STRUCTURE: 'Structure',
  GOUVERNANCE: 'Gouvernance',
  FINANCES: 'Finances',
};

/**
 * COMMENT le bloc se rend — EF-DSH-06.
 *
 * Le registre ne decrit plus seulement des chiffres : un tableau de bord qui
 * n'aligne que des nombres ne dit ni d'ou l'on vient, ni qui vient d'arriver.
 * Chaque rendu a ses donnees et son composant ; la personnalisation, elle, ne
 * les distingue pas — tout bloc s'ordonne et se masque de la meme facon.
 */
export const RENDUS_KPI = [
  'VALEUR',
  'LISTE_CROYANTS',
  'COURBE_FINANCES',
  'REPARTITION',
  'JAUGE',
] as const;
export type RenduKpi = (typeof RENDUS_KPI)[number];

/**
 * La largeur du bloc, en colonnes de la grille (qui en compte SIX).
 *
 * SIX ET NON QUATRE : une carte plus etroite laisse tenir plus d'indicateurs
 * sans faire defiler, et c'est le defilement — pas la taille — qui empeche de
 * comparer deux chiffres. Les montants prennent deux colonnes parce qu'ils sont
 * LONGS : « 15 000 000 MGA » ne se replie pas sans devenir illisible.
 */
export type TailleKpi = 1 | 2 | 3 | 6;

export interface DefinitionKpi {
  /** La colonne rendue par `fn_tableau_de_bord`, ou la cle du bloc. */
  readonly cle: string;
  readonly libelle: string;
  readonly groupe: GroupeKpi;
  readonly format: FormatKpi;
  /** EF-DSH-12 — sans elle, l'indicateur disparait au lieu d'afficher zero. */
  readonly permission: Permission;
  /** EF-DSH-06 — `VALEUR` par defaut : la carte a un chiffre. */
  readonly rendu?: RenduKpi;
  /** Largeur en colonnes sur six. `1` par defaut. */
  readonly taille?: TailleKpi;
  /** Ce que le chiffre compte exactement, quand le libelle ne suffit pas. */
  readonly aide?: string;
  /** EF-DSH-09 — l'ecran qui porte le detail, filtres appliques. */
  readonly lien?: string;
  /**
   * La cle du TOTAL auquel ce chiffre se rapporte — EF-DSH-05.
   *
   * « 1 240 femmes » ne dit rien seul : c'est « 53 % de l'effectif » qui se
   * lit. Le rapport se declare ici plutot que de se coder dans la carte, sinon
   * chaque nouvelle repartition demanderait de rouvrir le composant.
   */
  readonly partDe?: string;
  /**
   * Un chiffre qui MERITE d'etre signale quand il n'est pas nul : ce qui
   * attend une decision, ce qui est en deficit. Rien d'autre ne clignote.
   */
  readonly alerteSiPositif?: boolean;
  readonly alerteSiNegatif?: boolean;
}

/**
 * La part d'un effectif dans son total — EF-DSH-05.
 *
 * Rend `null` quand le total est nul, et c'est ce qui compte : « 0 % » se lit
 * comme une mesure, alors qu'il n'y a rien a mesurer. La carte n'affiche alors
 * simplement pas de part.
 */
export function partDeLEffectif(valeur: number, total: number): number | null {
  if (!Number.isFinite(valeur) || !Number.isFinite(total) || total <= 0) return null;
  return (valeur / total) * 100;
}

export const KPI_REGISTRY: readonly DefinitionKpi[] = [
  // --- Effectifs -------------------------------------------------------------
  {
    cle: 'croyants',
    libelle: 'Croyants',
    groupe: 'EFFECTIFS',
    format: 'NOMBRE',
    permission: 'croyant.read',
    aide: 'Actifs, dans tout le périmètre.',
    lien: '/croyants',
  },
  {
    cle: 'femmes',
    libelle: 'Femmes',
    groupe: 'EFFECTIFS',
    format: 'NOMBRE',
    permission: 'croyant.read',
    // EF-DSH-05 — « 1 240 femmes » ne dit rien seul ; « 53 % de l'effectif » si.
    partDe: 'croyants',
    lien: '/croyants?sexe=F',
  },
  {
    cle: 'hommes',
    libelle: 'Hommes',
    groupe: 'EFFECTIFS',
    format: 'NOMBRE',
    permission: 'croyant.read',
    partDe: 'croyants',
    lien: '/croyants?sexe=M',
  },
  {
    cle: 'nouveaux_baptises',
    libelle: 'Nouveaux baptisés',
    groupe: 'EFFECTIFS',
    format: 'NOMBRE',
    permission: 'croyant.read',
    // RG-30 — la fenêtre est un réglage, pas une constante : on ne l'écrit
    // donc pas ici, la base la lit à chaque appel.
    aide: 'Sur la fenêtre réglée dans les paramètres.',
    lien: '/baptemes',
  },
  {
    cle: 'encellules',
    libelle: 'En cellule',
    groupe: 'EFFECTIFS',
    format: 'NOMBRE',
    permission: 'croyant.read',
    aide: 'Croyants rattachés à une cellule de prière.',
    // Le taux d'encellulement (EF-DSH-05), qui est la vraie lecture.
    partDe: 'croyants',
    lien: '/croyants?encellule=oui',
  },

  // --- Structure -------------------------------------------------------------
  {
    cle: 'regionaux',
    libelle: 'Régionaux',
    groupe: 'STRUCTURE',
    format: 'NOMBRE',
    permission: 'entity.read',
    lien: '/structure/liste',
  },
  {
    cle: 'districts',
    libelle: 'Districts',
    groupe: 'STRUCTURE',
    format: 'NOMBRE',
    permission: 'entity.read',
    lien: '/structure/liste',
  },
  {
    cle: 'paroisses',
    libelle: 'Paroisses',
    groupe: 'STRUCTURE',
    format: 'NOMBRE',
    permission: 'entity.read',
    lien: '/structure/liste',
  },
  {
    cle: 'eglises',
    libelle: 'Églises',
    groupe: 'STRUCTURE',
    format: 'NOMBRE',
    permission: 'entity.read',
    lien: '/structure/liste',
  },
  {
    cle: 'cellules',
    libelle: 'Cellules de prière',
    groupe: 'STRUCTURE',
    format: 'NOMBRE',
    permission: 'entity.read',
    lien: '/structure/liste',
  },

  // --- Gouvernance -----------------------------------------------------------
  {
    cle: 'bureaux_actifs',
    libelle: 'Bureaux en fonction',
    groupe: 'GOUVERNANCE',
    format: 'NOMBRE',
    permission: 'bureau.read',
    lien: '/bureaux',
  },
  {
    cle: 'membres_bureau',
    libelle: 'Membres de bureau',
    groupe: 'GOUVERNANCE',
    format: 'NOMBRE',
    permission: 'bureau.read',
    aide: 'Mandats en cours ; un croyant n’est compté qu’une fois.',
    lien: '/bureaux',
  },
  {
    cle: 'membres_finances',
    libelle: 'Membres de finances',
    groupe: 'GOUVERNANCE',
    format: 'NOMBRE',
    permission: 'bureau.read',
    aide: 'RG-31 — titulaires d’une fonction financière.',
    lien: '/bureaux',
  },
  {
    cle: 'transferts_attente',
    libelle: 'Transferts à décider',
    groupe: 'GOUVERNANCE',
    format: 'NOMBRE',
    permission: 'transfer.approve',
    aide: 'Demandes dont ce périmètre est la destination.',
    lien: '/transferts',
    alerteSiPositif: true,
  },

  // --- Finances --------------------------------------------------------------
  {
    cle: 'recettes',
    libelle: 'Recettes',
    groupe: 'FINANCES',
    format: 'MONTANT',
    permission: 'finance.read',
    // Un montant est LONG : « 15 000 000 MGA » ne se replie pas sans devenir
    // illisible. Il prend donc deux colonnes des six.
    taille: 2,
    aide: 'Sur la période retenue, mouvements validés seulement.',
    lien: '/finances',
  },
  {
    cle: 'depenses',
    libelle: 'Dépenses',
    groupe: 'FINANCES',
    format: 'MONTANT',
    permission: 'finance.read',
    // Un montant est LONG : « 15 000 000 MGA » ne se replie pas sans devenir
    // illisible. Il prend donc deux colonnes des six.
    taille: 2,
    aide: 'Sur la période retenue, mouvements validés seulement.',
    lien: '/finances',
  },
  {
    cle: 'solde_consolide',
    libelle: 'Solde disponible',
    groupe: 'FINANCES',
    format: 'MONTANT',
    permission: 'finance.read',
    // Un montant est LONG : « 15 000 000 MGA » ne se replie pas sans devenir
    // illisible. Il prend donc deux colonnes des six.
    taille: 2,
    /**
     * IL N'EST PAS BORNE A LA PERIODE, contrairement aux deux precedents.
     * C'est de la tresorerie — « de combien disposons-nous ? » —, quand
     * recettes et depenses repondent a « qu'avons-nous fait ce mois-ci ? ».
     * Le dire ici evite qu'on additionne les trois.
     */
    aide: 'Cumul depuis l’origine, tout le périmètre — pas le résultat de la période.',
    lien: '/finances/consolide',
    alerteSiNegatif: true,
  },
  {
    cle: 'mouvements_attente',
    libelle: 'Mouvements à valider',
    groupe: 'FINANCES',
    format: 'NOMBRE',
    permission: 'finance.validate',
    lien: '/finances/a-valider',
    alerteSiPositif: true,
  },

  // --- Les blocs qui ne sont pas des chiffres — EF-DSH-06 --------------------
  /**
   * QUI VIENT D'ARRIVER.
   *
   * Un effectif dit combien nous sommes, jamais qui a rejoint. C'est pourtant
   * la premiere chose qu'un responsable regarde en ouvrant son ecran, et la
   * seule qui appelle un geste : accueillir quelqu'un.
   */
  {
    cle: 'derniers_croyants',
    libelle: 'Derniers enregistrés',
    groupe: 'EFFECTIFS',
    format: 'NOMBRE',
    permission: 'croyant.read',
    rendu: 'LISTE_CROYANTS',
    taille: 3,
    aide: 'Les cinq fiches les plus récentes du périmètre.',
    lien: '/croyants',
  },
  /**
   * D'OU L'ON VIENT.
   *
   * Trois chiffres du mois ne disent pas s'il est bon : c'est la COMPARAISON
   * aux onze precedents qui le dit. La categorie se choisit, parce que
   * « les recettes baissent » et « les dimes baissent » n'appellent pas la
   * meme reaction.
   */
  {
    cle: 'evolution_finances',
    libelle: 'Évolution des finances',
    groupe: 'FINANCES',
    format: 'MONTANT',
    permission: 'finance.read',
    rendu: 'COURBE_FINANCES',
    taille: 6,
    lien: '/finances/synthese',
  },

  // --- Les répartitions — EF-DSH-05 ------------------------------------------
  /**
   * COMMENT SE DECOMPOSE L'EFFECTIF.
   *
   * Un total dit la taille, jamais la FORME. « Mille croyants » ne distingue
   * pas une assemblee de jeunes menages d'une assemblee vieillissante — et ce
   * ne sont pas les memes decisions qui suivent.
   */
  {
    cle: 'repartition_age',
    libelle: 'Pyramide des âges',
    groupe: 'EFFECTIFS',
    format: 'NOMBRE',
    permission: 'croyant.read',
    rendu: 'REPARTITION',
    taille: 3,
    lien: '/croyants',
  },
  {
    cle: 'repartition_grade',
    libelle: 'Par grade',
    groupe: 'EFFECTIFS',
    format: 'NOMBRE',
    permission: 'croyant.read',
    rendu: 'REPARTITION',
    taille: 3,
    lien: '/croyants',
  },
  {
    cle: 'repartition_nationalite',
    libelle: 'Par nationalité',
    groupe: 'EFFECTIFS',
    format: 'NOMBRE',
    permission: 'croyant.read',
    rendu: 'REPARTITION',
    taille: 3,
    lien: '/croyants',
  },
  /**
   * LE CLASSEMENT DES ENTITES FILLES.
   *
   * C'est une repartition, pas un palmares : on y cherche celle qui decroche,
   * pas celle qui gagne. Les FILLES DIRECTES uniquement, avec le total de leur
   * sous-arbre — comparer un district a une cellule n'aurait aucun sens.
   */
  {
    cle: 'repartition_entite',
    libelle: 'Effectif par entité fille',
    groupe: 'STRUCTURE',
    format: 'NOMBRE',
    permission: 'entity.read',
    rendu: 'REPARTITION',
    taille: 3,
    lien: '/structure/liste',
  },
  /**
   * LA COUVERTURE DES BUREAUX — EF-DSH-05.
   *
   * RG-10 veut un bureau par entite. Le chiffre brut « 12 bureaux » ne dit pas
   * s'il en manque huit ; le rapport, si. Les cellules de priere sont hors du
   * compte : elles n'ont pas de bureau, et les inclure ferait plonger la
   * couverture de toute organisation qui en compte beaucoup — c'est-a-dire de
   * celles qui vont le mieux.
   */
  {
    cle: 'couverture_bureaux',
    libelle: 'Couverture des bureaux',
    groupe: 'GOUVERNANCE',
    format: 'NOMBRE',
    permission: 'bureau.read',
    rendu: 'JAUGE',
    taille: 2,
    aide: 'Entités pourvues d’un bureau en fonction. Hors cellules de prière.',
    lien: '/bureaux',
  },
];

/**
 * Les indicateurs qu'un compte peut voir — EF-DSH-12.
 *
 * LE MASQUAGE N'EST PAS COSMETIQUE. `fn_tableau_de_bord` est SECURITY INVOKER :
 * ce qu'on n'a pas le droit de lire n'est pas refuse, il est compte a ZERO par
 * la RLS. Sans ce filtre, un tresorier de paroisse verrait « Croyants : 0 » et
 * conclurait a une base vide plutot qu'a une habilitation manquante (regle 15).
 */
export function kpisVisibles(
  registre: readonly DefinitionKpi[],
  detient: (permission: Permission) => boolean,
): DefinitionKpi[] {
  return registre.filter((k) => detient(k.permission));
}

/** Les groupes qui ont au moins un indicateur visible, dans l'ordre du registre. */
export function groupesVisibles(kpis: readonly DefinitionKpi[]): GroupeKpi[] {
  return GROUPES_KPI.filter((g) => kpis.some((k) => k.groupe === g));
}

/**
 * Un indicateur merite-t-il d'etre signale ?
 *
 * TRES PEU DE CHOSES DOIVENT ATTIRER L'OEIL sur un tableau de bord : si tout
 * se signale, plus rien ne ressort. Seuls deux cas le justifient — ce qui
 * ATTEND une decision, et un solde NEGATIF (EF-FIN-13).
 */
export function kpiEstAlerte(definition: DefinitionKpi, valeur: number): boolean {
  if (definition.alerteSiPositif) return valeur > 0;
  if (definition.alerteSiNegatif) return valeur < 0;
  return false;
}

// ---------------------------------------------------------------------------
// EF-DSH-03, EF-DSH-07 — la disposition choisie par l'utilisateur
// ---------------------------------------------------------------------------

/**
 * Ce qu'un compte a decide de son tableau de bord.
 *
 * DEUX LISTES, ET NON UNE SEULE LISTE DE VISIBLES. Une liste de « ce que je
 * veux voir » serait plus courte a ecrire, mais un indicateur AJOUTE AU
 * REGISTRE plus tard n'y figurerait pas — il n'apparaitrait jamais chez ceux
 * qui ont personnalise, et personne ne saurait pourquoi. Ici, ce qui n'est ni
 * ordonne ni masque est simplement NOUVEAU : il se montre, a la fin.
 *
 * C'est la meme regle que `null` pour le workflow financier : l'absence de
 * decision n'est pas une decision.
 */
export interface DispositionTableauDeBord {
  /** L'ordre voulu, par cle. Les cles inconnues sont ignorees. */
  readonly ordre: readonly string[];
  /** Ce qui est EXPLICITEMENT ecarte — a distinguer de ce qui est nouveau. */
  readonly masques: readonly string[];
}

export const DISPOSITION_VIDE: DispositionTableauDeBord = { ordre: [], masques: [] };

/** Un objet simple, et rien d'autre : il traverse serveur -> client (regle 24). */
export function estDisposition(valeur: unknown): valeur is DispositionTableauDeBord {
  if (typeof valeur !== 'object' || valeur === null) return false;
  const v = valeur as Record<string, unknown>;
  return (
    Array.isArray(v.ordre) &&
    Array.isArray(v.masques) &&
    v.ordre.every((c) => typeof c === 'string') &&
    v.masques.every((c) => typeof c === 'string')
  );
}

/**
 * Les indicateurs a rendre, dans l'ordre voulu.
 *
 * LES NOUVEAUX VIENNENT APRES, dans l'ordre du registre : un indicateur ajoute
 * au produit doit se voir, sans quoi la personnalisation gelerait le tableau de
 * bord au jour ou elle a ete faite.
 *
 * Ce qui n'est PLUS au registre disparait de lui-meme : la disposition garde sa
 * cle, mais rien ne la resout — inutile de nettoyer la base pour cela.
 */
export function appliquerDisposition(
  kpis: readonly DefinitionKpi[],
  disposition: DispositionTableauDeBord,
): DefinitionKpi[] {
  const masques = new Set(disposition.masques);
  const rang = new Map(disposition.ordre.map((cle, i) => [cle, i]));

  return kpis
    .filter((k) => !masques.has(k.cle))
    .map((k, positionRegistre) => ({ k, positionRegistre }))
    .sort((a, b) => {
      const ra = rang.get(a.k.cle);
      const rb = rang.get(b.k.cle);

      // Deux connus : leur ordre. Deux inconnus : celui du registre.
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra === undefined && rb === undefined) {
        return a.positionRegistre - b.positionRegistre;
      }
      // Un connu, un nouveau : le nouveau passe apres.
      return ra === undefined ? 1 : -1;
    })
    .map(({ k }) => k);
}

/** Montre ou masque un indicateur. */
export function basculerMasque(
  disposition: DispositionTableauDeBord,
  cle: string,
): DispositionTableauDeBord {
  const masques = disposition.masques.includes(cle)
    ? disposition.masques.filter((c) => c !== cle)
    : [...disposition.masques, cle];

  return { ...disposition, masques };
}

/**
 * Deplace un indicateur AVANT un autre.
 *
 * L'ORDRE EST REECRIT EN ENTIER a partir de ce qui est affiche, jamais corrige
 * par un `splice` sur l'ancien tableau : celui-ci peut contenir des cles
 * disparues du registre ou omettre les nouvelles, et un deplacement calcule sur
 * des index qui ne correspondent pas a l'ecran deplace le mauvais bloc.
 */
export function deplacerKpi(
  affiches: readonly string[],
  cle: string,
  avant: string,
): string[] {
  if (cle === avant) return [...affiches];

  const sansLui = affiches.filter((c) => c !== cle);
  const cible = sansLui.indexOf(avant);
  if (cible < 0) return [...affiches];

  return [...sansLui.slice(0, cible), cle, ...sansLui.slice(cible)];
}

// ---------------------------------------------------------------------------
// EF-DSH-05 — les repartitions
// ---------------------------------------------------------------------------

export const DIMENSIONS = ['GRADE', 'NATIONALITE', 'AGE', 'ENTITE'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export interface TrancheRepartition {
  readonly dimension: string;
  readonly cle: string;
  readonly libelle: string;
  readonly effectif: number;
}

export interface BarreRepartition {
  readonly cle: string;
  readonly libelle: string;
  readonly effectif: number;
  /** Part dans le total de la dimension, en pourcentage. */
  readonly part: number;
  /** Part rapportee a la PLUS GRANDE tranche : c'est la longueur de la barre. */
  readonly longueur: number;
}

/**
 * Le plafond de tranches affichees.
 *
 * Une repartition sert a VOIR LA FORME d'un ensemble, pas a l'enumerer : au-dela
 * d'une dizaine de barres, on ne compare plus, on lit une liste — et il existe
 * un ecran pour cela.
 */
export const TRANCHES_AFFICHEES = 8;

/**
 * Prepare une repartition pour l'affichage — EF-DSH-05.
 *
 * DEUX POURCENTAGES, ET CE N'EST PAS UNE REDONDANCE. `part` est ce qu'on LIT
 * (« 34 % des croyants ») ; `longueur` est ce qu'on VOIT. Dessiner les barres a
 * l'echelle de la part rendrait illisible toute repartition ou aucune tranche
 * ne depasse 20 % — huit traits minuscules dont on ne distingue pas le plus
 * long. Les mettre a l'echelle du MAXIMUM garde la comparaison visible, et le
 * chiffre reste la pour dire la verite.
 *
 * TRIEES PAR EFFECTIF DECROISSANT, sauf l'age. Les tranches d'age ont un ordre
 * NATUREL — les lire de la plus jeune a la plus vieille est la seule facon d'y
 * voir une pyramide ; les trier par effectif en ferait un classement, ce qu'une
 * pyramide des ages n'est pas.
 */
export function preparerRepartition(
  tranches: readonly TrancheRepartition[],
  dimension: Dimension,
  plafond: number = TRANCHES_AFFICHEES,
): { barres: BarreRepartition[]; total: number; reste: number } {
  /**
   * LES TRANCHES VIDES DISPARAISSENT, SAUF POUR LES ENTITES.
   *
   * Un grade que personne ne detient est du BRUIT : il vient du referentiel,
   * pas de l'effectif, et occupe une ligne pour ne rien dire. Une eglise sans
   * croyant, elle, est precisement celle qu'on cherche en ouvrant ce bloc —
   * l'effacer reviendrait a masquer le seul cas qui appelle une action.
   */
  const retenues = tranches.filter(
    (t) => t.dimension === dimension && (dimension === 'ENTITE' || t.effectif > 0),
  );
  const total = retenues.reduce((s, t) => s + t.effectif, 0);

  const ordonnees =
    dimension === 'AGE'
      ? [...retenues].sort((a, b) => a.cle.localeCompare(b.cle))
      : [...retenues].sort(
          (a, b) => b.effectif - a.effectif || a.libelle.localeCompare(b.libelle, 'fr'),
        );

  const gardees = ordonnees.slice(0, plafond);
  const maximum = Math.max(1, ...gardees.map((t) => t.effectif));

  return {
    barres: gardees.map((t) => ({
      cle: t.cle,
      libelle: t.libelle,
      effectif: t.effectif,
      part: total > 0 ? (t.effectif / total) * 100 : 0,
      longueur: (t.effectif / maximum) * 100,
    })),
    total,
    /** Ce que le plafond a ecarte : on le DIT, plutot que de le taire. */
    reste: ordonnees.length - gardees.length,
  };
}

/**
 * La couverture, en pourcentage — EF-DSH-05.
 *
 * Rend `null` quand il n'y a rien a couvrir : « 0 % de bureaux » sur un
 * perimetre sans entite eligible se lirait comme un manquement, alors qu'il n'y
 * a simplement rien a pourvoir (regle 15).
 *
 * ELLE SE BORNE A CENT. Une entite peut porter plusieurs bureaux au fil du
 * temps ; si un jour deux se retrouvaient actifs, une jauge a 130 % ferait
 * douter de tout l'ecran plutot que de signaler l'anomalie — qui a son propre
 * endroit, l'index unique `bureaux_un_seul_actif`.
 */
export function couverture(couvertes: number, total: number): number | null {
  if (!Number.isFinite(couvertes) || !Number.isFinite(total) || total <= 0) return null;
  return Math.min(100, (couvertes / total) * 100);
}

// ---------------------------------------------------------------------------
// EF-DSH-08 — les modeles de tableau de bord
// ---------------------------------------------------------------------------

/**
 * Un tableau de bord tout fait, applicable en un clic.
 *
 * IL DECLARE CE QU'IL GARDE, jamais ce qu'il masque. Deux raisons :
 *
 *   - une liste de six cles se lit et se corrige ; la liste des vingt autres
 *     ne se relit jamais, et personne ne s'apercevrait qu'un indicateur y
 *     manque ;
 *   - les masques sont calcules A L'APPLICATION, contre le registre du jour.
 *     Un indicateur ajoute PLUS TARD n'y figure donc pas, et se montre — la
 *     meme propriete que pour une disposition faite a la main.
 *
 * L'ORDRE DE `garde` EST L'ORDRE VOULU : un modele ne choisit pas seulement
 * quoi montrer, mais dans quel ordre — c'est ce qui en fait un point de vue et
 * non une simple selection.
 */
export interface ModeleTableauDeBord {
  readonly cle: string;
  readonly nom: string;
  readonly description: string;
  readonly garde: readonly string[];
}

export const MODELES_TABLEAU_DE_BORD: readonly ModeleTableauDeBord[] = [
  {
    cle: 'essentiel',
    nom: 'L’essentiel',
    description: 'Les quelques chiffres qu’on regarde tous les jours.',
    garde: [
      'croyants',
      'femmes',
      'hommes',
      'eglises',
      'solde_consolide',
      'derniers_croyants',
      'evolution_finances',
    ],
  },
  {
    cle: 'tresorier',
    nom: 'Trésorerie',
    description: 'Ce qui entre, ce qui sort, et ce qui attend une décision.',
    garde: [
      'recettes',
      'depenses',
      'solde_consolide',
      'mouvements_attente',
      'evolution_finances',
    ],
  },
  {
    cle: 'effectifs',
    nom: 'Effectifs',
    description: 'Qui nous sommes, et comment cela se décompose.',
    garde: [
      'croyants',
      'femmes',
      'hommes',
      'nouveaux_baptises',
      'encellules',
      'derniers_croyants',
      'repartition_age',
      'repartition_grade',
    ],
  },
  {
    cle: 'structure',
    nom: 'Structure et bureaux',
    description: 'Le maillage des entités et la couverture de leurs bureaux.',
    garde: [
      'regionaux',
      'districts',
      'paroisses',
      'eglises',
      'cellules',
      'bureaux_actifs',
      'couverture_bureaux',
      'repartition_entite',
      'transferts_attente',
    ],
  },
];

/**
 * La disposition que produit un modele, contre le registre du jour.
 *
 * `masques` est calcule ICI et non ecrit dans le modele : c'est ce qui laisse
 * un indicateur ajoute plus tard apparaitre chez ceux qui ont applique un
 * modele. Un modele fige un POINT DE VUE, pas l'etat du produit.
 */
export function dispositionDuModele(
  modele: ModeleTableauDeBord,
  registre: readonly DefinitionKpi[],
): DispositionTableauDeBord {
  const gardees = new Set(modele.garde);

  return {
    // On ne garde que les cles qui existent : un modele ecrit avant un
    // renommage ne doit pas laisser de cle morte dans la disposition.
    ordre: modele.garde.filter((cle) => registre.some((k) => k.cle === cle)),
    masques: registre.filter((k) => !gardees.has(k.cle)).map((k) => k.cle),
  };
}

/**
 * Ce modele montrerait-il quelque chose A CET UTILISATEUR ?
 *
 * Un modele « Tresorerie » applique par un compte sans `finance.read` ne
 * masquerait pas des finances qu'il ne voit deja pas : il masquerait TOUT LE
 * RESTE, et laisserait un ecran vide dont la cause serait introuvable. Il vaut
 * mieux le proposer eteint, et dire pourquoi.
 */
export function modeleApplicable(
  modele: ModeleTableauDeBord,
  visibles: readonly DefinitionKpi[],
): boolean {
  return visibles.some((k) => modele.garde.includes(k.cle));
}
