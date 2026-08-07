'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
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
import { ENTITY_LABELS, type EntityType } from '@/lib/domain/hierarchy';
import { cn } from '@/lib/utils';

import { TypeBadge } from './type-badge';

/**
 * Selection hierarchique — plan.md §10.1.
 *
 * Combobox arborescente utilisee partout ou une entite doit etre choisie :
 * formulaires, filtres, transferts, rattachement d'un croyant.
 *
 * Les options sont fournies par le serveur, deja bornees au perimetre par la
 * RLS : ce composant ne fait AUCUNE requete et ne peut donc pas exposer une
 * entite hors perimetre.
 */

export interface OptionEntite {
  id: string;
  nom: string;
  code: string;
  type: EntityType;
  niveau: number;
  /** Chemin lisible « Siege › Regional Nord › District Avaradrano ». */
  chemin: string;
  /**
   * Chemin ltree — c'est LUI qui porte les regles : portee d'une habilitation
   * (RG-25), niveau d'un transfert, detection de cycle. Le chemin lisible ne
   * sert qu'a l'affichage, les deux ne sont pas interchangeables.
   */
  path: string;
}

export function EntityPicker({
  options,
  value,
  onChange,
  placeholder = 'Selectionner une entite…',
  emptyMessage = 'Aucune entite disponible.',
  disabled,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
}: {
  options: OptionEntite[];
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);

  const selectionnee = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  );

  // Groupees par niveau : un utilisateur cherche « une paroisse », pas
  // « la 47e ligne ».
  const groupes = useMemo(() => {
    const map = new Map<EntityType, OptionEntite[]>();
    for (const option of options) {
      const liste = map.get(option.type) ?? [];
      liste.push(option);
      map.set(option.type, liste);
    }
    return [...map.entries()].sort((a, b) => a[1][0]!.niveau - b[1][0]!.niveau);
  }, [options]);

  return (
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
            !selectionnee && 'text-muted-foreground',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectionnee ? (
              <>
                <TypeBadge type={selectionnee.type} />
                <span className="truncate">{selectionnee.nom}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {selectionnee.code}
                </span>
              </>
            ) : (
              <span className="truncate">
                {options.length === 0 ? emptyMessage : placeholder}
              </span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command
          filter={(valeur, recherche) => {
            // `valeur` porte « nom code chemin » : la recherche fonctionne
            // aussi bien sur le code que sur un ancetre.
            return valeur.toLowerCase().includes(recherche.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Rechercher par nom ou par code…" className="h-10" />

          <CommandList>
            <CommandEmpty>Aucun resultat.</CommandEmpty>

            {groupes.map(([type, entites]) => (
              <CommandGroup key={type} heading={ENTITY_LABELS[type].pluriel}>
                {entites.map((entite) => (
                  <CommandItem
                    key={entite.id}
                    value={`${entite.nom} ${entite.code} ${entite.chemin}`}
                    onSelect={() => {
                      onChange(entite.id === value ? null : entite.id);
                      setOuvert(false);
                    }}
                    className="gap-2"
                  >
                    <Check
                      className={cn(
                        'size-4 shrink-0',
                        entite.id === value ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{entite.nom}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {entite.code}
                        </span>
                      </span>
                      {/* Le chemin complet leve toute ambiguite entre deux
                          entites homonymes de branches differentes. */}
                      <span className="truncate text-xs text-muted-foreground">
                        {entite.chemin}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
