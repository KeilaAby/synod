'use client';

import { Droplets, Mars, Search, Sparkles, Venus, X } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';

import { BaptemeDialog } from '@/components/baptemes/bapteme-dialog';
import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import type { CelluleOption, OptionReferentiel } from '@/components/croyants/croyant-form';
import { EmptyState } from '@/components/shared/empty-state';
import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { StatusBadge } from '@/components/shared/status-badge';
import type { OptionEntite } from '@/components/structure/entity-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { BaptemeListe, OptionCelebrant } from '@/lib/data/baptemes';
import {
  type Sexe,
  calculerAge,
  estNouveauBaptise,
  nomComplet,
  normaliserRecherche,
} from '@/lib/domain/croyant';
import { formatDate, formatNombre } from '@/lib/utils/format';

/**
 * Registre des baptêmes — EF-BAP-04, EF-BAP-06.
 *
 * La fenêtre « nouveaux baptisés » arrive en PROPRIÉTÉ, lue des paramètres
 * (ARB-5, RG-30) : la coder en dur ici aurait rendu le réglage décoratif.
 *
 * Filtrage instantané en mémoire, comme partout ailleurs dans l'application.
 */
export function BaptemesClient({
  baptemes,
  photos,
  fenetreJours,
  options,
  celebrants,
}: {
  baptemes: BaptemeListe[];
  photos: Record<string, string>;
  fenetreJours: number;
  options: {
    eglises: OptionEntite[];
    cellules: CelluleOption[];
    grades: OptionReferentiel[];
    nationalites: OptionReferentiel[];
  };
  celebrants: OptionCelebrant[];
}) {
  const [recherche, setRecherche] = useState('');
  const [sexe, setSexe] = useState<Sexe | null>(null);
  const [recents, setRecents] = useState(false);

  const rechercheDifferee = useDeferredValue(recherche);

  const estRecent = useMemo(
    () => (b: BaptemeListe) => estNouveauBaptise(new Date(b.date_bapteme), fenetreJours),
    [fenetreJours],
  );

  const filtres = useMemo(() => {
    const terme = normaliserRecherche(rechercheDifferee);

    return baptemes.filter((b) => {
      if (sexe && b.croyant?.sexe !== sexe) return false;
      if (recents && !estRecent(b)) return false;
      if (!terme) return true;

      const texte = normaliserRecherche(
        [
          b.croyant ? nomComplet(b.croyant.nom, b.croyant.prenom) : '',
          b.croyant?.matricule ?? '',
          b.entite?.nom ?? '',
          b.lieu ?? '',
          b.session_libelle ?? '',
          nomsCelebrants(b),
        ].join(' '),
      );
      return terme.split(' ').every((mot) => texte.includes(mot));
    });
  }, [baptemes, rechercheDifferee, sexe, recents, estRecent]);

  const comptes = useMemo(
    () => ({
      recents: baptemes.filter(estRecent).length,
      hommes: baptemes.filter((b) => b.croyant?.sexe === 'M').length,
      femmes: baptemes.filter((b) => b.croyant?.sexe === 'F').length,
    }),
    [baptemes, estRecent],
  );

  const aDesFiltres = recherche !== '' || sexe !== null || recents;

  function effacer() {
    setRecherche('');
    setSexe(null);
    setRecents(false);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="relative">
            <Search
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Nom, matricule, église, cérémonie…"
              aria-label="Rechercher un baptisé"
              className="h-10 w-80 pl-9"
            />
          </div>

          {/* RG-30 — la fenêtre est paramétrable : le libellé la nomme, pour
              qu'on sache ce que « récent » veut dire aujourd'hui. */}
          <GroupeFiltres libelle="Filtrer par période">
            <FiltreIcone
              icone={Sparkles}
              libelle={`Nouveaux baptisés (${fenetreJours} derniers jours)`}
              badge={formatNombre(comptes.recents)}
              actif={recents}
              classeActive="bg-sky-100 text-sky-700"
              onClick={() => setRecents(!recents)}
            />
          </GroupeFiltres>

          <GroupeFiltres libelle="Filtrer par sexe">
            <FiltreIcone
              icone={Mars}
              libelle="Hommes"
              badge={formatNombre(comptes.hommes)}
              actif={sexe === 'M'}
              classeActive="bg-sky-100 text-sky-700"
              onClick={() => setSexe(sexe === 'M' ? null : 'M')}
            />
            <FiltreIcone
              icone={Venus}
              libelle="Femmes"
              badge={formatNombre(comptes.femmes)}
              actif={sexe === 'F'}
              classeActive="bg-pink-100 text-pink-700"
              onClick={() => setSexe(sexe === 'F' ? null : 'F')}
            />
          </GroupeFiltres>

          {aDesFiltres && (
            <Button variant="ghost" className="h-10" onClick={effacer}>
              <X className="mr-2 size-4" aria-hidden />
              Effacer
            </Button>
          )}

          <span
            className="ml-auto font-mono text-xs tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            {formatNombre(filtres.length)} / {formatNombre(baptemes.length)}
          </span>
        </div>

        {filtres.length === 0 ? (
          <EmptyState
            icon={Droplets}
            title={
              baptemes.length === 0 ? 'Aucun baptême enregistré' : 'Aucun baptême ne correspond'
            }
            description={
              baptemes.length === 0
                ? 'La saisie d’un baptisé crée sa fiche de croyant : il n’y a pas de double saisie.'
                : 'Élargissez les filtres.'
            }
            action={
              baptemes.length === 0 ? (
                <BaptemeDialog
                  eglises={options.eglises}
                  cellules={options.cellules}
                  grades={options.grades}
                  nationalites={options.nationalites}
                  celebrants={celebrants}
                  photos={photos}
                  libelle="Enregistrer le premier baptisé"
                />
              ) : (
                <Button variant="outline" className="h-10" onClick={effacer}>
                  Effacer les filtres
                </Button>
              )
            }
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Baptisé</TableHead>
                    <TableHead>Matricule</TableHead>
                    <TableHead className="text-right">Âge</TableHead>
                    <TableHead>Église</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Célébrants</TableHead>
                    <TableHead>Lieu ou cérémonie</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filtres.map((b) => (
                    <TableRow key={b.id} className="h-12">
                      <TableCell>
                        <Link
                          href={`/croyants/${b.croyant_id}`}
                          className="flex items-center gap-3 font-medium text-foreground transition-colors hover:text-indigo-700"
                        >
                          {b.croyant && (
                            <AvatarCroyant
                              nom={b.croyant.nom}
                              prenom={b.croyant.prenom}
                              url={b.croyant.photo_key ? photos[b.croyant.photo_key] : null}
                            />
                          )}
                          <span className="truncate">
                            {b.croyant ? nomComplet(b.croyant.nom, b.croyant.prenom) : '—'}
                          </span>
                          {estRecent(b) && <StatusBadge tone="accent">Nouveau</StatusBadge>}
                        </Link>
                      </TableCell>

                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {b.croyant?.matricule ?? '—'}
                      </TableCell>

                      <TableCell className="text-right font-mono tabular-nums">
                        {b.croyant ? calculerAge(new Date(b.croyant.date_naissance)) : '—'}
                      </TableCell>

                      <TableCell className="max-w-40 truncate text-sm">
                        {b.entite?.nom ?? '—'}
                      </TableCell>

                      <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatDate(b.date_bapteme)}
                      </TableCell>

                      <TableCell className="max-w-48 text-sm text-muted-foreground">
                        {nomsCelebrants(b) || '—'}
                      </TableCell>

                      <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                        {b.session_libelle ?? b.lieu ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Le sexe des baptisés est lu depuis le croyant : un baptême dont la
            fiche a été supprimée n'apparaît plus, ce qui est voulu (RG-22). */}
        <p className="text-xs text-muted-foreground">
          Un « nouveau baptisé » est un croyant baptisé depuis {fenetreJours} jours ou
          moins. Ce seuil se règle dans les paramètres de l&apos;organisation.
        </p>
      </div>
    </TooltipProvider>
  );
}

/**
 * Les célébrants d'une cérémonie, en toutes lettres.
 *
 * Un lien pouvant pointer vers un croyant purgé (`on delete cascade`), on
 * écarte les entrées vides plutôt que d'afficher des virgules orphelines.
 */
function nomsCelebrants(b: BaptemeListe): string {
  return b.celebrants
    .map((c) => c.croyant)
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map((c) => `${c.nom.toLocaleUpperCase('fr')} ${c.prenom}`)
    .join(', ');
}
