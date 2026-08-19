import type { Metadata } from 'next';

import { PageHeader } from '@/components/shared/page-header';
import { chargerAudit } from '@/lib/data/audit';
import { formatNombre } from '@/lib/utils/format';

import { AuditClient } from './audit-client';

export const metadata: Metadata = { title: 'Journal d audit' };

/**
 * EF-ADM-09, ENF-SEC-08 — la trace horodatee des operations.
 *
 * AUCUN CONTROLE DE DROIT ICI. La politique `audit_select` exige `audit.read`
 * ET le perimetre : sans le droit, la lecture ne rend rien, et la carte du hub
 * n'a de toute facon pas ete proposee. Le refaire en TypeScript le ferait
 * diverger le jour ou la politique change.
 *
 * LE JOURNAL NE SE MODIFIE JAMAIS — aucune action d'ecriture n'existe sur cet
 * ecran, et c'est le point : un journal qu'on peut corriger ne prouve rien.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { lignes, tronque } = await chargerAudit();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Journal d audit"
        description={
          lignes.length > 0
            ? `${formatNombre(lignes.length)} operation${lignes.length > 1 ? 's' : ''} tracee${lignes.length > 1 ? 's' : ''} dans votre perimetre.`
            : 'Aucune operation tracee dans votre perimetre.'
        }
      />

      <AuditClient
        lignes={lignes}
        tronque={tronque}
        filtresInitiaux={{
          recherche: params.q ?? '',
          action: params.action ?? 'toutes',
          domaine: params.domaine ?? 'tous',
        }}
      />
    </div>
  );
}
