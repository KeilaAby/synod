'use server';

import { revalidatePath } from 'next/cache';

import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { construireCle, storage, verifierFichier } from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';
import { sanitizeAll } from '@/lib/utils/sanitize';
import { attestationTransfertSchema } from '@/lib/validation/attestation-transfert';
import { champsEnErreur } from '@/lib/validation/zod-errors';

import { executerAction } from './executer';

/**
 * Le gabarit réglable de l'attestation de transfert — EF-TRF-08, migration
 * `0070`.
 *
 * RÉSERVÉ À `settings.manage`, non délégable, comme les modèles de courriel
 * (lot 7) : ce gabarit est commun à toute l'organisation, pas propre à une
 * entité (voir le commentaire de la migration `0070`). La RLS le dit déjà en
 * écriture ; ces actions ne font que rendre le refus lisible avant qu'il ne
 * vienne de la base.
 */

/** Une seule ligne, `id = 1` — comme `organisation_settings` et `email_settings`. */
const CLE_LOGO = 'attestation-transfert';

export async function reglerAttestationTransfert(input: unknown): Promise<ActionResult<void>> {
  return executerAction('reglerAttestationTransfert', async () => {
    const session = await requireSession();
    await requirePermission(session, 'settings.manage');

    const analyse = attestationTransfertSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const v = analyse.data;

    const ligne = sanitizeAll({
      texte_corps: v.texteCorps,
      mentions_legales: v.mentionsLegales,
      cartouche_signature: v.cartoucheSignature,
    });

    const sb = await createClient();
    const { error } = await sb.from('attestation_transfert_settings').update(ligne).eq('id', 1);

    if (error) return ko("Le gabarit n'a pas pu être enregistré.");

    await auditer({
      session,
      action: 'UPDATE',
      table: 'attestation_transfert_settings',
      diff: { apres: ligne },
    });

    revalidatePath('/administration/parametres');
    return ok();
  });
}

/**
 * EF-TRF-08 — le logo du gabarit.
 *
 * MÊME CONTRÔLE QUE LA PHOTO D'UN CROYANT (`lib/actions/photos.ts`) : le type
 * réel se déduit des premiers octets, jamais de l'extension ni du
 * `Content-Type` annoncé par le client (ENF-SEC-06).
 *
 * CLÉ FIXE, PAS UN UUID : une seule ligne de réglages porte un seul logo — le
 * remplacer doit écraser l'ancien (`upsert`), pas en laisser un orphelin dans
 * le stockage.
 */
export async function televerserLogoAttestation(
  formulaire: FormData,
): Promise<ActionResult<{ logoKey: string }>> {
  return executerAction('televerserLogoAttestation', async () => {
    const session = await requireSession();
    await requirePermission(session, 'settings.manage');

    const fichier = formulaire.get('logo');
    if (!(fichier instanceof File) || fichier.size === 0) {
      return ko('Aucun fichier reçu.');
    }

    const octets = new Uint8Array(await fichier.arrayBuffer());

    const verdict = verifierFichier('photo', octets.slice(0, 16), octets.byteLength);
    if (!verdict.ok) return ko(verdict.error);

    const extension = verdict.data.split('/')[1] ?? 'webp';
    const cle = construireCle('logos', CLE_LOGO, extension);

    const depot = await storage().put(cle, octets, {
      contentType: verdict.data,
      upsert: true,
    });
    if (!depot.ok) return ko(depot.error);

    const sb = await createClient();
    const { error } = await sb
      .from('attestation_transfert_settings')
      .update({ logo_key: depot.data })
      .eq('id', 1);

    if (error) {
      // L'objet est depose mais le reglage ne le reference pas : on le retire
      // plutot que de laisser un orphelin dans le stockage.
      await storage().delete(depot.data);
      return ko("Le logo n'a pas pu être enregistré.");
    }

    await auditer({
      session,
      action: 'UPDATE',
      table: 'attestation_transfert_settings',
      diff: { apres: { logo_key: depot.data } },
    });

    revalidatePath('/administration/parametres');
    return ok({ logoKey: depot.data });
  });
}

export async function supprimerLogoAttestation(): Promise<ActionResult<void>> {
  return executerAction('supprimerLogoAttestation', async () => {
    const session = await requireSession();
    await requirePermission(session, 'settings.manage');

    const sb = await createClient();
    const { data: actuel } = await sb
      .from('attestation_transfert_settings')
      .select('logo_key')
      .eq('id', 1)
      .maybeSingle<{ logo_key: string | null }>();

    if (!actuel?.logo_key) return ok();

    const { error } = await sb
      .from('attestation_transfert_settings')
      .update({ logo_key: null })
      .eq('id', 1);

    if (error) return ko("Le logo n'a pas pu être retiré.");

    // L'objet part APRES le reglage : si sa suppression echoue, il reste un
    // orphelin dans le stockage, sans consequence — l'inverse laisserait le
    // reglage pointer vers un objet disparu.
    await storage().delete(actuel.logo_key);

    await auditer({
      session,
      action: 'UPDATE',
      table: 'attestation_transfert_settings',
      diff: { avant: { logo_key: actuel.logo_key }, apres: { logo_key: null } },
    });

    revalidatePath('/administration/parametres');
    return ok();
  });
}
