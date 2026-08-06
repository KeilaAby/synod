import 'server-only';

import { ko, ok } from '@/lib/domain/result';
import { createAdminClient, createClient } from '@/lib/supabase/server';

import type { AuthAdapter, IdentiteAuth } from './types';

/**
 * Implementation Supabase du contrat d'authentification — ENF-POR-02.
 *
 * C'est le SEUL fichier de la couche auth qui nomme Supabase. Pour migrer vers
 * Auth.js, Keycloak ou un autre fournisseur, il suffit d'ecrire un frere de ce
 * fichier et de changer la selection dans `lib/auth/index.ts`.
 *
 * Les messages d'erreur sont volontairement generiques a la connexion : ne
 * jamais indiquer si c'est l'adresse ou le mot de passe qui est faux
 * (enumeration de comptes).
 */

function versIdentite(user: { id: string; email?: string | null }): IdentiteAuth {
  return { authUserId: user.id, email: user.email ?? '' };
}

export const supabaseAuthAdapter: AuthAdapter = {
  async getIdentite() {
    const sb = await createClient();
    // `getUser()` revalide le jeton aupres du serveur d'identite ; `getSession()`
    // se contenterait du cookie, qui peut avoir ete forge.
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) return null;
    return versIdentite(data.user);
  },

  async signIn(email, motDePasse) {
    const sb = await createClient();
    const { data, error } = await sb.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: motDePasse,
    });

    if (error || !data.user) {
      return ko('Adresse e-mail ou mot de passe incorrect.');
    }
    return ok(versIdentite(data.user));
  },

  async signOut() {
    const sb = await createClient();
    const { error } = await sb.auth.signOut();
    return error ? ko('La deconnexion a echoue. Reessayez.') : ok();
  },

  async demanderReinitialisation(email, urlRetour) {
    const sb = await createClient();
    const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: urlRetour,
    });

    // EF-AUT-02 : on retourne un succes meme si l'adresse est inconnue,
    // pour ne pas reveler quels comptes existent.
    if (error) {
      console.error('[auth] demande de reinitialisation', error.message);
    }
    return ok();
  },

  async appliquerNouveauMotDePasse(motDePasse) {
    const sb = await createClient();
    const { error } = await sb.auth.updateUser({ password: motDePasse });
    return error
      ? ko("Le lien de reinitialisation est invalide ou expire. Demandez-en un nouveau.")
      : ok();
  },

  async creerIdentite(email, motDePasseProvisoire) {
    const sb = createAdminClient();
    const { data, error } = await sb.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: motDePasseProvisoire,
      email_confirm: true,
    });

    if (error || !data.user) {
      return ko(error?.message ?? "La creation du compte a echoue.");
    }
    return ok(versIdentite(data.user));
  },

  async reinitialiserMotDePasseAdmin(authUserId, motDePasse) {
    const sb = createAdminClient();
    const { error } = await sb.auth.admin.updateUserById(authUserId, {
      password: motDePasse,
    });
    return error ? ko("La reinitialisation a echoue.") : ok();
  },
};
