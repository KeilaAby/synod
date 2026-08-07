'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supprimerCroyant } from '@/lib/actions/croyants';
import type { CroyantListe } from '@/lib/data/croyants';
import { nomComplet } from '@/lib/domain/croyant';

import { TransfertDialog } from '@/components/transferts/transfert-dialog';

import { CroyantForm } from './croyant-form';
import type { OptionsCroyant } from './croyant-dialog';

/**
 * Modification et suppression d'un croyant depuis la liste — EF-CRO-07,
 * EF-CRO-12.
 *
 * La modification rouvre LE MEME pop-up que la creation : c'est le meme
 * formulaire, les memes trois etapes, les memes regles. Un second formulaire
 * aurait divergé du premier des la premiere evolution.
 *
 * Les valeurs viennent de la ligne deja chargee : l'ouverture est instantanee,
 * sans requete ni squelette.
 */
export function useCroyantDialogs({
  croyants,
  photos,
  options,
}: {
  croyants: readonly CroyantListe[];
  /** Clé de stockage -> URL signée (EF-CRO-09). */
  photos: Record<string, string>;
  options: OptionsCroyant;
}) {
  const router = useRouter();

  const [aModifier, setAModifier] = useState<CroyantListe | null>(null);
  const [aTransferer, setATransferer] = useState<CroyantListe | null>(null);
  const [aSupprimer, setASupprimer] = useState<CroyantListe | null>(null);

  const parId = useMemo(() => new Map(croyants.map((c) => [c.id, c])), [croyants]);

  const modifier = useCallback(
    (id: string) => {
      const croyant = parId.get(id);
      if (croyant) setAModifier(croyant);
    },
    [parId],
  );

  const transferer = useCallback(
    (id: string) => {
      const croyant = parId.get(id);
      if (croyant) setATransferer(croyant);
    },
    [parId],
  );

  const demanderSuppression = useCallback(
    (id: string) => {
      const croyant = parId.get(id);
      if (croyant) setASupprimer(croyant);
    },
    [parId],
  );

  const dialogues = (
    <>
      {/* --- Modification --- */}
      <Dialog open={aModifier !== null} onOpenChange={(v) => !v && setAModifier(null)}>
        <DialogContent className="max-h-[92vh] w-[min(96vw,72rem)] overflow-y-auto sm:max-w-5xl">
          {aModifier && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">
                  Modifier {nomComplet(aModifier.nom, aModifier.prenom)}
                </DialogTitle>
                <DialogDescription>
                  Matricule {aModifier.matricule} — immuable, y compris apres transfert.
                  L&apos;eglise se change par transfert.
                </DialogDescription>
              </DialogHeader>

              {/* `key` : le remontage reamorce les champs quand on passe d'un
                  croyant a un autre sans refermer le pop-up. */}
              <CroyantForm
                key={aModifier.id}
                mode="modification"
                croyant={{
                  id: aModifier.id,
                  matricule: aModifier.matricule,
                  nom: aModifier.nom,
                  prenom: aModifier.prenom,
                  sexe: aModifier.sexe,
                  statut_marital: aModifier.statut_marital,
                  email: aModifier.email,
                  telephone: aModifier.telephone,
                  date_naissance: aModifier.date_naissance,
                  date_bapteme: aModifier.date_bapteme,
                  adresse: aModifier.adresse,
                  eglise_id: aModifier.eglise_id,
                  cellule_id: aModifier.cellule_id,
                  grade_id: aModifier.grade_id,
                  nationalite_id: aModifier.nationalite_id,
                  statut: aModifier.statut as 'ACTIF' | 'INACTIF' | 'TRANSFERE' | 'DECEDE',
                  egliseNom: aModifier.eglise?.nom ?? '—',
                }}
                urlPhoto={
                  aModifier.photo_key ? (photos[aModifier.photo_key] ?? null) : null
                }
                {...options}
                onAnnuler={() => setAModifier(null)}
                onSucces={() => {
                  setAModifier(null);
                  router.refresh();
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* --- Transfert (EF-TRF-01) : le seul chemin pour changer d'eglise --- */}
      {aTransferer && (
        <TransfertDialog
          key={aTransferer.id}
          croyant={{
            id: aTransferer.id,
            nom: aTransferer.nom,
            prenom: aTransferer.prenom,
            matricule: aTransferer.matricule,
            egliseId: aTransferer.eglise_id,
            egliseNom: aTransferer.eglise?.nom ?? '—',
            eglisePath: aTransferer.eglise?.path ?? '',
            celluleId: aTransferer.cellule_id,
            celluleNom: aTransferer.cellule?.nom ?? null,
          }}
          eglises={options.eglises.filter((e) => e.id !== aTransferer.eglise_id)}
          cellules={options.cellules}
          ouvert
          onOuvertChange={(v) => !v && setATransferer(null)}
        />
      )}

      {/* --- Suppression (RG-22 : logique, restaurable) --- */}
      {aSupprimer && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setASupprimer(null)}
          // ENF-UTI-04 : la confirmation NOMME la personne concernee.
          title={`Supprimer ${nomComplet(aSupprimer.nom, aSupprimer.prenom)} ?`}
          description={
            `La fiche ${aSupprimer.matricule} partira en corbeille et pourra etre ` +
            'restauree. Son historique est conserve.'
          }
          confirmLabel="Supprimer"
          onConfirm={async () => {
            const resultat = await supprimerCroyant({ id: aSupprimer.id });
            setASupprimer(null);
            if (!resultat.ok) {
              toast.error(resultat.error);
              return;
            }
            toast.success('Croyant place en corbeille.');
            router.refresh();
          }}
        />
      )}
    </>
  );

  return { modifier, transferer, demanderSuppression, dialogues };
}
