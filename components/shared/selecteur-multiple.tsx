'use client';

import { Check, ChevronsUpDown, X } from 'lucide-react';
import { type ReactNode, useId, useMemo, useState } from 'react';

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
 * selecteur d'entite : champ de recherche, groupes, panneau qui ne s'enferme
 * pas dans la largeur du declencheur.
 *
 * LES ELEMENTS RETENUS S'AFFICHENT DANS LE CHAMP, qui grandit en hauteur.
 * Un champ de hauteur fixe aurait force a les reporter en dessous ; ici il
 * s'etire, et l'on voit ce qu'on a choisi la ou on l'a choisi.
 *
 * Le declencheur est un `div` et non un `button` : les pastilles portent
 * chacune un bouton de retrait, et un bouton dans un bouton est un HTML
 * invalide que les lecteurs d'ecran ne savent pas restituer. Le role
 * `combobox`, le focus et les touches Entree / Espace sont donc portes a la
 * main.
 */

export interface OptionMultiple {
  id: string;
  libelle: string;
  /** Precision affichee en gris : grade, code, chemin… */
  detail?: string;
  /** Vignette affichee avant le libelle — photo, initiales, pictogramme. */
  avatar?: ReactNode;
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

  // `aria-controls` doit designer le panneau : un `combobox` qui ne dit pas ce
  // qu il ouvre laisse le lecteur d ecran annoncer une liste sans contenu.
  const idPanneau = useId();

  const inactif = disabled || options.length === 0;

  const retenues = useMemo(
    () =>
      valeurs
        .map((v) => options.find((o) => o.id === v))
        .filter(Boolean) as OptionMultiple[],
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
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger asChild>
        <div
          id={id}
          role="combobox"
          aria-expanded={ouvert}
          aria-controls={idPanneau}
          aria-haspopup="listbox"
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          aria-required={ariaRequired}
          aria-disabled={inactif}
          tabIndex={inactif ? -1 : 0}
          onKeyDown={(e) => {
            if (inactif) return;
            // Entree et Espace ouvrent le panneau, comme sur un vrai bouton.
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOuvert(true);
            }
          }}
          className={cn(
            'border-input flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-md border',
            'bg-background px-3 py-1.5 text-sm transition-colors',
            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
            'aria-invalid:border-destructive',
            inactif && 'cursor-not-allowed opacity-60',
          )}
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {retenues.length === 0 ? (
              <span className="text-muted-foreground">
                {options.length === 0 ? emptyMessage : placeholder}
              </span>
            ) : (
              retenues.map((option) => (
                <span
                  key={option.id}
                  className="border-border bg-card inline-flex items-center gap-1.5 rounded-md border py-0.5 pr-0.5 pl-1 text-xs"
                >
                  {option.avatar}
                  <span className="text-foreground max-w-40 truncate font-medium">
                    {option.libelle}
                  </span>
                  <button
                    type="button"
                    // Sans cet arret, le clic remonterait au declencheur et
                    // rouvrirait le panneau qu'on vient peut-etre de fermer.
                    onClick={(e) => {
                      e.stopPropagation();
                      basculer(option.id);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    aria-label={`Retirer ${option.libelle}`}
                    className="text-muted-foreground hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-slate-100"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ))
            )}
          </span>

          <ChevronsUpDown
            className="size-4 shrink-0 self-center opacity-50"
            aria-hidden
          />
        </div>
      </PopoverTrigger>

      {/* Meme regle que `EntityPicker` : le panneau part de la largeur du
          declencheur sans s'y enfermer — un nom tronque ne se lit pas. */}
      <PopoverContent
        id={idPanneau}
        className="w-(--radix-popover-trigger-width) max-w-[min(28rem,90vw)] min-w-80 p-0"
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
                      className="gap-3"
                    >
                      {option.avatar}

                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium">
                          {option.libelle}
                        </span>
                        {option.detail && (
                          <span className="text-muted-foreground truncate text-xs">
                            {option.detail}
                          </span>
                        )}
                      </span>

                      <Check
                        className={cn(
                          'size-4 shrink-0 text-indigo-600',
                          retenue ? 'opacity-100' : 'opacity-0',
                        )}
                        aria-hidden
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
