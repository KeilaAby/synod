import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * Les profils de privilèges enregistrés — EF-ADM-05.
 *
 * Ils s'ajoutent aux quatre raccourcis du domaine, qui eux ne se modifient pas :
 * une organisation a ses propres découpages, et les figer dans le code
 * obligerait à redéployer pour ajouter « Responsable jeunesse ».
 *
 * `entity_id` distingue deux origines, DEUX ÉCRANS (règle 16 : deux opérations
 * distinctes, pas une seule variante) :
 *   - `null` — un profil GLOBAL, commun à toute l'organisation, composé au
 *     Siège (`/administration/parametres`, `settings.manage`) ;
 *   - renseigné — un profil LOCAL, propre à une entité, composé par elle-même
 *     (`/administration/profils`, `permission.delegate`).
 *
 * La RLS (migration `0008`) filtre déjà : cette fonction rend exactement ce
 * que la session courante peut voir — les profils globaux et ceux de son
 * propre périmètre — sans second filtrage à refaire ici.
 */
export interface ProfilEnregistre {
  id: string;
  nom: string;
  description: string | null;
  permissions: string[];
  entity_id: string | null;
}

export async function chargerProfilsHabilitation(): Promise<ProfilEnregistre[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('permission_profiles')
    .select('id, nom, description, permissions, entity_id')
    .order('nom')
    .returns<ProfilEnregistre[]>();

  return error ? [] : (data ?? []);
}
