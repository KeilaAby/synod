import type { Metadata } from 'next';

import { PageHeader } from '@/components/shared/page-header';
import { chargerCollectes } from '@/lib/data/dimes';
import { getArbrePerimetre } from '@/lib/data/entities';
import { versOptions } from '@/lib/data/entity-options';
import { listerCategoriesFinance } from '@/lib/data/finances';
import { getParametres } from '@/lib/data/settings';
import { formatNombre } from '@/lib/utils/format';

import { DimesClient } from './dimes-client';

export const metadata: Metadata = { title: 'Dîmes' };

/**
 * Collectes de dîmes — EF-FIN-27 à 31, RG-33.
 *
 * CE QUE CET ÉCRAN N'EST PAS : un solde. Une dîme n'appartient pas à l'église
 * qui la collecte, elle appartient au Siège. Ce qu'on lit ici est donc un
 * **relevé de collecte** — « combien avons-nous recueilli, et remis ? » —,
 * jamais « de combien disposons-nous ? ».
 *
 * Les deux ne doivent surtout pas se ressembler : même carte, même couleur, et
 * un trésorier engagerait une dépense sur un argent qui ne lui appartient pas.
 * Le triptyque Recettes / Dépenses / Solde reste sur `/finances`, il n'a pas
 * d'équivalent ici.
 */
export default async function DimesPage() {
  const [collectes, arbre, categories, parametres] = await Promise.all([
    chargerCollectes(),
    getArbrePerimetre(),
    listerCategoriesFinance(),
    getParametres(),
  ]);

  const actives = arbre.filter((e) => e.is_active);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Finances"
        title="Dîmes"
        description={
          collectes.length === 0
            ? 'Aucune collecte enregistrée. La dîme revient au Siège : votre entité en tient le détail et en délivre les reçus.'
            : `${formatNombre(collectes.length)} collecte${collectes.length > 1 ? 's' : ''} — la dîme revient au Siège, votre entité en tient le détail.`
        }
      />

      <DimesClient
        collectes={collectes}
        entites={versOptions(actives, arbre)}
        // Seules les catégories de RECETTE : une dîme en est une (RG-13).
        categories={categories.filter((c) => c.sens === 'RECETTE')}
        devise={parametres.devise}
        modes={Object.fromEntries(
          actives.map((e) => [e.id, e.dime_mode ?? null]),
        )}
      />
    </div>
  );
}
