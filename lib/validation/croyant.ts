import { z } from 'zod';

import { SEXES, STATUTS_CROYANT, STATUTS_MARITAUX } from '@/lib/domain/croyant';

/**
 * Schémas du croyant — plan.md §7.4, cdg.md §5.2.
 *
 * Le MÊME schéma alimente React Hook Form et la Server Action. Les contraintes
 * restent alignées sur `0010_croyants.sql` : la base garantit l'invariant, ces
 * schémas produisent le message destiné à l'utilisateur.
 */

/** Date sans heure : une saisie `<input type="date">` arrive en `YYYY-MM-DD`. */
const dateJour = z.coerce.date({ message: 'Date invalide.' });

/**
 * Trois valeurs signifient « pas de date » et doivent être traitées à
 * l'identique :
 *   - `''`        — champ laissé vide dans le formulaire
 *   - `undefined` — champ absent de la charge utile
 *   - `null`      — **valeur produite par ce schéma lui-même**
 *
 * Ce dernier cas est le piège : le client valide la saisie, obtient `null`,
 * puis envoie ce `null` à la Server Action qui REVALIDE avec le même schéma.
 * Sans normalisation, `z.coerce.date(null)` donne `new Date(null)`, soit le
 * 1er janvier 1970 — une date valide, antérieure à toute naissance, qui faisait
 * échouer le contrôle de cohérence sur un champ pourtant vide.
 *
 * Un schéma partagé client/serveur doit donc être IDEMPOTENT : parser sa
 * propre sortie doit redonner la même valeur. Un test le verrouille.
 */
const dateJourOptionnelle = z
  .preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.date({ message: 'Date invalide.' }).optional(),
  )
  .transform((v) => v ?? null);

/** Même piège d'idempotence que ci-dessus, pour les chaînes facultatives. */
const optionnel = (schema: z.ZodType<string>) =>
  z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : v),
      schema.optional(),
    )
    .transform((v) => v ?? null);

export const croyantSchema = z
  .object({
    nom: z.string().trim().min(2, 'Le nom est requis.').max(80),
    prenom: z.string().trim().min(2, 'Le prénom est requis.').max(80),
    sexe: z.enum(SEXES, { message: 'Le sexe est requis.' }),
    statutMarital: z.enum(STATUTS_MARITAUX).optional().nullable(),

    email: optionnel(z.email('Adresse e-mail invalide.')),
    telephone: optionnel(
      z
        .string()
        .trim()
        .regex(/^\+?[0-9\s().-]{8,20}$/, 'Numéro de téléphone invalide.'),
    ),

    dateNaissance: dateJour,
    // Facultative : une fiche se cree souvent avant que la date ne soit connue.
    dateBapteme: dateJourOptionnelle,
    adresse: z.string().trim().min(3, "L'adresse est requise.").max(255),

    // RG-04 — rattachement principal obligatoire.
    egliseId: z.uuid('Sélectionnez une église.'),
    // RG-05 — facultatif ; l'appartenance à l'église est vérifiée côté serveur.
    celluleId: z.uuid().optional().nullable(),

    gradeId: z.uuid('Sélectionnez un grade.'),
    nationaliteId: z.uuid('Sélectionnez une nationalité.'),

    photoKey: z.string().max(255).optional().nullable(),

    /** EF-CRO-13 — passe outre l'avertissement de doublon, en connaissance de cause. */
    doublonAccepte: z.boolean().default(false),
  })
  // RG-28 — la règle est portée par le domaine ; ici on l'ancre sur le champ
  // fautif pour que le message se pose au bon endroit dans le formulaire.
  .refine((d) => !d.dateBapteme || d.dateBapteme >= d.dateNaissance, {
    message: 'La date de baptême ne peut pas précéder la date de naissance.',
    path: ['dateBapteme'],
  });

export type CroyantInput = z.input<typeof croyantSchema>;
export type CroyantValide = z.output<typeof croyantSchema>;

export const modifierCroyantSchema = z.object({
  id: z.uuid(),
  nom: z.string().trim().min(2, 'Le nom est requis.').max(80),
  prenom: z.string().trim().min(2, 'Le prénom est requis.').max(80),
  sexe: z.enum(SEXES),
  statutMarital: z.enum(STATUTS_MARITAUX).optional().nullable(),
  email: optionnel(z.email('Adresse e-mail invalide.')),
  telephone: optionnel(
    z
      .string()
      .trim()
      .regex(/^\+?[0-9\s().-]{8,20}$/, 'Numéro de téléphone invalide.'),
  ),
  dateNaissance: dateJour,
  dateBapteme: dateJourOptionnelle,
  adresse: z.string().trim().min(3, "L'adresse est requise.").max(255),
  // Le rattachement se change par TRANSFERT (EF-TRF-01), pas par ce formulaire.
  celluleId: z.uuid().optional().nullable(),
  gradeId: z.uuid(),
  nationaliteId: z.uuid(),
  statut: z.enum(STATUTS_CROYANT),
  photoKey: z.string().max(255).optional().nullable(),
});

export type ModifierCroyantInput = z.input<typeof modifierCroyantSchema>;

export const supprimerCroyantSchema = z.object({ id: z.uuid() });

// -----------------------------------------------------------------------------
// Filtres et pagination — EF-CRO-04, ENF-PRF-08
// -----------------------------------------------------------------------------

export const TAILLE_PAGE_DEFAUT = 25;
export const TAILLE_PAGE_MAX = 100;

export const filtresCroyantSchema = z.object({
  recherche: z.string().trim().max(120).optional(),
  /** Périmètre : n'importe quel niveau, pas seulement l'église. */
  entiteId: z.uuid().optional(),
  celluleId: z.uuid().optional(),
  sexe: z.enum(SEXES).optional(),
  gradeId: z.uuid().optional(),
  nationaliteId: z.uuid().optional(),
  statutMarital: z.enum(STATUTS_MARITAUX).optional(),
  statut: z.enum(STATUTS_CROYANT).optional().default('ACTIF'),
  /** EF-CRO-04 — présence ou non en cellule. */
  encellule: z.enum(['tous', 'oui', 'non']).default('tous'),
  baptiseDepuis: z.coerce.date().optional(),
  baptiseJusqua: z.coerce.date().optional(),
  ageMin: z.coerce.number().int().min(0).max(130).optional(),
  ageMax: z.coerce.number().int().min(0).max(130).optional(),

  tri: z.enum(['nom', 'prenom', 'date_bapteme', 'created_at']).default('nom'),
  ordre: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  taille: z.coerce.number().int().min(1).max(TAILLE_PAGE_MAX).default(TAILLE_PAGE_DEFAUT),
});

export type FiltresCroyant = z.output<typeof filtresCroyantSchema>;

/** Lit les filtres depuis l'URL, en ignorant silencieusement ce qui est invalide. */
export function filtresDepuisParams(
  params: Record<string, string | undefined>,
): FiltresCroyant {
  const analyse = filtresCroyantSchema.safeParse({
    recherche: params.q,
    entiteId: params.entite,
    celluleId: params.cellule,
    sexe: params.sexe,
    gradeId: params.grade,
    nationaliteId: params.nationalite,
    statutMarital: params.marital,
    statut: params.statut,
    encellule: params.encellule,
    baptiseDepuis: params.bapteme_debut,
    baptiseJusqua: params.bapteme_fin,
    ageMin: params.age_min,
    ageMax: params.age_max,
    tri: params.tri,
    ordre: params.ordre,
    page: params.page,
    taille: params.taille,
  });

  // Une URL bricolée ne doit pas casser la page : on retombe sur les défauts.
  return analyse.success ? analyse.data : filtresCroyantSchema.parse({});
}
