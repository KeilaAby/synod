/**
 * Rendre le journal LISIBLE — EF-ADM-09.
 *
 * LE JOURNAL EST ECRIT PAR LA MACHINE, IL EST LU PAR UN HUMAIN. Il enregistre
 * un nom de table, une action en majuscules et un objet de differences : trois
 * choses ecrites pour etre exactes, aucune pour etre lue. « UPDATE ·
 * finance_entries · {"champ":"statut","avant":"SOUMIS","apres":"VALIDE"} » est
 * juste, et ne dit rien a celui qui vient verifier qui a valide un mouvement.
 *
 * CE MODULE TRADUIT, IL N'INTERPRETE PAS. Il connait les formes de differences
 * que les actions produisent reellement ; devant une forme qu'il ne reconnait
 * pas, il se TAIT plutot que d'inventer une phrase. Une description
 * approximative dans un journal d'audit serait pire que pas de description —
 * on la citerait.
 *
 * LE DETAIL TECHNIQUE N'EST PAS PERDU : l'ecran le garde, replie. Ce qui change,
 * c'est qu'il ne s'impose plus a qui n'en a pas besoin.
 */

/** Le nom de table tel qu'un utilisateur le nomme. */
export const LIBELLES_TABLE: Record<string, string> = {
  entities: 'Structure',
  croyants: 'Croyants',
  transferts: 'Transferts',
  baptemes: 'Baptêmes',
  bureaux: 'Bureaux',
  bureau_membres: 'Composition des bureaux',
  finance_entries: 'Mouvements financiers',
  finance_categories: 'Catégories financières',
  dime_collectes: 'Collectes de dîmes',
  dime_remises: 'Remises de dîmes',
  grades: 'Grades',
  fonctions: 'Fonctions',
  nationalites: 'Nationalités',
  profiles: 'Comptes',
  user_permissions: 'Habilitations',
  permission_profiles: 'Profils de privilèges',
  permissions: 'Habilitations',
  organisation_settings: 'Paramètres généraux',
  email_settings: 'Configuration des courriels',
  email_templates: 'Modèles de message',
  report_templates: 'Modèles de rapport',
  report_instances: 'Rapports générés',
  visites_pastorales: 'Visites pastorales',
  visites_pastorales_delegues: 'Délégations de visite pastorale',
};

export function libelleDomaine(table: string): string {
  // Un domaine inconnu vient d'une table ajoutee depuis : on rend le nom brut
  // plutot que « Autre », qui effacerait la seule information disponible.
  return LIBELLES_TABLE[table] ?? table;
}

/** L'action, dite en francais et au passe. */
export const LIBELLES_ACTION: Record<string, string> = {
  CREATE: 'Création',
  UPDATE: 'Modification',
  DELETE: 'Suppression',
  RESTORE: 'Restauration',
  PURGE: 'Suppression définitive',
  TRANSFER: 'Transfert',
  APPROVE: 'Approbation',
  REJECT: 'Refus',
  SUBMIT: 'Soumission',
  VALIDATE: 'Validation',
  CANCEL: 'Annulation',
  GRANT: 'Habilitation accordée',
  REVOKE: 'Habilitation retirée',
  REPORT: 'Rapport généré',
  EXPORT: 'Export',
  LOGIN: 'Connexion',
  LOGOUT: 'Déconnexion',
  DENIED: 'Accès refusé',
};

export function libelleAction(action: string): string {
  return LIBELLES_ACTION[action] ?? action;
}

/**
 * Les noms de colonnes tels qu'ils s'annoncent a l'ecran.
 *
 * Volontairement COURT : seuls les champs qui apparaissent vraiment dans les
 * differences. Recopier tout le schema donnerait une table a maintenir pour des
 * colonnes que le journal ne mentionne jamais.
 */
const LIBELLES_CHAMP: Record<string, string> = {
  is_active: 'Activation',
  statut: 'Statut',
  archived_at: 'Archivage',
  deleted_at: 'Suppression',
  mot_de_passe: 'Mot de passe',
  doit_changer_mot_de_passe: 'Mot de passe provisoire',
  est_responsable_informatique: 'Responsable informatique',
  structure: 'Composition',
  nom: 'Nom',
  nom_complet: 'Nom',
  email: 'Adresse',
  role: 'Rôle',
  visibilite: 'Visibilité',
  rapport_composition_libre: 'Composition des rapports',
  reinitialisation_par_email: 'Réinitialisation par courriel',
  finance_validation_active: 'Workflow de validation',
};

function libelleChamp(champ: string): string {
  return LIBELLES_CHAMP[champ] ?? champ.replaceAll('_', ' ');
}

/**
 * Une valeur, dite comme on la lit.
 *
 * Les booleens deviennent oui/non, les absences « aucun ». Le reste est rendu
 * tel quel : un statut, un montant, un nom se lisent deja.
 */
function valeurLisible(valeur: unknown): string {
  if (valeur === true) return 'oui';
  if (valeur === false) return 'non';
  if (valeur === null || valeur === undefined || valeur === '') return 'aucun';
  if (typeof valeur === 'number') return new Intl.NumberFormat('fr-FR').format(valeur);
  if (typeof valeur === 'string') return valeur;

  // Un objet ou un tableau ne se dit pas en une phrase : on compte.
  if (Array.isArray(valeur)) return `${valeur.length} élément${valeur.length > 1 ? 's' : ''}`;
  return '';
}

interface Difference {
  champ?: unknown;
  avant?: unknown;
  apres?: unknown;
  permission?: unknown;
  portee?: unknown;
  habilitations?: unknown;
  motif?: unknown;
  essai?: unknown;
  aboutit?: unknown;
  destinataire?: unknown;
  periode?: unknown;
  blocsOmis?: unknown;
  modele?: unknown;
}

/**
 * Ce qui s'est passe, en une phrase — ou `null` si on ne sait pas le dire.
 *
 * L'ORDRE DES CAS EST CELUI DE LEUR PRECISION. On reconnait d'abord les formes
 * les plus parlantes ; les plus vagues ne servent qu'a defaut, et le silence
 * vient en dernier.
 */
export function decrireOperation(action: string, diff: unknown): string | null {
  if (typeof diff !== 'object' || diff === null) return null;
  const d = diff as Difference;

  // Un refus d'acces nomme le droit qui manquait : c'est toute l'information.
  if (action === 'DENIED' && typeof d.permission === 'string') {
    return `Droit requis : ${d.permission}`;
  }

  // Un champ precis a change : c'est la forme la plus lisible qui soit.
  if (typeof d.champ === 'string') {
    const nom = libelleChamp(d.champ);
    const avant = valeurLisible(d.avant);
    const apres = valeurLisible(d.apres);

    if (avant && apres && avant !== apres) return `${nom} : ${avant} → ${apres}`;
    if (apres) return `${nom} : ${apres}`;
    return nom;
  }

  if (d.essai === true) {
    const issue = d.aboutit === true ? 'a abouti' : 'a échoué';
    const vers = typeof d.destinataire === 'string' ? ` vers ${d.destinataire}` : '';
    return `Essai d’envoi${vers} : ${issue}`;
  }

  if (typeof d.modele === 'string' && Array.isArray(d.periode)) {
    const omis = typeof d.blocsOmis === 'number' && d.blocsOmis > 0
      ? `, ${d.blocsOmis} bloc${d.blocsOmis > 1 ? 's' : ''} omis`
      : '';
    return `Modèle « ${d.modele} », du ${d.periode[0]} au ${d.periode[1]}${omis}`;
  }

  if (Array.isArray(d.habilitations)) {
    return d.habilitations.length > 0
      ? `${d.habilitations.length} habilitation${d.habilitations.length > 1 ? 's' : ''} accordée${d.habilitations.length > 1 ? 's' : ''}`
      : 'Aucune habilitation accordée';
  }

  if (typeof d.motif === 'string' && d.motif) return `Motif : ${d.motif}`;

  /**
   * Reste le cas ou la difference porte un objet entier — une creation, par
   * exemple. On NOMME ce qui a ete renseigne plutot que de le recopier : la
   * liste des champs suffit a comprendre, et la valeur figure de toute facon
   * sur la fiche.
   */
  const apres = d.apres;
  if (typeof apres === 'object' && apres !== null && !Array.isArray(apres)) {
    const champs = Object.entries(apres)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([c]) => libelleChamp(c));

    if (champs.length > 0) {
      const debut = champs.slice(0, 3).join(', ');
      const reste = champs.length > 3 ? `, et ${champs.length - 3} autre${champs.length - 3 > 1 ? 's' : ''}` : '';
      return `${debut}${reste}`;
    }
  }

  // On ne sait pas le dire : on se tait. Le detail technique reste consultable.
  return null;
}
