import 'server-only';

import { envServeur } from '@/lib/env';

import { supabaseAuthAdapter } from './supabase-adapter';
import type { AuthAdapter } from './types';

/**
 * Point de selection du fournisseur d'identite — ENF-POR-02.
 *
 * Changer d'hebergeur = ajouter une entree ici et ecrire l'adaptateur
 * correspondant. Aucun autre fichier de l'application n'est concerne.
 */
const ADAPTATEURS: Record<string, AuthAdapter> = {
  supabase: supabaseAuthAdapter,
};

export function auth(): AuthAdapter {
  const { AUTH_PROVIDER } = envServeur();
  const adaptateur = ADAPTATEURS[AUTH_PROVIDER];

  if (!adaptateur) {
    throw new Error(`Fournisseur d'authentification inconnu : ${AUTH_PROVIDER}`);
  }
  return adaptateur;
}

export type { AuthAdapter, IdentiteAuth } from './types';
export { MOT_DE_PASSE_LONGUEUR_MIN, validerRobustesseMotDePasse } from './types';
