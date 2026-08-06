import 'server-only';

import { cache } from 'react';

import type { CelluleOption, OptionReferentiel } from '@/components/croyants/croyant-form';
import { versOptions } from '@/lib/data/entity-options';
import { createClient } from '@/lib/supabase/server';

import { getArbrePerimetre } from './entities';
import { DataError } from './errors';

type ClientSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Les référentiels changent rarement — quelques fois par an — et sont relus à
 * CHAQUE affichage de liste ou de formulaire. Sur une liaison lente, ces deux
 * allers-retours pèsent plus que la requête métier elle-même.
 *
 * Ils ne sont volontairement PAS mis en cache global : ils passent par la RLS,
 * et un cache partagé entre comptes servirait à l'un ce que l'autre seul a le
 * droit de voir. Le gain vient d'ailleurs — ces deux lectures partent en
 * parallèle, et la liste ne les redemande plus à chaque frappe.
 */
async function lireGrades(sb: ClientSupabase): Promise<OptionReferentiel[]> {
  const { data, error } = await sb
    .from('grades')
    .select('id, libelle')
    .eq('is_active', true)
    .order('ordre')
    .returns<OptionReferentiel[]>();

  if (error) throw new DataError('Les grades sont illisibles.', error);
  return data ?? [];
}

async function lireNationalites(sb: ClientSupabase): Promise<OptionReferentiel[]> {
  const { data, error } = await sb
    .from('nationalites')
    .select('id, libelle')
    .eq('is_active', true)
    .order('libelle')
    .returns<OptionReferentiel[]>();

  if (error) throw new DataError('Les nationalités sont illisibles.', error);
  return data ?? [];
}

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
    lireGrades(sb),
    lireNationalites(sb),
  ]);

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
    grades,
    nationalites,
  };
});
