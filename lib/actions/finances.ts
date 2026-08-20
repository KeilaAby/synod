'use server';

import { revalidatePath } from 'next/cache';

import { compterTitulairesEnFonction } from '@/lib/data/bureaux';
import { getArbrePerimetre } from '@/lib/data/entities';
import { getParametres } from '@/lib/data/settings';
import {
  type StatutMouvement,
  exigeDelegation,
  peutValider,
  transitionAutorisee,
} from '@/lib/domain/finance';
import { peut } from '@/lib/domain/permissions';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitize } from '@/lib/utils/sanitize';
import {
  changerStatutSchema,
  cloturerPeriodeSchema,
  modifierMouvementSchema,
  reglerWorkflowSchema,
  rouvrirPeriodeSchema,
  saisirMouvementSchema,
  supprimerMouvementSchema,
  traiterLotSchema,
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
      /**
       * LE REFUS NOMME L'HABILITATION QUI MANQUE.
       *
       * `requirePermission` aurait suffi a proteger l'ecriture, mais il rend
       * toujours la meme phrase : « Vous n'avez pas l'autorisation d'effectuer
       * cette action ». Sur cet ecran-ci, elle est trompeuse — l'utilisateur
       * detient bien `finance.create`, il le sait, et il cherche donc ailleurs.
       * C'est ce qui a fait passer un blocage pour un bogue le 20 aout 2026.
       *
       * On garde la ligne d'audit `DENIED` : un refus est un evenement, et le
       * remplacer par un message le ferait disparaitre du journal.
       */
      if (!peut(session, 'finance.delegate', entite.path)) {
        await auditer({
          session,
          action: 'DENIED',
          table: 'permissions',
          entityId: entite.id,
          diff: { permission: 'finance.delegate', portee: entite.path },
        });

        return ko(
          `Saisir pour le compte de ${entite.nom} demande l’habilitation ` +
            '« Saisie déléguée » sur cette entité, que vous ne détenez pas. ' +
            'Demandez-la à votre administrateur.',
        );
      }

      /**
       * ARB-2 / EF-STR-10 — LA SAISIE DELEGUEE SUPPOSE QU'IL N'Y AIT PERSONNE
       * POUR SAISIR. Le critere etait « declaree sans acces », et il etait trop
       * etroit (constate le 20 aout 2026).
       *
       * Une cellule ouverte hier a l'acces a l'application et n'a pourtant
       * AUCUN compte : un compte suppose un mandat en cours (lot 7), et son
       * bureau n'est pas encore constitue. Elle encaisse des le premier jour.
       * Le refus tombait alors sur les deux branches a la fois — `finance.create`
       * etant PROPRE depuis 0050, l'ascendant ne pouvait pas non plus saisir en
       * direct. L'argent n'entrait nulle part.
       *
       * On regarde donc l'ETAT DE FAIT et non le seul reglage. Les deux motifs
       * se relisent a chaque ecriture (regle 21) : le jour ou un bureau est
       * ouvert, la delegation se referme d'elle-meme, sans qu'on ait rien a
       * defaire.
       *
       * Le refus NOMME l'entite et dit ce qui manque : « vous n'avez pas le
       * droit » ferait chercher une habilitation qui, elle, est detenue.
       */
      const capacite = {
        sansAccesApplication: entite.sans_acces_application,
        membresBureauEnCours: entite.sans_acces_application
          ? 0
          : await compterTitulairesEnFonction(entite.id),
      };

      if (!exigeDelegation(capacite)) {
        return ko(
          `${entite.nom} accède à l’application et son bureau est constitué : ` +
            'ses mouvements se saisissent depuis son propre compte. La saisie ' +
            'déléguée est réservée aux entités qui n’ont personne pour le faire.',
        );
      }
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

// -----------------------------------------------------------------------------
// File de validation, traitement par lot — EF-FIN-21
// -----------------------------------------------------------------------------

export interface ResultatTraitementLot {
  /** Mouvements effectivement traites. */
  readonly traites: number;
  /** Ceux qui ont ete ecartes, avec leur motif — nommes pour etre retrouves. */
  readonly refuses: { readonly libelle: string; readonly message: string }[];
}

interface LigneAValider {
  id: string;
  entity_id: string;
  statut: StatutMouvement;
  montant: number;
  libelle: string | null;
  soumis_par: string | null;
  saisi_par: string | null;
}

/**
 * Valide ou rejette PLUSIEURS mouvements d'un coup — EF-FIN-21.
 *
 * QUATRE ALLERS-RETOURS POUR N MOUVEMENTS, PAS QUATRE PAR MOUVEMENT. Valider
 * vingt lignes une a une, c'est vingt fois 0,5 a 4 secondes, et vingt occasions
 * de panne (regle 28) : on lit tout en une requete, on decide en memoire, on
 * ecrit en une seule.
 *
 * UN REFUS PARTIEL N'ARRETE PAS LE LOT. Une ligne peut echouer seule — elle a
 * ete validee entre-temps par quelqu'un d'autre, ou son auteur est celui qui
 * essaie de la valider (EF-FIN-18). Rejeter les vingt pour une seule ferait
 * recommencer un tri que l'utilisateur vient de faire ; on ecarte la ligne, on
 * la NOMME, et le reste passe.
 */
export async function traiterMouvementsEnLot(
  input: unknown,
): Promise<ActionResult<ResultatTraitementLot>> {
  return executerAction('traiterMouvementsEnLot', async () => {
    const session = await requireSession();

    const analyse = traiterLotSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Demande invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const sb = await createClient();

    // Trois lectures INDEPENDANTES, donc simultanees.
    const [lignes, arbre, parametres] = await Promise.all([
      sb
        .from('finance_entries')
        .select('id, entity_id, statut, montant, libelle, soumis_par, saisi_par')
        .in('id', data.ids)
        .is('deleted_at', null)
        .returns<LigneAValider[]>(),
      getArbrePerimetre(),
      getParametres(),
    ]);

    if (lignes.error) return ko(messageErreurSql(lignes.error));

    // Une absence de donnees n'est pas un refus de droit (regle 15).
    if (arbre.length === 0) return ko(MESSAGE_STRUCTURE_ILLISIBLE);

    const chemins = new Map(arbre.map((e) => [e.id, e.path]));

    const retenus: string[] = [];
    const refuses: ResultatTraitementLot['refuses'] = [];

    /** De quoi nommer une ligne ecartee : un identifiant ne se retrouve pas. */
    const nommer = (l: LigneAValider) =>
      l.libelle?.trim() || `Mouvement de ${l.montant} (${l.id.slice(0, 8)})`;

    for (const ligne of lignes.data ?? []) {
      if (!transitionAutorisee(ligne.statut, data.statut)) {
        refuses.push({
          libelle: nommer(ligne),
          message: `Deja « ${ligne.statut.toLocaleLowerCase('fr')} » : la file a change depuis son affichage.`,
        });
        continue;
      }

      const chemin = chemins.get(ligne.entity_id);
      if (!chemin) {
        refuses.push({
          libelle: nommer(ligne),
          message: 'Son entite est hors de votre perimetre.',
        });
        continue;
      }

      /**
       * Le droit s'evalue ENTITE PAR ENTITE (RG-25).
       *
       * Une file peut melanger plusieurs eglises, et rien ne garantit qu'on les
       * couvre toutes. `peut()` plutot que `requirePermission()` : une
       * exception arreterait le lot entier, quand ce qu'il faut est ecarter la
       * ligne et poursuivre.
       */
      if (!peut(session, DROIT_PAR_STATUT[data.statut], chemin)) {
        refuses.push({
          libelle: nommer(ligne),
          message: "Vous n'avez pas le droit de valider pour cette entite.",
        });
        continue;
      }

      if (data.statut === 'VALIDE') {
        const verdict = peutValider(ligne, session.profileId, {
          separationActive: parametres.separation_saisie_validation,
          detientDoubleRole: peut(session, 'finance.validate_own', chemin),
        });
        if (!verdict.autorise) {
          refuses.push({ libelle: nommer(ligne), message: verdict.motif ?? 'Refuse.' });
          continue;
        }
      }

      retenus.push(ligne.id);
    }

    if (retenus.length === 0) return ok({ traites: 0, refuses });

    const majuscule = {
      statut: data.statut,
      ...(data.statut === 'VALIDE' ? { valide_par: session.profileId } : {}),
      ...(data.statut === 'REJETE' ? { motif_rejet: sanitize(data.motif ?? '') } : {}),
    };

    const { error } = await sb
      .from('finance_entries')
      .update(majuscule)
      .in('id', retenus)
      .is('deleted_at', null);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'finance_entries',
      // Aucun enregistrement PRECIS : l'evenement porte sur le lot entier.
      entityId: session.entityId,
      diff: {
        apres: {
          lot: true,
          statut: data.statut,
          traites: retenus.length,
          refuses: refuses.length,
          motif: data.motif,
        },
      },
    });

    revalidatePath('/finances');
    revalidatePath('/finances/a-valider');
    revalidatePath('/tableau-de-bord');

    return ok({ traites: retenus.length, refuses });
  });
}

// -----------------------------------------------------------------------------
// Cloture d'une periode — EF-FIN-26
// -----------------------------------------------------------------------------

/**
 * Arrete les comptes d'un mois — EF-FIN-26.
 *
 * LE DROIT SE VERIFIE DEUX FOIS, ET CE N'EST PAS UNE REDONDANCE INUTILE. Ici,
 * pour refuser tot et avec un message lisible ; en base, dans
 * `fn_cloturer_periode`, parce que la cascade porte sur des entites que cette
 * action ne connait pas une a une — et que la fonction, elle, les evalue
 * toutes avec leur portee (RG-25).
 *
 * L'ECRITURE EST ATOMIQUE (regle 20) : N entites closes ou aucune. Une cascade
 * a moitie posee laisserait une hierarchie dont une partie est arretee et
 * l'autre non, sans que rien ne dise laquelle.
 */
export async function cloturerPeriode(input: unknown): Promise<ActionResult<number>> {
  return executerAction('cloturerPeriode', async () => {
    const session = await requireSession();

    const analyse = cloturerPeriodeSchema.safeParse(input);
    if (!analyse.success) return ko('Demande invalide.');
    const data = analyse.data;

    const cible = await cheminDe(data.entiteId);
    if (!cible) return ko('Cette entite est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'finance.periode.close', cible.chemin);

    const sb = await createClient();

    const { data: nombre, error } = await sb.rpc('fn_cloturer_periode', {
      p_entity: data.entiteId,
      p_periode: data.periode,
      p_avec_perimetre: data.avecPerimetre,
    });

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'CREATE',
      table: 'finance_periodes_cloturees',
      recordId: data.entiteId,
      entityId: data.entiteId,
      diff: {
        apres: {
          periode: data.periode,
          avec_perimetre: data.avecPerimetre,
          entites: nombre,
        },
      },
    });

    revalidatePath('/finances');
    revalidatePath('/finances/synthese');
    return ok(Number(nombre ?? 0));
  });
}

/**
 * Rouvre une periode close, sur motif — EF-FIN-26.
 *
 * RESERVEE AU SIEGE, et l'exigence est explicite. `finance.periode.reopen` est
 * non delegable : si celui qui clot pouvait s'accorder de quoi rouvrir, la
 * cloture ne serait plus qu'une convention entre soi.
 *
 * LA REOUVERTURE NE CASCADE PAS, alors que la cloture le peut. L'asymetrie est
 * voulue : arreter vingt entites d'un geste fait gagner du temps sans rien
 * risquer, tandis que les rouvrir toutes pour corriger UNE ecriture ouvrirait
 * dix-neuf portes que personne n'a demandees.
 */
export async function rouvrirPeriode(input: unknown): Promise<ActionResult<void>> {
  return executerAction('rouvrirPeriode', async () => {
    const session = await requireSession();

    const analyse = rouvrirPeriodeSchema.safeParse(input);
    if (!analyse.success) {
      return ko(analyse.error.issues[0]?.message ?? 'Demande invalide.');
    }
    const data = analyse.data;

    const cible = await cheminDe(data.entiteId);
    if (!cible) return ko('Cette entite est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'finance.periode.reopen', cible.chemin);

    const sb = await createClient();

    const { error } = await sb.rpc('fn_rouvrir_periode', {
      p_entity: data.entiteId,
      p_periode: data.periode,
      p_motif: data.motif,
    });

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'finance_periodes_cloturees',
      recordId: data.entiteId,
      entityId: data.entiteId,
      diff: { apres: { periode: data.periode, motif_reouverture: data.motif } },
    });

    revalidatePath('/finances');
    revalidatePath('/finances/synthese');
    return ok();
  });
}
