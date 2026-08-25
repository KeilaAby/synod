import 'server-only';

import { cache } from 'react';

import { PLAFOND_MOUVEMENTS, type SensFinance, type Solde, type StatutMouvement } from '@/lib/domain/finance';
import { createClient } from '@/lib/supabase/server';

import { getArbrePerimetre } from './entities';
import { DataError } from './errors';
import { getParametres } from './settings';

/**
 * Lectures des finances — EF-FIN-01, EF-FIN-09 a 13.
 *
 * LE SOLDE SE CALCULE EN BASE, pas ici. Ramener les mouvements pour les
 * additionner dans le navigateur transporterait des dizaines de milliers de
 * lignes pour en tirer trois nombres — et il faudrait les retransporter a
 * chaque changement de periode.
 *
 * La LISTE, elle, se charge integralement dans le perimetre et se filtre en
 * memoire (regle 17) : ce qui coute n'est pas la duree d'un aller-retour mais
 * leur nombre, et un filtre qui interroge le serveur a chaque frappe en fait
 * un par caractere.
 */

/**
 * Chaque embed NOMME sa cle etrangere.
 *
 * `finance_entries` pointe QUATRE FOIS vers `profiles` — saisi, soumis, valide
 * — et DEUX FOIS vers `entities` : l'entite du mouvement et celle depuis
 * laquelle il a ete saisi. PostgREST refuserait l'embed ambigu avec `PGRST201`,
 * et l'erreur ne se voit qu'a l'execution.
 */
const CHAMPS_LISTE = `
  id, entity_id, categorie_id, sens, montant, date_operation, periode,
  libelle, reference, justificatif_key, statut,
  soumis_par, soumis_le, valide_par, valide_le, motif_rejet, motif_annulation,
  annule_par, annule_le,
  est_delegue, saisi_par, created_at,
  entite:entities!finance_entries_entity_id_fkey (id, nom, code, type, path),
  categorie:finance_categories!finance_entries_categorie_id_fkey (id, libelle, sens),
  auteur:profiles!finance_entries_saisi_par_fkey (
    id, nom_complet, role,
    entite:entities!profiles_entity_id_fkey (id, nom, type)
  ),
  validateur:profiles!finance_entries_valide_par_fkey (
    id, nom_complet, role,
    entite:entities!profiles_entity_id_fkey (id, nom, type)
  ),
  annulateur:profiles!finance_entries_annule_par_fkey (
    id, nom_complet, role,
    entite:entities!profiles_entity_id_fkey (id, nom, type)
  )
` as const;

export interface MouvementListe {
  id: string;
  entity_id: string;
  categorie_id: string;
  sens: SensFinance;
  montant: number;
  date_operation: string;
  periode: string;
  libelle: string | null;
  reference: string | null;
  justificatif_key: string | null;
  statut: StatutMouvement;
  soumis_par: string | null;
  soumis_le: string | null;
  valide_par: string | null;
  valide_le: string | null;
  motif_rejet: string | null;
  motif_annulation: string | null;
  annule_par?: string | null;
  annule_le?: string | null;
  est_delegue: boolean;
  saisi_par: string | null;
  created_at: string;
  entite: { id: string; nom: string; code: string; type: string; path: string } | null;
  categorie: { id: string; libelle: string; sens: SensFinance } | null;
  auteur: {
    id: string;
    nom_complet: string;
    role?: string;
    entite?: { id: string; nom: string; type: string } | null;
  } | null;
  validateur: {
    id: string;
    nom_complet: string;
    role?: string;
    entite?: { id: string; nom: string; type: string } | null;
  } | null;
  annulateur?: {
    id: string;
    nom_complet: string;
    role?: string;
    entite?: { id: string; nom: string; type: string } | null;
  } | null;
}


export const chargerMouvements = cache(async (): Promise<MouvementListe[]> => {
  const sb = await createClient();

  const { data, error } = await sb
    .from('finance_entries')
    .select(CHAMPS_LISTE)
    .is('deleted_at', null)
    .order('date_operation', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(PLAFOND_MOUVEMENTS)
    .returns<MouvementListe[]>();

  if (error) throw new DataError('Les mouvements financiers sont illisibles.', error);
  return data ?? [];
});

/**
 * La FILE de validation — EF-FIN-21.
 *
 * Requete distincte de `chargerMouvements`, et non un filtre sur celle-ci : le
 * registre s'arrete au plafond de chargement, en commencant par les mouvements
 * les plus RECENTS. Une file batie dessus perdrait donc les plus anciens — ceux
 * qui attendent depuis le plus longtemps, c'est-a-dire exactement ceux qu'il
 * faut traiter.
 *
 * Ordre INVERSE de celui du registre : le plus ancien en tete. Une file se
 * traite par le bas de la pile.
 */
export const chargerFileValidation = cache(async (): Promise<MouvementListe[]> => {
  const sb = await createClient();

  const { data, error } = await sb
    .from('finance_entries')
    .select(CHAMPS_LISTE)
    .eq('statut', 'SOUMIS')
    .is('deleted_at', null)
    .order('soumis_le', { ascending: true, nullsFirst: true })
    .order('date_operation', { ascending: true })
    .limit(PLAFOND_MOUVEMENTS)
    .returns<MouvementListe[]>();

  if (error) throw new DataError('La file de validation est illisible.', error);
  return data ?? [];
});

/**
 * UI-21 — combien de mouvements attendent une validation.
 *
 * `head: true` : on demande le COMPTE, pas les lignes. Ramener trois mille
 * mouvements pour en afficher le nombre sur un badge de menu serait le plus
 * cher des affichages de l'application.
 *
 * La RLS borne deja au perimetre ; le droit de valider, lui, est verifie par
 * l'appelant. Un badge annoncant trois demandes pour une file qui en montre
 * zero ferait douter de l'application entiere.
 */
export async function compterMouvementsAValider(): Promise<number> {
  const sb = await createClient();

  const { count, error } = await sb
    .from('finance_entries')
    .select('id', { count: 'exact', head: true })
    .eq('statut', 'SOUMIS')
    .is('deleted_at', null);

  // Un compteur illisible n'affiche RIEN plutot qu'un zero : zero se lit
  // « rien a faire », et ce n'est pas ce qu'on sait.
  return error ? 0 : (count ?? 0);
}

/** Un mouvement precis — pour le lien profond et la revalidation d'une action. */
export async function chargerMouvement(id: string): Promise<MouvementListe | null> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('finance_entries')
    .select(CHAMPS_LISTE)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle<MouvementListe>();

  if (error) throw new DataError('Ce mouvement est illisible.', error);
  return data;
}

/**
 * EF-FIN-09/12 — le solde d'une entite et de son sous-arbre.
 *
 * UNE requete, quel que soit le volume : la fonction `fn_finance_solde` fait la
 * somme en base et ne rend que quatre nombres.
 */
export async function chargerSolde(
  entiteId: string,
  debut?: string | null,
  fin?: string | null,
): Promise<Solde> {
  const sb = await createClient();

  /**
   * Le type de la reponse est POSE ICI.
   *
   * Les types generes ne connaissent pas les fonctions ajoutees depuis leur
   * derniere generation : `.returns<T[]>()` entre alors en conflit avec la
   * signature deduite au lieu de la completer.
   */
  const { data, error } = await sb.rpc('fn_finance_solde', {
    p_entity: entiteId,
    p_debut: debut ?? null,
    p_fin: fin ?? null,
  });

  const lignes = data as
    | {
        recettes_propres: number;
        depenses_propres: number;
        recettes_consolidees: number;
        depenses_consolidees: number;
      }[]
    | null;

  if (error) throw new DataError('Le solde est momentanement incalculable.', error);

  const ligne = lignes?.[0];

  /**
   * Une entite sans aucun mouvement rend un solde a zero, pas une erreur.
   *
   * `numeric` traverse PostgREST en CHAINE — sans quoi il perdrait de la
   * precision en JSON. `Number()` est donc indispensable : sans lui,
   * « 1000 » + « 200 » aurait fait « 1000200 » (regle 15 pour l'idee generale).
   */
  return {
    recettesPropres: Number(ligne?.recettes_propres ?? 0),
    depensesPropres: Number(ligne?.depenses_propres ?? 0),
    recettesConsolidees: Number(ligne?.recettes_consolidees ?? 0),
    depensesConsolidees: Number(ligne?.depenses_consolidees ?? 0),
  };
}

/**
 * EF-FIN-11 — le solde de CHAQUE entite du perimetre, en une passe.
 *
 * UN SEUL APPEL, quel que soit le nombre d'entites. Boucler sur `chargerSolde`
 * couterait un aller-retour par ligne du tableau : cinquante eglises, plusieurs
 * minutes (regle 28).
 *
 * La RLS borne le resultat — la fonction est `SECURITY INVOKER` — : cet ecran
 * n'a aucun filtrage a refaire, et ne peut donc pas se tromper en le refaisant.
 */
export async function chargerSoldesPerimetre(
  debut?: string | null,
  fin?: string | null,
): Promise<Map<string, Solde>> {
  const sb = await createClient();

  const { data, error } = await sb.rpc('fn_finance_soldes_perimetre', {
    p_debut: debut ?? null,
    p_fin: fin ?? null,
  });

  if (error) {
    throw new DataError('Les soldes du perimetre sont momentanement incalculables.', error);
  }

  const lignes = data as
    | {
        entity_id: string;
        recettes_propres: number;
        depenses_propres: number;
        recettes_consolidees: number;
        depenses_consolidees: number;
      }[]
    | null;

  return new Map(
    (lignes ?? []).map((l) => [
      l.entity_id,
      {
        // `numeric` traverse PostgREST en CHAINE, pour ne pas perdre de
        // precision en JSON : sans `Number()`, « 1000 » + « 200 » ferait
        // « 1000200 ».
        recettesPropres: Number(l.recettes_propres ?? 0),
        depensesPropres: Number(l.depenses_propres ?? 0),
        recettesConsolidees: Number(l.recettes_consolidees ?? 0),
        depensesConsolidees: Number(l.depenses_consolidees ?? 0),
      },
    ]),
  );
}

export interface CategorieFinance {
  id: string;
  code: string;
  libelle: string;
  sens: SensFinance;
}

/**
 * EF-REF-04, RG-13 — les categories, UNIFORMES pour toute l'organisation
 * (decide le 12 aout 2026).
 *
 * Elles portent le sens : c'est ce qui permet de ne jamais demander « recette
 * ou depense ? » a la saisie, et d'empecher une depense rangee dans une
 * categorie de recette.
 */
export const listerCategoriesFinance = cache(async (): Promise<CategorieFinance[]> => {
  const sb = await createClient();

  const { data, error } = await sb
    .from('finance_categories')
    .select('id, code, libelle, sens')
    .eq('is_active', true)
    .order('sens')
    .order('ordre')
    .order('libelle')
    .returns<CategorieFinance[]>();

  if (error) throw new DataError('Les categories financieres sont illisibles.', error);
  return data ?? [];
});

/**
 * EF-FIN-15 (adapte) — le workflow, entite par entite.
 *
 * On rend la valeur DECIDEE (`null` = defaut de l'organisation) ET la valeur
 * EFFECTIVE, parce que l'ecran doit montrer les deux : « par defaut (actif) »
 * n'est pas la meme information que « actif ici ».
 *
 * Aucun heritage depuis le parent : chaque bureau gere ses finances, la
 * hierarchie ne fait que les consulter (decide le 12 aout 2026).
 */
export interface ReglageWorkflow {
  entiteId: string;
  /** `null` : rien n'est decide ici, on prend le defaut de l'organisation. */
  decide: boolean | null;
  effectif: boolean;
}

/**
 * Le reglage de TOUT LE PERIMETRE, en une fois.
 *
 * AUCUN APPEL A `fn_finance_workflow_actif` ICI, et c'est voulu. Depuis que
 * l'heritage a disparu, l'effectif se deduit : c'est la valeur decidee, ou le
 * defaut de l'organisation. Interroger la base pour chaque entite aurait coute
 * un aller-retour par ligne — cinquante eglises, cinquante requetes (regle 28)
 * — pour recalculer un `??`.
 *
 * La fonction SQL reste la reference : c'est ELLE que le trigger consulte au
 * moment d'ecrire. Celle-ci ne sert qu'a l'affichage, et les deux ne peuvent
 * diverger que si la regle change en base sans changer ici — d'ou le test qui
 * les compare.
 */
export async function chargerReglagesWorkflow(): Promise<{
  reglages: ReglageWorkflow[];
  defautOrganisation: boolean;
}> {
  const [arbre, parametres] = await Promise.all([getArbrePerimetre(), getParametres()]);

  const defaut = parametres.finance_validation_active;

  return {
    defautOrganisation: defaut,
    reglages: arbre.map((entite) => ({
      entiteId: entite.id,
      decide: entite.finance_validation_active ?? null,
      effectif: entite.finance_validation_active ?? defaut,
    })),
  };
}

// ---------------------------------------------------------------------------
// EF-FIN-24 — la synthese periodique
// ---------------------------------------------------------------------------

/** Une categorie, un mois, dans les deux portees. */
export interface LigneSynthese {
  mois: string;
  categorieId: string;
  libelle: string;
  sens: SensFinance;
  montantPropre: number;
  montantConsolide: number;
  nombrePropre: number;
  nombreConsolide: number;
}

/** Les montants consolides d'une soeur, un mois donne. */
export interface LigneSoeur {
  mois: string;
  entityId: string;
  recettes: number;
  depenses: number;
}

export interface SyntheseAnnuelle {
  categories: LigneSynthese[];
  soeurs: LigneSoeur[];
}

/**
 * EF-FIN-24 — une ANNEE de synthese, mois par mois.
 *
 * ELLE CHARGE L'ANNEE, PAS LA PERIODE DEMANDEE. Passer d'aout a juillet, ou du
 * trimestre a l'annee, devient alors une somme faite dans le navigateur —
 * instantanee — au lieu d'un aller-retour de 0,5 a 4 s (regles 17 et 28). Celui
 * qui ouvre une synthese COMPARE : il ne consulte pas une periode, il en
 * parcourt plusieurs.
 *
 * Les deux portees, propre et consolidee, viennent du MEME passage : deux
 * appels separes pourraient tomber de part et d'autre d'une validation et se
 * contredire.
 *
 * DEUX APPELS LANCES DE FRONT, donc une attente. L'evolution du solde n'en
 * demande pas de troisieme : c'est la somme des categories par mois.
 *
 * Les deux fonctions sont `SECURITY INVOKER` : la RLS borne le resultat, cet
 * ecran n'a aucun filtrage a refaire.
 */
export async function chargerSyntheseAnnuelle(
  entityId: string,
  annee: number,
): Promise<SyntheseAnnuelle> {
  const sb = await createClient();

  const [categories, soeurs] = await Promise.all([
    sb.rpc('fn_finance_synthese_categories', { p_entity: entityId, p_annee: annee }),
    sb.rpc('fn_finance_synthese_soeurs', { p_entity: entityId, p_annee: annee }),
  ]);

  if (categories.error) {
    throw new DataError('La synthese est momentanement incalculable.', categories.error);
  }

  /**
   * `numeric` traverse PostgREST en CHAINE, pour ne pas perdre de precision en
   * JSON : sans `Number()`, « 1000 » + « 200 » ferait « 1000200 ».
   */
  return {
    categories: (
      (categories.data ?? []) as {
        mois: string;
        categorie_id: string;
        libelle: string;
        sens: SensFinance;
        montant_propre: number;
        montant_consolide: number;
        nombre_propre: number;
        nombre_consolide: number;
      }[]
    ).map((l) => ({
      mois: l.mois,
      categorieId: l.categorie_id,
      libelle: l.libelle,
      sens: l.sens,
      montantPropre: Number(l.montant_propre ?? 0),
      montantConsolide: Number(l.montant_consolide ?? 0),
      nombrePropre: Number(l.nombre_propre ?? 0),
      nombreConsolide: Number(l.nombre_consolide ?? 0),
    })),

    /**
     * Une comparaison illisible ne vide pas l'ecran : le tableau des soeurs
     * disparait, la synthese de l'entite reste. C'est la lecture principale.
     */
    soeurs: soeurs.error
      ? []
      : (
          (soeurs.data ?? []) as {
            mois: string;
            entity_id: string;
            recettes: number;
            depenses: number;
          }[]
        ).map((s) => ({
          mois: s.mois,
          entityId: s.entity_id,
          recettes: Number(s.recettes ?? 0),
          depenses: Number(s.depenses ?? 0),
        })),
  };
}

// ---------------------------------------------------------------------------
// EF-FIN-26 — les periodes cloturees
// ---------------------------------------------------------------------------

export interface PeriodeClose {
  entityId: string;
  /** Premier jour du mois, « AAAA-MM-JJ ». */
  periode: string;
  clotureLe: string;
  clotureParNom: string | null;
}

/**
 * Les periodes CLOSES du perimetre — EF-FIN-26.
 *
 * Seules les clotures VIVANTES sont chargees : une periode rouverte n'est plus
 * close, et sa ligne ne sert plus qu'a l'historique. La RLS borne la lecture au
 * perimetre.
 *
 * Une lecture illisible ne vide pas l'ecran : la liste est vide, et le verrou
 * reste tenu PAR LA BASE de toute facon — l'ecran ne fait que l'annoncer.
 */
export async function chargerPeriodesCloses(): Promise<PeriodeClose[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('finance_periodes_cloturees')
    .select(
      'entity_id, periode, cloture_le, ' +
        'auteur:profiles!finance_periodes_cloturees_cloture_par_fkey (nom_complet)',
    )
    .is('rouverte_le', null)
    .order('periode', { ascending: false })
    .limit(2000)
    .returns<
      {
        entity_id: string;
        periode: string;
        cloture_le: string;
        auteur: { nom_complet: string } | null;
      }[]
    >();

  if (error) return [];

  return (data ?? []).map((c) => ({
    entityId: c.entity_id,
    periode: c.periode,
    clotureLe: c.cloture_le,
    clotureParNom: c.auteur?.nom_complet ?? null,
  }));
}
