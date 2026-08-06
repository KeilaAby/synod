import type { Metadata } from 'next';
import { List, Network, Plus } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { PermissionGate } from '@/components/shared/permission-gate';
import { EntityFlowLoader } from '@/components/structure/entity-flow-loader';
import { Button } from '@/components/ui/button';
import { getArbrePerimetre } from '@/lib/data/entities';
import { ENTITY_LABELS, type EntityType } from '@/lib/domain/hierarchy';
import { requireSession } from '@/lib/session';
import { formatNombre } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Structure' };

/**
 * EF-STR-04 — organigramme interactif de la hierarchie.
 *
 * Exigence explicite du besoin : la representation des hierarchies utilise
 * React Flow. Le graphe est charge en differe (ENF-PRF-09).
 */
export default async function StructurePage() {
  const session = await requireSession();
  const arbre = await getArbrePerimetre();

  const typeEntite = session.entiteType as EntityType;
  const libelleType = ENTITY_LABELS[typeEntite]?.singulier ?? session.entiteType;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Perimetre — ${libelleType} ${session.entiteNom}`}
        title="Structure"
        description={
          arbre.length > 1
            ? `${formatNombre(arbre.length)} entites dans votre perimetre, du ${libelleType.toLowerCase()} jusqu'aux cellules de priere.`
            : 'Organigramme de votre perimetre.'
        }
        actions={
          <>
            <Button asChild variant="outline" className="h-10">
              <Link href="/structure/liste">
                <List className="mr-2 size-4" aria-hidden />
                Vue liste
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

      {arbre.length === 0 ? (
        <EmptyState
          icon={Network}
          title="Aucune entite dans votre perimetre"
          description="La structure n'a pas encore ete initialisee."
        />
      ) : arbre.length === 1 ? (
        <EmptyState
          icon={Network}
          title={`${arbre[0]!.nom} est seul dans la hierarchie`}
          description={
            "Creez une premiere entite rattachee pour commencer a batir la structure. " +
            "L'organigramme apparaitra des qu'il y aura une branche a representer."
          }
          action={
            <PermissionGate perm="entity.create">
              <Button asChild className="h-10">
                <Link href="/structure/nouveau">
                  <Plus className="mr-2 size-4" aria-hidden />
                  Creer une entite
                </Link>
              </Button>
            </PermissionGate>
          }
        />
      ) : (
        <EntityFlowLoader
          entites={arbre.map((e) => ({
            id: e.id,
            nom: e.nom,
            code: e.code,
            type: e.type,
            parent_id: e.parent_id,
            // Le chemin sert a evaluer les habilitations par portee (RG-25)
            // et a detecter les cycles lors d'un rattachement (EF-STR-07).
            path: e.path,
            niveau: e.niveau,
            description: e.description,
            nbDescendants: e.nbDescendants,
            nbEnfants: e.nbEnfants,
            // Alimente la fiche en pop-up sans requete supplementaire.
            descendantsParType: e.descendantsParType,
            sans_acces_application: e.sans_acces_application,
            is_active: e.is_active,
            created_at: e.created_at,
            updated_at: e.updated_at,
          }))}
        />
      )}
    </div>
  );
}
