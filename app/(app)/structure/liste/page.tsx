import type { Metadata } from 'next';
import { Network, Plus, WifiOff } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { PermissionGate } from '@/components/shared/permission-gate';
import { StatusBadge } from '@/components/shared/status-badge';
import { TypeBadge } from '@/components/structure/type-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getArbrePerimetre, cheminLisible, listerEntites } from '@/lib/data/entities';
import { filtresEntiteSchema } from '@/lib/validation/entity';
import { formatNombre } from '@/lib/utils/format';

import { FiltresStructure } from './filtres';

export const metadata: Metadata = { title: 'Liste des entites' };

/**
 * EF-STR-09 — liste filtrable des entites.
 *
 * Filtres portes par l'URL : la vue est partageable et restauree au retour
 * arriere. Le filtrage s'execute cote serveur (ENF-PRF-08) ; aucun tableau
 * complet n'est envoye au navigateur pour etre trie ensuite.
 */
export default async function ListeStructurePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const filtres = filtresEntiteSchema.parse({
    recherche: params.q,
    type: params.type,
    actif: params.actif ?? 'tous',
  });

  const [entites, arbre] = await Promise.all([listerEntites(filtres), getArbrePerimetre()]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Structure"
        title="Liste des entites"
        description={`${formatNombre(entites.length)} entite${entites.length > 1 ? 's' : ''} correspondant aux filtres.`}
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

      <FiltresStructure />

      {entites.length === 0 ? (
        <EmptyState
          icon={Network}
          title="Aucune entite ne correspond"
          description="Elargissez les filtres, ou creez la premiere entite de ce niveau."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* UI-07 : DataTable sans bordures verticales, valeurs en font-mono. */}
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nom</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Niveau</TableHead>
                  <TableHead>Rattachement</TableHead>
                  <TableHead className="text-right">Sous-entites</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {entites.map((entite) => (
                  <TableRow key={entite.id} className="h-12">
                    <TableCell>
                      <Link
                        href={`/structure/${entite.id}`}
                        className="font-medium text-foreground transition-colors hover:text-indigo-700"
                      >
                        {entite.nom}
                      </Link>
                    </TableCell>

                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {entite.code}
                    </TableCell>

                    <TableCell>
                      <TypeBadge type={entite.type} />
                    </TableCell>

                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {cheminLisible(entite, arbre).split(' › ').slice(0, -1).join(' › ') ||
                        '—'}
                    </TableCell>

                    <TableCell className="text-right font-mono tabular-nums">
                      {formatNombre(entite.nbDescendants)}
                    </TableCell>

                    <TableCell>
                      <span className="flex items-center gap-2">
                        <StatusBadge tone={entite.is_active ? 'success' : 'neutral'}>
                          {entite.is_active ? 'Active' : 'Inactive'}
                        </StatusBadge>
                        {entite.sans_acces_application && (
                          <span title="Sans acces a l'application — saisie assuree par le Siege">
                            <WifiOff className="size-4 text-slate-400" aria-hidden />
                          </span>
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
