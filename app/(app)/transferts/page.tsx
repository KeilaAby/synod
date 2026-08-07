import type { Metadata } from 'next';

import { PageHeader } from '@/components/shared/page-header';
import { chargerTransferts } from '@/lib/data/transferts';
import { formatNombre } from '@/lib/utils/format';

import { TransfertsClient } from './transferts-client';

export const metadata: Metadata = { title: 'Transferts' };

/**
 * EF-TRF-07, EF-TRF-08 — file d'attente et journal des transferts.
 *
 * Deux vues d'un même jeu de données, pas deux pages : la file est le journal
 * filtré sur ce que l'utilisateur peut trancher. Les séparer aurait obligé à
 * charger deux fois, et à maintenir deux fois la même règle de compétence.
 *
 * Chargement intégral puis filtrage instantané côté client, comme la structure
 * et les croyants : un transfert est un événement rare, le volume est borné par
 * nature.
 */
export default async function TransfertsPage() {
  const transferts = await chargerTransferts();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Croyants"
        title="Transferts"
        description={
          transferts.length > 0
            ? `${formatNombre(transferts.length)} demande${transferts.length > 1 ? 's' : ''} dans votre périmètre.`
            : 'Aucun transfert enregistré dans votre périmètre.'
        }
      />

      <TransfertsClient transferts={transferts} />
    </div>
  );
}
