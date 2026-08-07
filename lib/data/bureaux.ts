import 'server-only';

import type { FonctionBureau } from '@/lib/domain/bureau';
import type { EntityType } from '@/lib/domain/hierarchy';
import { createClient } from '@/lib/supabase/server';

import { DataError } from './errors';

/**
 * Lectures des bureaux — EF-BUR-01 a 10.
 *
 * La RLS fait le tri par perimetre : aucun filtre n'est reecrit ici, il le
 * serait en double et divergerait.
 */

const CHAMPS_MANDAT = `
  id, entity_id, libelle, date_debut, date_fin, is_active, created_at,
  entite:entities!bureaux_entity_id_fkey (id, nom, code, type, path),
  membres:bureau_membres!bureau_membres_bureau_id_fkey (
    id, croyant_id, fonction_id, date_debut, date_fin, notes,
    croyant:croyants!bureau_membres_croyant_id_fkey (
      id, nom, prenom, matricule, photo_key, statut
    ),
    fonction:fonctions!bureau_membres_fonction_id_fkey (
      id, code, libelle, ordre_protocolaire, est_financiere
    )
  )
` as const;

export interface MembreBureau {
  id: string;
  croyant_id: string;
  fonction_id: string;
  date_debut: string;
  date_fin: string | null;
  notes: string | null;
  croyant: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    photo_key: string | null;
    statut: string;
  } | null;
  fonction: {
    id: string;
    code: string;
    libelle: string;
    ordre_protocolaire: number;
    est_financiere: boolean;
  } | null;
}

export interface BureauComplet {
  id: string;
  entity_id: string;
  libelle: string;
  date_debut: string;
  date_fin: string | null;
  is_active: boolean;
  created_at: string;
  entite: { id: string; nom: string; code: string; type: EntityType; path: string } | null;
  membres: MembreBureau[];
}

/** Tous les bureaux du perimetre, mandats clos compris (EF-BUR-08). */
export async function chargerBureaux(): Promise<BureauComplet[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('bureaux')
    .select(CHAMPS_MANDAT)
    .is('deleted_at', null)
    .order('date_debut', { ascending: false })
    .returns<BureauComplet[]>();

  if (error) {
    throw new DataError('Les bureaux sont momentanement illisibles.', error);
  }
  return data ?? [];
}

/**
 * EF-BUR-10 — les fonctions occupees par un croyant, toutes entites confondues.
 *
 * Un croyant peut sieger au bureau de sa cellule ET de sa paroisse : la lecture
 * part donc du membre, jamais de l'entite.
 */
export interface FonctionOccupee {
  id: string;
  date_debut: string;
  date_fin: string | null;
  fonction: { id: string; libelle: string; est_financiere: boolean } | null;
  bureau: {
    id: string;
    libelle: string;
    is_active: boolean;
    entite: { id: string; nom: string; type: EntityType } | null;
  } | null;
}

export async function fonctionsDuCroyant(croyantId: string): Promise<FonctionOccupee[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('bureau_membres')
    .select(
      `id, date_debut, date_fin,
       fonction:fonctions!bureau_membres_fonction_id_fkey (id, libelle, est_financiere),
       bureau:bureaux!bureau_membres_bureau_id_fkey (
         id, libelle, is_active,
         entite:entities!bureaux_entity_id_fkey (id, nom, type)
       )`,
    )
    .eq('croyant_id', croyantId)
    .order('date_debut', { ascending: false })
    .returns<FonctionOccupee[]>();

  // Une fiche de croyant ne doit pas tomber parce que ses mandats sont
  // illisibles : la section reste vide, le reste s'affiche.
  return error ? [] : (data ?? []);
}

/** Referentiel des fonctions, sous la forme attendue par le domaine. */
export async function listerFonctions(): Promise<FonctionBureau[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('fonctions')
    .select('id, code, libelle, ordre_protocolaire, est_financiere, niveaux_applicables, is_active')
    .order('ordre_protocolaire')
    .returns<
      {
        id: string;
        code: string;
        libelle: string;
        ordre_protocolaire: number;
        est_financiere: boolean;
        niveaux_applicables: EntityType[];
        is_active: boolean;
      }[]
    >();

  if (error) throw new DataError('Le referentiel des fonctions est illisible.', error);

  return (data ?? []).map((f) => ({
    id: f.id,
    code: f.code,
    libelle: f.libelle,
    ordreProtocolaire: f.ordre_protocolaire,
    estFinanciere: f.est_financiere,
    niveauxApplicables: f.niveaux_applicables,
    isActive: f.is_active,
  }));
}

/**
 * Croyants designables — RG-09.
 *
 * Le perimetre est borne par la RLS ; le domaine restreint ensuite au
 * sous-arbre de l'entite concernee. Deux filtres, deux responsabilites : la
 * base protege, le domaine explique le refus.
 */
export interface CandidatCroyant {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  photo_key: string | null;
  statut: string;
  eglise: { id: string; path: string } | null;
}

export async function listerCandidats(): Promise<CandidatCroyant[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('croyants')
    .select(
      'id, nom, prenom, matricule, photo_key, statut, eglise:entities!croyants_eglise_id_fkey (id, path)',
    )
    .is('deleted_at', null)
    .eq('statut', 'ACTIF')
    .order('nom')
    .limit(2000)
    .returns<CandidatCroyant[]>();

  if (error) throw new DataError('La liste des croyants est illisible.', error);
  return data ?? [];
}
