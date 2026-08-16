'use client';

import { AlertCircle, CalendarCheck, Loader2, Lock, LockOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Field } from '@/components/shared/field';
import { avertir } from '@/components/shared/messages';
import { PermissionGate } from '@/components/shared/permission-gate';
import { EntityPicker, type OptionEntite } from '@/components/structure/entity-picker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cloturerPeriode, rouvrirPeriode } from '@/lib/actions/finances';
import type { PeriodeClose } from '@/lib/data/finances';
import { type MouvementFiltrable, mouvementsEnAttenteDe } from '@/lib/domain/finance';
import { libellePeriode } from '@/lib/domain/synthese';
import { formatDate, formatNombre } from '@/lib/utils/format';

/**
 * Clôture des périodes comptables — EF-FIN-26.
 *
 * ARRÊTER LES COMPTES D'UN MOIS, c'est décider qu'on n'y touchera plus. Le
 * verrou est tenu par la base (`fn_finance_before_write`) : cet écran ne fait
 * que le poser et l'annoncer. Un contrôle qui ne vivrait qu'ici se contournerait
 * par un appel direct à l'API, et une écriture rétroactive ne se voit qu'au
 * moment où l'on rapproche deux états qui auraient dû être identiques —
 * c'est-à-dire des mois plus tard.
 *
 * AUCUN HÉRITAGE, comme pour le workflow. Une période est close pour l'entité
 * qui la nomme : le Siège qui arrête janvier gèlerait sinon deux cents églises
 * qui ne l'ont pas décidé, et que seul lui pourrait dégeler. La cascade existe,
 * mais elle SE DEMANDE.
 *
 * L'ASYMÉTRIE ENTRE CLORE ET ROUVRIR EST VOULUE. Clore vingt entités d'un geste
 * fait gagner du temps sans rien risquer ; les rouvrir toutes pour corriger UNE
 * écriture ouvrirait dix-neuf portes que personne n'a demandées.
 */
export function ClotureDialog({
  entites,
  closes,
  mouvements,
}: {
  entites: OptionEntite[];
  closes: PeriodeClose[];
  /** Sert à compter ce qui attend encore une décision dans le mois visé. */
  mouvements: readonly MouvementFiltrable[];
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const [entiteId, setEntiteId] = useState<string | null>(null);
  const [mois, setMois] = useState(() => new Date().toISOString().slice(0, 7));
  const [avecPerimetre, setAvecPerimetre] = useState(false);

  const nomDe = (id: string) => entites.find((e) => e.id === id)?.nom ?? '—';

  /**
   * CE QUI ATTEND ENCORE UNE DÉCISION, dit AVANT le clic.
   *
   * La base refuse une clôture tant qu'un brouillon ou un mouvement soumis
   * subsiste — clos, il ne pourrait plus être ni validé ni rejeté. Un refus
   * qui arrive après le clic n'explique pas quoi faire ; celui-ci donne le
   * compte, et l'on sait où aller.
   */
  const enAttente = useMemo(
    () => (entiteId ? mouvementsEnAttenteDe(mouvements, entiteId, `${mois}-01`) : 0),
    [mouvements, entiteId, mois],
  );

  const dejaClose = useMemo(
    () =>
      entiteId !== null &&
      closes.some((c) => c.entityId === entiteId && c.periode.slice(0, 7) === mois),
    [closes, entiteId, mois],
  );

  async function clore() {
    if (!entiteId) return;

    setEnCours(true);
    try {
      const resultat = await cloturerPeriode({
        entiteId,
        periode: mois,
        avecPerimetre,
      });

      if (!resultat.ok) {
        avertir(resultat.error, { ton: 'refus', titre: 'Clôture refusée' });
        return;
      }

      toast.success(
        `${formatNombre(resultat.data)} période${resultat.data > 1 ? 's' : ''} close${resultat.data > 1 ? 's' : ''}.`,
      );
      router.refresh();
    } finally {
      setEnCours(false);
    }
  }

  async function rouvrir(periode: PeriodeClose) {
    /**
     * LE MOTIF EST DEMANDÉ AVANT, pas après. Une réouverture non motivée
     * laisse un historique qui dit qu'on a rouvert sans dire pourquoi — à
     * peine mieux que pas d'historique.
     */
    const motif = window.prompt(
      `Rouvrir ${libellePeriode('MOIS', periode.periode)} pour ${nomDe(periode.entityId)}.\n\n` +
        'Motif de la réouverture (il restera au journal) :',
    );
    if (motif === null) return;

    setEnCours(true);
    try {
      const resultat = await rouvrirPeriode({
        entiteId: periode.entityId,
        periode: periode.periode,
        motif,
      });

      if (!resultat.ok) {
        avertir(resultat.error, { ton: 'refus', titre: 'Réouverture refusée' });
        return;
      }

      toast.success('Période rouverte.');
      router.refresh();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <>
      <PermissionGate perm="finance.periode.close">
        <Button variant="outline" className="h-10" onClick={() => setOuvert(true)}>
          <CalendarCheck className="mr-2 size-4" aria-hidden />
          Clôture
          {closes.length > 0 && (
            <span className="bg-foreground text-background ml-2 rounded-full px-2 py-0.5 text-xs tabular-nums">
              {formatNombre(closes.length)}
            </span>
          )}
        </Button>
      </PermissionGate>

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="max-h-[92vh] w-[min(96vw,56rem)] overflow-x-hidden overflow-y-auto sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="text-2xl">Clôture des périodes</DialogTitle>
            <DialogDescription>
              Arrêter les comptes d&apos;un mois : plus aucune écriture ne peut y
              entrer ni en sortir. Seul le Siège peut rouvrir.
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 space-y-6 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Entité" required>
                {(aria) => (
                  <EntityPicker
                    {...aria}
                    options={entites}
                    value={entiteId}
                    onChange={setEntiteId}
                    placeholder="Choisir une entité"
                    emptyMessage="Aucune entité dans votre périmètre."
                  />
                )}
              </Field>

              <Field label="Mois" required>
                {(aria) => (
                  <Input
                    {...aria}
                    type="month"
                    value={mois}
                    onChange={(e) => setMois(e.target.value)}
                    className="h-10 tabular-nums"
                  />
                )}
              </Field>
            </div>

            {/*
              LA CASCADE SE DEMANDE, elle ne se déduit pas — et le dire ici
              évite qu'on la découvre après coup sur deux cents églises.
            */}
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={avecPerimetre}
                onCheckedChange={(v) => setAvecPerimetre(v === true)}
                className="mt-0.5"
              />
              <span>
                Clore aussi toutes les entités de son périmètre
                <span className="text-muted-foreground block text-xs">
                  Sans cette case, seule l&apos;entité choisie est arrêtée. Les
                  entités hors de votre habilitation sont ignorées, jamais closes
                  en silence.
                </span>
              </span>
            </label>

            {enAttente > 0 && (
              <Alert variant="destructive" role="alert">
                <AlertCircle className="size-4" aria-hidden />
                <AlertDescription>
                  {formatNombre(enAttente)} mouvement{enAttente > 1 ? 's' : ''} de
                  ce mois attend{enAttente > 1 ? 'ent' : ''} encore une décision.
                  Clos, {enAttente > 1 ? 'ils ne pourraient' : 'il ne pourrait'} plus
                  être ni validé{enAttente > 1 ? 's' : ''} ni rejeté
                  {enAttente > 1 ? 's' : ''} : la clôture sera refusée.
                </AlertDescription>
              </Alert>
            )}

            {dejaClose && (
              <Alert role="status">
                <Lock className="size-4" aria-hidden />
                <AlertDescription>
                  Cette période est déjà close pour cette entité.
                </AlertDescription>
              </Alert>
            )}

            {/* --- Ce qui est déjà arrêté -------------------------------- */}
            <div className="space-y-2">
              <p className="eyebrow">Périodes closes</p>

              {closes.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Aucune période n&apos;est arrêtée dans votre périmètre.
                </p>
              ) : (
                <div className="border-border max-h-72 overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Entité</TableHead>
                        <TableHead className="w-32">Période</TableHead>
                        <TableHead className="w-56">Close le</TableHead>
                        <TableHead className="w-32" />
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {closes.map((c) => (
                        <TableRow key={`${c.entityId}-${c.periode}`}>
                          <TableCell className="text-sm">{nomDe(c.entityId)}</TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {libellePeriode('MOIS', c.periode)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {formatDate(c.clotureLe)}
                            {c.clotureParNom && ` · ${c.clotureParNom}`}
                          </TableCell>
                          <TableCell>
                            {/* La réouverture n'apparaît qu'à qui la détient :
                                un bouton grisé ferait chercher le droit
                                manquant sur soi-même. */}
                            <PermissionGate perm="finance.periode.reopen">
                              <Button
                                variant="ghost"
                                className="h-8 text-xs"
                                disabled={enCours}
                                onClick={() => void rouvrir(c)}
                              >
                                <LockOpen className="mr-2 size-3.5" aria-hidden />
                                Rouvrir
                              </Button>
                            </PermissionGate>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => setOuvert(false)}
              disabled={enCours}
            >
              Fermer
            </Button>

            <Button
              type="button"
              className="h-10"
              disabled={enCours || !entiteId || dejaClose || enAttente > 0}
              onClick={() => void clore()}
            >
              {enCours ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              ) : (
                <Lock className="mr-2 size-4" aria-hidden />
              )}
              Clore la période
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
