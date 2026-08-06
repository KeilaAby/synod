'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { type ActionResult, ko, ok } from '@/lib/domain/result';
import {
  REFERENTIELS,
  type SlugReferentiel,
  estSlugReferentiel,
} from '@/lib/domain/referentiels';
import { ErreurAcces, auditer, requirePermission, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitizeAll } from '@/lib/utils/sanitize';
import { champsEnErreur } from '@/lib/validation/zod-errors';

/**
 * Mutations sur les referentiels — EF-REF-01 a 06.
 *
 * `referentiel.manage` figure dans NON_DELEGABLES : ces tables sont partagees
 * par toute l'organisation, une entite ne peut pas les modifier pour les
 * autres.
 */

const enveloppeSchema = z.object({
  slug: z.string().refine(estSlugReferentiel, { message: 'Referentiel inconnu.' }),
  valeurs: z.record(z.string(), z.unknown()),
});

const cibleSchema = z.object({
  slug: z.string().refine(estSlugReferentiel, { message: 'Referentiel inconnu.' }),
  id: z.uuid(),
});

function messageErreurSql(erreur: { code?: string; message?: string }): string {
  if (erreur.code === '23505') {
    return 'Ce code est deja utilise dans ce referentiel.';
  }
  if (erreur.code === '23503') {
    // RG-23 : une valeur utilisee ne peut pas disparaitre.
    return "Cette valeur est utilisee et ne peut pas etre supprimee. Desactivez-la a la place.";
  }
  return "L'operation n'a pas pu aboutir.";
}

// -----------------------------------------------------------------------------

export async function creerValeurReferentiel(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    await requirePermission(session, 'referentiel.manage');

    const enveloppe = enveloppeSchema.safeParse(input);
    if (!enveloppe.success) return ko('Requete invalide.');

    const slug = enveloppe.data.slug as SlugReferentiel;
    const definition = REFERENTIELS[slug];

    const analyse = definition.schema.safeParse(enveloppe.data.valeurs);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }

    const sb = await createClient();
    const { data, error } = await sb
      .from(definition.table)
      .insert(sanitizeAll(analyse.data))
      .select('id')
      .single<{ id: string }>();

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'CREATE',
      table: definition.table,
      recordId: data.id,
      diff: { apres: analyse.data },
    });

    revalidatePath(`/referentiels/${slug}`);
    revalidatePath('/referentiels');
    return ok({ id: data.id });
  } catch (erreur) {
    if (erreur instanceof ErreurAcces) return ko(erreur.message);
    throw erreur;
  }
}

// -----------------------------------------------------------------------------

export async function modifierValeurReferentiel(input: unknown): Promise<ActionResult<void>> {
  try {
    const session = await requireSession();
    await requirePermission(session, 'referentiel.manage');

    const enveloppe = enveloppeSchema.extend({ id: z.uuid() }).safeParse(input);
    if (!enveloppe.success) return ko('Requete invalide.');

    const slug = enveloppe.data.slug as SlugReferentiel;
    const definition = REFERENTIELS[slug];

    const analyse = definition.schema.safeParse(enveloppe.data.valeurs);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }

    // Les champs marques `immuable` sont retires de la mise a jour : un code
    // ou un sens qui change retroactivement invaliderait l'historique.
    const modifiable = { ...(analyse.data as Record<string, unknown>) };
    for (const champ of definition.champs) {
      if (champ.immuable) delete modifiable[champ.cle];
    }

    const sb = await createClient();
    const { error } = await sb
      .from(definition.table)
      .update(sanitizeAll(modifiable))
      .eq('id', enveloppe.data.id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: definition.table,
      recordId: enveloppe.data.id,
      diff: { apres: modifiable },
    });

    revalidatePath(`/referentiels/${slug}`);
    return ok();
  } catch (erreur) {
    if (erreur instanceof ErreurAcces) return ko(erreur.message);
    throw erreur;
  }
}

// -----------------------------------------------------------------------------

/**
 * RG-23 — une valeur utilisee ne se supprime pas, elle se desactive.
 * Elle disparait des nouvelles saisies mais reste lisible dans l'historique.
 */
export async function basculerActivationReferentiel(
  input: unknown,
): Promise<ActionResult<{ actif: boolean }>> {
  try {
    const session = await requireSession();
    await requirePermission(session, 'referentiel.manage');

    const cible = cibleSchema.safeParse(input);
    if (!cible.success) return ko('Requete invalide.');

    const slug = cible.data.slug as SlugReferentiel;
    const definition = REFERENTIELS[slug];

    const sb = await createClient();
    const { data: existante, error: erreurLecture } = await sb
      .from(definition.table)
      .select('id, libelle, is_active')
      .eq('id', cible.data.id)
      .maybeSingle<{ id: string; libelle: string; is_active: boolean }>();

    if (erreurLecture || !existante) return ko('Cette valeur est introuvable.');

    const suivant = !existante.is_active;

    const { error } = await sb
      .from(definition.table)
      .update({ is_active: suivant })
      .eq('id', cible.data.id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: definition.table,
      recordId: cible.data.id,
      diff: { champ: 'is_active', avant: existante.is_active, apres: suivant },
    });

    revalidatePath(`/referentiels/${slug}`);
    revalidatePath('/referentiels');
    return ok({ actif: suivant });
  } catch (erreur) {
    if (erreur instanceof ErreurAcces) return ko(erreur.message);
    throw erreur;
  }
}
