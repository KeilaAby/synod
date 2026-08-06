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
 *
 * PERFORMANCE — le module ne fait qu'UNE SEULE requete par requete HTTP :
 * `getEntitesVisibles` est memoisee par React `cache`, et toutes les autres
 * fonctions derivent de son resultat. Les compteurs de sous-arbre sont
 * calcules en O(n) par un parcours suffixe, la ou une comparaison de chaque
 * entite avec toutes les autres couterait O(n²).
 */

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
  /** Enfants directs. */
  nbEnfants: number;
}

/**
 * Requete unique de la page — memoisee par React `cache`.
 *
 * La RLS retourne le sous-arbre du compte ET ses ancetres : le fil d'Ariane
 * doit rester lisible pour un district qui veut nommer son regional.
 */
const getEntitesVisibles = cache(async (): Promise<Entite[]> => {
  const sb = await createClient();
  const { data, error } = await sb
    .from('entities')
    .select(CHAMPS)
    .is('deleted_at', null)
    .order('niveau')
    .order('nom')
    .returns<Entite[]>();

  if (error) throw new DataError('La structure est momentanement illisible.', error);
  return data ?? [];
});

/**
 * Compteurs de sous-arbre en O(n).
 *
 * Un parcours suffixe : les compteurs d'un noeud sont la somme de ceux de ses
 * enfants, plus les enfants eux-memes. Chaque entite n'est visitee qu'une fois.
 */
function enrichir(entites: Entite[]): NoeudEntite[] {
  const enfantsDe = new Map<string, Entite[]>();
  for (const e of entites) {
    if (!e.parent_id) continue;
    const liste = enfantsDe.get(e.parent_id);
    if (liste) liste.push(e);
    else enfantsDe.set(e.parent_id, [e]);
  }

  const calcule = new Map<string, Partial<Record<EntityType, number>>>();

  function agreger(id: string): Partial<Record<EntityType, number>> {
    const memo = calcule.get(id);
    if (memo) return memo;

    const total: Partial<Record<EntityType, number>> = {};
    for (const enfant of enfantsDe.get(id) ?? []) {
      total[enfant.type] = (total[enfant.type] ?? 0) + 1;
      for (const [type, n] of Object.entries(agreger(enfant.id))) {
        const cle = type as EntityType;
        total[cle] = (total[cle] ?? 0) + n;
      }
    }

    calcule.set(id, total);
    return total;
  }

  return entites.map((e) => {
    const descendantsParType = agreger(e.id);
    const nbDescendants = Object.values(descendantsParType).reduce((s, n) => s + n, 0);
    return {
      ...e,
      descendantsParType,
      nbDescendants,
      nbEnfants: enfantsDe.get(e.id)?.length ?? 0,
    };
  });
}

/**
 * Sous-arbre du perimetre, enrichi.
 *
 * Les ancetres visibles par la RLS sont ecartes : l'organigramme represente le
 * perimetre de responsabilite, pas la remontee vers le Siege.
 */
export const getArbrePerimetre = cache(async (): Promise<NoeudEntite[]> => {
  const session = await getSession();
  if (!session) return [];

  const visibles = await getEntitesVisibles();
  return enrichir(visibles.filter((e) => estDescendant(e.path, session.scopePath)));
});

/** Ancetres d'une entite, du plus haut au plus proche — fil d'Ariane. */
export async function getAncetres(chemin: string): Promise<Entite[]> {
  const visibles = await getEntitesVisibles();
  return visibles
    .filter((e) => e.path !== chemin && estDescendant(chemin, e.path))
    .sort((a, b) => a.niveau - b.niveau);
}

/** Fiche d'une entite — aucune requete supplementaire, tout vient du cache. */
export const getEntite = cache(
  async (
    id: string,
  ): Promise<{ entite: NoeudEntite; ancetres: Entite[]; enfants: NoeudEntite[] } | null> => {
    const arbre = await getArbrePerimetre();
    const entite = arbre.find((e) => e.id === id);
    if (!entite) return null;

    const ancetres = await getAncetres(entite.path);
    const enfants = arbre
      .filter((e) => e.parent_id === id)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

    return { entite, ancetres, enfants };
  },
);

/** Liste filtree — EF-STR-09. Filtrage en memoire sur l'arbre deja charge. */
export async function listerEntites(filtres: FiltresEntite): Promise<NoeudEntite[]> {
  const arbre = await getArbrePerimetre();
  const recherche = filtres.recherche?.trim().toLowerCase();

  return arbre
    .filter((e) => {
      if (filtres.type && e.type !== filtres.type) return false;
      if (filtres.parentId && e.parent_id !== filtres.parentId) return false;
      if (filtres.actif === 'actifs' && !e.is_active) return false;
      if (filtres.actif === 'inactifs' && e.is_active) return false;
      if (recherche && !`${e.nom} ${e.code}`.toLowerCase().includes(recherche)) return false;
      return true;
    })
    .sort((a, b) => a.niveau - b.niveau || a.nom.localeCompare(b.nom, 'fr'));
}

/** Candidats d'un `EntityPicker` — plan.md §10.1. */
export async function getCandidatsEntite(
  options: { types?: EntityType[]; parentId?: string; inclureInactifs?: boolean } = {},
): Promise<NoeudEntite[]> {
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
 * Chemin lisible : « Siege › Regional Nord › District Avaradrano ».
 *
 * Prend une TABLE D'INDEX plutot que la liste complete : appelee pour chaque
 * ligne d'un tableau, une recherche lineaire redonnerait un cout quadratique.
 */
export function indexerParChemin(entites: Entite[]): Map<string, Entite> {
  return new Map(entites.map((e) => [e.path, e]));
}

export function cheminLisible(entite: Entite, index: Map<string, Entite>): string {
  const segments = entite.path.split('.');
  const noms: string[] = [];

  for (let i = 1; i <= segments.length; i++) {
    const ancetre = index.get(segments.slice(0, i).join('.'));
    if (ancetre) noms.push(ancetre.nom);
  }

  return noms.join(' › ');
}
