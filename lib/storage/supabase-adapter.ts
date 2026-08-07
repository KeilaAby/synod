import 'server-only';

import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { envServeur } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/server';

import { DUREE_URL_SIGNEE_SECONDES, type StorageAdapter } from './types';

/**
 * Implementation Supabase Storage — ENF-POR-03, ENF-SEC-09.
 *
 * Seul fichier de la couche stockage qui nomme Supabase. Le frere
 * `s3-adapter.ts` sera livre au lot 8 comme preuve d'interchangeabilite
 * (plan.md §14.2).
 *
 * ⚠ CE MODULE CONTOURNE LA RLS. Il emprunte la cle de service, parce que le
 * seau n'a AUCUNE politique et reste ferme a tout role `authenticated` : sur
 * Supabase, `storage.objects` appartient a `supabase_storage_admin` et
 * `CREATE POLICY` y est refuse a `postgres` (42501). Voir la migration 0014.
 *
 * L'application est donc la SEULE porte, et c'est un choix defendable :
 * l'autorisation vit a un seul endroit, la Server Action, ou elle s'exprime
 * deja avec sa portee — `requirePermission(session, 'croyant.update', chemin)`.
 * Une politique SQL aurait REECRIT cette regle en SQL, et deux ecritures d'une
 * meme regle finissent toujours par diverger.
 *
 * CONSEQUENCE IMPERATIVE : aucun appel a ce module sans controle
 * d'habilitation prealable. Il n'y a pas de second filet derriere.
 */

type ClientAdmin = ReturnType<typeof createAdminClient>;

/**
 * La cle de service est facultative dans l'environnement : son absence doit
 * degrader lisiblement, pas faire tomber la page qui affichait la liste.
 */
function client(): ActionResult<ClientAdmin> {
  try {
    return ok(createAdminClient());
  } catch {
    return ko(
      "Le stockage des fichiers n'est pas configure : renseignez " +
        'SUPABASE_SERVICE_ROLE_KEY dans .env.local.',
    );
  }
}

export const supabaseStorageAdapter: StorageAdapter = {
  async put(cle, contenu, options) {
    const sb = client();
    if (!sb.ok) return sb;

    const { STORAGE_BUCKET } = envServeur();
    const { error } = await sb.data.storage.from(STORAGE_BUCKET).upload(cle, contenu, {
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
    const sb = client();
    if (!sb.ok) return sb;

    const { STORAGE_BUCKET } = envServeur();
    const { data, error } = await sb.data.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(cle, dureeSecondes);

    if (error || !data?.signedUrl) {
      return ko("Le fichier est introuvable ou n'est plus accessible.");
    }
    return ok(data.signedUrl);
  },

  async signedUrls(cles, dureeSecondes = DUREE_URL_SIGNEE_SECONDES) {
    if (cles.length === 0) return ok(new Map());

    const sb = client();
    if (!sb.ok) return sb;

    const { STORAGE_BUCKET } = envServeur();
    const { data, error } = await sb.data.storage
      .from(STORAGE_BUCKET)
      .createSignedUrls([...cles], dureeSecondes);

    if (error) {
      console.error('[storage] signature en lot', error.message);
      return ko("Les fichiers n'ont pas pu etre rendus accessibles.");
    }

    const table = new Map<string, string>();
    for (const entree of data ?? []) {
      // `path` peut etre nul quand l'objet a disparu : on l'ignore plutot que
      // de faire echouer les autres.
      if (entree.path && entree.signedUrl) table.set(entree.path, entree.signedUrl);
    }
    return ok(table);
  },

  async delete(cle) {
    const sb = client();
    if (!sb.ok) return sb;

    const { STORAGE_BUCKET } = envServeur();
    const { error } = await sb.data.storage.from(STORAGE_BUCKET).remove([cle]);
    return error ? ko("Le fichier n'a pas pu etre supprime.") : ok();
  },

  async list(prefixe) {
    const sb = client();
    if (!sb.ok) return sb;

    const { STORAGE_BUCKET } = envServeur();
    const { data, error } = await sb.data.storage.from(STORAGE_BUCKET).list(prefixe);
    if (error) return ko('Le contenu du dossier est illisible.');

    return ok((data ?? []).map((o) => `${prefixe}/${o.name}`));
  },
};
