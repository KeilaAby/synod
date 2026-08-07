'use client';

import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Selection MULTIPLE avec recherche — meme ergonomie que `EntityPicker`.
 *
 * Une liste deroulante ordinaire convient a une dizaine de valeurs qu'on lit
 * d'un coup d'oeil. Des qu'il faut chercher — des croyants, des entites — elle
 * devient un defilement a l'aveugle. Ce composant reprend donc la forme du
 * selecteur d'entite : un champ de recherche, des groupes, et les elements
 * retenus affiches en pastilles sous le declencheur.
 *
 * Les pastilles sont SOUS le declencheur et non dedans : trois noms dans un
 * bouton de 40 px les tronquent tous les trois, et l'on ne sait plus qui est
 * selectionne — ce qui est precisement la question qu'on se pose.
 */

export interface OptionMultiple {
  id: string;
  libelle: string;
  /** Precision affichee en gris : grade, code, chemin… */
  detail?: string;
  /** Regroupe les options sous un intitule. Facultatif. */
  groupe?: string;
  /** Remonte l'option en tete de son groupe — le cas courant d'abord. */
  prioritaire?: boolean;
}

export function SelecteurMultiple({
  options,
  valeurs,
  onChange,
  placeholder = 'Choisir…',
  emptyMessage = 'Aucun élément disponible.',
  rechercheMessage = 'Rechercher…',
  id,
  disabled,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
}: {
  options: OptionMultiple[];
  valeurs: string[];
  onChange: (valeurs: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  rechercheMessage?: string;
  id?: string;
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);

  const retenues = useMemo(
    () => valeurs.map((v) => options.find((o) => o.id === v)).filter(Boolean) as OptionMultiple[],
    [valeurs, options],
  );

  const groupes = useMemo(() => {
    const map = new Map<string, OptionMultiple[]>();
    for (const option of options) {
      const cle = option.groupe ?? '';
      const liste = map.get(cle) ?? [];
      liste.push(option);
      map.set(cle, liste);
    }
    for (const liste of map.values()) {
      liste.sort(
        (a, b) =>
          Number(b.prioritaire ?? false) - Number(a.prioritaire ?? false) ||
          a.libelle.localeCompare(b.libelle, 'fr'),
      );
    }
    return [...map.entries()];
  }, [options]);

  function basculer(idOption: string) {
    onChange(
      valeurs.includes(idOption)
        ? valeurs.filter((v) => v !== idOption)
        : [...valeurs, idOption],
    );
  }

  return (
    <div className="space-y-2">
      <Popover open={ouvert} onOpenChange={setOuvert}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={ouvert}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            aria-required={ariaRequired}
            disabled={disabled || options.length === 0}
            className={cn(
              'h-10 w-full justify-between font-normal',
              retenues.length === 0 && 'text-muted-foreground',
            )}
          >
            <span className="truncate">
              {options.length === 0
                ? emptyMessage
                : retenues.length === 0
                  ? placeholder
                  : `${retenues.length} sélectionné${retenues.length > 1 ? 's' : ''}`}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>

        {/* Meme regle que `EntityPicker` : le panneau part de la largeur du
            declencheur sans s'y enfermer — un nom tronque ne se lit pas. */}
        <PopoverContent
          className="w-(--radix-popover-trigger-width) min-w-80 max-w-[min(28rem,90vw)] p-0"
          align="start"
        >
          <Command
            filter={(valeur, recherche) =>
              valeur.toLowerCase().includes(recherche.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput placeholder={rechercheMessage} className="h-10" />

            <CommandList>
              <CommandEmpty>Aucun resultat.</CommandEmpty>

              {groupes.map(([groupe, liste]) => (
                <CommandGroup key={groupe || 'sans-groupe'} heading={groupe || undefined}>
                  {liste.map((option) => {
                    const retenue = valeurs.includes(option.id);

                    return (
                      <CommandItem
                        key={option.id}
                        value={`${option.libelle} ${option.detail ?? ''}`}
                        // Le panneau RESTE ouvert : on choisit rarement un seul
                        // element dans un selecteur multiple, et le refermer a
                        // chaque clic obligerait a le rouvrir autant de fois.
                        onSelect={() => basculer(option.id)}
                        className="gap-2"
                      >
                        <Check
                          className={cn('size-4 shrink-0', retenue ? 'opacity-100' : 'opacity-0')}
                          aria-hidden
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm font-medium">{option.libelle}</span>
                          {option.detail && (
                            <span className="truncate text-xs text-muted-foreground">
                              {option.detail}
                            </span>
                          )}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* --- Ce qui est retenu, en toutes lettres --- */}
      {retenues.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {retenues.map((option) => (
            <li key={option.id}>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 py-1 pr-1 pl-2.5 text-xs text-slate-700">
                {option.libelle}
                <button
                  type="button"
                  onClick={() => basculer(option.id)}
                  aria-label={`Retirer ${option.libelle}`}
                  className="flex size-5 items-center justify-center rounded transition-colors hover:bg-slate-200"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
