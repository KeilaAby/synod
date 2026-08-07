import type { Metadata } from 'next';

import { NouveauCroyantDialog } from '@/components/croyants/croyant-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { listerCroyants } from '@/lib/data/croyants';
import { getOptionsCroyant } from '@/lib/data/croyant-options';
import { formatNombre } from '@/lib/utils/format';
import { filtresDepuisParams } from '@/lib/validation/croyant';

import { CroyantsClient } from './croyants-client';

export const metadata: Metadata = { title: 'Croyants' };

/**
 * EF-CRO-04 — liste des croyants.
 *
 * Pagination et filtrage SERVEUR (ENF-PRF-08) : contrairement à la structure,
 * bornée à quelques milliers d'entités, les croyants visent 200 000. Rien
 * n'est jamais chargé intégralement côté client.
 *
 * La page ne fait que lire ; filtres, table et pop-up sont réunis dans
 * `CroyantsClient`, qui les fait partager un même état de transition.
 */
export default async function CroyantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const filtres = filtresDepuisParams(params);

  /**
   * PERFORMANCE — deux lectures, pas cinq.
   *
   * Le décompte par sexe coûtait trois requêtes de comptage supplémentaires,
   * rejouées à CHAQUE frappe dans la recherche. Sur une liaison lente, c'était
   * l'essentiel de la latence ressentie. Le total vient désormais du `count`
   * que la requête paginée ramène déjà gratuitement ; la répartition par sexe
   * relève du tableau de bord (lot 5), pas d'un en-tête de liste.
   */
  const [page, options] = await Promise.all([
    listerCroyants(filtres),
    getOptionsCroyant(),
  ]);

  const aDesFiltres = Object.keys(params).some((c) => c !== 'page');

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Croyants"
        title="Croyants"
        description={
          aDesFiltres
            ? `${formatNombre(page.total)} croyant${page.total > 1 ? 's' : ''} correspondant aux filtres.`
            : `${formatNombre(page.total)} croyant${page.total > 1 ? 's' : ''} dans votre périmètre.`
        }
        actions={<NouveauCroyantDialog options={options} />}
      />

      <CroyantsClient
        lignes={page.lignes}
        total={page.total}
        page={page.page}
        nbPages={page.nbPages}
        options={options}
        aDesFiltres={aDesFiltres}
      />
    </div>
  );
}
