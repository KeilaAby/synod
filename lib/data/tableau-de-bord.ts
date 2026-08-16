import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * Les indicateurs d'un perimetre — EF-DSH-01 a 04.
 *
 * UN SEUL ALLER-RETOUR pour quinze mesures. Les demander une par une couterait
 * quinze fois 0,5 a 4 secondes avant le premier chiffre, soit une minute pour
 * une page qui doit s'ouvrir d'un coup (regle 28).
 *
 * `fn_tableau_de_bord` est SECURITY INVOKER : la RLS borne le resultat a la
 * portee de l'appelant, et cet ecran n'a aucun filtrage a refaire.
 */

export type MesuresTableauDeBord = Record<string, number>;

/** Ce que rend la fonction quand rien n'est lisible : des zeros, pas `null`. */
const VIDE: MesuresTableauDeBord = {
  croyants: 0,
  femmes: 0,
  hommes: 0,
  nouveaux_baptises: 0,
  encellules: 0,
  cellules: 0,
  eglises: 0,
  paroisses: 0,
  districts: 0,
  regionaux: 0,
  membres_bureau: 0,
  membres_finances: 0,
  bureaux_actifs: 0,
  recettes: 0,
  depenses: 0,
  solde_consolide: 0,
  transferts_attente: 0,
  mouvements_attente: 0,
};

export interface ResultatTableauDeBord {
  readonly mesures: MesuresTableauDeBord;
  /**
   * La lecture a-t-elle ECHOUE ?
   *
   * A distinguer d'un perimetre reellement vide (regle 15) : des zeros affiches
   * sans nuance se lisent « nous ne sommes rien », quand la verite peut etre
   * « la mesure n'a pas abouti ». L'ecran le dit.
   */
  readonly illisible: boolean;
}

export async function chargerTableauDeBord(
  entityId: string,
  debut: string,
  fin: string,
): Promise<ResultatTableauDeBord> {
  const sb = await createClient();

  const { data, error } = await sb.rpc('fn_tableau_de_bord', {
    p_entity: entityId,
    p_debut: debut,
    p_fin: fin,
  });

  if (error) return { mesures: VIDE, illisible: true };

  const ligne = (data as Record<string, unknown>[] | null)?.[0];
  if (!ligne) return { mesures: VIDE, illisible: true };

  /**
   * `numeric` traverse PostgREST en CHAINE, pour ne pas perdre de precision en
   * JSON : sans `Number()`, « 1000 » + « 200 » ferait « 1000200 ».
   */
  const mesures: MesuresTableauDeBord = { ...VIDE };
  for (const cle of Object.keys(VIDE)) {
    mesures[cle] = Number(ligne[cle] ?? 0);
  }

  return { mesures, illisible: false };
}
