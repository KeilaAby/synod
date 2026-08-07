import 'server-only';

import type { EntityType } from '@/lib/domain/hierarchy';
import { type SessionUtilisateur, peut } from '@/lib/domain/permissions';
import { PERMISSION_APPROBATION, type StatutTransfert } from '@/lib/domain/transfert';
import { createClient } from '@/lib/supabase/server';

import { DataError } from './errors';

/**
 * Lectures des transferts — EF-TRF-07, EF-TRF-08.
 *
 * La RLS fait le tri : `transferts_select` ne laisse voir que les lignes dont
 * l'origine OU la destination est dans le perimetre. Aucun filtre de perimetre
 * n'est donc reecrit ici — il le serait en double, et divergerait.
 */

const CHAMPS = `
  id, croyant_id, niveau_transfert, statut, motif, motif_refus,
  from_eglise_id, to_eglise_id, from_cellule_id, to_cellule_id,
  ancetre_commun_id, date_demande, date_decision, date_effet,
  croyant:croyants (id, nom, prenom, matricule, photo_key),
  origine:entities!transferts_from_eglise_id_fkey (id, nom, code, path),
  destination:entities!transferts_to_eglise_id_fkey (id, nom, code, path),
  celluleOrigine:entities!transferts_from_cellule_id_fkey (id, nom),
  celluleDestination:entities!transferts_to_cellule_id_fkey (id, nom),
  arbitre:entities!transferts_ancetre_commun_id_fkey (id, nom, path),
  demandeur:profiles!transferts_demande_par_fkey (id, nom_complet),
  decideur:profiles!transferts_decide_par_fkey (id, nom_complet)
` as const;

interface Reference {
  id: string;
  nom: string;
}

export interface TransfertListe {
  id: string;
  croyant_id: string;
  niveau_transfert: EntityType;
  statut: StatutTransfert;
  motif: string | null;
  motif_refus: string | null;
  from_eglise_id: string | null;
  to_eglise_id: string;
  from_cellule_id: string | null;
  to_cellule_id: string | null;
  ancetre_commun_id: string | null;
  date_demande: string;
  date_decision: string | null;
  date_effet: string | null;
  croyant: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    photo_key: string | null;
  } | null;
  origine: (Reference & { code: string; path: string }) | null;
  destination: (Reference & { code: string; path: string }) | null;
  celluleOrigine: Reference | null;
  celluleDestination: Reference | null;
  /** Entite qui borne les approbateurs competents (RG-12), figee a la demande. */
  arbitre: (Reference & { path: string }) | null;
  demandeur: { id: string; nom_complet: string } | null;
  decideur: { id: string; nom_complet: string } | null;
}

/**
 * Tous les transferts visibles — EF-TRF-08.
 *
 * Chargement integral, comme la structure : le volume est borne par nature
 * (un croyant change rarement d'eglise), et le filtrage instantane cote client
 * vaut mieux qu'un aller-retour par clic. Le plafond protege du cas ou cette
 * hypothese cesserait d'etre vraie.
 */
export const PLAFOND_TRANSFERTS = 2000;

export async function chargerTransferts(): Promise<TransfertListe[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('transferts')
    .select(CHAMPS)
    .order('date_demande', { ascending: false })
    .limit(PLAFOND_TRANSFERTS)
    .returns<TransfertListe[]>();

  if (error) {
    throw new DataError('Le journal des transferts est momentanement illisible.', error);
  }
  return data ?? [];
}

/** Historique d'un croyant — EF-TRF-08, affiche sur sa fiche. */
export async function transfertsDuCroyant(croyantId: string): Promise<TransfertListe[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('transferts')
    .select(CHAMPS)
    .eq('croyant_id', croyantId)
    .order('date_demande', { ascending: false })
    .returns<TransfertListe[]>();

  if (error) {
    throw new DataError("L'historique des transferts est momentanement illisible.", error);
  }
  return data ?? [];
}

/**
 * EF-TRF-07 / UI-21 — demandes que l'utilisateur peut REELLEMENT trancher.
 *
 * Un simple `count` sur `statut = 'DEMANDE'` aurait compte tout ce que la RLS
 * laisse VOIR — origine ou destination dans le perimetre. Or voir n'est pas
 * decider : RG-12 exige de couvrir l'ancetre commun des deux entites. Un badge
 * qui annonce trois demandes pour une file qui en montre zero fait douter de
 * l'application entiere.
 *
 * On lit donc les seuls chemins d'arbitrage, et on compte ceux que la session
 * couvre. Les demandes en attente se comptent en dizaines, jamais en milliers.
 */
export async function compterTransfertsAApprouver(
  session: SessionUtilisateur,
): Promise<number> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('transferts')
    .select('id, arbitre:entities!transferts_ancetre_commun_id_fkey (path)')
    .eq('statut', 'DEMANDE')
    .returns<{ id: string; arbitre: { path: string } | null }[]>();

  // Un compteur indisponible ne doit pas faire tomber la navigation : mieux
  // vaut ne rien afficher qu'un badge faux.
  if (error) return 0;

  return (data ?? []).filter(
    (t) => t.arbitre && peut(session, PERMISSION_APPROBATION, t.arbitre.path),
  ).length;
}
