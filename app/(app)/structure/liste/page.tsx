import type { Metadata } from 'next';
import { Network, Plus } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/shared/page-header';
import { PermissionGate } from '@/components/shared/permission-gate';
import { Button } from '@/components/ui/button';
import { cheminLisible, getArbrePerimetre, indexerParChemin } from '@/lib/data/entities';
import { ENTITY_TYPES } from '@/lib/domain/hierarchy';
import { formatNombre } from '@/lib/utils/format';

import { ListeStructureClient, type LigneStructure } from './liste-client';

export const metadata: Metadata = { title: 'Liste des entites' };

/**
 * EF-STR-09 — liste filtrable des entites.
 *
 * Le serveur charge l'arbre UNE FOIS ; le filtrage est ensuite instantane cote
 * client (voir `liste-client.tsx`). Les parametres d'URL ne servent qu'a
 * amorcer l'etat initial : ils ne declenchent plus de rendu serveur a chaque
 * changement de filtre.
 */
export default async function ListeStructurePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const arbre = await getArbrePerimetre();
  const index = indexerParChemin(arbre);

  const lignes: LigneStructure[] = arbre.map((e) => {
    const chemin = cheminLisible(e, index);
    return {
      id: e.id,
      nom: e.nom,
      code: e.code,
      type: e.type,
      niveau: e.niveau,
      // Le chemin sans le dernier segment : le nom propre est deja en colonne 1.
      cheminParent: chemin.split(' › ').slice(0, -1).join(' › '),
      nbDescendants: e.nbDescendants,
      isActive: e.is_active,
      sansAcces: e.sans_acces_application,
    };
  });

  const typeDemande = params.type;
  const actifDemande = params.actif;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Structure"
        title="Liste des entites"
        description={`${formatNombre(arbre.length)} entite${arbre.length > 1 ? 's' : ''} dans votre perimetre.`}
        actions={
          <>
            <Button asChild variant="outline" className="h-10">
              <Link href="/structure">
                <Network className="mr-2 size-4" aria-hidden />
                Organigramme
              </Link>
            </Button>
            <PermissionGate perm="entity.create">
              <Button asChild className="h-10">
                <Link href="/structure/nouveau">
                  <Plus className="mr-2 size-4" aria-hidden />
                  Nouvelle entite
                </Link>
              </Button>
            </PermissionGate>
          </>
        }
      />

      <ListeStructureClient
        entites={lignes}
        filtresInitiaux={{
          recherche: params.q ?? '',
          type:
            typeDemande && (ENTITY_TYPES as readonly string[]).includes(typeDemande)
              ? typeDemande
              : 'tous',
          actif:
            actifDemande === 'actifs' || actifDemande === 'inactifs' ? actifDemande : 'tous',
        }}
      />
    </div>
  );
}
