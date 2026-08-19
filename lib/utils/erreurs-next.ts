/**
 * Distinguer la NAVIGATION d'une panne — ENF-UTI-05.
 *
 * `redirect()` et `notFound()` ne retournent pas : elles **lèvent**. C'est
 * ainsi que Next interrompt le travail en cours pour partir ailleurs, et
 * l'exception porte sa consigne dans son `digest` :
 *
 *     NEXT_REDIRECT;push;/tableau-de-bord;307;
 *
 * Elle ne signale donc aucun échec — elle signale au contraire qu'une action a
 * réussi et que l'écran doit changer. Un traitement d'erreur qui la prend pour
 * une panne fait DEUX dégâts, et le second est le pire :
 *
 *   · il annonce « votre dernière action n'a pas abouti » par-dessus la page
 *     d'arrivée, à l'issue d'une action qui venait précisément d'aboutir ;
 *   · s'il l'AVALE au lieu de la relever, la redirection n'a jamais lieu.
 *
 * POURQUOI CETTE FONCTION EXISTE PLUTÔT QUE TROIS TESTS. La règle vivait à deux
 * endroits — relevée dans `executerAction`, absente d'`appelerAction` — et le
 * troisième, le filet global, ne la connaissait pas du tout. Une règle écrite
 * en plusieurs exemplaires diverge le jour où on l'écrit.
 *
 * POURQUOI LE PRÉFIXE `NEXT_` ET NON DEUX CODES NOMMÉS. Ce préfixe est réservé
 * au flux de contrôle du framework ; les erreurs serveur ordinaires portent un
 * `digest` haché, sans lettres. Le tester largement est le choix sûr : une
 * sentinelle ajoutée par une version future sera relevée au lieu d'être
 * avalée, et se relever de trop est bénin — se faire avaler ne l'est pas.
 *
 * Et on ne l'importe pas de `next/dist/...` : un chemin interne se déplace
 * d'une version à l'autre, là où cette chaîne voyage jusque dans le navigateur
 * et est de fait publique.
 */
export function estNavigationNext(raison: unknown): boolean {
  if (typeof raison !== 'object' || raison === null || !('digest' in raison)) {
    return false;
  }

  const digest = (raison as { digest?: unknown }).digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_');
}
