import type { ActionResult } from '@/lib/domain/result';

/**
 * Contrat d'authentification — ENF-POR-02.
 *
 * SEUL module a reecrire en cas de changement de fournisseur d'identite.
 * Le modele metier ne connait que `profiles.auth_user_id` : aucune table, aucune
 * politique RLS, aucun composant ne depend du schema `auth` de l'hebergeur.
 */

export interface IdentiteAuth {
  /** Identifiant chez le fournisseur — correspond a `profiles.auth_user_id`. */
  readonly authUserId: string;
  readonly email: string;
}

export interface AuthAdapter {
  /** Identite courante, ou `null` si la session est absente ou expiree. */
  getIdentite(): Promise<IdentiteAuth | null>;

  signIn(email: string, motDePasse: string): Promise<ActionResult<IdentiteAuth>>;

  signOut(): Promise<ActionResult<void>>;

  /** EF-AUT-02 — lien valide 60 minutes, a usage unique. */
  demanderReinitialisation(email: string, urlRetour: string): Promise<ActionResult<void>>;

  /** Applique le nouveau mot de passe pour la session de recuperation en cours. */
  appliquerNouveauMotDePasse(motDePasse: string): Promise<ActionResult<void>>;

  /** EF-ADM-01 — cree l'identite. Le `profile` associe est cree separement. */
  creerIdentite(
    email: string,
    motDePasseProvisoire: string,
  ): Promise<ActionResult<IdentiteAuth>>;

  /** EF-ADM-08 — reinitialisation administrative d'un mot de passe. */
  reinitialiserMotDePasseAdmin(
    authUserId: string,
    motDePasse: string,
  ): Promise<ActionResult<void>>;
}

/**
 * ENF-SEC-03 — politique de mot de passe.
 * Appliquee a la saisie ET revalidee cote serveur.
 */
export const MOT_DE_PASSE_LONGUEUR_MIN = 12;

export function validerRobustesseMotDePasse(motDePasse: string): ActionResult<void> {
  const manques: string[] = [];

  if (motDePasse.length < MOT_DE_PASSE_LONGUEUR_MIN) {
    manques.push(`${MOT_DE_PASSE_LONGUEUR_MIN} caracteres minimum`);
  }
  if (!/[a-z]/.test(motDePasse)) manques.push('une minuscule');
  if (!/[A-Z]/.test(motDePasse)) manques.push('une majuscule');
  if (!/[0-9]/.test(motDePasse)) manques.push('un chiffre');

  return manques.length === 0
    ? { ok: true, data: undefined }
    : { ok: false, error: `Le mot de passe doit contenir ${manques.join(', ')}.` };
}
