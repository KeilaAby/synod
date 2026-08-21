'use client';

import { Award, ChevronDown, Loader2, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import { avertir } from '@/components/shared/messages';
import { useSession } from '@/components/shared/session-provider';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { deciderPromotion } from '@/lib/actions/promotions';
import type { PromotionEnAttente } from '@/lib/data/promotions';
import { nomComplet } from '@/lib/domain/croyant';
import { peutDeciderPromotion } from '@/lib/domain/promotion';
import { appelerAction } from '@/lib/utils/appeler-action';
import { cn } from '@/lib/utils';
import { formatDate, formatNombre } from '@/lib/utils/format';

/**
 * Les promotions de grade qui attendent une décision — EF-CRO-12.
 *
 * CE QUI ATTEND PASSE AVANT CE QUI SE CONSULTE : une file invisible ne se
 * traite jamais. Elle vit donc sur `/croyants`, en tête, comme la file des
 * versements à rapprocher — et pour la même raison : c'est ici qu'on connaît
 * les gens.
 *
 * ON N'Y VOIT QUE CE QU'ON PEUT TRANCHER. La RLS laisse voir les demandes de
 * son église (pour savoir où elles en sont) **et** celles qu'on arbitre. Mais
 * une file où l'on ne peut rien faire n'est pas une file : c'est une liste
 * d'attente qui donne l'impression d'un travail à faire. Le filtrage se fait
 * donc sur la COMPÉTENCE, pas sur la visibilité.
 *
 * LE COMPTE RESTE VISIBLE, LE TRAVAIL SE REPLIE — même choix que la file de
 * rapprochement : replier l'alerte reviendrait à la supprimer.
 */
export function PromotionsEnAttente({
  promotions,
  photos,
}: {
  promotions: PromotionEnAttente[];
  photos: Record<string, string>;
}) {
  const router = useRouter();
  const { session } = useSession();

  const [deplie, setDeplie] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);
  /** La demande qu'on s'apprête à refuser — le motif se saisit avant. */
  const [aRefuser, setARefuser] = useState<PromotionEnAttente | null>(null);
  const [motif, setMotif] = useState('');

  /**
   * RG-06 — la compétence se juge sur l'ARBITRE figé à la demande. Un compte
   * borné à l'église ne couvre pas son parent, donc ne s'approuve pas lui-même.
   */
  const aTrancher = useMemo(
    () =>
      promotions.filter((p) =>
        peutDeciderPromotion(session, {
          statut: p.statut,
          arbitrePath: p.arbitre?.path ?? null,
        }),
      ),
    [promotions, session],
  );

  async function decider(p: PromotionEnAttente, approuver: boolean, raison: string | null) {
    setEnCours(p.id);
    try {
      const resultat = await appelerAction(() =>
        deciderPromotion({ promotionId: p.id, approuver, motif: raison }),
      );

      if (!resultat.ok) {
        avertir(resultat.error, { ton: 'refus', titre: 'Décision impossible' });
        return;
      }

      toast.success(
        approuver
          ? `Promotion approuvée. Le grade est posé sur la fiche.`
          : 'Promotion refusée. Le motif a été enregistré.',
      );
      setARefuser(null);
      setMotif('');
      router.refresh();
    } finally {
      setEnCours(null);
    }
  }

  if (aTrancher.length === 0) return null;

  return (
    <Collapsible asChild open={deplie} onOpenChange={setDeplie}>
      <section className="space-y-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-left transition-colors hover:bg-amber-100"
          >
            <Award className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
            <p className="flex-1 text-sm">
              <span className="font-medium">
                {formatNombre(aTrancher.length)} promotion
                {aTrancher.length > 1 ? 's' : ''} de grade à trancher
              </span>{' '}
              <span className="text-muted-foreground">
                — {aTrancher.length > 1 ? 'des églises' : 'une église'} qui dépend
                {aTrancher.length > 1 ? 'ent' : ''} de vous {aTrancher.length > 1 ? 'ont' : 'a'}{' '}
                reconnu un grade. Il reste à le confirmer.
              </span>
            </p>

            <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
              {deplie ? 'Replier' : 'Trancher'}
              <ChevronDown
                className={cn('size-4 transition-transform', deplie && 'rotate-180')}
                aria-hidden
              />
            </span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-border overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Croyant</TableHead>
                  <TableHead>Promotion demandée</TableHead>
                  <TableHead>Église</TableHead>
                  <TableHead className="w-28">Depuis le</TableHead>
                  <TableHead className="w-52" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {aTrancher.map((p) => (
                  <TableRow key={p.id} className="hover:bg-transparent">
                    <TableCell>
                      <span className="flex items-center gap-3">
                        {p.croyant && (
                          <AvatarCroyant
                            nom={p.croyant.nom}
                            prenom={p.croyant.prenom}
                            url={p.croyant.photo_key ? photos[p.croyant.photo_key] : null}
                          />
                        )}
                        <span className="text-sm">
                          <span className="block font-medium">
                            {p.croyant
                              ? nomComplet(p.croyant.nom, p.croyant.prenom)
                              : 'Croyant supprimé'}
                          </span>
                          <span className="text-muted-foreground font-mono text-xs">
                            {p.croyant?.matricule}
                          </span>
                        </span>
                      </span>
                    </TableCell>

                    {/*
                      LE GRADE QUITTÉ FIGURE À CÔTÉ DU GRADE VISÉ.

                      « Diacre » seul ne dit pas si c'est une promotion, une
                      correction ou une rétrogradation. Les deux ensemble se
                      lisent d'un coup d'œil, et resteront lisibles dans six
                      mois — la fiche, elle, aura changé.
                    */}
                    <TableCell className="text-sm">
                      <span className="text-muted-foreground">
                        {p.gradeActuel?.libelle ?? 'Aucun grade'}
                      </span>
                      <span className="mx-2 text-muted-foreground">→</span>
                      <span className="font-medium">{p.gradeDemande?.libelle ?? '—'}</span>
                    </TableCell>

                    <TableCell className="text-sm">
                      {p.eglise?.nom ?? '—'}
                      {p.demandeur && (
                        <span className="text-muted-foreground block text-xs">
                          par {p.demandeur.nom_complet}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-xs tabular-nums">
                      {formatDate(p.date_demande)}
                    </TableCell>

                    <TableCell>
                      <span className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          className="h-8"
                          disabled={enCours !== null}
                          onClick={() => void decider(p, true, null)}
                        >
                          {enCours === p.id ? (
                            <Loader2 className="mr-2 size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <ThumbsUp className="mr-2 size-3.5" aria-hidden />
                          )}
                          Approuver
                        </Button>

                        {/*
                          UN REFUS SE MOTIVE, une approbation non : approuver
                          confirme ce que la demande disait déjà, refuser dit le
                          contraire. Le motif se saisit donc avant, dans un
                          pop-up — pas après, quand il serait trop tard.
                        */}
                        <Button
                          variant="ghost"
                          className="text-destructive h-8"
                          disabled={enCours !== null}
                          onClick={() => {
                            setMotif('');
                            setARefuser(p);
                          }}
                        >
                          <ThumbsDown className="mr-2 size-3.5" aria-hidden />
                          Refuser
                        </Button>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>

        {/* Un SEUL pop-up pour toute la file, piloté par la ligne retenue
            (règle 16) : un par ligne en monterait autant, tous invisibles. */}
        <Dialog open={aRefuser !== null} onOpenChange={(v) => !v && setARefuser(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Refuser cette promotion&nbsp;?</DialogTitle>
              <DialogDescription>
                {aRefuser?.croyant
                  ? `${nomComplet(aRefuser.croyant.nom, aRefuser.croyant.prenom)} reste ${aRefuser.gradeActuel?.libelle ?? 'sans grade'}.`
                  : 'Le grade de la fiche ne change pas.'}{' '}
                L’église qui a fait la demande lira votre motif.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1">
              <label htmlFor="motif-refus-promotion" className="text-sm font-medium">
                Motif du refus
              </label>
              <Textarea
                id="motif-refus-promotion"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Ancienneté insuffisante, formation à compléter…"
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                className="h-10"
                onClick={() => setARefuser(null)}
                disabled={enCours !== null}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                className="h-10"
                disabled={motif.trim().length < 3 || enCours !== null}
                onClick={() => aRefuser && void decider(aRefuser, false, motif.trim())}
              >
                {enCours !== null && (
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                )}
                Refuser la promotion
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </Collapsible>
  );
}
