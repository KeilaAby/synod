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
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = true,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrer] = useTransition();

  function confirmer(evenement: React.MouseEvent) {
    // On garde la boite ouverte pendant l'action pour montrer sa progression.
    evenement.preventDefault();
    demarrer(async () => {
      await onConfirm();
      setOuvert(false);
    });
  }

  return (
    <AlertDialog open={ouvert} onOpenChange={setOuvert}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>

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
