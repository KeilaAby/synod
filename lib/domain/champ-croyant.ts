/**
 * Les champs d'une fiche modifiables SUR PLACE — EF-CRO-01, EF-CRO-06.
 *
 * CE QUE CE REGISTRE SERT. Corriger un numero de telephone demandait d'ouvrir
 * le formulaire complet, de traverser ses trois etapes et de tout renvoyer.
 * Pour un chiffre mal tape, c'est une disproportion — et un formulaire qu'on
 * rouvre pour rien est un formulaire ou l'on finit par changer autre chose par
 * megarde.
 *
 * CE QUI N'Y FIGURE PAS EST AUSSI IMPORTANT QUE CE QUI Y FIGURE.
 *
 *   - L'EGLISE. En changer n'est pas une correction, c'est un TRANSFERT
 *     (EF-TRF-01) : il a son circuit, son approbation et sa trace. Un crayon a
 *     cote de « Eglise » ferait deplacer un croyant sans que personne ne
 *     l'approuve.
 *
 *   - LE GRADE. Il passe par le circuit de promotion (EF-CRO-12), qui demande
 *     s'il s'agit d'une erreur de saisie ou d'une decision, exige un motif pour
 *     une descente, et peut attendre la validation de l'entite superieure.
 *     L'editer d'un clic contournerait tout cela — c'est le pop-up dedie qui
 *     s'en charge, et lui seul.
 *
 *   - LE CONJOINT. Le lien est SYMETRIQUE : le poser ecrit sur DEUX fiches
 *     (migration `0071`), et le choisir demande un selecteur qui exclut les
 *     personnes deja mariees. Un champ de saisie libre n'a pas ces garde-fous.
 *
 * Trois exclusions, trois circuits qui existent deja. La regle qui les reunit :
 * ON N'EDITE SUR PLACE QUE CE QUI NE DECLENCHE RIEN.
 *
 * Module PUR : aucune dependance a la base ni a React, donc directement
 * testable.
 */

import { SEXES, STATUTS_CROYANT, STATUTS_MARITAUX } from './croyant';

export const CHAMPS_EDITABLES = [
  'nom',
  'prenom',
  'sexe',
  'dateNaissance',
  'statutMarital',
  'statut',
  'nationaliteId',
  'celluleId',
  'dateBapteme',
  'adresse',
  'telephone',
  'email',
] as const;

export type ChampEditable = (typeof CHAMPS_EDITABLES)[number];

/**
 * La NATURE du champ decide du controle (regle 18).
 *
 *   `texte` / `date` — un ensemble ouvert : une zone de saisie.
 *   `choix`         — un ensemble CLOS et connu, dont les valeurs sont ici.
 *   `reference`     — un ensemble ouvert mais borne : ses valeurs viennent d'un
 *                     referentiel ou de la base, et voyagent avec l'ecran.
 */
export type NatureChamp = 'texte' | 'date' | 'choix' | 'reference';

export interface OptionChamp {
  readonly valeur: string;
  readonly libelle: string;
}

export interface DefinitionChamp {
  readonly cle: ChampEditable;
  readonly label: string;
  readonly nature: NatureChamp;
  /** La colonne SQL. Le registre est la SEULE table de correspondance. */
  readonly colonne: string;
  /** Une valeur vide est-elle acceptable ? Decide du « — Aucun » du selecteur. */
  readonly facultatif: boolean;
  /** Pour `choix` : l'ensemble clos, ecrit ici. */
  readonly options?: readonly OptionChamp[];
  readonly aide?: string;
}

const LIBELLES_SEXE_COURT: Record<string, string> = { M: 'Masculin', F: 'Féminin' };

const LIBELLES_MARITAL: Record<string, string> = {
  CELIBATAIRE: 'Célibataire',
  MARIE: 'Marié(e)',
  VEUF: 'Veuf/Veuve',
  DIVORCE: 'Divorcé(e)',
  AUTRE: 'Autre',
};

const LIBELLES_STATUT: Record<string, string> = {
  ACTIF: 'Actif',
  INACTIF: 'Inactif',
  TRANSFERE: 'Transféré',
  DECEDE: 'Décédé',
};

export const CHAMPS: Record<ChampEditable, DefinitionChamp> = {
  nom: { cle: 'nom', label: 'Nom', nature: 'texte', colonne: 'nom', facultatif: false },
  prenom: {
    cle: 'prenom',
    label: 'Prénom',
    nature: 'texte',
    colonne: 'prenom',
    facultatif: false,
  },
  sexe: {
    cle: 'sexe',
    label: 'Sexe',
    nature: 'choix',
    colonne: 'sexe',
    facultatif: false,
    options: SEXES.map((s) => ({ valeur: s, libelle: LIBELLES_SEXE_COURT[s] ?? s })),
    // Certains grades sont reserves a un sexe (`grades.sexe_autorise`, 0075) :
    // le serveur refuse le changement qui rendrait le grade en cours illegal.
    aide: 'Le grade en cours doit rester compatible.',
  },
  dateNaissance: {
    cle: 'dateNaissance',
    label: 'Date de naissance',
    nature: 'date',
    colonne: 'date_naissance',
    facultatif: false,
  },
  statutMarital: {
    cle: 'statutMarital',
    label: 'Statut marital',
    nature: 'choix',
    colonne: 'statut_marital',
    facultatif: true,
    options: STATUTS_MARITAUX.map((s) => ({
      valeur: s,
      libelle: LIBELLES_MARITAL[s] ?? s,
    })),
  },
  statut: {
    cle: 'statut',
    label: 'Statut',
    nature: 'choix',
    colonne: 'statut',
    facultatif: false,
    options: STATUTS_CROYANT.map((s) => ({
      valeur: s,
      libelle: LIBELLES_STATUT[s] ?? s,
    })),
  },
  nationaliteId: {
    cle: 'nationaliteId',
    label: 'Nationalité',
    nature: 'reference',
    colonne: 'nationalite_id',
    facultatif: false,
  },
  celluleId: {
    cle: 'celluleId',
    label: 'Cellule',
    nature: 'reference',
    colonne: 'cellule_id',
    facultatif: true,
    // RG-05 — la cellule doit appartenir a l'eglise du croyant. La liste est
    // deja bornee a l'ecran, et le serveur le revalide.
    aide: 'Seules les cellules de son église.',
  },
  dateBapteme: {
    cle: 'dateBapteme',
    label: 'Date de baptême',
    nature: 'date',
    colonne: 'date_bapteme',
    facultatif: true,
  },
  adresse: {
    cle: 'adresse',
    label: 'Adresse',
    nature: 'texte',
    colonne: 'adresse',
    facultatif: false,
  },
  telephone: {
    cle: 'telephone',
    label: 'Téléphone',
    nature: 'texte',
    colonne: 'telephone',
    facultatif: true,
  },
  email: {
    cle: 'email',
    label: 'Adresse e-mail',
    nature: 'texte',
    colonne: 'email',
    facultatif: true,
  },
};

export function estChampEditable(valeur: unknown): valeur is ChampEditable {
  return (CHAMPS_EDITABLES as readonly unknown[]).includes(valeur);
}

/**
 * La colonne SQL d'un champ — LE SEUL POINT DE TRADUCTION.
 *
 * L'action ecrit `{ [colonneDe(champ)]: valeur }` : une cle qui n'est pas dans
 * ce registre ne peut donc designer aucune colonne. C'est ce qui empeche un
 * appel forge d'ecrire `eglise_id` ou `matricule` en passant par ce chemin,
 * sans qu'aucune liste noire n'ait a etre tenue a jour.
 */
export function colonneDe(champ: ChampEditable): string {
  return CHAMPS[champ].colonne;
}
