import type { Metadata } from 'next';
import { Network } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { EntityForm } from '@/components/structure/entity-form';
import { Button } from '@/components/ui/button';
import { getContexteStructure } from '@/lib/data/entity-options';

export const metadata: Metadata = { title: 'Nouvelle entite' };

/**
 * EF-STR-01 — creation d'une entite.
 *
 * `typesCreables` ne propose que les niveaux dont un parent existe reellement
 * dans le perimetre (RG-01) : la contrainte hierarchique est portee par le
 * formulaire, pas par un message d'erreur a posteriori.
 */
export default async function NouvelleEntitePage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string }>;
}) {
  const { parent } = await searchParams;
  const { options, typesCreables } = await getContexteStructure();

  if (typesCreables.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Structure" title="Nouvelle entite" />
        <EmptyState
          icon={Network}
          title="Aucune entite creable"
          description={
            "Aucun niveau de votre perimetre ne peut accueillir de sous-entite. " +
            "Verifiez que la structure a bien ete initialisee."
          }
          action={
            <Button asChild variant="outline" className="h-10">
              <Link href="/structure">Retour a la structure</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Structure"
        title="Nouvelle entite"
        description="Choisissez d'abord le niveau : seuls les parents valides vous seront proposes."
      />

      <EntityForm
        mode="creation"
        parents={options}
        typesDisponibles={typesCreables}
        parentImpose={parent}
      />
    </div>
  );
}
