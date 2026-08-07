'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getArbrePerimetre } from '@/lib/data/entities';
import { listerReferentiel } from '@/lib/data/referentiels';
import {
  type CroyantImporte,
  type Referentiels,
  analyserLot,
  normaliser,
} from '@/lib/domain/import-croyants';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitize } from '@/lib/utils/sanitize';

import { executerAction } from './executer';

/**
 * Import d'un lot de croyants — EF-CRO-11.
 *
 * LE SERVEUR REANALYSE TOUT. Le navigateur a deja produit un rapport, mais ce
 * rapport lui appartient : rien n'empeche d'envoyer des lignes qui ne l'ont
 * jamais traverse. Les references sont donc resolues ici, contre le perimetre
 * REEL de l'utilisateur, et les regles rejouees.
 *
 * L'insertion se fait par TRANCHES. Une requete de mille lignes expire ; mille
 * requetes d'une ligne coutent mille allers-retours. Cinquante par envoi est le
 * compromis : chaque tranche tient largement dans le delai, et un fichier de
 * mille croyants part en vingt requetes.
 */

/** Au-dela, le fichier releve d'un traitement par lots, pas d'un formulaire. */
const LIGNES_MAX = 5000;
const TAILLE_TRANCHE = 50;

const importSchema = z.object({
  egliseParDefaut: z.uuid().optional().nullable(),
  correspondance: z.record(z.string(), z.number().int().nullable()),
  lignes: z
    .array(z.array(z.string()))
    .max(LIGNES_MAX, `Un import porte sur ${LIGNES_MAX} lignes au plus.`),
});

/**
 * Tables de resolution construites depuis le PERIMETRE de l'utilisateur.
 *
 * Une eglise absente de son perimetre est donc « inconnue » — le message ne
 * distingue pas volontairement l'inexistant de l'inaccessible : dire « cette
 * eglise existe mais vous n'y avez pas droit » renseignerait sur une structure
 * qu'on n'a pas a connaitre.
 */
async function construireReferentiels(): Promise<Referentiels> {
  const [arbre, grades, nationalites] = await Promise.all([
    getArbrePerimetre(),
    listerReferentiel('grades'),
    listerReferentiel('nationalites'),
  ]);

  const eglises = new Map<string, string>();
  const cellules = new Map<string, string>();
  const egliseDeLaCellule = new Map<string, string>();

  for (const entite of arbre) {
    // Nom ET code : un fichier de reprise emploie l'un ou l'autre, parfois les
    // deux selon les lignes.
    const cible =
      entite.type === 'EGLISE' ? eglises : entite.type === 'CELLULE' ? cellules : null;
    if (!cible) continue;

    cible.set(normaliser(entite.nom), entite.id);
    cible.set(normaliser(entite.code), entite.id);

    if (entite.type === 'CELLULE' && entite.parent_id) {
      egliseDeLaCellule.set(entite.id, entite.parent_id);
    }
  }

  const indexer = (lignes: { id: string; libelle?: unknown; code?: unknown }[]) => {
    const index = new Map<string, string>();
    for (const l of lignes) {
      if (typeof l.libelle === 'string') index.set(normaliser(l.libelle), l.id);
      if (typeof l.code === 'string') index.set(normaliser(l.code), l.id);
    }
    return index;
  };

  return {
    eglises,
    cellules,
    grades: indexer(grades as { id: string; libelle?: unknown; code?: unknown }[]),
    nationalites: indexer(
      nationalites as { id: string; libelle?: unknown; code?: unknown }[],
    ),
    egliseDeLaCellule,
  };
}

export interface ResultatImport {
  /** Lignes reellement ecrites. */
  importes: number;
  /** Lignes refusees a l'analyse, avec leur raison. */
  erreurs: { ligne: number; champ: string | null; message: string; valeur: string }[];
  /** Lignes valides que la base a rejetees — doublon, contrainte. */
  echecs: { ligne: number; message: string }[];
}

export async function importerCroyants(
  input: unknown,
): Promise<ActionResult<ResultatImport>> {
  return executerAction('importerCroyants', async () => {
    const session = await requireSession();

    const analyse = importSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    const { lignes, correspondance } = analyse.data;
    if (lignes.length === 0) return ko('Le fichier ne contient aucune ligne.');

    const referentiels = await construireReferentiels();

    // Une absence de donnees n'est pas un refus de droit.
    if (referentiels.eglises.size === 0) {
      return ko(
        "La structure n'a pas pu etre chargee. Verifiez votre connexion, puis reessayez.",
      );
    }

    const rapport = analyserLot(lignes, correspondance, referentiels);
    if (rapport.valides.length === 0) {
      return ok({ importes: 0, erreurs: rapport.erreurs, echecs: [] });
    }

    // RG-25 — le droit s'evalue eglise par eglise : un fichier peut couvrir
    // plusieurs paroisses, et rien ne garantit qu'on les couvre toutes.
    const arbre = await getArbrePerimetre();
    const chemins = new Map(arbre.map((e) => [e.id, e.path]));

    for (const egliseId of new Set(rapport.valides.map((c) => c.egliseId))) {
      const chemin = chemins.get(egliseId);
      if (!chemin) return ko('Une eglise du fichier est hors de votre perimetre.');
      await requirePermission(session, 'croyant.create', chemin);
    }

    const sb = await createClient();
    const echecs: ResultatImport['echecs'] = [];
    let importes = 0;

    for (let i = 0; i < rapport.valides.length; i += TAILLE_TRANCHE) {
      const tranche = rapport.valides.slice(i, i + TAILLE_TRANCHE);

      const { data, error } = await sb
        .from('croyants')
        .insert(tranche.map((c) => versLigne(c, session.profileId, session.entityId)))
        .select('id');

      if (!error) {
        importes += data?.length ?? tranche.length;
        continue;
      }

      // Une tranche refusee ne doit pas emporter les autres : on la rejoue
      // ligne a ligne pour SITUER la faute, au lieu de rejeter cinquante
      // croyants a cause d'un seul.
      for (const croyant of tranche) {
        const { error: erreurLigne } = await sb
          .from('croyants')
          .insert(versLigne(croyant, session.profileId, session.entityId));

        if (erreurLigne) {
          echecs.push({ ligne: croyant.ligne, message: messageSql(erreurLigne) });
        } else {
          importes += 1;
        }
      }
    }

    await auditer({
      session,
      action: 'CREATE',
      table: 'croyants',
      // Aucun enregistrement PRECIS : l'evenement porte sur le lot entier.
      entityId: session.entityId,
      diff: {
        apres: {
          import: true,
          lignes: lignes.length,
          importes,
          refusees: rapport.erreurs.length + echecs.length,
        },
      },
    });

    revalidatePath('/croyants');
    return ok({ importes, erreurs: rapport.erreurs, echecs });
  });
}

function versLigne(c: CroyantImporte, profileId: string, entityId: string) {
  return {
    nom: sanitize(c.nom),
    prenom: sanitize(c.prenom),
    sexe: c.sexe,
    statut_marital: c.statutMarital,
    email: c.email,
    telephone: c.telephone,
    date_naissance: c.dateNaissance,
    date_bapteme: c.dateBapteme,
    adresse: sanitize(c.adresse),
    eglise_id: c.egliseId,
    cellule_id: c.celluleId,
    grade_id: c.gradeId,
    nationalite_id: c.nationaliteId,
    saisi_par: profileId,
    saisi_depuis: entityId,
    // `matricule` omis : le trigger l'attribue, seule la base garantissant
    // l'unicite de la sequence face a cinquante insertions simultanees.
  };
}

function messageSql(erreur: { code?: string; message?: string }): string {
  if (erreur.code === '23505') return 'Doublon refuse par la base.';
  if (erreur.code === '23503') return 'Une reference est introuvable.';
  if (erreur.message?.includes('RG-')) {
    return erreur.message.split('\n')[0] ?? 'Ligne refusee.';
  }
  return "Cette ligne n'a pas pu etre enregistree.";
}
