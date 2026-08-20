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
import { modifierBureau, ouvrirMandat } from '@/lib/actions/bureaux';
import { memeBureau } from '@/lib/domain/bureau';
import { appelerAction } from '@/lib/utils/appeler-action';

/**
 * Ouverture ET modification d'un bureau — EF-BUR-01, EF-BUR-02, EF-BUR-09.
 *
 * UN SEUL POP-UP pour les deux (règle 16) : deux formulaires pour le même objet
 * divergent toujours, et c'est celui qu'on ouvre le moins souvent qui prend du
 * retard.
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
export interface BureauModifiable {
  id: string;
  entity_id: string;
  /** Le nom vient de la carte, pas d'une recherche dans `entites` : un bureau
   *  porté par une entité désactivée n'y figure plus, et s'afficherait « — ». */
  entite_nom: string;
  libelle: string;
  date_debut: string;
  date_fin: string | null;
}

/** Bureaux ouverts d'une entité — l'identifiant sert à s'exclure soi-même. */
export type BureauxActifsParEntite = Record<string, { id: string; libelle: string }[]>;

export function MandatDialog({
  entites,
  bureauxActifsParEntite,
  entiteImposee,
  libelle = 'Nouveau bureau',
  bureau,
  open,
  onOpenChange,
  onCree,
}: {
  entites: OptionEntite[];
  bureauxActifsParEntite: BureauxActifsParEntite;
  /**
   * Ouverture depuis une entité précise — le menu ⋮ de l'organigramme. Le champ
   * se LIT alors au lieu de se choisir : l'utilisateur a déjà désigné l'entité
   * en ouvrant le menu, la redemander lui permettrait d'en changer par
   * inadvertance.
   */
  entiteImposee?: { id: string; nom: string };
  libelle?: string;
  /**
   * Mode ÉDITION. Le composant est alors PILOTÉ par le parent : c'est le menu ⋮
   * de la carte qui l'ouvre, et il faut le remonter avec `key={bureau.id}` pour
   * que les champs repartent du bureau affiché — un effet de synchronisation
   * ferait le même travail, plus tard et moins sûrement.
   */
  bureau?: BureauModifiable;
  open?: boolean;
  onOpenChange?: (ouvert: boolean) => void;
  /**
   * EF-BUR-03 — un bureau vide ne sert à rien : l'appelant enchaîne sur la
   * composition. Le pop-up ne décide pas de la suite, il la signale.
   */
  onCree?: (bureauId: string) => void;
}) {
  const router = useRouter();
  const edition = bureau !== undefined;
  const pilote = open !== undefined;

  const [ouvertInterne, setOuvertInterne] = useState(false);
  const estOuvert = pilote ? open : ouvertInterne;

  const [entityId, setEntityId] = useState<string | null>(
    bureau?.entity_id ?? entiteImposee?.id ?? null,
  );
  const [nom, setNom] = useState(bureau?.libelle ?? '');
  const [dateDebut, setDateDebut] = useState(
    bureau?.date_debut ?? new Date().toISOString().slice(0, 10),
  );
  const [dateFin, setDateFin] = useState(bureau?.date_fin ?? '');
  const [reconduire, setReconduire] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  /**
   * Le nom saisi correspond-il à un bureau DÉJÀ ouvert pour cette entité ?
   *
   * La comparaison passe par `memeBureau`, la même que celle de l'index unique
   * en base : sans quoi l'avertissement dirait « nouveau bureau » là où la base
   * verrait un renouvellement.
   *
   * En édition, le bureau se compare aux AUTRES : sans l'exclusion par
   * identifiant, corriger une faute de frappe dans son propre nom déclencherait
   * un avertissement de conflit avec lui-même.
   */
  const homonyme =
    entityId && nom.trim()
      ? (bureauxActifsParEntite[entityId] ?? [])
          .filter((b) => b.id !== bureau?.id)
          .find((b) => memeBureau(b.libelle, nom))
      : undefined;

  /** Un renouvellement démet des titulaires ; une simple modification, non. */
  const renouvellement = !edition && homonyme !== undefined;

  function fermer() {
    if (pilote) {
      onOpenChange?.(false);
      return;
    }
    setOuvertInterne(false);
    setEntityId(entiteImposee?.id ?? null);
    setNom('');
    setDateDebut(new Date().toISOString().slice(0, 10));
    setDateFin('');
    setReconduire(true);
    setErreur(null);
  }

  async function envoyer() {
    setEnCours(true);
    setErreur(null);

    if (bureau) {
      const resultat = await appelerAction(() =>
        modifierBureau({
          bureauId: bureau.id,
          libelle: nom,
          dateDebut,
          dateFin,
        }),
      );
      setEnCours(false);

      if (!resultat.ok) {
        setErreur(resultat.error);
        return;
      }
      toast.success('Bureau modifié.');
      fermer();
      router.refresh();
      return;
    }

    const resultat = await appelerAction(() =>
      ouvrirMandat({
        entityId,
        libelle: nom,
        dateDebut,
        dateFin,
        reconduire: renouvellement && reconduire,
      }),
    );
    setEnCours(false);

    if (!resultat.ok) {
      setErreur(resultat.error);
      return;
    }

    toast.success(renouvellement ? 'Mandat renouvelé.' : 'Bureau ouvert.');
    fermer();
    router.refresh();

    // EF-BUR-03 — enchaîner sur la composition : un bureau sans titulaire ne
    // renseigne personne, et c'est le moment où l'utilisateur y pense.
    onCree?.(resultat.data.id);
  }

  return (
    <>
      {/* Piloté par le parent : le déclencheur est ailleurs (le menu ⋮). */}
      {!pilote && (
        <PermissionGate perm="bureau.manage">
          <Button className="h-10" onClick={() => setOuvertInterne(true)}>
            <Plus className="mr-2 size-4" aria-hidden />
            {libelle}
          </Button>
        </PermissionGate>
      )}

      <Dialog
        open={estOuvert}
        onOpenChange={(v) => (v ? setOuvertInterne(true) : fermer())}
      >
        <DialogContent className="max-h-[90vh] w-[min(96vw,42rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {edition
                ? 'Modifier le bureau'
                : renouvellement
                  ? 'Renouveler le mandat'
                  : 'Ouvrir un bureau'}
            </DialogTitle>
            <DialogDescription>
              {edition
                ? "Le nom et les dates se corrigent ici. L'entité de rattachement, non : la changer démettrait tous les titulaires (RG-09)."
                : 'Une entité peut avoir plusieurs bureaux — exécutif, finances, jeunesse — mais un seul mandat en cours par nom.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {erreur && (
              <Alert variant="destructive" role="alert">
                <AlertCircle className="size-4" aria-hidden />
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}

            {!entiteImposee && !edition && (
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

            {/* L'entité se LIT plutôt que de se choisir — en édition parce
                qu'elle ne se change pas, à l'ouverture depuis l'organigramme
                parce qu'elle est déjà désignée. La masquer laisserait douter du
                bureau qu'on est en train de créer ou de modifier ; un champ
                désactivé mentirait, puisque rien ici ne se saisit. */}
            {(bureau || entiteImposee) && (
              <div className="flex flex-col gap-2">
                <p className="text-foreground text-sm font-medium">Entité</p>
                <p className="border-input bg-muted/40 text-muted-foreground flex h-10 items-center rounded-md border px-3 text-sm">
                  {bureau ? bureau.entite_nom : entiteImposee?.nom}
                </p>
                <p className="text-muted-foreground text-xs">
                  {bureau
                    ? "Fixée à l'ouverture du bureau."
                    : 'Entité choisie dans la structure.'}
                </p>
              </div>
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

              {/*
                LE TERME EST EXIGÉ À L'OUVERTURE, PAS À LA MODIFICATION.

                Un mandat sans fin ne s'achève jamais — et depuis qu'un mandat
                échu ferme l'application (RG-07), l'accès de ses membres non
                plus. Ouvrir un bureau « pour voir » reviendrait à donner des
                accès qui ne se reprendront jamais.

                En modification, il reste facultatif : les bureaux ouverts
                avant cette règle n'ont pas de terme, et corriger le LIBELLÉ de
                l'un d'eux ne doit pas obliger à inventer sa date de fin. Une
                date de fin inventée est pire qu'absente — elle a l'air vraie,
                elle fermera des accès le jour venu, et personne ne saura d'où
                elle sort.
              */}
              <Field
                label={edition ? 'Fin prévue' : 'Fin du mandat'}
                required={!edition}
                hint={
                  edition
                    ? 'Se corrige, et se prolonge : reconduire un mandat repousse ce terme.'
                    : 'Un mandat a un terme. Il se corrige ensuite, et se reconduit.'
                }
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
            {!edition && homonyme && (
              <div className="space-y-4 rounded-md border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-900">
                  Un bureau nommé « {homonyme.libelle} » est déjà ouvert pour cette
                  entité. Son mandat sera <strong>clos la veille</strong> de la nouvelle
                  date de début, et les mandats individuels en cours avec lui.
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

            {/* En édition, un homonyme n'est pas un renouvellement : c'est un
                refus à venir de l'index unique. Autant le dire tout de suite. */}
            {bureau && homonyme && (
              <Alert variant="destructive" role="alert">
                <AlertCircle className="size-4" aria-hidden />
                <AlertDescription>
                  Un autre bureau nommé « {homonyme.libelle} » est déjà ouvert pour cette
                  entité (RG-10). Choisissez un nom différent.
                </AlertDescription>
              </Alert>
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
              disabled={
                enCours ||
                !entityId ||
                nom.trim().length < 3 ||
                (edition && homonyme !== undefined)
              }
            >
              {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              {edition ? 'Enregistrer' : renouvellement ? 'Renouveler' : 'Ouvrir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
