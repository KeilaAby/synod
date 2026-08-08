'use client';

import { AlertCircle, Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Field, TextField } from '@/components/shared/field';
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
import { ouvrirMandat } from '@/lib/actions/bureaux';
import { memeBureau } from '@/lib/domain/bureau';

/**
 * Ouverture d'un mandat — EF-BUR-01, EF-BUR-02, EF-BUR-09.
 *
 * Le LIBELLÉ nomme le bureau — « Bureau exécutif », « Comité des finances » —
 * et non le mandat : la période se lit dans les dates. Une entité peut en avoir
 * plusieurs (RG-10, corrigé le 7 août 2026), mais un seul mandat en cours par
 * nom.
 *
 * Rouvrir un bureau du MÊME nom est un renouvellement : le mandat précédent se
 * clôt et sa composition peut être reconduite en un clic. L'écran le dit avant
 * de le faire, parce que cela démet des gens.
 */
export function MandatDialog({
  entites,
  bureauxActifsParEntite,
  entiteImposee,
  libelle = 'Nouveau bureau',
}: {
  entites: OptionEntite[];
  /** Identifiant d'entité -> noms des bureaux déjà ouverts, pour l'avertissement. */
  bureauxActifsParEntite: Record<string, string[]>;
  entiteImposee?: string;
  libelle?: string;
}) {
  const router = useRouter();

  const [ouvert, setOuvert] = useState(false);
  const [entityId, setEntityId] = useState<string | null>(entiteImposee ?? null);
  const [nom, setNom] = useState('');
  const [dateDebut, setDateDebut] = useState(new Date().toISOString().slice(0, 10));
  const [dateFin, setDateFin] = useState('');
  const [reconduire, setReconduire] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  /**
   * Le nom saisi correspond-il à un bureau DÉJÀ ouvert pour cette entité ?
   *
   * La comparaison passe par `memeBureau`, la même que celle de l'index unique
   * en base : sans quoi l'avertissement dirait « nouveau bureau » là où la base
   * verrait un renouvellement.
   */
  const dejaOuvert =
    entityId && nom.trim()
      ? (bureauxActifsParEntite[entityId] ?? []).find((b) => memeBureau(b, nom))
      : undefined;

  function fermer() {
    setOuvert(false);
    setEntityId(entiteImposee ?? null);
    setNom('');
    setDateDebut(new Date().toISOString().slice(0, 10));
    setDateFin('');
    setReconduire(true);
    setErreur(null);
  }

  async function envoyer() {
    setEnCours(true);
    setErreur(null);

    const resultat = await ouvrirMandat({
      entityId,
      libelle: nom,
      dateDebut,
      dateFin,
      reconduire: Boolean(dejaOuvert) && reconduire,
    });

    setEnCours(false);

    if (!resultat.ok) {
      setErreur(resultat.error);
      return;
    }

    toast.success(dejaOuvert ? 'Mandat renouvelé.' : 'Bureau ouvert.');
    fermer();
    router.refresh();
  }

  return (
    <>
      <PermissionGate perm="bureau.manage">
        <Button className="h-10" onClick={() => setOuvert(true)}>
          <Plus className="mr-2 size-4" aria-hidden />
          {libelle}
        </Button>
      </PermissionGate>

      <Dialog open={ouvert} onOpenChange={(v) => (v ? setOuvert(true) : fermer())}>
        <DialogContent className="max-h-[90vh] w-[min(96vw,42rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {dejaOuvert ? 'Renouveler le mandat' : 'Ouvrir un bureau'}
            </DialogTitle>
            <DialogDescription>
              Une entité peut avoir plusieurs bureaux — exécutif, finances, jeunesse —
              mais un seul mandat en cours par nom.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {erreur && (
              <Alert variant="destructive" role="alert">
                <AlertCircle className="size-4" aria-hidden />
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}

            {!entiteImposee && (
              <Field label="Entité" required>
                {(aria) => (
                  <EntityPicker
                    {...aria}
                    options={entites}
                    value={entityId}
                    onChange={setEntityId}
                    placeholder="Choisir l'entité"
                    emptyMessage="Aucune entité dans votre périmètre."
                  />
                )}
              </Field>
            )}

            <TextField
              label="Nom du bureau"
              required
              placeholder="Bureau exécutif"
              hint="Ce que le bureau EST, pas la période — elle se lit dans les dates."
              value={nom}
              onChange={(e) => setNom(e.target.value)}
            />

            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Début du mandat" required>
                {(aria) => (
                  <Input
                    {...aria}
                    type="date"
                    className="h-10 font-mono tabular-nums"
                    value={dateDebut}
                    onChange={(e) => setDateDebut(e.target.value)}
                  />
                )}
              </Field>

              <Field
                label="Fin prévue"
                hint="Facultative — un mandat peut rester ouvert."
              >
                {(aria) => (
                  <Input
                    {...aria}
                    type="date"
                    className="h-10 font-mono tabular-nums"
                    value={dateFin}
                    onChange={(e) => setDateFin(e.target.value)}
                  />
                )}
              </Field>
            </div>

            {/* Dire ce qui va se passer AVANT de le faire : cela démet des gens. */}
            {dejaOuvert && (
              <div className="space-y-4 rounded-md border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-900">
                  Un bureau nommé « {dejaOuvert} » est déjà ouvert pour cette entité. Son
                  mandat sera <strong>clos la veille</strong> de la nouvelle date de
                  début, et les mandats individuels en cours avec lui.
                </p>

                <label className="flex cursor-pointer items-start gap-3">
                  <Checkbox
                    checked={reconduire}
                    onCheckedChange={(v) => setReconduire(v === true)}
                    className="mt-0.5"
                  />
                  <span className="space-y-1">
                    <span className="block text-sm font-medium text-amber-900">
                      Reconduire la composition
                    </span>
                    <span className="block text-xs text-amber-800">
                      EF-BUR-09 — les titulaires en cours reprennent leur fonction dans le
                      nouveau mandat. Ceux déjà remplacés ne reviennent pas.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="h-10"
              onClick={fermer}
              disabled={enCours}
            >
              Annuler
            </Button>
            <Button
              className="h-10"
              onClick={envoyer}
              disabled={enCours || !entityId || nom.trim().length < 3}
            >
              {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              {dejaOuvert ? 'Renouveler' : 'Ouvrir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
