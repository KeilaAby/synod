'use server';

import { revalidatePath } from 'next/cache';

import { getArbrePerimetre } from '@/lib/data/entities';
import { getParametres } from '@/lib/data/settings';
import { peutValider, transitionAutorisee } from '@/lib/domain/finance';
import { peut } from '@/lib/domain/permissions';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitize } from '@/lib/utils/sanitize';
import {
  changerStatutSchema,
  modifierMouvementSchema,
  reglerWorkflowSchema,
  saisirMouvementSchema,
  supprimerMouvementSchema,
} from '@/lib/validation/finance';
import { champsEnErreur } from '@/lib/validation/zod-errors';

import { executerAction } from './executer';

/**
 * Mouvements financiers — EF-FIN-01 a 20.
 *
 * CE QUE CE FICHIER NE FAIT PAS, ET POURQUOI
 *
 * Il ne calcule pas le sens (RG-13) : le trigger le prend dans la categorie.
 * Il ne force pas le statut d'entree (RG-16) : le trigger le fait, entite par
 * entite. Il ne verifie pas l'immuabilite d'un mouvement valide (RG-17) : la
 * base la refuse, y compris a un appel direct.
 *
 * Ce qu'il fait, lui seul : EXPLIQUER. Une exception SQL dit
 * « RG-17 : un mouvement valide est immuable » a qui lit les journaux ; ici on
 * le dit a qui a clique.
 */

function messageErreurSql(erreur: { code?: string; message?: string }): string {
  if (erreur.code === '23503') {
    return "L'entite ou la categorie indiquee est introuvable.";
  }
  if (erreur.code === '23514') {
    return 'Le montant, la date ou le motif ne respecte pas les regles de saisie.';
  }
  // Les exceptions du trigger portent deja un message destine a l'utilisateur.
  if (erreur.message?.includes('RG-') || erreur.message?.includes('Transition')) {
    return erreur.message.split('\n')[0] ?? 'Operation refusee.';
  }
  return "L'operation n'a pas pu aboutir.";
}

/**
 * Le chemin ltree de l'entite visee, dans le PERIMETRE de l'appelant.
 *
 * Passer par l'arbre du perimetre plutot que par une lecture directe fait d'une
 * pierre deux coups : l'entite hors perimetre est « introuvable », et l'on ne
 * distingue pas volontairement l'inexistant de l'inaccessible — dire « elle
 * existe mais vous n'y avez pas droit » renseigne sur une structure qu'on n'a
 * pas a connaitre.
 */
async function cheminDe(
  entiteId: string,
): Promise<{ chemin: string; nom: string } | null> {
  const arbre = await getArbrePerimetre();

  // Une absence de donnees n'est pas un refus de droit (regle 15) : l'appelant
  // distingue les deux cas par le `null` et la taille de l'arbre.
  if (arbre.length === 0) return null;

  const entite = arbre.find((e) => e.id === entiteId);
  return entite ? { chemin: entite.path, nom: entite.nom } : null;
}

const MESSAGE_STRUCTURE_ILLISIBLE =
  "La structure n'a pas pu etre chargee. Verifiez votre connexion, puis reessayez.";

// -----------------------------------------------------------------------------
// Saisie — EF-FIN-01 a 05
// -----------------------------------------------------------------------------

export async function saisirMouvement(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return executerAction('saisirMouvement', async () => {
    const session = await requireSession();

    const analyse = saisirMouvementSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const arbre = await getArbrePerimetre();
    if (arbre.length === 0) return ko(MESSAGE_STRUCTURE_ILLISIBLE);

    const entite = arbre.find((e) => e.id === data.entiteId);
    if (!entite) {
      return ko('Cette entite est introuvable ou hors de votre perimetre.');
    }

    /**
     * EF-FIN-05 — la saisie DELEGUEE est un autre droit, pas une option.
     *
     * Cocher la case ne suffit pas : sans `finance.delegate` sur l'entite
     * beneficiaire, la demande est refusee. Sinon n'importe quel compte
     * signerait ses ecritures du nom d'une autre entite.
     */
    if (data.estDelegue) {
      await requirePermission(session, 'finance.delegate', entite.path);
    } else {
      await requirePermission(session, 'finance.create', entite.path);
    }

    const sb = await createClient();

    const { data: cree, error } = await sb
      .from('finance_entries')
      .insert({
        entity_id: data.entiteId,
        categorie_id: data.categorieId,
        montant: data.montant,
        date_operation: data.dateOperation.toISOString().slice(0, 10),
        libelle: data.libelle ? sanitize(data.libelle) : null,
        reference: data.reference ? sanitize(data.reference) : null,
        est_delegue: data.estDelegue,
        saisi_par: session.profileId,
        saisi_depuis_entity_id: session.entityId,
        // `sens`, `periode` et `statut` sont poses par le trigger : le sens
        // vient de la categorie (RG-13), le statut du workflow de l'entite
        // (RG-16). Les envoyer d'ici les mettrait en concurrence.
      })
      .select('id, statut')
      .single<{ id: string; statut: string }>();

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'CREATE',
      table: 'finance_entries',
      recordId: cree.id,
      entityId: data.entiteId,
      diff: {
        apres: {
          montant: data.montant,
          date: data.dateOperation.toISOString().slice(0, 10),
          statut: cree.statut,
          delegue: data.estDelegue,
        },
      },
    });

    revalidatePath('/finances');
    revalidatePath('/tableau-de-bord');

    return ok({ id: cree.id });
  });
}

// -----------------------------------------------------------------------------
// Modification — EF-FIN-01, RG-17
// -----------------------------------------------------------------------------

export async function modifierMouvement(input: unknown): Promise<ActionResult<void>> {
  return executerAction('modifierMouvement', async () => {
    const session = await requireSession();

    const analyse = modifierMouvementSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const cible = await cheminDe(data.entiteId);
    if (!cible) return ko('Cette entite est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'finance.update', cible.chemin);

    const sb = await createClient();

    /**
     * On n'ecrit QUE les champs dont le formulaire est la source (regle 19).
     *
     * `statut`, `soumis_par`, `valide_par` n'y figurent pas : les inclure les
     * ecraserait a `null` a chaque enregistrement, et un mouvement valide
     * redeviendrait un brouillon sans que personne l'ait demande.
     */
    const { error } = await sb
      .from('finance_entries')
      .update({
        entity_id: data.entiteId,
        categorie_id: data.categorieId,
        montant: data.montant,
        date_operation: data.dateOperation.toISOString().slice(0, 10),
        libelle: data.libelle ? sanitize(data.libelle) : null,
        reference: data.reference ? sanitize(data.reference) : null,
      })
      .eq('id', data.id)
      .is('deleted_at', null);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'finance_entries',
      recordId: data.id,
      entityId: data.entiteId,
      diff: { apres: { montant: data.montant, categorie: data.categorieId } },
    });

    revalidatePath('/finances');
    revalidatePath('/tableau-de-bord');
    return ok();
  });
}

// -----------------------------------------------------------------------------
// Workflow — EF-FIN-14 a 20
// -----------------------------------------------------------------------------

/**
 * Le droit qu'exige CHAQUE transition.
 *
 * Soumettre n'est pas valider, et rejeter est un acte de validation : c'est le
 * meme pouvoir, exerce dans l'autre sens. Les confondre laisserait celui qui
 * saisit refuser sa propre ecriture pour la soustraire au controle.
 */
const DROIT_PAR_STATUT = {
  SOUMIS: 'finance.submit',
  VALIDE: 'finance.validate',
  REJETE: 'finance.validate',
  ANNULE: 'finance.validate',
  BROUILLON: 'finance.update',
} as const;

export async function changerStatutMouvement(
  input: unknown,
): Promise<ActionResult<void>> {
  return executerAction('changerStatutMouvement', async () => {
    const session = await requireSession();

    const analyse = changerStatutSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Demande invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const sb = await createClient();

    // La lecture du mouvement et celle des parametres sont INDEPENDANTES.
    const [courant, parametres] = await Promise.all([
      sb
        .from('finance_entries')
        .select('id, entity_id, statut, soumis_par, saisi_par, montant')
        .eq('id', data.id)
        .is('deleted_at', null)
        .maybeSingle<{
          id: string;
          entity_id: string;
          statut: 'BROUILLON' | 'SOUMIS' | 'VALIDE' | 'REJETE' | 'ANNULE';
          soumis_par: string | null;
          saisi_par: string | null;
          montant: number;
        }>(),
      getParametres(),
    ]);

    if (courant.error || !courant.data) {
      return ko('Ce mouvement est introuvable ou hors de votre perimetre.');
    }
    const mouvement = courant.data;

    // La transition est verifiee ICI pour l'EXPLIQUER, et par le trigger pour
    // l'empecher. Le message nomme les deux etats plutot que de dire « refuse ».
    if (!transitionAutorisee(mouvement.statut, data.statut)) {
      return ko(
        `Un mouvement « ${mouvement.statut.toLocaleLowerCase('fr')} » ne peut pas passer ` +
          `a « ${data.statut.toLocaleLowerCase('fr')} ».`,
      );
    }

    const cible = await cheminDe(mouvement.entity_id);
    if (!cible) return ko(MESSAGE_STRUCTURE_ILLISIBLE);

    await requirePermission(session, DROIT_PAR_STATUT[data.statut], cible.chemin);

    /**
     * EF-FIN-18 — la separation saisie/validation.
     *
     * Elle ne vaut que pour la VALIDATION : rejeter ou annuler sa propre saisie
     * ne pose pas le probleme que la regle vise — on ne se donne pas un blanc
     * seing en refusant sa propre ecriture.
     */
    if (data.statut === 'VALIDE') {
      const verdict = peutValider(mouvement, session.profileId, {
        separationActive: parametres.separation_saisie_validation,
        /**
         * Le double role s'evalue AVEC SA PORTEE, comme tout droit (regle 3).
         *
         * Le detenir pour son eglise ne doit pas dispenser de la separation
         * dans la paroisse voisine : `peut()` verifie que la portee de
         * l'octroi couvre l'entite du mouvement, la ou `detient()` se serait
         * contente de la cle.
         */
        detientDoubleRole: peut(session, 'finance.validate_own', cible.chemin),
      });
      if (!verdict.autorise) return ko(verdict.motif ?? 'Validation refusee.');
    }

    const majuscule = {
      statut: data.statut,
      ...(data.statut === 'SOUMIS' ? { soumis_par: session.profileId } : {}),
      ...(data.statut === 'VALIDE' ? { valide_par: session.profileId } : {}),
      ...(data.statut === 'REJETE' ? { motif_rejet: sanitize(data.motif ?? '') } : {}),
      ...(data.statut === 'ANNULE'
        ? { motif_annulation: sanitize(data.motif ?? '') }
        : {}),
    };

    const { error } = await sb
      .from('finance_entries')
      .update(majuscule)
      .eq('id', data.id)
      .is('deleted_at', null);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'finance_entries',
      recordId: data.id,
      entityId: mouvement.entity_id,
      diff: {
        avant: { statut: mouvement.statut },
        apres: { statut: data.statut, motif: data.motif },
      },
    });

    revalidatePath('/finances');
    revalidatePath('/tableau-de-bord');
    return ok();
  });
}

// -----------------------------------------------------------------------------
// Suppression logique — RG-22
// -----------------------------------------------------------------------------

export async function supprimerMouvement(input: unknown): Promise<ActionResult<void>> {
  return executerAction('supprimerMouvement', async () => {
    const session = await requireSession();

    const analyse = supprimerMouvementSchema.safeParse(input);
    if (!analyse.success) return ko('Demande invalide.');

    const sb = await createClient();

    const { data: mouvement, error: erreurLecture } = await sb
      .from('finance_entries')
      .select('id, entity_id, statut')
      .eq('id', analyse.data.id)
      .is('deleted_at', null)
      .maybeSingle<{ id: string; entity_id: string; statut: string }>();

    if (erreurLecture || !mouvement) return ko('Ce mouvement est introuvable.');

    /**
     * RG-17 / EF-FIN-20 — un mouvement VALIDE ne se supprime pas.
     *
     * Il a compte dans un solde publie. Le retirer de la liste effacerait la
     * trace sans corriger l'histoire : c'est l'annulation motivee qui le fait,
     * et elle laisse la ligne d'origine lisible.
     */
    if (mouvement.statut === 'VALIDE') {
      return ko(
        'Ce mouvement est valide : il a deja compte dans un solde. Utilisez ' +
          "l'annulation motivee, qui conserve la trace de l'operation.",
      );
    }

    const cible = await cheminDe(mouvement.entity_id);
    if (!cible) return ko(MESSAGE_STRUCTURE_ILLISIBLE);

    await requirePermission(session, 'finance.update', cible.chemin);

    const { error } = await sb
      .from('finance_entries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', mouvement.id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'DELETE',
      table: 'finance_entries',
      recordId: mouvement.id,
      entityId: mouvement.entity_id,
      diff: { avant: { statut: mouvement.statut } },
    });

    revalidatePath('/finances');
    return ok();
  });
}

// -----------------------------------------------------------------------------
// Reglage du workflow, entite par entite — EF-FIN-15 (adapte)
// -----------------------------------------------------------------------------

/**
 * Active ou desactive le workflow POUR UNE ENTITE.
 *
 * `null` remet l'entite sur le DEFAUT DE L'ORGANISATION — pas sur son parent.
 * Chaque entite a son bureau, et chaque bureau gere ses finances ; la
 * hierarchie ne fait que les consulter (12 aout 2026).
 *
 * Le droit exige est `finance.workflow.manage`, avec sa PORTEE (RG-25).
 *
 * Ce n'est ni `finance.validate` — un validateur se dispenserait lui-meme de
 * valider —, ni `settings.manage`, qui ouvrirait avec lui la devise, le format
 * des matricules et la fenetre des nouveaux baptises. Un droit qui ouvre plus
 * que ce qu'on veut accorder n'est pas le bon droit.
 *
 * Etant DELEGABLE, le Siege peut le confier a un district pour son seul
 * district : celui-ci regle alors ses propres eglises sans repasser par le
 * Siege, et ne voit rien au-dela de sa portee.
 */
export async function reglerWorkflowEntite(
  input: unknown,
): Promise<ActionResult<void>> {
  return executerAction('reglerWorkflowEntite', async () => {
    const session = await requireSession();

    const analyse = reglerWorkflowSchema.safeParse(input);
    if (!analyse.success) return ko('Demande invalide.');
    const data = analyse.data;

    const cible = await cheminDe(data.entiteId);
    if (!cible) return ko('Cette entite est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'finance.workflow.manage', cible.chemin);

    const sb = await createClient();

    const { error } = await sb
      .from('entities')
      .update({ finance_validation_active: data.actif })
      .eq('id', data.entiteId);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'entities',
      recordId: data.entiteId,
      entityId: data.entiteId,
      diff: { apres: { finance_validation_active: data.actif } },
    });

    revalidatePath('/finances');
    revalidatePath('/structure');
    return ok();
  });
}
