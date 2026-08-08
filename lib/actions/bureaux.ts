'use server';

import { revalidatePath } from 'next/cache';

import { listerCandidats, listerFonctions } from '@/lib/data/bureaux';
import { getArbrePerimetre } from '@/lib/data/entities';
import { aReconduire, memeBureau, validerDesignation } from '@/lib/domain/bureau';
import { nomComplet } from '@/lib/domain/croyant';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitize } from '@/lib/utils/sanitize';
import {
  cloreMandatSchema,
  designerMembreSchema,
  ouvrirMandatSchema,
  remplacerMembreSchema,
  retirerMembreSchema,
  supprimerBureauSchema,
} from '@/lib/validation/bureau';
import { champsEnErreur } from '@/lib/validation/zod-errors';

import { executerAction } from './executer';

/**
 * Bureaux et mandats — EF-BUR-01 a 09, RG-07 a RG-10.
 *
 * Les regles sont tenues a trois endroits, et ce n'est pas de la redondance :
 * le DOMAINE explique le refus a l'utilisateur, la RLS decide qui peut ecrire,
 * les CONTRAINTES et TRIGGERS garantissent l'etat de la base quoi qu'il
 * arrive. Retirer l'un des trois ne rend pas les deux autres suffisants.
 */

function messageErreurSql(erreur: { code?: string; message?: string }): string {
  // RG-08, RG-10 — index uniques partiels.
  if (erreur.code === '23505') {
    if (erreur.message?.includes('bureaux_un_actif_par_nom')) {
      return (
        'RG-10 : un bureau de ce nom est deja ouvert pour cette entite. ' +
        'Choisissez un autre nom, ou renouvelez le mandat existant.'
      );
    }
    if (erreur.message?.includes('membres_fonction_unique')) {
      return 'RG-08 : cette fonction est deja occupee. Remplacez son titulaire.';
    }
    if (erreur.message?.includes('membres_croyant_unique')) {
      return 'Ce croyant occupe deja une fonction dans ce bureau.';
    }
    return 'Cette valeur existe deja.';
  }
  // Les triggers RG-* levent avec un message deja redige pour l'utilisateur.
  if (erreur.message?.includes('RG-') || erreur.message?.includes('fonction')) {
    return erreur.message.split('\n')[0] ?? 'Operation refusee.';
  }
  return "L'operation n'a pas pu aboutir.";
}

/** Le bureau, son entite et le chemin qui porte la portee du droit (RG-25). */
async function contexteBureau(bureauId: string) {
  const sb = await createClient();

  const { data, error } = await sb
    .from('bureaux')
    .select('id, entity_id, libelle, is_active, entite:entities!bureaux_entity_id_fkey (path, nom, type)')
    .eq('id', bureauId)
    .is('deleted_at', null)
    .maybeSingle<{
      id: string;
      entity_id: string;
      libelle: string;
      is_active: boolean;
      entite: { path: string; nom: string; type: string } | null;
    }>();

  return error || !data?.entite ? null : data;
}

// -----------------------------------------------------------------------------

export async function ouvrirMandat(input: unknown): Promise<ActionResult<{ id: string }>> {
  return executerAction('ouvrirMandat', async () => {
    const session = await requireSession();

    const analyse = ouvrirMandatSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const arbre = await getArbrePerimetre();
    if (arbre.length === 0) {
      return ko("La structure n'a pas pu etre chargee. Verifiez votre connexion.");
    }

    const entite = arbre.find((e) => e.id === data.entityId);
    if (!entite) return ko('Cette entite est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'bureau.manage', entite.path);

    const sb = await createClient();

    /**
     * RG-10 — on ne clot QUE le mandat du MEME bureau.
     *
     * Une entite fait coexister un « Bureau executif », un « Comite des
     * finances », une « Commission des jeunes » : ouvrir le second ne doit pas
     * demettre le premier. La premiere version fermait tout bureau actif de
     * l'entite — c'etait la traduction d'un RG-10 mal redige.
     *
     * Ouvrir un bureau du meme nom, en revanche, est un RENOUVELLEMENT : le
     * mandat precedent se clot, et sa composition peut etre reconduite.
     */
    const { data: bureauxActifsEntite } = await sb
      .from('bureaux')
      .select(
        'id, libelle, bureau_membres!bureau_membres_bureau_id_fkey (id, croyant_id, fonction_id, date_fin)',
      )
      .eq('entity_id', data.entityId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .returns<
        {
          id: string;
          libelle: string;
          bureau_membres: {
            id: string;
            croyant_id: string;
            fonction_id: string;
            date_fin: string | null;
          }[];
        }[]
      >();

    const precedent =
      (bureauxActifsEntite ?? []).find((b) => memeBureau(b.libelle, data.libelle)) ?? null;

    if (precedent) {
      const veille = new Date(data.dateDebut);
      veille.setDate(veille.getDate() - 1);

      await sb
        .from('bureaux')
        .update({ is_active: false, date_fin: veille.toISOString().slice(0, 10) })
        .eq('id', precedent.id);

      // Les mandats individuels suivent le mandat du bureau.
      await sb
        .from('bureau_membres')
        .update({ date_fin: veille.toISOString().slice(0, 10) })
        .eq('bureau_id', precedent.id)
        .is('date_fin', null);
    }

    const { data: cree, error } = await sb
      .from('bureaux')
      .insert({
        entity_id: data.entityId,
        libelle: sanitize(data.libelle),
        date_debut: data.dateDebut.toISOString().slice(0, 10),
        date_fin: data.dateFin ? data.dateFin.toISOString().slice(0, 10) : null,
        created_by: session.profileId,
      })
      .select('id')
      .single<{ id: string }>();

    if (error) return ko(messageErreurSql(error));

    // EF-BUR-09 — reconduction : seuls les mandats EN COURS a la cloture sont
    // repris. Reprendre les mandats deja clos ressusciterait des titulaires
    // remplaces en cours de route.
    if (data.reconduire && precedent) {
      const repris = aReconduire(
        precedent.bureau_membres.map((m) => ({
          id: m.id,
          croyantId: m.croyant_id,
          fonctionId: m.fonction_id,
          dateDebut: '',
          // La cloture vient d'etre ecrite : on raisonne sur l'etat d'AVANT.
          dateFin: null,
        })),
      );

      if (repris.length > 0) {
        await sb.from('bureau_membres').insert(
          repris.map((m) => ({
            bureau_id: cree.id,
            croyant_id: m.croyantId,
            fonction_id: m.fonctionId,
            date_debut: data.dateDebut.toISOString().slice(0, 10),
            created_by: session.profileId,
          })),
        );
      }
    }

    await auditer({
      session,
      action: 'CREATE',
      table: 'bureaux',
      recordId: cree.id,
      entityId: data.entityId,
      diff: {
        apres: { libelle: data.libelle, debut: data.dateDebut.toISOString().slice(0, 10) },
        avant: precedent ? { bureauClos: precedent.id } : undefined,
      },
    });

    revalidatePath('/bureaux');
    revalidatePath(`/structure/${data.entityId}`);
    return ok(cree);
  });
}

// -----------------------------------------------------------------------------

export async function cloreMandat(input: unknown): Promise<ActionResult<void>> {
  return executerAction('cloreMandat', async () => {
    const session = await requireSession();

    const analyse = cloreMandatSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }

    const contexte = await contexteBureau(analyse.data.bureauId);
    if (!contexte) return ko('Ce bureau est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'bureau.manage', contexte.entite!.path);

    const jour = analyse.data.dateFin.toISOString().slice(0, 10);
    const sb = await createClient();

    const { error } = await sb
      .from('bureaux')
      .update({ is_active: false, date_fin: jour })
      .eq('id', contexte.id);

    if (error) return ko(messageErreurSql(error));

    // Les mandats individuels ne survivent pas au mandat du bureau.
    await sb
      .from('bureau_membres')
      .update({ date_fin: jour })
      .eq('bureau_id', contexte.id)
      .is('date_fin', null);

    await auditer({
      session,
      action: 'UPDATE',
      table: 'bureaux',
      recordId: contexte.id,
      entityId: contexte.entity_id,
      diff: { apres: { statut: 'clos', date_fin: jour } },
    });

    revalidatePath('/bureaux');
    return ok();
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-BUR-08 — SUPPRESSION d'un bureau, a distinguer de la cloture.
 *
 * Clore conserve : l'historique reste lisible sur la fiche de chaque ancien
 * titulaire. Supprimer efface — les mandats individuels partent en cascade et
 * les fonctions occupees disparaissent des frises. C'est pourquoi l'operation
 * exige `bureau.delete`, un droit distinct et non delegable.
 */
export async function supprimerBureau(input: unknown): Promise<ActionResult<void>> {
  return executerAction('supprimerBureau', async () => {
    const session = await requireSession();

    const analyse = supprimerBureauSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    const contexte = await contexteBureau(analyse.data.bureauId);
    if (!contexte) return ko('Ce bureau est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'bureau.delete', contexte.entite!.path);

    const sb = await createClient();

    // L'audit est ecrit AVANT la suppression : apres, il n'y aurait plus rien
    // a decrire, et c'est precisement le genre d'operation dont on veut
    // retrouver la trace.
    const { count } = await sb
      .from('bureau_membres')
      .select('id', { count: 'exact', head: true })
      .eq('bureau_id', contexte.id);

    await auditer({
      session,
      action: 'DELETE',
      table: 'bureaux',
      recordId: contexte.id,
      entityId: contexte.entity_id,
      diff: {
        avant: {
          libelle: contexte.libelle,
          mandatsIndividuelsEffaces: count ?? 0,
        },
      },
    });

    const { error } = await sb.from('bureaux').delete().eq('id', contexte.id);
    if (error) return ko(messageErreurSql(error));

    revalidatePath('/bureaux');
    revalidatePath('/croyants');
    return ok();
  });
}

// -----------------------------------------------------------------------------

export async function designerMembre(input: unknown): Promise<ActionResult<void>> {
  return executerAction('designerMembre', async () => {
    const session = await requireSession();

    const analyse = designerMembreSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const contexte = await contexteBureau(data.bureauId);
    if (!contexte) return ko('Ce bureau est introuvable ou hors de votre perimetre.');
    if (!contexte.is_active) return ko('Ce mandat est clos : sa composition ne change plus.');

    await requirePermission(session, 'bureau.manage', contexte.entite!.path);

    const [fonctions, candidats] = await Promise.all([listerFonctions(), listerCandidats()]);

    const fonction = fonctions.find((f) => f.id === data.fonctionId);
    const croyant = candidats.find((c) => c.id === data.croyantId);

    if (!fonction) return ko('Cette fonction est introuvable.');
    if (!croyant?.eglise) return ko('Ce croyant est introuvable ou hors de votre perimetre.');

    const sb = await createClient();
    const { data: enCours } = await sb
      .from('bureau_membres')
      .select('id, croyant_id, fonction_id, date_debut, date_fin')
      .eq('bureau_id', data.bureauId)
      .is('date_fin', null)
      .returns<
        { id: string; croyant_id: string; fonction_id: string; date_debut: string; date_fin: null }[]
      >();

    // Le domaine explique le refus AVANT que la contrainte SQL ne le prononce :
    // « RG-08 : cette fonction est deja occupee » vaut mieux qu'une violation
    // d'index unique.
    const verdict = validerDesignation(
      {
        croyantId: croyant.id,
        nom: nomComplet(croyant.nom, croyant.prenom),
        cheminEglise: croyant.eglise.path,
        statut: croyant.statut,
      },
      fonction,
      contexte.entite!.path,
      contexte.entite!.type as Parameters<typeof validerDesignation>[3],
      (enCours ?? []).map((m) => ({
        id: m.id,
        croyantId: m.croyant_id,
        fonctionId: m.fonction_id,
        dateDebut: m.date_debut,
        dateFin: null,
      })),
    );
    if (!verdict.ok) return ko(verdict.error);

    const { error } = await sb.from('bureau_membres').insert({
      bureau_id: data.bureauId,
      croyant_id: data.croyantId,
      fonction_id: data.fonctionId,
      notes: data.notes ? sanitize(data.notes) : null,
      created_by: session.profileId,
    });

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'CREATE',
      table: 'bureau_membres',
      recordId: data.bureauId,
      entityId: contexte.entity_id,
      diff: {
        apres: {
          croyant: nomComplet(croyant.nom, croyant.prenom),
          fonction: fonction.libelle,
        },
      },
    });

    revalidatePath('/bureaux');
    revalidatePath(`/croyants/${data.croyantId}`);
    return ok();
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-BUR-08 — remplacement : cloture du mandat individuel ET designation du
 * suivant. Les separer laisserait la fonction vacante entre les deux, et un
 * remplacement interrompu ressemblerait a un retrait.
 */
export async function remplacerMembre(input: unknown): Promise<ActionResult<void>> {
  return executerAction('remplacerMembre', async () => {
    const session = await requireSession();

    const analyse = remplacerMembreSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const sb = await createClient();
    const { data: membre } = await sb
      .from('bureau_membres')
      .select('id, bureau_id, croyant_id, fonction_id, date_fin')
      .eq('id', data.membreId)
      .maybeSingle<{
        id: string;
        bureau_id: string;
        croyant_id: string;
        fonction_id: string;
        date_fin: string | null;
      }>();

    if (!membre) return ko('Ce mandat est introuvable.');
    if (membre.date_fin) return ko('Ce mandat est deja clos.');

    const contexte = await contexteBureau(membre.bureau_id);
    if (!contexte) return ko('Ce bureau est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'bureau.manage', contexte.entite!.path);

    const jour = new Date().toISOString().slice(0, 10);

    const { error: erreurCloture } = await sb
      .from('bureau_membres')
      .update({ date_fin: jour })
      .eq('id', membre.id);

    if (erreurCloture) return ko(messageErreurSql(erreurCloture));

    const { error } = await sb.from('bureau_membres').insert({
      bureau_id: membre.bureau_id,
      croyant_id: data.croyantId,
      fonction_id: membre.fonction_id,
      date_debut: jour,
      notes: data.notes ? sanitize(data.notes) : null,
      created_by: session.profileId,
    });

    if (error) {
      // La designation a echoue : on rouvre le mandat precedent plutot que de
      // laisser la fonction vacante sans que personne ne l'ait voulu.
      await sb.from('bureau_membres').update({ date_fin: null }).eq('id', membre.id);
      return ko(messageErreurSql(error));
    }

    await auditer({
      session,
      action: 'UPDATE',
      table: 'bureau_membres',
      recordId: membre.bureau_id,
      entityId: contexte.entity_id,
      diff: { avant: { croyant: membre.croyant_id }, apres: { croyant: data.croyantId } },
    });

    revalidatePath('/bureaux');
    revalidatePath(`/croyants/${membre.croyant_id}`);
    revalidatePath(`/croyants/${data.croyantId}`);
    return ok();
  });
}

// -----------------------------------------------------------------------------

/** Retrait : le mandat individuel se CLOT, il ne s'efface pas (EF-BUR-08). */
export async function retirerMembre(input: unknown): Promise<ActionResult<void>> {
  return executerAction('retirerMembre', async () => {
    const session = await requireSession();

    const analyse = retirerMembreSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    const sb = await createClient();
    const { data: membre } = await sb
      .from('bureau_membres')
      .select('id, bureau_id, croyant_id, date_fin')
      .eq('id', analyse.data.membreId)
      .maybeSingle<{ id: string; bureau_id: string; croyant_id: string; date_fin: string | null }>();

    if (!membre) return ko('Ce mandat est introuvable.');
    if (membre.date_fin) return ko('Ce mandat est deja clos.');

    const contexte = await contexteBureau(membre.bureau_id);
    if (!contexte) return ko('Ce bureau est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'bureau.manage', contexte.entite!.path);

    const { error } = await sb
      .from('bureau_membres')
      .update({ date_fin: new Date().toISOString().slice(0, 10) })
      .eq('id', membre.id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'bureau_membres',
      recordId: membre.bureau_id,
      entityId: contexte.entity_id,
      diff: { avant: { croyant: membre.croyant_id }, apres: { mandat: 'clos' } },
    });

    revalidatePath('/bureaux');
    revalidatePath(`/croyants/${membre.croyant_id}`);
    return ok();
  });
}
