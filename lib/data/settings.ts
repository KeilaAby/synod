import 'server-only';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

/**
 * Parametres globaux de l'organisation — EF-ADM-11.
 *
 * Une seule ligne (`id = 1`), lisible par tout compte authentifie et modifiable
 * par `settings.manage` seulement. Memoise par requete : ces valeurs sont lues
 * par plusieurs actions d'un meme rendu.
 */

export interface Parametres {
  nom_organisation: string;
  devise: string;
  fuseau_horaire: string;
  /** ARB-5 / RG-30 — fenetre « nouveaux baptises », 15 jours par defaut. */
  fenetre_nouveaux_baptises_jours: number;
  /** ARB-3 — workflow de validation financiere. */
  finance_validation_active: boolean;
  separation_saisie_validation: boolean;
  /** ARB-4 / EF-TRF-05 — auto-approbation des transferts internes. */
  transfert_auto_approbation_interne: boolean;
}

/**
 * Repli en cas de lecture impossible.
 *
 * Les valeurs sont volontairement PRUDENTES, et non celles de la base : une
 * panne de lecture ne doit jamais ELARGIR un droit. `transfert_auto_approbation_interne`
 * vaut donc `false` ici, la ou la base le met a `true` — a defaut de savoir, on
 * demande une approbation explicite plutot que de l'accorder.
 */
const REPLI: Parametres = {
  nom_organisation: 'SYNOD',
  devise: 'MGA',
  fuseau_horaire: 'Africa/Porto-Novo',
  fenetre_nouveaux_baptises_jours: 15,
  finance_validation_active: false,
  separation_saisie_validation: true,
  transfert_auto_approbation_interne: false,
};

export const getParametres = cache(async (): Promise<Parametres> => {
  const sb = await createClient();

  const { data, error } = await sb
    .from('organisation_settings')
    .select(
      'nom_organisation, devise, fuseau_horaire, fenetre_nouveaux_baptises_jours, ' +
        'finance_validation_active, separation_saisie_validation, ' +
        'transfert_auto_approbation_interne',
    )
    .eq('id', 1)
    .maybeSingle<Parametres>();

  if (error || !data) return REPLI;
  return data;
});
