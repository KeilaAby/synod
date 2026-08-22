/**
 * Le délai de correction de saisie — EF-BUR-08, EF-CRO-12.
 *
 * UNE SEULE RÈGLE, DEUX ENDROITS QUI LA CONSOMMAIENT SÉPARÉMENT.
 *
 * Retirer un titulaire de bureau et corriger un grade posé par erreur suivent
 * la MÊME logique : passé un certain nombre de jours depuis l'enregistrement,
 * ce n'est plus une correction de saisie mais une décision, et elle se motive.
 * `lib/domain/bureau.ts` et `lib/domain/promotion.ts` portaient chacun leur
 * propre constante à 15 et leur propre comparaison — la même règle écrite à
 * deux endroits, qui ne divergeait pas encore, mais qui aurait fini par le
 * faire le jour où l'un des deux aurait été retouché sans l'autre.
 *
 * Module PUR : aucune dépendance serveur, testable des deux côtés de la
 * frontière (règle 31).
 */

/**
 * Valeur de départ et repli — pas la vérité en base, qui se règle à l'écran.
 *
 * Quinze jours laissent le temps de s'apercevoir d'une faute de frappe — un
 * bureau se compose sur une ou deux semaines — sans ouvrir une porte par
 * laquelle on effacerait, six mois plus tard, un mandat qui a réellement eu
 * lieu.
 */
export const JOURS_CORRECTION_SAISIE_DEFAUT = 15;

/**
 * Le délai est-il encore ouvert, depuis la date d'ENREGISTREMENT ?
 *
 * PAS depuis le début du mandat ou du grade concerné : un bureau peut être
 * saisi en retard, avec une date de début antérieure de six mois — c'est le
 * jour où la LIGNE a été créée qui dit depuis quand la faute était visible et
 * corrigeable.
 *
 * Les deux dates se comparent en JOURS entiers, sur l'horodatage : une ligne
 * saisie le matin et corrigée le soir du dernier jour reste rattrapable.
 */
export function dansLeDelaiDeCorrection(
  enregistreLe: string,
  joursDelai: number,
  maintenant: Date = new Date(),
): boolean {
  const pose = Date.parse(enregistreLe);
  // Une date illisible ne rouvre pas la fenêtre : dans le doute, c'est une
  // décision, qui se motive. Le refus se corrige, l'effacement non.
  if (Number.isNaN(pose)) return false;

  const jours = (maintenant.getTime() - pose) / 86_400_000;
  return jours >= 0 && jours <= joursDelai;
}
