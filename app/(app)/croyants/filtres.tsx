'use client';

import { Search, SlidersHorizontal, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import type { OptionReferentiel } from '@/components/croyants/croyant-form';
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
import { LIBELLES_SEXE, LIBELLES_STATUT_CROYANT, SEXES, STATUTS_CROYANT } from '@/lib/domain/croyant';
import { formatNombre } from '@/lib/utils/format';

/**
 * Filtres de la liste des croyants — EF-CRO-04, EF-CRO-05.
 *
 * Contrairement à la structure, filtrée en mémoire, la recherche est SERVEUR :
 * les 200 000 croyants visés (ENF-PRF-05) ne peuvent pas être chargés côté
 * client. Chaque changement navigue donc réellement — le `useTransition`
 * conserve la table affichée pendant le calcul, plutôt que de la vider.
 */
export function FiltresCroyants({
  eglises,
  grades,
  nationalites,
  total,
}: {
  eglises: OptionEntite[];
  grades: OptionReferentiel[];
  nationalites: OptionReferentiel[];
  total: number;
}) {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  const [enCours, demarrer] = useTransition();
  const [avance, setAvance] = useState(false);

  const [recherche, setRecherche] = useState(params.get('q') ?? '');

  // Debounce : une frappe ne doit pas déclencher une requête par caractère.
  useEffect(() => {
    const actuelle = params.get('q') ?? '';
    if (recherche === actuelle) return;

    const minuteur = setTimeout(() => appliquer({ q: recherche || null }), 350);
    return () => clearTimeout(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche]);

  function appliquer(modifs: Record<string, string | null>) {
    const suivants = new URLSearchParams(params.toString());

    for (const [cle, valeur] of Object.entries(modifs)) {
      if (valeur === null || valeur === '' || valeur === 'tous') suivants.delete(cle);
      else suivants.set(cle, valeur);
    }
    // Tout changement de filtre ramène à la première page : rester en page 7
    // d'un jeu qui n'en compte plus que 2 afficherait un vide inexplicable.
    suivants.delete('page');

    demarrer(() => {
      router.replace(`${chemin}${suivants.size ? `?${suivants}` : ''}`, { scroll: false });
    });
  }

  const valeur = (cle: string, defaut = 'tous') => params.get(cle) ?? defaut;
  const aDesFiltres = [...params.keys()].some((c) => c !== 'page');

  return (
    <div className="space-y-4" data-pending={enCours || undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, prénom, matricule, téléphone…"
            aria-label="Rechercher un croyant"
            className="h-10 w-72 pl-9"
          />
        </div>

        <div className="w-64">
          <EntityPicker
            options={eglises}
            value={params.get('entite')}
            onChange={(v) => appliquer({ entite: v })}
            placeholder="Tout le périmètre"
            emptyMessage="Aucune église"
          />
        </div>

        <Select value={valeur('sexe')} onValueChange={(v) => appliquer({ sexe: v })}>
          <SelectTrigger className="h-10 w-36" aria-label="Filtrer par sexe">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous</SelectItem>
            {SEXES.map((s) => (
              <SelectItem key={s} value={s}>
                {LIBELLES_SEXE[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          className="h-10"
          onClick={() => setAvance((v) => !v)}
          aria-expanded={avance}
        >
          <SlidersHorizontal className="mr-2 size-4" aria-hidden />
          Plus de filtres
        </Button>

        {aDesFiltres && (
          <Button
            variant="ghost"
            className="h-10"
            onClick={() => {
              setRecherche('');
              demarrer(() => router.replace(chemin, { scroll: false }));
            }}
          >
            <X className="mr-2 size-4" aria-hidden />
            Effacer
          </Button>
        )}

        <span
          className="ml-auto font-mono text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {formatNombre(total)} résultat{total > 1 ? 's' : ''}
        </span>
      </div>

      {avance && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
          <Select value={valeur('grade')} onValueChange={(v) => appliquer({ grade: v })}>
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
            value={valeur('nationalite')}
            onValueChange={(v) => appliquer({ nationalite: v })}
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

          <Select
            value={valeur('encellule')}
            onValueChange={(v) => appliquer({ encellule: v })}
          >
            <SelectTrigger className="h-10 w-48" aria-label="Filtrer par cellule">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">En cellule ou non</SelectItem>
              <SelectItem value="oui">Rattaché à une cellule</SelectItem>
              <SelectItem value="non">Sans cellule</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={valeur('statut', 'ACTIF')}
            onValueChange={(v) => appliquer({ statut: v })}
          >
            <SelectTrigger className="h-10 w-40" aria-label="Filtrer par statut">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUTS_CROYANT.map((s) => (
                <SelectItem key={s} value={s}>
                  {LIBELLES_STATUT_CROYANT[s]}
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
              defaultValue={params.get('age_min') ?? ''}
              aria-label="Âge minimum"
              onBlur={(e) => appliquer({ age_min: e.target.value || null })}
              className="h-10 w-28 font-mono tabular-nums"
            />
            <span className="text-sm text-muted-foreground">à</span>
            <Input
              type="number"
              min={0}
              max={130}
              placeholder="Âge max"
              defaultValue={params.get('age_max') ?? ''}
              aria-label="Âge maximum"
              onBlur={(e) => appliquer({ age_max: e.target.value || null })}
              className="h-10 w-28 font-mono tabular-nums"
            />
          </div>
        </div>
      )}
    </div>
  );
}
