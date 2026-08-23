import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { chargerComptes, croyantsEligiblesAuCompte } from '@/lib/data/comptes';
import { getArbrePerimetre } from '@/lib/data/entities';
import { versOptions } from '@/lib/data/entity-options';
import { signerPhotos } from '@/lib/data/photos';
import { chargerProfilsHabilitation } from '@/lib/data/profils';
import { peut } from '@/lib/domain/permissions';
import { getSession } from '@/lib/session';
import { formatNombre } from '@/lib/utils/format';

import { ComptesClient } from './comptes-client';

export const metadata: Metadata = { title: 'Comptes' };

/**
 * EF-ADM-01, EF-ADM-07, EF-ADM-08 — les comptes du perimetre.
 *
 * TROIS LECTURES INDEPENDANTES, en parallele (regle 28) : les comptes, les
 * croyants encore sans compte, et l'arbre. Enchainees, elles paieraient trois
 * attentes avant le premier pixel.
 *
 * LES ENTITES PROPOSEES SONT CELLES OU L'ON PEUT OUVRIR UN COMPTE —
 * `user.manage` evalue AVEC SA PORTEE (RG-25), et les cellules ecartees
 * (RG-21 : aucun compte ne s'y rattache). Une liste plus large laisserait
 * choisir ce que l'action refusera ensuite.
 */
export default async function ComptesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const [comptes, croyants, arbre, session, profils] = await Promise.all([
    chargerComptes(),
    croyantsEligiblesAuCompte(),
    getArbrePerimetre(),
    getSession(),
    // Les profils propres a l organisation, proposes a cote des cinq fournis.
    chargerProfilsHabilitation(),
  ]);

  if (!session) redirect('/connexion');

  // Une seule signature pour tout l'ecran : les portraits du selecteur.
  const photos = await signerPhotos(croyants.map((c) => c.photo_key));

  const ouvrables = arbre.filter(
    (e) => e.is_active && e.type !== 'CELLULE' && peut(session, 'user.manage', e.path),
  );

  const actifs = comptes.filter((c) => c.is_active).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Comptes"
        description={
          comptes.length > 0
            ? `${formatNombre(actifs)} compte${actifs > 1 ? 's' : ''} actif${actifs > 1 ? 's' : ''} sur ${formatNombre(comptes.length)} dans votre perimetre.`
            : 'Aucun compte dans votre perimetre.'
        }
      />

      <ComptesClient
        comptes={comptes}
        croyants={croyants}
        photos={Object.fromEntries(photos)}
        profils={profils}
        entites={versOptions(ouvrables, arbre)}
        rechercheInitiale={params.q ?? ''}
      />
    </div>
  );
}
