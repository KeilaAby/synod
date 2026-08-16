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

export interface DefinitionKpi {
  /** La colonne rendue par `fn_tableau_de_bord`. */
  readonly cle: string;
  readonly libelle: string;
  readonly groupe: GroupeKpi;
  readonly format: FormatKpi;
  /** EF-DSH-12 — sans elle, l'indicateur disparait au lieu d'afficher zero. */
  readonly permission: Permission;
  /** Ce que le chiffre compte exactement, quand le libelle ne suffit pas. */
  readonly aide?: string;
  /** EF-DSH-09 — l'ecran qui porte le detail, filtres appliques. */
  readonly lien?: string;
  /**
   * Un chiffre qui MERITE d'etre signale quand il n'est pas nul : ce qui
   * attend une decision, ce qui est en deficit. Rien d'autre ne clignote.
   */
  readonly alerteSiPositif?: boolean;
  readonly alerteSiNegatif?: boolean;
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
    lien: '/croyants?sexe=F',
  },
  {
    cle: 'hommes',
    libelle: 'Hommes',
    groupe: 'EFFECTIFS',
    format: 'NOMBRE',
    permission: 'croyant.read',
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
    aide: 'Sur la période retenue, mouvements validés seulement.',
    lien: '/finances',
  },
  {
    cle: 'depenses',
    libelle: 'Dépenses',
    groupe: 'FINANCES',
    format: 'MONTANT',
    permission: 'finance.read',
    aide: 'Sur la période retenue, mouvements validés seulement.',
    lien: '/finances',
  },
  {
    cle: 'solde_consolide',
    libelle: 'Solde disponible',
    groupe: 'FINANCES',
    format: 'MONTANT',
    permission: 'finance.read',
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
