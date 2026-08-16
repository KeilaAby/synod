import 'server-only';

import { cache } from 'react';

import type { EvenementDime, ModeDime } from '@/lib/domain/dime';
import { createClient } from '@/lib/supabase/server';

import { DataError } from './errors';

/**
 * Lectures des dimes — EF-FIN-27 a 31, RG-33.
 *
 * CE QU'IL FAUT AVOIR EN TETE EN LISANT CE FICHIER : un mouvement de dime est
 * rattache au SIEGE par `entity_id`, et a l'eglise collectrice par
 * `entite_collecte_id`. Les lectures d'ici partent donc de la SECONDE — c'est
 * elle qui repond a « qu'avons-nous collecte ? », la question que se pose une
 * eglise.
 *
 * La RLS laisse voir les deux (migration `0027`) : sans quoi une eglise ne
 * pourrait pas repondre au croyant qui lui demande la trace de sa dime, alors
 * qu'elle lui en a remis le recu (EF-FIN-31).
 */

const CHAMPS = `
  id, montant, date_operation, libelle, reference, statut,
  entite_collecte_id, dime_evenement, dime_remise_id, created_at,
  collecteur:entities!finance_entries_entite_collecte_id_fkey (id, nom, code, type),
  categorie:finance_categories!finance_entries_categorie_id_fkey (id, libelle),
  versements:dime_versements!dime_versements_finance_entry_id_fkey (
    id, croyant_id, enveloppe_numero, montant, recu_numero,
    croyant:croyants!dime_versements_croyant_id_fkey (id, nom, prenom, matricule)
  )
` as const;

export interface VersementListe {
  id: string;
  croyant_id: string;
  enveloppe_numero: string | null;
  montant: number;
  recu_numero: string;
  croyant: { id: string; nom: string; prenom: string; matricule: string } | null;
}

export interface CollecteListe {
  id: string;
  montant: number;
  date_operation: string;
  libelle: string | null;
  reference: string | null;
  statut: string;
  entite_collecte_id: string | null;
  dime_evenement: EvenementDime | null;
  dime_remise_id: string | null;
  created_at: string;
  collecteur: { id: string; nom: string; code: string; type: string } | null;
  categorie: { id: string; libelle: string } | null;
  versements: VersementListe[];
}

/**
 * Les collectes du perimetre, detail compris.
 *
 * LE DETAIL EST CHARGE AVEC, en un seul embed. Le demander collecte par
 * collecte au moment de deplier coûterait un aller-retour par ligne — et c'est
 * justement en dépliant qu'on veut une reponse immediate (regle 28).
 *
 * Un changement de mode ne masque rien : une collecte saisie en detail garde
 * son detail apres le passage en global (EF-FIN-28).
 */
export const chargerCollectes = cache(async (): Promise<CollecteListe[]> => {
  const sb = await createClient();

  const { data, error } = await sb
    .from('finance_entries')
    .select(CHAMPS)
    .not('entite_collecte_id', 'is', null)
    .is('deleted_at', null)
    .order('date_operation', { ascending: false })
    .limit(2000)
    .returns<CollecteListe[]>();

  if (error) throw new DataError('Les collectes de dimes sont illisibles.', error);
  return data ?? [];
});

export interface EnveloppeCroyant {
  croyant_id: string;
  numero: string;
}

/**
 * Les enveloppes ACTIVES d'une entite, indexees par croyant.
 *
 * Sert a pre-remplir la grille de saisie : le membre du bureau retrouve un
 * numero qu'il n'a pas a recopier, et l'erreur de frappe disparait avec lui.
 * Les enveloppes inactives ne sont pas chargees — elles figurent sur d'anciens
 * recus, pas dans une saisie du jour.
 */
export async function chargerEnveloppes(
  egliseId: string,
): Promise<Map<string, string>> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('dime_enveloppes')
    .select('croyant_id, numero')
    .eq('eglise_id', egliseId)
    .eq('is_active', true)
    .returns<EnveloppeCroyant[]>();

  // Une enveloppe illisible ne doit pas empecher de saisir la collecte : le
  // numero se tape a la main, il n'est pas obligatoire.
  if (error) return new Map();
  return new Map((data ?? []).map((e) => [e.croyant_id, e.numero]));
}

/**
 * TOUTES les enveloppes actives du perimetre, en une requete.
 *
 * La grille de saisie ne sait pas d'avance quelle entite sera choisie : les
 * charger apres coup couterait un aller-retour a chaque changement d'entite,
 * au milieu d'une saisie (regle 28). Une enveloppe par croyant et par eglise
 * reste un volume modeste — c'est un numero, pas une fiche.
 */
export async function chargerEnveloppesPerimetre(): Promise<Map<string, string>> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('dime_enveloppes')
    .select('croyant_id, numero')
    .eq('is_active', true)
    .limit(20000)
    .returns<EnveloppeCroyant[]>();

  // Une enveloppe illisible n'empeche pas de saisir : le numero se tape a la
  // main, et il est facultatif.
  if (error) return new Map();
  return new Map((data ?? []).map((e) => [e.croyant_id, e.numero]));
}

/**
 * Le mode de saisie DECIDE par chaque entite du perimetre.
 *
 * Derive de l'arbre plutot que d'une requete par entite : le mode effectif
 * vaut « ce que l'entite a decide, sinon le defaut de l'organisation », et il
 * n'y a aucun heritage a resoudre (EF-FIN-28).
 */
export type ModeParEntite = Map<string, ModeDime | null>;
