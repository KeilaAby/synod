'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getArbrePerimetre } from '@/lib/data/entities';
import { estModifiable, type StatutMouvement } from '@/lib/domain/finance';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { construireCle, storage, verifierFichier } from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';

import { executerAction } from './executer';

/**
 * Piece justificative d'un mouvement financier — EF-FIN-07, ENF-SEC-06.
 *
 * Le type est deduit de la SIGNATURE du fichier, jamais de son extension ni du
 * `Content-Type` annonce : tous deux viennent du client. Un exécutable renomme
 * en `.pdf` est rejete ici, pas dans le navigateur.
 *
 * La base ne recoit que la CLE relative, jamais une URL signee (ENF-POR-03,
 * regle 11) : une URL expire, et une base pleine d'URL mortes ne se repare pas.
 *
 * ⚠ LE SEUL FILET. Le seau n'a aucune politique et la couche stockage emprunte
 * la cle de service : le `requirePermission` ci-dessous n'est pas une commodite
 * doublee par la RLS, c'est le controle d'acces lui-meme. Ne jamais appeler
 * `storage()` sans l'avoir precede.
 */

const cibleSchema = z.object({ mouvementId: z.uuid() });

interface MouvementCible {
  readonly id: string;
  readonly entity_id: string;
  readonly statut: StatutMouvement;
  readonly justificatif_key: string | null;
}

/**
 * Le mouvement, sa portee, et l'etat qui decide si l'on peut encore y toucher.
 *
 * Les deux lectures sont INDEPENDANTES, donc simultanees (regle 28).
 */
async function contexte(mouvementId: string) {
  const sb = await createClient();

  const [mouvement, arbre] = await Promise.all([
    sb
      .from('finance_entries')
      .select('id, entity_id, statut, justificatif_key')
      .eq('id', mouvementId)
      .is('deleted_at', null)
      .maybeSingle<MouvementCible>(),
    getArbrePerimetre(),
  ]);

  if (mouvement.error || !mouvement.data) return null;

  const entite = arbre.find((e) => e.id === mouvement.data!.entity_id);
  return entite ? { mouvement: mouvement.data, portee: entite.path } : null;
}

/**
 * RG-17 — un mouvement valide est immuable, sa piece jointe comprise.
 *
 * Remplacer le justificatif d'une ecriture deja validee reviendrait a changer
 * ce qui la prouve sans changer ce qu'elle dit : la ligne resterait identique,
 * et le document qui la justifie serait un autre. C'est exactement ce que
 * l'immuabilite protege.
 */
const MESSAGE_FIGE =
  'Ce mouvement est valide : sa piece justificative ne peut plus etre changee. '
  + 'Annulez-le si le document etait faux — la ligne d\'origine restera visible.';

export async function televerserJustificatif(
  formulaire: FormData,
): Promise<ActionResult<{ justificatifKey: string }>> {
  return executerAction('televerserJustificatif', async () => {
    const session = await requireSession();

    const analyse = cibleSchema.safeParse({
      mouvementId: formulaire.get('mouvementId'),
    });
    if (!analyse.success) return ko('Requete invalide.');

    const fichier = formulaire.get('justificatif');
    if (!(fichier instanceof File) || fichier.size === 0) {
      return ko('Aucun fichier recu.');
    }

    const cible = await contexte(analyse.data.mouvementId);
    if (!cible) return ko('Ce mouvement est introuvable ou hors de votre perimetre.');

    if (!estModifiable(cible.mouvement.statut)) return ko(MESSAGE_FIGE);

    await requirePermission(session, 'finance.update', cible.portee);

    const octets = new Uint8Array(await fichier.arrayBuffer());

    const verdict = verifierFichier('justificatif', octets.slice(0, 16), octets.byteLength);
    if (!verdict.ok) return ko(verdict.error);

    const extension = verdict.data === 'application/pdf' ? 'pdf' : verdict.data.split('/')[1]!;
    const cle = construireCle('justificatifs', cible.mouvement.id, extension);

    /**
     * `upsert` ET une cle stable : remplacer un justificatif ne doit pas
     * laisser l'ancien derriere. Un changement d'extension — un PDF remplace
     * par une photo — produit toutefois une cle differente, d'ou le retrait
     * explicite de l'ancienne plus bas.
     */
    const depot = await storage().put(cle, octets, {
      contentType: verdict.data,
      upsert: true,
    });
    if (!depot.ok) return ko(depot.error);

    const sb = await createClient();
    const { error } = await sb
      .from('finance_entries')
      .update({ justificatif_key: depot.data })
      .eq('id', cible.mouvement.id);

    if (error) {
      // L'objet est depose mais le mouvement ne le reference pas : on le
      // retire plutot que de laisser un orphelin dans le stockage.
      await storage().delete(depot.data);
      return ko("La piece n'a pas pu etre rattachee au mouvement.");
    }

    const ancienne = cible.mouvement.justificatif_key;
    if (ancienne && ancienne !== depot.data) await storage().delete(ancienne);

    await auditer({
      session,
      action: 'UPDATE',
      table: 'finance_entries',
      recordId: cible.mouvement.id,
      entityId: cible.mouvement.entity_id,
      diff: { avant: { justificatif_key: ancienne }, apres: { justificatif_key: depot.data } },
    });

    revalidatePath('/finances');
    return ok({ justificatifKey: depot.data });
  });
}

export async function supprimerJustificatif(input: unknown): Promise<ActionResult<void>> {
  return executerAction('supprimerJustificatif', async () => {
    const session = await requireSession();

    const analyse = cibleSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    const cible = await contexte(analyse.data.mouvementId);
    if (!cible) return ko('Ce mouvement est introuvable ou hors de votre perimetre.');

    if (!estModifiable(cible.mouvement.statut)) return ko(MESSAGE_FIGE);

    await requirePermission(session, 'finance.update', cible.portee);

    const ancienne = cible.mouvement.justificatif_key;
    if (!ancienne) return ok();

    const sb = await createClient();
    const { error } = await sb
      .from('finance_entries')
      .update({ justificatif_key: null })
      .eq('id', cible.mouvement.id);

    if (error) return ko("La piece n'a pas pu etre detachee.");

    /**
     * La REFERENCE part avant l'objet, et c'est l'ordre qui compte.
     *
     * Si le retrait de l'objet echoue, il reste un fichier que plus rien ne
     * designe — invisible, et sans consequence. L'ordre inverse laisserait un
     * mouvement pointant vers un objet disparu : un lien mort a l'ecran, que
     * personne ne saurait reparer.
     */
    await storage().delete(ancienne);

    await auditer({
      session,
      action: 'UPDATE',
      table: 'finance_entries',
      recordId: cible.mouvement.id,
      entityId: cible.mouvement.entity_id,
      diff: { avant: { justificatif_key: ancienne }, apres: { justificatif_key: null } },
    });

    revalidatePath('/finances');
    return ok();
  });
}
