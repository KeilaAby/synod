import 'server-only';

import { cache } from 'react';

import { REFERENTIELS, type SlugReferentiel } from '@/lib/domain/referentiels';
import { createClient } from '@/lib/supabase/server';

import { DataError } from './errors';

/**
 * Lectures des referentiels — EF-REF-01 a 04.
 *
 * Lisibles par tout compte authentifie (les formulaires en dependent),
 * modifiables par le seul detenteur de `referentiel.manage` : c'est la
 * politique RLS `*_write` qui l'applique.
 */

export type LigneReferentiel = Record<string, unknown> & {
  id: string;
  libelle: string;
  is_active: boolean;
};

export const listerReferentiel = cache(
  async (slug: SlugReferentiel, inclureInactifs = true): Promise<LigneReferentiel[]> => {
    const definition = REFERENTIELS[slug];
    const sb = await createClient();

    let requete = sb.from(definition.table).select('*');
    if (!inclureInactifs) requete = requete.eq('is_active', true);

    const { data, error } = await requete
      .order(definition.triPar)
      .order('libelle')
      .returns<LigneReferentiel[]>();

    if (error) {
      throw new DataError(`Le referentiel « ${definition.titre} » est illisible.`, error);
    }
    return data ?? [];
  },
);

/** Compteurs de la page d'index des referentiels. */
export const compterReferentiels = cache(
  async (): Promise<Record<SlugReferentiel, { total: number; actifs: number }>> => {
    const entrees = await Promise.all(
      (Object.keys(REFERENTIELS) as SlugReferentiel[]).map(async (slug) => {
        const lignes = await listerReferentiel(slug);
        return [
          slug,
          { total: lignes.length, actifs: lignes.filter((l) => l.is_active).length },
        ] as const;
      }),
    );

    return Object.fromEntries(entrees) as Record<
      SlugReferentiel,
      { total: number; actifs: number }
    >;
  },
);
