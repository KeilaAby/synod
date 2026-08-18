import 'server-only';

import type { EntityType } from '@/lib/domain/hierarchy';
import {
  type BlocOmis,
  type ContenuRapport,
  STRUCTURE_VIDE,
  type StructureRapport,
  type VisibiliteModele,
  estStructure,
} from '@/lib/domain/rapport';
import { createClient } from '@/lib/supabase/server';

import { DataError } from './errors';

/**
 * Lectures de la bibliotheque de modeles — EF-RAP-07 a 11.
 *
 * AUCUN FILTRE DE PERIMETRE N'EST REECRIT ICI. La politique
 * `report_templates_select` de la migration 0043 porte les quatre chemins de
 * visibilite — officiel, GLOBAL, l'auteur, l'entite et ses descendants. Les
 * repeter en TypeScript les ferait diverger le jour ou l'un des deux change,
 * et c'est la version la moins souvent relue qui aurait raison.
 */

const CHAMPS_MODELE = `
  id, nom, description, entity_id, niveaux_applicables, visibilite,
  est_officiel, structure, version, archived_at, created_by, created_at, updated_at,
  entite:entities!report_templates_entity_id_fkey (id, nom, code, type, path),
  auteur:profiles!report_templates_created_by_fkey (id, nom_complet),
  instances:report_instances!report_instances_template_id_fkey (count)
` as const;

interface LigneModele {
  id: string;
  nom: string;
  description: string | null;
  entity_id: string | null;
  niveaux_applicables: EntityType[];
  visibilite: VisibiliteModele;
  est_officiel: boolean;
  structure: unknown;
  version: number;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  entite: { id: string; nom: string; code: string; type: EntityType; path: string } | null;
  auteur: { id: string; nom_complet: string } | null;
  /** Agregat PostgREST : toujours un tableau, vide si aucun rapport. */
  instances: { count: number }[];
}

export interface ModeleRapport {
  id: string;
  nom: string;
  description: string | null;
  entityId: string | null;
  niveauxApplicables: EntityType[];
  visibilite: VisibiliteModele;
  estOfficiel: boolean;
  structure: StructureRapport;
  version: number;
  archiveLe: string | null;
  creePar: string | null;
  creeLe: string;
  modifieLe: string;
  entite: { id: string; nom: string; code: string; type: EntityType; path: string } | null;
  auteur: { id: string; nomComplet: string } | null;
  /** EF-RAP-17 — combien de rapports ce modele a deja produits. */
  nbRapports: number;
}

/**
 * `structure` est du `jsonb` que rien ne contraint : une valeur inattendue
 * traversant vers le client ferait echouer la page ENTIERE (regle 24). On la
 * ramene a une structure vide plutot que de laisser tomber l'ecran — un modele
 * abime doit rester listable, ne serait-ce que pour etre archive.
 */
function versModele(ligne: LigneModele): ModeleRapport {
  return {
    id: ligne.id,
    nom: ligne.nom,
    description: ligne.description,
    entityId: ligne.entity_id,
    niveauxApplicables: ligne.niveaux_applicables ?? [],
    visibilite: ligne.visibilite,
    estOfficiel: ligne.est_officiel,
    structure: estStructure(ligne.structure) ? ligne.structure : STRUCTURE_VIDE,
    version: ligne.version,
    archiveLe: ligne.archived_at,
    creePar: ligne.created_by,
    creeLe: ligne.created_at,
    modifieLe: ligne.updated_at,
    entite: ligne.entite,
    auteur: ligne.auteur ? { id: ligne.auteur.id, nomComplet: ligne.auteur.nom_complet } : null,
    nbRapports: ligne.instances?.[0]?.count ?? 0,
  };
}

/**
 * Tous les modeles visibles, ARCHIVES COMPRIS — EF-RAP-11.
 *
 * L'archivage se filtre a l'ecran et non ici (regle 17) : basculer « voir les
 * archives » est une question sur une liste deja chargee, pas un motif de
 * repartir au serveur.
 *
 * Ordonnes du plus recemment modifie au plus ancien : dans une bibliotheque, ce
 * qu'on vient de toucher est ce qu'on rouvre.
 */
export async function chargerModeles(): Promise<ModeleRapport[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('report_templates')
    .select(CHAMPS_MODELE)
    .order('updated_at', { ascending: false })
    .returns<LigneModele[]>();

  if (error) {
    throw new DataError('La bibliotheque de modeles est momentanement illisible.', error);
  }

  return (data ?? []).map(versModele);
}

/**
 * UN modele, pour une action qui doit connaitre son etat avant d'ecrire.
 *
 * `chargerModeles` ramene toute la bibliotheque : le prix est justifie pour
 * peupler un ecran, absurde pour verifier une seule ligne (meme raisonnement
 * que `chargerCandidat` cote bureaux).
 */
export async function chargerModele(modeleId: string): Promise<ModeleRapport | null> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('report_templates')
    .select(CHAMPS_MODELE)
    .eq('id', modeleId)
    .maybeSingle<LigneModele>();

  if (error) throw new DataError('Ce modele est momentanement illisible.', error);
  return data ? versModele(data) : null;
}

// -----------------------------------------------------------------------------
// EF-RAP-17 — les rapports GENERES
// -----------------------------------------------------------------------------

const CHAMPS_RAPPORT = `
  id, template_id, template_snapshot, nom, entity_id, periode_debut, periode_fin,
  contenu, blocs_omis, statut, genere_le, publie_le,
  entite:entities!report_instances_entity_id_fkey (id, nom, code, type, path),
  auteur:profiles!report_instances_genere_par_fkey (id, nom_complet)
` as const;

interface LigneRapport {
  id: string;
  template_id: string | null;
  template_snapshot: unknown;
  nom: string;
  entity_id: string;
  periode_debut: string;
  periode_fin: string;
  contenu: unknown;
  blocs_omis: unknown;
  statut: string;
  genere_le: string;
  publie_le: string | null;
  entite: { id: string; nom: string; code: string; type: EntityType; path: string } | null;
  auteur: { id: string; nom_complet: string } | null;
}

export interface RapportGenere {
  id: string;
  templateId: string | null;
  /** RG-27 — la structure telle qu'elle a produit ce rapport. */
  structure: StructureRapport;
  nom: string;
  entityId: string;
  periodeDebut: string;
  periodeFin: string;
  /** RG-27 — les donnees FIGEES. Rien ne les recalcule. */
  contenu: ContenuRapport;
  blocsOmis: BlocOmis[];
  statut: string;
  genereLe: string;
  publieLe: string | null;
  entite: { id: string; nom: string; code: string; type: EntityType; path: string } | null;
  auteur: { id: string; nomComplet: string } | null;
}

/**
 * `contenu` et `blocs_omis` sont du `jsonb` que rien ne contraint.
 *
 * On ne les VALIDE pas champ par champ — leur forme depend du type de bloc, et
 * la verifier ici obligerait a rouvrir ce fichier a chaque nouveau genre. On
 * garantit seulement qu'ils traversent : un objet, un tableau, ou rien. Une
 * valeur inattendue rendrait un bloc vide, pas une page blanche (regle 24).
 */
function versRapport(ligne: LigneRapport): RapportGenere {
  return {
    id: ligne.id,
    templateId: ligne.template_id,
    structure: estStructure(ligne.template_snapshot)
      ? ligne.template_snapshot
      : STRUCTURE_VIDE,
    nom: ligne.nom,
    entityId: ligne.entity_id,
    periodeDebut: ligne.periode_debut,
    periodeFin: ligne.periode_fin,
    contenu:
      typeof ligne.contenu === 'object' && ligne.contenu !== null && !Array.isArray(ligne.contenu)
        ? (ligne.contenu as ContenuRapport)
        : {},
    blocsOmis: Array.isArray(ligne.blocs_omis) ? (ligne.blocs_omis as BlocOmis[]) : [],
    statut: ligne.statut,
    genereLe: ligne.genere_le,
    publieLe: ligne.publie_le,
    entite: ligne.entite,
    auteur: ligne.auteur
      ? { id: ligne.auteur.id, nomComplet: ligne.auteur.nom_complet }
      : null,
  };
}

/**
 * L'historique — EF-RAP-17.
 *
 * Du plus RECENT au plus ancien : on vient y chercher ce qu'on a produit la
 * semaine derniere, pas ce qui date de l'an dernier. La RLS borne au perimetre
 * et exige `report.read` — ou la publication, qui est faite pour cela.
 */
export async function chargerRapports(): Promise<RapportGenere[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('report_instances')
    .select(CHAMPS_RAPPORT)
    .order('genere_le', { ascending: false })
    .limit(500)
    .returns<LigneRapport[]>();

  if (error) {
    throw new DataError('L’historique des rapports est momentanement illisible.', error);
  }
  return (data ?? []).map(versRapport);
}

export async function chargerRapport(rapportId: string): Promise<RapportGenere | null> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('report_instances')
    .select(CHAMPS_RAPPORT)
    .eq('id', rapportId)
    .maybeSingle<LigneRapport>();

  if (error) throw new DataError('Ce rapport est momentanement illisible.', error);
  return data ? versRapport(data) : null;
}

/**
 * Les noms deja pris, pour numeroter un duplicata — EF-RAP-11.
 *
 * Maigre a dessein : `nomDuplique` n'a besoin que des noms, et charger la
 * bibliotheque entiere avec ses structures pour en tirer une liste de chaines
 * ferait payer un `jsonb` par ligne pour rien.
 */
export async function nomsDeModeles(): Promise<string[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('report_templates')
    .select('nom')
    .returns<{ nom: string }[]>();

  // Un nom en doublon est genant, pas bloquant : si la lecture echoue, le
  // duplicata s'appellera « (copie) » et l'utilisateur le renommera.
  return error ? [] : (data ?? []).map((l) => l.nom);
}
