import 'server-only';

import { ko, ok } from '@/lib/domain/result';
import { envServeur } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

import { DUREE_URL_SIGNEE_SECONDES, type StorageAdapter } from './types';

/**
 * Implementation Supabase Storage — ENF-POR-03.
 *
 * Seul fichier de la couche stockage qui nomme Supabase. Le frere
 * `s3-adapter.ts` sera livre au lot 8 comme preuve d'interchangeabilite
 * (plan.md §14.2).
 */
export const supabaseStorageAdapter: StorageAdapter = {
  async put(cle, contenu, options) {
    const { STORAGE_BUCKET } = envServeur();
    const sb = await createClient();

    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(cle, contenu, {
      contentType: options?.contentType,
      upsert: options?.upsert ?? false,
    });

    if (error) {
      console.error('[storage] depot', cle, error.message);
      return ko("Le fichier n'a pas pu etre enregistre.");
    }
    // On retourne la CLE, jamais une URL : c'est elle qui va en base.
    return ok(cle);
  },

  async signedUrl(cle, dureeSecondes = DUREE_URL_SIGNEE_SECONDES) {
    const { STORAGE_BUCKET } = envServeur();
    const sb = await createClient();

    const { data, error } = await sb.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(cle, dureeSecondes);

    if (error || !data?.signedUrl) {
      return ko("Le fichier est introuvable ou n'est plus accessible.");
    }
    return ok(data.signedUrl);
  },

  async delete(cle) {
    const { STORAGE_BUCKET } = envServeur();
    const sb = await createClient();

    const { error } = await sb.storage.from(STORAGE_BUCKET).remove([cle]);
    return error ? ko("Le fichier n'a pas pu etre supprime.") : ok();
  },

  async list(prefixe) {
    const { STORAGE_BUCKET } = envServeur();
    const sb = await createClient();

    const { data, error } = await sb.storage.from(STORAGE_BUCKET).list(prefixe);
    if (error) return ko('Le contenu du dossier est illisible.');

    return ok((data ?? []).map((o) => `${prefixe}/${o.name}`));
  },
};
