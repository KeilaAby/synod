import type { Metadata } from 'next';

import { ReferentielsClient } from '@/components/referentiels/referentiels-client';
import type { LigneReferentiel } from '@/components/referentiels/referentiel-table';
import { PageHeader } from '@/components/shared/page-header';
import { compterReferentiels, listerReferentiel } from '@/lib/data/referentiels';
import { detient } from '@/lib/domain/permissions';
import { SLUGS_REFERENTIELS, type SlugReferentiel } from '@/lib/domain/referentiels';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Referentiels' };

/**
 * EF-REF-01 à 06 — les quatre référentiels.
 *
 * `referentiel.manage` n'est pas délégable : ces tables sont partagées par
 * toute l'organisation. Une entité ne peut pas les modifier pour les autres.
 *
 * Les valeurs des quatre tables sont chargées ICI, en parallèle, et le CRUD
 * s'ouvre en pop-up : les pages `/referentiels/<slug>` ont disparu. Consulter
 * les grades pour vérifier un libellé ne justifiait pas une navigation
 * complète, suivie d'un retour arrière pour consulter les fonctions.
 */
export default async function ReferentielsPage() {
  const session = await requireSession();

  // Les quatre lectures partent ENSEMBLE : enchainees, elles auraient coute
  // quatre allers-retours la ou un seul suffit.
  const [compteurs, ...listes] = await Promise.all([
    compterReferentiels(),
    ...SLUGS_REFERENTIELS.map((slug) => listerReferentiel(slug)),
  ]);

  const lignesParSlug = {} as Record<SlugReferentiel, LigneReferentiel[]>;
  SLUGS_REFERENTIELS.forEach((slug, i) => {
    lignesParSlug[slug] = listes[i] ?? [];
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Référentiels"
        description="Nomenclatures et listes officielles partagées par l’ensemble de l’organisation. Les valeurs archivées restent préservées pour l’intégrité des historiques."
      />

      <ReferentielsClient
        lignesParSlug={lignesParSlug}
        compteurs={compteurs}
        // Le contrôle d'affichage double celui de la Server Action et de la RLS.
        peutGerer={detient(session, 'referentiel.manage')}
      />
    </div>
  );
}
