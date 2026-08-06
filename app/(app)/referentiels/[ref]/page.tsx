import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { ReferentielTable } from '@/components/referentiels/referentiel-table';
import { Button } from '@/components/ui/button';
import { listerReferentiel } from '@/lib/data/referentiels';
import { detient } from '@/lib/domain/permissions';
import { REFERENTIELS, SLUGS_REFERENTIELS, estSlugReferentiel } from '@/lib/domain/referentiels';
import { requireSession } from '@/lib/session';

type Params = { params: Promise<{ ref: string }> };

export function generateStaticParams() {
  return SLUGS_REFERENTIELS.map((ref) => ({ ref }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { ref } = await params;
  return { title: estSlugReferentiel(ref) ? REFERENTIELS[ref].titre : 'Referentiel' };
}

export default async function ReferentielPage({ params }: Params) {
  const { ref } = await params;
  if (!estSlugReferentiel(ref)) notFound();

  const definition = REFERENTIELS[ref];
  const session = await requireSession();
  const lignes = await listerReferentiel(ref);

  // Le controle d'affichage double celui de la Server Action et de la RLS.
  const peutGerer = detient(session, 'referentiel.manage');

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Referentiels"
        title={definition.titre}
        description={definition.description}
        actions={
          <Button asChild variant="outline" className="h-10">
            <Link href="/referentiels">
              <ArrowLeft className="mr-2 size-4" aria-hidden />
              Tous les referentiels
            </Link>
          </Button>
        }
      />

      <ReferentielTable
        definition={definition}
        lignes={lignes}
        peutGerer={peutGerer}
      />
    </div>
  );
}
