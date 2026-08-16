'use client';

import { AlertCircle, Loader2, Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

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
import { Input } from '@/components/ui/input';
import { remettreCollectes } from '@/lib/actions/dimes';
import { datesDuBordereau, estEnRetard } from '@/lib/domain/dime';
import { formatDate, formatMontant, formatNombre } from '@/lib/utils/format';

/**
 * Remise d'un lot de collectes au Siège — EF-FIN-30.
 *
 * LA DÎME EST PORTÉE EN MAINS PROPRES, par le trésorier principal de l'église
 * ou son adjoint. L'écran ne fait donc que consigner un déplacement réel : il
 * n'y a rien à « transférer », seulement à attester.
 *
 * LE BORDEREAU DÉTAILLE CHAQUE CULTE. Regrouper plusieurs dimanches est
 * possible mais mal vu du Siège : c'est un retard, pas une organisation. Le
 * détail des dates le rend visible au lieu de le noyer dans un total — c'est
 * précisément ce que le Siège veut lire.
 *
 * LE RETARD NE BLOQUE PAS. Refuser une remise tardive empêcherait de
 * régulariser, exactement l'inverse du but : il se signale, il ne s'interdit
 * pas.
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
}: {
  /** Les collectes NON remises, toutes entités confondues. */
  collectes: CollecteARemettre[];
  /** Croyants proposables comme porteur — trésorier principal ou adjoint. */
  porteurs: OptionCroyant[];
  photos: Record<string, string>;
  devise: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  /**
   * UNE REMISE PORTE SUR UNE SEULE ENTITÉ.
   *
   * Le bordereau est établi par une église qui se déplace : mêler les collectes
   * de deux entités produirait un document que ni l'une ni l'autre ne peut
   * signer. On choisit donc l'entité, puis ses collectes.
   */
  const entites = [...new Map(collectes.map((c) => [c.entiteId, c])).values()];
  const [entiteId, setEntiteId] = useState<string>(entites[0]?.entiteId ?? '');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [porteurId, setPorteurId] = useState<string | null>(null);
  const [dateRemise, setDateRemise] = useState(new Date().toISOString().slice(0, 10));
  const [observation, setObservation] = useState('');

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const eligibles = collectes.filter((c) => c.entiteId === entiteId);
  const retenues = eligibles.filter((c) => selection.has(c.id));
  const total = retenues.reduce((s, c) => s + c.montant, 0);
  const dates = datesDuBordereau(retenues);

  function fermer() {
    setSelection(new Set());
    setPorteurId(null);
    setObservation('');
    setErreur(null);
    setOuvert(false);
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

  if (collectes.length === 0) return null;

  return (
    <>
      <Button variant="outline" className="h-10" onClick={() => setOuvert(true)}>
        <Truck className="mr-2 size-4" aria-hidden />
        Remettre au Siège
      </Button>

      <Dialog open={ouvert} onOpenChange={(v) => (v ? setOuvert(true) : fermer())}>
        <DialogContent className="max-h-[92vh] w-[min(96vw,48rem)] overflow-x-hidden overflow-y-auto">
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

            {entites.length > 1 && (
              <Field label="Entité qui remet" required>
                {(aria) => (
                  <select
                    {...aria}
                    value={entiteId}
                    onChange={(e) => {
                      // Changer d'entité vide la sélection : les collectes
                      // retenues appartenaient à la précédente.
                      setEntiteId(e.target.value);
                      setSelection(new Set());
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
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              <Field
                label="Date de la remise"
                required
                hint="Le jour où l’argent a été porté au Siège."
              >
                {(aria) => (
                  <Input
                    {...aria}
                    type="date"
                    value={dateRemise}
                    onChange={(e) => setDateRemise(e.target.value)}
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
                  onClick={() =>
                    setSelection((s) =>
                      s.size === eligibles.length
                        ? new Set()
                        : new Set(eligibles.map((c) => c.id)),
                    )
                  }
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
                        onChange={() =>
                          setSelection((s) => {
                            const suivant = new Set(s);
                            if (suivant.has(c.id)) suivant.delete(c.id);
                            else suivant.add(c.id);
                            return suivant;
                          })
                        }
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
