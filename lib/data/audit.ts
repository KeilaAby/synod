import 'server-only';

import { createClient } from '@/lib/supabase/server';

import { DataError } from './errors';

/**
 * Le journal d'audit — EF-ADM-09, ENF-SEC-08, ENF-SEC-11.
 *
 * IL NE SE LIT QUE DANS SON PERIMETRE, et seulement avec `audit.read` : la
 * politique `audit_select` porte les deux conditions. Aucun filtre n'est
 * reecrit ici.
 *
 * ON NE LIT PAS TOUT L'HISTORIQUE. Le journal grossit d'une ligne a chaque
 * connexion, chaque saisie, chaque validation : au bout d'un an il en compte
 * des centaines de milliers, et personne ne les parcourt. On ramene les mille
 * plus RECENTES — ce qu'on vient y chercher est presque toujours d'hier —, et
 * le plafond est ANNONCE a l'ecran plutot que silencieux (regle 17).
 */

export const PLAFOND_AUDIT = 1000;

const CHAMPS = `
  id, action, table_name, record_id, entity_id, diff, created_at,
  auteur:profiles!audit_log_user_id_fkey (id, nom_complet),
  entite:entities!audit_log_entity_id_fkey (id, nom, type)
` as const;

export interface LigneAudit {
  id: number;
  action: string;
  table_name: string;
  record_id: string | null;
  entity_id: string | null;
  /** Ce qui a change. Sa forme depend de l'action : on l'affiche, on ne l'interprete pas. */
  diff: unknown;
  created_at: string;
  auteur: { id: string; nom_complet: string } | null;
  entite: { id: string; nom: string; type: string } | null;
}

export interface LotAudit {
  lignes: LigneAudit[];
  /** Le plafond a ete atteint : l'ecran le DIT, il ne le tait pas. */
  tronque: boolean;
}

export async function chargerAudit(): Promise<LotAudit> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('audit_log')
    .select(CHAMPS)
    .order('created_at', { ascending: false })
    // Une ligne de plus que le plafond : elle ne sert qu'a SAVOIR que le
    // journal deborde, sans payer un comptage separe.
    .limit(PLAFOND_AUDIT + 1)
    .returns<LigneAudit[]>();

  if (error) {
    throw new DataError('Le journal d’audit est momentanement illisible.', error);
  }

  const lignes = data ?? [];
  return lignes.length > PLAFOND_AUDIT
    ? { lignes: lignes.slice(0, PLAFOND_AUDIT), tronque: true }
    : { lignes, tronque: false };
}
