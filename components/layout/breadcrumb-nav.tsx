'use client';

import { usePathname } from 'next/navigation';
import { Fragment } from 'react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

import { LIBELLES_SEGMENTS } from './nav-items';

/** Un segment ressemblant a un identifiant n'a pas a etre affiche tel quel. */
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function libelle(segment: string): string {
  if (RE_UUID.test(segment)) return 'Detail';
  return (
    LIBELLES_SEGMENTS[segment] ??
    segment.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())
  );
}

/**
 * Fil d'Ariane — plan.md §9.2.
 *
 * Derive du chemin courant. Les segments d'identifiant sont remplaces par
 * « Detail » : afficher un uuid dans un fil d'Ariane n'aide personne. Le nom
 * reel de la ressource est porte par le titre de la page (PageHeader).
 */
export function BreadcrumbNav() {
  const chemin = usePathname();
  const segments = chemin.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((segment, index) => {
          const dernier = index === segments.length - 1;
          const href = `/${segments.slice(0, index + 1).join('/')}`;

          return (
            <Fragment key={href}>
              <BreadcrumbItem>
                {dernier ? (
                  <BreadcrumbPage className="font-medium">{libelle(segment)}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    href={href}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {libelle(segment)}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!dernier && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
