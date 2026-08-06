import {
  ENTITY_TYPES,
  type EntityType,
  ancetreCommun,
  estDescendant,
  profondeur,
} from './hierarchy';
import type { Permission, SessionUtilisateur } from './permissions';
import { peut } from './permissions';
import { type ActionResult, ko, ok } from './result';

/**
 * Workflow d'approbation des transferts — ARB-4, RG-11, RG-12.
 *
 * Module PUR : contrepartie applicative des triggers de `0011_transferts.sql`.
 */

// -----------------------------------------------------------------------------
// Statuts et transitions — RG-11
// -----------------------------------------------------------------------------

export const STATUTS_TRANSFERT = [
  'DEMANDE',
  'APPROUVE',
  'REFUSE',
  'ANNULE',
  'EFFECTUE',
] as const;

export type StatutTransfert = (typeof STATUTS_TRANSFERT)[number];

export const LIBELLES_STATUT_TRANSFERT: Record<StatutTransfert, string> = {
  DEMANDE: 'En attente',
  APPROUVE: 'Approuvé',
  REFUSE: 'Refusé',
  ANNULE: 'Annulé',
  EFFECTUE: 'Effectué',
};

/**
 * Transitions autorisées. DOIT rester aligné sur `fn_transfert_transitions`.
 *
 * `APPROUVE` est un état intermédiaire : l'application effective des
 * rattachements se fait dans une transaction distincte, qui clôt aussi les
 * mandats de bureau. Les séparer permet de rejouer l'application si elle
 * échoue, sans redemander une approbation déjà donnée.
 */
export const TRANSITIONS_TRANSFERT: Record<StatutTransfert, readonly StatutTransfert[]> = {
  DEMANDE: ['APPROUVE', 'REFUSE', 'ANNULE'],
  APPROUVE: ['EFFECTUE', 'ANNULE'],
  REFUSE: [],
  ANNULE: [],
  EFFECTUE: [],
};

export function transitionAutorisee(de: StatutTransfert, vers: StatutTransfert): boolean {
  return TRANSITIONS_TRANSFERT[de].includes(vers);
}

/** Un transfert encore ouvert compte dans la file d'attente (UI-21). */
export function estEnAttente(statut: StatutTransfert): boolean {
  return statut === 'DEMANDE';
}

/** Seul `EFFECTUE` a réellement modifié les rattachements du croyant. */
export function aModifieLeCroyant(statut: StatutTransfert): boolean {
  return statut === 'EFFECTUE';
}

// -----------------------------------------------------------------------------
// Niveau du transfert — EF-TRF-01
// -----------------------------------------------------------------------------

/**
 * Niveau auquel s'opère réellement le changement, déduit du point de divergence
 * des deux chemins.
 *
 * Deux églises d'une même paroisse → transfert d'ÉGLISE. Deux églises de
 * districts différents → transfert de DISTRICT. C'est ce qui permet de dire à
 * l'utilisateur ce qu'il fait vraiment, plutôt que de lui demander de le
 * qualifier lui-même.
 */
export function niveauDeTransfert(
  cheminEgliseOrigine: string | null,
  cheminEgliseDestination: string,
  changementDeCellule = false,
): EntityType {
  // Même église : seul le rattachement en cellule bouge.
  if (!cheminEgliseOrigine || cheminEgliseOrigine === cheminEgliseDestination) {
    return changementDeCellule ? 'CELLULE' : 'EGLISE';
  }

  const commun = ancetreCommun(cheminEgliseOrigine, cheminEgliseDestination);
  if (!commun) return ENTITY_TYPES[1] ?? 'REGIONAL'; // aucune racine partagée

  // `profondeur(commun)` compte les niveaux partagés ; le premier niveau qui
  // diverge est donc celui d'indice `profondeur` dans ENTITY_TYPES.
  return ENTITY_TYPES[Math.min(profondeur(commun), ENTITY_TYPES.length - 1)] ?? 'EGLISE';
}

// -----------------------------------------------------------------------------
// Compétence de l'approbateur — RG-12
// -----------------------------------------------------------------------------

export const PERMISSION_APPROBATION: Permission = 'transfer.approve';

/**
 * RG-12 — l'approbateur détient `transfer.approve` ET son périmètre couvre le
 * plus petit ancêtre commun des deux entités.
 *
 * Exiger la couverture de l'ancêtre commun, et non de l'une des deux entités,
 * empêche un district « d'aspirer » les croyants d'un district voisin : il
 * faudrait pour cela une habilitation au niveau qui les contient tous deux.
 */
export function estApprobateurCompetent(
  session: SessionUtilisateur,
  cheminAncetreCommun: string,
): boolean {
  return peut(session, PERMISSION_APPROBATION, cheminAncetreCommun);
}

/** Le plus petit ancêtre commun, ou `null` si les chemins ne se rejoignent pas. */
export function ancetreCommunTransfert(
  cheminOrigine: string,
  cheminDestination: string,
): string | null {
  return ancetreCommun(cheminOrigine, cheminDestination);
}

// -----------------------------------------------------------------------------
// Éligibilité d'une demande
// -----------------------------------------------------------------------------

export interface CibleTransfert {
  readonly egliseId: string;
  readonly cheminEglise: string;
  readonly celluleId: string | null;
}

/**
 * Un transfert est-il recevable ? Vérifie ce qui peut l'être sans la base :
 * destination différente de l'origine, et cellule appartenant bien à l'église
 * de destination (RG-05).
 */
export function validerDemandeTransfert(
  origine: CibleTransfert,
  destination: CibleTransfert,
  cheminCelluleDestination: string | null,
): ActionResult<void> {
  const memeEglise = origine.egliseId === destination.egliseId;
  const memeCellule = origine.celluleId === destination.celluleId;

  if (memeEglise && memeCellule) {
    return ko('La destination est identique au rattachement actuel.');
  }

  // RG-05 : la cellule visée doit être fille de l'église visée.
  if (destination.celluleId && cheminCelluleDestination) {
    if (!estDescendant(cheminCelluleDestination, destination.cheminEglise)) {
      return ko("La cellule choisie n'appartient pas à l'église de destination.");
    }
  }

  return ok();
}

/**
 * EF-TRF-05 — auto-approbation d'un transfert interne au périmètre.
 *
 * Trois conditions cumulatives : l'option est active, les DEUX entités sont
 * dans le périmètre du demandeur, et celui-ci est approbateur compétent. Le
 * transfert enchaîne alors demande → approbation → application en une
 * transaction, avec les mêmes écritures d'audit : seule l'attente disparaît,
 * pas la traçabilité.
 */
export function autoApprobationPossible(
  session: SessionUtilisateur,
  cheminOrigine: string,
  cheminDestination: string,
  optionActive: boolean,
): boolean {
  if (!optionActive) return false;

  const dansLePerimetre =
    estDescendant(cheminOrigine, session.scopePath) &&
    estDescendant(cheminDestination, session.scopePath);
  if (!dansLePerimetre) return false;

  const commun = ancetreCommun(cheminOrigine, cheminDestination);
  return commun !== null && estApprobateurCompetent(session, commun);
}
