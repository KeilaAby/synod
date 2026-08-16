'use server';

import { revalidatePath } from 'next/cache';

import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { dispositionSchema } from '@/lib/validation/tableau-de-bord';

import { executerAction } from './executer';

/**
 * Enregistre la disposition du tableau de bord — EF-DSH-03, EF-DSH-07.
 *
 * AUCUN CONTROLE DE PORTEE, et ce n'est pas un oubli. La disposition est une
 * preference PERSONNELLE : elle ne decide de rien d'autre que de l'ordre des
 * cartes de son auteur, et la politique `dashboard_layouts_own` la borne a
 * `current_profile_id()`. Il n'y a pas de portee a evaluer parce qu'il n'y a
 * pas d'autre perimetre que soi.
 *
 * ELLE NE PEUT PAS DEVOILER CE QU'ON N'A PAS LE DROIT DE VOIR. L'ordre porte
 * des CLES, pas des donnees : demander a voir « solde_consolide » sans
 * `finance.read` n'affiche rien de plus — `kpisVisibles` filtre AVANT que la
 * disposition ne s'applique, et la RLS aurait de toute facon rendu zero.
 *
 * PAS D'AUDIT (regle 8 mise a part) : `auditer()` couvre les mutations
 * METIER. Journaliser qu'un compte a deplace une carte remplirait le journal
 * de bruit et rendrait plus difficile d'y trouver ce qui compte.
 */
export async function enregistrerDisposition(
  input: unknown,
): Promise<ActionResult<void>> {
  return executerAction('enregistrerDisposition', async () => {
    const session = await requireSession();

    const analyse = dispositionSchema.safeParse(input);
    if (!analyse.success) return ko('Disposition invalide.');

    const sb = await createClient();

    const { error } = await sb.from('dashboard_layouts').upsert(
      {
        user_id: session.profileId,
        layout: analyse.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (error) return ko('La disposition n’a pas pu être enregistrée.');

    revalidatePath('/tableau-de-bord');
    return ok();
  });
}
