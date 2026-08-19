import { z } from 'zod';

/**
 * EF-ADM-11, EF-ADM-13 — les parametres generaux de l'organisation.
 *
 * UN SEUL SCHEMA POUR TOUT L'ECRAN, et non un par option. C'est ce que dit
 * EF-ADM-13 : les options configurables se reglent au MEME endroit. Un schema
 * par champ aurait produit autant d'actions, donc autant d'allers-retours pour
 * une seule visite (regle 28) — et surtout autant d'endroits ou verifier
 * `settings.manage`.
 *
 * TOUS LES CHAMPS SONT OBLIGATOIRES ICI, contrairement a la regle 19 qui veut
 * qu'une action n'ecrive que ce dont son formulaire est la source. La raison
 * est que ce formulaire EST la source de tous : il les affiche tous, il les
 * renvoie tous. Un champ facultatif laisserait passer un envoi partiel, et
 * l'option absente reviendrait a son defaut sans que personne ne l'ait voulu.
 */

/**
 * Les fuseaux proposes.
 *
 * LISTE COURTE ET EXPLICITE plutot que les six cents identifiants de l'IANA :
 * l'organisation est a Madagascar, et un selecteur de six cents entrees ferait
 * chercher « Indian/Antananarivo » parmi « America/Indiana/Knox ». Les voisins
 * y sont pour le jour ou une antenne ouvre ailleurs.
 */
export const FUSEAUX = [
  'Indian/Antananarivo',
  'Africa/Nairobi',
  'Africa/Porto-Novo',
  'Africa/Abidjan',
  'Europe/Paris',
  'UTC',
] as const;

export const parametresSchema = z.object({
  nomOrganisation: z
    .string()
    .trim()
    .min(2, 'Le nom de l’organisation est requis.')
    .max(120),

  /**
   * ARB-7 — la devise est UNIQUE pour toute l'organisation, le multi-devises a
   * ete retire du perimetre. Trois lettres, comme un code ISO 4217 : `MGA`,
   * `EUR`, `XOF`. On ne valide pas la liste — elle bouge, et refuser une devise
   * qui existe serait pire que d'en accepter une qui n'existe pas.
   */
  devise: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Code de devise attendu sur trois lettres (MGA, EUR…).'),

  fuseauHoraire: z.enum(FUSEAUX, { message: 'Fuseau horaire inconnu.' }),

  /**
   * ARB-5 / RG-30 — la fenetre « nouveaux baptises ».
   *
   * Bornee entre 1 et 365 : zero jour ferait disparaitre la notion, et au-dela
   * d'un an « nouveau » ne veut plus rien dire. Une contrainte interdit
   * l'impossible, pas l'inhabituel (regle 26).
   */
  fenetreNouveauxBaptisesJours: z.coerce
    .number()
    .int('Un nombre entier de jours.')
    .min(1, 'Au moins un jour.')
    .max(365, 'Au-dela d’un an, « nouveau » ne veut plus rien dire.'),

  /** ARB-3 — workflow de validation financiere, defaut de l'organisation. */
  financeValidationActive: z.boolean(),
  separationSaisieValidation: z.boolean(),

  /** ARB-4 / EF-TRF-05 — auto-approbation des transferts internes. */
  transfertAutoApprobationInterne: z.boolean(),

  /** EF-RAP-07 — les entites composent-elles leurs propres modeles ? */
  rapportCompositionLibre: z.boolean(),

  /** EF-AUT-02 — la reinitialisation passe-t-elle par un courriel ? */
  reinitialisationParEmail: z.boolean(),
});

export type ParametresInput = z.input<typeof parametresSchema>;
