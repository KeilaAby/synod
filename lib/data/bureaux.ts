import 'server-only';

import type { FonctionBureau } from '@/lib/domain/bureau';
import type { EntityType } from '@/lib/domain/hierarchy';
import type { DispositionPoste } from '@/lib/domain/organigramme-bureau';
import { createClient } from '@/lib/supabase/server';

import { DataError } from './errors';

/**
 * Lectures des bureaux — EF-BUR-01 a 10.
 *
 * La RLS fait le tri par perimetre : aucun filtre n'est reecrit ici, il le
 * serait en double et divergerait.
 */

const CHAMPS_MANDAT = `
  id, entity_id, libelle, date_debut, date_fin, is_active, created_at,
  entite:entities!bureaux_entity_id_fkey (id, nom, code, type, path),
  membres:bureau_membres!bureau_membres_bureau_id_fkey (
    id, croyant_id, fonction_id, date_debut, date_fin, notes, motif_retrait, created_at,
    croyant:croyants!bureau_membres_croyant_id_fkey (
      id, nom, prenom, matricule, photo_key, statut,
      grade:grades!croyants_grade_id_fkey (id, libelle)
    ),
    fonction:fonctions!bureau_membres_fonction_id_fkey (
      id, code, libelle, est_financiere
    )
  ),
  postes:bureau_postes!bureau_postes_bureau_id_fkey (
    fonction_id, parent_fonction_id, pos_x, pos_y
  )
` as const;

export interface MembreBureau {
  id: string;
  croyant_id: string;
  fonction_id: string;
  date_debut: string;
  date_fin: string | null;
  notes: string | null;
  /** EF-BUR-08 — pourquoi ce mandat a ete INTERROMPU, s'il l'a ete (`0066`). */
  motif_retrait: string | null;
  /**
   * Quand la designation a ete ENREGISTREE — c'est elle, et non `date_debut`,
   * qui ouvre la fenetre de quinze jours du retrait pour erreur (EF-BUR-08).
   * Un bureau peut etre saisi en retard, avec un debut anterieur de six mois.
   */
  created_at: string;
  croyant: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    photo_key: string | null;
    statut: string;
    /** EF-BUR-04 — la liste des membres affiche le grade a cote de la fonction. */
    grade: { id: string; libelle: string } | null;
  } | null;
  fonction: {
    id: string;
    code: string;
    libelle: string;
    est_financiere: boolean;
  } | null;
}

export interface BureauComplet {
  id: string;
  entity_id: string;
  libelle: string;
  date_debut: string;
  date_fin: string | null;
  is_active: boolean;
  created_at: string;
  entite: { id: string; nom: string; code: string; type: EntityType; path: string } | null;
  membres: MembreBureau[];
  /**
   * EF-BUR-07 — plan dessine dans l'editeur. Vide tant qu'aucun n'a ete
   * dessine : les blocs sont alors poses en grille, sans trait.
   */
  postes: {
    fonction_id: string;
    parent_fonction_id: string | null;
    pos_x: number;
    pos_y: number;
  }[];
}

/** Tous les bureaux du perimetre, mandats clos compris (EF-BUR-08). */
export async function chargerBureaux(): Promise<BureauComplet[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('bureaux')
    .select(CHAMPS_MANDAT)
    .is('deleted_at', null)
    .order('date_debut', { ascending: false })
    .returns<BureauComplet[]>();

  if (error) {
    throw new DataError('Les bureaux sont momentanement illisibles.', error);
  }
  return data ?? [];
}

/** Un bureau precis, avec sa composition — EF-BUR-07. */
export async function chargerBureau(bureauId: string): Promise<BureauComplet | null> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('bureaux')
    .select(CHAMPS_MANDAT)
    .eq('id', bureauId)
    .is('deleted_at', null)
    .maybeSingle<BureauComplet>();

  if (error) throw new DataError('Ce bureau est momentanement illisible.', error);
  return data;
}

/**
 * EF-BUR-07 — disposition enregistree de l'organigramme.
 *
 * Depuis la palette du 9 aout, elle ENUMERE les blocs du plan : une fonction
 * applicable sans ligne ici n'est pas dessinee — elle attend dans la palette.
 * Elle reste en revanche un poste du bureau pour la composition tabulaire.
 */
export async function chargerDisposition(bureauId: string): Promise<DispositionPoste[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('bureau_postes')
    .select('fonction_id, parent_fonction_id, pos_x, pos_y, en_derivation')
    .eq('bureau_id', bureauId)
    .returns<
      {
        fonction_id: string;
        parent_fonction_id: string | null;
        pos_x: number;
        pos_y: number;
        en_derivation: boolean;
      }[]
    >();

  // Une disposition illisible n'empeche pas de composer : l'ecran pose les
  // blocs en grille, ce qui reste vrai — il n'affirme simplement aucun lien.
  if (error) return [];

  return (data ?? []).map((p) => ({
    fonctionId: p.fonction_id,
    parentFonctionId: p.parent_fonction_id,
    x: p.pos_x,
    y: p.pos_y,
    enDerivation: p.en_derivation,
  }));
}

/** Les bureaux d'UNE entite, mandats clos compris (EF-BUR-08). */
export async function chargerBureauxDeEntite(entityId: string): Promise<BureauComplet[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('bureaux')
    .select(CHAMPS_MANDAT)
    .eq('entity_id', entityId)
    .is('deleted_at', null)
    .order('is_active', { ascending: false })
    .order('date_debut', { ascending: false })
    .returns<BureauComplet[]>();

  if (error) {
    throw new DataError('Les bureaux de cette entite sont momentanement illisibles.', error);
  }
  return data ?? [];
}

/**
 * Apercu des bureaux ACTIFS, par entite — EF-BUR-01, EF-STR-04.
 *
 * Il alimente le menu de chaque entite dans la structure, qui doit savoir s'il
 * y a un bureau, et s'il a des membres, pour choisir entre « Composer un
 * bureau » et « Membres du bureau ».
 *
 * Volontairement MAIGRE : un identifiant, un libelle, un compte. La
 * composition complete — candidats eligibles et photos signees — se charge a
 * l'ouverture du pop-up. La faire porter a chaque affichage de l'organigramme
 * ferait payer a tous les visiteurs ce dont un seul se sert.
 */
export interface ApercuBureau {
  id: string;
  libelle: string;
  /** Mandats EN COURS, les mandats clos ne comptant pas comme composition. */
  nbMembres: number;
}

export type ApercuBureaux = Record<string, ApercuBureau[]>;

export async function apercuBureauxParEntite(): Promise<ApercuBureaux> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('bureaux')
    .select(
      'id, entity_id, libelle, membres:bureau_membres!bureau_membres_bureau_id_fkey (id, date_fin)',
    )
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('libelle')
    .returns<
      {
        id: string;
        entity_id: string;
        libelle: string;
        membres: { id: string; date_fin: string | null }[];
      }[]
    >();

  // Un menu ne doit pas faire tomber l'organigramme : sans cet apercu, les
  // entrees « bureau » ne s'affichent simplement pas.
  if (error) return {};

  const table: ApercuBureaux = {};
  for (const b of data ?? []) {
    (table[b.entity_id] ??= []).push({
      id: b.id,
      libelle: b.libelle,
      nbMembres: b.membres.filter((m) => m.date_fin === null).length,
    });
  }
  return table;
}

/**
 * EF-BUR-10 — les fonctions occupees par un croyant, toutes entites confondues.
 *
 * Un croyant peut sieger au bureau de sa cellule ET de sa paroisse : la lecture
 * part donc du membre, jamais de l'entite.
 */
export interface FonctionOccupee {
  id: string;
  date_debut: string;
  date_fin: string | null;
  fonction: { id: string; libelle: string; est_financiere: boolean } | null;
  bureau: {
    id: string;
    libelle: string;
    is_active: boolean;
    entite: { id: string; nom: string; type: EntityType } | null;
  } | null;
}

export async function fonctionsDuCroyant(croyantId: string): Promise<FonctionOccupee[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('bureau_membres')
    .select(
      `id, date_debut, date_fin,
       fonction:fonctions!bureau_membres_fonction_id_fkey (id, libelle, est_financiere),
       bureau:bureaux!bureau_membres_bureau_id_fkey (
         id, libelle, is_active,
         entite:entities!bureaux_entity_id_fkey (id, nom, type)
       )`,
    )
    .eq('croyant_id', croyantId)
    .order('date_debut', { ascending: false })
    .returns<FonctionOccupee[]>();

  // Une fiche de croyant ne doit pas tomber parce que ses mandats sont
  // illisibles : la section reste vide, le reste s'affiche.
  return error ? [] : (data ?? []);
}

/** Referentiel des fonctions, sous la forme attendue par le domaine. */
export async function listerFonctions(): Promise<FonctionBureau[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('fonctions')
    .select('id, code, libelle, est_financiere, niveaux_applicables, is_active')
    // EF-REF-02 — L'ORDRE PROTOCOLAIRE D'ABORD. Il etait alphabetique : la
    // composition d'un bureau listait le tresorier avant le president, ce
    // qu'aucune assemblee ne fait. Le libelle ne departage plus que les rangs
    // egaux — deux fonctions creees sans avoir ete ordonnees.
    .order('ordre_protocolaire')
    .order('libelle')
    .returns<
      {
        id: string;
        code: string;
        libelle: string;
        est_financiere: boolean;
        niveaux_applicables: EntityType[];
        is_active: boolean;
      }[]
    >();

  if (error) throw new DataError('Le referentiel des fonctions est illisible.', error);

  return (data ?? []).map((f) => ({
    id: f.id,
    code: f.code,
    libelle: f.libelle,
    estFinanciere: f.est_financiere,
    niveauxApplicables: f.niveaux_applicables,
    isActive: f.is_active,
  }));
}

/**
 * Croyants designables — RG-09.
 *
 * Le perimetre est borne par la RLS ; le domaine restreint ensuite au
 * sous-arbre de l'entite concernee. Deux filtres, deux responsabilites : la
 * base protege, le domaine explique le refus.
 */
export interface CandidatCroyant {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  photo_key: string | null;
  statut: string;
  eglise: { id: string; path: string } | null;
}

/**
 * UN candidat, pour valider UNE designation — EF-BUR-03.
 *
 * `listerCandidats` charge jusqu'a deux mille croyants : le prix est justifie
 * pour peupler un ecran, absurde pour verifier une seule personne. La
 * designation y passait neuf secondes, dont l'essentiel a lire des gens dont
 * elle n'avait que faire.
 *
 * La RLS borne deja la lecture au perimetre ; RG-09 est verifiee ensuite par le
 * domaine, sur le chemin de l'eglise.
 */
export async function chargerCandidat(croyantId: string): Promise<CandidatCroyant | null> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('croyants')
    .select(
      'id, nom, prenom, matricule, photo_key, statut, eglise:entities!croyants_eglise_id_fkey (id, path)',
    )
    .eq('id', croyantId)
    .is('deleted_at', null)
    .maybeSingle<CandidatCroyant>();

  return error ? null : data;
}

export async function listerCandidats(): Promise<CandidatCroyant[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('croyants')
    .select(
      'id, nom, prenom, matricule, photo_key, statut, eglise:entities!croyants_eglise_id_fkey (id, path)',
    )
    .is('deleted_at', null)
    .eq('statut', 'ACTIF')
    .order('nom')
    .limit(2000)
    .returns<CandidatCroyant[]>();

  if (error) throw new DataError('La liste des croyants est illisible.', error);
  return data ?? [];
}

/**
 * ARB-2 / EF-FIN-05 — combien de titulaires EN FONCTION dans cette entite.
 *
 * Zero signifie « personne pour saisir » : ni bureau, ni bureau vide, ni bureau
 * dont tous les mandats sont echus. Les trois se ressemblent par ce qui compte,
 * et la question posee est bien celle-la — pas « existe-t-il un bureau ».
 *
 * UNE REQUETE, ET SUR LA SEULE ENTITE VISEE. `fn_chiffres_perimetre` (0053)
 * rend deja ce nombre pour tout le perimetre, et c'est ce qui sert l'ECRAN ;
 * ici on ecrit une ligne, et charger cinquante entites pour en lire une seule
 * serait payer un balayage pour un test (regle 28).
 *
 * `head: true` : on demande le COMPTE, jamais les lignes.
 */
export async function compterTitulairesEnFonction(entityId: string): Promise<number> {
  const sb = await createClient();

  const aujourdhui = new Date().toISOString().slice(0, 10);

  const { count, error } = await sb
    .from('bureau_membres')
    .select('id, bureau:bureaux!inner(entity_id, is_active, deleted_at)', {
      count: 'exact',
      head: true,
    })
    .eq('bureau.entity_id', entityId)
    .eq('bureau.is_active', true)
    .is('bureau.deleted_at', null)
    .or(`date_fin.is.null,date_fin.gte.${aujourdhui}`);

  if (error) {
    throw new DataError(
      'La composition du bureau de cette entite est momentanement illisible.',
      error,
    );
  }

  return count ?? 0;
}
