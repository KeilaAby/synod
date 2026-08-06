import 'server-only';

import { cache } from 'react';

import { type EntityType, estDescendant } from '@/lib/domain/hierarchy';
import { getSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { FiltresEntite } from '@/lib/validation/entity';

import { DataError } from './errors';

/**
 * Lectures des entites — plan.md §7.2.
 *
 * Toutes les requetes passent par le client porteur de la session : la RLS
 * s'applique, une entite hors perimetre ne remonte jamais (ENF-SEC-01).
 */

/** Colonnes systematiquement selectionnees. */
const CHAMPS = `
  id, type, code, nom, parent_id, niveau, path, description,
  sans_acces_application, is_active, created_at, updated_at
` as const;

export interface Entite {
  id: string;
  type: EntityType;
  code: string;
  nom: string;
  parent_id: string | null;
  niveau: number;
  path: string;
  description: string | null;
  sans_acces_application: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Entite enrichie des compteurs de son sous-arbre — EF-STR-05. */
export interface NoeudEntite extends Entite {
  /** Nombre d'entites descendantes, l'entite elle-meme exclue. */
  nbDescendants: number;
  /** Repartition des descendants par niveau, pour la fiche entite. */
  descendantsParType: Partial<Record<EntityType, number>>;
  /** Enfants directs, calcules en memoire depuis l'arbre. */
  nbEnfants: number;
}

/**
 * Arbre complet du perimetre.
 *
 * La RLS retourne les descendants ET les ancetres (le fil d'Ariane doit rester
 * lisible). L'organigramme, lui, ne represente que le SOUS-ARBRE : on retire
 * donc les ancetres avec `estDescendant`, la fonction deja couverte par les
 * tests unitaires.
 */
export const getArbrePerimetre = cache(async (): Promise<NoeudEntite[]> => {
  const session = await getSession();
  if (!session) return [];

  const sb = await createClient();
  const { data, error } = await sb
    .from('entities')
    .select(CHAMPS)
    .is('deleted_at', null)
    .order('niveau')
    .order('nom')
    .returns<Entite[]>();

  if (error) throw new DataError('La structure est momentanement illisible.', error);

  const sousArbre = (data ?? []).filter((e) => estDescendant(e.path, session.scopePath));
  return enrichir(sousArbre);
});

/** Calcule les compteurs de sous-arbre en memoire — un seul parcours, pas N requetes. */
function enrichir(entites: Entite[]): NoeudEntite[] {
  const parId = new Map(entites.map((e) => [e.id, e]));
  const enfantsDe = new Map<string, string[]>();

  for (const e of entites) {
    if (e.parent_id && parId.has(e.parent_id)) {
      const liste = enfantsDe.get(e.parent_id) ?? [];
      liste.push(e.id);
      enfantsDe.set(e.parent_id, liste);
    }
  }

  return entites.map((e) => {
    const descendantsParType: Partial<Record<EntityType, number>> = {};
    let nbDescendants = 0;

    // `path <@ path` : la relation d'ancetre se lit directement dans le chemin,
    // sans parcours recursif.
    for (const autre of entites) {
      if (autre.id !== e.id && estDescendant(autre.path, e.path)) {
        nbDescendants++;
        descendantsParType[autre.type] = (descendantsParType[autre.type] ?? 0) + 1;
      }
    }

    return {
      ...e,
      nbDescendants,
      descendantsParType,
      nbEnfants: enfantsDe.get(e.id)?.length ?? 0,
    };
  });
}

/** Fiche d'une entite, avec son chemin d'ancetres pour le fil d'Ariane. */
export const getEntite = cache(
  async (
    id: string,
  ): Promise<{ entite: NoeudEntite; ancetres: Entite[]; enfants: NoeudEntite[] } | null> => {
    const sb = await createClient();

    const { data, error } = await sb
      .from('entities')
      .select(CHAMPS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle<Entite>();

    if (error) throw new DataError("L'entite est momentanement illisible.", error);
    if (!data) return null;

    const arbre = await getArbrePerimetre();
    const enrichie = arbre.find((e) => e.id === id);
    if (!enrichie) return null;

    // Les ancetres sont deja dans le jeu autorise par la RLS : on les relit
    // sans filtre de sous-arbre.
    const { data: tous, error: erreurTous } = await sb
      .from('entities')
      .select(CHAMPS)
      .is('deleted_at', null)
      .returns<Entite[]>();

    if (erreurTous) throw new DataError("Le chemin de l'entite est illisible.", erreurTous);

    const ancetres = (tous ?? [])
      .filter((e) => e.id !== id && estDescendant(data.path, e.path))
      .sort((a, b) => a.niveau - b.niveau);

    const enfants = arbre
      .filter((e) => e.parent_id === id)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

    return { entite: enrichie, ancetres, enfants };
  },
);

/** Liste filtree — EF-STR-09. Le filtrage porte sur l'arbre deja charge. */
export async function listerEntites(filtres: FiltresEntite): Promise<NoeudEntite[]> {
  const arbre = await getArbrePerimetre();
  const recherche = filtres.recherche?.trim().toLowerCase();

  return arbre
    .filter((e) => {
      if (filtres.type && e.type !== filtres.type) return false;
      if (filtres.parentId && e.parent_id !== filtres.parentId) return false;
      if (filtres.actif === 'actifs' && !e.is_active) return false;
      if (filtres.actif === 'inactifs' && e.is_active) return false;
      if (recherche) {
        const cible = `${e.nom} ${e.code}`.toLowerCase();
        if (!cible.includes(recherche)) return false;
      }
      return true;
    })
    .sort((a, b) => a.niveau - b.niveau || a.nom.localeCompare(b.nom, 'fr'));
}

/**
 * Candidats d'un `EntityPicker` — plan.md §10.1.
 *
 * `types` restreint aux niveaux voulus (ex. ['EGLISE'] pour rattacher un
 * croyant) ; `parentId` restreint aux enfants directs d'une entite
 * (ex. les cellules d'une eglise, RG-05).
 */
export async function getCandidatsEntite(options: {
  types?: EntityType[];
  parentId?: string;
  inclureInactifs?: boolean;
} = {}): Promise<NoeudEntite[]> {
  const arbre = await getArbrePerimetre();

  return arbre
    .filter((e) => {
      if (options.types?.length && !options.types.includes(e.type)) return false;
      if (options.parentId && e.parent_id !== options.parentId) return false;
      if (!options.inclureInactifs && !e.is_active) return false;
      return true;
    })
    .sort((a, b) => a.niveau - b.niveau || a.nom.localeCompare(b.nom, 'fr'));
}

/** Entites supprimees logiquement — EF-ADM-10 (corbeille). */
export async function listerEntitesSupprimees(): Promise<Entite[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from('entities')
    .select(CHAMPS)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .returns<Entite[]>();

  if (error) throw new DataError('La corbeille est momentanement illisible.', error);
  return data ?? [];
}

/**
 * Chemin lisible d'une entite : « Siege › Regional Nord › District Avaradrano ».
 * Utilise en metadonnee du picker et du fil d'Ariane des fiches.
 */
export function cheminLisible(entite: Entite, arbre: Entite[]): string {
  return arbre
    .filter((e) => estDescendant(entite.path, e.path))
    .sort((a, b) => a.niveau - b.niveau)
    .map((e) => e.nom)
    .join(' › ');
}
