/**
 * Finances — EF-FIN-01 a 20, RG-13 a RG-18.
 *
 * Module PUR : contrepartie applicative de `0023_finances.sql`. Le domaine
 * EXPLIQUE le refus a l'utilisateur, la base l'EMPECHE quoi qu'il arrive — et
 * les tests verrouillent l'accord entre les deux.
 *
 * TROIS CHOSES A NE PAS CONFONDRE
 *
 * Le SENS (recette ou depense) vient de la categorie, jamais de la saisie
 * (RG-13). Le STATUT dit ou en est le mouvement dans le workflow. Le SOLDE ne
 * compte que le valide (RG-18) : un brouillon de dix millions ne rend riche
 * personne, et l'afficher comme tel ferait engager de l'argent qui n'existe pas.
 */

export const SENS = ['RECETTE', 'DEPENSE'] as const;
export type SensFinance = (typeof SENS)[number];

export const LIBELLES_SENS: Record<SensFinance, string> = {
  RECETTE: 'Recette',
  DEPENSE: 'Dépense',
};

// -----------------------------------------------------------------------------
// Statuts et transitions — EF-FIN-14, RG-17
// -----------------------------------------------------------------------------

export const STATUTS_MOUVEMENT = [
  'BROUILLON',
  'SOUMIS',
  'VALIDE',
  'REJETE',
  'ANNULE',
] as const;

export type StatutMouvement = (typeof STATUTS_MOUVEMENT)[number];

export const LIBELLES_STATUT_MOUVEMENT: Record<StatutMouvement, string> = {
  BROUILLON: 'Brouillon',
  SOUMIS: 'À valider',
  VALIDE: 'Validé',
  REJETE: 'Rejeté',
  ANNULE: 'Annulé',
};

/**
 * Transitions autorisees. DOIT rester aligne sur `fn_finance_before_write`.
 *
 * `VALIDE` ne mene qu'a `ANNULE`, et seulement avec un motif : c'est RG-17.
 * Un mouvement valide a deja compte dans un solde, sur lequel quelqu'un a pu
 * decider une depense — le corriger en silence reecrirait l'histoire.
 *
 * `REJETE` revient a `BROUILLON` : un rejet motive est une demande de
 * correction, pas une fin de course.
 */
export const TRANSITIONS_MOUVEMENT: Record<
  StatutMouvement,
  readonly StatutMouvement[]
> = {
  BROUILLON: ['SOUMIS', 'VALIDE', 'ANNULE'],
  SOUMIS: ['VALIDE', 'REJETE', 'ANNULE'],
  VALIDE: ['ANNULE'],
  REJETE: ['BROUILLON', 'ANNULE'],
  ANNULE: [],
};

export function transitionAutorisee(
  de: StatutMouvement,
  vers: StatutMouvement,
): boolean {
  return TRANSITIONS_MOUVEMENT[de].includes(vers);
}

/** RG-18 — seul le valide alimente solde, tableaux de bord et rapports. */
export function compteDansLeSolde(statut: StatutMouvement): boolean {
  return statut === 'VALIDE';
}

/** EF-FIN-14 — ce qui attend une decision, donc un compteur a l'ecran (UI-21). */
export function attendUneValidation(statut: StatutMouvement): boolean {
  return statut === 'SOUMIS';
}

/**
 * RG-17 — un mouvement valide ne se modifie plus.
 *
 * La question se pose a l'ECRAN avant de se poser en base : proposer un bouton
 * « Modifier » qui declenchera une exception SQL est une promesse qu'on ne
 * tient pas.
 */
export function estModifiable(statut: StatutMouvement): boolean {
  return statut === 'BROUILLON' || statut === 'REJETE';
}

// -----------------------------------------------------------------------------
// Separation saisie / validation — EF-FIN-18
// -----------------------------------------------------------------------------

export interface RefusValidation {
  readonly autorise: boolean;
  readonly motif?: string;
}

/**
 * Ce compte peut-il valider CE mouvement ?
 *
 * La separation des roles n'est pas une formalite : elle est la seule chose qui
 * distingue une comptabilite d'une declaration. Celui qui saisit ne constate
 * pas lui-meme que sa saisie est juste.
 *
 * Elle cede devant le DOUBLE ROLE explicite, parce qu'une eglise de trois
 * personnes n'a personne d'autre — mais il se detient, il ne se suppose pas
 * (EF-FIN-18).
 */
export function peutValider(
  mouvement: { readonly soumis_par: string | null; readonly saisi_par: string | null },
  profileId: string,
  options: { readonly separationActive: boolean; readonly detientDoubleRole: boolean },
): RefusValidation {
  if (!options.separationActive || options.detientDoubleRole) return { autorise: true };

  // `soumis_par` fait foi quand il existe ; a defaut, l'auteur de la saisie.
  // Un mouvement soumis par un tiers a bien change de mains.
  const auteur = mouvement.soumis_par ?? mouvement.saisi_par;

  return auteur === profileId
    ? {
        autorise: false,
        motif:
          "Vous avez saisi ce mouvement : sa validation revient a quelqu'un d'autre. " +
          'La separation entre saisie et validation peut etre levee dans les parametres.',
      }
    : { autorise: true };
}

// -----------------------------------------------------------------------------
// Solde — EF-FIN-09 a 13, RG-18
// -----------------------------------------------------------------------------

export interface Solde {
  /** Ce que l'entite a encaisse et depense ELLE-MEME. */
  readonly recettesPropres: number;
  readonly depensesPropres: number;
  /** L'entite ET tout son sous-arbre (EF-FIN-09). */
  readonly recettesConsolidees: number;
  readonly depensesConsolidees: number;
}

export function soldePropre(s: Solde): number {
  return s.recettesPropres - s.depensesPropres;
}

export function soldeConsolide(s: Solde): number {
  return s.recettesConsolidees - s.depensesConsolidees;
}

/**
 * EF-FIN-13 — un solde negatif se signale.
 *
 * Sur le solde CONSOLIDE : c'est lui qui dit si l'ensemble tient. Une eglise
 * dont le solde propre est negatif mais que sa paroisse couvre n'est pas en
 * peril ; l'inverse l'est.
 */
export function estCritique(s: Solde): boolean {
  return soldeConsolide(s) < 0;
}

/**
 * La part du sous-arbre, isolee — EF-FIN-12.
 *
 * Une paroisse dont le solde consolide est confortable peut n'avoir rien en
 * propre : confondre les deux fait engager de l'argent qui appartient a ses
 * eglises.
 */
export function soldeDesDescendants(s: Solde): number {
  return soldeConsolide(s) - soldePropre(s);
}

/**
 * Plafond de chargement de la liste — regle 17.
 *
 * Vit dans le DOMAINE, pas dans la couche de lecture : l'ecran l'affiche
 * (« seuls les 5 000 plus recents sont charges »), et l'importer depuis
 * `lib/data` tirait `server-only` dans le bundle du navigateur — la compilation
 * entiere s'arretait dessus. Un TYPE s'efface a la compilation, une CONSTANTE
 * non : c'est toute la difference entre les deux imports.
 */
export const PLAFOND_MOUVEMENTS = 5000;

// -----------------------------------------------------------------------------
// Periode — la maille de toutes les consolidations
// -----------------------------------------------------------------------------

/**
 * Premier jour du mois, comme le calcule le trigger.
 *
 * PREND UNE CHAINE, PAS UNE `Date` — et ce n'est pas un detail.
 *
 * `date_operation` est une colonne `date` : une journee du calendrier, sans
 * heure ni fuseau. La convertir en `Date` la place a minuit UTC, et
 * `getMonth()` la relit dans le fuseau du navigateur : a Antananarivo (UTC+3),
 * une operation du 31 aout ressortait en SEPTEMBRE et changeait de periode
 * comptable. Un mois se serait ferme avec les recettes du suivant.
 *
 * On travaille donc sur la chaine « AAAA-MM-JJ » telle que la base la rend :
 * il n'y a plus de fuseau, donc plus de decalage possible.
 */
export function periodeDe(jourIso: string): string {
  return `${jourIso.slice(0, 7)}-01`;
}
