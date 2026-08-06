'use server';

import { revalidatePath } from 'next/cache';

import { chercherDoublons, getCroyant } from '@/lib/data/croyants';
import { type NoeudEntite, getArbrePerimetre } from '@/lib/data/entities';
import { nomComplet, validerDatesCroyant } from '@/lib/domain/croyant';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { ErreurAcces, auditer, requirePermission, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitize } from '@/lib/utils/sanitize';
import {
  croyantSchema,
  modifierCroyantSchema,
  supprimerCroyantSchema,
} from '@/lib/validation/croyant';
import { champsEnErreur } from '@/lib/validation/zod-errors';

/**
 * Mutations sur les croyants — EF-CRO-01 à 13.
 *
 * Enchaînement invariant (plan.md §5.4) :
 *   session → validation Zod → habilitation + PORTÉE → règles de gestion
 *          → persistance → audit → revalidation
 */

function messageErreurSql(erreur: { code?: string; message?: string }): string {
  if (erreur.code === '23505') {
    return 'Un croyant portant ce matricule existe déjà.';
  }
  if (erreur.code === '23503') {
    return "L'église, la cellule, le grade ou la nationalité indiqué est introuvable.";
  }
  // Les triggers RG-* lèvent avec un message déjà rédigé pour l'utilisateur.
  if (erreur.message?.includes('RG-')) {
    return erreur.message.split('\n')[0] ?? 'Opération refusée.';
  }
  return "L'opération n'a pas pu aboutir.";
}

/**
 * Résout l'église et vérifie la cohérence de la cellule — RG-04, RG-05.
 *
 * Union DISCRIMINÉE sur `ok` : sans discriminant explicite, TypeScript ne peut
 * pas retrancher la branche d'erreur, les deux formes étant structurellement
 * compatibles.
 */
type Rattachement =
  | { ok: false; erreur: string }
  | { ok: true; eglise: NoeudEntite };

async function resoudreRattachement(
  egliseId: string,
  celluleId: string | null | undefined,
): Promise<Rattachement> {
  const arbre = await getArbrePerimetre();
  const eglise = arbre.find((e) => e.id === egliseId);

  if (!eglise) {
    return { ok: false, erreur: 'Cette église est introuvable ou hors de votre périmètre.' };
  }
  if (eglise.type !== 'EGLISE') {
    return { ok: false, erreur: 'RG-04 : le rattachement principal doit être une Église.' };
  }

  if (celluleId) {
    const cellule = arbre.find((e) => e.id === celluleId);
    if (!cellule || cellule.type !== 'CELLULE') {
      return { ok: false, erreur: 'Cette cellule est introuvable.' };
    }
    if (cellule.parent_id !== egliseId) {
      return {
        ok: false,
        erreur: `RG-05 : la cellule « ${cellule.nom} » n'appartient pas à l'église « ${eglise.nom} ».`,
      };
    }
  }

  return { ok: true, eglise };
}

// -----------------------------------------------------------------------------

export async function creerCroyant(
  input: unknown,
): Promise<ActionResult<{ id: string; matricule: string }>> {
  try {
    const session = await requireSession();

    const analyse = croyantSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const rattachement = await resoudreRattachement(data.egliseId, data.celluleId);
    if (!rattachement.ok) return ko(rattachement.erreur);

    await requirePermission(session, 'croyant.create', rattachement.eglise.path);

    // RG-28 — doublée par une contrainte CHECK ; ici le message est exploitable.
    const dates = validerDatesCroyant(data.dateNaissance, data.dateBapteme);
    if (!dates.ok) return ko(dates.error);

    // EF-CRO-13 — on avertit, on ne bloque pas : deux homonymes nés le même
    // jour existent réellement. La décision revient à l'utilisateur.
    if (!data.doublonAccepte) {
      const doublons = await chercherDoublons(data.nom, data.prenom, data.dateNaissance);
      if (doublons.length > 0) {
        const premier = doublons[0]!;
        return ko(
          `${nomComplet(premier.nom, premier.prenom)} est déjà enregistré avec la même ` +
            `date de naissance (matricule ${premier.matricule}). ` +
            'Confirmez pour créer malgré tout.',
          { doublon: [premier.id] },
        );
      }
    }

    const sb = await createClient();
    const { data: cree, error } = await sb
      .from('croyants')
      .insert({
        nom: sanitize(data.nom),
        prenom: sanitize(data.prenom),
        sexe: data.sexe,
        statut_marital: data.statutMarital ?? null,
        email: data.email,
        telephone: data.telephone,
        date_naissance: data.dateNaissance.toISOString().slice(0, 10),
        date_bapteme: data.dateBapteme.toISOString().slice(0, 10),
        adresse: sanitize(data.adresse),
        eglise_id: data.egliseId,
        cellule_id: data.celluleId ?? null,
        grade_id: data.gradeId,
        nationalite_id: data.nationaliteId,
        photo_key: data.photoKey ?? null,
        saisi_par: session.profileId,
        saisi_depuis: session.entityId,
        // `matricule` est genere par le trigger ; PostgREST exige neanmoins une
        // valeur pour une colonne NOT NULL sans defaut.
        matricule: 'EN-ATTENTE',
      })
      .select('id, matricule')
      .single<{ id: string; matricule: string }>();

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'CREATE',
      table: 'croyants',
      recordId: cree.id,
      entityId: data.egliseId,
      diff: { apres: { nom: data.nom, prenom: data.prenom, matricule: cree.matricule } },
    });

    revalidatePath('/croyants');
    revalidatePath(`/structure/${data.egliseId}`);
    return ok(cree);
  } catch (erreur) {
    if (erreur instanceof ErreurAcces) return ko(erreur.message);
    throw erreur;
  }
}

// -----------------------------------------------------------------------------

export async function modifierCroyant(input: unknown): Promise<ActionResult<void>> {
  try {
    const session = await requireSession();

    const analyse = modifierCroyantSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const existant = await getCroyant(data.id);
    if (!existant) return ko('Ce croyant est introuvable ou hors de votre périmètre.');

    const rattachement = await resoudreRattachement(existant.eglise_id, data.celluleId);
    if (!rattachement.ok) return ko(rattachement.erreur);

    await requirePermission(session, 'croyant.update', rattachement.eglise.path);

    const dates = validerDatesCroyant(data.dateNaissance, data.dateBapteme);
    if (!dates.ok) return ko(dates.error);

    const sb = await createClient();
    const { error } = await sb
      .from('croyants')
      .update({
        nom: sanitize(data.nom),
        prenom: sanitize(data.prenom),
        sexe: data.sexe,
        statut_marital: data.statutMarital ?? null,
        email: data.email,
        telephone: data.telephone,
        date_naissance: data.dateNaissance.toISOString().slice(0, 10),
        date_bapteme: data.dateBapteme.toISOString().slice(0, 10),
        adresse: sanitize(data.adresse),
        // L'église ne change PAS ici : c'est un transfert (EF-TRF-01).
        cellule_id: data.celluleId ?? null,
        grade_id: data.gradeId,
        nationalite_id: data.nationaliteId,
        statut: data.statut,
        photo_key: data.photoKey ?? null,
      })
      .eq('id', data.id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'croyants',
      recordId: data.id,
      entityId: existant.eglise_id,
      diff: {
        avant: { nom: existant.nom, prenom: existant.prenom, statut: existant.statut },
        apres: { nom: data.nom, prenom: data.prenom, statut: data.statut },
      },
    });

    revalidatePath('/croyants');
    revalidatePath(`/croyants/${data.id}`);
    return ok();
  } catch (erreur) {
    if (erreur instanceof ErreurAcces) return ko(erreur.message);
    throw erreur;
  }
}

// -----------------------------------------------------------------------------

/** RG-22 — suppression LOGIQUE : la fiche part en corbeille et reste restaurable. */
export async function supprimerCroyant(input: unknown): Promise<ActionResult<void>> {
  try {
    const session = await requireSession();

    const analyse = supprimerCroyantSchema.safeParse(input);
    if (!analyse.success) return ko('Requête invalide.');

    const existant = await getCroyant(analyse.data.id);
    if (!existant) return ko('Ce croyant est introuvable ou hors de votre périmètre.');

    const arbre = await getArbrePerimetre();
    const eglise = arbre.find((e) => e.id === existant.eglise_id);
    if (!eglise) return ko('Église introuvable.');

    await requirePermission(session, 'croyant.delete', eglise.path);

    const sb = await createClient();
    const { error } = await sb
      .from('croyants')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', analyse.data.id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'DELETE',
      table: 'croyants',
      recordId: analyse.data.id,
      entityId: existant.eglise_id,
      diff: { avant: { matricule: existant.matricule, nom: existant.nom } },
    });

    revalidatePath('/croyants');
    return ok();
  } catch (erreur) {
    if (erreur instanceof ErreurAcces) return ko(erreur.message);
    throw erreur;
  }
}

// -----------------------------------------------------------------------------

export async function restaurerCroyant(input: unknown): Promise<ActionResult<void>> {
  try {
    const session = await requireSession();

    const analyse = supprimerCroyantSchema.safeParse(input);
    if (!analyse.success) return ko('Requête invalide.');

    await requirePermission(session, 'trash.restore');

    const sb = await createClient();
    const { data: existant, error: erreurLecture } = await sb
      .from('croyants')
      .select('id, nom, prenom, matricule, eglise_id')
      .eq('id', analyse.data.id)
      .maybeSingle<{
        id: string;
        nom: string;
        prenom: string;
        matricule: string;
        eglise_id: string;
      }>();

    if (erreurLecture || !existant) return ko('Ce croyant est introuvable.');

    const { error } = await sb
      .from('croyants')
      .update({ deleted_at: null })
      .eq('id', analyse.data.id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'RESTORE',
      table: 'croyants',
      recordId: existant.id,
      entityId: existant.eglise_id,
      diff: { apres: { matricule: existant.matricule } },
    });

    revalidatePath('/croyants');
    revalidatePath('/administration/corbeille');
    return ok();
  } catch (erreur) {
    if (erreur instanceof ErreurAcces) return ko(erreur.message);
    throw erreur;
  }
}
