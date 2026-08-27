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
    /**
     * `gradeId` NE FIGURE PAS ICI. Un nouveau baptise est « Croyant », le
     * serveur le resout lui-meme (`trouverGradeCroyant`). Le laisser arriver du
     * client rouvrirait la porte a ce que le formulaire n'affiche plus.
     */
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

// -----------------------------------------------------------------------------
// Lot d'une meme ceremonie — EF-BAP-07
// -----------------------------------------------------------------------------

/**
 * Au-dela, la saisie n'est plus un formulaire : c'est un fichier, et l'import
 * de croyants (EF-CRO-11) le fait deja. Cent lignes tiennent dans une
 * ceremonie reelle, meme large.
 */
export const LIGNES_LOT_MAX = 100;

/**
 * Une ligne du lot : ce qui DISTINGUE une personne.
 *
 * Tout ce que les baptises d'une meme ceremonie partagent — date, lieu,
 * celebrants, session, grade, nationalite — vit dans l'en-tete, pas ici. C'est
 * ce qui rend la grille tenable : huit colonnes au lieu de quinze.
 *
 * `egliseId` est facultatif DANS LE SCHEMA et obligatoire A L'ARRIVEE : quand
 * le perimetre ne compte qu'une eglise, le client ne l'envoie pas et le
 * serveur la deduit. Exiger l'un ou l'autre ici obligerait a deux schemas.
 */
export const ligneLotSchema = z.object({
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
  egliseId: optionnel(z.uuid()),
  celluleId: optionnel(z.uuid()),

  /**
   * EF-BAP-07 — LA NATIONALITE EST UNE COLONNE depuis le 27 aout 2026.
   *
   * Elle valait pour tout le lot, au motif qu'elle ne varie pratiquement
   * jamais au sein d'une ceremonie. C'etait vrai la plupart du temps et faux
   * quand cela comptait : une ceremonie reunit des baptises de plusieurs
   * nationalites, et le champ commun obligeait a corriger les fiches une par
   * une apres coup.
   *
   * FACULTATIVE, et c'est ce qui rend le changement supportable : remplir
   * trente cases identiques serait plus penible que l'ancien champ. Une ligne
   * vide prend « Malagasy », resolue par le serveur contre le referentiel
   * (`trouverNationaliteParDefaut`).
   */
  nationaliteId: optionnel(z.uuid()),
});

export const saisirLotSchema = z
  .object({
    // --- La ceremonie, commune a tout le lot ---
    dateBapteme: dateJour,
    lieu: optionnel(z.string().trim().max(160)),
    sessionLibelle: optionnel(z.string().trim().max(120)),
    celebrantIds: z
      .preprocess(
        (v) => (v === undefined || v === null ? [] : v),
        z.array(z.uuid()).max(10, 'Dix celebrants au plus.'),
      )
      .transform((v) => [...new Set(v)]),

    /**
     * LA NATIONALITE N'EST PLUS ICI — elle est passee sur la LIGNE.
     *
     * Le GRADE, lui, ne se demande toujours pas : un nouveau baptise est
     * « Croyant », et le serveur le resout (`trouverGradeCroyant`).
     */

    lignes: z
      .array(ligneLotSchema)
      .min(1, 'Ajoutez au moins un baptise.')
      .max(LIGNES_LOT_MAX, `Un lot porte sur ${LIGNES_LOT_MAX} baptises au plus.`),
  })
  // RG-28 — la date de ceremonie est commune, les naissances ne le sont pas :
  // la regle se verifie donc ligne a ligne, et le message se pose sur la ligne
  // fautive plutot qu'en bas du formulaire.
  .superRefine((d, ctx) => {
    d.lignes.forEach((ligne, i) => {
      if (d.dateBapteme < ligne.dateNaissance) {
        ctx.addIssue({
          code: 'custom',
          message: 'Ne peut pas etre nee apres le bapteme.',
          path: ['lignes', i, 'dateNaissance'],
        });
      }
    });
  });

export type SaisirLotInput = z.input<typeof saisirLotSchema>;
export type SaisirLotValide = z.output<typeof saisirLotSchema>;
