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
import { finDeMandatLaPlusRecente, mandatEchu } from '@/lib/domain/mandat';
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

/**
 * Les mandats du croyant rattache au compte — RG-07.
 *
 * L'embed passe par `croyants`, parce que c'est lui qui siege : un compte n'est
 * pas membre d'un bureau, une personne l'est.
 */
interface LigneMandat {
  date_fin: string | null;
}

export interface SessionComplete extends SessionUtilisateur {
  readonly email: string;
  readonly nomComplet: string;
  readonly entiteNom: string;
  readonly entiteCode: string;
  readonly entiteType: string;
  /**
   * EF-ADM-01, EF-ADM-08 — UN MOT DE PASSE PROVISOIRE EST PROVISOIRE.
   *
   * Qu'il arrive par courriel ou de la main de l'administrateur, un mot de
   * passe que quelqu'un d'autre connait n'en est pas un : il a ete dicte,
   * ecrit, peut-etre relu par un tiers. Tant qu'il n'est pas remplace, le
   * compte est partage sans que personne ne l'ait voulu.
   */
  readonly doitChangerMotDePasse: boolean;
  /**
   * RG-07 — TOUS LES MANDATS DE CE COMPTE ONT PRIS FIN.
   *
   * Seuls les membres de bureau ont un compte. La regle etait tenue a la
   * creation et par nulle part ensuite : un tresorier remplace en mars gardait
   * son acces en decembre. Elle s'evalue desormais a chaque ouverture de
   * session — voir `lib/domain/mandat.ts` pour les deux exceptions.
   */
  readonly mandatEchu: boolean;
  /** La fin de mandat la plus recente, pour que l'ecran puisse la citer. */
  readonly finDeMandat: string | null;
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
  /**
   * UNE seule requete — ENF-PRF-01.
   *
   * Le profil et ses habilitations partaient en deux lectures ENCHAINEES : la
   * seconde attendait l'identifiant rendu par la premiere. Chaque page et
   * chaque Server Action payaient donc deux allers-retours avant leur premier
   * travail utile. L'embed les ramene en un seul.
   */
  const { data: profil, error } = await sb
    .from('profiles')
    .select(
      'id, role, entity_id, nom_complet, email, doit_changer_mot_de_passe, ' +
        'est_responsable_informatique, ' +
        'entity:entities!profiles_entity_id_fkey(path, nom, code, type), ' +
        'octrois:user_permissions!user_permissions_user_id_fkey(' +
        'permission, scope:entities!user_permissions_scope_entity_id_fkey(path)), ' +
        // RG-07 — les mandats voyagent avec le profil : une seconde lecture
        // paierait un aller-retour de plus a CHAQUE page (regle 28).
        'croyant:croyants!profiles_croyant_id_fkey(' +
        'mandats:bureau_membres!bureau_membres_croyant_id_fkey(date_fin))',
    )
    .eq('auth_user_id', identite.authUserId)
    .eq('is_active', true)
    .maybeSingle<
      LigneProfil & {
        nom_complet: string;
        email: string;
        doit_changer_mot_de_passe: boolean;
        est_responsable_informatique: boolean | null;
        octrois: LigneOctroi[];
        croyant: { mandats: LigneMandat[] } | null;
      }
    >();

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

  /**
   * RG-07 — les mandats, evalues ICI et pas dans un ordonnanceur.
   *
   * `mandats` vide n'est PAS « aucun mandat en cours » : c'est « on n'en
   * connait aucun » — fiche non reliee, base anterieure a la regle, lecture
   * bornee. `mandatEchu` ne ferme que sur preuve (regle 15).
   */
  const mandats = profil.croyant?.mandats ?? [];
  const aujourdhui = new Date().toISOString().slice(0, 10);

  return {
    profileId: profil.id,
    role: profil.role,
    entityId: profil.entity_id,
    scopePath: profil.entity.path,
    email: profil.email,
    nomComplet: profil.nom_complet,
    // `=== true` et non `!== false` : ici, l'absence de colonne — une base
    // ou `0046` n'est pas passee — ne doit PAS enfermer tout le monde dans
    // l'ecran de changement de mot de passe.
    doitChangerMotDePasse: profil.doit_changer_mot_de_passe === true,
    mandatEchu: mandatEchu(
      {
        role: profil.role,
        typeEntite: profil.entity.type,
        estResponsableInformatique: profil.est_responsable_informatique === true,
        mandats,
      },
      aujourdhui,
    ),
    finDeMandat: finDeMandatLaPlusRecente(mandats),
    entiteNom: profil.entity.nom,
    entiteCode: profil.entity.code,
    entiteType: profil.entity.type,
    permissions: (profil.octrois ?? []).map((o) => ({
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

  /**
   * RG-07 — LA REDIRECTION DU GABARIT NE SUFFIT PAS.
   *
   * Elle ecarte l'ecran, pas l'ecriture : une Server Action s'appelle
   * directement, sans passer par la page qui la propose. Un mandat echu doit
   * donc fermer les DEUX portes, et celle-ci est la seule qui compte — l'autre
   * n'est qu'un affichage honnete.
   *
   * `deconnexion` n'appelle pas cette fonction : sortir doit rester possible.
   */
  if (session.mandatEchu) {
    throw new ErreurAcces(
      'Votre mandat a pris fin. Contactez le responsable de votre entite pour le prolonger.',
    );
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
