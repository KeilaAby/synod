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

/**
 * Modification d'une fiche — EF-CRO-07.
 *
 * CE QUE CE SCHÉMA N'A PAS, ET POURQUOI. Deux champs de la table sont
 * volontairement absents parce que **ce formulaire ne les possède pas** :
 *
 *   - `egliseId` — se change par TRANSFERT (EF-TRF-01), avec approbation ;
 *   - `photoKey` — a ses propres actions (EF-CRO-09).
 *
 * Un champ qu'un formulaire n'affiche pas mais qu'il envoie quand même arrive
 * vide et **efface la donnée** : `photoKey` figurait ici, et enregistrer la
 * fiche remettait à `null` la photo téléversée dix secondes plus tôt. Sans un
 * message, sans une erreur. Une action ne doit écrire que les champs dont son
 * formulaire est réellement la source.
 */
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
});

export type ModifierCroyantInput = z.input<typeof modifierCroyantSchema>;

export const supprimerCroyantSchema = z.object({ id: z.uuid() });

/*
 * Les filtres de liste ne sont PLUS un schema serveur : ils vivent dans le
 * domaine (`filtrerCroyants`, `FiltresListeCroyants`) et s'appliquent dans le
 * navigateur. Voir `lib/data/croyants.ts` pour la raison — un aller-retour par
 * frappe coutait pres de deux secondes — et la limite qui borne ce choix.
 */
