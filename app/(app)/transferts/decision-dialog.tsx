'use client';

import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Field } from '@/components/shared/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { approuverTransfert, refuserTransfert } from '@/lib/actions/transferts';
import { TransfertDetail } from '@/components/transferts/transfert-detail';
import type { TransfertListe } from '@/lib/data/transferts';
import { nomComplet } from '@/lib/domain/croyant';
import { formatDate } from '@/lib/utils/format';

/**
 * Décision sur une demande de transfert — EF-TRF-03, RG-11, RG-12.
 *
 * Approuver applique le transfert IMMÉDIATEMENT : c'est une opération qui
 * déplace un croyant, pas un simple changement d'état. Le dialogue le dit avant
 * plutôt que de le faire découvrir après.
 *
 * Le refus exige un motif — contrainte `transfert_refus_motive` en base. Le
 * demandeur doit savoir pourquoi, sans quoi il redemandera à l'identique.
 */
export function DecisionDialog({
  transfert,
  ouvert,
  onOuvertChange,
}: {
  transfert: TransfertListe | null;
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
}) {
  const router = useRouter();
  const [motifRefus, setMotifRefus] = useState('');
  const [modeRefus, setModeRefus] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (!transfert) return null;

  function fermer() {
    setMotifRefus('');
    setModeRefus(false);
    setErreur(null);
    onOuvertChange(false);
  }

  async function approuver() {
    setEnCours(true);
    setErreur(null);

    const resultat = await approuverTransfert({ id: transfert!.id });
    setEnCours(false);

    if (!resultat.ok) {
      setErreur(resultat.error);
      return;
    }

    toast.success('Transfert approuvé et appliqué.');
    fermer();
    router.refresh();
  }

  async function refuser() {
    if (motifRefus.trim().length < 10) {
      setErreur('Un refus doit être motivé (10 caractères au moins).');
      return;
    }

    setEnCours(true);
    setErreur(null);

    const resultat = await refuserTransfert({ id: transfert!.id, motifRefus });
    setEnCours(false);

    if (!resultat.ok) {
      setErreur(resultat.error);
      return;
    }

    toast.success('Demande refusée. Le demandeur est informé du motif.');
    fermer();
    router.refresh();
  }

  const personne = transfert.croyant
    ? nomComplet(transfert.croyant.nom, transfert.croyant.prenom)
    : 'ce croyant';

  return (
    <Dialog open={ouvert} onOpenChange={(v) => (v ? onOuvertChange(true) : fermer())}>
      <DialogContent className="max-h-[90vh] w-[min(96vw,48rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Décider du transfert</DialogTitle>
          <DialogDescription>
            {personne} — matricule {transfert.croyant?.matricule}. Demandé le{' '}
            {formatDate(transfert.date_demande)}
            {transfert.demandeur ? ` par ${transfert.demandeur.nom_complet}` : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {erreur && (
            <Alert variant="destructive" role="alert">
              <AlertCircle className="size-4" aria-hidden />
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}

          <TransfertDetail transfert={transfert} />

          {modeRefus && (
            <Field label="Motif du refus" required>
              {(aria) => (
                <Textarea
                  {...aria}
                  rows={3}
                  autoFocus
                  value={motifRefus}
                  onChange={(e) => setMotifRefus(e.target.value)}
                  placeholder="Le demandeur lira ce motif : soyez précis."
                />
              )}
            </Field>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" className="h-10" onClick={fermer} disabled={enCours}>
            Fermer
          </Button>

          <div className="flex gap-2">
            {modeRefus ? (
              <>
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() => setModeRefus(false)}
                  disabled={enCours}
                >
                  Revenir
                </Button>
                <Button
                  variant="destructive"
                  className="h-10"
                  onClick={refuser}
                  disabled={enCours}
                >
                  {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
                  Confirmer le refus
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() => setModeRefus(true)}
                  disabled={enCours}
                >
                  <X className="mr-2 size-4" aria-hidden />
                  Refuser
                </Button>
                <Button className="h-10" onClick={approuver} disabled={enCours}>
                  {enCours ? (
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="mr-2 size-4" aria-hidden />
                  )}
                  Approuver et appliquer
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
