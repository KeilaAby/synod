import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * Le gabarit réglable de l'attestation de transfert — EF-TRF-08, migration
 * `0070`.
 *
 * LECTURE LIBRE, à la différence de la configuration SMTP : ce gabarit doit
 * être lu par QUICONQUE imprime une attestation (`transfer.certify`), pas
 * seulement par `settings.manage`. La RLS le dit déjà (`using (true)` en
 * lecture) ; le repli ci-dessous ne sert qu'à amortir une lecture manquée
 * (règle 15 — une absence de données n'est pas un refus de droit).
 */

export interface ParametresAttestation {
  logo_key: string | null;
  texte_corps: string;
  mentions_legales: string | null;
  cartouche_signature: string;
}

/**
 * MÊME TEXTE PAR DÉFAUT QU'EN BASE (migration `0070`). Une lecture qui échoue
 * ne doit pas changer le document qu'on obtenait avant que ce gabarit existe.
 */
const REPLI: ParametresAttestation = {
  logo_key: null,
  texte_corps:
    'Le soussigné atteste que le croyant désigné ci-dessus a été régulièrement ' +
    'transféré de son entité d’origine vers son entité d’accueil, et que ce ' +
    'transfert a été approuvé aux dates portées au présent document.',
  mentions_legales: null,
  cartouche_signature: 'Pour l’entité émettrice',
};

export async function chargerParametresAttestation(): Promise<ParametresAttestation> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('attestation_transfert_settings')
    .select('logo_key, texte_corps, mentions_legales, cartouche_signature')
    .eq('id', 1)
    .maybeSingle<ParametresAttestation>();

  return error || !data ? REPLI : data;
}
