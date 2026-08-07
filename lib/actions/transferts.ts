'use server';

import { revalidatePath } from 'next/cache';

import { getCroyant } from '@/lib/data/croyants';
import { getArbrePerimetre } from '@/lib/data/entities';
import { getParametres } from '@/lib/data/settings';
import { nomComplet } from '@/lib/domain/croyant';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import {
  PERMISSION_APPROBATION,
  autoApprobationPossible,
  niveauDeTransfert,
  validerDemandeTransfert,
} from '@/lib/domain/transfert';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitize } from '@/lib/utils/sanitize';
import {
  annulerTransfertSchema,
  approuverTransfertSchema,
  demanderTransfertSchema,
  refuserTransfertSchema,
} from '@/lib/validation/transfert';
import { champsEnErreur } from '@/lib/validation/zod-errors';

import { executerAction } from './executer';

/**
 * Workflow d'approbation des transferts — EF-TRF-01 a 10, ARB-4.
 *
 * RG-11 : aucun rattachement ne bouge avant approbation. Le deplacement lui-meme
 * est confie a `fn_appliquer_transfert`, en base : deux appels HTTP successifs
 * ne forment pas une transaction, et une coupure entre eux laisserait un
 * croyant deplace sans trace, ou un transfert clos sans effet.
 *
 * RG-12 : l'approbateur couvre le plus petit ancetre commun des deux entites.
 * La regle est verifiee ici pour le message, dans la RLS pour l'ecriture, et
 * dans la fonction d'application parce qu'elle y met la RLS de cote.
 */

function messageErreurSql(erreur: { code?: string; message?: string }): string {
  if (erreur.code === '23514' || erreur.message?.includes('RG-')) {
    return erreur.message?.split('\n')[0] ?? 'Operation refusee.';
  }
  if (erreur.code === '42501') {
    return "Votre perimetre ne couvre pas ce transfert : vous ne pouvez pas le decider (RG-12).";
  }
  return "L'operation n'a pas pu aboutir.";
}

// -----------------------------------------------------------------------------

export async function demanderTransfert(
  input: unknown,
): Promise<ActionResult<{ id: string; autoApprouve: boolean }>> {
  return executerAction('demanderTransfert', async () => {
    const session = await requireSession();

    const analyse = demanderTransfertSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const croyant = await getCroyant(data.croyantId);
    if (!croyant) return ko('Ce croyant est introuvable ou hors de votre perimetre.');

    const arbre = await getArbrePerimetre();
    const origine = arbre.find((e) => e.id === croyant.eglise_id);
    const destination = arbre.find((e) => e.id === data.toEgliseId);

    if (!origine) return ko("L'eglise actuelle du croyant est hors de votre perimetre.");
    if (!destination || destination.type !== 'EGLISE') {
      return ko("L'eglise de destination est introuvable ou n'est pas une Eglise.");
    }

    // EF-TRF-01 — demander un transfert, c'est agir sur l'ORIGINE : c'est elle
    // qui perd le croyant. Le droit s'evalue donc sur son chemin.
    await requirePermission(session, 'croyant.transfer', origine.path);

    const cellule = data.toCelluleId
      ? arbre.find((e) => e.id === data.toCelluleId)
      : undefined;
    if (data.toCelluleId && !cellule) return ko('Cette cellule est introuvable.');

    const verdict = validerDemandeTransfert(
      {
        egliseId: croyant.eglise_id,
        cheminEglise: origine.path,
        celluleId: croyant.cellule_id,
      },
      {
        egliseId: destination.id,
        cheminEglise: destination.path,
        celluleId: data.toCelluleId ?? null,
      },
      cellule?.path ?? null,
    );
    if (!verdict.ok) return ko(verdict.error);

    const parametres = await getParametres();

    // EF-TRF-05 — trois conditions cumulatives, toutes portees par le domaine.
    const auto = autoApprobationPossible(
      session,
      origine.path,
      destination.path,
      parametres.transfert_auto_approbation_interne,
    );

    const sb = await createClient();
    const { data: cree, error } = await sb
      .from('transferts')
      .insert({
        croyant_id: croyant.id,
        // Deduit du point de divergence des deux chemins : l'utilisateur n'a
        // pas a qualifier son geste, il le ferait de travers.
        niveau_transfert: niveauDeTransfert(
          origine.path,
          destination.path,
          (croyant.cellule_id ?? null) !== (data.toCelluleId ?? null),
        ),
        from_eglise_id: croyant.eglise_id,
        to_eglise_id: destination.id,
        from_cellule_id: croyant.cellule_id,
        to_cellule_id: data.toCelluleId ?? null,
        motif: sanitize(data.motif),
        demande_par: session.profileId,
        // `statut` et `ancetre_commun_id` sont poses par le trigger : un
        // transfert nait toujours a l'etat « demande » (RG-11).
      })
      .select('id')
      .single<{ id: string }>();

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'CREATE',
      table: 'transferts',
      recordId: cree.id,
      entityId: origine.id,
      diff: {
        apres: {
          croyant: nomComplet(croyant.nom, croyant.prenom),
          de: origine.nom,
          vers: destination.nom,
        },
      },
    });

    // EF-TRF-05 — l'auto-approbation enchaine les deux etapes SANS raccourcir
    // la tracabilite : les memes ecritures d'audit sont produites, seule
    // l'attente disparait.
    if (auto) {
      const suite = await deciderEtAppliquer(cree.id, session, origine.id);
      if (!suite.ok) {
        // La demande existe et reste decidable a la main : mieux vaut une file
        // d'attente qu'un transfert perdu.
        return ok({ id: cree.id, autoApprouve: false });
      }
    }

    revalidatePath('/transferts');
    revalidatePath('/croyants');
    revalidatePath(`/croyants/${croyant.id}`);
    return ok({ id: cree.id, autoApprouve: auto });
  });
}

// -----------------------------------------------------------------------------

/** Approbation puis application, dans cet ordre — RG-11. */
async function deciderEtAppliquer(
  id: string,
  session: Awaited<ReturnType<typeof requireSession>>,
  entityId: string,
): Promise<ActionResult<void>> {
  const sb = await createClient();

  const { error: erreurDecision } = await sb
    .from('transferts')
    .update({ statut: 'APPROUVE', decide_par: session.profileId })
    .eq('id', id)
    .eq('statut', 'DEMANDE'); // garde-fou contre une double decision

  if (erreurDecision) return ko(messageErreurSql(erreurDecision));

  // Le deplacement est atomique et revalide RG-11 et RG-12 en base.
  const { error: erreurApplication } = await sb.rpc('fn_appliquer_transfert', {
    p_transfert: id,
  });

  if (erreurApplication) return ko(messageErreurSql(erreurApplication));

  await auditer({
    session,
    action: 'UPDATE',
    table: 'transferts',
    recordId: id,
    entityId,
    diff: { apres: { statut: 'EFFECTUE' } },
  });

  return ok();
}

export async function approuverTransfert(input: unknown): Promise<ActionResult<void>> {
  return executerAction('approuverTransfert', async () => {
    const session = await requireSession();

    const analyse = approuverTransfertSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    const transfert = await lireTransfert(analyse.data.id);
    if (!transfert) return ko('Ce transfert est introuvable ou hors de votre perimetre.');

    // RG-12 — la competence se juge sur l'ancetre commun FIGE a la demande,
    // pas sur l'une des deux entites : sans cela, un district pourrait aspirer
    // les croyants d'un district voisin.
    if (!transfert.arbitre) {
      return ko("L'arbitre de ce transfert n'a pas pu etre determine.");
    }
    await requirePermission(session, PERMISSION_APPROBATION, transfert.arbitre.path);

    const resultat = await deciderEtAppliquer(
      transfert.id,
      session,
      transfert.to_eglise_id,
    );
    if (!resultat.ok) return resultat;

    revalidatePath('/transferts');
    revalidatePath('/croyants');
    revalidatePath(`/croyants/${transfert.croyant_id}`);
    return ok();
  });
}

// -----------------------------------------------------------------------------

export async function refuserTransfert(input: unknown): Promise<ActionResult<void>> {
  return executerAction('refuserTransfert', async () => {
    const session = await requireSession();

    const analyse = refuserTransfertSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }

    const transfert = await lireTransfert(analyse.data.id);
    if (!transfert) return ko('Ce transfert est introuvable ou hors de votre perimetre.');
    if (!transfert.arbitre) {
      return ko("L'arbitre de ce transfert n'a pas pu etre determine.");
    }

    await requirePermission(session, PERMISSION_APPROBATION, transfert.arbitre.path);

    const sb = await createClient();
    const { error } = await sb
      .from('transferts')
      .update({
        statut: 'REFUSE',
        motif_refus: sanitize(analyse.data.motifRefus),
        decide_par: session.profileId,
      })
      .eq('id', transfert.id)
      .eq('statut', 'DEMANDE');

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'transferts',
      recordId: transfert.id,
      entityId: transfert.to_eglise_id,
      diff: { apres: { statut: 'REFUSE', motif: analyse.data.motifRefus } },
    });

    revalidatePath('/transferts');
    revalidatePath(`/croyants/${transfert.croyant_id}`);
    return ok();
  });
}

// -----------------------------------------------------------------------------

/** EF-TRF-10 — le demandeur retire sa demande tant qu'elle n'est pas tranchee. */
export async function annulerTransfert(input: unknown): Promise<ActionResult<void>> {
  return executerAction('annulerTransfert', async () => {
    const session = await requireSession();

    const analyse = annulerTransfertSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    const transfert = await lireTransfert(analyse.data.id);
    if (!transfert) return ko('Ce transfert est introuvable ou hors de votre perimetre.');

    const sb = await createClient();
    // La RLS tranche qui a le droit : le demandeur, ou un approbateur competent.
    // La repeter ici la ferait diverger.
    const { error } = await sb
      .from('transferts')
      .update({ statut: 'ANNULE', decide_par: session.profileId })
      .eq('id', transfert.id)
      .eq('statut', 'DEMANDE');

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'transferts',
      recordId: transfert.id,
      entityId: transfert.to_eglise_id,
      diff: { apres: { statut: 'ANNULE' } },
    });

    revalidatePath('/transferts');
    revalidatePath(`/croyants/${transfert.croyant_id}`);
    return ok();
  });
}

// -----------------------------------------------------------------------------

interface TransfertDecidable {
  id: string;
  croyant_id: string;
  statut: string;
  to_eglise_id: string;
  arbitre: { id: string; path: string } | null;
}

async function lireTransfert(id: string): Promise<TransfertDecidable | null> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('transferts')
    .select(
      'id, croyant_id, statut, to_eglise_id, arbitre:entities!transferts_ancetre_commun_id_fkey (id, path)',
    )
    .eq('id', id)
    .maybeSingle<TransfertDecidable>();

  return error ? null : data;
}
