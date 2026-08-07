import { z } from 'zod';

import { SEXES } from '@/lib/domain/croyant';

/**
 * Saisie d'un nouveau baptise — EF-BAP-01 a 07.
 *
 * EF-BAP-02 : cette saisie CREE le croyant. Il n'y a pas de double saisie, donc
 * pas de « rattacher un bapteme a un croyant existant » — le formulaire est le
 * point d'entree d'une personne dans l'application.
 *
 * FORMULAIRE SIMPLIFIE, ce qui ne veut pas dire incomplet : les champs
 * obligatoires de `croyants` le restent, on ne peut pas inventer une adresse.
 * Ce qui est simplifie, c'est le PARCOURS — un ecran au lieu de trois etapes —
 * et les valeurs par defaut : un nouveau baptise est un « Croyant », son
 * eglise est celle de la ceremonie.
 */

/**
 * Le vide d'un champ facultatif doit rester du vide.
 *
 * `z.coerce` sur un champ optionnel produit des valeurs absurdes a partir de
 * `''` ou `null` — c'est ce qui avait fait naitre des dates au 1er janvier
 * 1970. On normalise AVANT de valider, et le schema reste idempotent : le
 * serveur revalide sans dommage ce que le client a deja transforme.
 */
const optionnel = (schema: z.ZodType<string>) =>
  z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : v),
      schema.optional(),
    )
    .transform((v) => v ?? null);

const dateJour = z.coerce.date({ message: 'Date invalide.' });

export const saisirBaptiseSchema = z
  .object({
    // --- La personne ---
    nom: z.string().trim().min(2, 'Le nom est requis.').max(80),
    prenom: z.string().trim().min(2, 'Le prenom est requis.').max(80),
    sexe: z.enum(SEXES, { message: 'Selectionnez le sexe.' }),
    dateNaissance: dateJour,
    adresse: z.string().trim().min(3, "L'adresse est requise.").max(255),
    telephone: optionnel(
      z
        .string()
        .trim()
        .regex(/^\+?[0-9\s().-]{8,20}$/, 'Numero de telephone invalide.'),
    ),

    // --- Le rattachement (RG-04, RG-05) ---
    egliseId: z.uuid("Selectionnez l'eglise du bapteme."),
    celluleId: z.uuid().optional().nullable(),
    gradeId: z.uuid('Selectionnez un grade.'),
    nationaliteId: z.uuid('Selectionnez une nationalite.'),

    // --- La ceremonie — EF-BAP-03 ---
    dateBapteme: dateJour,
    lieu: optionnel(z.string().trim().max(160)),
    /**
     * EF-BAP-03 — un bapteme est frequemment celebre A PLUSIEURS : un pasteur
     * assiste d'un diacre, deux pasteurs lors d'une ceremonie collective.
     *
     * `preprocess` : le champ peut arriver absent d'un formulaire qui ne l'a
     * pas touche. Le normaliser AVANT de valider garde le schema idempotent —
     * le serveur revalide sans dommage ce que le client a deja transforme.
     */
    celebrantIds: z
      .preprocess(
        (v) => (v === undefined || v === null ? [] : v),
        z.array(z.uuid()).max(10, 'Dix celebrants au plus.'),
      )
      .transform((v) => [...new Set(v)]),
    /** « Ceremonie de Paques 2026 » : ce qui regroupe un lot (EF-BAP-07). */
    sessionLibelle: optionnel(z.string().trim().max(120)),
  })
  // RG-28 — un bapteme ne precede pas une naissance. La regle est portee par le
  // domaine ; ici on l'ancre sur le champ fautif pour que le message se pose au
  // bon endroit dans le formulaire.
  .refine((d) => d.dateBapteme >= d.dateNaissance, {
    message: 'La date de bapteme ne peut pas preceder la date de naissance.',
    path: ['dateBapteme'],
  });

export type SaisirBaptiseInput = z.input<typeof saisirBaptiseSchema>;
export type SaisirBaptiseValide = z.output<typeof saisirBaptiseSchema>;
