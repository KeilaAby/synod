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
  compact = false,
  discret = false,
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
  /**
   * Declencheur allege : ni pastille de type, ni code — le NOM seul.
   *
   * Pour une COLONNE de grille, ou le champ fait deux cents pixels. La pastille
   * et le code y prenaient les deux tiers de la place, et il ne restait au nom
   * de l'eglise — la seule chose qu'on vient lire — qu'une trentaine de pixels.
   * Le panneau, lui, montre toujours tout : type en tete de groupe, code et
   * chemin complet sur chaque ligne.
   */
  compact?: boolean;
  /**
   * Declencheur DISCRET : un texte cliquable, pas un champ de formulaire.
   *
   * Pour une LISTE ou chaque ligne porte son propre selecteur — la portee
   * d'un droit accorde, ligne par ligne (EF-ADM-03). Le declencheur plein
   * (`h-10 w-full`, bordure) empile alors autant de champs que de droits
   * actifs, et treize boites identiques disant « Toute l'entite de
   * rattachement » fatiguent l'oeil avant d'etre lues. En mode discret, le
   * declencheur se reduit a la taille de son texte, sans bordure ni fond.
   */
  discret?: boolean;
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
          variant={discret ? 'ghost' : 'outline'}
          role="combobox"
          aria-expanded={ouvert}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          aria-required={ariaRequired}
          disabled={disabled || options.length === 0}
          className={cn(
            discret
              ? 'h-auto w-auto max-w-full gap-1 px-1.5 py-0.5 text-xs font-normal'
              : 'h-10 w-full justify-between font-normal',
            !selectionnee && 'text-muted-foreground',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectionnee ? (
              <>
                {!compact && !discret && <TypeBadge type={selectionnee.type} />}
                <span className="truncate">{selectionnee.nom}</span>
                {!compact && !discret && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {selectionnee.code}
                  </span>
                )}
              </>
            ) : (
              <span className="truncate">
                {options.length === 0 ? emptyMessage : placeholder}
              </span>
            )}
          </span>
          <ChevronsUpDown
            className={cn('shrink-0 opacity-50', discret ? 'size-3' : 'ml-2 size-4')}
            aria-hidden
          />
        </Button>
      </PopoverTrigger>

      {/*
        Le panneau fait au MOINS la largeur de son declencheur, et AU MOINS
        24 rem. La premiere borne suffisait tant que le selecteur occupait une
        ligne de formulaire ; dans une COLONNE de grille, le declencheur ne fait
        que quelques centimetres, et le panneau qui s'y alignait rendait
        « ANTSAHATSIRESY » comme « ANTSAHATS… » — deux eglises voisines y
        devenaient indiscernables, alors que le nom est precisement ce qu'on
        vient lire.

        `max-width` ne le borne que sur un ecran de telephone.
      */}
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-[max(var(--radix-popover-trigger-width),24rem)] max-w-[92vw] p-0"
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

          {/*
            La barre de defilement est RENDUE VISIBLE : `CommandList` porte
            `no-scrollbar` par defaut, si bien que la liste defilait sans que
            rien ne l'annonce — un perimetre de trente entites paraissait
            s'arreter a la cinquieme.
          */}
          <CommandList className="max-h-80 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar]:block [&::-webkit-scrollbar]:w-2">
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
