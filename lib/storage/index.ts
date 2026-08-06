import 'server-only';

import { envServeur } from '@/lib/env';

import { supabaseStorageAdapter } from './supabase-adapter';
import type { StorageAdapter } from './types';

/**
 * Point de selection du fournisseur de stockage — ENF-POR-03.
 *
 * `s3` sera branche au lot 8 : un stockage compatible S3 est la cible de
 * reversibilite retenue (plan.md §14.4, CA-16).
 */
const ADAPTATEURS: Record<string, StorageAdapter | undefined> = {
  supabase: supabaseStorageAdapter,
  s3: undefined, // lot 8
};

export function storage(): StorageAdapter {
  const { STORAGE_PROVIDER } = envServeur();
  const adaptateur = ADAPTATEURS[STORAGE_PROVIDER];

  if (!adaptateur) {
    throw new Error(
      `Fournisseur de stockage indisponible : ${STORAGE_PROVIDER}. ` +
        "L'adaptateur S3 est prevu au lot 8.",
    );
  }
  return adaptateur;
}

export {
  CONTRAINTES_FICHIER,
  DUREE_URL_SIGNEE_SECONDES,
  PREFIXES,
  construireCle,
  typeReel,
  verifierFichier,
} from './types';
export type { PrefixeObjet, StorageAdapter, UsageFichier } from './types';
