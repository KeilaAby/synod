import type { Metadata } from 'next';
import { FileClock } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { chargerRapports } from '@/lib/data/rapports';
import { mentionOmissions } from '@/lib/domain/rapport';
import { formatDate, formatDateHeure, formatNombre } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Rapports generes' };

/**
 * EF-RAP-17 — l'historique des rapports produits.
 *
 * MODELE, PERIMETRE, PERIODE, AUTEUR, DATE : les cinq choses qui distinguent
 * deux rapports du meme modele, et sans lesquelles une liste de « Rapport
 * trimestriel » ne se lit pas.
 *
 * PAS DE FICHIER A RETELECHARGER, ET C'EST VOULU. Le contenu est FIGE
 * (RG-27) : rouvrir le rapport rend exactement le document d'origine, et
 * l'imprimer redonne le meme PDF. Stocker un fichier en plus aurait ajoute un
 * second exemplaire a garder synchrone — pour rien, puisque la source ne bouge
 * pas.
 */
export default async function RapportsGeneresPage() {
  const rapports = await chargerRapports();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Rapports"
        title="Rapports generes"
        description={
          rapports.length > 0
            ? `${formatNombre(rapports.length)} rapport${rapports.length > 1 ? 's' : ''} dans votre perimetre.`
            : 'Aucun rapport n’a encore ete produit dans votre perimetre.'
        }
        actions={
          <Button asChild variant="outline" className="h-10">
            <Link href="/rapports">Bibliotheque de modeles</Link>
          </Button>
        }
      />

      {rapports.length === 0 ? (
        <EmptyState
          icon={FileClock}
          title="Aucun rapport généré"
          description="Un rapport se produit depuis un modèle de la bibliothèque : on y choisit une entité et une période, et les données sont figées à cet instant."
          action={
            <Button asChild className="h-10">
              <Link href="/rapports">Ouvrir la bibliothèque</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rapports.map((rapport) => {
            const mention = mentionOmissions(rapport.blocsOmis);

            return (
              <Card key={rapport.id} className="transition-shadow hover:shadow-md">
                <Link href={`/rapports/generes/${rapport.id}`} className="block">
                  <CardContent className="space-y-3 p-6">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                        {rapport.nom}
                      </h3>
                      {rapport.statut === 'PUBLIE' && <Badge>Publié</Badge>}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Période du{' '}
                      <span className="tabular-nums">{formatDate(rapport.periodeDebut)}</span>{' '}
                      au <span className="tabular-nums">{formatDate(rapport.periodeFin)}</span>
                    </p>

                    <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                      Généré le{' '}
                      <span className="tabular-nums">{formatDateHeure(rapport.genereLe)}</span>
                      {rapport.auteur && <> par {rapport.auteur.nomComplet}</>}
                    </p>

                    {/* RG-26 — un rapport plus court sans que rien ne le dise se
                        lit comme un rapport complet. La mention suit le
                        document jusque dans la liste. */}
                    {mention && (
                      <p className="text-xs text-muted-foreground italic">{mention}</p>
                    )}
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
