import { z } from 'zod';

/**
 * Schemas des bureaux — EF-BUR-01 a 09.
 *
 * Le MEME schema alimente React Hook Form et la Server Action.
 */

const dateJour = z.coerce.date({ message: 'Date invalide.' });

/**
 * `z.preprocess` et non `z.coerce` sur un champ facultatif : `coerce.date('')`
 * donne le 1er janvier 1970, et le schema doit rester idempotent — le serveur
 * revalide ce que le client a deja transforme (regle 12).
 */
const dateJourOptionnelle = z
  .preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.date({ message: 'Date invalide.' }).optional(),
  )
  .transform((v) => v ?? null);

/**
 * La borne est `>=`, comme la contrainte `bureaux_periode` depuis la migration
 * 0020 : un mandat ne se clot pas AVANT d'avoir commence, mais le jour meme est
 * permis. Un schema plus strict que la base refuserait ce que la base accepte,
 * et le message de refus ne viendrait alors ni de l'un ni de l'autre.
 */
const finApresDebut = {
  message: 'La date de fin ne peut pas preceder la date de debut.',
  path: ['dateFin'],
};

export const ouvrirMandatSchema = z
  .object({
    entityId: z.uuid("Selectionnez l'entite."),
    libelle: z.string().trim().min(3, 'Le libelle est requis.').max(160),
    dateDebut: dateJour,
    /**
     * EF-BUR-02, RG-07 — LE TERME EST EXIGE A L'OUVERTURE.
     *
     * Depuis qu'un mandat echu ferme l'application, un bureau sans terme ne
     * s'acheve jamais, et l'acces de ses membres non plus : la regle « seuls
     * les membres en exercice ont un compte » deviendrait inapplicable.
     *
     * Il reste MODIFIABLE : `modifierBureauSchema` accepte l'absence, parce que
     * les bureaux ouverts avant cette regle n'en ont pas — et qu'inventer une
     * date de fin de mandat serait pire que de la laisser vide. Le trigger
     * `trg_bureau_terme_requis` (migration 0059) porte la meme borne en base,
     * a l'INSERT seulement.
     */
    dateFin: dateJour,
    /** EF-BUR-09 — reprendre la composition du mandat qui se clot. */
    reconduire: z.boolean().default(false),
  })
  .refine((d) => d.dateFin >= d.dateDebut, finApresDebut);

export type OuvrirMandatInput = z.input<typeof ouvrirMandatSchema>;

/**
 * EF-BUR-02 — modification d'un bureau : son NOM et ses DATES.
 *
 * `entityId` est absent, et ce n'est pas un oubli : deplacer un bureau d'une
 * entite a une autre invaliderait RG-09 pour chacun de ses titulaires — ils
 * appartiennent au sous-arbre de l'entite d'origine, pas de la nouvelle. Un tel
 * deplacement se fait en cloturant ici et en ouvrant la-bas.
 *
 * Le CYCLE DE VIE n'y figure pas non plus : ouvrir, clore et supprimer ont
 * chacun leur chemin. Un formulaire qui modifierait `is_active` en ferait un
 * quatrieme, muet sur ses consequences.
 */
export const modifierBureauSchema = z
  .object({
    bureauId: z.uuid(),
    libelle: z.string().trim().min(3, 'Le libelle est requis.').max(160),
    dateDebut: dateJour,
    dateFin: dateJourOptionnelle,
  })
  .refine((d) => !d.dateFin || d.dateFin >= d.dateDebut, finApresDebut);

export type ModifierBureauInput = z.input<typeof modifierBureauSchema>;

export const cloreMandatSchema = z.object({
  bureauId: z.uuid(),
  dateFin: dateJour,
});

/** Lecture a la demande de la composition d'une entite — EF-STR-04. */
export const compositionEntiteSchema = z.object({
  entityId: z.uuid(),
});

/**
 * EF-BUR-07 — disposition de l'organigramme, enregistree D'UN BLOC.
 *
 * Un seul appel pour tout le plan, et non un par bloc deplace : les gestes
 * s'enchainent — on deplace, on relie, on redeplace — et une suite d'ecritures
 * independantes laisserait des etats intermediaires ou un trait pointe vers un
 * bloc dont la position n'est pas encore enregistree.
 *
 * Le plafond protege d'un envoi absurde : un bureau compte quelques dizaines de
 * fonctions, jamais deux cents.
 */
export const dispositionSchema = z.object({
  bureauId: z.uuid(),
  postes: z
    .array(
      z.object({
        fonctionId: z.uuid(),
        parentFonctionId: z.uuid().nullable(),
        /**
         * EF-BUR-07 — le poste se dessine A COTE DU TRONC de son superieur.
         *
         * `default(false)` et non `optional()` : un plan enregistre avant cette
         * version n'envoie pas le champ, et l'absence doit valoir « pose
         * normalement » — jamais `undefined`, qui effacerait la colonne.
         */
        enDerivation: z.boolean().default(false),
        // Bornees : une coordonnee absurde placerait un bloc hors de portee du
        // cadrage automatique, et l'organigramme paraitrait vide.
        x: z.number().min(-100_000).max(100_000),
        y: z.number().min(-100_000).max(100_000),
      }),
    )
    .max(200, 'Cet organigramme comporte trop de postes.'),
});

export const designerMembreSchema = z.object({
  bureauId: z.uuid(),
  croyantId: z.uuid('Selectionnez un croyant.'),
  fonctionId: z.uuid('Selectionnez une fonction.'),
  notes: z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : v),
      z.string().trim().max(300).optional(),
    )
    .transform((v) => v ?? null),
});

export type DesignerMembreInput = z.input<typeof designerMembreSchema>;

/**
 * EF-BUR-08 — remplacement : cloture du mandat individuel ET designation du
 * suivant, en une seule intention. Les separer laisserait la fonction vacante
 * entre les deux, et un remplacement interrompu ressemblerait a un retrait.
 */
export const remplacerMembreSchema = z.object({
  membreId: z.uuid(),
  croyantId: z.uuid('Selectionnez le remplacant.'),
  notes: z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : v),
      z.string().trim().max(300).optional(),
    )
    .transform((v) => v ?? null),
});

/**
 * EF-BUR-08 — retirer un titulaire : une ERREUR, ou une DECISION.
 *
 * Les deux gestes ne laissent pas la meme trace — l'un efface la ligne, l'autre
 * la clot avec son motif —, donc ils ne se devinent pas : le formulaire demande
 * lequel avant d'agir.
 *
 * `motif` reste facultatif au niveau du schema et se verifie au `refine` : un
 * texte exige inconditionnellement ferait echouer le cas ERREUR, qui n'en a pas
 * et n'en veut pas. La fenetre de quinze jours, elle, ne peut PAS se verifier
 * ici — elle depend de la date d'enregistrement du mandat, que seul le serveur
 * connait (`retraitRecevable`).
 */
export const retirerMembreSchema = z
  .object({
    membreId: z.uuid(),
    nature: z.enum(['ERREUR', 'DECISION']),
    motif: z
      .preprocess(
        (v) => (v === '' || v === null || v === undefined ? undefined : v),
        z.string().trim().max(300).optional(),
      )
      .transform((v) => v ?? null),
  })
  .refine((d) => d.nature !== 'DECISION' || (d.motif ?? '').length >= 3, {
    message: 'Indiquez le motif du retrait : deces, demission, sanction…',
    path: ['motif'],
  });

export type RetirerMembreInput = z.input<typeof retirerMembreSchema>;

/**
 * EF-BUR-08 — suppression, a distinguer de la cloture.
 *
 * Aucun champ de plus : rien ne se saisit, la confirmation se fait a l'ecran.
 * Le droit `bureau.delete`, distinct et non delegable, porte la protection.
 */
export const supprimerBureauSchema = z.object({
  bureauId: z.uuid(),
});
