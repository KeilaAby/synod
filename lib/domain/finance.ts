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

/** Le minimum qu'une ligne doit porter pour entrer dans un solde. */
export interface MouvementPourSolde {
  readonly sens: SensFinance;
  readonly montant: number;
  readonly statut: StatutMouvement;
  readonly entity_id: string;
}

/**
 * Le solde d'une SELECTION — EF-FIN-10.
 *
 * `fn_finance_solde` calcule en base sur tout l'historique ; celle-ci calcule
 * en memoire sur ce que l'ecran montre, pour que le triptyque suive les
 * filtres. Les deux doivent donner le meme resultat sur le meme ensemble —
 * d'ou les tests qui rejouent les cas de la fonction SQL.
 *
 * ELLE NE COMPTE QUE LE VALIDE, quoi qu'on lui donne (RG-18). C'est le piege
 * de l'exercice : filtrer sur « Brouillon » et sommer ce qu'on voit produirait
 * un « solde » fait de brouillons — un nombre qui a l'air d'un solde, qui se
 * lit comme un solde, et sur lequel on engagerait une depense. Le triptyque
 * affiche alors zero, et l'ecran DIT pourquoi.
 */
export function soldeDeMouvements(
  mouvements: readonly MouvementPourSolde[],
  entitePropreId: string | null,
): Solde {
  let recettesPropres = 0;
  let depensesPropres = 0;
  let recettesConsolidees = 0;
  let depensesConsolidees = 0;

  for (const m of mouvements) {
    if (!compteDansLeSolde(m.statut)) continue;

    const propre = entitePropreId !== null && m.entity_id === entitePropreId;

    if (m.sens === 'RECETTE') {
      recettesConsolidees += m.montant;
      if (propre) recettesPropres += m.montant;
    } else {
      depensesConsolidees += m.montant;
      if (propre) depensesPropres += m.montant;
    }
  }

  return {
    recettesPropres,
    depensesPropres,
    recettesConsolidees,
    depensesConsolidees,
  };
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

// ---------------------------------------------------------------------------
// EF-FIN-22 — filtrer les mouvements
// ---------------------------------------------------------------------------

/**
 * Ce dont le filtrage a besoin, et RIEN DE PLUS.
 *
 * Le domaine ne connait pas `MouvementListe` : il decrit la forme minimale
 * qu'il sait lire, et la couche de donnees s'y conforme sans le savoir. Un
 * `MouvementListe` importe ici ferait dependre une regle metier de la forme
 * d'un embed PostgREST.
 */
export interface MouvementFiltrable {
  readonly entity_id: string;
  readonly categorie_id: string;
  readonly sens: SensFinance;
  readonly montant: number;
  readonly date_operation: string;
  readonly libelle: string | null;
  readonly reference: string | null;
  readonly statut: StatutMouvement;
  readonly est_delegue: boolean;
  readonly saisi_par: string | null;
  readonly categorie: { libelle: string } | null;
  readonly entite: { nom: string } | null;
}

/** EF-FIN-22 — l'origine : saisie par l'entite elle-meme, ou pour son compte. */
export const ORIGINES = ['DIRECTE', 'DELEGUEE'] as const;
export type OrigineMouvement = (typeof ORIGINES)[number];

export interface FiltresMouvements {
  readonly recherche: string;
  readonly statuts: readonly StatutMouvement[];
  readonly sens: readonly SensFinance[];
  readonly entiteId: string | null;
  readonly categorieId: string | null;
  readonly auteurId: string | null;
  /** Bornes INCLUSES, en « AAAA-MM-JJ » — voir `filtrerMouvements`. */
  readonly du: string | null;
  readonly au: string | null;
  readonly montantMin: number | null;
  readonly montantMax: number | null;
  readonly origine: OrigineMouvement | null;
}

export const FILTRES_MOUVEMENTS_VIDES: FiltresMouvements = {
  recherche: '',
  statuts: [],
  sens: [],
  entiteId: null,
  categorieId: null,
  auteurId: null,
  du: null,
  au: null,
  montantMin: null,
  montantMax: null,
  origine: null,
};

/**
 * Un filtre est-il pose ?
 *
 * Sert a decider si le triptyque suit l'ecran ou la base (EF-FIN-10) : sans
 * filtre, c'est le solde calcule en base qui fait foi, parce qu'il porte sur
 * tout l'historique quand la liste s'arrete au plafond.
 */
export function filtreEstActif(f: FiltresMouvements): boolean {
  return (
    f.recherche.trim() !== '' ||
    f.statuts.length > 0 ||
    f.sens.length > 0 ||
    f.entiteId !== null ||
    f.categorieId !== null ||
    f.auteurId !== null ||
    f.du !== null ||
    f.au !== null ||
    f.montantMin !== null ||
    f.montantMax !== null ||
    f.origine !== null
  );
}

/** Combien de criteres SECONDAIRES sont poses — ceux qu'un panneau replie cache. */
export function nombreFiltresAvances(f: FiltresMouvements): number {
  return [
    f.categorieId,
    f.auteurId,
    f.du,
    f.au,
    f.montantMin,
    f.montantMax,
    f.origine,
  ].filter((v) => v !== null).length;
}

/**
 * EF-FIN-22 — le filtrage complet, en memoire.
 *
 * TOUT EST DEJA CHARGE : categorie, auteur, origine et montant voyagent avec
 * chaque mouvement. Interroger le serveur a chaque changement de critere
 * couterait un aller-retour par frappe (regles 17 et 28).
 *
 * LES DATES SE COMPARENT EN CHAINES. « AAAA-MM-JJ » s'ordonne lexicalement, et
 * une colonne `date` n'a pas de fuseau : la convertir en `Date` ferait basculer
 * un mouvement du 31 dans le mois suivant selon la machine qui lit.
 *
 * LES BORNES SONT INCLUSES, les deux. « Du 1er au 31 aout » designe aout
 * entier pour tout le monde sauf pour un informaticien.
 *
 * L'ENTITE SEULE, jamais son sous-arbre : chaque entite gere ses propres
 * finances, et « les finances du regional » designe les siennes, pas la somme
 * de celles de ses enfants. Le perimetre borne le CHOIX, pas le resultat.
 */
export function filtrerMouvements<T extends MouvementFiltrable>(
  mouvements: readonly T[],
  f: FiltresMouvements,
): T[] {
  const terme = f.recherche.trim().toLocaleLowerCase('fr');

  return mouvements.filter((m) => {
    if (f.statuts.length > 0 && !f.statuts.includes(m.statut)) return false;
    if (f.sens.length > 0 && !f.sens.includes(m.sens)) return false;
    if (f.entiteId && m.entity_id !== f.entiteId) return false;
    if (f.categorieId && m.categorie_id !== f.categorieId) return false;
    if (f.auteurId && m.saisi_par !== f.auteurId) return false;

    if (f.du && m.date_operation < f.du) return false;
    if (f.au && m.date_operation > f.au) return false;

    const montant = Number(m.montant);
    if (f.montantMin !== null && montant < f.montantMin) return false;
    if (f.montantMax !== null && montant > f.montantMax) return false;

    if (f.origine === 'DELEGUEE' && !m.est_delegue) return false;
    if (f.origine === 'DIRECTE' && m.est_delegue) return false;

    if (!terme) return true;

    return [m.libelle, m.reference, m.categorie?.libelle, m.entite?.nom]
      .filter(Boolean)
      .some((v) => v!.toLocaleLowerCase('fr').includes(terme));
  });
}
