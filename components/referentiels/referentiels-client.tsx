'use client';

import { List, MoreVertical, Plus } from 'lucide-react';
import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent } from '@/components/ui/card';
import {
  REFERENTIELS,
  SLUGS_REFERENTIELS,
  type SlugReferentiel,
} from '@/lib/domain/referentiels';
import { formatNombre } from '@/lib/utils/format';

import { ReferentielTable, type LigneReferentiel } from './referentiel-table';

/**
 * Index des référentiels — EF-REF-01 à 06.
 *
 * La liste et son CRUD vivent dans un POP-UP, comme partout ailleurs dans
 * l'application : les pages `/referentiels/<slug>` ont disparu. Consulter les
 * grades pour vérifier un libellé ne justifie pas une navigation complète, et
 * l'on revenait ensuite en arrière pour consulter les fonctions.
 *
 * Les valeurs des quatre référentiels sont chargées AVEC la page : le pop-up
 * s'ouvre donc sans requête ni squelette. Quelques dizaines de lignes par
 * table — le coût est nul et le gain immédiat.
 */
export function ReferentielsClient({
  lignesParSlug,
  compteurs,
  peutGerer,
}: {
  lignesParSlug: Record<SlugReferentiel, LigneReferentiel[]>;
  compteurs: Record<SlugReferentiel, { total: number; actifs: number }>;
  peutGerer: boolean;
}) {
  const [ouvert, setOuvert] = useState<SlugReferentiel | null>(null);
  /** Ouvrir directement sur le formulaire d'ajout, depuis le menu. */
  const [ajoutImmediat, setAjoutImmediat] = useState(false);

  function ouvrir(slug: SlugReferentiel, ajout = false) {
    setAjoutImmediat(ajout);
    setOuvert(slug);
  }

  const definition = ouvert ? REFERENTIELS[ouvert] : null;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {SLUGS_REFERENTIELS.map((slug) => {
          const def = REFERENTIELS[slug];
          const compteur = compteurs[slug];
          const desactivees = compteur.total - compteur.actifs;

          return (
            <Card key={slug} className="transition-colors hover:border-slate-300">
              <CardContent className="space-y-4 p-6">
                <div className="flex items-start justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => ouvrir(slug)}
                    className="min-w-0 flex-1 space-y-1 text-left"
                  >
                    <h2 className="text-foreground text-sm font-semibold transition-colors hover:text-indigo-700">
                      {def.titre}
                    </h2>
                    <p className="text-muted-foreground text-sm">{def.description}</p>
                  </button>

                  {/* Le même menu ⋮ que partout : structure, croyants, transferts. */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions sur ${def.titre}`}
                        className="text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-slate-100"
                      >
                        <MoreVertical className="size-4" aria-hidden />
                      </button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onSelect={() => ouvrir(slug)}>
                        <List className="mr-2 size-4" aria-hidden />
                        Voir la liste
                        <span className="text-muted-foreground ml-auto font-mono text-xs">
                          {formatNombre(compteur.total)}
                        </span>
                      </DropdownMenuItem>

                      {peutGerer && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => ouvrir(slug, true)}>
                            <Plus className="mr-2 size-4" aria-hidden />
                            Ajouter {def.singulier.toLocaleLowerCase('fr')}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <p className="text-muted-foreground font-mono text-xs tabular-nums">
                  {formatNombre(compteur.actifs)} active{compteur.actifs > 1 ? 's' : ''}
                  {desactivees > 0 &&
                    ` · ${formatNombre(desactivees)} désactivée${desactivees > 1 ? 's' : ''}`}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={ouvert !== null} onOpenChange={(v) => !v && setOuvert(null)}>
        <DialogContent className="max-h-[92vh] w-[min(96vw,72rem)] overflow-y-auto sm:max-w-5xl">
          {ouvert && definition && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{definition.titre}</DialogTitle>
                <DialogDescription>{definition.description}</DialogDescription>
              </DialogHeader>

              {/*
                `key` : le remontage réamorce l'état interne — notamment
                l'ouverture immédiate du formulaire d'ajout — quand on passe
                d'un référentiel à l'autre sans refermer le pop-up.
              */}
              <ReferentielTable
                key={`${ouvert}:${ajoutImmediat}`}
                slug={ouvert}
                lignes={lignesParSlug[ouvert]}
                peutGerer={peutGerer}
                ajoutImmediat={ajoutImmediat}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
