'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { chargerDonateurs } from '@/lib/data/dimes';
import { getArbrePerimetre } from '@/lib/data/entities';
import { listerCategoriesFinance } from '@/lib/data/finances';
import {
  admetLeDetail,
  doublonsDeCollecte,
  trouverCategorieDime,
} from '@/lib/domain/dime';
import {
  type CorrespondanceVersement,
  analyserVersements,
  indexerDonateurs,
  indexerEglises,
} from '@/lib/domain/import-dimes';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitize } from '@/lib/utils/sanitize';
import {
  importerVersementsSchema,
  reglerModeDimeSchema,
  remettreCollectesSchema,
  saisirCollecteSchema,
} from '@/lib/validation/dime';
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

/**
 * UN MESSAGE GENERIQUE QUI NE DIT RIEN EST UN DEFAUT, pas une precaution.
 *
 * « L'operation n'a pas pu aboutir » a coute une session entiere de
 * tatonnements : la base disait exactement ce qui n'allait pas, et personne ne
 * pouvait le lire. Les cas connus gardent leur formulation destinee a
 * l'utilisateur ; tout le reste porte desormais le DETAIL de la base, et part
 * dans les journaux du serveur avec sa reference.
 *
 * Ces messages viennent de nos propres fonctions ou de contraintes que nous
 * avons ecrites : ils ne divulguent rien qu'un utilisateur habilite ne puisse
 * savoir.
 */
function messageErreurSql(erreur: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}): string {
  if (erreur.code === '42501') {
    return "Vous n'avez pas le droit de collecter les dimes de cette entite.";
  }
  if (erreur.code === '23503') {
    return 'Un croyant, une categorie ou une entite indiquee est introuvable.';
  }
  if (erreur.code === '23514') {
    return (
      'Une ligne ne respecte pas les regles de saisie : un versement nominatif ' +
      "exige un croyant, et un versement en vrac n'a ni nom ni enveloppe."
    );
  }
  if (erreur.message?.includes('RG-') || erreur.message?.includes('Siege')) {
    return erreur.message.split('\n')[0] ?? 'Operation refusee.';
  }

  const reference = Math.random().toString(36).slice(2, 8).toUpperCase();
  console.error(`[dimes] echec SQL — reference ${reference}`, erreur);

  return (
    `L'operation n'a pas pu aboutir (reference ${reference}). ` +
    `Detail : ${erreur.message ?? 'inconnu'}${erreur.details ? ` — ${erreur.details}` : ''}`
  );
}

export interface ResultatCollecte {
  readonly mouvementId: string;
  /**
   * Le recu attribue a chaque croyant, dans l'ordre de la grille.
   *
   * Il porte sa PROPRE DESCRIPTION — nom, prenom, enveloppe. Une reference
   * seule ne dit pas sur quel talon la recopier, et c'est precisement ce qu'on
   * en fait : on les reporte un par un, sur des enveloppes posees devant soi.
   */
  readonly recus: {
    readonly croyantId: string;
    readonly recu: string;
    readonly nom: string | null;
    readonly prenom: string | null;
    readonly enveloppe: string | null;
  }[];
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
      resultat as {
        finance_entry_id: string;
        recus: {
          croyant_id: string;
          recu: string;
          nom: string | null;
          prenom: string | null;
          enveloppe: string | null;
        }[];
      }[]
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
      recus: (ligne.recus ?? []).map((r) => ({
        croyantId: r.croyant_id,
        recu: r.recu,
        nom: r.nom,
        prenom: r.prenom,
        enveloppe: r.enveloppe,
      })),
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

// -----------------------------------------------------------------------------
// Remise au Siege — EF-FIN-30
// -----------------------------------------------------------------------------

export interface ResultatRemise {
  readonly reference: string;
  readonly collectes: number;
}

/**
 * Remet un lot de collectes au Siege — EF-FIN-30.
 *
 * L'ecriture passe par `fn_remettre_collectes` : le bordereau et le
 * rattachement des collectes sont INDISSOCIABLES (regle 20). L'un sans l'autre
 * laisserait soit un bordereau vide — un papier qui ne prouve rien —, soit des
 * collectes marquees remises sans document pour l'attester ; on croirait alors
 * l'argent arrive.
 *
 * LE RETARD NE BLOQUE PAS. Les dimes d'un culte doivent parvenir dans la
 * semaine, mais refuser une remise tardive empecherait de regulariser —
 * exactement l'inverse du but.
 */
export async function remettreCollectes(
  input: unknown,
): Promise<ActionResult<ResultatRemise>> {
  return executerAction('remettreCollectes', async () => {
    const session = await requireSession();

    const analyse = remettreCollectesSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Demande invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const arbre = await getArbrePerimetre();
    if (arbre.length === 0) {
      return ko("La structure n'a pas pu etre chargee. Reessayez.");
    }

    const entite = arbre.find((e) => e.id === data.entiteId);
    if (!entite) return ko('Cette entite est introuvable ou hors de votre perimetre.');

    // Verifie ICI pour l'expliquer, dans la fonction SQL pour l'empecher.
    await requirePermission(session, 'finance.dime.collect', entite.path);

    const sb = await createClient();

    const { data: resultat, error } = await sb.rpc('fn_remettre_collectes', {
      p_entite: data.entiteId,
      p_collectes: data.collecteIds,
      p_porteur: data.porteurId,
      p_date_remise: data.dateRemise.toISOString().slice(0, 10),
      p_observation: data.observation ? sanitize(data.observation) : null,
    });

    if (error) return ko(messageErreurSql(error));

    const ligne = (
      resultat as { remise_id: string; reference: string; collectes: number }[]
    )?.[0];

    if (!ligne) return ko("Le bordereau n'a pas pu etre etabli.");

    await auditer({
      session,
      action: 'CREATE',
      table: 'dime_remises',
      recordId: ligne.remise_id,
      entityId: data.entiteId,
      diff: {
        apres: {
          reference: ligne.reference,
          collectes: ligne.collectes,
          date: data.dateRemise.toISOString().slice(0, 10),
        },
      },
    });

    revalidatePath('/finances');
    revalidatePath('/finances/dimes');

    return ok({ reference: ligne.reference, collectes: ligne.collectes });
  });
}

// -----------------------------------------------------------------------------
// Import d'une feuille de versements — EF-FIN-34
// -----------------------------------------------------------------------------

export interface ResultatImportVersements {
  readonly mouvementId: string;
  /** Lignes reellement enregistrees. */
  readonly enregistrees: number;
  /** Montant total de la collecte importee. */
  readonly total: number;
  /** Lignes portant un nom qu'aucune fiche ne reconnait — a resoudre. */
  readonly aRapprocher: number;
  /** Lignes ECARTEES : elles ne portaient aucun montant exploitable. */
  readonly ecartees: { readonly ligne: number; readonly motif: string }[];
  readonly recus: number;
}

/**
 * Importe une feuille de versements — EF-FIN-34.
 *
 * LE SERVEUR REANALYSE TOUT. Le navigateur a deja produit un apercu, mais cet
 * apercu lui appartient : rien n'empeche d'envoyer des lignes qui ne l'ont
 * jamais traverse. Le rapprochement se refait donc ici, contre les donateurs
 * REELS.
 *
 * AUCUNE LIGNE PORTANT UN MONTANT N'EST REJETEE. Elle represente de l'argent
 * deja recu : l'enveloppe est dans l'urne, elle ne disparaitra pas parce que le
 * fichier est imparfait. Un nom inconnu donne un versement anonyme ET une ligne
 * a rapprocher — le montant compte des maintenant, le nom se retrouve ensuite.
 */
export async function importerVersementsDime(
  input: unknown,
): Promise<ActionResult<ResultatImportVersements>> {
  return executerAction('importerVersementsDime', async () => {
    const session = await requireSession();

    const analyse = importerVersementsSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    if (data.lignes.length === 0) return ko('Le fichier ne contient aucune ligne.');

    // Trois lectures INDEPENDANTES, donc simultanees (regle 28).
    const [arbre, categories, donateurs] = await Promise.all([
      getArbrePerimetre(),
      listerCategoriesFinance(),
      chargerDonateurs(),
    ]);

    if (arbre.length === 0) {
      return ko("La structure n'a pas pu etre chargee. Reessayez.");
    }

    const hote = arbre.find((e) => e.id === data.entiteCollecteId);
    if (!hote) return ko('Cette entite est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'finance.dime.collect', hote.path);

    const categorieId = trouverCategorieDime(
      categories as { id: string; libelle: string; code?: string }[],
    );
    if (!categorieId) {
      return ko(
        'Aucune categorie de dime dans le referentiel. Creez-la dans '
          + 'Referentiels > Categories financieres, puis reessayez.',
      );
    }

    /**
     * L'EGLISE SE RECONNAIT CONTRE L'ARBRE DEJA CHARGE — aucune lecture de
     * plus (regle 28). Seules les EGLISES entrent dans l'index : le fichier
     * designe l'eglise de rattachement d'une personne, et un croyant ne se
     * rattache pas a un district (RG-05).
     */
    const rapport = analyserVersements(
      data.lignes,
      data.correspondance as CorrespondanceVersement,
      indexerDonateurs(donateurs.donateurs),
      indexerEglises(arbre.filter((e) => e.type === 'EGLISE')),
    );

    if (rapport.retenues.length === 0) {
      return ko(
        'Aucune ligne exploitable : verifiez la colonne du montant dans la '
          + 'correspondance.',
      );
    }

    const sb = await createClient();

    const { data: resultat, error } = await sb.rpc('fn_saisir_collecte_dime', {
      p_entite_collecte: data.entiteCollecteId,
      p_categorie: categorieId,
      p_date_operation: data.dateOperation.toISOString().slice(0, 10),
      p_evenement: data.evenement,
      p_libelle: data.libelle ? sanitize(data.libelle) : null,
      p_reference: data.reference ? sanitize(data.reference) : null,
      p_versements: rapport.retenues.map((l) => ({
        croyant_id: l.croyantId,
        montant: l.montant,
        enveloppe: l.enveloppe ? sanitize(l.enveloppe) : null,
        nature: l.nature,
        // EF-FIN-34 — ce que le fichier disait, conserve TEL QUEL : c'est
        // contre lui que le rapprochement se fera.
        nom_source: l.nomSource ? sanitize(l.nomSource) : null,
        prenom_source: l.prenomSource ? sanitize(l.prenomSource) : null,
        // EF-FIN-34 — l'eglise lue amorce la creation de fiche. Le libelle
        // part meme quand rien ne le reconnait : il suffit souvent a trancher.
        eglise_source: l.egliseSource ? sanitize(l.egliseSource) : null,
        eglise_id: l.egliseId,
      })),
    });

    if (error) return ko(messageErreurSql(error));

    const ligne = (
      resultat as { finance_entry_id: string; recus: unknown[] }[]
    )?.[0];

    if (!ligne) return ko("La collecte n'a pas pu etre enregistree.");

    const aRapprocher = rapport.retenues.filter((l) => l.aRapprocher).length;

    await auditer({
      session,
      action: 'CREATE',
      table: 'finance_entries',
      recordId: ligne.finance_entry_id,
      entityId: data.entiteCollecteId,
      diff: {
        apres: {
          dime: true,
          import: true,
          lignes: rapport.retenues.length,
          total: rapport.total,
          aRapprocher,
          ecartees: rapport.ecartees.length,
        },
      },
    });

    revalidatePath('/finances');
    revalidatePath('/finances/dimes');
    revalidatePath('/croyants');

    return ok({
      mouvementId: ligne.finance_entry_id,
      enregistrees: rapport.retenues.length,
      total: rapport.total,
      aRapprocher,
      ecartees: rapport.ecartees,
      recus: (ligne.recus ?? []).length,
    });
  });
}

// -----------------------------------------------------------------------------
// Resolution d'un rapprochement — EF-FIN-34
// -----------------------------------------------------------------------------

const resoudreSchema = z.object({
  rapprochementId: z.uuid(),
  croyantId: z.uuid('Selectionnez le croyant.'),
});

/**
 * Rattache une ligne d'import a une fiche — EF-FIN-34.
 *
 * `fn_resoudre_rapprochement` fait les DEUX ecritures (regle 20) : le versement
 * devient nominatif ET la ligne se ferme. L'une sans l'autre laisserait soit un
 * versement attribue que la file garde pour non resolu, soit une file vide pour
 * un versement toujours anonyme.
 *
 * LE RECU EST EMIS A CE MOMENT : c'est maintenant qu'il y a quelqu'un a qui le
 * remettre.
 */
export async function resoudreRapprochement(
  input: unknown,
): Promise<ActionResult<{ recu: string }>> {
  return executerAction('resoudreRapprochement', async () => {
    const session = await requireSession();

    const analyse = resoudreSchema.safeParse(input);
    if (!analyse.success) return ko('Demande invalide.');
    const data = analyse.data;

    const sb = await createClient();

    const { data: recu, error } = await sb.rpc('fn_resoudre_rapprochement', {
      p_rapprochement: data.rapprochementId,
      p_croyant: data.croyantId,
    });

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'dime_rapprochements',
      recordId: data.rapprochementId,
      diff: { apres: { croyant_id: data.croyantId, recu } },
    });

    revalidatePath('/croyants');
    revalidatePath('/finances/dimes');

    return ok({ recu: String(recu ?? '') });
  });
}
