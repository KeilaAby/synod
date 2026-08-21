'use server';

import { revalidatePath } from 'next/cache';

import { getParametres } from '@/lib/data/settings';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
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
