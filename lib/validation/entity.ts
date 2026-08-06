import { z } from 'zod';

import {
  CODE_LONGUEUR_MAX,
  CODE_LONGUEUR_MIN,
  CODE_PATTERN,
  ENTITY_TYPES,
} from '@/lib/domain/hierarchy';

/**
 * Schemas des entites — plan.md §7.4, RG-01 a RG-03.
 *
 * Le MEME schema alimente React Hook Form et la Server Action.
 * Les contraintes doivent rester alignees sur `0003_entities.sql` :
 * `entities_code_len`, `entities_code_format`, `entities_racine`.
 */

const codeSchema = z
  .string()
  .trim()
  .min(CODE_LONGUEUR_MIN, `Le code doit comporter au moins ${CODE_LONGUEUR_MIN} caracteres.`)
  .max(CODE_LONGUEUR_MAX, `Le code ne peut depasser ${CODE_LONGUEUR_MAX} caracteres.`)
  .transform((v) => v.toUpperCase())
  .refine((v) => CODE_PATTERN.test(v), {
    message:
      'Lettres majuscules, chiffres et tirets uniquement, en commencant par une lettre ou un chiffre.',
  });

export const creerEntiteSchema = z.object({
  type: z.enum(ENTITY_TYPES, { message: "Selectionnez un type d'entite." }),
  code: codeSchema,
  nom: z.string().trim().min(2, 'Le nom est requis.').max(120),
  // RG-01 : null n'est valide que pour le Siege. Le controle croise type/parent
  // est fait par `validerRattachement`, qui produit un message explicite.
  parentId: z.uuid('Selectionnez une entite parente.').nullable(),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  // EF-STR-10 : autorise la saisie financiere deleguee par le Siege (ARB-2).
  sansAccesApplication: z.boolean().default(false),
});

export type CreerEntiteInput = z.input<typeof creerEntiteSchema>;
export type CreerEntiteValide = z.output<typeof creerEntiteSchema>;

export const modifierEntiteSchema = creerEntiteSchema
  .omit({ type: true, parentId: true })
  .extend({
    id: z.uuid(),
    isActive: z.boolean().default(true),
  });

export type ModifierEntiteInput = z.input<typeof modifierEntiteSchema>;

/** EF-STR-07 — rattachement a un nouveau parent : deplace tout le sous-arbre. */
export const rattacherEntiteSchema = z.object({
  id: z.uuid(),
  nouveauParentId: z.uuid('Selectionnez la nouvelle entite parente.'),
});

export const supprimerEntiteSchema = z.object({
  id: z.uuid(),
});

/** Filtres de la liste des entites — EF-STR-09. */
export const filtresEntiteSchema = z.object({
  recherche: z.string().trim().max(120).optional(),
  type: z.enum(ENTITY_TYPES).optional(),
  parentId: z.uuid().optional(),
  actif: z.enum(['tous', 'actifs', 'inactifs']).default('tous'),
});

export type FiltresEntite = z.output<typeof filtresEntiteSchema>;
