import { type ActionResult, ko } from '@/lib/domain/result';

/**
 * Appeler une Server Action sans jamais laisser l'ecran muet — ENF-UTI-05.
 *
 * LE DEFAUT QU'ELLE CORRIGE
 *
 * `executerAction` protege le corps de l'action : tout ce qui s'y passe mal
 * revient en `ActionResult`. Mais elle ne protege pas l'APPEL lui-meme. Si la
 * requete n'atteint jamais le serveur, ou si sa reponse ne revient pas, la
 * promesse est REJETEE — et le code qui suit ne s'execute pas :
 *
 *     const resultat = await creerCroyant(valeurs);   // <- lance
 *     if (!resultat.ok) return traiterEchec(resultat); // <- jamais atteint
 *
 * Aucun etat n'est pose, aucune alerte n'apparait, aucune notification : le
 * spinner s'arrete et l'ecran reste exactement comme avant. C'est le symptome
 * observe en production le 10 aout 2026 — « rien ne se passe ».
 *
 * TROIS CAUSES, TOUTES REELLES
 *
 *   · la connexion tombe entre le navigateur et l'hebergement ;
 *   · la fonction serveur depasse son delai — quelques allers-retours lents
 *     vers la base y suffisent ;
 *   · un redeploiement a change l'identifiant de l'action, et l'onglet reste
 *     ouvert sur l'ancienne version.
 *
 * Aucune n'est rattrapable ici. Toutes doivent SE VOIR : un echec annonce se
 * recommence, un echec muet se prend pour une application cassee.
 *
 * L'appel n'est PAS rejoue : une action est une ecriture, et rien ne dit que
 * le serveur ne l'a pas deja appliquee (regle 28).
 */
export async function appelerAction<T>(
  appel: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await appel();
  } catch (erreur) {
    console.error('[action] appel impossible', erreur);
    return ko<T>(messageEchec(erreur));
  }
}

/**
 * Distinguer « la requete n'est pas partie » de « le serveur a leve ».
 *
 * React masque en production le message d'une erreur survenue cote serveur —
 * l'ecran n'affiche que « Minified React error #441 », qui ne dit rien a
 * personne. Mais il y attache un `digest` : la MEME chaine figure dans les
 * journaux de l'hebergement, en face de la trace complete.
 *
 * L'afficher transforme un cul-de-sac en piste : l'utilisateur lit un
 * identifiant, le journal le porte aussi, et les deux se rejoignent.
 */
function messageEchec(erreur: unknown): string {
  const digest =
    typeof erreur === 'object' && erreur !== null && 'digest' in erreur
      ? String((erreur as { digest?: unknown }).digest ?? '')
      : '';

  if (digest) {
    return (
      'Le serveur a rencontré une erreur pendant le traitement. Votre saisie ' +
      'n’a peut-être pas été enregistrée : vérifiez avant de recommencer. ' +
      `Référence à communiquer : ${digest}`
    );
  }

  const detail = erreur instanceof Error ? erreur.message : String(erreur);

  return (
    'Le serveur n’a pas répondu. Votre saisie n’a pas été enregistrée — ' +
    'vérifiez votre connexion et recommencez. ' +
    'Si le problème persiste, rechargez la page : une version plus ancienne ' +
    'de l’application peut rester ouverte après une mise à jour. ' +
    `(détail : ${detail})`
  );
}
