'use server';

import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, getSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/server';
import {
  connexionSchema,
  demandeReinitialisationSchema,
  estAdresse,
  nouveauMotDePasseSchema,
} from '@/lib/validation/auth';
import { champsEnErreur } from '@/lib/validation/zod-errors';

/**
 * Actions d'authentification — EF-AUT-01 a 04.
 *
 * ENF-SEC-03 : le blocage apres 5 echecs pendant 15 minutes est configure au
 * niveau du fournisseur d'identite (Supabase Auth > Rate limits), et non ici :
 * un compteur applicatif serait contournable en changeant d'instance.
 */

/**
 * EF-AUT-01 — resout un MATRICULE en adresse de connexion.
 *
 * Le chemin est `croyants.matricule` → `profiles.croyant_id` → `profiles.email`.
 * Il passe par le client d'ADMINISTRATION, et il le faut : celui qui se
 * connecte n'est, par definition, pas encore authentifie — la RLS lui refuse
 * `croyants` comme `profiles`. C'est l'un des rares usages legitimes de la clef
 * de service, au meme titre que les invitations.
 *
 * UN MATRICULE INTROUVABLE N'EST PAS UNE ERREUR ICI. On rend l'identifiant tel
 * quel, et l'authentification echoue ensuite avec le message ordinaire.
 * Repondre « ce matricule n'existe pas » transformerait l'ecran de connexion en
 * annuaire : on saurait, sans compte, quels matricules sont enregistres. C'est
 * le meme principe qu'EF-AUT-02 pour la reinitialisation.
 *
 * La lecture est bornee aux comptes ACTIFS : un compte desactive ne doit pas
 * retrouver son adresse par ce chemin.
 */
async function adresseDuCompte(identifiant: string): Promise<string> {
  if (estAdresse(identifiant)) return identifiant;

  try {
    const admin = createAdminClient();

    const { data } = await admin
      .from('croyants')
      .select('profil:profiles!profiles_croyant_id_fkey (email, is_active)')
      .eq('matricule', identifiant.toUpperCase())
      .is('deleted_at', null)
      .maybeSingle<{ profil: { email: string; is_active: boolean }[] | null }>();

    const profil = data?.profil?.find((p) => p.is_active);
    return profil?.email ?? identifiant;
  } catch (erreur) {
    // Une panne de resolution ne doit pas empecher les connexions par ADRESSE
    // de fonctionner : on laisse passer l'identifiant, l'authentification
    // tranchera. Le journal garde la trace.
    console.error('[auth] resolution du matricule impossible', erreur);
    return identifiant;
  }
}

export async function connexion(input: unknown): Promise<ActionResult<void>> {
  const analyse = connexionSchema.safeParse(input);
  if (!analyse.success) {
    return ko('Formulaire invalide.', champsEnErreur(analyse.error));
  }

  const { identifiant, motDePasse, suite } = analyse.data;

  const email = await adresseDuCompte(identifiant);
  const resultat = await auth().signIn(email, motDePasse);
  if (!resultat.ok) return resultat;

  // L'identite est valide : il reste a resoudre le PROFIL applicatif.
  // Un echec ici signifie l'un de deux cas, journalises separement par
  // getSession() : profil absent, ou requete en erreur.
  const session = await getSession();
  if (!session) {
    await auth().signOut();
    return ko(
      "Authentification reussie, mais aucun profil actif n'est rattache a ce compte. " +
        "Contactez l'administrateur du Siege — le detail figure dans les journaux serveur.",
    );
  }

  await auditer({ session, action: 'LOGIN', table: 'profiles', recordId: session.profileId });

  // `redirect` leve : il doit rester hors de tout try/catch.
  redirect(destinationSure(suite));
}

export async function deconnexion(): Promise<never> {
  const session = await getSession();
  if (session) {
    await auditer({ session, action: 'LOGOUT', table: 'profiles', recordId: session.profileId });
  }
  await auth().signOut();
  redirect('/connexion');
}

export async function demanderReinitialisation(input: unknown): Promise<ActionResult<void>> {
  const analyse = demandeReinitialisationSchema.safeParse(input);
  if (!analyse.success) {
    return ko('Adresse e-mail invalide.', champsEnErreur(analyse.error));
  }

  const origine = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  await auth().demanderReinitialisation(analyse.data.email, `${origine}/reinitialiser`);

  // EF-AUT-02 : reponse identique que l'adresse existe ou non,
  // pour ne pas reveler quels comptes sont enregistres.
  return ok();
}

export async function definirNouveauMotDePasse(input: unknown): Promise<ActionResult<void>> {
  const analyse = nouveauMotDePasseSchema.safeParse(input);
  if (!analyse.success) {
    return ko('Mot de passe invalide.', champsEnErreur(analyse.error));
  }

  const resultat = await auth().appliquerNouveauMotDePasse(analyse.data.motDePasse);
  if (!resultat.ok) return resultat;

  const session = await getSession();
  if (session) {
    await auditer({
      session,
      action: 'UPDATE',
      table: 'profiles',
      recordId: session.profileId,
      diff: { champ: 'mot_de_passe' },
    });
  }

  return ok();
}

// -----------------------------------------------------------------------------

/**
 * N'accepte qu'un chemin interne : empeche une redirection ouverte
 * (`/connexion?suite=https://exemple.test`).
 */
function destinationSure(suite: string | undefined): string {
  if (!suite || !suite.startsWith('/') || suite.startsWith('//')) {
    return '/tableau-de-bord';
  }
  return suite;
}
