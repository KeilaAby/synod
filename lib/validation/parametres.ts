import { z } from 'zod';
import {
  DUREE_TOAST_MAX,
  DUREE_TOAST_MIN,
  POSITIONS_TOAST,
  estCouleurHex,
} from '@/lib/domain/apparence';

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
  /** EF-CRO-12 — le circuit de validation des promotions de grade. */
  promotionGradeValidation: z.boolean(),

  /** EF-RAP-07 — les entites composent-elles leurs propres modeles ? */
  rapportCompositionLibre: z.boolean(),

  /** EF-AUT-02 — la reinitialisation passe-t-elle par un courriel ? */
  reinitialisationParEmail: z.boolean(),

  /**
   * EF-ADM-13 — la couleur des boutons principaux.
   *
   * La valeur part dans une FEUILLE DE STYLE : elle doit etre un hexadecimal,
   * et rien d'autre. Le predicat vient du domaine, ou il sert aussi au rendu —
   * la meme regle ecrite deux fois finirait par diverger.
   *
   * La couleur du TEXTE n'est pas demandee : elle se deduit du fond. La laisser
   * saisir permettrait de poser du blanc sur du jaune, et personne ne relit un
   * bouton qu'il a lui-meme regle.
   */
  couleurPrimaire: z
    .string()
    .trim()
    .toLowerCase()
    .refine(estCouleurHex, 'Couleur attendue en hexadecimal : #0f172a.'),

  /**
   * EF-ADM-13 — les notifications.
   *
   * Bornes de la duree : en deca de deux secondes on ne lit pas, au-dela de
   * vingt une notification cesse d'en etre une et s'empile. Une contrainte
   * interdit l'impossible, pas l'inhabituel (regle 26) — d'ou une plage large.
   */
  toastDureeMs: z.coerce
    .number()
    .int('Un nombre entier de millisecondes.')
    .min(DUREE_TOAST_MIN, 'Trop bref pour etre lu.')
    .max(DUREE_TOAST_MAX, 'Au-dela de vingt secondes, les notifications s’empilent.'),

  toastBoutonFermer: z.boolean(),
  toastCouleursVives: z.boolean(),

  /** EF-ADM-13 — le coin. Ensemble clos : les six que Sonner accepte. */
  toastPosition: z.enum(POSITIONS_TOAST, { message: 'Position inconnue.' }),

  /**
   * EF-BUR-08, EF-CRO-12 — le delai de correction de saisie.
   *
   * PARTAGE par le retrait d'un titulaire de bureau et la correction d'un
   * grade : deux constantes a 15 jours, ecrites separement, sont devenues un
   * seul reglage (migration 0069). Bornes identiques a la fenetre des nouveaux
   * baptises, pour la meme raison : un delai nul supprimerait la notion
   * d'erreur rattrapable, et au-dela d'un an « correction de saisie » ne
   * voudrait plus rien dire (regle 26).
   */
  joursCorrectionSaisie: z.coerce
    .number()
    .int('Un nombre entier de jours.')
    .min(1, 'Au moins un jour.')
    .max(365, 'Au-dela d’un an, ce n’est plus une correction de saisie.'),

  /**
   * EF-BAP-07, EF-CRO-11 — LES DEUX PLAFONDS D'IMPORT (migration `0079`).
   *
   * DEUX REGLAGES ET NON UN, parce que ce sont deux gestes de nature
   * differente. Un lot de baptemes est UNE CEREMONIE : son plafond dit ce
   * qu'une celebration peut raisonnablement compter. Un import de croyants
   * est une REPRISE DE DONNEES : son plafond dit ce que le serveur peut
   * avaler d'un coup. Les confondre ferait qu'elargir une reprise de dix
   * mille fiches autoriserait aussi des ceremonies de dix mille baptises.
   *
   * UN PLAFOND NUL FERMERAIT L'IMPORT sans que rien ne le dise : la borne
   * basse vaut 1, et la meme contrainte est posee en base — un reglage se
   * modifie aussi par un appel direct a l'API (regle 26).
   */
  plafondLotBaptemes: z.coerce
    .number()
    .int('Un nombre entier de baptises.')
    .min(1, 'Au moins un baptise, sinon l’import est ferme.')
    .max(20000, 'Au-dela, ce n’est plus une cérémonie.'),

  plafondImportCroyants: z.coerce
    .number()
    .int('Un nombre entier de lignes.')
    .min(1, 'Au moins une ligne, sinon l’import est ferme.')
    .max(20000, 'Au-dela, c’est une restauration : voir la portabilité.'),
});

export type ParametresInput = z.input<typeof parametresSchema>;
