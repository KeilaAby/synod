import 'server-only';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

/**
 * Les demandes de promotion de grade — EF-CRO-12.
 *
 * ELLES NE SONT PAS DES ERREURS : une demande en attente veut dire qu'une
 * eglise a reconnu quelque chose, et qu'il reste a le confirmer. Ce qui manque,
 * c'est une DECISION — et elle se prend a l'entite superieure.
 *
 * LA RLS FAIT LE TRI : `promotions_select` (migration `0067`) laisse voir une
 * demande a l'eglise qui l'a faite ET a l'arbitre qui doit la trancher. On ne
 * refiltre donc rien ici : ce qui remonte est deja ce qu'on a le droit de voir
 * (regle 15 — un perimetre vide signale une panne de lecture, pas un refus).
 */

const CHAMPS = `
  id, croyant_id, statut, motif, motif_refus, date_demande, date_decision,
  eglise_id, arbitre_id,
  croyant:croyants!promotions_grade_croyant_id_fkey (
    id, nom, prenom, matricule, photo_key
  ),
  gradeActuel:grades!promotions_grade_grade_actuel_id_fkey (id, libelle, ordre),
  gradeDemande:grades!promotions_grade_grade_demande_id_fkey (id, libelle, ordre),
  eglise:entities!promotions_grade_eglise_id_fkey (id, nom, path),
  arbitre:entities!promotions_grade_arbitre_id_fkey (id, nom, path),
  demandeur:profiles!promotions_grade_demande_par_fkey (id, nom_complet),
  decideur:profiles!promotions_grade_decide_par_fkey (id, nom_complet)
` as const;

export interface PromotionEnAttente {
  id: string;
  croyant_id: string;
  statut: 'DEMANDE' | 'APPROUVE' | 'REFUSE' | 'ANNULE';
  motif: string | null;
  motif_refus: string | null;
  date_demande: string;
  date_decision: string | null;
  eglise_id: string;
  arbitre_id: string;
  croyant: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    photo_key: string | null;
  } | null;
  /** `ordre` accompagne le libelle : sans lui, la frise ne saurait pas dire
   *  si le changement MONTE ou DESCEND, et « Diacre » seul ne le dit pas. */
  gradeActuel: { id: string; libelle: string; ordre: number } | null;
  gradeDemande: { id: string; libelle: string; ordre: number } | null;
  eglise: { id: string; nom: string; path: string } | null;
  arbitre: { id: string; nom: string; path: string } | null;
  demandeur: { id: string; nom_complet: string } | null;
  decideur: { id: string; nom_complet: string } | null;
}

/**
 * Les demandes ENCORE OUVERTES du perimetre.
 *
 * Seules celles-la : une demande tranchee a fait son office, et la garder dans
 * la file ferait chercher ce qu'il reste a faire au milieu de ce qui est fait.
 * L'historique se lit sur la fiche du croyant, ou il a un sens.
 *
 * LES PLUS ANCIENNES EN TETE — meme choix que la file de validation
 * financiere : ce qui attend depuis le plus longtemps est ce qui presse.
 */
export const chargerPromotionsEnAttente = cache(
  async (): Promise<PromotionEnAttente[]> => {
    const sb = await createClient();

    const { data, error } = await sb
      .from('promotions_grade')
      .select(CHAMPS)
      .eq('statut', 'DEMANDE')
      .order('date_demande', { ascending: true })
      .limit(500)
      .returns<PromotionEnAttente[]>();

    // Une file illisible ne doit pas casser la page des croyants : elle
    // disparait, et le reste de l'ecran continue de servir.
    if (error) return [];
    return data ?? [];
  },
);

/**
 * La demande en cours d'UN croyant, pour sa fiche — EF-CRO-12.
 *
 * SANS ELLE, LE CIRCUIT EST INCOMPREHENSIBLE : on change le grade, on
 * enregistre, et la fiche affiche toujours l'ancien. Il faut DIRE qu'une
 * decision est attendue, sinon on croit que l'enregistrement a echoue — et on
 * recommence.
 */
export const promotionDuCroyant = cache(
  async (croyantId: string): Promise<PromotionEnAttente | null> => {
    const sb = await createClient();

    const { data, error } = await sb
      .from('promotions_grade')
      .select(CHAMPS)
      .eq('croyant_id', croyantId)
      .eq('statut', 'DEMANDE')
      .maybeSingle<PromotionEnAttente>();

    if (error) return null;
    return data;
  },
);

/**
 * TOUS les changements de grade d'un croyant — EF-CRO-12.
 *
 * CELUI-CI N'EST PAS BORNE AUX DEMANDES EN COURS, contrairement a la file :
 * c'est un HISTORIQUE. Une promotion refusee en fait partie, et son motif
 * explique la suite du parcours ; la taire donnerait une frise ou il ne s'est
 * jamais rien passe entre deux grades.
 *
 * `ANNULE` est charge quand meme : c'est la lecture, dans le domaine
 * (`construireHistorique`), qui decide de ne pas l'afficher. Filtrer ici
 * disperserait la regle a deux endroits.
 */
export const historiqueGradesDuCroyant = cache(
  async (croyantId: string): Promise<PromotionEnAttente[]> => {
    const sb = await createClient();

    const { data, error } = await sb
      .from('promotions_grade')
      .select(CHAMPS)
      .eq('croyant_id', croyantId)
      .order('date_demande', { ascending: false })
      .returns<PromotionEnAttente[]>();

    // Un historique illisible ne doit pas casser la fiche : la frise garde ses
    // autres evenements, et le reste de l'ecran continue de servir.
    if (error) return [];
    return data ?? [];
  },
);
