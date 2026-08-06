import 'server-only';

import { cache } from 'react';

import type { EntityType } from '@/lib/domain/hierarchy';
import { cleDoublon } from '@/lib/domain/croyant';
import { createClient } from '@/lib/supabase/server';
import type { FiltresCroyant } from '@/lib/validation/croyant';

import { getArbrePerimetre } from './entities';
import { DataError } from './errors';

/**
 * Lectures des croyants — EF-CRO-04 à 06.
 *
 * PAGINATION SERVEUR obligatoire (ENF-PRF-08) : contrairement aux entités,
 * bornées à quelques milliers, les croyants visent 200 000 (ENF-PRF-05). Rien
 * n'est jamais chargé intégralement côté client.
 */

const CHAMPS_LISTE = `
  id, matricule, nom, prenom, sexe, date_naissance, date_bapteme, statut,
  photo_key, eglise_id, cellule_id, grade_id, nationalite_id,
  eglise:entities!croyants_eglise_id_fkey (id, nom, code),
  cellule:entities!croyants_cellule_id_fkey (id, nom),
  grade:grades (id, libelle),
  nationalite:nationalites (id, libelle)
` as const;

export interface CroyantListe {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  sexe: 'M' | 'F';
  date_naissance: string;
  date_bapteme: string;
  statut: string;
  photo_key: string | null;
  eglise_id: string;
  cellule_id: string | null;
  grade_id: string;
  nationalite_id: string;
  eglise: { id: string; nom: string; code: string } | null;
  cellule: { id: string; nom: string } | null;
  grade: { id: string; libelle: string } | null;
  nationalite: { id: string; libelle: string } | null;
}

export interface PageCroyants {
  lignes: CroyantListe[];
  total: number;
  page: number;
  taille: number;
  nbPages: number;
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

export async function listerCroyants(filtres: FiltresCroyant): Promise<PageCroyants> {
  const sb = await createClient();

  let requete = sb
    .from('croyants')
    .select(CHAMPS_LISTE, { count: 'exact' })
    .is('deleted_at', null);

  const eglises = await eglisesDuPerimetre(filtres.entiteId);
  if (eglises !== null) {
    // Aucune église dans le périmètre demandé : inutile d'interroger la base.
    if (eglises.length === 0) {
      return { lignes: [], total: 0, page: 1, taille: filtres.taille, nbPages: 0 };
    }
    requete = requete.in('eglise_id', eglises);
  }

  if (filtres.celluleId) requete = requete.eq('cellule_id', filtres.celluleId);
  if (filtres.sexe) requete = requete.eq('sexe', filtres.sexe);
  if (filtres.gradeId) requete = requete.eq('grade_id', filtres.gradeId);
  if (filtres.nationaliteId) requete = requete.eq('nationalite_id', filtres.nationaliteId);
  if (filtres.statutMarital) requete = requete.eq('statut_marital', filtres.statutMarital);
  if (filtres.statut) requete = requete.eq('statut', filtres.statut);

  if (filtres.encellule === 'oui') requete = requete.not('cellule_id', 'is', null);
  if (filtres.encellule === 'non') requete = requete.is('cellule_id', null);

  if (filtres.baptiseDepuis) {
    requete = requete.gte('date_bapteme', isoJour(filtres.baptiseDepuis));
  }
  if (filtres.baptiseJusqua) {
    requete = requete.lte('date_bapteme', isoJour(filtres.baptiseJusqua));
  }

  // Tranche d'âge -> intervalle de dates de naissance. Le sens s'inverse :
  // l'âge MINIMUM correspond à la date de naissance la plus RÉCENTE.
  if (filtres.ageMin !== undefined) {
    requete = requete.lte('date_naissance', isoJour(dateAnniversaire(filtres.ageMin)));
  }
  if (filtres.ageMax !== undefined) {
    requete = requete.gte('date_naissance', isoJour(dateAnniversaire(filtres.ageMax + 1)));
  }

  // EF-CRO-05 — colonne générée + index trigram : `ilike` reste indexé.
  if (filtres.recherche) {
    requete = requete.ilike('recherche', `%${filtres.recherche}%`);
  }

  const debut = (filtres.page - 1) * filtres.taille;

  const { data, count, error } = await requete
    .order(filtres.tri, { ascending: filtres.ordre === 'asc' })
    .order('id') // départage les homonymes : sans quoi la pagination peut répéter une ligne
    .range(debut, debut + filtres.taille - 1)
    .returns<CroyantListe[]>();

  if (error) throw new DataError('La liste des croyants est momentanément illisible.', error);

  const total = count ?? 0;
  return {
    lignes: data ?? [],
    total,
    page: filtres.page,
    taille: filtres.taille,
    nbPages: Math.max(1, Math.ceil(total / filtres.taille)),
  };
}

function isoJour(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** Date de naissance d'une personne atteignant exactement `age` aujourd'hui. */
function dateAnniversaire(age: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d;
}

// -----------------------------------------------------------------------------

const CHAMPS_FICHE = `
  *,
  eglise:entities!croyants_eglise_id_fkey (id, nom, code, path, type),
  cellule:entities!croyants_cellule_id_fkey (id, nom, code),
  grade:grades (id, libelle, code),
  nationalite:nationalites (id, libelle, code_iso)
` as const;

export interface CroyantFiche extends CroyantListe {
  statut_marital: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string;
  created_at: string;
  updated_at: string;
  eglise: { id: string; nom: string; code: string; path: string; type: EntityType } | null;
}

export const getCroyant = cache(async (id: string): Promise<CroyantFiche | null> => {
  const sb = await createClient();
  const { data, error } = await sb
    .from('croyants')
    .select(CHAMPS_FICHE)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle<CroyantFiche>();

  if (error) throw new DataError('Cette fiche est momentanément illisible.', error);
  return data;
});

/**
 * EF-CRO-13 — doublons potentiels.
 *
 * La recherche porte sur le nom et la date de naissance, puis le rapprochement
 * exact se fait en mémoire via `cleDoublon` : la base ignore les accents et la
 * casse, le domaine les normalise.
 */
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

/** Compteurs de l'en-tête de liste, sans charger les lignes. */
export async function compterCroyants(entiteId?: string): Promise<{
  total: number;
  hommes: number;
  femmes: number;
}> {
  const sb = await createClient();
  const eglises = await eglisesDuPerimetre(entiteId);

  async function compter(sexe?: 'M' | 'F'): Promise<number> {
    let q = sb
      .from('croyants')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .eq('statut', 'ACTIF');

    if (eglises !== null) {
      if (eglises.length === 0) return 0;
      q = q.in('eglise_id', eglises);
    }
    if (sexe) q = q.eq('sexe', sexe);

    const { count } = await q;
    return count ?? 0;
  }

  const [total, hommes, femmes] = await Promise.all([
    compter(),
    compter('M'),
    compter('F'),
  ]);

  return { total, hommes, femmes };
}
