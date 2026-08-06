import type { Metadata } from 'next';
import { LayoutDashboard } from 'lucide-react';

import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { ENTITY_LABELS, type EntityType } from '@/lib/domain/hierarchy';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Tableau de bord' };

/**
 * EF-DSH-01 / EF-DSH-02 — tableau de bord du perimetre.
 *
 * Le moteur configurable (registre d'indicateurs, grille glisser-deposer,
 * drill-down) est l'objet du LOT 5. Cet ecran en pose la coquille : en-tete
 * contextualise sur le perimetre reel, et etat vide explicite plutot qu'une
 * page blanche ou des chiffres factices.
 */
export default async function TableauDeBordPage() {
  const session = await requireSession();

  const typeEntite = session.entiteType as EntityType;
  const libelleType = ENTITY_LABELS[typeEntite]?.singulier ?? session.entiteType;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Perimetre — ${libelleType} ${session.entiteNom}`}
        title="Tableau de bord"
        description={`Vue consolidee de ${session.entiteNom} et de l'ensemble de ses entites rattachees.`}
      />

      <EmptyState
        icon={LayoutDashboard}
        title="Aucun indicateur configure"
        description={
          "Le moteur de tableau de bord configurable sera livre au lot 5. Vous pourrez y " +
          "choisir vos indicateurs, leur ordre et leur mode de rendu."
        }
      />
    </div>
  );
}
