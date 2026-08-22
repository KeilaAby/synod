import 'server-only';

import { cache } from 'react';

import type { CelluleOption, OptionReferentiel } from '@/components/croyants/croyant-form';
import { versOptions } from '@/lib/data/entity-options';
import { createClient } from '@/lib/supabase/server';

import { listerCroyantsPourConjoint } from './croyants';
import { getArbrePerimetre } from './entities';
import { DataError } from './errors';
import { getParametres } from './settings';

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

  const [grades, nationalites, parametres, conjointsPotentiels] = await Promise.all([
    lireGrades(sb),
    lireNationalites(sb),
    // EF-CRO-12 — délai de correction, réglé dans « Corrections de saisie »
    // (migration 0069). Un simple hint pour le pop-up de changement de
    // grade : le serveur retranche `getParametres()` au moment d'écrire.
    getParametres(),
    // EF-CRO-14 — le vivier du sélecteur de conjoint (migration 0071),
    // filtré par sexe et disponibilité EN MÉMOIRE (règle 17) : aucun
    // aller-retour au changement de statut marital.
    listerCroyantsPourConjoint(),
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
    joursDelai: parametres.jours_correction_saisie,
    conjointsPotentiels,
  };
});

/**
 * Le RANG de chaque grade — EF-CRO-12.
 *
 * `ordre` est presente a l'ecran comme « ordre d'affichage », mais on range les
 * grades comme on les nomme : Pasteur, Diacre, Evangeliste, Croyant. Cet ordre
 * EST donc la hierarchie — un `ordre` plus petit designe un grade plus eleve.
 * La lecture de ce champ est expliquee une seule fois, dans
 * `lib/domain/promotion.ts` ; ici on ne fait que le rapporter.
 *
 * Une `Map` plutot qu'une liste : l'appelant cherche DEUX rangs precis — celui
 * qu'on quitte et celui qu'on vise —, jamais l'ensemble.
 *
 * LES GRADES INACTIFS EN FONT PARTIE, et c'est voulu : la fiche d'un croyant
 * peut porter un grade retire du referentiel depuis. L'omettre rendrait son
 * rang inconnu, donc toute descente indetectable — exactement le cas ou le
 * motif compte le plus.
 */
export async function listerGradesOrdonnes(): Promise<Map<string, number>> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('grades')
    .select('id, ordre')
    .returns<{ id: string; ordre: number }[]>();

  // Une lecture manquee ne doit pas bloquer l'enregistrement d'une fiche : sans
  // rang connu, aucune descente n'est detectee et rien n'est exige (regle 15).
  if (error) return new Map();
  return new Map((data ?? []).map((g) => [g.id, g.ordre]));
}
