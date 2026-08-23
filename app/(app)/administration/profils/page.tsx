import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ReglagesProfils } from '@/components/administration/reglages-profils';
import { PageHeader } from '@/components/shared/page-header';
import { chargerProfilsHabilitation } from '@/lib/data/profils';
import { detient } from '@/lib/domain/permissions';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Profils de privilèges' };

/**
 * EF-ADM-05 — les profils LOCAUX, propres à une entité.
 *
 * CHAQUE ENTITÉ GÈRE LES SIENS — décision de l'utilisateur le 23 août 2026.
 * Distinct de `/administration/parametres` (profils GLOBAUX, Siège seul,
 * `settings.manage`) : ici, `permission.delegate` — la même habilitation qui
 * gouverne déjà la délégation de droits à un compte (RG-24) — et l'entité
 * n'est JAMAIS choisie, elle est celle de l'auteur. Pas de sélecteur, pas de
 * portée à discuter : composer pour une entité qu'on ne dirige pas n'aurait
 * aucun sens ici.
 *
 * LA RLS FILTRE DÉJÀ (migration `0008`) : `chargerProfilsHabilitation` rend
 * les profils globaux et ceux du périmètre de la session, sans second
 * filtrage à refaire — cet écran se borne ensuite à NE MONTRER que les
 * siens, pour ne pas encombrer avec ceux d'une entité descendante.
 */
export default async function ProfilsLocauxPage() {
  const [session, profils] = await Promise.all([getSession(), chargerProfilsHabilitation()]);

  if (!session) redirect('/connexion');

  const peutComposer = detient(session, 'permission.delegate');
  const profilsLocaux = profils.filter((p) => p.entity_id === session.entityId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Profils de privilèges"
        description={`Les découpages d’habilitations propres à « ${session.entiteNom} », proposés à l’ouverture d’un compte de votre entité.`}
      />

      <ReglagesProfils
        profils={profilsLocaux}
        peutComposer={peutComposer}
        entiteImposee={{ id: session.entityId, nom: session.entiteNom }}
      />
    </div>
  );
}
