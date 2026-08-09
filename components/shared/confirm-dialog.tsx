'use client';

import { Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

/**
 * Confirmation d'une action destructive — ENF-UTI-04.
 *
 * Le libelle DOIT nommer l'objet concerne : « Supprimer la paroisse
 * Antananarivo ? », jamais « Confirmer ? ». Une confirmation anonyme est une
 * confirmation qu'on clique sans lire.
 *
 * UI-16 : le spinner `Loader2` est ici a sa place — c'est une action ponctuelle,
 * pas un chargement de page.
 */
export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = true,
  onConfirm,
}: {
  /** Element declencheur. Omis en mode controle. */
  trigger?: React.ReactNode;
  /** Mode controle : la boite est ouverte par un evenement exterieur. */
  open?: boolean;
  onOpenChange?: (ouvert: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [ouvertInterne, setOuvertInterne] = useState(false);
  const [enCours, demarrer] = useTransition();

  // Controle si `open` est fourni, autonome sinon : le meme composant sert le
  // clic direct (menu) et l'ouverture programmee (glisser-deposer).
  const controle = open !== undefined;
  const ouvert = controle ? open : ouvertInterne;

  function definirOuvert(valeur: boolean) {
    if (controle) onOpenChange?.(valeur);
    else setOuvertInterne(valeur);
  }

  /**
   * La transition couvre l'ATTENTE, jamais l'APPEL.
   *
   * `onConfirm` etait invoque a l'interieur de `startTransition`. Toutes ses
   * ecritures d'etat devenaient donc des mises a jour de transition — que React
   * est libre de fondre avec les suivantes, sans jamais rendre l'etat
   * intermediaire. Un appelant qui ouvrait un pop-up d'attente puis le fermait
   * a la fin de la meme sequence ne le voyait donc JAMAIS s'afficher.
   *
   * Le geste est desormais appele hors transition : ses ecritures sont
   * urgentes, et l'ecran suit. Seule l'attente d'une promesse — quand
   * `onConfirm` en rend une — reste dans la transition, ce qui est tout ce
   * qu'on lui demandait : garder la boite ouverte et son bouton occupe.
   */
  function confirmer(evenement: React.MouseEvent) {
    evenement.preventDefault();
    const resultat = onConfirm();

    if (!(resultat instanceof Promise)) {
      definirOuvert(false);
      return;
    }

    demarrer(async () => {
      await resultat;
      definirOuvert(false);
    });
  }

  return (
    <AlertDialog open={ouvert} onOpenChange={definirOuvert}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={enCours}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmer}
            disabled={enCours}
            className={cn(
              destructive &&
                'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40',
            )}
          >
            {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
