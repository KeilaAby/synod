'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { envoyerMessage } from '@/lib/courriel/smtp';
import { ALL_PERMISSIONS } from '@/lib/domain/permissions';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitize, sanitizeAll, sanitizeTexteRiche } from '@/lib/utils/sanitize';
import { champsEnErreur } from '@/lib/validation/zod-errors';

import { executerAction } from './executer';

/**
 * Configuration d'envoi, modeles de message et profils — EF-ADM-13.
 *
 * TOUT EST RESERVE A `settings.manage`, non delegable : ces reglages decrivent
 * l'infrastructure et les decoupages de droits de toute l'organisation. La RLS
 * des trois tables le dit aussi — ces actions ne font que rendre le refus
 * lisible avant qu'il ne vienne de la base.
 */

/** Un texte vide vaut ABSENT, jamais chaine vide (regle 12). */
const optionnel = z
  .preprocess((v) => {
    const normalise = typeof v === 'string' ? v.trim() : v;
    return normalise === '' || normalise === null ? undefined : normalise;
  }, z.string().max(200).optional())
  .transform((v) => v ?? null);

const configurationSchema = z.object({
  actif: z.boolean(),
  hote: optionnel,
  /**
   * Borne a l'intervalle des ports valides. 587 (STARTTLS), 465 (TLS) et 25
   * couvrent l'immense majorite ; on ne les impose pas, certains hebergeurs
   * ecoutent ailleurs.
   */
  port: z.coerce.number().int().min(1).max(65535),
  securite: z.enum(['AUCUNE', 'STARTTLS', 'TLS']),
  utilisateur: optionnel,
  expediteurNom: optionnel,
  expediteurEmail: optionnel,
});

/**
 * EF-ADM-13 — enregistrer la configuration d'envoi.
 *
 * LE MOT DE PASSE NE PASSE PAS PAR ICI, et n'a aucun champ. Il vit dans la
 * variable d'environnement `SMTP_PASS` : un secret range en base finit dans
 * une sauvegarde, un export ou un journal de requetes. C'est la seule partie de
 * cette configuration qui ne se regle pas a l'ecran, et c'est voulu.
 */
export async function reglerCourriel(input: unknown): Promise<ActionResult<void>> {
  return executerAction('reglerCourriel', async () => {
    const session = await requireSession();
    await requirePermission(session, 'settings.manage');

    const analyse = configurationSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const v = analyse.data;

    /**
     * ACTIVER SANS HOTE NI EXPEDITEUR NE VEUT RIEN DIRE.
     *
     * Le refus se pose ici plutot qu'en base : une contrainte SQL aurait dit
     * « violation de contrainte », la ou l'utilisateur a besoin de savoir QUEL
     * champ manque. Inactif, en revanche, tout peut rester vide — on prepare la
     * configuration sans l'armer.
     */
    if (v.actif && (!v.hote || !v.expediteurEmail)) {
      return ko(
        'Pour activer l’envoi, il faut au moins un serveur et une adresse d’expedition : ' +
          'sans eux, aucun message ne pourrait partir.',
      );
    }

    const ligne = sanitizeAll({
      actif: v.actif,
      hote: v.hote,
      port: v.port,
      securite: v.securite,
      utilisateur: v.utilisateur,
      expediteur_nom: v.expediteurNom,
      expediteur_email: v.expediteurEmail,
    });

    const sb = await createClient();
    const { error } = await sb.from('email_settings').update(ligne).eq('id', 1);

    if (error) return ko("La configuration n'a pas pu etre enregistree.");

    await auditer({
      session,
      action: 'UPDATE',
      table: 'email_settings',
      diff: { apres: ligne },
    });

    revalidatePath('/administration/parametres');
    return ok();
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-ADM-13 — ENVOYER UN MESSAGE DE TEST.
 *
 * C'EST LA SEULE FACON DE SAVOIR SI LA CONFIGURATION MARCHE. Un hote, un port
 * et un mot de passe n'ont aucune apparence de justesse : ils sont plausibles
 * ou faux, et rien ne les distingue avant qu'un message ne parte. Le decouvrir
 * le jour ou l'application enverra vraiment, c'est le decouvrir quand personne
 * n'a rien recu.
 *
 * ON TESTE CE QU'ON SAISIT, PAS CE QUI EST ENREGISTRE. Les valeurs viennent du
 * formulaire : essayer avant d'enregistrer est precisement l'usage — sinon il
 * faudrait sauvegarder une configuration qu'on sait douteuse pour pouvoir la
 * verifier.
 */
export async function testerCourriel(
  input: unknown,
): Promise<ActionResult<{ message: string }>> {
  return executerAction('testerCourriel', async () => {
    const session = await requireSession();
    await requirePermission(session, 'settings.manage');

    const analyse = configurationSchema
      .extend({ destinataire: z.email('Adresse de destination invalide.') })
      .safeParse(input);

    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const v = analyse.data;

    if (!v.hote || !v.expediteurEmail) {
      return ko(
        'Renseignez au moins le serveur et l’adresse d’expedition avant de tester : ' +
          'sans eux, il n’y a rien a essayer.',
      );
    }

    const resultat = await envoyerMessage(
      {
        hote: v.hote,
        port: v.port,
        securite: v.securite,
        utilisateur: v.utilisateur,
        expediteurNom: v.expediteurNom,
        expediteurEmail: v.expediteurEmail,
      },
      v.destinataire,
      'Test de configuration — SYNOD',
      '<p>Ce message confirme que la configuration d’envoi de SYNOD fonctionne.</p>' +
        '<p>Aucune action n’est attendue de votre part.</p>',
    );

    /**
     * L'ESSAI EST JOURNALISE, REUSSI OU NON. Un test qui echoue est une
     * information : il dit qu'a telle heure, quelqu'un a constate que l'envoi ne
     * marchait pas. Ne garder que les succes ferait croire, en relisant, que
     * personne n'avait rien vu.
     */
    await auditer({
      session,
      action: 'UPDATE',
      table: 'email_settings',
      diff: {
        essai: true,
        destinataire: v.destinataire,
        aboutit: resultat.ok,
        // Le detail technique aide a diagnostiquer trois jours plus tard.
        detail: resultat.message,
      },
    });

    return resultat.ok
      ? ok({ message: `Message envoye a ${v.destinataire}. Verifiez la boite de reception.` })
      : ko(
          `L’envoi a echoue : ${resultat.message}. Verifiez le serveur, le port, le mode ` +
            'de chiffrement, et que le mot de passe est bien pose sur le serveur ' +
            '(variable SMTP_PASS).',
        );
  });
}

// -----------------------------------------------------------------------------

const modeleSchema = z.object({
  cle: z.string().min(1).max(64),
  sujet: z.string().trim().min(1, 'Le sujet est requis.').max(200),
  corps: z.string().trim().min(1, 'Le corps du message est requis.').max(5000),
  actif: z.boolean(),
});

/**
 * EF-ADM-13 — enregistrer un modele de message.
 *
 * LA CLE NE SE MODIFIE PAS : c'est elle que le code emploiera pour retrouver le
 * modele au moment d'envoyer. La renommer depuis l'ecran romprait le lien sans
 * qu'aucun message d'erreur ne le signale — l'envoi echouerait plus tard, en
 * silence.
 *
 * NI LE LIBELLE NI LA DESCRIPTION non plus : ils disent a quoi sert le modele,
 * ce que l'utilisateur n'a pas a redefinir. Ce qui se regle, c'est le TEXTE.
 */
export async function enregistrerModeleCourriel(
  input: unknown,
): Promise<ActionResult<void>> {
  return executerAction('enregistrerModeleCourriel', async () => {
    const session = await requireSession();
    await requirePermission(session, 'settings.manage');

    const analyse = modeleSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const v = analyse.data;

    const sb = await createClient();
    const { error } = await sb
      .from('email_templates')
      /**
       * LE CORPS EST DU TEXTE RICHE, le sujet non.
       *
       *  echappe tout — il transformerait les balises de mise en
       * forme en texte visible.  echappe puis RETABLIT la
       * liste blanche : gras, italique, listes, paragraphes. Ce qui n'y figure
       * pas reste inerte.
       */
      .update({
        sujet: sanitize(v.sujet),
        corps: sanitizeTexteRiche(v.corps),
        actif: v.actif,
      })
      .eq('cle', v.cle);

    if (error) return ko("Le modele n'a pas pu etre enregistre.");

    await auditer({
      session,
      action: 'UPDATE',
      table: 'email_templates',
      diff: { cle: v.cle, apres: { sujet: v.sujet, actif: v.actif } },
    });

    revalidatePath('/administration/parametres');
    return ok();
  });
}

// -----------------------------------------------------------------------------

const profilSchema = z.object({
  /** Absent : creation. Present : modification. */
  id: z.union([z.uuid(), z.null()]).default(null),
  nom: z.string().trim().min(2, 'Le nom du profil est requis.').max(80),
  description: optionnel,
  permissions: z.array(z.string()).max(64).default([]),
});

/**
 * EF-ADM-04 — enregistrer un profil de privileges.
 *
 * UN PROFIL N'ACCORDE RIEN PAR LUI-MEME. Il ne fait que POSER des cases dans le
 * formulaire d'un compte ; c'est ce formulaire, et lui seul, qui verifie
 * `peutDeleguer` droit par droit. On peut donc definir ici un profil plus large
 * que ce qu'un administrateur de district pourra en tirer : chez lui, les
 * droits hors de sa portee resteront simplement eteints.
 *
 * RESERVE AU SIEGE, et pas seulement a `settings.manage`.
 *
 * Un profil est GLOBAL : il n'appartient a aucune entite, et il apparait dans
 * le formulaire de compte de TOUTES. Un district qui en creerait un le poserait
 * donc sous les yeux du Siege et de ses entites soeurs, sans qu'aucune l'ait
 * demande — c'est un vocabulaire commun, et un vocabulaire commun se decide au
 * meme endroit pour tout le monde.
 *
 * `settings.manage` est non delegable, donc en pratique le Siege est seul a le
 * detenir. Mais « en pratique » n'est pas une garantie : la regle qu'on veut
 * tenir s'ecrit, sinon elle depend d'une autre qui pourrait changer.
 */
export async function enregistrerProfil(input: unknown): Promise<ActionResult<void>> {
  return executerAction('enregistrerProfil', async () => {
    const session = await requireSession();
    await requirePermission(session, 'settings.manage');

    if (session.entiteType !== 'SIEGE') {
      return ko(
        'Les profils de privilèges sont communs à toute l’organisation : ils se ' +
          'définissent au Siège. Vos habilitations restent modifiables compte ' +
          'par compte.',
      );
    }

    const analyse = profilSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const v = analyse.data;

    // Un droit inconnu vient d'une version anterieure : on l'ecarte plutot que
    // de le conserver, sinon il resterait dans la colonne sans jamais servir.
    const permissions = v.permissions.filter((p) =>
      (ALL_PERMISSIONS as readonly string[]).includes(p),
    );

    const ligne = sanitizeAll({
      nom: v.nom,
      description: v.description,
      permissions,
    });

    const sb = await createClient();

    const { error } = v.id
      ? await sb.from('permission_profiles').update(ligne).eq('id', v.id)
      : await sb
          .from('permission_profiles')
          .insert({ ...ligne, created_by: session.profileId });

    if (error) return ko("Le profil n'a pas pu etre enregistre.");

    await auditer({
      session,
      action: v.id ? 'UPDATE' : 'CREATE',
      table: 'permission_profiles',
      recordId: v.id ?? undefined,
      diff: { apres: ligne },
    });

    revalidatePath('/administration/parametres');
    return ok();
  });
}

/**
 * EF-ADM-04 — supprimer un profil.
 *
 * SANS CONSEQUENCE SUR LES COMPTES. Un profil pose des droits, il ne les
 * detient pas : les comptes qui en ont beneficie gardent les leurs, inscrits
 * un par un dans leurs habilitations. C'est precisement ce qui distingue un
 * raccourci d'un role — et ce qui rend cette suppression sans danger.
 *
 * RESERVEE AU SIEGE, pour la meme raison que la creation : un profil est
 * commun a toute l'organisation. Le retirer le retirerait a tout le monde —
 * n'autoriser que sa creation laisserait la porte ouverte du mauvais cote.
 */
export async function supprimerProfil(input: unknown): Promise<ActionResult<void>> {
  return executerAction('supprimerProfil', async () => {
    const session = await requireSession();
    await requirePermission(session, 'settings.manage');

    if (session.entiteType !== 'SIEGE') {
      return ko(
        'Les profils de privilèges sont communs à toute l’organisation : seul ' +
          'le Siège peut en retirer un.',
      );
    }

    const analyse = z.object({ id: z.uuid() }).safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    await auditer({
      session,
      action: 'DELETE',
      table: 'permission_profiles',
      recordId: analyse.data.id,
    });

    const sb = await createClient();
    const { error } = await sb
      .from('permission_profiles')
      .delete()
      .eq('id', analyse.data.id);

    if (error) return ko("Le profil n'a pas pu etre supprime.");

    revalidatePath('/administration/parametres');
    return ok();
  });
}
