'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getCroyant } from '@/lib/data/croyants';
import { getArbrePerimetre } from '@/lib/data/entities';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { construireCle, storage, verifierFichier } from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';

import { executerAction } from './executer';

/**
 * Photo de profil d'un croyant — EF-CRO-09, ENF-SEC-06.
 *
 * Le client redimensionne et recadre avant d'envoyer (voir `PhotoUploader`),
 * mais le serveur ne lui fait AUCUNE confiance : il relit les premiers octets
 * pour determiner le type reel du fichier. Un PDF renomme en `.webp` est
 * rejete ici, pas dans le navigateur.
 *
 * La base ne recoit que la CLE relative, jamais une URL (ENF-POR-03).
 */

const cibleSchema = z.object({ croyantId: z.uuid() });

async function porteeDuCroyant(croyantId: string) {
  const croyant = await getCroyant(croyantId);
  if (!croyant) return null;

  const arbre = await getArbrePerimetre();
  const eglise = arbre.find((e) => e.id === croyant.eglise_id);
  return eglise ? { croyant, portee: eglise.path } : null;
}

export async function televerserPhotoCroyant(
  formulaire: FormData,
): Promise<ActionResult<{ photoKey: string }>> {
  return executerAction('televerserPhotoCroyant', async () => {
    const session = await requireSession();

    const analyse = cibleSchema.safeParse({ croyantId: formulaire.get('croyantId') });
    if (!analyse.success) return ko('Requete invalide.');

    const fichier = formulaire.get('photo');
    if (!(fichier instanceof File) || fichier.size === 0) {
      return ko('Aucun fichier recu.');
    }

    const cible = await porteeDuCroyant(analyse.data.croyantId);
    if (!cible) return ko('Ce croyant est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'croyant.update', cible.portee);

    const octets = new Uint8Array(await fichier.arrayBuffer());

    // ENF-SEC-06 — le type est deduit de la SIGNATURE, pas de l'extension ni
    // du `Content-Type` annonce, tous deux fournis par le client.
    const verdict = verifierFichier('photo', octets.slice(0, 16), octets.byteLength);
    if (!verdict.ok) return ko(verdict.error);

    const extension = verdict.data.split('/')[1] ?? 'webp';
    const cle = construireCle('photos', cible.croyant.id, extension);

    // `upsert` : remplacer sa photo ne doit pas laisser l'ancienne derriere.
    const depot = await storage().put(cle, octets, {
      contentType: verdict.data,
      upsert: true,
    });
    if (!depot.ok) return ko(depot.error);

    const sb = await createClient();
    const { error } = await sb
      .from('croyants')
      .update({ photo_key: depot.data })
      .eq('id', cible.croyant.id);

    if (error) {
      // L'objet est depose mais la fiche ne le reference pas : on le retire
      // plutot que de laisser un orphelin dans le stockage.
      await storage().delete(depot.data);
      return ko("La photo n'a pas pu etre rattachee a la fiche.");
    }

    await auditer({
      session,
      action: 'UPDATE',
      table: 'croyants',
      recordId: cible.croyant.id,
      entityId: cible.croyant.eglise_id,
      diff: { avant: { photo_key: cible.croyant.photo_key }, apres: { photo_key: depot.data } },
    });

    revalidatePath('/croyants');
    revalidatePath(`/croyants/${cible.croyant.id}`);
    return ok({ photoKey: depot.data });
  });
}

export async function supprimerPhotoCroyant(input: unknown): Promise<ActionResult<void>> {
  return executerAction('supprimerPhotoCroyant', async () => {
    const session = await requireSession();

    const analyse = cibleSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    const cible = await porteeDuCroyant(analyse.data.croyantId);
    if (!cible) return ko('Ce croyant est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'croyant.update', cible.portee);

    const ancienne = cible.croyant.photo_key;
    if (!ancienne) return ok();

    const sb = await createClient();
    const { error } = await sb
      .from('croyants')
      .update({ photo_key: null })
      .eq('id', cible.croyant.id);

    if (error) return ko("La photo n'a pas pu etre retiree.");

    // L'objet part APRES la fiche : si sa suppression echoue, il reste un
    // orphelin dans le stockage, ce qui est sans consequence — l'inverse
    // laisserait une fiche pointant vers un objet disparu.
    await storage().delete(ancienne);

    await auditer({
      session,
      action: 'UPDATE',
      table: 'croyants',
      recordId: cible.croyant.id,
      entityId: cible.croyant.eglise_id,
      diff: { avant: { photo_key: ancienne }, apres: { photo_key: null } },
    });

    revalidatePath('/croyants');
    revalidatePath(`/croyants/${cible.croyant.id}`);
    return ok();
  });
}
