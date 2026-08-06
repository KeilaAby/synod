import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { compterReferentiels } from '@/lib/data/referentiels';
import { REFERENTIELS, SLUGS_REFERENTIELS } from '@/lib/domain/referentiels';
import { formatNombre } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Referentiels' };

/**
 * EF-REF-01 a 06 — index des referentiels.
 *
 * `referentiel.manage` n'est pas delegable : ces tables sont partagees par
 * toute l'organisation. Une entite ne peut pas les modifier pour les autres.
 */
export default async function ReferentielsPage() {
  const compteurs = await compterReferentiels();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Referentiels"
        description="Valeurs partagees par toute l'organisation. Une valeur utilisee ne se supprime pas : elle se desactive et reste lisible dans l'historique."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {SLUGS_REFERENTIELS.map((slug) => {
          const definition = REFERENTIELS[slug];
          const compteur = compteurs[slug];

          return (
            <Link key={slug} href={`/referentiels/${slug}`} className="group">
              <Card className="h-full transition-colors group-hover:border-slate-300">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h2 className="text-sm font-semibold text-foreground">
                        {definition.titre}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {definition.description}
                      </p>
                    </div>
                    <ArrowRight
                      className="size-4 shrink-0 text-slate-400 transition-colors group-hover:text-foreground"
                      aria-hidden
                    />
                  </div>

                  <p className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatNombre(compteur.actifs)} active
                    {compteur.actifs > 1 ? 's' : ''}
                    {compteur.total !== compteur.actifs &&
                      ` · ${formatNombre(compteur.total - compteur.actifs)} desactivee${compteur.total - compteur.actifs > 1 ? 's' : ''}`}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
