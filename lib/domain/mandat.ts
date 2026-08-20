/**
 * Un mandat echu ferme l'application — EF-ADM-03, RG-07.
 *
 * LA REGLE DE L'ORGANISATION : seuls les membres de bureau ont un compte. Elle
 * etait tenue a la CREATION — la liste des candidats ne propose que les mandats
 * en cours — et par nulle part ensuite. Un tresorier remplace en mars gardait
 * son acces en decembre : il n'exercait plus, et signait toujours.
 *
 * ELLE S'EVALUE A CHAQUE OUVERTURE DE SESSION, jamais par une tache planifiee.
 * Une tache qui tourne la nuit laisse passer la journee, tombe en silence, et
 * demande un ordonnanceur que l'hebergement ne garantit pas. La question
 * « ce compte a-t-il encore un mandat ? » a une reponse exacte au moment ou on
 * la pose ; c'est donc a ce moment qu'on la pose.
 *
 * MODULE PUR : aucune dependance a la base ni a React, donc directement
 * testable — et c'est necessaire, parce qu'une erreur ici ferme l'application
 * a tout le monde.
 */

export interface MandatConnu {
  /** `null` = mandat en cours, sans terme prevu. */
  readonly date_fin: string | null;
}

export interface CompteAEvaluer {
  readonly role: string;
  /** Le niveau de l'entite de rattachement — `SIEGE` porte la derogation. */
  readonly typeEntite: string;
  /** Migration `0047` — il n'a pas de mandat, c'est sa raison d'etre. */
  readonly estResponsableInformatique: boolean;
  /**
   * Les mandats connus du croyant rattache au compte.
   *
   * Vide signifie « on n'en connait aucun », PAS « il n'en a jamais eu » : voir
   * `mandatEchu`.
   */
  readonly mandats: readonly MandatConnu[];
}

/**
 * Un mandat couvre-t-il encore le jour donne ?
 *
 * La borne est INCLUSE : un mandat qui finit le 31 decembre s'exerce le
 * 31 decembre. L'exclure retirerait l'acces le dernier jour, celui ou l'on
 * transmet justement les dossiers.
 *
 * Les deux dates sont au format ISO et se comparent en chaines — voir la meme
 * decision dans `filtrerMouvements`.
 */
export function mandatEnCours(mandat: MandatConnu, aujourdhui: string): boolean {
  return mandat.date_fin === null || mandat.date_fin >= aujourdhui;
}

/**
 * L'acces doit-il etre ferme parce que tous les mandats ont pris fin ?
 *
 * ON REVOQUE SUR PREUVE, JAMAIS SUR ABSENCE DE PREUVE (regle 15). Un compte
 * dont on ne connait AUCUN mandat n'est pas un compte dont les mandats sont
 * echus : c'est un compte dont on ne sait rien. La difference n'est pas
 * theorique — une fiche non reliee, une lecture bornee par la RLS, une base
 * anterieure a la regle donnent toutes une liste vide, et fermer sur ce
 * silence mettrait l'organisation dehors sans que rien ne l'explique.
 *
 * DEUX EXCEPTIONS NOMMEES, et pas une de plus :
 *
 * - LA DEROGATION DU SIEGE. Quand tous les bureaux se ferment, LE SIEGE SEUL
 *   GARDE UN MANDAT OUVERT. Ce n'est pas un privilege, c'est la condition pour
 *   que l'organisation puisse repartir : s'il se ferme avec les autres, plus
 *   personne ne peut rouvrir quoi que ce soit, et il ne reste que l'acces
 *   direct a la base.
 *
 *   La derogation porte sur L'ENTITE, pas sur le role. Un administrateur du
 *   Siege qui n'est pas SuperAdmin doit lui aussi pouvoir rouvrir les bureaux ;
 *   ne dispenser que le SuperAdmin ferait dependre le redemarrage d'UNE
 *   personne, absente le jour ou il le faudrait. Le role reste teste par
 *   securite : un SuperAdmin est de toute facon rattache au Siege
 *   (`fn_profile_rattachement`, EF-ACT-2), et deux verrous valent mieux qu'un
 *   quand ce qu'ils protegent est la derniere porte.
 *
 * - LE RESPONSABLE INFORMATIQUE, TANT QU'IL L'EST. Il ne siege dans aucun
 *   bureau — c'est exactement ce pour quoi il a ete cree (migration `0047`).
 *   L'exception le suit et ne lui survit pas : le jour ou il cesse de l'etre,
 *   il redevient un membre de bureau comme les autres, et perd l'acces si
 *   aucun mandat ne le couvre. Sa FICHE DE CROYANT, elle, ne bouge pas.
 *
 * DANS TOUS LES CAS, ON NE FERME QUE L'ACCES. Un tresorier remplace reste un
 * croyant de son eglise, avec son historique, ses dimes et ses bapteemes : ce
 * module ne decide de rien d'autre que de l'ouverture de l'application.
 */
export function mandatEchu(compte: CompteAEvaluer, aujourdhui: string): boolean {
  if (compte.typeEntite === 'SIEGE') return false;
  if (compte.role === 'SUPERADMIN') return false;
  if (compte.estResponsableInformatique) return false;

  // Aucun mandat connu : on ne sait pas, donc on ne ferme pas.
  if (compte.mandats.length === 0) return false;

  return !compte.mandats.some((m) => mandatEnCours(m, aujourdhui));
}

/**
 * La date de fin la plus RECENTE parmi les mandats — celle qu'on affiche.
 *
 * Quelqu'un qui a siege dans trois bureaux veut savoir quand son dernier
 * mandat s'est termine, pas le premier : c'est celui-la qui explique pourquoi
 * l'acces s'est ferme aujourd'hui et pas il y a trois ans.
 */
export function finDeMandatLaPlusRecente(
  mandats: readonly MandatConnu[],
): string | null {
  let derniere: string | null = null;

  for (const m of mandats) {
    if (m.date_fin === null) continue;
    if (derniere === null || m.date_fin > derniere) derniere = m.date_fin;
  }

  return derniere;
}
