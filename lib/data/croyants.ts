import 'server-only';

import { cache } from 'react';

import type { EntityType } from '@/lib/domain/hierarchy';
import { cleDoublon } from '@/lib/domain/croyant';
import { createClient } from '@/lib/supabase/server';

import { getArbrePerimetre } from './entities';
import { DataError } from './errors';

/**
 * Lectures des croyants — EF-CRO-04 à 06.
 *
 * ENF-PRF-08 prescrivait un filtrage et une pagination SERVEUR, les croyants
 * visant 200 000 (ENF-PRF-05). Mesuré, ce choix coûtait quatre allers-retours
 * enchaînés par caractère saisi — près de deux secondes par frappe.
 *
 * Le compromis retenu : charger le périmètre en UNE requête tant qu'il tient
 * sous `PLAFOND_CHARGEMENT_INTEGRAL`, et filtrer dans le navigateur. Au-delà,
 * le lot est tronqué et l'interface le dit ; restreindre l'église recharge un
 * périmètre plus étroit. L'exigence de volume est donc tenue par le PLAFOND,
 * plus par la pagination.
 */

/**
 * La ligne porte de quoi REMPLIR le formulaire de modification : ouvrir le
 * pop-up depuis la liste ne coûte alors aucune requête. Ces quatre champs
 * supplémentaires (`statut_marital`, `email`, `telephone`, `adresse`) ne
 * changent pas le nombre de lignes lues — seulement leur largeur.
 */
const CHAMPS_LISTE = `
  id, matricule, nom, prenom, sexe, date_naissance, date_bapteme, statut, created_at,
  photo_key, eglise_id, cellule_id, grade_id, nationalite_id,
  statut_marital, email, telephone, adresse, conjoint_id,
  eglise:entities!croyants_eglise_id_fkey (id, nom, code, path),
  cellule:entities!croyants_cellule_id_fkey (id, nom),
  grade:grades!croyants_grade_id_fkey (id, libelle),
  nationalite:nationalites!croyants_nationalite_id_fkey (id, libelle)
` as const;

export interface CroyantListe {
  id: string;
  /**
   * EF-CRO-12 — ouvre, ou ferme, la fenêtre de correction du grade.
   *
   * Elle voyage avec la LISTE et pas seulement avec la fiche : sans elle, le
   * pop-up ouvert depuis la liste n'offrirait pas la correction que la page
   * pleine offre, pour le même geste (règle 16).
   */
  created_at: string;
  matricule: string;
  nom: string;
  prenom: string;
  sexe: 'M' | 'F';
  date_naissance: string;
  date_bapteme: string | null;
  statut: string;
  photo_key: string | null;
  eglise_id: string;
  cellule_id: string | null;
  grade_id: string;
  nationalite_id: string;
  statut_marital: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string;
  /** EF-CRO-14 — le conjoint déjà lié, s'il y en a un. */
  conjoint_id: string | null;
  // `path` : l'habilitation de modification s'évalue avec sa portée (RG-25).
  eglise: { id: string; nom: string; code: string; path: string } | null;
  cellule: { id: string; nom: string } | null;
  grade: { id: string; libelle: string } | null;
  nationalite: { id: string; libelle: string } | null;
}

/**
 * PLAFOND du chargement intégral — ENF-PRF-05, ENF-PRF-08.
 *
 * Au-delà, la liste repasse en filtrage serveur. La valeur est un compromis
 * assumé : 2 000 fiches pèsent quelques centaines de kilo-octets, transférées
 * UNE fois ; le filtrage serveur, lui, coûtait quatre allers-retours par frappe
 * — près de deux secondes sur une liaison ordinaire.
 *
 * Une paroisse, un district, souvent un régional tiennent sous ce plafond. Le
 * Siège d'une grande organisation, non : là, restreindre d'abord l'église est
 * de toute façon le seul geste utile.
 */
export const PLAFOND_CHARGEMENT_INTEGRAL = 2000;

export interface LotCroyants {
  lignes: CroyantListe[];
  /** Le périmètre dépasse le plafond : `lignes` n'en est qu'une tranche. */
  tronque: boolean;
}

/**
 * Les églises d'un sous-arbre.
 *
 * Le filtre « périmètre » porte sur n'importe quel niveau, mais un croyant est
 * rattaché à une ÉGLISE : on résout donc le sous-arbre en liste d'églises.
 * L'arbre étant déjà en cache, cela ne coûte aucune requête.
 */
async function eglisesDuPerimetre(entiteId?: string): Promise<string[] | null> {
  if (!entiteId) return null;

  const arbre = await getArbrePerimetre();
  const racine = arbre.find((e) => e.id === entiteId);
  if (!racine) return [];

  return arbre
    .filter((e) => e.type === 'EGLISE' && e.path.startsWith(racine.path))
    .map((e) => e.id);
}

/**
 * Charge les croyants du périmètre en UNE requête, pour un filtrage instantané
 * côté client — EF-CRO-04, EF-CRO-05.
 *
 * Le filtrage serveur imposait un aller-retour complet par frappe : session,
 * arbre, référentiels puis liste, enchaînés. Sur la liaison de l'utilisateur,
 * 1,7 s de code applicatif par caractère saisi. Aucune optimisation de requête
 * ne rattrape cela — c'est le nombre d'allers-retours qu'il fallait supprimer,
 * pas leur durée.
 *
 * On lit donc `plafond + 1` lignes : la ligne excédentaire ne sert qu'à
 * SAVOIR que le périmètre déborde, sans payer un `count` séparé.
 */
export async function chargerCroyants(
  entiteId?: string,
  plafond: number = PLAFOND_CHARGEMENT_INTEGRAL,
): Promise<LotCroyants> {
  const sb = await createClient();

  let requete = sb.from('croyants').select(CHAMPS_LISTE).is('deleted_at', null);

  const eglises = await eglisesDuPerimetre(entiteId);
  if (eglises !== null) {
    // Aucune église dans le périmètre demandé : inutile d'interroger la base.
    if (eglises.length === 0) return { lignes: [], tronque: false };
    requete = requete.in('eglise_id', eglises);
  }

  const { data, error } = await requete
    .order('nom')
    .order('prenom')
    .order('id') // départage les homonymes : l'ordre doit être total
    .limit(plafond + 1)
    .returns<CroyantListe[]>();

  if (error) throw new DataError('La liste des croyants est momentanément illisible.', error);

  const lignes = data ?? [];
  return lignes.length > plafond
    ? { lignes: lignes.slice(0, plafond), tronque: true }
    : { lignes, tronque: false };
}

function isoJour(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------

const CHAMPS_FICHE = `
  *,
  eglise:entities!croyants_eglise_id_fkey (id, nom, code, path, type),
  cellule:entities!croyants_cellule_id_fkey (id, nom, code),
  grade:grades!croyants_grade_id_fkey (id, libelle, code),
  nationalite:nationalites!croyants_nationalite_id_fkey (id, libelle, code_iso),
  createur:profiles!croyants_saisi_par_fkey (id, nom_complet)
` as const;

export interface CroyantFiche extends CroyantListe {
  created_at: string;
  updated_at: string;
  eglise: { id: string; nom: string; code: string; path: string; type: EntityType } | null;
  /** EF-CRO-06 — qui a enregistre la fiche. `null` : compte depuis supprime. */
  createur: { id: string; nom_complet: string } | null;
  /**
   * EF-CRO-14 — `null` de DEUX façons distinctes, et l'écran doit les
   * distinguer : `conjoint_id` absent (personne n'est renseigné) contre
   * `conjoint_id` présent mais `conjoint` absent (la RLS l'a masqué — hors du
   * périmètre de l'utilisateur, règle 15 : ce n'est pas une absence, c'est un
   * refus de visibilité qui doit se DIRE).
   */
  conjoint_id: string | null;
  conjoint: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    photo_key: string | null;
    statut: string;
  } | null;
}

export const getCroyant = cache(async (id: string): Promise<CroyantFiche | null> => {
  const sb = await createClient();
  const { data, error } = await sb
    .from('croyants')
    .select(CHAMPS_FICHE)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle<Omit<CroyantFiche, 'conjoint'>>();

  if (error) throw new DataError('Cette fiche est momentanément illisible.', error);
  if (!data) return null;

  /**
   * EF-CRO-14 — UNE SECONDE REQUÊTE, CIBLÉE, PLUTÔT QU'UNE AUTO-JOINTURE
   * POSTGREST SUR `croyants` VERS ELLE-MÊME.
   *
   * PostgREST ne sait pas trancher, pour une table qui se référence
   * elle-même, LA DIRECTION de la relation : le hint par nom de colonne
   * (`croyants!conjoint_id`) rend tantôt une erreur « relation introuvable »,
   * tantôt un TABLEAU au lieu d'un objet — constaté en test le 22 août 2026.
   * Une fiche se lit une à la fois : une requête de plus ici ne coûte rien
   * (à distinguer d'une LISTE, où ce serait du N+1, règle 28).
   *
   * `null` en sortie recouvre deux cas que `.maybeSingle()` ne distingue pas
   * lui-même, mais qui n'ont pas besoin de l'être ICI : conjoint inexistant
   * ou masqué par la RLS (hors périmètre) rendent tous deux `null`, et c'est
   * la comparaison avec `conjoint_id` (colonne brute, toujours lisible) qui
   * permet à l'écran de distinguer « non renseigné » de « hors périmètre ».
   */
  let conjoint: CroyantFiche['conjoint'] = null;
  if (data.conjoint_id) {
    const { data: c } = await sb
      .from('croyants')
      .select('id, nom, prenom, matricule, photo_key, statut')
      .eq('id', data.conjoint_id)
      .is('deleted_at', null)
      .maybeSingle<NonNullable<CroyantFiche['conjoint']>>();
    conjoint = c ?? null;
  }

  return { ...data, conjoint };
});

/**
 * EF-CRO-14 — le vivier du sélecteur de conjoint.
 *
 * MÊME DOCTRINE QUE `CroyantPicker` (règle 17) : les options viennent du
 * serveur déjà bornées au périmètre par la RLS, le filtrage par sexe et par
 * disponibilité (`conjointsProposables`) se fait ensuite en mémoire, sans
 * second aller-retour à chaque changement de statut marital.
 *
 * COLONNES ÉTROITES, VOLONTAIREMENT : ni église, ni cellule, ni grade — ce
 * vivier n'a besoin que de désigner une personne (nom, matricule, photo) et
 * de savoir si elle est déjà prise (`conjoint_id`). La liste complète
 * (`chargerCroyants`) porte des jointures que cet usage ne lit jamais.
 */
export interface OptionConjointRoster {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  sexe: 'M' | 'F';
  photo_key: string | null;
  conjoint_id: string | null;
}

export async function listerCroyantsPourConjoint(): Promise<OptionConjointRoster[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('croyants')
    .select('id, nom, prenom, matricule, sexe, photo_key, conjoint_id')
    .is('deleted_at', null)
    .neq('statut', 'DECEDE')
    .order('nom')
    .order('prenom')
    .limit(5000)
    .returns<OptionConjointRoster[]>();

  // Un echec ne doit pas bloquer tout le formulaire de croyant : le
  // selecteur de conjoint se propose vide plutot que de casser la page.
  if (error) return [];
  return data ?? [];
}

/**
 * EF-CRO-13 — doublons potentiels.
 *
 * La recherche porte sur le nom et la date de naissance, puis le rapprochement
 * exact se fait en mémoire via `cleDoublon` : la base ignore les accents et la
 * casse, le domaine les normalise.
 */
/**
 * EF-CRO-13 pour un LOT — EF-BAP-07.
 *
 * UNE seule requete, quel que soit le nombre de lignes. Appeler
 * `chercherDoublons` trente fois, c'est trente allers-retours sur une liaison
 * ou chacun se mesure entre 0,5 et 4 secondes : la detection de doublons
 * couterait a elle seule plus d'une minute, et exposerait trente fois a la
 * panne (regle 28).
 *
 * Rendu indexe par la cle de rapprochement, pour que l'appelant retrouve la
 * ligne concernee sans reparcourir.
 */
export async function chercherDoublonsLot(
  personnes: readonly { nom: string; prenom: string; dateNaissance: Date }[],
): Promise<Map<string, CroyantListe>> {
  if (personnes.length === 0) return new Map();

  const sb = await createClient();

  const { data, error } = await sb
    .from('croyants')
    .select(CHAMPS_LISTE)
    .is('deleted_at', null)
    // La base filtre sur ce qu'elle indexe — la date —, le rapprochement fin
    // se fait en memoire : elle ignore les accents et la casse, pas le domaine.
    .in('date_naissance', [...new Set(personnes.map((p) => isoJour(p.dateNaissance)))])
    .returns<CroyantListe[]>();

  // Un echec de detection ne doit pas bloquer une creation : on le dit dans le
  // journal, et le lot part sans l'avertissement.
  if (error) return new Map();

  const cibles = new Set(
    personnes.map((p) => cleDoublon(p.nom, p.prenom, p.dateNaissance)),
  );

  const trouves = new Map<string, CroyantListe>();
  for (const c of data ?? []) {
    const cle = cleDoublon(c.nom, c.prenom, new Date(c.date_naissance));
    if (cibles.has(cle) && !trouves.has(cle)) trouves.set(cle, c);
  }

  return trouves;
}

export async function chercherDoublons(
  nom: string,
  prenom: string,
  dateNaissance: Date,
): Promise<CroyantListe[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('croyants')
    .select(CHAMPS_LISTE)
    .is('deleted_at', null)
    .eq('date_naissance', isoJour(dateNaissance))
    .ilike('nom', nom.trim())
    .limit(10)
    .returns<CroyantListe[]>();

  if (error) return []; // un échec de détection ne doit pas bloquer une création

  const cible = cleDoublon(nom, prenom, dateNaissance);
  return (data ?? []).filter(
    (c) => cleDoublon(c.nom, c.prenom, new Date(c.date_naissance)) === cible,
  );
}

