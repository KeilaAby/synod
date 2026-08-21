'use server';

import { revalidatePath } from 'next/cache';

import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitize } from '@/lib/utils/sanitize';
import {
  deciderPromotionSchema,
  retirerPromotionSchema,
} from '@/lib/validation/promotion';
import { champsEnErreur } from '@/lib/validation/zod-errors';

import { executerAction } from './executer';

/**
 * Les promotions de grade — EF-CRO-12, RG-06.
 *
 * DEMANDER SE FAIT AILLEURS : c'est `modifierCroyant` qui ouvre la demande,
 * parce que c'est le meme geste qu'avant le circuit — on change le grade sur la
 * fiche. Un second formulaire « demander une promotion » aurait fait DEUX
 * chemins pour la meme intention (regle 16), et l'un des deux aurait fini par
 * oublier une regle que l'autre tenait.
 *
 * Ne restent donc ici que les deux gestes qui n'existaient pas : TRANCHER, et
 * SE RAVISER.
 */

/**
 * EF-CRO-12 — approuver ou refuser.
 *
 * LE DROIT SE VERIFIE EN BASE, PAS ICI. `fn_decider_promotion` exige
 * `croyant.grade.approve` sur l'ARBITRE — l'entite superieure figee a la
 * demande. Le refaire ici demanderait de relire la demande d'abord, donc un
 * aller-retour de plus pour un controle que la base tient deja (regle 28) ; et
 * surtout, deux ecritures de la meme regle finissent par diverger.
 *
 * Les DEUX ecritures — fermer la demande et poser le grade — sont
 * indissociables, donc elles se font dans la fonction (regle 20). Approuver
 * sans poser le grade laisserait une promotion accordee qui n'a rien change.
 */
export async function deciderPromotion(
  input: unknown,
): Promise<ActionResult<{ statut: string }>> {
  return executerAction('deciderPromotion', async () => {
    const session = await requireSession();

    const analyse = deciderPromotionSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Demande invalide.', champsEnErreur(analyse.error));
    }
    const { promotionId, approuver, motif } = analyse.data;

    const sb = await createClient();
    const { data: statut, error } = await sb.rpc('fn_decider_promotion', {
      p_promotion: promotionId,
      p_approuver: approuver,
      p_motif: motif ? sanitize(motif) : null,
    });

    if (error) {
      /**
       * Le message de la fonction EST destine a l'utilisateur : il nomme la
       * regle — « seule l'entite superieure peut trancher ». Le remplacer par
       * un generique perdrait la seule chose utile de l'echec.
       */
      return ko(error.message?.split('\n')[0] ?? "La decision n'a pas pu etre enregistree.");
    }

    await auditer({
      session,
      action: approuver ? 'APPROVE' : 'REJECT',
      table: 'promotions_grade',
      recordId: promotionId,
      diff: { champ: 'statut', apres: statut, motif },
    });

    revalidatePath('/croyants');
    revalidatePath('/promotions');
    return ok({ statut: String(statut) });
  });
}

/**
 * EF-CRO-12 — retirer sa propre demande.
 *
 * SE RAVISER N'EST PAS TRANCHER : cela ne demande pas le droit de l'arbitre,
 * et c'est la politique RLS `promotions_update` qui borne le geste — l'eglise
 * qui a demande, et elle seule, tant que rien n'est decide.
 *
 * On ANNULE, on ne supprime pas : la demande a existe, quelqu'un l'a vue passer
 * dans sa file, et l'effacer ferait douter de ce qu'on y a lu.
 */
export async function retirerPromotion(input: unknown): Promise<ActionResult<void>> {
  return executerAction('retirerPromotion', async () => {
    const session = await requireSession();

    const analyse = retirerPromotionSchema.safeParse(input);
    if (!analyse.success) return ko('Demande invalide.');

    const sb = await createClient();
    const { data, error } = await sb
      .from('promotions_grade')
      .update({ statut: 'ANNULE' })
      .eq('id', analyse.data.promotionId)
      .eq('statut', 'DEMANDE')
      .select('id');

    if (error) return ko("Cette demande n'a pas pu etre retiree.");

    /**
     * Zero ligne n'est pas une panne : la RLS a pu masquer la demande, ou
     * quelqu'un vient de la trancher. Les deux se disent de la meme facon —
     * inventer un diagnostic serait pire que l'absence de diagnostic.
     */
    if (!data || data.length === 0) {
      return ko('Cette demande est introuvable, deja tranchee, ou hors de votre perimetre.');
    }

    await auditer({
      session,
      action: 'CANCEL',
      table: 'promotions_grade',
      recordId: analyse.data.promotionId,
      diff: { champ: 'statut', apres: 'ANNULE' },
    });

    revalidatePath('/croyants');
    revalidatePath('/promotions');
    return ok();
  });
}
