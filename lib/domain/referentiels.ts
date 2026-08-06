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
}

export interface DefinitionReferentiel {
  readonly slug: string;
  readonly table: string;
  readonly titre: string;
  readonly singulier: string;
  readonly description: string;
  /** Colonne de tri par defaut. */
  readonly triPar: string;
  readonly colonnes: readonly ColonneReferentiel[];
  readonly champs: readonly ChampReferentiel[];
  readonly schema: z.ZodType<Record<string, unknown>>;
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
    colonnes: [
      { cle: 'libelle', label: 'Libelle' },
      { cle: 'code', label: 'Code', mono: true },
      { cle: 'ordre', label: 'Ordre', mono: true, alignementDroite: true },
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
      {
        cle: 'ordre',
        label: "Ordre d'affichage",
        type: 'nombre',
        hint: 'Les valeurs les plus faibles apparaissent en premier.',
      },
    ],
    schema: z.object({
      code: codeReferentiel,
      libelle,
      ordre: z.coerce.number().int().min(0).max(9999).default(100),
    }),
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
  },

  fonctions: {
    slug: 'fonctions',
    table: 'fonctions',
    titre: 'Fonctions',
    singulier: 'fonction',
    description:
      "Role occupe au sein d'un bureau. L'ordre protocolaire pilote la disposition de l'organigramme.",
    triPar: 'ordre_protocolaire',
    colonnes: [
      { cle: 'libelle', label: 'Libelle' },
      { cle: 'code', label: 'Code', mono: true },
      { cle: 'categorie', label: 'Categorie' },
      { cle: 'ordre_protocolaire', label: 'Rang', mono: true, alignementDroite: true },
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
        cle: 'ordre_protocolaire',
        label: 'Rang protocolaire',
        type: 'nombre',
        hint: "Determine la position dans l'organigramme du bureau. 10 = President.",
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
      ordre_protocolaire: z.coerce.number().int().min(0).max(9999).default(100),
      niveaux_applicables: z
        .array(z.enum(ENTITY_TYPES))
        .min(1, 'Selectionnez au moins un niveau.'),
    }),
  },

  'categories-finance': {
    slug: 'categories-finance',
    table: 'finance_categories',
    titre: 'Categories financieres',
    singulier: 'categorie',
    description:
      "Nature d'un mouvement. Le SENS (recette ou depense) est porte par la categorie et n'est jamais saisi a la main.",
    triPar: 'ordre',
    colonnes: [
      { cle: 'libelle', label: 'Libelle' },
      { cle: 'code', label: 'Code', mono: true },
      { cle: 'sens', label: 'Sens' },
      { cle: 'ordre', label: 'Ordre', mono: true, alignementDroite: true },
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
      { cle: 'ordre', label: "Ordre d'affichage", type: 'nombre' },
    ],
    schema: z.object({
      code: codeReferentiel,
      libelle,
      sens: z.enum(['RECETTE', 'DEPENSE']),
      ordre: z.coerce.number().int().min(0).max(9999).default(100),
    }),
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
