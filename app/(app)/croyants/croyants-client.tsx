'use client';

import { Users } from 'lucide-react';
import Link from 'next/link';
import { useTransition } from 'react';

import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import { NouveauCroyantDialog, type OptionsCroyant } from '@/components/croyants/croyant-dialog';
import { CroyantMenu } from '@/components/croyants/croyant-menu';
import { useCroyantDialogs } from '@/components/croyants/use-croyant-dialogs';
import { EmptyState } from '@/components/shared/empty-state';
import { useSession } from '@/components/shared/session-provider';
import { StatusBadge, TON_CROYANT } from '@/components/shared/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CroyantListe } from '@/lib/data/croyants';
import { LIBELLES_SEXE, calculerAge, nomComplet } from '@/lib/domain/croyant';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils/format';

import { FiltresCroyants } from './filtres';
import { Pagination } from './pagination';

/**
 * Liste des croyants — EF-CRO-04.
 *
 * Filtres, table et pop-up vivent dans un MEME composant client parce qu'ils
 * partagent une chose : l'état de transition. Quand un filtre navigue, la table
 * reste affichée et s'estompe. La remplacer par un squelette effacerait des
 * données encore justes pour la durée d'un aller-retour — sur une liaison
 * lente, c'est l'écran qui clignote à chaque frappe.
 *
 * Les lignes portent l'intégralité de la fiche : le pop-up de modification
 * s'ouvre sans requête supplémentaire.
 */
export function CroyantsClient({
  lignes,
  total,
  page,
  nbPages,
  options,
  aDesFiltres,
}: {
  lignes: CroyantListe[];
  total: number;
  page: number;
  nbPages: number;
  options: OptionsCroyant;
  aDesFiltres: boolean;
}) {
  const { peut } = useSession();
  const [enCours, demarrer] = useTransition();

  const { modifier, demanderSuppression, dialogues } = useCroyantDialogs({
    croyants: lignes,
    options,
  });

  return (
    <div className="space-y-8">
      <FiltresCroyants
        eglises={options.eglises}
        grades={options.grades}
        nationalites={options.nationalites}
        total={total}
        enCours={enCours}
        demarrer={demarrer}
      />

      {lignes.length === 0 ? (
        <EmptyState
          icon={Users}
          title={aDesFiltres ? 'Aucun croyant ne correspond' : 'Aucun croyant enregistré'}
          description={
            aDesFiltres
              ? 'Élargissez les filtres, ou vérifiez le périmètre sélectionné.'
              : 'Enregistrez le premier croyant de votre périmètre. Le matricule sera attribué automatiquement.'
          }
          action={
            !aDesFiltres ? (
              <NouveauCroyantDialog
                options={options}
                libelle="Enregistrer le premier croyant"
              />
            ) : undefined
          }
        />
      ) : (
        <div
          // UI-16 : la table s'estompe, elle ne disparaît pas. `aria-busy`
          // annonce le recalcul à ceux qui ne voient pas l'opacité.
          aria-busy={enCours}
          className={cn(
            'space-y-8 transition-opacity duration-200',
            enCours && 'pointer-events-none opacity-60',
          )}
        >
          <Card>
            <CardContent className="p-0">
              {/* UI-07 : pas de bordures verticales, valeurs en font-mono. */}
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Nom</TableHead>
                    <TableHead>Matricule</TableHead>
                    <TableHead>Sexe</TableHead>
                    <TableHead className="text-right">Âge</TableHead>
                    <TableHead>Église</TableHead>
                    <TableHead>Cellule</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Baptême</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="w-12 text-right">
                      <span className="sr-only">Options</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {lignes.map((c) => {
                    // RG-25 : le droit s'évalue avec la portée de l'église.
                    const portee = c.eglise?.path;
                    return (
                      <TableRow key={c.id} className="h-12">
                        <TableCell>
                          <Link
                            href={`/croyants/${c.id}`}
                            className="flex items-center gap-3 font-medium text-foreground transition-colors hover:text-indigo-700"
                          >
                            {/* EF-CRO-09 — en attendant le téléversement de photo. */}
                            <AvatarCroyant nom={c.nom} prenom={c.prenom} />
                            <span className="truncate">{nomComplet(c.nom, c.prenom)}</span>
                          </Link>
                        </TableCell>

                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {c.matricule}
                        </TableCell>

                        <TableCell className="text-sm">{LIBELLES_SEXE[c.sexe]}</TableCell>

                        <TableCell className="text-right font-mono tabular-nums">
                          {calculerAge(new Date(c.date_naissance))}
                        </TableCell>

                        <TableCell className="max-w-40 truncate text-sm">
                          {c.eglise?.nom ?? '—'}
                        </TableCell>

                        <TableCell className="max-w-32 truncate text-sm text-muted-foreground">
                          {c.cellule?.nom ?? '—'}
                        </TableCell>

                        <TableCell className="text-sm">{c.grade?.libelle ?? '—'}</TableCell>

                        <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                          {formatDate(c.date_bapteme)}
                        </TableCell>

                        <TableCell>
                          <StatusBadge tone={TON_CROYANT[c.statut] ?? 'neutral'}>
                            {c.statut.charAt(0) + c.statut.slice(1).toLowerCase()}
                          </StatusBadge>
                        </TableCell>

                        <TableCell className="text-right">
                          <CroyantMenu
                            id={c.id}
                            nom={nomComplet(c.nom, c.prenom)}
                            peutModifier={portee ? peut('croyant.update', portee) : false}
                            peutSupprimer={portee ? peut('croyant.delete', portee) : false}
                            onModifier={modifier}
                            onSupprimer={demanderSuppression}
                            className="ml-auto"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Pagination page={page} nbPages={nbPages} total={total} />
        </div>
      )}

      {dialogues}
    </div>
  );
}
