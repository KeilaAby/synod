import 'server-only';

import { createClient } from '@/lib/supabase/server';

import { DataError } from './errors';

/**
 * Lectures des baptemes — EF-BAP-04, EF-BAP-06.
 *
 * `croyants.date_bapteme` reste la SOURCE DE VERITE des indicateurs ; cette
 * table porte les informations de ceremonie, qui n'ont pas leur place sur la
 * fiche du croyant. Un bapteme peut donc exister sans sa ligne de ceremonie
 * (fiche saisie avant la mise en service de ce module) : les lectures partent
 * des croyants, pas des baptemes.
 */

/**
 * Chaque embed NOMME sa cle etrangere — y compris quand une seule semble
 * possible.
 *
 * `baptemes` pointe DEUX FOIS vers `croyants` : le baptise (`croyant_id`) et
 * le celebrant (`celebrant_id`). PostgREST refuse alors l'embed ambigu avec
 * `PGRST201`, et l'erreur ne se voit qu'a l'execution — une chaine de selection
 * n'est pas verifiee par le compilateur.
 *
 * C'est le meme defaut qui empechait la connexion le 6 aout : deux cles entre
 * `profiles` et `entities`. La regle a en tirer n'est pas « lever l'ambiguite
 * quand elle se presente » mais « nommer toujours » : le jour ou une seconde
 * cle apparait, la requete continue de fonctionner.
 */
const CHAMPS = `
  id, croyant_id, entity_id, date_bapteme, lieu, session_libelle, created_at,
  croyant:croyants!baptemes_croyant_id_fkey (
    id, nom, prenom, matricule, sexe, date_naissance, photo_key,
    eglise:entities!croyants_eglise_id_fkey (id, nom, path)
  ),
  celebrant:croyants!baptemes_celebrant_id_fkey (id, nom, prenom),
  entite:entities!baptemes_entity_id_fkey (id, nom, path)
` as const;

export interface BaptemeListe {
  id: string;
  croyant_id: string;
  entity_id: string;
  date_bapteme: string;
  lieu: string | null;
  session_libelle: string | null;
  created_at: string;
  croyant: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    sexe: 'M' | 'F';
    date_naissance: string;
    photo_key: string | null;
    eglise: { id: string; nom: string; path: string } | null;
  } | null;
  celebrant: { id: string; nom: string; prenom: string } | null;
  entite: { id: string; nom: string; path: string } | null;
}

/** Plafond identique aux autres listes : filtrage instantane cote client. */
export const PLAFOND_BAPTEMES = 2000;

export async function chargerBaptemes(): Promise<BaptemeListe[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('baptemes')
    .select(CHAMPS)
    .order('date_bapteme', { ascending: false })
    .limit(PLAFOND_BAPTEMES)
    .returns<BaptemeListe[]>();

  if (error) {
    throw new DataError('Le registre des baptemes est momentanement illisible.', error);
  }
  return data ?? [];
}

/**
 * EF-BAP-03 — celebrants eligibles : Pasteurs et Diacres.
 *
 * Le filtre porte sur le CODE du grade, pas sur son libelle : un libelle se
 * renomme depuis les referentiels, un code non (EF-REF-01).
 */
export const CODES_GRADE_CELEBRANT = ['PASTEUR', 'DIACRE', 'EVANGELISTE'] as const;

export interface OptionCelebrant {
  id: string;
  nom: string;
  prenom: string;
  grade: string;
  egliseId: string;
}

export async function listerCelebrants(): Promise<OptionCelebrant[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('croyants')
    .select('id, nom, prenom, eglise_id, grade:grades!inner (code, libelle)')
    .is('deleted_at', null)
    .eq('statut', 'ACTIF')
    .in('grade.code', [...CODES_GRADE_CELEBRANT])
    .order('nom')
    .returns<
      {
        id: string;
        nom: string;
        prenom: string;
        eglise_id: string;
        grade: { code: string; libelle: string } | null;
      }[]
    >();

  // Un celebrant introuvable ne doit pas empecher de saisir un bapteme : le
  // champ est facultatif (EF-BAP-03).
  if (error) return [];

  return (data ?? []).map((c) => ({
    id: c.id,
    nom: c.nom,
    prenom: c.prenom,
    grade: c.grade?.libelle ?? '',
    egliseId: c.eglise_id,
  }));
}
