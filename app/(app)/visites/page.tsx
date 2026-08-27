import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { getArbrePerimetre } from '@/lib/data/entities';
import { versOptions } from '@/lib/data/entity-options';
import {
  listerVisitesPastorales,
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

  const [visites, arbre, croyantsCandidats, parametres] = await Promise.all([
    listerVisitesPastorales(),
    getArbrePerimetre(),
    listerCroyantsCandidats(),
    getParametres(),
  ]);

  const optionsEntites = versOptions(arbre, arbre);

  return (
    <VisitesClient
      initialVisites={visites}
      entites={optionsEntites}
      croyantsCandidats={croyantsCandidats}
      currentEntityId={session.entityId}
      organisationNom={parametres.nom_organisation}
    />
  );
}
