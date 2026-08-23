'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';

import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
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
import { normaliserRecherche } from '@/lib/domain/croyant';
import { cn } from '@/lib/utils';

/**
 * Sélection d'UN croyant, avec recherche et portrait.
 *
 * POURQUOI PAS UN `<Select>`. Une église de deux cents membres donne deux cents
 * lignes qu'il faut parcourir à l'œil : on cherche « Razafindraparany », pas
 * « la cent quarantième entrée ». Et deux homonymes y sont indiscernables —
 * c'est le matricule, puis le visage, qui les séparent.
 *
 * Même patron que l'`EntityPicker` : le composant ne fait AUCUNE requête, les
 * options viennent du serveur déjà bornées au périmètre par la RLS. Il ne peut
 * donc pas exposer un croyant hors périmètre.
 */

export interface OptionCroyant {
  readonly id: string;
  readonly nom: string;
  readonly prenom: string;
  readonly matricule: string;
  /** Clé de stockage de la photo (EF-CRO-09), résolue par `photos`, ou URL directe. */
  readonly photoKey?: string | null;
  readonly photo_key?: string | null;
  /** Précision affichée sous le nom : cellule, grade, enveloppe connue… */
  readonly detail?: string | null;
}

function extrairePhotoUrl(
  croyant: OptionCroyant,
  photos: Record<string, string>,
): string | null {
  const cle = croyant.photoKey || croyant.photo_key;
  if (!cle) return null;
  if (cle.startsWith('http://') || cle.startsWith('https://') || cle.startsWith('/')) {
    return cle;
  }
  return photos[cle] ?? null;
}

export function CroyantPicker({
  options,
  value,
  onChange,
  photos = {},
  placeholder = 'Choisir un croyant',
  emptyMessage = 'Aucun croyant à proposer.',
  disabled,
  avecRecherche = true,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: {
  options: readonly OptionCroyant[];
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  /** Clé de stockage -> URL signée, signées en lot par la page. */
  photos?: Record<string, string>;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  /**
   * Une liste COURTE n'a pas besoin d'etre cherchee.
   *
   * Les porteurs connus d'un numero d'enveloppe se comptent sur une main :
   * un champ de recherche y ajouterait un geste pour rien, et prendrait le
   * focus au clavier avant les propositions elles-memes.
   */
  avecRecherche?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);

  const choisi = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  );

  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={ouvert}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          disabled={disabled || options.length === 0}
          className={cn(
            'h-9 w-full justify-between font-normal',
            !choisi && 'text-muted-foreground',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {choisi ? (
              <>
                <AvatarCroyant
                  nom={choisi.nom}
                  prenom={choisi.prenom}
                  url={extrairePhotoUrl(choisi, photos)}
                />
                <span className="truncate">
                  {choisi.nom.toLocaleUpperCase('fr')} {choisi.prenom}
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

      {/*
        Un plancher de 24 rem, comme le sélecteur d'entité : dans une COLONNE de
        grille, le déclencheur ne fait que quelques centimètres, et un panneau
        aligné dessus tronquerait le nom — précisément ce qu'on vient y lire.
      */}
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-[max(var(--radix-popover-trigger-width),24rem)] max-w-[92vw] p-0"
        align="start"
      >
        <Command
          filter={(valeur, recherche) => {
            /**
             * La recherche IGNORE ACCENTS ET CASSE — `normaliserRecherche`,
             * celle des listes de croyants. « Razafindraparany » ne se tape pas
             * deux fois de la même façon, et un filtre sensible aux accents
             * répondrait « aucun résultat » sur un nom pourtant présent.
             */
            return normaliserRecherche(valeur).includes(normaliserRecherche(recherche))
              ? 1
              : 0;
          }}
        >
          {avecRecherche && (
            <CommandInput
              placeholder="Rechercher par nom ou par matricule…"
              className="h-10"
            />
          )}

          {/*
            La barre de défilement est RENDUE VISIBLE : `CommandList` porte
            `no-scrollbar` par défaut, si bien qu'une liste de deux cents
            croyants paraissait s'arrêter à la sixième.
          */}
          <CommandList className="max-h-80 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar]:block [&::-webkit-scrollbar]:w-2">
            <CommandEmpty>Aucun résultat.</CommandEmpty>

            <CommandGroup>
              {options.map((croyant) => (
                <CommandItem
                  key={croyant.id}
                  // Le matricule entre dans la valeur cherchée : c'est lui qui
                  // sépare deux homonymes quand le visage manque.
                  value={`${croyant.nom} ${croyant.prenom} ${croyant.matricule}`}
                  onSelect={() => {
                    onChange(croyant.id === value ? null : croyant.id);
                    setOuvert(false);
                  }}
                  /* Le fond de `CommandItem` est CONSERVÉ : dans une liste
                     déroulante, il est ce qui suit le curseur au clavier. */
                  className="gap-2"
                >
                  <Check
                    className={cn(
                      'size-4 shrink-0',
                      croyant.id === value ? 'opacity-100' : 'opacity-0',
                    )}
                    aria-hidden
                  />

                  {/* Un visage se reconnaît plus vite qu'un nom, surtout entre
                      homonymes. L'avatar à initiales prend le relais tant qu'il
                      n'y a pas de photo. */}
                  <AvatarCroyant
                    nom={croyant.nom}
                    prenom={croyant.prenom}
                    url={extrairePhotoUrl(croyant, photos)}
                  />

                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {croyant.nom.toLocaleUpperCase('fr')} {croyant.prenom}
                      </span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {croyant.matricule}
                      </span>
                    </span>
                    {croyant.detail && (
                      <span className="text-muted-foreground truncate text-xs">
                        {croyant.detail}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
