import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import Link from 'next/link';

import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import { NouveauCroyantDialog } from '@/components/croyants/croyant-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listerCroyants } from '@/lib/data/croyants';
import { getOptionsCroyant } from '@/lib/data/croyant-options';
import { LIBELLES_SEXE, calculerAge, nomComplet } from '@/lib/domain/croyant';
import { TON_CROYANT } from '@/components/shared/status-badge';
import { formatDate, formatNombre } from '@/lib/utils/format';
import { filtresDepuisParams } from '@/lib/validation/croyant';

import { FiltresCroyants } from './filtres';
import { Pagination } from './pagination';

export const metadata: Metadata = { title: 'Croyants' };

/**
 * EF-CRO-04 — liste des croyants.
 *
 * Pagination et filtrage SERVEUR (ENF-PRF-08) : contrairement à la structure,
 * bornée à quelques milliers d'entités, les croyants visent 200 000. Rien
 * n'est jamais chargé intégralement côté client.
 */
export default async function CroyantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const filtres = filtresDepuisParams(params);

  /**
   * PERFORMANCE — deux lectures, pas cinq.
   *
   * Le décompte par sexe coûtait trois requêtes de comptage supplémentaires,
   * rejouées à CHAQUE frappe dans la recherche. Sur une liaison lente, c'était
   * l'essentiel de la latence ressentie. Le total vient désormais du `count`
   * que la requête paginée ramène déjà gratuitement ; la répartition par sexe
   * relève du tableau de bord (lot 5), pas d'un en-tête de liste.
   */
  const [page, options] = await Promise.all([
    listerCroyants(filtres),
    getOptionsCroyant(),
  ]);

  const aDesFiltres = Object.keys(params).some((c) => c !== 'page');

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Croyants"
        title="Croyants"
        description={
          aDesFiltres
            ? `${formatNombre(page.total)} croyant${page.total > 1 ? 's' : ''} correspondant aux filtres.`
            : `${formatNombre(page.total)} croyant${page.total > 1 ? 's' : ''} dans votre périmètre.`
        }
        actions={<NouveauCroyantDialog options={options} />}
      />

      <FiltresCroyants
        eglises={options.eglises}
        grades={options.grades}
        nationalites={options.nationalites}
        total={page.total}
      />

      {page.lignes.length === 0 ? (
        <EmptyState
          icon={Users}
          title={aDesFiltres ? 'Aucun croyant ne correspond' : 'Aucun croyant enregistré'}
          description={
            aDesFiltres
              ? 'Élargissez les filtres, ou vérifiez le périmètre sélectionné.'
              : "Enregistrez le premier croyant de votre périmètre. Le matricule sera attribué automatiquement."
          }
          action={
            !aDesFiltres ? (
              <NouveauCroyantDialog
                options={options}
                libelle="Enregistrer le premier croyant"
              />
            ) : undefined
          }
        />
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              {/* UI-07 : pas de bordures verticales, valeurs en font-mono. */}
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Nom</TableHead>
                    <TableHead>Matricule</TableHead>
                    <TableHead>Sexe</TableHead>
                    <TableHead className="text-right">Âge</TableHead>
                    <TableHead>Église</TableHead>
                    <TableHead>Cellule</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Baptême</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {page.lignes.map((c) => (
                    <TableRow key={c.id} className="h-12">
                      <TableCell>
                        <Link
                          href={`/croyants/${c.id}`}
                          className="flex items-center gap-3 font-medium text-foreground transition-colors hover:text-indigo-700"
                        >
                          {/* EF-CRO-09 — en attendant le téléversement de photo. */}
                          <AvatarCroyant nom={c.nom} prenom={c.prenom} />
                          <span className="truncate">{nomComplet(c.nom, c.prenom)}</span>
                        </Link>
                      </TableCell>

                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {c.matricule}
                      </TableCell>

                      <TableCell className="text-sm">{LIBELLES_SEXE[c.sexe]}</TableCell>

                      <TableCell className="text-right font-mono tabular-nums">
                        {calculerAge(new Date(c.date_naissance))}
                      </TableCell>

                      <TableCell className="max-w-40 truncate text-sm">
                        {c.eglise?.nom ?? '—'}
                      </TableCell>

                      <TableCell className="max-w-32 truncate text-sm text-muted-foreground">
                        {c.cellule?.nom ?? '—'}
                      </TableCell>

                      <TableCell className="text-sm">{c.grade?.libelle ?? '—'}</TableCell>

                      <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatDate(c.date_bapteme)}
                      </TableCell>

                      <TableCell>
                        <StatusBadge tone={TON_CROYANT[c.statut] ?? 'neutral'}>
                          {c.statut.charAt(0) + c.statut.slice(1).toLowerCase()}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Pagination page={page.page} nbPages={page.nbPages} total={page.total} />
        </>
      )}
    </div>
  );
}
