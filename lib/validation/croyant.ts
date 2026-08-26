import { z } from 'zod';

import { type ChampEditable, CHAMPS, CHAMPS_EDITABLES } from '@/lib/domain/champ-croyant';
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

    /** EF-CRO-14 — facultatif même si `statutMarital` vaut `MARIE`. */
    conjointId: z.uuid().optional().nullable(),

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
  /**
   * EF-CRO-12 — POURQUOI LE GRADE DESCEND.
   *
   * Facultatif ICI, exige par le SERVEUR quand le nouveau grade est inferieur
   * a l'ancien : le schema ne connait pas le rang des grades — il faudrait
   * charger le referentiel pour le savoir, ce qu'un schema Zod ne fait pas.
   *
   * Le principe est celui du retrait d'un titulaire : ce qui RETIRE quelque
   * chose a quelqu'un se motive, ce qui lui en donne non.
   */
  motifGrade: optionnel(z.string().trim().max(300)),
  /** EF-CRO-14 — facultatif même si `statutMarital` vaut `MARIE`. */
  conjointId: z.uuid().optional().nullable(),
  /**
   * EF-CRO-12 — ERREUR DE SAISIE, OU DECISION ?
   *
   * `DECISION` par defaut : un formulaire ancien, ou un appel qui ne porte pas
   * le champ, doit INSCRIRE le changement. Le defaut inverse ferait disparaitre
   * des promotions de l'historique sans que personne ne l'ait demande — et
   * c'est exactement ce qu'on ne rattrape pas.
   */
  natureGrade: z.enum(['ERREUR', 'DECISION']).default('DECISION'),
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

/**
 * EF-CRO-01 — la modification d'UN SEUL champ, depuis la fiche.
 *
 * UN SCHEMA PAR CHAMP, et non un schéma partiel du croyant. Un
 * `croyantSchema.partial()` accepterait n'importe quelle combinaison — donc
 * aussi `egliseId`, que ce chemin ne doit jamais écrire. Ici la clé est bornée
 * au registre, et la valeur est validée par la règle de CE champ.
 *
 * LA VALEUR ARRIVE EN CHAÎNE, toujours : un `<input>` et un `<select>` ne
 * produisent que cela. La conversion — date, `null` pour un champ vidé — se
 * fait donc ici, une fois, plutôt que dans chaque branche de l'action.
 */
export const champCroyantSchema = z.object({
  id: z.uuid(),
  champ: z.enum(CHAMPS_EDITABLES),
  /**
   * `''` est une valeur LÉGITIME : c'est ainsi qu'on vide un téléphone ou une
   * date de baptême. Le refus d'un vide sur un champ obligatoire se fait plus
   * bas, par `valeurDeChamp`, qui connaît le champ.
   */
  valeur: z.string().max(255),
});

export type ChampCroyantInput = z.input<typeof champCroyantSchema>;

/**
 * La valeur PRÊTE POUR LA BASE, ou le message qui explique le refus.
 *
 * Elle rend `Date | string | null` : c'est le type qu'attend la colonne, pas
 * celui qu'a envoyé l'écran. Le faire ici plutôt que dans l'action garde la
 * règle testable sans base.
 */
export function valeurDeChamp(
  champ: ChampEditable,
  brute: string,
): { ok: true; valeur: string | null } | { ok: false; erreur: string } {
  const def = CHAMPS[champ];
  const texte = brute.trim();

  if (texte === '') {
    return def.facultatif
      ? { ok: true, valeur: null }
      : { ok: false, erreur: `${def.label} ne peut pas être vide.` };
  }

  switch (def.nature) {
    case 'choix': {
      // L'ensemble est CLOS : une valeur hors liste vient d'un appel forgé, pas
      // d'un écran. On la refuse sans chercher à l'interpréter.
      const connue = def.options?.some((o) => o.valeur === texte);
      return connue
        ? { ok: true, valeur: texte }
        : { ok: false, erreur: `Valeur inconnue pour ${def.label.toLowerCase()}.` };
    }

    case 'reference': {
      const uuid = z.uuid().safeParse(texte);
      return uuid.success
        ? { ok: true, valeur: texte }
        : { ok: false, erreur: `${def.label} : référence invalide.` };
    }

    case 'date': {
      // Le format d'un `<input type="date">`. On ne passe PAS par `Date` : un
      // fuseau ferait glisser le 1er janvier au 31 décembre.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(texte)) {
        return { ok: false, erreur: `${def.label} : date invalide.` };
      }
      const [a, m, j] = texte.split('-').map(Number) as [number, number, number];
      const d = new Date(Date.UTC(a, m - 1, j));
      const reelle =
        d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;

      return reelle
        ? { ok: true, valeur: texte }
        : { ok: false, erreur: `${def.label} : cette date n’existe pas.` };
    }

    case 'texte': {
      /**
       * LES BORNES SONT CELLES DU FORMULAIRE COMPLET, et c'est délibéré : deux
       * chemins qui écrivent la même colonne avec deux règles finiraient par
       * accepter ici ce que l'autre refuse.
       */
      if (champ === 'email') {
        return z.email().safeParse(texte).success
          ? { ok: true, valeur: texte }
          : { ok: false, erreur: 'Adresse e-mail invalide.' };
      }
      if ((champ === 'nom' || champ === 'prenom') && texte.length < 2) {
        return { ok: false, erreur: `${def.label} : deux caractères au minimum.` };
      }
      if (champ === 'adresse' && texte.length < 3) {
        return { ok: false, erreur: 'L’adresse est trop courte.' };
      }
      return { ok: true, valeur: texte };
    }
  }
}
