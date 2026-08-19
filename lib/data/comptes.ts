import 'server-only';

import type { EntityType } from '@/lib/domain/hierarchy';
import type { UserRole } from '@/lib/domain/permissions';
import { createClient } from '@/lib/supabase/server';

import { DataError } from './errors';

/**
 * Lectures des comptes — EF-ADM-01, EF-ADM-07.
 *
 * LA RLS FAIT LE TRI PAR PERIMETRE. `profiles` n'est lisible que dans le
 * sous-arbre de l'entite de rattachement : aucun filtre n'est reecrit ici, il
 * le serait en double et divergerait le jour ou la politique change.
 */

const CHAMPS = `
  id, email, nom_complet, role, entity_id, croyant_id, is_active,
  doit_changer_mot_de_passe, est_responsable_informatique, derniere_connexion, created_at,
  entite:entities!profiles_entity_id_fkey (id, nom, code, type, path),
  croyant:croyants!profiles_croyant_id_fkey (id, nom, prenom, matricule),
  habilitations:user_permissions!user_permissions_user_id_fkey (permission, scope_entity_id)
` as const;

export interface CompteListe {
  id: string;
  email: string;
  nom_complet: string;
  role: UserRole;
  entity_id: string;
  croyant_id: string | null;
  is_active: boolean;
  /** EF-ADM-01 — le mot de passe communique n'a pas encore ete remplace. */
  doit_changer_mot_de_passe: boolean;
  /** EF-ADM-01 — designe hors des bureaux, son acces survit aux mandats. */
  est_responsable_informatique: boolean;
  derniere_connexion: string | null;
  created_at: string;
  entite: { id: string; nom: string; code: string; type: EntityType; path: string } | null;
  /** EF-AUT-01 — c'est lui qui porte le matricule de connexion. */
  croyant: { id: string; nom: string; prenom: string; matricule: string } | null;
  /**
   * RG-25 — les droits DEJA poses, avec leur portee.
   *
   * Charges avec la liste et non a l'ouverture du pop-up : rouvrir un compte
   * pour corriger un droit ne doit pas payer un aller-retour de plus
   * (regle 28), et la modification a besoin de l'etat courant — sans lui,
   * enregistrer effacerait tout ce qui n'a pas ete recoche.
   */
  habilitations: { permission: string; scope_entity_id: string | null }[];
}

/**
 * Tous les comptes du perimetre, DESACTIVES COMPRIS.
 *
 * Un compte desactive doit rester visible : c'est la seule facon de le
 * reactiver, et le masquer ferait croire qu'il a ete supprime — ce que
 * l'application ne fait jamais (EF-ADM-07). Le filtrage se pose a l'ecran
 * (regle 17).
 *
 * Ordonnes par nom : on vient y chercher quelqu'un, pas la derniere creation.
 */
export async function chargerComptes(): Promise<CompteListe[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('profiles')
    .select(CHAMPS)
    .order('nom_complet')
    .limit(2000)
    .returns<CompteListe[]>();

  if (error) {
    throw new DataError('La liste des comptes est momentanement illisible.', error);
  }
  return data ?? [];
}

/**
 * Les croyants qui peuvent recevoir un compte — lot 7.
 *
 * SEULS LES MEMBRES DE BUREAUX ONT UN COMPTE. C'est la regle posee par
 * l'utilisateur, et elle a une raison simple : un compte donne acces a des
 * donnees nominatives et financieres. Le mandat est ce qui, dans cette
 * organisation, designe quelqu'un comme responsable — pas le fait d'etre
 * inscrit quelque part. Proposer les deux mille croyants d'un district
 * reviendrait a faire de l'exception la regle, par simple facilite de saisie.
 *
 * ON PART DES MANDATS, PAS DES CROYANTS. La question n'est pas « quels croyants
 * sont membres d'un bureau ? » — qui obligerait a lire tout le monde puis a
 * filtrer — mais « qui siege en ce moment ? ». Un mandat EN COURS est une ligne
 * sans date de fin, dans un bureau actif : les mandats clos ne donnent pas de
 * compte, sinon un tresorier remplace garderait le sien.
 *
 * LE PERIMETRE EST CELUI DE LA RLS. Un administrateur de district ne voit que
 * les bureaux de son district ; le Siege les voit tous. Aucun filtre n'est
 * reecrit ici — il le serait en double et divergerait.
 *
 * ON EXCLUT CEUX QUI ONT DEJA UN COMPTE : `profiles.croyant_id` n'a pas d'index
 * unique, donc rien n'empeche deux comptes de pointer le meme croyant — et la
 * connexion par matricule choisirait alors l'un des deux au hasard.
 */
export interface CroyantEligible {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  photo_key: string | null;
  /** L'entite ou il SIEGE — pas necessairement celle ou il est inscrit. */
  entite: { id: string; nom: string; path: string } | null;
  /** Ce qu'il y fait : « Tresorier — Bureau executif ». */
  fonction: string;
}

interface LigneMandat {
  croyant: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    photo_key: string | null;
    statut: string;
  } | null;
  fonction: { libelle: string } | null;
  bureau: {
    libelle: string;
    is_active: boolean;
    entite: { id: string; nom: string; path: string } | null;
  } | null;
}

export async function croyantsEligiblesAuCompte(): Promise<CroyantEligible[]> {
  const sb = await createClient();

  const [mandats, pris] = await Promise.all([
    sb
      .from('bureau_membres')
      .select(
        'croyant:croyants!bureau_membres_croyant_id_fkey (' +
          'id, nom, prenom, matricule, photo_key, statut), ' +
          'fonction:fonctions!bureau_membres_fonction_id_fkey (libelle), ' +
          'bureau:bureaux!bureau_membres_bureau_id_fkey (' +
          'libelle, is_active, entite:entities!bureaux_entity_id_fkey (id, nom, path))',
      )
      // EF-BUR-08 — un mandat EN COURS n'a pas de date de fin.
      .is('date_fin', null)
      .limit(2000)
      .returns<LigneMandat[]>(),

    // Deux lectures INDEPENDANTES : `Promise.all` (regle 28). Un `not.in`
    // aurait demande la liste des identifiants pris AVANT de partir, donc deux
    // allers-retours enchaines.
    sb
      .from('profiles')
      .select('croyant_id')
      .not('croyant_id', 'is', null)
      .returns<{ croyant_id: string }[]>(),
  ]);

  if (mandats.error) {
    throw new DataError(
      'La liste des membres de bureaux est momentanement illisible.',
      mandats.error,
    );
  }

  const occupes = new Set((pris.data ?? []).map((p) => p.croyant_id));

  /**
   * UN CROYANT PEUT SIEGER DANS DEUX BUREAUX — sa cellule et sa paroisse. Il ne
   * doit apparaitre qu'une fois dans la liste : on garde le PREMIER mandat
   * rencontre, et l'ordre alphabetique final rend le resultat stable.
   */
  const parCroyant = new Map<string, CroyantEligible>();

  for (const ligne of mandats.data ?? []) {
    const croyant = ligne.croyant;
    if (!croyant || croyant.statut !== 'ACTIF') continue;
    if (!ligne.bureau?.is_active) continue;
    if (occupes.has(croyant.id) || parCroyant.has(croyant.id)) continue;

    parCroyant.set(croyant.id, {
      id: croyant.id,
      nom: croyant.nom,
      prenom: croyant.prenom,
      matricule: croyant.matricule,
      photo_key: croyant.photo_key,
      entite: ligne.bureau.entite,
      fonction: [ligne.fonction?.libelle, ligne.bureau.libelle]
        .filter(Boolean)
        .join(' — '),
    });
  }

  return [...parCroyant.values()].sort((a, b) =>
    `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'),
  );
}

/**
 * TOUS les croyants sans compte — l'exception du responsable informatique.
 *
 * LA REGLE DES BUREAUX SE MORD LA QUEUE SANS CETTE LISTE. « Seuls les membres
 * de bureaux ont un compte » ferme une porte le jour d'un renouvellement :
 * les anciens elus ont perdu leur mandat, les nouveaux n'ont pas encore de
 * compte, et plus personne ne peut leur en ouvrir un.
 *
 * Le responsable informatique est designe HORS des bureaux, precisement pour
 * cela. Il faut donc pouvoir le choisir parmi TOUS les croyants — et c'est le
 * seul cas ou la regle se leve.
 *
 * L'APPELANT DECIDE S'IL A LE DROIT DE LA LEVER. Cette lecture ne verifie rien
 * elle-meme : la designation exige `settings.manage`, non delegable, et
 * l'ecran ne charge cette liste que dans ce cas. La RLS borne le reste.
 */
export async function croyantsSansCompte(): Promise<CroyantEligible[]> {
  const sb = await createClient();

  const [croyants, pris] = await Promise.all([
    sb
      .from('croyants')
      .select(
        'id, nom, prenom, matricule, photo_key, ' +
          'eglise:entities!croyants_eglise_id_fkey (id, nom, path)',
      )
      .is('deleted_at', null)
      .eq('statut', 'ACTIF')
      .order('nom')
      .limit(2000)
      .returns<
        {
          id: string;
          nom: string;
          prenom: string;
          matricule: string;
          photo_key: string | null;
          eglise: { id: string; nom: string; path: string } | null;
        }[]
      >(),

    sb
      .from('profiles')
      .select('croyant_id')
      .not('croyant_id', 'is', null)
      .returns<{ croyant_id: string }[]>(),
  ]);

  if (croyants.error) {
    throw new DataError('La liste des croyants est momentanement illisible.', croyants.error);
  }

  const occupes = new Set((pris.data ?? []).map((p) => p.croyant_id));

  return (croyants.data ?? [])
    .filter((c) => !occupes.has(c.id))
    .map((c) => ({
      id: c.id,
      nom: c.nom,
      prenom: c.prenom,
      matricule: c.matricule,
      photo_key: c.photo_key,
      entite: c.eglise,
      // Il ne siege nulle part — c'est justement la condition.
      fonction: 'Sans mandat',
    }));
}
