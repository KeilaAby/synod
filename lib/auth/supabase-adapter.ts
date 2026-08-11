import 'server-only';

import { DataError } from '@/lib/data/errors';
import { ko, ok } from '@/lib/domain/result';
import { MESSAGE_PANNE_RESEAU, estPanneReseau } from '@/lib/supabase/reseau';
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

    /**
     * VERIFICATION LOCALE du jeton — ENF-PRF-01.
     *
     * `getUser()` interrogeait le serveur d'identite a chaque RENDU DE PAGE, en
     * plus de l'appel deja fait par le proxy : deux allers-retours reseau avant
     * la moindre lecture metier. Le 11 aout 2026, `/bureaux` s'en trouvait
     * refusee — « The operation was aborted due to timeout » — sur un lien dont
     * un aller-retour se mesure entre 0,5 et 4 secondes.
     *
     * `getClaims()` lit la session dans le cookie, la rafraichit si elle a
     * expire, puis VERIFIE LA SIGNATURE du jeton avec la cle publique du projet.
     * La garantie est la meme qu'avec `getUser()` — un cookie forge ne passe
     * pas —, sans appel reseau tant que le jeton est valide. Si le projet signe
     * encore en HS256, la bibliotheque retombe d'elle-meme sur `getUser()`.
     */
    const { data, error } = await sb.auth.getClaims();

    /**
     * Une panne RESEAU n'est pas une session absente.
     *
     * Rendre `null` faisait dire « Votre session a expire. Reconnectez-vous. »
     * a la moindre coupure ou au moindre depassement de delai — un message
     * faux, qui envoie l'utilisateur se reconnecter alors qu'il est connecte,
     * et lui fait perdre ce qu'il etait en train de faire. On leve : l'appelant
     * dira que la base est injoignable, ce qui est la verite (cf. RG-15 pour
     * l'idee generale : une absence de donnee n'est pas un refus).
     */
    if (error && estPanneReseau(error)) {
      throw new DataError(MESSAGE_PANNE_RESEAU, error);
    }

    if (error || !data?.claims) return null;

    // `sub` porte l'identifiant du compte, `email` la revendication associee.
    return versIdentite({
      id: String(data.claims.sub),
      email: typeof data.claims.email === 'string' ? data.claims.email : null,
    });
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
