'use client';

import {
  CircleSlash,
  Loader2,
  MoreVertical,
  Repeat,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { retirerMembre } from '@/lib/actions/bureaux';
import type { BureauComplet } from '@/lib/data/bureaux';
import {
  type FonctionBureau,
  composerBureau,
  comptePostes,
  libelleAffichage,
} from '@/lib/domain/bureau';
import { nomComplet } from '@/lib/domain/croyant';
import type { EntityType } from '@/lib/domain/hierarchy';
import { formatDate, formatNombre } from '@/lib/utils/format';

import { DesignationDialog } from './designation-dialog';
import type { CandidatOption } from './designation-dialog';

/**
 * Composition d'un bureau — EF-BUR-03, EF-BUR-07, EF-BUR-08.
 *
 * ORDONNÉE PAR RANG PROTOCOLAIRE, et les fonctions **vacantes** y figurent.
 * Un bureau se lit autant à ce qui lui manque qu'à ce qu'il a : masquer les
 * vacances laisserait croire un bureau complet alors qu'il n'a ni trésorier ni
 * secrétaire — et c'est précisément ce qu'on vient vérifier.
 *
 * Une ligne vacante n'est pas grisée en fin de tableau : elle reste à son rang,
 * parce que c'est le rang qui dit l'importance du manque.
 */
export function BureauComposition({
  bureau,
  fonctions,
  candidats,
  photos,
  peutGerer,
}: {
  bureau: BureauComplet;
  fonctions: FonctionBureau[];
  candidats: CandidatOption[];
  photos: Record<string, string>;
  peutGerer: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();

  const [aDesigner, setADesigner] = useState<{ fonctionId: string } | null>(null);
  const [aRemplacer, setARemplacer] = useState<{
    membreId: string;
    fonctionId: string;
  } | null>(null);
  const [aRetirer, setARetirer] = useState<{
    id: string;
    nom: string;
    fonction: string;
  } | null>(null);

  const niveau = (bureau.entite?.type ?? 'EGLISE') as EntityType;

  const postes = useMemo(
    () =>
      composerBureau(
        fonctions,
        bureau.membres.map((m) => ({
          id: m.id,
          croyantId: m.croyant_id,
          fonctionId: m.fonction_id,
          dateDebut: m.date_debut,
          dateFin: m.date_fin,
        })),
        niveau,
      ),
    [fonctions, bureau.membres, niveau],
  );

  const compte = comptePostes(postes);
  const parId = useMemo(
    () => new Map(bureau.membres.map((m) => [m.id, m])),
    [bureau.membres],
  );

  function retirer(membreId: string) {
    demarrer(async () => {
      const resultat = await retirerMembre({ membreId });
      if (!resultat.ok) {
        toast.error(resultat.error);
        return;
      }
      toast.success('Mandat clos. La fonction est vacante.');
      setARetirer(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* --- L'état du bureau, en une ligne --- */}
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={bureau.is_active ? 'success' : 'neutral'}>
          {bureau.is_active ? 'Mandat en cours' : 'Mandat clos'}
        </StatusBadge>

        <span className="text-muted-foreground text-sm">
          {libelleAffichage(bureau.libelle, bureau.date_debut, bureau.date_fin)}
        </span>

        <span className="text-muted-foreground ml-auto font-mono text-xs tabular-nums">
          {formatNombre(compte.pourvus)} / {formatNombre(compte.total)} pourvus
          {compte.vacants > 0 && (
            <span className="ml-2 text-amber-700">
              · {formatNombre(compte.vacants)} vacant{compte.vacants > 1 ? 's' : ''}
            </span>
          )}
        </span>
      </div>

      {postes.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-6 text-sm">
            Aucune fonction n&apos;est applicable au niveau{' '}
            {bureau.entite?.type.toLocaleLowerCase('fr')}. Vérifiez les niveaux déclarés
            sur chaque fonction, dans les référentiels.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 text-right">Rang</TableHead>
                  <TableHead>Fonction</TableHead>
                  <TableHead>Titulaire</TableHead>
                  <TableHead>Depuis</TableHead>
                  <TableHead className="w-12 text-right">
                    <span className="sr-only">Options</span>
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {postes.map((poste, rang) => {
                  const membre = poste.mandat ? parId.get(poste.mandat.id) : null;
                  const croyant = membre?.croyant ?? null;

                  return (
                    <TableRow
                      key={poste.fonction.id}
                      className={poste.mandat ? 'h-14' : 'h-14 bg-amber-50/40'}
                    >
                      <TableCell className="text-muted-foreground text-right font-mono text-xs tabular-nums">
                        {rang + 1}
                      </TableCell>

                      <TableCell>
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-foreground text-sm font-medium">
                            {poste.fonction.libelle}
                          </span>
                          {/* RG-31 — ce qui fait un « membre de finances ». */}
                          {poste.fonction.estFinanciere && (
                            <StatusBadge tone="accent">Finances</StatusBadge>
                          )}
                        </span>
                      </TableCell>

                      <TableCell>
                        {croyant ? (
                          <Link
                            href={`/croyants/${croyant.id}`}
                            className="text-foreground flex items-center gap-3 font-medium transition-colors hover:text-indigo-700"
                          >
                            <AvatarCroyant
                              nom={croyant.nom}
                              prenom={croyant.prenom}
                              url={croyant.photo_key ? photos[croyant.photo_key] : null}
                            />
                            <span className="min-w-0">
                              <span className="block truncate">
                                {nomComplet(croyant.nom, croyant.prenom)}
                              </span>
                              <span className="text-muted-foreground block font-mono text-xs font-normal">
                                {croyant.matricule}
                              </span>
                            </span>
                          </Link>
                        ) : (
                          <span className="flex items-center gap-2 text-sm text-amber-700">
                            <CircleSlash className="size-4" aria-hidden />
                            Vacante
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="text-muted-foreground font-mono text-xs tabular-nums">
                        {membre ? formatDate(membre.date_debut) : '—'}
                      </TableCell>

                      <TableCell className="text-right">
                        {peutGerer && bureau.is_active && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label={`Actions sur ${poste.fonction.libelle}`}
                                className="text-muted-foreground hover:text-foreground ml-auto flex size-6 items-center justify-center rounded-md transition-colors hover:bg-slate-100"
                              >
                                <MoreVertical className="size-4" aria-hidden />
                              </button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end" className="w-56">
                              {poste.mandat ? (
                                <>
                                  {/* EF-BUR-08 — remplacer, et non retirer puis
                                      désigner : la fonction ne doit pas devenir
                                      vacante entre les deux gestes. */}
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      setARemplacer({
                                        membreId: poste.mandat!.id,
                                        fonctionId: poste.fonction.id,
                                      })
                                    }
                                  >
                                    <Repeat className="mr-2 size-4" aria-hidden />
                                    Remplacer
                                  </DropdownMenuItem>

                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() =>
                                      setARetirer({
                                        id: poste.mandat!.id,
                                        nom: croyant
                                          ? nomComplet(croyant.nom, croyant.prenom)
                                          : 'ce membre',
                                        fonction: poste.fonction.libelle,
                                      })
                                    }
                                  >
                                    <UserMinus className="mr-2 size-4" aria-hidden />
                                    Retirer du bureau
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setADesigner({ fonctionId: poste.fonction.id })
                                  }
                                >
                                  <UserPlus className="mr-2 size-4" aria-hidden />
                                  Désigner un titulaire
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* --- Désignation et remplacement --- */}
      {aDesigner && (
        <DesignationDialog
          mode="designer"
          bureau={bureau}
          fonctions={fonctions}
          candidats={candidats}
          photos={photos}
          fonctionId={aDesigner.fonctionId}
          ouvert
          onOuvertChange={(v) => !v && setADesigner(null)}
        />
      )}

      {aRemplacer && (
        <DesignationDialog
          mode="remplacer"
          bureau={bureau}
          fonctions={fonctions}
          candidats={candidats}
          photos={photos}
          fonctionId={aRemplacer.fonctionId}
          membreId={aRemplacer.membreId}
          ouvert
          onOuvertChange={(v) => !v && setARemplacer(null)}
        />
      )}

      {aRetirer && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setARetirer(null)}
          // ENF-UTI-04 — la confirmation NOMME la personne et la fonction.
          title={`Retirer ${aRetirer.nom} du bureau ?`}
          description={
            `Son mandat de « ${aRetirer.fonction} » sera clos à ce jour et la fonction ` +
            'deviendra vacante. Le mandat reste dans l’historique : il n’est pas effacé.'
          }
          confirmLabel={enCours ? 'Clôture…' : 'Retirer'}
          onConfirm={async () => retirer(aRetirer.id)}
        />
      )}

      {enCours && (
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          Enregistrement…
        </p>
      )}
    </div>
  );
}
