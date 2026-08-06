import type { Metadata } from 'next';
import { Church } from 'lucide-react';
import Link from 'next/link';

import { CroyantForm } from '@/components/croyants/croyant-form';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { getOptionsCroyant } from '@/lib/data/croyant-options';

export const metadata: Metadata = { title: 'Nouveau croyant' };

/**
 * EF-CRO-01 — enregistrement d'un croyant.
 *
 * Sans église dans le périmètre, la page ne propose pas un formulaire
 * inutilisable : elle renvoie vers la création de la structure. RG-04 rend le
 * rattachement obligatoire, donc l'église est un prérequis, pas un champ.
 */
export default async function NouveauCroyantPage({
  searchParams,
}: {
  searchParams: Promise<{ eglise?: string }>;
}) {
  const { eglise } = await searchParams;
  const options = await getOptionsCroyant();

  if (options.eglises.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Croyants" title="Nouveau croyant" />
        <EmptyState
          icon={Church}
          title="Aucune église dans votre périmètre"
          description="Tout croyant est rattaché à une église (RG-04). Créez d'abord une église dans la structure."
          action={
            <Button asChild className="h-10">
              <Link href="/structure">Aller à la structure</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Croyants"
        title="Nouveau croyant"
        description="Le matricule est attribué automatiquement à l'enregistrement."
      />

      <CroyantForm
        mode="creation"
        egliseImposee={eglise}
        eglises={options.eglises}
        cellules={options.cellules}
        grades={options.grades}
        nationalites={options.nationalites}
      />
    </div>
  );
}
