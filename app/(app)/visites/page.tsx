import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import {
  listerVisitesPastorales,
  listerEntitesDisponibles,
  listerCroyantsCandidats,
} from '@/lib/data/visites-pastorales';
import { getParametres } from '@/lib/data/settings';
import { VisitesClient } from './visites-client';

export const metadata: Metadata = {
  title: 'Visites pastorales | SYNOD',
  description: 'Planification des missions et visites pastorales, délégations ecclésiales et ordres de mission.',
};

export default async function VisitesPage() {
  const session = await requireSession();

  const [visites, entites, croyantsCandidats, parametres] = await Promise.all([
    listerVisitesPastorales(),
    listerEntitesDisponibles(),
    listerCroyantsCandidats(),
    getParametres(),
  ]);

  return (
    <VisitesClient
      initialVisites={visites}
      entites={entites}
      croyantsCandidats={croyantsCandidats}
      currentEntityId={session.entityId}
      organisationNom={parametres.nom_organisation}
    />
  );
}
