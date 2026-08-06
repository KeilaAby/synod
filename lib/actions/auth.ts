'use server';

import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, getSession } from '@/lib/session';
import {
  connexionSchema,
  demandeReinitialisationSchema,
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

export async function connexion(input: unknown): Promise<ActionResult<void>> {
  const analyse = connexionSchema.safeParse(input);
  if (!analyse.success) {
    return ko('Formulaire invalide.', champsEnErreur(analyse.error));
  }

  const { email, motDePasse, suite } = analyse.data;

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
