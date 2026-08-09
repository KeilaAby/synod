'use client';

import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Attente d'une opération en cours — UI-16, ENF-UTI-06.
 *
 * POURQUOI un pop-up et non un simple spinner de bouton : certaines opérations
 * partent d'un **menu déroulant**, qui se referme au clic. L'écran redevient
 * alors strictement identique à ce qu'il était, et rien ne distingue « c'est
 * parti » de « je n'ai pas cliqué au bon endroit ». L'utilisateur reclique.
 *
 * Une clôture ou une suppression de bureau touche deux tables puis attend le
 * re-rendu serveur : un second envoi pendant ce temps n'est pas anodin. Le
 * pop-up **bloque** donc l'écran — c'est sa raison d'être, pas un effet de
 * style. Il ne se ferme ni par Échap ni par un clic extérieur : ce que
 * l'utilisateur fermerait, ce serait l'affichage, pas l'opération.
 *
 * Règle 4 : `Loader2` est ici à sa place — action ponctuelle, pas chargement
 * de page. Un écran qui charge des DONNÉES prend un squelette.
 */
export function OperationDialog({
  ouvert,
  titre,
  description,
}: {
  ouvert: boolean;
  /** Ce qui est en train de se faire : « Clôture du mandat… ». */
  titre: string;
  description?: string;
}) {
  return (
    <Dialog open={ouvert}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        /**
         * `z-60` : au-DESSUS de tout autre pop-up.
         *
         * Ces attentes se déclenchent souvent depuis un pop-up déjà ouvert —
         * la liste des référentiels, la composition d'un bureau. Toutes les
         * couches de dialogue partagent `z-50` : à égalité, c'est l'ordre du
         * DOM qui tranche, et il ne garantit rien. Un pop-up d'attente qu'on
         * peut ne pas voir ne sert à rien.
         */
        className="z-[60] w-[min(92vw,26rem)] sm:max-w-md"
        // `aria-live` : le lecteur d'écran annonce l'attente au lieu de la subir.
        role="status"
        aria-live="polite"
        aria-busy
      >
        <div className="flex items-start gap-4 py-2">
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-indigo-600" aria-hidden />
          <div className="space-y-2">
            <DialogTitle className="text-base">{titre}</DialogTitle>
            <DialogDescription>
              {description ?? 'Merci de patienter, ne fermez pas cette fenêtre.'}
            </DialogDescription>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
