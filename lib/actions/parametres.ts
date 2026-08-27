'use server';

import { revalidatePath } from 'next/cache';

import { getParametres } from '@/lib/data/settings';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { construireCle, storage, verifierFichier } from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';
import { sanitizeAll } from '@/lib/utils/sanitize';
import { parametresSchema } from '@/lib/validation/parametres';
import { champsEnErreur } from '@/lib/validation/zod-errors';

import { executerAction } from './executer';

/**
 * EF-ADM-11, EF-ADM-13 — les parametres generaux de l'organisation.
 *
 * UNE SEULE ACTION POUR TOUT L'ECRAN. EF-ADM-13 demande que les options
 * configurables se reglent au meme endroit ; une action par option aurait
 * produit autant d'allers-retours pour une seule visite (regle 28), et autant
 * d'endroits ou verifier `settings.manage`.
 *
 * `settings.manage` SANS PORTEE, et c'est voulu : ces reglages ne visent aucune
 * entite en particulier, ils valent pour l'organisation entiere. Leur donner
 * une portee laisserait croire qu'on peut changer la devise d'un district sans
 * toucher a celle des autres — ce que la table, qui n'a qu'une ligne, ne sait
 * pas faire. Le droit est d'ailleurs NON DELEGABLE.
 */
export async function reglerParametres(input: unknown): Promise<ActionResult<void>> {
  return executerAction('reglerParametres', async () => {
    const session = await requireSession();
    await requirePermission(session, 'settings.manage');

    const analyse = parametresSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const valeurs = analyse.data;

    // L'etat AVANT, pour que le journal dise ce qui a change — et non
    // seulement ce qui a ete envoye. Un audit qui recopie le formulaire ne
    // permet pas de repondre a « qui a coupe le workflow ? ».
    const avant = await getParametres();

    const ligne = sanitizeAll({
      nom_organisation: valeurs.nomOrganisation,
      devise: valeurs.devise,
      fuseau_horaire: valeurs.fuseauHoraire,
      fenetre_nouveaux_baptises_jours: valeurs.fenetreNouveauxBaptisesJours,
      finance_validation_active: valeurs.financeValidationActive,
      separation_saisie_validation: valeurs.separationSaisieValidation,
      transfert_auto_approbation_interne: valeurs.transfertAutoApprobationInterne,
      promotion_grade_validation: valeurs.promotionGradeValidation,
      rapport_composition_libre: valeurs.rapportCompositionLibre,
      reinitialisation_par_email: valeurs.reinitialisationParEmail,
      /**
       * EF-ADM-13 — apparence et notifications.
       *
       * Ces quatre lignes ont MANQUE au premier jet : le schema les validait,
       * le formulaire les envoyait, et l'`update` ne les reprenait pas.
       * L'enregistrement reussissait donc sans rien changer — la panne la plus
       * ingrate, parce qu'elle ne se signale nulle part.
       *
       * Le typecheck ne pouvait pas la voir : l'objet passe a `.update()` n'est
       * pas type contre la table. C'est le pendant exact de la regle 19 — une
       * action qui n'ecrit pas un champ dont son formulaire est la source.
       */
      couleur_primaire: valeurs.couleurPrimaire,
      toast_duree_ms: valeurs.toastDureeMs,
      toast_bouton_fermer: valeurs.toastBoutonFermer,
      toast_couleurs_vives: valeurs.toastCouleursVives,
      toast_position: valeurs.toastPosition,
      jours_correction_saisie: valeurs.joursCorrectionSaisie,
      plafond_lot_baptemes: valeurs.plafondLotBaptemes,
      plafond_import_croyants: valeurs.plafondImportCroyants,
    });

    const sb = await createClient();
    const { error } = await sb.from('organisation_settings').update(ligne).eq('id', 1);

    if (error) return ko("Les parametres n'ont pas pu etre enregistres.");

    await auditer({
      session,
      action: 'UPDATE',
      table: 'organisation_settings',
      diff: { avant, apres: ligne },
    });

    /**
     * TOUT L'APPLICATIF DEPEND DE CES VALEURS.
     *
     * La devise s'affiche sur chaque montant, le fuseau sur chaque horodatage,
     * le workflow commande des boutons dans les finances, la fenetre des
     * nouveaux baptises un filtre de la liste des croyants. Revalider la seule
     * page des parametres laisserait toutes les autres servir l'ancienne
     * valeur — et le reglage passerait pour decoratif (regle 21).
     */
    revalidatePath('/', 'layout');
    return ok();
  });
}

// -----------------------------------------------------------------------------

/**
 * Le logo de l'organisation — `organisation_settings.logo_key`.
 *
 * POSÉ EN SCHÉMA DEPUIS LA MIGRATION `0006`, SANS ÉCRAN JUSQU'ICI : la colonne
 * existait, rien ne l'écrivait ni ne la lisait. Elle sert désormais de source
 * par défaut au bloc Image des rapports (EF-RAP-02, `notes/todos.md` §4).
 *
 * MÊME PATRON QUE LE LOGO DE L'ATTESTATION (`attestation-transfert.ts`,
 * migration `0070`) : type réel déduit des premiers octets (ENF-SEC-06), clé
 * FIXE (une seule ligne de réglages porte un seul logo, `upsert` écrase
 * l'ancien plutôt que d'en laisser un orphelin).
 *
 * DEUX ACTIONS SÉPARÉES, hors de `reglerParametres` : celle-ci reçoit un
 * `FormData` (un fichier), pas les champs JSON du grand formulaire — les
 * mélanger aurait forcé chaque frappe du formulaire à transporter un fichier
 * qu'elle ne touche pas.
 */
const CLE_LOGO_ORGANISATION = 'organisation';

export async function televerserLogoOrganisation(
  formulaire: FormData,
): Promise<ActionResult<{ logoKey: string }>> {
  return executerAction('televerserLogoOrganisation', async () => {
    const session = await requireSession();
    await requirePermission(session, 'settings.manage');

    const fichier = formulaire.get('logo');
    if (!(fichier instanceof File) || fichier.size === 0) {
      return ko('Aucun fichier reçu.');
    }

    const octets = new Uint8Array(await fichier.arrayBuffer());

    const verdict = verifierFichier('photo', octets.slice(0, 16), octets.byteLength);
    if (!verdict.ok) return ko(verdict.error);

    const extension = verdict.data.split('/')[1] ?? 'webp';
    const cle = construireCle('logos', CLE_LOGO_ORGANISATION, extension);

    const depot = await storage().put(cle, octets, {
      contentType: verdict.data,
      upsert: true,
    });
    if (!depot.ok) return ko(depot.error);

    const sb = await createClient();
    const { error } = await sb.from('organisation_settings').update({ logo_key: depot.data }).eq('id', 1);

    if (error) {
      // L'objet est depose mais le reglage ne le reference pas : on le retire
      // plutot que de laisser un orphelin dans le stockage.
      await storage().delete(depot.data);
      return ko("Le logo n'a pas pu être enregistré.");
    }

    await auditer({
      session,
      action: 'UPDATE',
      table: 'organisation_settings',
      diff: { apres: { logo_key: depot.data } },
    });

    revalidatePath('/', 'layout');
    return ok({ logoKey: depot.data });
  });
}

export async function supprimerLogoOrganisation(): Promise<ActionResult<void>> {
  return executerAction('supprimerLogoOrganisation', async () => {
    const session = await requireSession();
    await requirePermission(session, 'settings.manage');

    const sb = await createClient();
    const { data: actuel } = await sb
      .from('organisation_settings')
      .select('logo_key')
      .eq('id', 1)
      .maybeSingle<{ logo_key: string | null }>();

    if (!actuel?.logo_key) return ok();

    const { error } = await sb.from('organisation_settings').update({ logo_key: null }).eq('id', 1);

    if (error) return ko("Le logo n'a pas pu être retiré.");

    // L'objet part APRES le reglage : si sa suppression echoue, il reste un
    // orphelin dans le stockage, sans consequence — l'inverse laisserait le
    // reglage pointer vers un objet disparu.
    await storage().delete(actuel.logo_key);

    await auditer({
      session,
      action: 'UPDATE',
      table: 'organisation_settings',
      diff: { avant: { logo_key: actuel.logo_key }, apres: { logo_key: null } },
    });

    revalidatePath('/', 'layout');
    return ok();
  });
}
