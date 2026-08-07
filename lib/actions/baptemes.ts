'use server';

import { revalidatePath } from 'next/cache';

import { chercherDoublons } from '@/lib/data/croyants';
import { getArbrePerimetre } from '@/lib/data/entities';
import { nomComplet } from '@/lib/domain/croyant';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitize } from '@/lib/utils/sanitize';
import { saisirBaptiseSchema } from '@/lib/validation/bapteme';
import { champsEnErreur } from '@/lib/validation/zod-errors';

import { executerAction } from './executer';

/**
 * Saisie d'un nouveau baptise — EF-BAP-01 a 03, RG-30.
 *
 * EF-BAP-02 : la saisie CREE le croyant, il n'y a pas de double saisie.
 *
 * DEUX ECRITURES, PAS DE TRANSACTION — et c'est assume, contrairement au
 * transfert. La difference tient a la nature de l'etat intermediaire :
 *
 *   - un transfert a moitie applique laisse un croyant deplace sans trace, ou
 *     un transfert clos sans effet : deux etats FAUX, et indetectables ;
 *   - un bapteme a moitie saisi laisse un croyant CORRECT, avec sa
 *     `date_bapteme` — donc compte dans les indicateurs (RG-30) — auquel il
 *     manque seulement le lieu et les celebrants.
 *
 * Le second est benin et rattrapable ; il ne justifie pas de dupliquer en SQL
 * toute la validation du croyant. L'action le DIT plutot que de le taire.
 */

function messageErreurSql(erreur: { code?: string; message?: string }): string {
  if (erreur.code === '23505') {
    return 'Un bapteme est deja enregistre pour ce croyant.';
  }
  if (erreur.code === '23503') {
    return "L'eglise, la cellule, le grade ou la nationalite indique est introuvable.";
  }
  if (erreur.message?.includes('RG-')) {
    return erreur.message.split('\n')[0] ?? 'Operation refusee.';
  }
  return "L'operation n'a pas pu aboutir.";
}

export async function saisirBaptise(
  input: unknown,
): Promise<ActionResult<{ croyantId: string; matricule: string; ceremonieEnregistree: boolean }>> {
  return executerAction('saisirBaptise', async () => {
    const session = await requireSession();

    const analyse = saisirBaptiseSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const arbre = await getArbrePerimetre();

    // Une absence de donnees n'est pas un refus de droit : un arbre vide
    // signale une panne de lecture, pas un perimetre vide.
    if (arbre.length === 0) {
      return ko(
        "La structure n'a pas pu etre chargee. Verifiez votre connexion, puis reessayez.",
      );
    }

    const eglise = arbre.find((e) => e.id === data.egliseId);
    if (!eglise) return ko('Cette eglise est introuvable ou hors de votre perimetre.');
    if (eglise.type !== 'EGLISE') {
      return ko('RG-04 : le rattachement principal doit etre une Eglise.');
    }

    // RG-05 — la cellule doit appartenir a l'eglise du bapteme.
    if (data.celluleId) {
      const cellule = arbre.find((e) => e.id === data.celluleId);
      if (!cellule || cellule.type !== 'CELLULE') return ko('Cette cellule est introuvable.');
      if (cellule.parent_id !== data.egliseId) {
        return ko(
          `RG-05 : la cellule « ${cellule.nom} » n'appartient pas a l'eglise « ${eglise.nom} ».`,
        );
      }
    }

    // Saisir un baptise, c'est CREER un croyant : les deux droits sont exiges,
    // avec la portee de l'eglise (RG-25).
    await requirePermission(session, 'bapteme.create', eglise.path);
    await requirePermission(session, 'croyant.create', eglise.path);

    // EF-CRO-13 — on avertit sans bloquer : deux homonymes nes le meme jour
    // existent reellement, et une ceremonie collective en produit.
    const doublons = await chercherDoublons(data.nom, data.prenom, data.dateNaissance);
    if (doublons.length > 0) {
      const premier = doublons[0]!;
      return ko(
        `${nomComplet(premier.nom, premier.prenom)} est deja enregistre avec la meme ` +
          `date de naissance (matricule ${premier.matricule}). ` +
          'Enregistrez son bapteme depuis sa fiche plutot que de creer un doublon.',
      );
    }

    const sb = await createClient();

    const { data: croyant, error: erreurCroyant } = await sb
      .from('croyants')
      .insert({
        nom: sanitize(data.nom),
        prenom: sanitize(data.prenom),
        sexe: data.sexe,
        telephone: data.telephone,
        date_naissance: data.dateNaissance.toISOString().slice(0, 10),
        date_bapteme: data.dateBapteme.toISOString().slice(0, 10),
        adresse: sanitize(data.adresse),
        eglise_id: data.egliseId,
        cellule_id: data.celluleId ?? null,
        grade_id: data.gradeId,
        nationalite_id: data.nationaliteId,
        saisi_par: session.profileId,
        saisi_depuis: session.entityId,
        // `matricule` omis : un trigger BEFORE le renseigne, seule la base
        // garantissant l'unicite de la sequence.
      })
      .select('id, matricule')
      .single<{ id: string; matricule: string }>();

    if (erreurCroyant) return ko(messageErreurSql(erreurCroyant));

    await auditer({
      session,
      action: 'CREATE',
      table: 'croyants',
      recordId: croyant.id,
      entityId: data.egliseId,
      diff: {
        apres: {
          nom: data.nom,
          prenom: data.prenom,
          matricule: croyant.matricule,
          origine: 'bapteme',
        },
      },
    });

    // --- La ceremonie (EF-BAP-03) ---
    const { data: bapteme, error: erreurBapteme } = await sb
      .from('baptemes')
      .insert({
        croyant_id: croyant.id,
        entity_id: data.egliseId,
        date_bapteme: data.dateBapteme.toISOString().slice(0, 10),
        lieu: data.lieu ? sanitize(data.lieu) : null,
        session_libelle: data.sessionLibelle ? sanitize(data.sessionLibelle) : null,
        saisi_par: session.profileId,
      })
      .select('id')
      .single<{ id: string }>();

    // Les celebrants vivent dans une table de liaison : plusieurs par ceremonie.
    if (!erreurBapteme && bapteme && data.celebrantIds.length > 0) {
      await sb.from('bapteme_celebrants').insert(
        data.celebrantIds.map((croyantId) => ({
          bapteme_id: bapteme.id,
          croyant_id: croyantId,
        })),
      );
    }

    revalidatePath('/baptemes');
    revalidatePath('/croyants');
    revalidatePath('/tableau-de-bord');

    if (erreurBapteme) {
      // Le croyant EXISTE et sa date de bapteme est enregistree : il compte
      // dans les indicateurs. Seules les informations de ceremonie manquent.
      // On le dit — un demi-succes tu se decouvre trois mois plus tard.
      console.error('[baptemes] ceremonie', croyant.id, erreurBapteme.message);
      return ok({
        croyantId: croyant.id,
        matricule: croyant.matricule,
        ceremonieEnregistree: false,
      });
    }

    await auditer({
      session,
      action: 'CREATE',
      table: 'baptemes',
      recordId: croyant.id,
      entityId: data.egliseId,
      diff: {
        apres: {
          date: data.dateBapteme.toISOString().slice(0, 10),
          lieu: data.lieu,
          session: data.sessionLibelle,
        },
      },
    });

    return ok({
      croyantId: croyant.id,
      matricule: croyant.matricule,
      ceremonieEnregistree: true,
    });
  });
}
