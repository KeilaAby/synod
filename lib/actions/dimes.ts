'use server';

import { revalidatePath } from 'next/cache';

import { getArbrePerimetre } from '@/lib/data/entities';
import { listerCategoriesFinance } from '@/lib/data/finances';
import {
  admetLeDetail,
  doublonsDeCollecte,
  trouverCategorieDime,
} from '@/lib/domain/dime';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitize } from '@/lib/utils/sanitize';
import { reglerModeDimeSchema, saisirCollecteSchema } from '@/lib/validation/dime';
import { champsEnErreur } from '@/lib/validation/zod-errors';

import { executerAction } from './executer';

/**
 * Collectes de dimes — EF-FIN-27 a 31, RG-33.
 *
 * CE FICHIER N'ECRIT PAS LUI-MEME LA COLLECTE. Tout passe par
 * `fn_saisir_collecte_dime`, et pour deux raisons qui tiennent ensemble :
 *
 *   - le mouvement est rattache au SIEGE, ce que l'appelant n'a pas le droit
 *     de faire ; la fonction est `SECURITY DEFINER` et verifie
 *     `finance.dime.collect` sur l'entite COLLECTRICE avant d'ecrire ;
 *   - le mouvement et ses versements sont INDISSOCIABLES (regle 20). Des
 *     versements dont la somme ne fait pas le mouvement sont un etat faux et
 *     indetectable : on ne saurait plus lequel des deux nombres croire.
 *
 * Ce que cette action fait, elle seule : EXPLIQUER. Une exception SQL dit
 * « RG-13 » a qui lit les journaux ; ici on le dit a qui a clique.
 */

function messageErreurSql(erreur: { code?: string; message?: string }): string {
  if (erreur.code === '42501') {
    return "Vous n'avez pas le droit de collecter les dimes de cette entite.";
  }
  if (erreur.code === '23503') {
    return 'Un croyant, une categorie ou une entite indiquee est introuvable.';
  }
  if (erreur.message?.includes('RG-') || erreur.message?.includes('Siege')) {
    return erreur.message.split('\n')[0] ?? 'Operation refusee.';
  }
  return "L'operation n'a pas pu aboutir.";
}

export interface ResultatCollecte {
  readonly mouvementId: string;
  /** Le recu attribue a chaque croyant, dans l'ordre de la grille. */
  readonly recus: { readonly croyantId: string; readonly recu: string }[];
}

export async function saisirCollecteDime(
  input: unknown,
): Promise<ActionResult<ResultatCollecte>> {
  return executerAction('saisirCollecteDime', async () => {
    const session = await requireSession();

    const analyse = saisirCollecteSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    // Deux lectures INDEPENDANTES, donc simultanees (regle 28).
    const [arbre, categories] = await Promise.all([
      getArbrePerimetre(),
      listerCategoriesFinance(),
    ]);

    // Une absence de donnees n'est pas un refus de droit (regle 15).
    if (arbre.length === 0) {
      return ko(
        "La structure n'a pas pu etre chargee. Verifiez votre connexion, puis reessayez.",
      );
    }

    const hote = arbre.find((e) => e.id === data.entiteCollecteId);
    if (!hote) return ko('Cette entite est introuvable ou hors de votre perimetre.');

    /**
     * La categorie est RESOLUE, pas recue — EF-FIN-27.
     *
     * Sur l'ecran des dimes, tout EST une dime : le champ n'offrait pas un
     * choix mais une occasion de se tromper. Une collecte rangee sous
     * « Offrande » disparaitrait du suivi des dimes sans qu'aucune ligne ne
     * paraisse anormale.
     */
    const categorieId = trouverCategorieDime(
      categories as { id: string; libelle: string; code?: string }[],
    );

    if (!categorieId) {
      return ko(
        'Aucune categorie de dime dans le referentiel : c\'est celle sous laquelle ' +
          'toute collecte est enregistree. Creez-la dans Referentiels > Categories ' +
          'financieres, puis reessayez.',
      );
    }

    /**
     * Le droit est verifie DEUX FOIS, et ce n'est pas une redite.
     *
     * Ici pour l'expliquer — un refus doit nommer ce qui manque —, et dans la
     * fonction SQL pour l'empecher, y compris a un appel direct de l'API qui
     * ne passerait jamais par cette ligne.
     */
    await requirePermission(session, 'finance.dime.collect', hote.path);

    /**
     * EF-FIN-30 — un evenement national ne se saisit pas en detail.
     *
     * Personne ne tient trois mille enveloppes a la main : le Siege encaisse
     * lui-meme et saisit un montant global.
     */
    if (!admetLeDetail(data.evenement) && data.versements.length > 0) {
      return ko(
        'Un evenement national se saisit en montant global : le detail par croyant ' +
          "n'y a pas de sens.",
      );
    }

    /**
     * Un croyant ne verse qu'une enveloppe par collecte.
     *
     * La base ne peut pas voir cette erreur : deux versements du meme croyant
     * sont licites d'une collecte a l'autre, seule la REPETITION dans un meme
     * lot est fautive.
     */
    const repetes = doublonsDeCollecte(data.versements);
    if (repetes.length > 0) {
      return ko(
        `La ligne ${repetes[0]! + 1} reprend un croyant deja cite dans cette collecte. ` +
          'Un croyant ne verse qu une enveloppe par collecte.',
      );
    }

    /**
     * En mode GLOBAL, le montant part comme un versement SANS croyant : la
     * fonction SQL somme les lignes qu'on lui donne, et n'en cree le detail
     * que pour celles qui portent un `croyant_id`.
     */
    const versements = data.montantGlobal
      ? [{ montant: data.montantGlobal }]
      : data.versements.map((v) => ({
          croyant_id: v.croyantId,
          montant: v.montant,
          enveloppe: v.enveloppe ? sanitize(v.enveloppe) : null,
          // EF-FIN-33 — la nature decide du recu : seul le nominatif en ouvre
          // un, et la fonction SQL s'en charge.
          nature: v.nature,
        }));

    const sb = await createClient();

    const { data: resultat, error } = await sb.rpc('fn_saisir_collecte_dime', {
      p_entite_collecte: data.entiteCollecteId,
      p_categorie: categorieId,
      p_date_operation: data.dateOperation.toISOString().slice(0, 10),
      p_evenement: data.evenement,
      p_libelle: data.libelle ? sanitize(data.libelle) : null,
      p_reference: data.reference ? sanitize(data.reference) : null,
      p_versements: versements,
    });

    if (error) return ko(messageErreurSql(error));

    const ligne = (
      resultat as { finance_entry_id: string; recus: { croyant_id: string; recu: string }[] }[]
    )?.[0];

    if (!ligne) return ko("La collecte n'a pas pu etre enregistree.");

    await auditer({
      session,
      action: 'CREATE',
      table: 'finance_entries',
      recordId: ligne.finance_entry_id,
      // L'entite AUDITEE est celle qui a collecte : c'est elle qui a agi, meme
      // si le mouvement appartient au Siege (RG-33).
      entityId: data.entiteCollecteId,
      diff: {
        apres: {
          dime: true,
          evenement: data.evenement,
          versements: data.versements.length,
          date: data.dateOperation.toISOString().slice(0, 10),
        },
      },
    });

    revalidatePath('/finances');
    revalidatePath('/finances/dimes');
    revalidatePath('/tableau-de-bord');

    return ok({
      mouvementId: ligne.finance_entry_id,
      recus: (ligne.recus ?? []).map((r) => ({ croyantId: r.croyant_id, recu: r.recu })),
    });
  });
}

/**
 * Regle le mode de saisie des dimes d'une entite — EF-FIN-28.
 *
 * `null` remet l'entite sur le defaut de l'organisation, PAS sur son parent :
 * chaque bureau gere ses finances, la hierarchie ne fait que les consulter.
 *
 * Le droit exige est `finance.workflow.manage`, deja delegable et deja
 * consacre aux reglages financiers d'une entite. En creer un second pour un
 * reglage voisin multiplierait les cases a cocher sans rien distinguer.
 */
export async function reglerModeDime(input: unknown): Promise<ActionResult<void>> {
  return executerAction('reglerModeDime', async () => {
    const session = await requireSession();

    const analyse = reglerModeDimeSchema.safeParse(input);
    if (!analyse.success) return ko('Demande invalide.');
    const data = analyse.data;

    const arbre = await getArbrePerimetre();
    if (arbre.length === 0) {
      return ko("La structure n'a pas pu etre chargee. Reessayez.");
    }

    const entite = arbre.find((e) => e.id === data.entiteId);
    if (!entite) return ko('Cette entite est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'finance.workflow.manage', entite.path);

    const sb = await createClient();
    const { error } = await sb
      .from('entities')
      .update({ dime_mode: data.mode })
      .eq('id', data.entiteId);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'entities',
      recordId: data.entiteId,
      entityId: data.entiteId,
      diff: { apres: { dime_mode: data.mode } },
    });

    revalidatePath('/finances/dimes');
    return ok();
  });
}
