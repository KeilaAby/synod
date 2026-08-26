'use client';

import { AlertCircle, Loader2, Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { ChampDate } from '@/components/shared/champ-date';
import { CroyantPicker, type OptionCroyant } from '@/components/croyants/croyant-picker';
import { Field, TextField } from '@/components/shared/field';
import { avertir } from '@/components/shared/messages';
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
import { remettreCollectes } from '@/lib/actions/dimes';
import { datesDuBordereau, estEnRetard } from '@/lib/domain/dime';
import { formatDate, formatMontant, formatNombre } from '@/lib/utils/format';

/**
 * Remise d'un lot de collectes au Siège — EF-FIN-30.
 */
export interface CollecteARemettre {
  readonly id: string;
  readonly entiteId: string;
  readonly entiteNom: string;
  readonly dateOperation: string;
  readonly montant: number;
}

export function RemiseDialog({
  collectes,
  porteurs,
  photos,
  devise,
  entiteImposeeId,
  collecteImposeeId,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  declencheurVisible = true,
}: {
  /** Les collectes NON remises, toutes entités confondues. */
  collectes: CollecteARemettre[];
  /** Croyants proposables comme porteur — trésorier principal ou adjoint. */
  porteurs: OptionCroyant[];
  photos: Record<string, string>;
  devise: string;
  entiteImposeeId?: string | null;
  collecteImposeeId?: string | null;
  open?: boolean;
  onOpenChange?: (ouvert: boolean) => void;
  declencheurVisible?: boolean;
}) {
  const router = useRouter();
  const [ouvertInterne, setOuvertInterne] = useState(false);
  const ouvert = openProp !== undefined ? openProp : ouvertInterne;

  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  /**
   * UNE REMISE PORTE SUR UNE SEULE ENTITÉ.
   */
  const entites = [...new Map(collectes.map((c) => [c.entiteId, c])).values()];
  const [entiteManuelle, setEntiteManuelle] = useState<string | null>(null);
  const entiteId = entiteImposeeId ?? entiteManuelle ?? entites[0]?.entiteId ?? '';

  const [selectionManuelle, setSelectionManuelle] = useState<Set<string> | null>(null);
  const selection =
    selectionManuelle ??
    (collecteImposeeId ? new Set([collecteImposeeId]) : new Set());

  const [porteurId, setPorteurId] = useState<string | null>(null);
  const [dateRemise, setDateRemise] = useState(new Date().toISOString().slice(0, 10));
  const [observation, setObservation] = useState('');

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const eligibles = collectes.filter((c) => c.entiteId === entiteId);
  const retenues = eligibles.filter((c) => selection.has(c.id));
  const total = retenues.reduce((s, c) => s + c.montant, 0);
  const dates = datesDuBordereau(retenues);

  function basculer(id: string) {
    const next = new Set(selection);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectionManuelle(next);
  }

  function toutSelectionner() {
    setSelectionManuelle(new Set(eligibles.map((c) => c.id)));
  }

  function fermer() {
    setSelectionManuelle(null);
    setEntiteManuelle(null);
    setPorteurId(null);
    setObservation('');
    setErreur(null);
    if (onOpenChangeProp) {
      onOpenChangeProp(false);
    } else {
      setOuvertInterne(false);
    }
  }

  function ouvrir() {
    if (onOpenChangeProp) {
      onOpenChangeProp(true);
    } else {
      setOuvertInterne(true);
    }
  }

  async function envoyer() {
    setErreur(null);
    setEnCours(true);

    try {
      const resultat = await remettreCollectes({
        entiteId,
        collecteIds: [...selection],
        porteurId,
        dateRemise,
        observation,
      });

      if (!resultat.ok) {
        setErreur(resultat.error);
        return;
      }

      toast.success(
        `${formatNombre(resultat.data.collectes)} collecte${resultat.data.collectes > 1 ? 's' : ''} remise${resultat.data.collectes > 1 ? 's' : ''}.`,
      );

      /**
       * La RÉFÉRENCE du bordereau se reporte sur le document papier : c'est
       * elle qui relie l'écran à ce qu'on tend au Siège. Un pop-up qu'on
       * ferme, pas une notification qui s'efface (règle 30).
       */
      avertir(
        `Bordereau ${resultat.data.reference}\n\n` +
          `${formatNombre(resultat.data.collectes)} collecte${resultat.data.collectes > 1 ? 's' : ''} — ${formatMontant(total, devise)}\n` +
          `Cultes du ${dates.map((d) => formatDate(d)).join(', ')}`,
        { ton: 'information', titre: 'Bordereau établi' },
      );

      fermer();
      router.refresh();
    } finally {
      setEnCours(false);
    }
  }

  if (collectes.length === 0 && declencheurVisible) return null;

  return (
    <>
      {declencheurVisible && (
        <Button variant="outline" className="h-10" onClick={ouvrir}>
          <Truck className="mr-2 size-4" aria-hidden />
          Remettre au Siège
        </Button>
      )}

      <Dialog open={ouvert} onOpenChange={(v) => (v ? ouvrir() : fermer())}>
        {/* `sm:max-w-none` : voir `import-versements-dialog` — la base impose
            `sm:max-w-sm`, et un `max-width` l'emporte sur une `width`. */}
        <DialogContent className="max-h-[92vh] w-[min(96vw,48rem)] overflow-x-hidden overflow-y-auto sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="text-2xl">Remettre les dîmes au Siège</DialogTitle>
            <DialogDescription>
              La dîme est portée en mains propres. Ce bordereau atteste le
              déplacement et détaille les cultes qu’il couvre.
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 space-y-6 py-2">
            {erreur && (
              <Alert variant="destructive" role="alert">
                <AlertCircle className="size-4" aria-hidden />
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}

            {entiteImposeeId ? (
              <Field label="Entité qui remet">
                {() => (
                  <div className="bg-muted/50 border-input flex h-10 w-full items-center rounded-md border px-3 text-sm font-medium">
                    {entites.find((e) => e.entiteId === entiteId)?.entiteNom ?? '—'}
                  </div>
                )}
              </Field>
            ) : (
              entites.length > 1 && (
                <Field label="Entité qui remet" required>
                  {(aria) => (
                    <select
                      {...aria}
                      value={entiteId}
                      onChange={(e) => {
                        // Changer d'entité vide la sélection : les collectes
                        // retenues appartenaient à la précédente.
                        setEntiteManuelle(e.target.value);
                        setSelectionManuelle(new Set());
                      }}
                      className="border-input h-10 w-full rounded-md border px-3 text-sm"
                    >
                      {entites.map((e) => (
                        <option key={e.entiteId} value={e.entiteId}>
                          {e.entiteNom}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              )
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              <Field
                label="Date de la remise"
                required
                hint="Le jour où l’argent a été porté au Siège."
              >
                {(aria) => (
                  <ChampDate
                    {...aria}
                    
                    value={dateRemise}
                    onChange={setDateRemise}
                    className="h-10 tabular-nums"
                  />
                )}
              </Field>

              <Field
                label="Porteur"
                hint="Trésorier principal ou son adjoint. Facultatif."
              >
                {() => (
                  <CroyantPicker
                    options={porteurs}
                    value={porteurId}
                    onChange={setPorteurId}
                    photos={photos}
                    placeholder="Qui s’est déplacé"
                  />
                )}
              </Field>
            </div>

            <TextField
              label="Observation"
              placeholder="Retard dû au déplacement, remise partielle…"
              hint="Facultatif."
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
            />

            {/* --- Les collectes du bordereau --- */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="eyebrow">Collectes à remettre</p>
                <button
                  type="button"
                  onClick={() => {
                    if (selection.size === eligibles.length) {
                      setSelectionManuelle(new Set());
                    } else {
                      toutSelectionner();
                    }
                  }}
                  className="text-muted-foreground hover:text-foreground cursor-pointer text-xs"
                >
                  {selection.size === eligibles.length ? 'Tout décocher' : 'Tout cocher'}
                </button>
              </div>

              <ul className="border-border divide-border max-h-64 divide-y overflow-y-auto rounded-lg border">
                {eligibles.map((c) => (
                  <li key={c.id}>
                    <label className="hover:bg-muted/40 flex cursor-pointer items-center gap-3 p-3">
                      <input
                        type="checkbox"
                        checked={selection.has(c.id)}
                        onChange={() => basculer(c.id)}
                      />
                      <span className="flex-1 text-sm tabular-nums">
                        {formatDate(c.dateOperation)}
                      </span>
                      {/* Le retard se CONSTATE, il n'interdit rien : refuser une
                          remise tardive empêcherait de régulariser. */}
                      {estEnRetard(c.dateOperation, aujourdhui) && (
                        <span className="text-destructive text-xs">en retard</span>
                      )}
                      <span className="text-sm tabular-nums">
                        {formatMontant(c.montant, devise)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              {selection.size > 0 && (
                <p className="text-muted-foreground text-xs">
                  <span className="text-foreground tabular-nums">
                    {formatMontant(total, devise)}
                  </span>{' '}
                  — cultes du {dates.map((d) => formatDate(d)).join(', ')}.
                  {dates.length > 1 && (
                    <> Le bordereau détaillera chacune de ces dates.</>
                  )}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={fermer}
              disabled={enCours}
            >
              Annuler
            </Button>
            <Button
              type="button"
              className="h-10"
              onClick={() => void envoyer()}
              disabled={enCours || selection.size === 0}
            >
              {enCours ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              ) : (
                <Truck className="mr-2 size-4" aria-hidden />
              )}
              Établir le bordereau
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
