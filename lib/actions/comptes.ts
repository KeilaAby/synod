'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '@/lib/auth';
import { getArbrePerimetre } from '@/lib/data/entities';
import { genererMotDePasse } from '@/lib/domain/mot-de-passe';
import {
  ALL_PERMISSIONS,
  type Permission,
  peutDeleguer,
  permissionsDeleguables,
  resoudrePortee,
} from '@/lib/domain/permissions';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { sanitizeAll } from '@/lib/utils/sanitize';
import { nouveauMotDePasseSchema } from '@/lib/validation/auth';
import {
  activerCompteSchema,
  creerCompteSchema,
  modifierCompteSchema,
  reinitialiserCompteSchema,
  responsableInformatiqueSchema,
  supprimerCompteSchema,
} from '@/lib/validation/comptes';
import { champsEnErreur } from '@/lib/validation/zod-errors';

import { executerAction } from './executer';

/**
 * Les comptes — EF-ADM-01, EF-ADM-07, EF-ADM-08.
 *
 * AUCUNE INVITATION PAR COURRIEL. L'administrateur ouvre le compte et remet les
 * identifiants de la main a la main. Ce n'est pas un raccourci : beaucoup
 * d'adresses sont de convenance — saisies une fois, jamais relevees —, et un
 * lien d'activation qui aboutit dans une boite que personne n'ouvre laisse le
 * compte inutilisable sans que rien ne le signale.
 *
 * LE MOT DE PASSE N'EST MONTRE QU'UNE FOIS, au retour de l'action. Il n'est
 * stocke nulle part en clair — ni en base, ni dans le journal d'audit : un
 * journal qui porterait des mots de passe transformerait `audit.read` en droit
 * de se connecter a la place des autres.
 */

/** Le mot de passe genere ne traverse que ce retour, jamais la base. */
interface CompteOuvert {
  readonly profileId: string;
  readonly email: string;
  readonly motDePasse: string;
}

// -----------------------------------------------------------------------------

/**
 * EF-ADM-01 — ouvrir un compte.
 *
 * TROIS ECRITURES, ET LA PREMIERE EST CHEZ LE FOURNISSEUR D'IDENTITE. Elles ne
 * forment pas une transaction : l'identite vit chez Supabase Auth, le profil en
 * base. Si le profil echoue apres la creation de l'identite, on RETIRE
 * l'identite — sans quoi l'adresse resterait prise, et une seconde tentative
 * echouerait sur « cette adresse existe deja » pour un compte qui n'existe pas.
 */
export async function creerCompte(input: unknown): Promise<ActionResult<CompteOuvert>> {
  return executerAction('creerCompte', async () => {
    const session = await requireSession();

    const analyse = creerCompteSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const valeurs = analyse.data;

    const arbre = await getArbrePerimetre();
    const entite = arbre.find((e) => e.id === valeurs.entityId);
    if (!entite) return ko("Cette entite n'appartient pas a votre perimetre.");

    // RG-25 — `user.manage` AVEC la portee de l'entite de rattachement : gerer
    // les comptes de son district ne donne pas ceux du district voisin.
    await requirePermission(session, 'user.manage', entite.path);

    // RG-21 — aucun compte rattache a une Cellule. Le trigger
    // `fn_profile_rattachement` le refuse aussi ; le dire ici evite un message
    // de base de donnees a la place d'une phrase.
    if (entite.type === 'CELLULE') {
      return ko(
        'Une cellule de priere ne porte pas de compte (RG-21). Rattachez le compte a ' +
          'l’eglise dont elle depend.',
      );
    }

    /**
     * L'ADRESSE MANQUANTE SE FABRIQUE — EF-AUT-01.
     *
     * Beaucoup de croyants n'ont pas de courriel. Le fournisseur d'identite
     * n'authentifie pourtant que par adresse, et la colonne est `not null
     * unique`. On en compose donc une a partir du matricule : c'est un
     * IDENTIFIANT TECHNIQUE, pas une boite aux lettres — aucun message n'y sera
     * jamais envoye, et l'interesse se connectera par son matricule.
     *
     * Le domaine `.invalid` est reserve par la norme (RFC 2606) precisement
     * pour cela : il ne peut appartenir a personne, et aucun serveur de
     * messagerie ne tentera de le joindre.
     */
    const matricule = await matriculeDuCroyant(valeurs.croyantId);
    const email = valeurs.email ?? (matricule ? `${matricule.toLowerCase()}@synod.invalid` : null);

    if (!email) {
      return ko(
        'Sans adresse e-mail, le compte doit etre rattache a un croyant : c’est son ' +
          'matricule qui sert alors d’identifiant.',
      );
    }

    // RG-24, RG-25 — on n'accorde que ce qu'on detient, pour une portee incluse
    // dans la sienne. Le refus est verifie AVANT toute ecriture : accorder
    // d'abord et corriger ensuite laisserait un compte trop puissant entre les
    // deux.
    const demandees: { permission: Permission; scopeEntityId: string | null }[] = [];
    for (const demande of valeurs.permissions) {
      if (!(ALL_PERMISSIONS as readonly string[]).includes(demande.permission)) continue;
      const permission = demande.permission as Permission;

      const portee = resoudrePortee(
        demande.scopeEntityId,
        { id: valeurs.entityId, path: entite.path },
        arbre,
      );
      if (!portee.ok) return portee;

      const verdict = peutDeleguer(
        session,
        { cheminEntite: entite.path },
        { permission, cheminPortee: portee.data.cheminPortee },
      );
      if (!verdict.ok) return verdict;

      demandees.push({ permission, scopeEntityId: portee.data.scopeEntityId });
    }

    const motDePasse = genererMotDePasse();

    const identite = await auth().creerIdentite(email, motDePasse);
    if (!identite.ok) return ko(identite.error);

    const ligne = sanitizeAll({
      auth_user_id: identite.data.authUserId,
      email,
      nom_complet: valeurs.nomComplet,
      role: valeurs.role,
      entity_id: valeurs.entityId,
      croyant_id: valeurs.croyantId,
      // EF-ADM-01 — le mot de passe communique est PROVISOIRE.
      doit_changer_mot_de_passe: true,
    });

    const sb = await createClient();
    const { data, error } = await sb
      .from('profiles')
      .insert(ligne)
      .select('id')
      .single<{ id: string }>();

    if (error) {
      // L'identite est retiree pour que l'adresse redevienne libre. Elle passe
      // par le client d'administration : `auth.admin` n'existe qu'avec lui.
      await createAdminClient()
        .auth.admin.deleteUser(identite.data.authUserId)
        .catch(() => undefined);

      return ko(
        error.code === '23505'
          ? 'Un compte existe deja pour cette adresse.'
          : "Le compte n'a pas pu etre cree.",
      );
    }

    /**
     * LES HABILITATIONS SONT POSEES APRES LE PROFIL, et leur echec n'annule
     * pas le compte.
     *
     * Deux ecritures qui ne forment pas une transaction : la regle 20 demande
     * de se demander si l'etat intermediaire est *faux et indetectable* ou
     * *benin et rattrapable*. Ici il est benin — un compte sans habilitation
     * se connecte et ne voit rien —, et surtout RATTRAPABLE depuis l'ecran des
     * habilitations. Une fonction en base aurait ete plus lourde que le
     * probleme.
     */
    if (demandees.length > 0) {
      const { error: erreurDroits } = await sb.from('user_permissions').insert(
        demandees.map(({ permission, scopeEntityId }) => ({
          user_id: data.id,
          permission,
          scope_entity_id: scopeEntityId,
          source: 'INDIVIDUEL',
          granted_by: session.profileId,
        })),
      );

      if (erreurDroits) {
        console.error('[comptes] habilitations non posees', erreurDroits);
      }
    }

    await auditer({
      session,
      action: 'CREATE',
      table: 'profiles',
      recordId: data.id,
      entityId: valeurs.entityId,
      // Le mot de passe ne figure PAS dans le journal, et c'est le point.
      diff: { apres: { ...ligne, auth_user_id: undefined }, habilitations: demandees },
    });

    revalidatePath('/administration/comptes');
    return ok({ profileId: data.id, email, motDePasse });
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-ADM-01 — modifier un compte : son identite et ses habilitations.
 *
 * LES HABILITATIONS SONT REMPLACEES, pas fusionnees. Le formulaire les affiche
 * toutes : il en est donc la source complete (regle 19). Une fusion aurait
 * rendu impossible le RETRAIT d'un droit — decocher n'aurait rien fait, et
 * personne n'aurait compris pourquoi.
 *
 * ON NE RETIRE QUE CE QU'ON POURRAIT ACCORDER. Un administrateur de district ne
 * doit pas pouvoir defaire un droit que le Siege a pose et qu'il ne detient pas
 * lui-meme : les habilitations hors de sa portee sont CONSERVEES telles quelles.
 * Sans cette precaution, ouvrir puis enregistrer un compte sans rien changer
 * lui retirerait la moitie de ses droits.
 */
export async function modifierCompte(input: unknown): Promise<ActionResult<void>> {
  return executerAction('modifierCompte', async () => {
    const session = await requireSession();

    const analyse = modifierCompteSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const valeurs = analyse.data;

    const cible = await profilDuPerimetre(valeurs.profileId, session);
    if (!cible.ok) return ko(cible.error);

    const chemin = cible.data.entite!.path;
    const arbre = await getArbrePerimetre();

    const demandees: { permission: Permission; scopeEntityId: string | null }[] = [];
    for (const demande of valeurs.permissions) {
      if (!(ALL_PERMISSIONS as readonly string[]).includes(demande.permission)) continue;
      const permission = demande.permission as Permission;

      const portee = resoudrePortee(
        demande.scopeEntityId,
        { id: cible.data.entity_id, path: chemin },
        arbre,
      );
      if (!portee.ok) return portee;

      const verdict = peutDeleguer(
        session,
        { cheminEntite: chemin },
        { permission, cheminPortee: portee.data.cheminPortee },
      );
      if (!verdict.ok) return verdict;

      demandees.push({ permission, scopeEntityId: portee.data.scopeEntityId });
    }

    const sb = await createClient();

    const modifications: Record<string, unknown> = { nom_complet: valeurs.nomComplet };
    // L'adresse ne s'efface pas : la colonne est `not null`, et un compte sans
    // identifiant ne se connecterait plus. Vide, on garde l'ancienne.
    if (valeurs.email) modifications.email = valeurs.email;

    const { error } = await sb
      .from('profiles')
      .update(sanitizeAll(modifications))
      .eq('id', valeurs.profileId);

    if (error) {
      return ko(
        error.code === '23505'
          ? 'Un autre compte emploie deja cette adresse.'
          : "Le compte n'a pas pu etre modifie.",
      );
    }

    /**
     * Le remplacement se fait en DEUX temps, et c'est benin (regle 20) : entre
     * le retrait et la pose, le compte a moins de droits — jamais plus. Un
     * echec a mi-chemin laisse un compte diminue, ce qui se voit et se corrige,
     * la ou l'ordre inverse aurait pu laisser un compte trop puissant.
     */
    const posables = permissionsDeleguables(session);

    await sb
      .from('user_permissions')
      .delete()
      .eq('user_id', valeurs.profileId)
      // Seuls les droits que l'on POURRAIT accorder sont retires : ceux du
      // Siege survivent a l'enregistrement d'un administrateur de district.
      .in('permission', posables.length > 0 ? posables : ['__aucune__']);

    if (demandees.length > 0) {
      await sb.from('user_permissions').insert(
        demandees.map(({ permission, scopeEntityId }) => ({
          user_id: valeurs.profileId,
          permission,
          scope_entity_id: scopeEntityId,
          source: 'INDIVIDUEL',
          granted_by: session.profileId,
        })),
      );
    }

    await auditer({
      session,
      action: 'UPDATE',
      table: 'profiles',
      recordId: valeurs.profileId,
      entityId: cible.data.entity_id,
      diff: { apres: modifications, habilitations: demandees },
    });

    revalidatePath('/administration/comptes');
    return ok();
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-ADM-01 — SUPPRIMER un compte, et seulement s'il n'a rien fait.
 *
 * DESACTIVER RESTE LA REGLE. Un compte qui a saisi, valide ou genere est
 * mentionne dans le journal d'audit et dans des colonnes `saisi_par`,
 * `valide_par`, `genere_par` : l'effacer laisserait ces references pendantes,
 * et le journal — qui est precisement ce qui ne doit pas mentir — dirait
 * « auteur inconnu » la ou quelqu'un a agi.
 *
 * La suppression n'est donc licite QUE pour un compte sans histoire : ouvert
 * par erreur, jamais connecte, jamais employe. C'est le meme raisonnement que
 * pour les valeurs de referentiel (RG-23), et le refus est MOTIVE — « ce compte
 * a produit 42 ecritures » se comprend, un code d'erreur non.
 */
export async function supprimerCompte(input: unknown): Promise<ActionResult<void>> {
  return executerAction('supprimerCompte', async () => {
    const session = await requireSession();

    const analyse = supprimerCompteSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    const cible = await profilDuPerimetre(analyse.data.profileId, session);
    if (!cible.ok) return ko(cible.error);

    if (cible.data.id === session.profileId) {
      return ko('Vous ne pouvez pas supprimer votre propre compte.');
    }

    const sb = await createClient();

    // Le journal d'audit est le temoin le plus large : toute action y laisse
    // une ligne, y compris la connexion.
    const { count } = await sb
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', cible.data.id);

    if ((count ?? 0) > 0) {
      return ko(
        `Ce compte a laisse ${count} trace${(count ?? 0) > 1 ? 's' : ''} dans le journal : ` +
          'le supprimer ferait mentir l’historique. Desactivez-le — il ne pourra plus se ' +
          'connecter, et ce qu’il a fait restera a son nom.',
      );
    }

    // L'audit est ecrit AVANT : apres, il n'y aurait plus rien a decrire.
    await auditer({
      session,
      action: 'DELETE',
      table: 'profiles',
      recordId: cible.data.id,
      entityId: cible.data.entity_id,
      diff: { avant: { id: cible.data.id } },
    });

    const { error } = await sb.from('profiles').delete().eq('id', cible.data.id);
    if (error) return ko("Le compte n'a pas pu etre supprime.");

    // L'identite chez le fournisseur part avec : la laisser garderait l'adresse
    // prise pour un compte qui n'existe plus.
    if (cible.data.auth_user_id) {
      await createAdminClient()
        .auth.admin.deleteUser(cible.data.auth_user_id)
        .catch(() => undefined);
    }

    revalidatePath('/administration/comptes');
    return ok();
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-ADM-01 — designer le RESPONSABLE INFORMATIQUE d'une entite.
 *
 * L'EXCEPTION QUI EMPECHE LA REGLE DE SE MORDRE LA QUEUE. « Seuls les membres
 * de bureaux ont un compte » ferme une porte utile : le jour ou un bureau est
 * renouvele, plus personne n'a le droit d'ouvrir les comptes des nouveaux
 * elus, puisque les anciens ont perdu leur mandat.
 *
 * Le responsable informatique est designe HORS des bureaux, et son compte
 * survit aux renouvellements. Il ne siege pas — il ouvre des comptes.
 *
 * LA DESIGNATION APPARTIENT AU SIEGE. C'est un contournement de la regle
 * principale : la laisser a chaque entite reviendrait a laisser chacune se
 * dispenser de la regle. `settings.manage` est non delegable, et c'est
 * exactement la garantie qu'on cherche ici.
 */
export async function designerResponsableInformatique(
  input: unknown,
): Promise<ActionResult<{ responsable: boolean }>> {
  return executerAction('designerResponsableInformatique', async () => {
    const session = await requireSession();
    await requirePermission(session, 'settings.manage');

    const analyse = responsableInformatiqueSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');
    const { profileId, responsable } = analyse.data;

    const cible = await profilDuPerimetre(profileId, session);
    if (!cible.ok) return ko(cible.error);

    const sb = await createClient();
    const { error } = await sb
      .from('profiles')
      .update({ est_responsable_informatique: responsable })
      .eq('id', profileId);

    if (error) {
      // L'index unique partiel de la migration 0047 : une entite, un
      // responsable. Le dire vaut mieux qu'un code de violation.
      return ko(
        error.code === '23505'
          ? 'Cette entite a deja un responsable informatique. Retirez d’abord la ' +
              'designation en cours.'
          : 'La designation n’a pas pu etre enregistree.',
      );
    }

    await auditer({
      session,
      action: 'UPDATE',
      table: 'profiles',
      recordId: profileId,
      entityId: cible.data.entity_id,
      diff: { champ: 'est_responsable_informatique', apres: responsable },
    });

    revalidatePath('/administration/comptes');
    return ok({ responsable });
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-ADM-08 — remettre un mot de passe provisoire.
 *
 * C'est l'autre moitie du circuit sans courriel : quand la reinitialisation par
 * courriel est fermee, c'est par ici qu'un utilisateur bloque repasse. Le
 * drapeau est repose — le mot de passe qu'on vient de dicter est provisoire au
 * meme titre que le premier.
 */
export async function reinitialiserMotDePasse(
  input: unknown,
): Promise<ActionResult<{ motDePasse: string }>> {
  return executerAction('reinitialiserMotDePasse', async () => {
    const session = await requireSession();

    const analyse = reinitialiserCompteSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    const cible = await profilDuPerimetre(analyse.data.profileId, session);
    if (!cible.ok) return ko(cible.error);

    if (!cible.data.auth_user_id) {
      return ko(
        'Ce compte n’a pas d’identite chez le fournisseur d’authentification : il ne peut ' +
          'pas etre reinitialise. Recreez-le.',
      );
    }

    const motDePasse = genererMotDePasse();

    const applique = await auth().reinitialiserMotDePasseAdmin(
      cible.data.auth_user_id,
      motDePasse,
    );
    if (!applique.ok) return ko(applique.error);

    const sb = await createClient();
    await sb
      .from('profiles')
      .update({ doit_changer_mot_de_passe: true })
      .eq('id', cible.data.id);

    await auditer({
      session,
      action: 'UPDATE',
      table: 'profiles',
      recordId: cible.data.id,
      entityId: cible.data.entity_id,
      diff: { champ: 'mot_de_passe', provisoire: true },
    });

    revalidatePath('/administration/comptes');
    return ok({ motDePasse });
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-ADM-07 — activer ou desactiver un compte.
 *
 * ON NE SUPPRIME PAS UN COMPTE. Il a signe des saisies, valide des mouvements,
 * genere des rapports : l'effacer laisserait des references orphelines dans le
 * journal d'audit, qui est precisement ce qui ne doit pas mentir. Desactive, il
 * ne peut plus se connecter — `getSession` borne a `is_active` — et tout ce
 * qu'il a fait reste attribue.
 *
 * ON NE SE DESACTIVE PAS SOI-MEME : le compte se fermerait sous celui qui
 * clique, et il faudrait un autre administrateur pour le rouvrir.
 */
export async function basculerActivationCompte(
  input: unknown,
): Promise<ActionResult<{ actif: boolean }>> {
  return executerAction('basculerActivationCompte', async () => {
    const session = await requireSession();

    const analyse = activerCompteSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    const cible = await profilDuPerimetre(analyse.data.profileId, session);
    if (!cible.ok) return ko(cible.error);

    if (cible.data.id === session.profileId) {
      return ko(
        'Vous ne pouvez pas desactiver votre propre compte : il se fermerait sous vous, et ' +
          'un autre administrateur devrait le rouvrir.',
      );
    }

    const suivant = analyse.data.actif;

    const sb = await createClient();
    const { error } = await sb
      .from('profiles')
      .update({ is_active: suivant })
      .eq('id', cible.data.id);

    if (error) return ko("Le compte n'a pas pu etre modifie.");

    await auditer({
      session,
      action: 'UPDATE',
      table: 'profiles',
      recordId: cible.data.id,
      entityId: cible.data.entity_id,
      diff: { champ: 'is_active', avant: cible.data.is_active, apres: suivant },
    });

    revalidatePath('/administration/comptes');
    return ok({ actif: suivant });
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-ADM-01 — l'utilisateur choisit SON mot de passe.
 *
 * Appelee par l'ecran de changement obligatoire, et par lui seul. Elle applique
 * le mot de passe chez le fournisseur d'identite, puis fait tomber le drapeau.
 *
 * LE DRAPEAU TOMBE PAR LE CLIENT D'ADMINISTRATION. La politique d'ecriture de
 * `profiles` demande `user.manage` — un utilisateur ordinaire ne peut pas
 * modifier sa propre ligne, et c'est heureux : il pourrait sinon changer son
 * role. Ici, on ecrit UNE colonne, sur SA propre ligne, apres que le mot de
 * passe a ete accepte. La clef de service est bornee a cela.
 */
export async function choisirMotDePasse(input: unknown): Promise<ActionResult<void>> {
  return executerAction('choisirMotDePasse', async () => {
    const session = await requireSession();

    const analyse = nouveauMotDePasseSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Mot de passe invalide.', champsEnErreur(analyse.error));
    }

    const applique = await auth().appliquerNouveauMotDePasse(analyse.data.motDePasse);
    if (!applique.ok) return applique;

    const { error } = await createAdminClient()
      .from('profiles')
      .update({ doit_changer_mot_de_passe: false })
      .eq('id', session.profileId);

    if (error) {
      /**
       * Le mot de passe EST change — seul le drapeau resiste. Le dire est plus
       * utile que de laisser croire a un echec : l'utilisateur se connectera
       * avec le nouveau, et retombera simplement sur cet ecran.
       */
      return ko(
        'Votre mot de passe a bien ete change, mais l’application n’a pas pu l’enregistrer. ' +
          'Reconnectez-vous avec le nouveau ; si cet ecran revient, signalez-le.',
      );
    }

    await auditer({
      session,
      action: 'UPDATE',
      table: 'profiles',
      recordId: session.profileId,
      diff: { champ: 'mot_de_passe', provisoire: false },
    });

    revalidatePath('/', 'layout');
    return ok();
  });
}

// -----------------------------------------------------------------------------

/**
 * Le matricule du croyant rattache, pour composer une adresse technique.
 *
 * Rendu `null` sans rattachement — l'action le dit alors clairement plutot que
 * de fabriquer un identifiant qui ne renverrait a personne.
 */
async function matriculeDuCroyant(croyantId: string | null): Promise<string | null> {
  if (!croyantId) return null;

  const sb = await createClient();
  const { data } = await sb
    .from('croyants')
    .select('matricule')
    .eq('id', croyantId)
    .maybeSingle<{ matricule: string }>();

  return data?.matricule ?? null;
}

interface ProfilCible {
  id: string;
  auth_user_id: string | null;
  entity_id: string;
  is_active: boolean;
  entite: { path: string } | null;
}

/**
 * Le profil vise, s'il est dans le perimetre ET qu'on a le droit d'y toucher.
 *
 * Factorisee parce que les trois actions posent exactement la meme question, et
 * qu'une seule d'entre elles qui l'oublierait suffirait a ouvrir la porte.
 */
async function profilDuPerimetre(
  profileId: string,
  session: Awaited<ReturnType<typeof requireSession>>,
): Promise<ActionResult<ProfilCible>> {
  const sb = await createClient();

  const { data } = await sb
    .from('profiles')
    .select(
      'id, auth_user_id, entity_id, is_active, entite:entities!profiles_entity_id_fkey (path)',
    )
    .eq('id', profileId)
    .maybeSingle<ProfilCible>();

  if (!data?.entite) return ko('Ce compte est introuvable dans votre perimetre.');

  await requirePermission(session, 'user.manage', data.entite.path);
  return ok(data);
}
