'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, requireSession, auditer } from '@/lib/session';
import { type ActionResult, ok, ko } from '@/lib/domain/result';
import {
  CreerVisiteSchema,
  ModifierVisiteSchema,
  ReprogrammerVisiteSchema,
  peutDeplacerVisite,
} from '@/lib/domain/visites-pastorales';
import { executerAction } from './executer';

/**
 * Planifier une nouvelle visite pastorale.
 */
export async function planifierVisitePastorale(input: unknown): Promise<ActionResult<{ id: string }>> {
  return executerAction('planifierVisitePastorale', async () => {
    const parse = CreerVisiteSchema.safeParse(input);
    if (!parse.success) {
      return ko(parse.error.issues[0]?.message || 'Données de formulaire invalides');
    }

    const { data } = parse;
    const session = await requireSession();
    await requirePermission(session, 'visite.create', data.entite_initiatrice_id);

    const supabase = await createClient();

    // 1. Insertion de la visite
    const { data: visite, error: errVisite } = await supabase
      .from('visites_pastorales')
      .insert({
        entite_initiatrice_id: data.entite_initiatrice_id,
        entite_cible_id: data.entite_cible_id,
        date_visite: data.date_visite,
        heure_visite: data.heure_visite || '09:00',
        type_culte: data.type_culte,
        theme_message: data.theme_message || null,
        instructions: data.instructions || null,
        statut: 'PLANIFIE',
        cree_par: session.profileId,
      })
      .select('id, reference_ordre_mission')
      .single();

    if (errVisite || !visite) {
      return ko(`Échec de la planification de la visite : ${errVisite?.message || 'Erreur inconnue'}`);
    }

    // 2. Insertion des délégués
    const deleguesInsert = data.delegues.map((d, index) => ({
      visite_id: visite.id,
      croyant_id: d.croyant_id,
      role_mission: d.role_mission,
      ordre: d.ordre || index + 1,
    }));

    const { error: errDelegues } = await supabase
      .from('visites_pastorales_delegues')
      .insert(deleguesInsert);

    if (errDelegues) {
      return ko(`Échec de l'enregistrement de la délégation : ${errDelegues.message}`);
    }

    await auditer({
      session,
      action: 'CREATE',
      table: 'visites_pastorales',
      recordId: visite.id,
      entityId: data.entite_initiatrice_id,
      diff: {
        reference: visite.reference_ordre_mission,
        date: data.date_visite,
        cibleId: data.entite_cible_id,
      },
    });

    revalidatePath('/visites');
    revalidatePath('/tableau-de-bord');

    return ok({ id: visite.id });
  });
}

/**
 * Modifier une visite pastorale existante.
 */
export async function modifierVisitePastorale(input: unknown): Promise<ActionResult<void>> {
  return executerAction('modifierVisitePastorale', async () => {
    const parse = ModifierVisiteSchema.safeParse(input);
    if (!parse.success) {
      return ko(parse.error.issues[0]?.message || 'Données de formulaire invalides');
    }

    const { data } = parse;
    const session = await requireSession();
    await requirePermission(session, 'visite.update', data.entite_initiatrice_id);

    const supabase = await createClient();

    // Vérification de la visite et du statut
    const { data: existante, error: errExist } = await supabase
      .from('visites_pastorales')
      .select('id, statut, entite_initiatrice_id')
      .eq('id', data.id)
      .single();

    if (errExist || !existante) {
      return ko('Visite pastorale introuvable');
    }

    if (!peutDeplacerVisite(existante.statut)) {
      return ko('Impossible de modifier une visite pastorale déjà effectuée ou annulée');
    }

    // Mise à jour des informations de base
    const { error: errUpdate } = await supabase
      .from('visites_pastorales')
      .update({
        entite_cible_id: data.entite_cible_id,
        date_visite: data.date_visite,
        heure_visite: data.heure_visite || '09:00',
        type_culte: data.type_culte,
        theme_message: data.theme_message || null,
        instructions: data.instructions || null,
      })
      .eq('id', data.id);

    if (errUpdate) {
      return ko(`Échec de la mise à jour : ${errUpdate.message}`);
    }

    // Remplacement des délégués
    await supabase.from('visites_pastorales_delegues').delete().eq('visite_id', data.id);

    const deleguesInsert = data.delegues.map((d, index) => ({
      visite_id: data.id,
      croyant_id: d.croyant_id,
      role_mission: d.role_mission,
      ordre: d.ordre || index + 1,
    }));

    const { error: errDelegues } = await supabase
      .from('visites_pastorales_delegues')
      .insert(deleguesInsert);

    if (errDelegues) {
      return ko(`Échec de la mise à jour des missionnaires : ${errDelegues.message}`);
    }

    await auditer({
      session,
      action: 'UPDATE',
      table: 'visites_pastorales',
      recordId: data.id,
      entityId: data.entite_initiatrice_id,
      diff: { date: data.date_visite, cibleId: data.entite_cible_id },
    });

    revalidatePath('/visites');
    revalidatePath('/tableau-de-bord');

    return ok(undefined);
  });
}

/**
 * Reprogrammer la date d'une visite (au glisser-déposer / Drag & Drop).
 */
export async function reprogrammerVisitePastorale(input: unknown): Promise<ActionResult<void>> {
  return executerAction('reprogrammerVisitePastorale', async () => {
    const parse = ReprogrammerVisiteSchema.safeParse(input);
    if (!parse.success) {
      return ko(parse.error.issues[0]?.message || 'Données invalides');
    }

    const { id, date_visite } = parse.data;
    const session = await requireSession();

    const supabase = await createClient();

    const { data: visite, error: errGet } = await supabase
      .from('visites_pastorales')
      .select('id, statut, entite_initiatrice_id')
      .eq('id', id)
      .single();

    if (errGet || !visite) {
      return ko('Visite pastorale introuvable');
    }

    await requirePermission(session, 'visite.update', visite.entite_initiatrice_id);

    if (!peutDeplacerVisite(visite.statut)) {
      return ko('Impossible de déplacer une visite pastorale déjà effectuée ou annulée');
    }

    const { error: errUpdate } = await supabase
      .from('visites_pastorales')
      .update({ date_visite })
      .eq('id', id);

    if (errUpdate) {
      return ko(`Échec du déplacement : ${errUpdate.message}`);
    }

    await auditer({
      session,
      action: 'UPDATE',
      table: 'visites_pastorales',
      recordId: id,
      entityId: visite.entite_initiatrice_id,
      diff: { nouvelleDate: date_visite },
    });

    revalidatePath('/visites');
    revalidatePath('/tableau-de-bord');

    return ok(undefined);
  });
}

/**
 * Valider et confirmer une visite pastorale.
 */
export async function validerVisitePastorale(id: string): Promise<ActionResult<void>> {
  return executerAction('validerVisitePastorale', async () => {
    const session = await requireSession();
    const supabase = await createClient();

    const { data: visite, error: errGet } = await supabase
      .from('visites_pastorales')
      .select('id, statut, entite_initiatrice_id')
      .eq('id', id)
      .single();

    if (errGet || !visite) return ko('Visite introuvable');

    await requirePermission(session, 'visite.validate', visite.entite_initiatrice_id);

    const { error: errUpdate } = await supabase
      .from('visites_pastorales')
      .update({
        statut: 'CONFIRME',
        valide_par: session.profileId,
        valide_le: new Date().toISOString(),
      })
      .eq('id', id);

    if (errUpdate) return ko(`Échec de la validation : ${errUpdate.message}`);

    await auditer({
      session,
      action: 'VALIDATE',
      table: 'visites_pastorales',
      recordId: id,
      entityId: visite.entite_initiatrice_id,
    });

    revalidatePath('/visites');
    return ok(undefined);
  });
}

/**
 * Annuler ou supprimer une visite pastorale.
 */
export async function annulerVisitePastorale(id: string): Promise<ActionResult<void>> {
  return executerAction('annulerVisitePastorale', async () => {
    const session = await requireSession();
    const supabase = await createClient();

    const { data: visite, error: errGet } = await supabase
      .from('visites_pastorales')
      .select('id, statut, entite_initiatrice_id')
      .eq('id', id)
      .single();

    if (errGet || !visite) return ko('Visite introuvable');

    await requirePermission(session, 'visite.delete', visite.entite_initiatrice_id);

    const { error: errUpdate } = await supabase
      .from('visites_pastorales')
      .update({ statut: 'ANNULE' })
      .eq('id', id);

    if (errUpdate) return ko(`Échec de l'annulation : ${errUpdate.message}`);

    await auditer({
      session,
      action: 'CANCEL',
      table: 'visites_pastorales',
      recordId: id,
      entityId: visite.entite_initiatrice_id,
    });

    revalidatePath('/visites');
    return ok(undefined);
  });
}
