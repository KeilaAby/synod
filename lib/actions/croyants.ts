'use server';

import { revalidatePath } from 'next/cache';

import { chercherDoublons, getCroyant } from '@/lib/data/croyants';
import { listerGradesOrdonnes } from '@/lib/data/croyant-options';
import { type NoeudEntite, getArbrePerimetre } from '@/lib/data/entities';
import { getParametres } from '@/lib/data/settings';
import { gradeEstCompatibleSexe, nomComplet, validerDatesCroyant } from '@/lib/domain/croyant';
import {
  arbitreDePromotion,
  correctionDeGradePossible,
  motifDeRetrogradationManquant,
  promotionSoumiseAValidation,
} from '@/lib/domain/promotion';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { executerAction } from './executer';
import { createClient } from '@/lib/supabase/server';
import { sanitize } from '@/lib/utils/sanitize';
import {
  croyantSchema,
  modifierCroyantSchema,
  supprimerCroyantSchema,
} from '@/lib/validation/croyant';
import { champsEnErreur } from '@/lib/validation/zod-errors';

/**
 * Mutations sur les croyants — EF-CRO-01 à 13.
 *
 * Enchaînement invariant (plan.md §5.4) :
 *   session → validation Zod → habilitation + PORTÉE → règles de gestion
 *          → persistance → audit → revalidation
 */

function messageErreurSql(erreur: { code?: string; message?: string }): string {
  if (erreur.code === '23505') {
    return 'Un croyant portant ce matricule existe déjà.';
  }
  if (erreur.code === '23503') {
    return "L'église, la cellule, le grade ou la nationalité indiqué est introuvable.";
  }
  // Les triggers RG-* lèvent avec un message déjà rédigé pour l'utilisateur.
  if (erreur.message?.includes('RG-')) {
    return erreur.message.split('\n')[0] ?? 'Opération refusée.';
  }
  return "L'opération n'a pas pu aboutir.";
}

/**
 * Résout l'église et vérifie la cohérence de la cellule — RG-04, RG-05.
 *
 * Union DISCRIMINÉE sur `ok` : sans discriminant explicite, TypeScript ne peut
 * pas retrancher la branche d'erreur, les deux formes étant structurellement
 * compatibles.
 */
type Rattachement =
  | { ok: false; erreur: string }
  | { ok: true; eglise: NoeudEntite };

async function resoudreRattachement(
  egliseId: string,
  celluleId: string | null | undefined,
): Promise<Rattachement> {
  const arbre = await getArbrePerimetre();

  // Un arbre VIDE ne veut pas dire « hors périmètre » : il signale que la
  // structure n'a pas pu être lue. Accuser le périmètre serait un mensonge —
  // c'est ce qui faisait dire à un SuperAdmin que l'église n'était pas dans
  // le sien, alors que le sien couvre toute l'organisation.
  if (arbre.length === 0) {
    return {
      ok: false,
      erreur:
        "La structure n'a pas pu être chargée. Vérifiez votre connexion, puis réessayez.",
    };
  }

  const eglise = arbre.find((e) => e.id === egliseId);

  if (!eglise) {
    return { ok: false, erreur: 'Cette église est introuvable ou hors de votre périmètre.' };
  }
  if (eglise.type !== 'EGLISE') {
    return { ok: false, erreur: 'RG-04 : le rattachement principal doit être une Église.' };
  }

  if (celluleId) {
    const cellule = arbre.find((e) => e.id === celluleId);
    if (!cellule || cellule.type !== 'CELLULE') {
      return { ok: false, erreur: 'Cette cellule est introuvable.' };
    }
    if (cellule.parent_id !== egliseId) {
      return {
        ok: false,
        erreur: `RG-05 : la cellule « ${cellule.nom} » n'appartient pas à l'église « ${eglise.nom} ».`,
      };
    }
  }

  return { ok: true, eglise };
}

/**
 * EF-CRO-14 — le conjoint choisi est-il RECEVABLE ?
 *
 * L'écran filtre déjà par sexe opposé et écarte qui est pris (règle 18,
 * `conjointsProposables`) : ce contrôle-ci est la revalidation serveur — un
 * client qui n'a pas rechargé sa liste, ou un second onglet, ne doit pas
 * pouvoir rompre en silence l'union de quelqu'un d'autre.
 *
 * `croyantId` est `null` en CRÉATION : la fiche qu'on enregistre n'a pas
 * encore d'identifiant, donc « déjà notre conjoint » ne peut jamais être le
 * cas — seul « libre » l'est.
 */
async function resoudreConjoint(
  conjointId: string | null,
  sexe: 'M' | 'F',
  croyantId: string | null,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  if (!conjointId) return { ok: true };

  const sb = await createClient();
  const { data: candidat, error } = await sb
    .from('croyants')
    .select('id, sexe, conjoint_id')
    .eq('id', conjointId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string; sexe: 'M' | 'F'; conjoint_id: string | null }>();

  // La RLS masque un conjoint hors périmètre exactement comme n'importe
  // quelle autre fiche : indiscernable d'une fiche inexistante, et c'est
  // volontaire (règle 15 mise à part, on ne confirme ni n'infirme ici
  // l'existence d'une fiche hors de portée).
  if (error || !candidat) {
    return { ok: false, erreur: 'Ce conjoint est introuvable ou hors de votre périmètre.' };
  }
  if (candidat.sexe === sexe) {
    return { ok: false, erreur: 'EF-CRO-14 : le conjoint doit être de sexe opposé.' };
  }
  if (candidat.conjoint_id !== null && candidat.conjoint_id !== croyantId) {
    return {
      ok: false,
      erreur: 'Cette personne est déjà liée à un autre conjoint sur sa fiche.',
    };
  }

  return { ok: true };
}

async function validerCompatibiliteGradeSexe(
  gradeId: string,
  sexe: 'M' | 'F',
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const sb = await createClient();
  const { data: grade, error } = await sb
    .from('grades')
    .select('id, libelle, sexe_autorise')
    .eq('id', gradeId)
    .maybeSingle<{ id: string; libelle: string; sexe_autorise: string }>();

  if (error || !grade) return { ok: true };
  if (!gradeEstCompatibleSexe(grade.sexe_autorise, sexe)) {
    const libelleGenre = grade.sexe_autorise === 'M' ? 'aux hommes' : 'aux femmes';
    return {
      ok: false,
      erreur: `Le grade « ${grade.libelle} » est réservé ${libelleGenre}.`,
    };
  }
  return { ok: true };
}

// -----------------------------------------------------------------------------

export async function creerCroyant(
  input: unknown,
): Promise<ActionResult<{ id: string; matricule: string }>> {
  return executerAction('creerCroyant', async () => {
    const session = await requireSession();

    const analyse = croyantSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    // Les vérifications sont indépendantes : on les lance en parallèle
    const [rattachement, doublons, conjoint, compatibiliteGrade] = await Promise.all([
      resoudreRattachement(data.egliseId, data.celluleId),
      data.doublonAccepte
        ? Promise.resolve([])
        : chercherDoublons(data.nom, data.prenom, data.dateNaissance),
      resoudreConjoint(data.conjointId ?? null, data.sexe, null),
      validerCompatibiliteGradeSexe(data.gradeId, data.sexe),
    ]);

    if (!rattachement.ok) return ko(rattachement.erreur);
    if (!conjoint.ok) return ko(conjoint.erreur);
    if (!compatibiliteGrade.ok) {
      return ko(compatibiliteGrade.erreur, { gradeId: [compatibiliteGrade.erreur] });
    }

    await requirePermission(session, 'croyant.create', rattachement.eglise.path);

    // RG-28 — doublée par une contrainte CHECK ; ici le message est exploitable.
    const dates = validerDatesCroyant(data.dateNaissance, data.dateBapteme);
    if (!dates.ok) return ko(dates.error);

    // EF-CRO-13 — on avertit, on ne bloque pas : deux homonymes nés le même
    // jour existent réellement. La décision revient à l'utilisateur.
    if (doublons.length > 0) {
      const premier = doublons[0]!;
      return ko(
        `${nomComplet(premier.nom, premier.prenom)} est déjà enregistré avec la même ` +
          `date de naissance (matricule ${premier.matricule}). ` +
          'Confirmez pour créer malgré tout.',
        { doublon: [premier.id] },
      );
    }

    const sb = await createClient();
    const { data: cree, error } = await sb
      .from('croyants')
      .insert({
        nom: sanitize(data.nom),
        prenom: sanitize(data.prenom),
        sexe: data.sexe,
        statut_marital: data.statutMarital ?? null,
        email: data.email,
        telephone: data.telephone,
        date_naissance: data.dateNaissance.toISOString().slice(0, 10),
        date_bapteme: data.dateBapteme ? data.dateBapteme.toISOString().slice(0, 10) : null,
        adresse: sanitize(data.adresse),
        eglise_id: data.egliseId,
        cellule_id: data.celluleId ?? null,
        grade_id: data.gradeId,
        nationalite_id: data.nationaliteId,
        // EF-CRO-14 — le trigger de symetrie (migration 0071) relie le
        // conjoint en retour dans le meme geste.
        conjoint_id: data.conjointId ?? null,
        saisi_par: session.profileId,
        saisi_depuis: session.entityId,
        // `matricule` est volontairement OMIS : un trigger BEFORE le renseigne,
        // et cette contrainte NOT NULL n'est vérifiée qu'après les triggers.
        // Seule la base peut garantir l'unicité de la séquence face à deux
        // saisies simultanées.
      })
      .select('id, matricule')
      .single<{ id: string; matricule: string }>();

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'CREATE',
      table: 'croyants',
      recordId: cree.id,
      entityId: data.egliseId,
      diff: { apres: { nom: data.nom, prenom: data.prenom, matricule: cree.matricule } },
    });

    revalidatePath('/croyants');
    revalidatePath(`/structure/${data.egliseId}`);
    return ok(cree);
  });
}

// -----------------------------------------------------------------------------

export async function modifierCroyant(input: unknown): Promise<ActionResult<void>> {
  return executerAction('modifierCroyant', async () => {
    const session = await requireSession();

    const analyse = modifierCroyantSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const existant = await getCroyant(data.id);
    if (!existant) return ko('Ce croyant est introuvable ou hors de votre périmètre.');

    const rattachement = await resoudreRattachement(existant.eglise_id, data.celluleId);
    if (!rattachement.ok) return ko(rattachement.erreur);

    await requirePermission(session, 'croyant.update', rattachement.eglise.path);

    const dates = validerDatesCroyant(data.dateNaissance, data.dateBapteme);
    if (!dates.ok) return ko(dates.error);

    /**
     * EF-CRO-12 — LE GRADE NE SE POSE PLUS TOUJOURS ICI.
     *
     * Quand le circuit est ouvert, changer de grade devient une DEMANDE : elle
     * part vers l'entite superieure, et la fiche garde son grade jusqu'a la
     * decision. Le reste du formulaire — nom, adresse, cellule… — s'enregistre
     * normalement dans le meme geste : bloquer toute la fiche pour un grade en
     * attente ferait perdre une correction d'adresse.
     *
     * LE REGLAGE SE LIT ICI, A CHAQUE ECRITURE (regle 21). L'activer referme la
     * porte immediatement, sans qu'aucun ecran n'ait a etre redemarre — et le
     * lire au chargement d'un formulaire laisserait passer, pendant des heures,
     * les onglets ouverts avant le changement.
     */
    const [parametres, arbre, conjoint] = await Promise.all([
      getParametres(),
      getArbrePerimetre(),
      // EF-CRO-14 — independant du reste, meme aller-retour groupe.
      resoudreConjoint(data.conjointId ?? null, data.sexe, data.id),
    ]);
    if (!conjoint.ok) return ko(conjoint.erreur);

    const arbitre = arbitreDePromotion(rattachement.eglise.path, arbre);
    const promotionBrute = promotionSoumiseAValidation({
      validationActive: parametres.promotion_grade_validation,
      gradeActuelId: existant.grade_id,
      gradeDemandeId: data.gradeId,
      arbitreId: arbitre?.id ?? null,
    });

    /**
     * EF-CRO-12 — UNE DESCENTE EN GRADE SE MOTIVE, UNE MONTEE NON.
     *
     * Meme principe que le retrait d'un titulaire : ce qui RETIRE quelque chose
     * a quelqu'un se motive, ce qui lui en donne non. Une promotion se justifie
     * d'elle-meme — on reconnait ce qui est deja la ; une retrogradation,
     * jamais.
     *
     * LE CONTROLE EST ICI ET NON DANS LE SCHEMA : Zod ne connait pas le rang
     * des grades, il faudrait charger le referentiel pour le savoir. Le rang
     * s'evalue donc la ou l'arbre et les grades sont deja lus.
     *
     * Il s'applique QUE LE CIRCUIT SOIT OUVERT OU FERME : un grade descendu
     * directement, sans validation, mérite autant son motif — c'est meme le cas
     * ou personne d'autre ne le verra passer.
     */
    const grades = await listerGradesOrdonnes();
    const changeDeGrade = existant.grade_id !== data.gradeId;

    if (changeDeGrade) {
      const compatibiliteGrade = await validerCompatibiliteGradeSexe(data.gradeId, data.sexe);
      if (!compatibiliteGrade.ok) {
        return ko(compatibiliteGrade.erreur, { gradeId: [compatibiliteGrade.erreur] });
      }
    }

    /**
     * EF-CRO-12 — DEUX GESTES, comme pour le retrait d'un titulaire.
     *
     * `ERREUR` corrige une case cochee de travers : rien n'entre dans
     * l'historique, aucune demande ne part. Un « Diacre » de trois jours
     * inscrit au journal se lirait plus tard comme une degradation.
     *
     * LE DELAI EMPECHE LE CONTOURNEMENT — sans lui, « erreur de saisie »
     * deviendrait la porte par laquelle on retrograde quelqu'un sans rien
     * ecrire. Il se verifie ICI : un choix masque a l'ecran ne ferme rien, la
     * Server Action s'appelle sans passer par le formulaire. `parametres` est
     * deja lu plus haut dans cette meme ecriture (regle 21) — pas au premier
     * rendu du pop-up, qui peut dater de plusieurs heures.
     *
     * La reference est la creation de la FICHE, qui est bien le moment ou son
     * grade a ete choisi la premiere fois.
     */
    const joursDelai = parametres.jours_correction_saisie;
    const correction =
      changeDeGrade &&
      data.natureGrade === 'ERREUR' &&
      correctionDeGradePossible(existant.created_at, joursDelai);

    if (changeDeGrade && data.natureGrade === 'ERREUR' && !correction) {
      return ko(
        `Cette fiche a plus de ${joursDelai} jours : son grade ne se corrige `
          + 'plus comme une erreur de saisie. Enregistrez le changement comme une '
          + 'decision, en indiquant le motif s il s agit d une descente.',
      );
    }

    if (
      changeDeGrade &&
      !correction &&
      motifDeRetrogradationManquant({
        ordreActuel: grades.get(existant.grade_id ?? ''),
        ordreDemande: grades.get(data.gradeId),
        motif: data.motifGrade,
      })
    ) {
      return ko(
        'Ce grade est inferieur a celui que porte la fiche : indiquez pourquoi. '
          + 'Une montee en grade se justifie d elle-meme, une descente non.',
        { motifGrade: ['Motif obligatoire pour une descente en grade.'] },
      );
    }

    /**
     * UNE CORRECTION NE PART JAMAIS EN VALIDATION. Demander à l'entité
     * supérieure de trancher une case cochée de travers lui ferait juger une
     * faute de frappe, et laisserait la fiche fausse en attendant.
     */
    const promotion = promotionBrute && !correction;

    const sb = await createClient();
    const { error } = await sb
      .from('croyants')
      .update({
        nom: sanitize(data.nom),
        prenom: sanitize(data.prenom),
        sexe: data.sexe,
        statut_marital: data.statutMarital ?? null,
        email: data.email,
        telephone: data.telephone,
        date_naissance: data.dateNaissance.toISOString().slice(0, 10),
        date_bapteme: data.dateBapteme ? data.dateBapteme.toISOString().slice(0, 10) : null,
        adresse: sanitize(data.adresse),
        // L'église ne change PAS ici : c'est un transfert (EF-TRF-01).
        cellule_id: data.celluleId ?? null,
        // EF-CRO-12 — le grade demandé attend sa décision : on laisse celui de
        // la fiche en place, et la demande part juste après.
        grade_id: promotion ? existant.grade_id : data.gradeId,
        nationalite_id: data.nationaliteId,
        statut: data.statut,
        // EF-CRO-14 — le trigger de symetrie (migration 0071) relie ou
        // relache le conjoint en retour, dans le meme geste.
        conjoint_id: data.conjointId ?? null,
        // La PHOTO non plus : elle a ses propres actions (EF-CRO-09), et le
        // formulaire ne la transporte pas. L'écrire ici la remettait à null à
        // chaque enregistrement — la photo téléversée dix secondes plus tôt
        // disparaissait sans un mot.
      })
      .eq('id', data.id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'croyants',
      recordId: data.id,
      entityId: existant.eglise_id,
      diff: {
        avant: { nom: existant.nom, prenom: existant.prenom, statut: existant.statut },
        apres: { nom: data.nom, prenom: data.prenom, statut: data.statut },
      },
    });

    /**
     * LA DEMANDE PART APRES L'ENREGISTREMENT, et son echec n'annule rien.
     *
     * Regle 20 : l'etat intermediaire est-il *faux et indetectable*, ou *benin
     * et rattrapable* ? Ici il est benin — la fiche est a jour, le grade n'a
     * pas bouge, et il suffit de redemander. Une fonction en base serait plus
     * lourde que le probleme.
     *
     * L'INDEX UNIQUE PARTIEL RATTRAPE LE RESTE : une seule demande en cours par
     * croyant (RG-06). Renvoyer le formulaire deux fois ne cree pas deux
     * demandes — la seconde est refusee par la base, et on le DIT plutot que
     * de laisser croire a une promotion partie.
     */
    if (promotion) {
      const { error: erreurDemande } = await sb.from('promotions_grade').insert({
        croyant_id: data.id,
        grade_actuel_id: existant.grade_id,
        grade_demande_id: data.gradeId,
        arbitre_id: arbitre!.id,
        eglise_id: existant.eglise_id,
        demande_par: session.profileId,
        // Le motif de la DESCENTE, donné à la demande : l'entité supérieure se
        // prononce SUR lui. Le lui demander à la décision la ferait juger sans
        // savoir de quoi.
        motif: data.motifGrade ? sanitize(data.motifGrade) : null,
      });

      if (erreurDemande) {
        return ko(
          erreurDemande.code === '23505'
            ? 'Une demande de promotion est deja en attente pour ce croyant. '
              + 'Le reste de la fiche a bien ete enregistre.'
            : 'La fiche est enregistree, mais la demande de promotion n a pas pu partir. '
              + 'Reessayez depuis la fiche.',
        );
      }

      await auditer({
        session,
        action: 'SUBMIT',
        table: 'promotions_grade',
        recordId: data.id,
        entityId: existant.eglise_id,
        diff: { apres: { grade: data.gradeId, arbitre: arbitre!.nom } },
      });
    } else if (changeDeGrade && !correction) {
      /**
       * EF-CRO-12 — LE CHANGEMENT DIRECT S'INSCRIT AUSSI.
       *
       * Sans circuit de validation, le grade se pose immédiatement — mais il
       * doit laisser la MÊME trace, sinon la fiche du croyant raconterait son
       * parcours seulement dans les organisations qui ont activé le workflow.
       *
       * `decide_par` reste NULL, et c'est exact : personne n'a validé. L'y
       * inscrire l'opérateur ferait croire à un contrôle qui n'a pas eu lieu —
       * une signature inventée sur un registre est pire qu'une case vide.
       *
       * Son échec n'annule pas la fiche : le grade est posé, l'audit l'a
       * enregistré, et il ne manque qu'une ligne de journal (règle 20 — bénin
       * et rattrapable).
       */
      const { error: erreurJournal } = await sb.from('promotions_grade').insert({
        croyant_id: data.id,
        grade_actuel_id: existant.grade_id,
        grade_demande_id: data.gradeId,
        arbitre_id: arbitre?.id ?? existant.eglise_id,
        eglise_id: existant.eglise_id,
        demande_par: session.profileId,
        motif: data.motifGrade ? sanitize(data.motifGrade) : null,
        statut: 'APPROUVE',
        date_decision: new Date().toISOString(),
      });

      if (erreurJournal) {
        console.error('[croyants] changement de grade non journalise', erreurJournal);
      }
    }

    revalidatePath('/croyants');
    revalidatePath(`/croyants/${data.id}`);
    return ok();
  });
}

// -----------------------------------------------------------------------------

/** RG-22 — suppression LOGIQUE : la fiche part en corbeille et reste restaurable. */
export async function supprimerCroyant(input: unknown): Promise<ActionResult<void>> {
  return executerAction('supprimerCroyant', async () => {
    const session = await requireSession();

    const analyse = supprimerCroyantSchema.safeParse(input);
    if (!analyse.success) return ko('Requête invalide.');

    const existant = await getCroyant(analyse.data.id);
    if (!existant) return ko('Ce croyant est introuvable ou hors de votre périmètre.');

    const arbre = await getArbrePerimetre();
    const eglise = arbre.find((e) => e.id === existant.eglise_id);
    if (!eglise) return ko('Église introuvable.');

    await requirePermission(session, 'croyant.delete', eglise.path);

    const sb = await createClient();
    const { error } = await sb
      .from('croyants')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', analyse.data.id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'DELETE',
      table: 'croyants',
      recordId: analyse.data.id,
      entityId: existant.eglise_id,
      diff: { avant: { matricule: existant.matricule, nom: existant.nom } },
    });

    revalidatePath('/croyants');
    return ok();
  });
}

// -----------------------------------------------------------------------------

export async function restaurerCroyant(input: unknown): Promise<ActionResult<void>> {
  return executerAction('restaurerCroyant', async () => {
    const session = await requireSession();

    const analyse = supprimerCroyantSchema.safeParse(input);
    if (!analyse.success) return ko('Requête invalide.');

    await requirePermission(session, 'trash.restore');

    const sb = await createClient();
    const { data: existant, error: erreurLecture } = await sb
      .from('croyants')
      .select('id, nom, prenom, matricule, eglise_id')
      .eq('id', analyse.data.id)
      .maybeSingle<{
        id: string;
        nom: string;
        prenom: string;
        matricule: string;
        eglise_id: string;
      }>();

    if (erreurLecture || !existant) return ko('Ce croyant est introuvable.');

    const { error } = await sb
      .from('croyants')
      .update({ deleted_at: null })
      .eq('id', analyse.data.id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'RESTORE',
      table: 'croyants',
      recordId: existant.id,
      entityId: existant.eglise_id,
      diff: { apres: { matricule: existant.matricule } },
    });

    revalidatePath('/croyants');
    revalidatePath('/administration/corbeille');
    return ok();
  });
}
