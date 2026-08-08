'use client';

import { Pencil, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PermissionGate } from '@/components/shared/permission-gate';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { nomComplet } from '@/lib/domain/croyant';

import {
  CroyantForm,
  type CelluleOption,
  type OptionReferentiel,
  type RattachementImpose,
} from './croyant-form';
import type { OptionEntite } from '@/components/structure/entity-picker';

/**
 * Création et modification d'un croyant en pop-up — EF-CRO-01, EF-CRO-07.
 *
 * Ouvrir une page dédiée pour une saisie de trois minutes coûte une navigation
 * complète — chargement de la session, de l'arbre, des référentiels — pour
 * revenir ensuite au point de départ. Le pop-up garde la liste derrière, et
 * les options sont déjà chargées par la page qui l'héberge : l'ouverture est
 * instantanée.
 *
 * Les pages `/croyants/nouveau` et `/croyants/[id]/modifier` restent en place
 * pour le lien profond et le partage.
 */

export interface OptionsCroyant {
  eglises: OptionEntite[];
  cellules: CelluleOption[];
  grades: OptionReferentiel[];
  nationalites: OptionReferentiel[];
}

interface CroyantAModifier {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  sexe: 'M' | 'F';
  statut_marital: string | null;
  email: string | null;
  telephone: string | null;
  date_naissance: string;
  date_bapteme: string | null;
  adresse: string;
  eglise_id: string;
  cellule_id: string | null;
  grade_id: string;
  nationalite_id: string;
  statut: 'ACTIF' | 'INACTIF' | 'TRANSFERE' | 'DECEDE';
  egliseNom: string;
}

/** Bouton « Nouveau croyant » et son pop-up. */
export function NouveauCroyantDialog({
  options,
  rattachement,
  libelle = 'Nouveau croyant',
  open,
  onOpenChange,
  onCree,
}: {
  options: OptionsCroyant;
  /**
   * EF-CRO-01 — le geste part d'une église ou d'une cellule de la structure :
   * le rattachement se lit au lieu de se choisir (`RattachementImpose`).
   */
  rattachement?: RattachementImpose;
  libelle?: string;
  /**
   * Mode PILOTÉ : le déclencheur est ailleurs — le menu ⋮ d'une entité. Le
   * pop-up ne rend alors pas son propre bouton.
   */
  open?: boolean;
  onOpenChange?: (ouvert: boolean) => void;
  /**
   * Ce qu'on fait après. Par défaut on ouvre la fiche ; depuis la structure,
   * l'appelant préfère rester où il est — quitter l'organigramme pour une
   * fiche perdrait la branche déployée.
   */
  onCree?: (id: string) => void;
}) {
  const router = useRouter();
  const [ouvertInterne, setOuvertInterne] = useState(false);

  const pilote = open !== undefined;
  const ouvert = pilote ? open : ouvertInterne;

  function definirOuvert(valeur: boolean) {
    if (pilote) onOpenChange?.(valeur);
    else setOuvertInterne(valeur);
  }

  return (
    <>
      {!pilote && (
        <PermissionGate perm="croyant.create">
          <Button className="h-10" onClick={() => setOuvertInterne(true)}>
            <Plus className="mr-2 size-4" aria-hidden />
            {libelle}
          </Button>
        </PermissionGate>
      )}

      <Dialog open={ouvert} onOpenChange={definirOuvert}>
        <DialogContent className="max-h-[92vh] w-[min(96vw,72rem)] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Nouveau croyant</DialogTitle>
            <DialogDescription>
              {rattachement
                ? `Rattaché à ${rattachement.celluleNom ?? rattachement.egliseNom}. Le matricule est attribué automatiquement.`
                : "Le matricule est attribué automatiquement à l'enregistrement."}
            </DialogDescription>
          </DialogHeader>

          {/* `key` : remonter le formulaire à chaque ouverture vide les champs
              de la saisie précédente, sans effet de resynchronisation. */}
          {ouvert && (
            <CroyantForm
              key={rattachement?.celluleId ?? rattachement?.egliseId ?? 'creation'}
              mode="creation"
              rattachement={rattachement}
              {...options}
              onAnnuler={() => definirOuvert(false)}
              onSucces={(id) => {
                definirOuvert(false);
                if (onCree) onCree(id);
                else router.push(`/croyants/${id}`);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Bouton « Modifier » et son pop-up. */
export function ModifierCroyantDialog({
  croyant,
  options,
  scope,
  urlPhoto,
}: {
  croyant: CroyantAModifier;
  options: OptionsCroyant;
  /** Chemin de l'église : l'habilitation s'évalue avec sa portée (RG-25). */
  scope: string;
  /** URL signée de la photo (EF-CRO-09) : la base ne stocke que la clé. */
  urlPhoto?: string | null;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <PermissionGate perm="croyant.update" scope={scope}>
        <Button className="h-10" onClick={() => setOuvert(true)}>
          <Pencil className="mr-2 size-4" aria-hidden />
          Modifier
        </Button>
      </PermissionGate>

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="max-h-[92vh] w-[min(96vw,72rem)] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              Modifier {nomComplet(croyant.nom, croyant.prenom)}
            </DialogTitle>
            <DialogDescription>
              Matricule {croyant.matricule} — immuable, y compris après transfert.
              L&apos;église se change par transfert.
            </DialogDescription>
          </DialogHeader>

          {ouvert && (
            <CroyantForm
              key={croyant.id}
              mode="modification"
              croyant={croyant}
              urlPhoto={urlPhoto}
              {...options}
              onAnnuler={() => setOuvert(false)}
              onSucces={() => {
                setOuvert(false);
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
