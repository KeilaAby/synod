'use client';

import { AlertCircle, Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Un message qu'on doit avoir le temps de LIRE — ENF-UTI-05.
 *
 * POURQUOI PAS UNE NOTIFICATION
 *
 * Une notification convient à ce qui se constate — « enregistré », « mandat
 * clos ». Elle ne convient pas à ce qui s'explique : un refus motivé tient en
 * trois lignes, énonce une raison ET une alternative, et disparaît avant qu'on
 * en soit à la deuxième. L'utilisateur en retient « ça n'a pas marché », ce qui
 * est exactement ce que le message essayait d'éviter.
 *
 * Le pop-up attend d'être fermé. C'est le seul cas où l'on impose ce geste :
 * quand le texte porte la seule information utile de l'opération.
 */
export function MessageDialog({
  ouvert,
  titre,
  message,
  ton = 'refus',
  onFermer,
}: {
  ouvert: boolean;
  titre: string;
  message: string;
  /** `refus` : l'opération n'a pas eu lieu, et voici pourquoi. */
  ton?: 'refus' | 'information';
  onFermer: () => void;
}) {
  const Icone = ton === 'refus' ? AlertCircle : Info;

  return (
    <Dialog open={ouvert} onOpenChange={(v) => !v && onFermer()}>
      {/* `z-60` — même raison que le pop-up d'attente : un refus déclenché
          depuis un autre pop-up doit passer devant, pas derrière. */}
      <DialogContent className="z-[60] w-[min(94vw,32rem)] sm:max-w-lg">
        <DialogHeader>
          <span className="flex items-start gap-3">
            <Icone
              className={
                ton === 'refus'
                  ? 'text-destructive mt-0.5 size-5 shrink-0'
                  : 'mt-0.5 size-5 shrink-0 text-indigo-600'
              }
              aria-hidden
            />
            <span className="space-y-2">
              <DialogTitle className="text-base">{titre}</DialogTitle>
              {/* `whitespace-pre-line` : un message peut porter un détail
                  technique sur sa propre ligne — la référence d'une erreur
                  serveur, par exemple. Sans cela, tout se recolle. */}
              <DialogDescription className="text-sm leading-relaxed whitespace-pre-line">
                {message}
              </DialogDescription>
            </span>
          </span>
        </DialogHeader>

        <DialogFooter>
          <Button className="h-10" onClick={onFermer}>
            J&apos;ai compris
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
