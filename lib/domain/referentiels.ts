import { z } from 'zod';

import { ENTITY_LABELS, ENTITY_TYPES } from './hierarchy';

/**
 * Registre des referentiels — EF-REF-01 a 06.
 *
 * Meme principe declaratif que `KPI_REGISTRY` (plan.md §11.1, DA-7) : les
 * quatre referentiels partagent un ecran, un formulaire et des actions.
 * En ajouter un cinquieme = ajouter une entree ici.
 *
 * Module PUR : aucune dependance serveur, donc directement testable.
 */

// -----------------------------------------------------------------------------
// Description des champs
// -----------------------------------------------------------------------------

interface ChampCommun {
  readonly cle: string;
  readonly label: string;
  readonly hint?: string;
  readonly requis?: boolean;
  /** Non modifiable apres creation : un code sert de reference stable. */
  readonly immuable?: boolean;
}

export type ChampReferentiel =
  | (ChampCommun & { readonly type: 'texte'; readonly mono?: boolean })
  | (ChampCommun & { readonly type: 'nombre' })
  | (ChampCommun & { readonly type: 'booleen' })
  | (ChampCommun & {
      readonly type: 'choix';
      readonly options: ReadonlyArray<{ valeur: string; label: string }>;
    })
  | (ChampCommun & {
      readonly type: 'choix-multiple';
      readonly options: ReadonlyArray<{ valeur: string; label: string }>;
    });

export interface ColonneReferentiel {
  readonly cle: string;
  readonly label: string;
  readonly mono?: boolean;
  readonly alignementDroite?: boolean;
  /**
   * Rendue comme un ETAT et non comme le mot « Oui » ou « Non ».
   *
   * Un drapeau vrai pour trois lignes sur vingt donne dix-sept « Non » a lire :
   * l'oeil doit trier du texte pour trouver l'exception. Une pastille se repere
   * sans etre lue. On garde le mot dedans — un pictogramme seul demanderait une
   * legende.
   */
  readonly booleen?: boolean;
}

/**
 * Ou une valeur de referentiel est employee — EF-REF-05.
 *
 * Sert a REFUSER une suppression en la motivant : « ce grade est porte par
 * 42 croyants » vaut mieux qu'un code d'erreur de cle etrangere. La cle
 * etrangere reste la garantie ; ceci n'est que l'explication.
 *
 * Cette liste peut vieillir — une table ajoutee plus tard referencera un
 * referentiel sans qu'on pense a l'inscrire ici. C'est pourquoi la suppression
 * intercepte AUSSI la violation 23503 : le message perd en precision, jamais
 * la base en integrite.
 */
export interface UsageReferentiel {
  readonly table: string;
  readonly colonne: string;
  /** Ce qu'on compte, au singulier : « croyant », « mandat ». */
  readonly quoi: string;
}

export interface DefinitionReferentiel {
  readonly slug: string;
  readonly table: string;
  readonly titre: string;
  readonly singulier: string;
  readonly description: string;
  /** Colonne de tri par defaut. */
  readonly triPar: string;
  /**
   * EF-REF-02 — la colonne qui porte l'ORDRE PROTOCOLAIRE, si le referentiel
   * en a un. Declaree, la liste devient reordonnable au glisser-deposer.
   *
   * Elle ne s'appelle pas partout pareil : `ordre` pour les grades et les
   * categories, `ordre_protocolaire` pour les fonctions. La deviner aurait
   * marche jusqu'au jour ou elle differe — c'est-a-dire aujourd'hui.
   *
   * Absente — les nationalites —, il n'y a rien a ordonner : leur imposer un
   * rang inventerait une hierarchie entre des pays.
   */
  readonly colonneOrdre?: string;
  readonly colonnes: readonly ColonneReferentiel[];
  readonly champs: readonly ChampReferentiel[];
  readonly schema: z.ZodType<Record<string, unknown>>;
  /** Tables qui referencent cette valeur. Vide : rien ne l'empeche de partir. */
  readonly usages: readonly UsageReferentiel[];
}

// -----------------------------------------------------------------------------

const codeReferentiel = z
  .string()
  .trim()
  .min(2, 'Le code est requis.')
  .max(40)
  .transform((v) => v.toUpperCase().replace(/\s+/g, '_'))
  .refine((v) => /^[A-Z0-9_]+$/.test(v), {
    message: 'Lettres majuscules, chiffres et tirets bas uniquement.',
  });

const libelle = z.string().trim().min(2, 'Le libelle est requis.').max(120);

const optionsNiveaux = ENTITY_TYPES.map((t) => ({
  valeur: t,
  label: ENTITY_LABELS[t].singulier,
}));

// -----------------------------------------------------------------------------

/**
 * Les slugs sont declares AVANT le registre, et le registre est type
 * explicitement. Un `as const satisfies` figerait chaque entree a sa forme
 * litterale : le code generique perdrait alors l'acces aux proprietes
 * facultatives du contrat (`immuable`, `hint`…) sur les entrees qui ne les
 * declarent pas.
 */
export const SLUGS_REFERENTIELS = [
  'grades',
  'nationalites',
  'fonctions',
  'categories-finance',
] as const;

export type SlugReferentiel = (typeof SLUGS_REFERENTIELS)[number];

export const REFERENTIELS: Record<SlugReferentiel, DefinitionReferentiel> = {
  grades: {
    slug: 'grades',
    table: 'grades',
    titre: 'Grades',
    singulier: 'grade',
    description:
      "Statut ecclesial d'un croyant : Pasteur, Diacre, Croyant… Selectionnable a la creation d'une fiche.",
    triPar: 'ordre',
    colonneOrdre: 'ordre',
    colonnes: [
      { cle: 'libelle', label: 'Libelle' },
      { cle: 'code', label: 'Code', mono: true },
      /**
       * EF-ADM-14 — LE REGLAGE SE VOIT AUTANT QU'IL SE REGLE.
       *
       * Il se posait au formulaire depuis 0048, mais la liste n'en disait rien :
       * savoir quels grades celebrent demandait d'ouvrir chaque fiche. Or c'est
       * une question de COMPARAISON — « qui peut celebrer ? » —, et une question
       * de comparaison veut une reponse en tableau.
       */
      { cle: 'peut_celebrer', label: 'Celebrant', booleen: true },
    ],
    champs: [
      { cle: 'libelle', label: 'Libelle', type: 'texte', requis: true },
      {
        cle: 'code',
        label: 'Code',
        type: 'texte',
        mono: true,
        requis: true,
        immuable: true,
        hint: 'Reference technique stable, non modifiable ensuite.',
      },
      /*
        LE RANG NE SE TAPE PLUS — il se pose en deplaçant la ligne.

        « Ordre d'affichage : 100, 200, 300 » est une representation, pas une
        intention : pour glisser le pasteur avant l'evangeliste il fallait
        deviner un nombre libre entre les deux, et le jour ou il n'y en avait
        plus, renumeroter la liste entiere. Garder le champ A COTE du
        glisser-deposer aurait donne deux chemins pour la meme chose (regle 16),
        et rien n'aurait dit lequel gagne.

        La colonne reste en base et dans le schema : c'est elle qui porte
        l'ordre, seule sa SAISIE change.
      */
      {
        /**
         * EF-ADM-14 — CE REGLAGE ETAIT UNE LISTE ECRITE DANS LE CODE.
         *
         * Un grade cree apres coup ne pouvait jamais celebrer, quoi qu'on fasse
         * a l'ecran : rien ne refusait, rien ne s'affichait, la liste des
         * celebrants etait simplement plus courte. Il se regle desormais ici,
         * la ou le grade lui-meme se definit.
         */
        cle: 'peut_celebrer',
        label: 'Peut celebrer un bapteme',
        type: 'booleen',
        hint: 'Les croyants portant ce grade seront proposes comme celebrants.',
      },
    ],
    schema: z.object({
      code: codeReferentiel,
      libelle,
      // Rien n'ouvre la celebration par defaut : elle se donne, elle ne
      // s'herite pas d'un oubli de saisie.
      peut_celebrer: z.boolean().default(false),
    }),
    usages: [{ table: 'croyants', colonne: 'grade_id', quoi: 'croyant' }],
  },

  nationalites: {
    slug: 'nationalites',
    table: 'nationalites',
    titre: 'Nationalites',
    singulier: 'nationalite',
    description: 'Nationalite portee par la fiche croyant. Code ISO a trois lettres.',
    triPar: 'libelle',
    colonnes: [
      { cle: 'libelle', label: 'Libelle' },
      { cle: 'code_iso', label: 'Code ISO', mono: true },
    ],
    champs: [
      { cle: 'libelle', label: 'Libelle', type: 'texte', requis: true },
      {
        cle: 'code_iso',
        label: 'Code ISO',
        type: 'texte',
        mono: true,
        requis: true,
        immuable: true,
        hint: 'Trois lettres majuscules : BEN, FRA, MLI…',
      },
    ],
    schema: z.object({
      code_iso: z
        .string()
        .trim()
        .length(3, 'Le code ISO comporte exactement trois lettres.')
        .transform((v) => v.toUpperCase())
        .refine((v) => /^[A-Z]{3}$/.test(v), { message: 'Trois lettres majuscules attendues.' }),
      libelle,
    }),
    usages: [{ table: 'croyants', colonne: 'nationalite_id', quoi: 'croyant' }],
  },

  fonctions: {
    slug: 'fonctions',
    table: 'fonctions',
    titre: 'Fonctions',
    singulier: 'fonction',
    description:
      "Role occupe au sein d'un bureau. La hierarchie ne vit pas ici : elle est propre a chaque bureau, dessinee dans son organigramme.",
    triPar: 'ordre_protocolaire',
    colonneOrdre: 'ordre_protocolaire',
    colonnes: [
      { cle: 'libelle', label: 'Libelle' },
      { cle: 'code', label: 'Code', mono: true },
      { cle: 'categorie', label: 'Categorie' },
    ],
    champs: [
      { cle: 'libelle', label: 'Libelle', type: 'texte', requis: true },
      { cle: 'code', label: 'Code', type: 'texte', mono: true, requis: true, immuable: true },
      {
        cle: 'categorie',
        label: 'Categorie',
        type: 'choix',
        requis: true,
        options: [
          { valeur: 'DIRECTION', label: 'Direction' },
          { valeur: 'FINANCE', label: 'Finance' },
          { valeur: 'COMMUNICATION', label: 'Communication' },
          { valeur: 'OEUVRES', label: 'Oeuvres' },
          { valeur: 'AUTRE', label: 'Autre' },
        ],
      },
      {
        cle: 'est_financiere',
        label: 'Fonction financiere',
        type: 'booleen',
        // RG-31 : c'est cet indicateur qui alimente « membres de finances ».
        hint: "Son titulaire sera compte parmi les « membres de finances » des tableaux de bord.",
      },
      {
        cle: 'niveaux_applicables',
        label: 'Niveaux concernes',
        type: 'choix-multiple',
        requis: true,
        options: optionsNiveaux,
        hint: "Une fonction ne sera proposee que dans les bureaux de ces niveaux.",
      },
    ],
    schema: z.object({
      code: codeReferentiel,
      libelle,
      categorie: z.enum(['DIRECTION', 'FINANCE', 'COMMUNICATION', 'OEUVRES', 'AUTRE']),
      est_financiere: z.boolean().default(false),
      niveaux_applicables: z
        .array(z.enum(ENTITY_TYPES))
        .min(1, 'Selectionnez au moins un niveau.'),
    }),
    usages: [
      { table: 'bureau_membres', colonne: 'fonction_id', quoi: 'mandat' },
      // EF-BUR-07 — un bloc pose sur un organigramme compte : le retirer de la
      // base laisserait un plan avec un trou qu'aucun ecran n'explique.
      { table: 'bureau_postes', colonne: 'fonction_id', quoi: 'organigramme' },
    ],
  },

  'categories-finance': {
    slug: 'categories-finance',
    table: 'finance_categories',
    titre: 'Categories financieres',
    singulier: 'categorie',
    description:
      "Nature d'un mouvement. Le SENS (recette ou depense) est porte par la categorie et n'est jamais saisi a la main.",
    triPar: 'ordre',
    colonneOrdre: 'ordre',
    colonnes: [
      { cle: 'libelle', label: 'Libelle' },
      { cle: 'code', label: 'Code', mono: true },
      { cle: 'sens', label: 'Sens' },
    ],
    champs: [
      { cle: 'libelle', label: 'Libelle', type: 'texte', requis: true },
      { cle: 'code', label: 'Code', type: 'texte', mono: true, requis: true, immuable: true },
      {
        cle: 'sens',
        label: 'Sens',
        type: 'choix',
        requis: true,
        immuable: true,
        // RG-13 : le sens est fige a la creation. Le changer retournerait
        // retroactivement le signe de tous les mouvements deja enregistres.
        hint: 'Non modifiable ensuite : les mouvements existants en dependent.',
        options: [
          { valeur: 'RECETTE', label: 'Recette' },
          { valeur: 'DEPENSE', label: 'Depense' },
        ],
      },
    ],
    schema: z.object({
      code: codeReferentiel,
      libelle,
      sens: z.enum(['RECETTE', 'DEPENSE']),
    }),
    // Rien ne les reference encore : les mouvements financiers arrivent au
    // lot 4. Cette liste devra grandir avec eux — d'ou l'interception de la
    // violation de cle etrangere, qui protege meme si on l'oublie.
    usages: [],
  },
};

export function estSlugReferentiel(valeur: string): valeur is SlugReferentiel {
  return (SLUGS_REFERENTIELS as readonly string[]).includes(valeur);
}

/** Libelles lisibles des valeurs enumerees, pour l'affichage en table. */
export const LIBELLES_VALEURS: Record<string, string> = {
  DIRECTION: 'Direction',
  FINANCE: 'Finance',
  COMMUNICATION: 'Communication',
  OEUVRES: 'Oeuvres',
  AUTRE: 'Autre',
  RECETTE: 'Recette',
  DEPENSE: 'Depense',
};
