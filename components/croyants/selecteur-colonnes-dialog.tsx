'use client';

import { Printer } from 'lucide-react';
import { useState } from 'react';

import { type TableauExportable, exporterPdf } from '@/components/finances/exporter';
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
import { type OptionsCroyant } from '@/components/croyants/croyant-dialog';
import type { CroyantListe } from '@/lib/data/croyants';
import {
  type FiltresListeCroyants,
  LIBELLES_SEXE,
  LIBELLES_STATUT_CROYANT,
  type StatutCroyant,
  calculerAge,
  libellesFiltresCroyants,
  nomComplet,
} from '@/lib/domain/croyant';
import { formatDate, formatNombre } from '@/lib/utils/format';

export interface ColonneExportCroyant {
  readonly id: string;
  readonly libelle: string;
  readonly parDefaut: boolean;
  readonly extraire: (c: CroyantListe) => string | number | null;
}

export const COLONNES_CROYANTS: readonly ColonneExportCroyant[] = [
  {
    id: 'nom',
    libelle: 'Nom et prénoms',
    parDefaut: true,
    extraire: (c) => nomComplet(c.nom, c.prenom),
  },
  {
    id: 'matricule',
    libelle: 'Matricule',
    parDefaut: true,
    extraire: (c) => c.matricule,
  },
  {
    id: 'sexe',
    libelle: 'Sexe',
    parDefaut: true,
    extraire: (c) => LIBELLES_SEXE[c.sexe],
  },
  {
    id: 'age',
    libelle: 'Âge',
    parDefaut: true,
    extraire: (c) => calculerAge(new Date(c.date_naissance)),
  },
  {
    id: 'eglise',
    libelle: 'Église',
    parDefaut: true,
    extraire: (c) => c.eglise?.nom ?? '—',
  },
  {
    id: 'cellule',
    libelle: 'Cellule de prière',
    parDefaut: true,
    extraire: (c) => c.cellule?.nom ?? '—',
  },
  {
    id: 'grade',
    libelle: 'Grade',
    parDefaut: true,
    extraire: (c) => c.grade?.libelle ?? '—',
  },
  {
    id: 'bapteme',
    libelle: 'Date de baptême',
    parDefaut: true,
    extraire: (c) => formatDate(c.date_bapteme),
  },
  {
    id: 'statut',
    libelle: 'Statut',
    parDefaut: true,
    extraire: (c) => LIBELLES_STATUT_CROYANT[c.statut as StatutCroyant] ?? c.statut,
  },
  {
    id: 'telephone',
    libelle: 'Téléphone',
    parDefaut: false,
    extraire: (c) => c.telephone || '—',
  },
  {
    id: 'adresse',
    libelle: 'Adresse',
    parDefaut: false,
    extraire: (c) => c.adresse || '—',
  },
];

export function SelecteurColonnesDialog({
  ouvert,
  onOpenChange,
  resultats,
  filtres,
  options,
}: {
  ouvert: boolean;
  onOpenChange: (ouvert: boolean) => void;
  resultats: readonly CroyantListe[];
  filtres: FiltresListeCroyants;
  options: OptionsCroyant;
}) {
  const [selection, setSelection] = useState<Set<string>>(
    () => new Set(COLONNES_CROYANTS.filter((c) => c.parDefaut).map((c) => c.id)),
  );

  function basculer(id: string) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toutSelectionner() {
    setSelection(new Set(COLONNES_CROYANTS.map((c) => c.id)));
  }

  function reinitialiser() {
    setSelection(new Set(COLONNES_CROYANTS.filter((c) => c.parDefaut).map((c) => c.id)));
  }

  function imprimer() {
    const colonnesChoisies = COLONNES_CROYANTS.filter((c) => selection.has(c.id));
    const filtresActifs = libellesFiltresCroyants(filtres, options);

    const tableau: TableauExportable = {
      titre: 'Liste des croyants',
      sousTitre:
        filtresActifs.length > 0
          ? `${formatNombre(resultats.length)} croyant${resultats.length > 1 ? 's' : ''} — ${filtresActifs.join(' · ')}`
          : `${formatNombre(resultats.length)} croyant${resultats.length > 1 ? 's' : ''} — périmètre entier`,
      entetes: colonnesChoisies.map((c) => c.libelle),
      lignes: resultats.map((croyant) => colonnesChoisies.map((col) => col.extraire(croyant))),
    };

    onOpenChange(false);
    exporterPdf(tableau);
  }

  return (
    <Dialog open={ouvert} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Colonnes à imprimer</DialogTitle>
          <DialogDescription>
            Cochez les colonnes à inclure dans le document PDF imprimé ({formatNombre(resultats.length)} croyant{resultats.length > 1 ? 's' : ''}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">
              {selection.size} colonne{selection.size > 1 ? 's' : ''} sélectionnée{selection.size > 1 ? 's' : ''}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={toutSelectionner}
                className="text-primary hover:underline font-medium"
              >
                Tout cocher
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                onClick={reinitialiser}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                Par défaut
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg border p-4">
            {COLONNES_CROYANTS.map((col) => {
              const active = selection.has(col.id);
              return (
                <label
                  key={col.id}
                  className="flex items-center gap-2 text-sm cursor-pointer select-none hover:text-foreground text-slate-700"
                >
                  <Checkbox
                    checked={active}
                    onCheckedChange={() => basculer(col.id)}
                  />
                  <span>{col.libelle}</span>
                </label>
              );
            })}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={imprimer} disabled={selection.size === 0}>
            <Printer className="mr-2 size-4" aria-hidden />
            Générer l’impression PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
