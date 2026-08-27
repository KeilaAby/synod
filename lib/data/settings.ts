import 'server-only';

import { cache } from 'react';

import {
  COULEUR_PRIMAIRE_DEFAUT,
  NOTIFICATIONS_DEFAUT,
  POSITION_TOAST_DEFAUT,
} from '@/lib/domain/apparence';
import { JOURS_CORRECTION_SAISIE_DEFAUT } from '@/lib/domain/delai-correction';
import { createClient } from '@/lib/supabase/server';

/**
 * Parametres globaux de l'organisation — EF-ADM-11.
 *
 * Une seule ligne (`id = 1`), lisible par tout compte authentifie et modifiable
 * par `settings.manage` seulement. Memoise par requete : ces valeurs sont lues
 * par plusieurs actions d'un meme rendu.
 */

export interface Parametres {
  nom_organisation: string;
  /** Clé relative (règle 11), ou `null` — posé depuis `0006`, resté sans écran jusqu'ici. */
  logo_key: string | null;
  devise: string;
  fuseau_horaire: string;
  /** ARB-5 / RG-30 — fenetre « nouveaux baptises », 15 jours par defaut. */
  fenetre_nouveaux_baptises_jours: number;
  /** ARB-3 — workflow de validation financiere. */
  finance_validation_active: boolean;
  /** EF-CRO-12 — la promotion de grade passe-t-elle par l entite superieure ? */
  promotion_grade_validation: boolean;
  /**
   * EF-BAP-07, EF-CRO-11 — les deux plafonds d'import (migration `0079`).
   *
   * DEUX REGLAGES ET NON UN : un lot de baptemes est UNE CEREMONIE, un
   * import de croyants une REPRISE DE DONNEES. Les confondre ferait
   * qu'elargir une reprise de dix mille fiches autoriserait aussi des
   * ceremonies de dix mille baptises.
   */
  plafond_lot_baptemes: number;
  plafond_import_croyants: number;
  separation_saisie_validation: boolean;
  /** ARB-4 / EF-TRF-05 — auto-approbation des transferts internes. */
  transfert_auto_approbation_interne: boolean;
  /** EF-RAP-07 — les entites composent-elles leurs propres modeles ? */
  rapport_composition_libre: boolean;
  /** EF-AUT-02 — la reinitialisation passe-t-elle par un courriel ? */
  reinitialisation_par_email: boolean;
  /**
   * EF-ADM-13 — apparence et notifications, reglees au lieu d'etre ecrites.
   *
   * La couleur du TEXTE des boutons n'est pas ici : elle se deduit de celle du
   * fond (`texteSurCouleur`). La laisser saisir permettrait de poser du blanc
   * sur du jaune.
   */
  couleur_primaire: string;
  toast_duree_ms: number;
  toast_bouton_fermer: boolean;
  toast_couleurs_vives: boolean;
  toast_position: string;
  /**
   * EF-BUR-08, EF-CRO-12 — le delai de correction de saisie, PARTAGE par le
   * retrait d'un titulaire de bureau et la correction d'un grade. Deux
   * constantes a 15 jours, ecrites separement, sont devenues un seul reglage
   * (migration 0069).
   */
  jours_correction_saisie: number;
}

/**
 * Repli en cas de lecture impossible.
 *
 * Les valeurs sont volontairement PRUDENTES, et non celles de la base : une
 * panne de lecture ne doit jamais ELARGIR un droit. `transfert_auto_approbation_interne`
 * vaut donc `false` ici, la ou la base le met a `true` — a defaut de savoir, on
 * demande une approbation explicite plutot que de l'accorder.
 */
const REPLI: Parametres = {
  nom_organisation: 'SYNOD',
  logo_key: null,
  devise: 'MGA',
  fuseau_horaire: 'Indian/Antananarivo',
  fenetre_nouveaux_baptises_jours: 15,
  finance_validation_active: false,
  // Ferme par defaut : une panne de lecture ne doit jamais OUVRIR un circuit
  // qui n existait pas, ni le fermer pour ceux qui l ont voulu.
  promotion_grade_validation: false,
  // Les valeurs qui etaient en dur avant le reglage : un repli qui
  // elargirait le plafond laisserait passer, en cas de panne de lecture, ce
  // que personne n’a autorise.
  plafond_lot_baptemes: 100,
  plafond_import_croyants: 5000,
  separation_saisie_validation: true,
  transfert_auto_approbation_interne: false,
  /**
   * `false` la ou la base met `true` — meme prudence que les lignes au-dessus.
   *
   * Ce que l'ECRAN en dit doit rester vrai malgre tout : il annonce « la
   * composition n'est pas ouverte a votre entite », un etat, et non « le Siege
   * l'a fermee », un diagnostic qu'une panne de lecture rendrait faux
   * (regle 15).
   */
  rapport_composition_libre: false,
  /**
   * `false` en repli, comme les autres : une panne de lecture ne doit jamais
   * ELARGIR un droit. Fermer le circuit par courriel renvoie vers un humain,
   * ce qui est prudent ; l'ouvrir a tort enverrait des liens de
   * reinitialisation sur des adresses que l'organisation a peut-etre
   * volontairement cesse d'employer.
   */
  reinitialisation_par_email: false,
  /**
   * L'APPARENCE RETOMBE SUR CELLE DU CODE.
   *
   * Ce repli-ci n'obeit pas a la prudence des precedents — il n'y a pas de
   * droit a ELARGIR dans une couleur. Ce qu'il evite est autre chose : une
   * couleur vide donnerait des boutons transparents, et une duree nulle des
   * notifications qui disparaissent avant d'etre lues. Une panne de lecture
   * doit rendre l'application ORDINAIRE, jamais illisible.
   */
  couleur_primaire: COULEUR_PRIMAIRE_DEFAUT,
  toast_duree_ms: NOTIFICATIONS_DEFAUT.dureeMs,
  toast_bouton_fermer: NOTIFICATIONS_DEFAUT.boutonFermer,
  toast_couleurs_vives: NOTIFICATIONS_DEFAUT.couleursVives,
  toast_position: POSITION_TOAST_DEFAUT,
  jours_correction_saisie: JOURS_CORRECTION_SAISIE_DEFAUT,
};

export const getParametres = cache(async (): Promise<Parametres> => {
  const sb = await createClient();

  const { data, error } = await sb
    .from('organisation_settings')
    .select(
      'nom_organisation, logo_key, devise, fuseau_horaire, fenetre_nouveaux_baptises_jours, ' +
        'finance_validation_active, separation_saisie_validation, ' +
        'transfert_auto_approbation_interne, rapport_composition_libre, ' +
        'promotion_grade_validation, ' +
        'plafond_lot_baptemes, plafond_import_croyants, ' +
        'reinitialisation_par_email, couleur_primaire, toast_duree_ms, ' +
        'toast_bouton_fermer, toast_couleurs_vives, toast_position, ' +
        'jours_correction_saisie',
    )
    .eq('id', 1)
    .maybeSingle<Parametres>();

  if (error || !data) return REPLI;
  return data;
});
