import 'server-only';

import { cache } from 'react';

import type { CelluleOption, OptionReferentiel } from '@/components/croyants/croyant-form';
import { versOptions } from '@/lib/data/entity-options';
import { createClient } from '@/lib/supabase/server';

import { getArbrePerimetre } from './entities';
import { DataError } from './errors';

/**
 * Options des formulaires de croyant.
 *
 * Regroupées ici pour n'être calculées qu'une fois : l'arbre est déjà en
 * cache, et les référentiels changent rarement.
 */
export const getOptionsCroyant = cache(async () => {
  const sb = await createClient();
  const arbre = await getArbrePerimetre();

  const [grades, nationalites] = await Promise.all([
    sb
      .from('grades')
      .select('id, libelle')
      .eq('is_active', true)
      .order('ordre')
      .returns<OptionReferentiel[]>(),
    sb
      .from('nationalites')
      .select('id, libelle')
      .eq('is_active', true)
      .order('libelle')
      .returns<OptionReferentiel[]>(),
  ]);

  if (grades.error) throw new DataError('Les grades sont illisibles.', grades.error);
  if (nationalites.error) {
    throw new DataError('Les nationalités sont illisibles.', nationalites.error);
  }

  const eglises = arbre.filter((e) => e.type === 'EGLISE' && e.is_active);

  // Toutes les cellules du périmètre, avec leur église : le filtrage par
  // église se fait ensuite côté client, sans aller-retour (RG-05).
  const cellules: CelluleOption[] = arbre
    .filter((e) => e.type === 'CELLULE' && e.is_active && e.parent_id)
    .map((e) => ({ id: e.id, nom: e.nom, egliseId: e.parent_id! }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  return {
    eglises: versOptions(eglises, arbre),
    cellules,
    grades: grades.data ?? [],
    nationalites: nationalites.data ?? [],
  };
});
