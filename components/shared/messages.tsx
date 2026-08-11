'use client';

import { useState, useSyncExternalStore } from 'react';

import { MessageDialog } from './message-dialog';

/**
 * Les messages qui doivent être LUS — ENF-UTI-05.
 *
 * CE QUI VA OÙ
 *
 * Une **notification** convient à ce qui se constate : « Croyant enregistré »,
 * « Mandat clos ». On la voit du coin de l'œil, elle disparaît, et rien n'est
 * perdu — l'écran montre déjà le résultat.
 *
 * Tout le reste — un refus motivé, une donnée invalide, une panne réseau, un
 * avertissement — porte la **seule** information utile de l'opération. Une
 * notification de quatre secondes la fait disparaître avant la deuxième ligne :
 * l'utilisateur retient « ça n'a pas marché », ce que le message essayait
 * précisément d'éviter. Ces messages passent donc dans un pop-up qu'il ferme
 * lui-même.
 *
 * POURQUOI UN REGISTRE GLOBAL PLUTÔT QU'UN ÉTAT PAR ÉCRAN
 *
 * `MessageDialog` existait déjà, mais il fallait le câbler dans chaque
 * composant : un état, un handler, un rendu — quarante fois, et un oubli à
 * chaque nouvel écran. `avertir()` s'appelle comme `toast.error()`, de
 * n'importe où, y compris hors de React (`imprimer-organigramme`,
 * `garde-erreurs`).
 *
 * LA FILE
 *
 * Deux refus peuvent arriver coup sur coup — une action en boucle, deux
 * promesses rejetées. Le second ne doit pas écraser le premier : ils se suivent,
 * et l'utilisateur les ferme l'un après l'autre.
 */

export type TonMessage = 'refus' | 'information';

interface Message {
  readonly id: number;
  readonly titre: string;
  readonly texte: string;
  readonly ton: TonMessage;
}

const VIDE: readonly Message[] = [];

let file: readonly Message[] = VIDE;
let dernierId = 0;
const abonnes = new Set<() => void>();

function publier(suivante: readonly Message[]): void {
  file = suivante;
  for (const notifier of abonnes) notifier();
}

/**
 * Affiche un message que l'utilisateur devra fermer.
 *
 * @param texte  Le message. Il s'écrit en clair : ni balise, ni astérisque —
 *               le pop-up rend du texte, pas du Markdown.
 * @param options.titre  Par défaut, dépend du ton.
 * @param options.ton    `refus` (l'opération n'a pas eu lieu) ou `information`.
 */
export function avertir(
  texte: string,
  options?: { titre?: string; ton?: TonMessage },
): void {
  const ton = options?.ton ?? 'refus';
  const message: Message = {
    id: ++dernierId,
    texte,
    ton,
    titre: options?.titre ?? (ton === 'refus' ? "L'opération n'a pas eu lieu" : 'Information'),
  };

  // Le MÊME message deux fois de suite n'apprend rien de plus : une action
  // rejouée en boucle empilerait sinon dix pop-ups identiques a fermer.
  if (file.some((m) => m.texte === texte)) return;

  publier([...file, message]);
}

/** Raccourci de lecture : un renseignement, pas un échec. */
export function informer(texte: string, titre?: string): void {
  avertir(texte, { ton: 'information', titre });
}

function abonner(notifier: () => void): () => void {
  abonnes.add(notifier);
  return () => abonnes.delete(notifier);
}

const lire = () => file;
/** Le serveur ne rend jamais de message : le registre naît côté client. */
const lireServeur = () => VIDE;

/**
 * Monté une fois, dans le layout racine.
 *
 * Il conserve le message affiché même après l'avoir retiré de la file : sans
 * cela, le pop-up se viderait de son texte pendant son animation de fermeture.
 */
export function GardeMessages() {
  const messages = useSyncExternalStore(abonner, lire, lireServeur);
  const premier = messages[0] ?? null;

  const [affiche, setAffiche] = useState<Message | null>(null);
  if (premier && premier.id !== affiche?.id) setAffiche(premier);

  return (
    <MessageDialog
      ouvert={premier !== null}
      titre={affiche?.titre ?? ''}
      message={affiche?.texte ?? ''}
      ton={affiche?.ton ?? 'refus'}
      onFermer={() => publier(file.slice(1))}
    />
  );
}
