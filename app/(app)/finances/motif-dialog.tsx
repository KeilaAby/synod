'use client';

import { AlertCircle } from 'lucide-react';
import { useState } from 'react';

import { Field } from '@/components/shared/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

/**
 * Le motif d'un rejet ou d'une annulation — EF-FIN-14, EF-FIN-20.
 *
 * POURQUOI UNE SAISIE PLUTÔT QU'UNE CONFIRMATION. Rejeter sans dire pourquoi
 * laisse celui qui a saisi devant un refus muet : il ne peut pas corriger, il
 * ne peut que redemander. Annuler sans motif retire un montant d'un solde déjà
 * publié, sur lequel quelqu'un a pu décider une dépense.
 *
 * Le motif est donc EXIGÉ, ici comme dans le schéma et comme en base : les
 * trois refusent la même chose, et l'écran est le seul des trois à pouvoir
 * l'expliquer avant qu'on ait cliqué.
 */
export function MotifDialog({
  action,
  onFermer,
  onValider,
}: {
  action: { id: string; statut: 'REJETE' | 'ANNULE' } | null;
  onFermer: () => void;
  onValider: (motif: string) => void;
}) {
  /**
   * Le champ repart vide à chaque ouverture — garder le motif du mouvement
   * précédent ferait signer un rejet avec la raison d'un autre.
   *
   * C'est l'appelant qui s'en charge, par une `key` portant l'identifiant du
   * mouvement : un changement de clé REMONTE le composant, donc réinitialise
   * son état. Un `useEffect` qui remet l'état à zéro déclenche un second rendu
   * pour défaire le premier, et React le refuse à juste titre.
   */
  const [motif, setMotif] = useState('');

  const rejet = action?.statut === 'REJETE';
  const tropCourt = motif.trim().length < 3;

  return (
    <Dialog open={action !== null} onOpenChange={(v) => !v && onFermer()}>
      <DialogContent className="w-[min(96vw,32rem)]">
        <DialogHeader>
          <DialogTitle>
            {rejet ? 'Rejeter ce mouvement' : 'Annuler ce mouvement'}
          </DialogTitle>
          <DialogDescription>
            {rejet
              ? 'Le motif sera lu par la personne qui a saisi : il doit lui dire quoi corriger.'
              : 'Le mouvement reste visible, marqué « annulé », et sort des soldes. La ligne d’origine est conservée.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <Field
            label="Motif"
            required
            error={
              tropCourt && motif.length > 0 ? 'Le motif est trop court.' : undefined
            }
          >
            {(aria) => (
              <Textarea
                {...aria}
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                rows={4}
                autoFocus
                placeholder={
                  rejet
                    ? 'Le montant ne correspond pas au reçu n° 148.'
                    : 'Doublon de l’écriture du 3 août.'
                }
              />
            )}
          </Field>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="h-10" onClick={onFermer}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-10"
            disabled={tropCourt}
            onClick={() => onValider(motif.trim())}
          >
            <AlertCircle className="mr-2 size-4" aria-hidden />
            {rejet ? 'Rejeter' : 'Annuler le mouvement'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
