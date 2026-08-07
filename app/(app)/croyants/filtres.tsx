'use client';

import {
  ArrowRightLeft,
  CircleCheck,
  CircleSlash,
  Cross,
  Mars,
  Search,
  SlidersHorizontal,
  UserMinus,
  UsersRound,
  Venus,
  X,
} from 'lucide-react';
import { useState } from 'react';

import type { OptionReferentiel } from '@/components/croyants/croyant-form';
import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { EntityPicker, type OptionEntite } from '@/components/structure/entity-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  type FiltresListeCroyants,
  LIBELLES_STATUT_CROYANT,
  type Sexe,
  type StatutCroyant,
  aDesFiltres,
} from '@/lib/domain/croyant';
import { formatNombre } from '@/lib/utils/format';

/**
 * Filtres de la liste des croyants — EF-CRO-04, EF-CRO-05.
 *
 * Composant CONTRÔLÉ, sans état ni navigation : le parent détient les filtres
 * et refiltre en mémoire à chaque changement. Rien n'attend le serveur, donc
 * rien ne clignote — même comportement que la liste des entités.
 *
 * Les ensembles CLOS (sexe, statut, présence en cellule) prennent la forme de
 * pictogrammes ; les ensembles OUVERTS (église, grade, nationalité, âge)
 * gardent un sélecteur.
 */
export function FiltresCroyants({
  filtres,
  onChange,
  onEffacer,
  eglises,
  grades,
  nationalites,
  affiches,
  total,
}: {
  filtres: FiltresListeCroyants;
  onChange: (modifs: Partial<FiltresListeCroyants>) => void;
  onEffacer: () => void;
  eglises: OptionEntite[];
  grades: OptionReferentiel[];
  nationalites: OptionReferentiel[];
  affiches: number;
  total: number;
}) {
  const [avance, setAvance] = useState(false);

  /** Recliquer le filtre actif le relâche. */
  function alterne<T>(courant: T, valeur: T, neutre: T): T {
    return courant === valeur ? neutre : valeur;
  }

  function nombreOuNull(valeur: string): number | null {
    if (valeur.trim() === '') return null;
    const n = Number(valeur);
    return Number.isFinite(n) ? n : null;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="relative">
            <Search
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={filtres.recherche}
              onChange={(e) => onChange({ recherche: e.target.value })}
              placeholder="Nom, prénom, matricule, téléphone…"
              aria-label="Rechercher un croyant"
              className="h-10 w-72 pl-9"
            />
          </div>

          {/* Assez large pour lire un nom d eglise sans le tronquer. */}
          <div className="w-64">
            <EntityPicker
              options={eglises}
              value={filtres.egliseId}
              onChange={(v) => onChange({ egliseId: v })}
              placeholder="Tout le périmètre"
              emptyMessage="Aucune église"
            />
          </div>

          {/* --- Sexe --- */}
          <GroupeFiltres libelle="Filtrer par sexe">
            <FiltreIcone
              icone={Mars}
              libelle="Hommes"
              actif={filtres.sexe === 'M'}
              classeActive="bg-sky-100 text-sky-700"
              onClick={() => onChange({ sexe: alterne<Sexe | null>(filtres.sexe, 'M', null) })}
            />
            <FiltreIcone
              icone={Venus}
              libelle="Femmes"
              actif={filtres.sexe === 'F'}
              classeActive="bg-pink-100 text-pink-700"
              onClick={() => onChange({ sexe: alterne<Sexe | null>(filtres.sexe, 'F', null) })}
            />
          </GroupeFiltres>

          {/* --- Statut ---
              ACTIF est le défaut : la liste ne montre pas les décédés sans
              qu'on l'ait demandé. Relâcher un statut y revient donc. */}
          <GroupeFiltres libelle="Filtrer par statut">
            <FiltreIcone
              icone={CircleCheck}
              libelle={LIBELLES_STATUT_CROYANT.ACTIF}
              actif={filtres.statut === 'ACTIF'}
              classeActive="bg-emerald-100 text-emerald-700"
              onClick={() => onChange({ statut: 'ACTIF' })}
            />
            <FiltreIcone
              icone={CircleSlash}
              libelle={LIBELLES_STATUT_CROYANT.INACTIF}
              actif={filtres.statut === 'INACTIF'}
              classeActive="bg-slate-200 text-slate-700"
              onClick={() =>
                onChange({ statut: alterne<StatutCroyant>(filtres.statut, 'INACTIF', 'ACTIF') })
              }
            />
            <FiltreIcone
              icone={ArrowRightLeft}
              libelle={LIBELLES_STATUT_CROYANT.TRANSFERE}
              actif={filtres.statut === 'TRANSFERE'}
              classeActive="bg-indigo-100 text-indigo-700"
              onClick={() =>
                onChange({
                  statut: alterne<StatutCroyant>(filtres.statut, 'TRANSFERE', 'ACTIF'),
                })
              }
            />
            <FiltreIcone
              icone={Cross}
              libelle={LIBELLES_STATUT_CROYANT.DECEDE}
              actif={filtres.statut === 'DECEDE'}
              classeActive="bg-slate-900 text-white"
              onClick={() =>
                onChange({ statut: alterne<StatutCroyant>(filtres.statut, 'DECEDE', 'ACTIF') })
              }
            />
          </GroupeFiltres>

          {/* --- Présence en cellule (RG-05) --- */}
          <GroupeFiltres libelle="Filtrer par cellule">
            <FiltreIcone
              icone={UsersRound}
              libelle="Rattachés à une cellule"
              actif={filtres.enCellule === true}
              classeActive="bg-teal-100 text-teal-700"
              onClick={() =>
                onChange({ enCellule: alterne<boolean | null>(filtres.enCellule, true, null) })
              }
            />
            <FiltreIcone
              icone={UserMinus}
              libelle="Sans cellule"
              actif={filtres.enCellule === false}
              classeActive="bg-amber-100 text-amber-700"
              onClick={() =>
                onChange({ enCellule: alterne<boolean | null>(filtres.enCellule, false, null) })
              }
            />
          </GroupeFiltres>

          <Button
            variant="outline"
            className="h-10"
            onClick={() => setAvance((v) => !v)}
            aria-expanded={avance}
          >
            <SlidersHorizontal className="mr-2 size-4" aria-hidden />
            Plus de filtres
          </Button>

          {aDesFiltres(filtres) && (
            <Button variant="ghost" className="h-10" onClick={onEffacer}>
              <X className="mr-2 size-4" aria-hidden />
              Effacer
            </Button>
          )}

          <span
            className="ml-auto font-mono text-xs tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            {formatNombre(affiches)} / {formatNombre(total)}
          </span>
        </div>

        {/* --- Ensembles OUVERTS : la liste déroulante reste la bonne réponse --- */}
        {avance && (
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
            <Select
              value={filtres.gradeId ?? 'tous'}
              onValueChange={(v) => onChange({ gradeId: v === 'tous' ? null : v })}
            >
              <SelectTrigger className="h-10 w-48" aria-label="Filtrer par grade">
                <SelectValue placeholder="Tous les grades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les grades</SelectItem>
                {grades.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.libelle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filtres.nationaliteId ?? 'tous'}
              onValueChange={(v) => onChange({ nationaliteId: v === 'tous' ? null : v })}
            >
              <SelectTrigger className="h-10 w-48" aria-label="Filtrer par nationalité">
                <SelectValue placeholder="Toutes nationalités" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Toutes nationalités</SelectItem>
                {nationalites.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.libelle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={130}
                placeholder="Âge min"
                value={filtres.ageMin ?? ''}
                aria-label="Âge minimum"
                onChange={(e) => onChange({ ageMin: nombreOuNull(e.target.value) })}
                className="h-10 w-28 font-mono tabular-nums"
              />
              <span className="text-sm text-muted-foreground">à</span>
              <Input
                type="number"
                min={0}
                max={130}
                placeholder="Âge max"
                value={filtres.ageMax ?? ''}
                aria-label="Âge maximum"
                onChange={(e) => onChange({ ageMax: nombreOuNull(e.target.value) })}
                className="h-10 w-28 font-mono tabular-nums"
              />
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
