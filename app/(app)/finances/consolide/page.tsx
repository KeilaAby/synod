import type { Metadata } from 'next';

import { PageHeader } from '@/components/shared/page-header';
import { getArbrePerimetre } from '@/lib/data/entities';
import { chargerSoldesPerimetre } from '@/lib/data/finances';
import { getParametres } from '@/lib/data/settings';
import { formatNombre } from '@/lib/utils/format';

import { ConsolideClient } from './consolide-client';

export const metadata: Metadata = { title: 'Vue consolidée' };

/**
 * Vue consolidée du périmètre — EF-FIN-11, EF-FIN-12, EF-FIN-13.
 *
 * LE SOLDE DE CHAQUE ENTITÉ, PAS UN TOTAL. Le triptyque de `/finances` répond
 * à « de combien disposons-nous ? » ; cet écran répond à « laquelle de mes
 * entités va mal ? ». Ce n'est pas la même question, et un total ne peut pas y
 * répondre : c'est justement lui qui masque l'église en déficit sous
 * l'excédent de sa voisine.
 *
 * TOUT EST CALCULÉ EN BASE, EN UNE PASSE. `fn_finance_soldes_perimetre` rend
 * une ligne par entité ; boucler sur `chargerSolde` aurait coûté un
 * aller-retour par ligne du tableau (règle 28).
 *
 * LA RLS BORNE LE RÉSULTAT — la fonction est `SECURITY INVOKER`. Un
 * gestionnaire de district n'obtient que son district, sans qu'aucun filtrage
 * n'ait à être refait ici : ce qu'on ne refait pas, on ne peut pas le rater.
 */
export default async function ConsolidePage() {
  const [arbre, soldes, parametres] = await Promise.all([
    getArbrePerimetre(),
    chargerSoldesPerimetre(),
    getParametres(),
  ]);

  const lignes = arbre
    .filter((e) => e.is_active)
    .map((e) => ({
      id: e.id,
      nom: e.nom,
      code: e.code,
      type: e.type,
      niveau: e.niveau,
      parentId: e.parent_id,
      solde: soldes.get(e.id) ?? {
        recettesPropres: 0,
        depensesPropres: 0,
        recettesConsolidees: 0,
        depensesConsolidees: 0,
      },
    }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Finances"
        title="Vue consolidée"
        description={`Solde propre et consolidé de ${formatNombre(lignes.length)} entité${lignes.length > 1 ? 's' : ''} de votre périmètre.`}
      />

      <ConsolideClient lignes={lignes} devise={parametres.devise} />
    </div>
  );
}
