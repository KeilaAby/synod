import type { Metadata } from 'next';

import { PageHeader } from '@/components/shared/page-header';
import { getArbrePerimetre } from '@/lib/data/entities';
import { chargerModeles } from '@/lib/data/rapports';
import { getParametres } from '@/lib/data/settings';
import { estOnglet } from '@/lib/domain/rapport';
import { formatNombre } from '@/lib/utils/format';

import { RapportsClient } from './rapports-client';

export const metadata: Metadata = { title: 'Rapports' };

/**
 * EF-RAP-07 a 11 — la bibliotheque de modeles.
 *
 * TOUT est charge ici, en parallele : les modeles visibles et l'arbre du
 * perimetre. Les onglets, la recherche et l'affichage des archives se jouent
 * ensuite en memoire (regle 17) — ce sont des questions sur une liste deja
 * lue, pas des motifs de repartir au serveur.
 *
 * La RLS borne ce qui revient : `report_templates_select` porte les quatre
 * chemins de visibilite. L'ecran ne refait aucun filtrage de perimetre — il
 * n'aurait pas de quoi, et le refaire le ferait diverger.
 */
export default async function RapportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const [modeles, arbre, parametres] = await Promise.all([
    chargerModeles(),
    getArbrePerimetre(),
    // Regle 21 — un parametre configurable se LIT a chaque rendu. Fige au
    // chargement d'un module, le reglage deviendrait decoratif : le fermer
    // n'aurait d'effet qu'au redemarrage suivant.
    getParametres(),
  ]);

  /**
   * Le Siege, s'il est dans le perimetre — EF-RAP-08.
   *
   * C'est ce chemin qui decide si « modele officiel » et la portee globale sont
   * proposes. Le critere est ce que le perimetre CONTIENT, jamais le role : un
   * gestionnaire de district n'est pas SuperAdmin, et son arbre n'a pas de
   * racine SIEGE.
   */
  const cheminSiege = arbre.find((e) => e.type === 'SIEGE')?.path ?? null;

  const actifs = modeles.filter((m) => m.archiveLe === null).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Rapports"
        title="Bibliothèque de modèles"
        description={
          modeles.length > 0
            ? `${formatNombre(actifs)} modèle${actifs > 1 ? 's' : ''} disponible${actifs > 1 ? 's' : ''} sur ${formatNombre(modeles.length)} visible${modeles.length > 1 ? 's' : ''}.`
            : 'Aucun modèle dans votre périmètre — composez votre premier modèle de rapport.'
        }
      />

      <RapportsClient
        modeles={modeles}
        cheminSiege={cheminSiege}
        compositionLibre={parametres.rapport_composition_libre}
        filtresInitiaux={{
          recherche: params.q ?? '',
          // Ce qui vient de l'URL est GARDE : un onglet inconnu afficherait une
          // liste vide sous un libelle qui n'existe pas.
          onglet: estOnglet(params.onglet) ? params.onglet : 'tous',
          avecArchives: params.archives === 'oui',
        }}
      />
    </div>
  );
}
