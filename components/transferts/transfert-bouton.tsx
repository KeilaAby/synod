'use client';

import { ArrowLeftRight } from 'lucide-react';
import { useState } from 'react';

import type { CelluleOption } from '@/components/croyants/croyant-form';
import { PermissionGate } from '@/components/shared/permission-gate';
import type { OptionEntite } from '@/components/structure/entity-picker';
import { Button } from '@/components/ui/button';

import { TransfertDialog, type CroyantATransferer } from './transfert-dialog';

/**
 * Point d'entree « Transferer » — EF-TRF-01.
 *
 * Un bouton et son pop-up, comme partout ailleurs dans l'application : la page
 * `/croyants/[id]/transferer` n'a jamais existe, le lien qui y menait etait
 * mort. Une demande de transfert est une saisie de trois champs ; elle ne
 * justifie pas de quitter la fiche que l'on est en train de lire.
 */
export function TransfertBouton({
  croyant,
  eglises,
  cellules,
  /** Portee de l'habilitation : demander, c'est agir sur l'ORIGINE (RG-25). */
  scope,
  variant = 'outline',
}: {
  croyant: CroyantATransferer;
  eglises: OptionEntite[];
  cellules: CelluleOption[];
  scope: string;
  variant?: 'default' | 'outline';
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <PermissionGate perm="croyant.transfer" scope={scope}>
        <Button variant={variant} className="h-10" onClick={() => setOuvert(true)}>
          <ArrowLeftRight className="mr-2 size-4" aria-hidden />
          Transférer
        </Button>
      </PermissionGate>

      {/* `key` : le remontage réamorce le formulaire d'un croyant à l'autre. */}
      {ouvert && (
        <TransfertDialog
          key={croyant.id}
          croyant={croyant}
          eglises={eglises}
          cellules={cellules}
          ouvert
          onOuvertChange={setOuvert}
        />
      )}
    </>
  );
}
