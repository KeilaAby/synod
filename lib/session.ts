import 'server-only';

import { cache } from 'react';

import { auth } from '@/lib/auth';
import {
  type Permission,
  type SessionUtilisateur,
  type UserRole,
  peut,
  detient,
} from '@/lib/domain/permissions';
import { estDescendant } from '@/lib/domain/hierarchy';
import { DataError } from '@/lib/data/errors';
import { createClient } from '@/lib/supabase/server';
import { MESSAGE_PANNE_RESEAU, estPanneReseau } from '@/lib/supabase/reseau';

/**
 * Session applicative — plan.md §4.3.
 *
 * Chargee UNE SEULE FOIS par requete (React `cache`), puis transmise par
 * contexte au layout. Sans cela, chaque `<PermissionGate>` declencherait un
 * aller-retour en base.
 *
 * Cette couche est un CONFORT et une premiere barriere. Le filet de securite
 * reste la RLS : meme si un controle etait oublie ici, une requete hors
 * perimetre ne retournerait aucune ligne (ENF-SEC-01).
 */

export class ErreurAcces extends Error {
  readonly code = 'ACCES_REFUSE';
  constructor(message: string) {
    super(message);
    this.name = 'ErreurAcces';
  }
}

interface LigneProfil {
  id: string;
  role: UserRole;
  entity_id: string;
  entity: { path: string; nom: string; code: string; type: string } | null;
}

interface LigneOctroi {
  permission: string;
  scope: { path: string } | null;
}

export interface SessionComplete extends SessionUtilisateur {
  readonly email: string;
  readonly nomComplet: string;
  readonly entiteNom: string;
  readonly entiteCode: string;
  readonly entiteType: string;
}

/**
 * Session courante, ou `null` si l'utilisateur n'est pas authentifie ou si son
 * compte a ete desactive.
 */
export const getSession = cache(async (): Promise<SessionComplete | null> => {
  const identite = await auth().getIdentite();
  if (!identite) return null;

  const sb = await createClient();

  // La relation est DESAMBIGUISEE par le nom de la contrainte.
  // Il existe deux cles etrangeres entre `profiles` et `entities` :
  //   profiles.entity_id  -> entities.id   (le rattachement, ce qu'on veut ici)
  //   entities.created_by -> profiles.id   (la tracabilite, ajoutee en 0005)
  // Sans le suffixe `!profiles_entity_id_fkey`, PostgREST refuse l'embed
  // (PGRST201) et la session serait introuvable alors que le profil existe.
  const { data: profil, error } = await sb
    .from('profiles')
    .select(
      'id, role, entity_id, nom_complet, email, entity:entities!profiles_entity_id_fkey(path, nom, code, type)',
    )
    .eq('auth_user_id', identite.authUserId)
    .eq('is_active', true)
    .maybeSingle<LigneProfil & { nom_complet: string; email: string }>();

  if (error) {
    // Une erreur de requete n'est PAS une absence de profil : la confondre
    // avec elle produit un message trompeur pour l'utilisateur.
    console.error('[session] lecture du profil impossible', {
      code: error.code,
      message: error.message,
      details: error.details,
    });

    // Une panne RESEAU se distingue d'un profil absent : rendre `null` ferait
    // rediriger vers /connexion, donc deconnecter l'utilisateur pour une
    // coupure passagere. On leve, et l'appelant affiche un message honnete.
    if (estPanneReseau(error) || estPanneReseau({ message: error.message })) {
      throw new DataError(MESSAGE_PANNE_RESEAU, error);
    }
    return null;
  }

  if (!profil?.entity) return null;

  const { data: octrois, error: erreurOctrois } = await sb
    .from('user_permissions')
    .select('permission, scope:entities!user_permissions_scope_entity_id_fkey(path)')
    .eq('user_id', profil.id)
    .returns<LigneOctroi[]>();

  if (erreurOctrois) {
    // Echouer en FERMETURE : sans la liste des droits, mieux vaut refuser la
    // session que d'ouvrir une session vide qui masquerait toutes les actions
    // sans expliquer pourquoi.
    console.error('[session] lecture des habilitations impossible', {
      code: erreurOctrois.code,
      message: erreurOctrois.message,
    });
    return null;
  }

  return {
    profileId: profil.id,
    role: profil.role,
    entityId: profil.entity_id,
    scopePath: profil.entity.path,
    email: profil.email,
    nomComplet: profil.nom_complet,
    entiteNom: profil.entity.nom,
    entiteCode: profil.entity.code,
    entiteType: profil.entity.type,
    permissions: (octrois ?? []).map((o) => ({
      permission: o.permission as Permission,
      scopePath: o.scope?.path ?? null,
    })),
  };
});

/**
 * Session obligatoire. A utiliser en tete de CHAQUE Server Action.
 * Ne redirige pas : une action doit retourner une erreur exploitable,
 * la redirection est du ressort du middleware et des layouts.
 */
export async function requireSession(): Promise<SessionComplete> {
  const session = await getSession();
  if (!session) {
    throw new ErreurAcces('Votre session a expire. Reconnectez-vous.');
  }
  return session;
}

/**
 * RG-24 / RG-25 — droit detenu ET portee couvrante ET entite dans le perimetre.
 *
 * `cheminEntite` est OBLIGATOIRE des lors que l'action porte sur une entite
 * precise : c'est ce qui distingue « detenir finance.create » de
 * « pouvoir saisir pour CETTE paroisse ».
 */
export async function requirePermission(
  session: SessionUtilisateur,
  permission: Permission,
  cheminEntite?: string,
): Promise<void> {
  const autorise = cheminEntite
    ? peut(session, permission, cheminEntite)
    : detient(session, permission);

  if (!autorise) {
    await auditer({
      session,
      action: 'DENIED',
      table: 'permissions',
      diff: { permission, portee: cheminEntite ?? null },
    });
    throw new ErreurAcces("Vous n'avez pas l'autorisation d'effectuer cette action.");
  }
}

/** RG-20 — l'entite visee appartient-elle au perimetre du compte ? */
export async function requireEntityInScope(
  session: SessionUtilisateur,
  cheminEntite: string,
): Promise<void> {
  if (session.role === 'SUPERADMIN') return;

  if (!estDescendant(cheminEntite, session.scopePath)) {
    await auditer({
      session,
      action: 'DENIED',
      table: 'entities',
      diff: { perimetre: session.scopePath, demande: cheminEntite },
    });
    throw new ErreurAcces("Cet element n'appartient pas a votre perimetre.");
  }
}

// -----------------------------------------------------------------------------
// Audit — EF-ADM-09, ENF-SEC-08, ENF-SEC-11
// -----------------------------------------------------------------------------

export type ActionAudit =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'RESTORE'
  | 'PURGE'
  | 'TRANSFER'
  | 'APPROVE'
  | 'REJECT'
  | 'SUBMIT'
  | 'VALIDATE'
  | 'CANCEL'
  | 'GRANT'
  | 'REVOKE'
  | 'REPORT'
  | 'EXPORT'
  | 'LOGIN'
  | 'LOGOUT'
  | 'DENIED';

interface EntreeAudit {
  session: SessionUtilisateur | null;
  action: ActionAudit;
  table: string;
  recordId?: string;
  entityId?: string;
  diff?: unknown;
}

/**
 * Ecrit une ligne d'audit. Ne leve JAMAIS : un echec de journalisation ne doit
 * pas annuler une operation metier deja effectuee. L'echec est signale dans les
 * logs serveur, ou la supervision le recuperera (ENF-EXP-06).
 *
 * Regle non negociable (plan.md §18.2 n°8) : aucune mutation sans audit.
 */
export async function auditer({
  session,
  action,
  table,
  recordId,
  entityId,
  diff,
}: EntreeAudit): Promise<void> {
  try {
    const sb = await createClient();
    await sb.from('audit_log').insert({
      user_id: session?.profileId ?? null,
      action,
      table_name: table,
      record_id: recordId ?? null,
      entity_id: entityId ?? session?.entityId ?? null,
      diff: diff ? JSON.parse(JSON.stringify(diff)) : null,
    });
  } catch (erreur) {
    console.error('[audit] ecriture impossible', { action, table, erreur });
  }
}
