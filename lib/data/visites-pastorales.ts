import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { signerPhotos } from '@/lib/data/photos';
import { DataError } from './errors';
import type { VisitePastorale, VisiteDelegue, StatutVisite } from '@/lib/domain/visites-pastorales';

/**
 * Chargement des données du module de visites pastorales.
 */

const CHAMPS_VISITE = `
  id,
  entite_initiatrice_id,
  entite_cible_id,
  date_visite,
  heure_visite,
  type_culte,
  theme_message,
  instructions,
  statut,
  reference_ordre_mission,
  cree_par,
  valide_par,
  valide_le,
  created_at,
  updated_at,
  entite_initiatrice:entities!visites_pastorales_entite_initiatrice_id_fkey(id, nom, path, type),
  entite_cible:entities!visites_pastorales_entite_cible_id_fkey(id, nom, path, type),
  delegues:visites_pastorales_delegues!visites_pastorales_delegues_visite_id_fkey(
    id,
    croyant_id,
    role_mission,
    ordre,
    croyant:croyants!visites_pastorales_delegues_croyant_id_fkey(
      id, nom, prenom, matricule, sexe, photo_key,
      grade:grades!croyants_grade_id_fkey(code, libelle)
    )
  )
` as const;

interface DeleguePostgrest {
  readonly id?: string;
  readonly croyant_id: string;
  readonly role_mission: string;
  readonly ordre: number;
  readonly croyant: {
    readonly id: string;
    readonly nom: string;
    readonly prenom: string | null;
    readonly matricule: string | null;
    readonly sexe: string | null;
    readonly photo_key: string | null;
    readonly grade: { readonly code: string; readonly libelle: string } | null;
  } | null;
}

interface VisitePostgrest {
  readonly id: string;
  readonly entite_initiatrice_id: string;
  readonly entite_cible_id: string;
  readonly date_visite: string;
  readonly heure_visite: string | null;
  readonly type_culte: string;
  readonly theme_message: string | null;
  readonly instructions: string | null;
  readonly statut: StatutVisite;
  readonly reference_ordre_mission: string | null;
  readonly cree_par: string | null;
  readonly valide_par: string | null;
  readonly valide_le: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly entite_initiatrice: { readonly id: string; readonly nom: string; readonly path: string; readonly type: string } | null;
  readonly entite_cible: { readonly id: string; readonly nom: string; readonly path: string; readonly type: string } | null;
  readonly delegues: readonly DeleguePostgrest[];
}

export async function listerVisitesPastorales(): Promise<VisitePastorale[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('visites_pastorales')
    .select(CHAMPS_VISITE)
    .order('date_visite', { ascending: true });

  if (error) {
    throw new DataError('Impossible de charger les visites pastorales', {
      cause: error,
      context: { code: error.code, message: error.message },
    });
  }

  if (!data || data.length === 0) return [];

  const rawVisites = data as unknown as readonly VisitePostgrest[];

  // Récupérer toutes les photos_keys de tous les délégués pour les signer en un lot
  const photoKeys: string[] = [];
  for (const v of rawVisites) {
    if (Array.isArray(v.delegues)) {
      for (const d of v.delegues) {
        if (d.croyant?.photo_key) {
          photoKeys.push(d.croyant.photo_key);
        }
      }
    }
  }

  const photosSignees = await signerPhotos(photoKeys);

  return rawVisites.map((v): VisitePastorale => {
    const delegues: VisiteDelegue[] = (v.delegues || [])
      .slice()
      .sort((a, b) => (a.ordre || 1) - (b.ordre || 1))
      .map((d): VisiteDelegue => {
        const c = d.croyant;
        const nomComplet = c ? `${c.nom} ${c.prenom || ''}`.trim() : 'Membre inconnu';
        const photoKey = c?.photo_key;
        const photoUrl = photoKey ? photosSignees.get(photoKey) || null : null;

        return {
          id: d.id,
          croyant_id: d.croyant_id,
          nom_complet: nomComplet,
          matricule: c?.matricule || '',
          grade: c?.grade?.libelle || c?.grade?.code || 'Membre',
          role_mission: d.role_mission,
          photo_url: photoUrl,
          ordre: d.ordre || 1,
        };
      });

    return {
      id: v.id,
      entite_initiatrice_id: v.entite_initiatrice_id,
      entite_initiatrice_nom: v.entite_initiatrice?.nom || 'Entité inconnue',
      entite_cible_id: v.entite_cible_id,
      entite_cible_nom: v.entite_cible?.nom || 'Église inconnue',
      date_visite: v.date_visite,
      heure_visite: v.heure_visite || '09:00',
      type_culte: v.type_culte,
      theme_message: v.theme_message || null,
      instructions: v.instructions || null,
      statut: v.statut,
      reference_ordre_mission: v.reference_ordre_mission || '',
      cree_par: v.cree_par || null,
      valide_par: v.valide_par || null,
      valide_le: v.valide_le || null,
      created_at: v.created_at,
      updated_at: v.updated_at,
      delegues,
    };
  });
}

export interface CroyantCandidatVisite {
  readonly id: string;
  readonly nom_complet: string;
  readonly matricule: string;
  readonly grade: string;
  readonly photo_url: string | null;
}

interface CroyantCandidatPostgrest {
  readonly id: string;
  readonly nom: string;
  readonly prenom: string | null;
  readonly matricule: string | null;
  readonly photo_key: string | null;
  readonly grade: { readonly code: string; readonly libelle: string } | null;
}

export async function listerCroyantsCandidats(): Promise<CroyantCandidatVisite[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('croyants')
    .select(`
      id, nom, prenom, matricule, photo_key,
      grade:grades!croyants_grade_id_fkey(code, libelle)
    `)
    .is('deleted_at', null)
    .order('nom', { ascending: true })
    .limit(200);

  if (error) {
    throw new DataError('Impossible de charger les croyants pour la délégation', {
      cause: error,
    });
  }

  if (!data || data.length === 0) return [];

  const rawCroyants = data as unknown as readonly CroyantCandidatPostgrest[];
  const photoKeys = rawCroyants.map((c) => c.photo_key).filter((k): k is string => Boolean(k));
  const photosSignees = await signerPhotos(photoKeys);

  return rawCroyants.map((c): CroyantCandidatVisite => {
    const photoKey = c.photo_key;
    const photoUrl = photoKey ? photosSignees.get(photoKey) || null : null;
    return {
      id: c.id,
      nom_complet: `${c.nom} ${c.prenom || ''}`.trim(),
      matricule: c.matricule || '',
      grade: c.grade?.libelle || c.grade?.code || 'Membre',
      photo_url: photoUrl,
    };
  });
}

export interface EntiteOptionVisite {
  readonly id: string;
  readonly nom: string;
  readonly type: string;
  readonly path: string;
}

export async function listerEntitesDisponibles(): Promise<EntiteOptionVisite[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('entities')
    .select('id, nom, type, path')
    .order('nom', { ascending: true });

  if (error) {
    throw new DataError('Impossible de charger les entités pour les visites', { cause: error });
  }

  return (data || []).map((e) => ({
    id: e.id,
    nom: e.nom,
    type: e.type,
    path: e.path,
  }));
}
