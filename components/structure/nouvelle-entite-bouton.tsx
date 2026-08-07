'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';

import { PermissionGate } from '@/components/shared/permission-gate';
import { Button } from '@/components/ui/button';

import { EntityCreateDialog, type ParentCible } from './entity-create-dialog';
import type { OptionEntite } from './entity-picker';

/**
 * Point d'entree « Nouvelle structure » depuis un en-tete de page — EF-STR-01.
 *
 * Remplace l'ancienne page `/structure/nouveau`, supprimee : une saisie de
 * quatre champs ne justifie pas une navigation complete, et laisser deux
 * chemins de creation coexister garantissait qu'ils divergeraient — le champ
 * Code n'avait ete retire que d'un seul.
 *
 * `parent` impose le rattachement quand le geste part d'une entite precise
 * (bouton « Ajouter une paroisse » sur une fiche de district) ; sinon le
 * dialogue le fait choisir.
 */
export function NouvelleEntiteBouton({
  parentsPossibles,
  parent,
  libelle = 'Nouvelle entite',
  variant = 'default',
  /** Portee de l'habilitation : creer sous X exige `entity.create` sur X (RG-25). */
  scope,
}: {
  /** Requis quand `parent` est absent : il faudra bien choisir un rattachement. */
  parentsPossibles?: OptionEntite[];
  parent?: ParentCible;
  libelle?: string;
  variant?: 'default' | 'outline';
  scope?: string;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <PermissionGate perm="entity.create" scope={scope}>
        <Button variant={variant} className="h-10" onClick={() => setOuvert(true)}>
          <Plus className="mr-2 size-4" aria-hidden />
          {libelle}
        </Button>
      </PermissionGate>

      <EntityCreateDialog
        parent={parent ?? null}
        parentsPossibles={parent ? undefined : parentsPossibles}
        ouvert={ouvert}
        onOuvertChange={setOuvert}
      />
    </>
  );
}
