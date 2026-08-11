'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Le filet : aucune erreur ne reste muette — ENF-UTI-05.
 *
 * POURQUOI IL FAUT UN FILET
 *
 * `executerAction` protège le corps d'une Server Action, `appelerAction`
 * protège son appel. Restent les vingt-cinq autres endroits où une action est
 * invoquée sans garde, et tous ceux qu'on écrira demain. Quand l'appel échoue —
 * connexion tombée, fonction serveur expirée, identifiant d'action périmé après
 * un déploiement — la promesse est rejetée, le code qui suit ne s'exécute pas,
 * et l'écran reste **exactement** comme avant. L'utilisateur conclut que
 * l'application est cassée.
 *
 * C'est le symptôme observé en production le 10 août 2026 : un spinner d'une
 * seconde, puis rien. Pas même un message d'erreur.
 *
 * CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS
 *
 * Il **annonce**, il ne répare rien : la saisie est perdue, et le dire est la
 * seule chose utile. Le message invite à recommencer et, si cela persiste, à
 * recharger — un onglet resté ouvert après un déploiement appelle des actions
 * qui n'existent plus.
 *
 * Il ne remplace pas un traitement d'erreur en bonne et due forme là où le
 * formulaire peut faire mieux — signaler le champ fautif, proposer une
 * correction. Il garantit seulement qu'aucun échec ne passe inaperçu.
 */
export function GardeErreurs() {
  useEffect(() => {
    /** Deux notifications identiques à la suite n'apprennent rien de plus. */
    let dernier = '';

    function annoncer(detail: string) {
      if (detail === dernier) return;
      dernier = detail;
      setTimeout(() => {
        dernier = '';
      }, 5_000);

      toast.error(
        'Le serveur n’a pas répondu — votre dernière action n’a pas abouti. ' +
          'Vérifiez votre connexion et recommencez. Si cela persiste, rechargez la page.',
        { duration: 12_000, description: detail },
      );
    }

    function surRejet(evenement: PromiseRejectionEvent) {
      const raison = evenement.reason;

      // Une navigation interrompue rejette aussi : ce n'est pas une panne, et
      // l'annoncer ferait crier l'application à chaque changement de page.
      if (raison?.name === 'AbortError') return;

      console.error('[garde] promesse rejetée sans traitement', raison);

      // Le `digest` est la seule prise sur une erreur serveur masquée en
      // production : la même chaîne figure dans les journaux de l'hébergement.
      const digest = raison?.digest ? `référence ${raison.digest}` : null;
      annoncer(digest ?? (raison instanceof Error ? raison.message : String(raison)));
    }

    window.addEventListener('unhandledrejection', surRejet);
    return () => window.removeEventListener('unhandledrejection', surRejet);
  }, []);

  return null;
}
