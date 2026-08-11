'use client';

import {
  CircleSlash,
  MoreVertical,
  Network,
  Printer,
  Repeat,
  Table as TableIcon,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { OperationDialog } from '@/components/shared/operation-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
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
import { dispositionParDefaut } from '@/lib/domain/organigramme-bureau';
import type { EntityType } from '@/lib/domain/hierarchy';
import { formatDate, formatNombre } from '@/lib/utils/format';

import { BureauFlowLoader } from './bureau-flow-loader';
import { imprimerOrganigramme } from './imprimer-organigramme';
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
  onChange,
}: {
  bureau: BureauComplet;
  fonctions: FonctionBureau[];
  candidats: CandidatOption[];
  photos: Record<string, string>;
  peutGerer: boolean;
  /**
   * À fournir quand le bureau ne vient PAS du rendu de la page — depuis
   * l'organigramme, il est chargé par une action, et `router.refresh()`
   * rafraîchirait une page qui ne le porte pas. Sans cela, la composition
   * resterait figée après une désignation.
   */
  onChange?: () => void;
}) {
  const router = useRouter();
  const [, demarrer] = useTransition();

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
  const [operation, setOperation] = useState<string | null>(null);
  /** EF-BUR-07 — le tableau d'abord : c'est lui qui sert à composer. */
  const [vue, setVue] = useState<'table' | 'graphe'>('table');

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

  /**
   * Le plan AFFICHE, calcule une fois : le graphe et l impression doivent
   * montrer exactement la meme chose. Sans plan dessine, le graphe pose les
   * blocs en grille — l impression doit alors sortir cette grille, et non se
   * declarer vide.
   */
  const planAffiche = useMemo(() => {
    const dessine = (bureau.postes ?? []).map((p) => ({
      fonctionId: p.fonction_id,
      parentFonctionId: p.parent_fonction_id,
      x: p.pos_x,
      y: p.pos_y,
    }));
    return dessine.length > 0 ? dessine : dispositionParDefaut(postes);
  }, [bureau.postes, postes]);
  const parId = useMemo(
    () => new Map(bureau.membres.map((m) => [m.id, m])),
    [bureau.membres],
  );

  function retirer(membre: { id: string; nom: string }) {
    setARetirer(null);
    setOperation(`Clôture du mandat de ${membre.nom}…`);
    demarrer(async () => {
      const resultat = await retirerMembre({ membreId: membre.id });
      if (!resultat.ok) {
        setOperation(null);
        toast.error(resultat.error);
        return;
      }
      toast.success('Mandat clos. La fonction est vacante.');
      router.refresh();
      onChange?.();
      setOperation(null);
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

        {/* EF-BUR-07 — deux REPRÉSENTATIONS d'une même composition, pas deux
            écrans : le tableau pour composer, le graphe pour présenter. Le
            tableau reste par défaut, c'est ce qu'on vient faire ici. */}
        <GroupeFiltres libelle="Représentation">
          <FiltreIcone
            icone={TableIcon}
            libelle="Tableau"
            actif={vue === 'table'}
            classeActive="bg-indigo-100 text-indigo-700"
            onClick={() => setVue('table')}
          />
          <FiltreIcone
            icone={Network}
            libelle="Organigramme"
            actif={vue === 'graphe'}
            classeActive="bg-indigo-100 text-indigo-700"
            onClick={() => setVue('graphe')}
          />
        </GroupeFiltres>
      </div>

      {postes.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-6 text-sm">
            Aucune fonction n&apos;est applicable au niveau{' '}
            {bureau.entite?.type.toLocaleLowerCase('fr')}. Vérifiez les niveaux déclarés
            sur chaque fonction, dans les référentiels.
          </CardContent>
        </Card>
      ) : vue === 'graphe' ? (
        <div className="space-y-3">
          {/* EF-BUR-11 — la MEME impression que depuis l'éditeur, par la même
              fonction : un bureau ne s'imprime pas différemment selon l'écran
              d'où on l'a demandé. */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              className="h-9"
              onClick={() => imprimerOrganigramme(bureau, postes, planAffiche)}
            >
              <Printer className="mr-2 size-4" aria-hidden />
              Imprimer / PDF
            </Button>
          </div>

          <BureauFlowLoader
            postes={postes}
            membres={bureau.membres}
            // Le plan dessiné dans l'éditeur, s'il existe : deux
            // représentations du même bureau ne doivent pas se contredire.
            plan={planAffiche}
            photos={photos}
            peutGerer={peutGerer && bureau.is_active}
            onDesigner={(fonctionId) => setADesigner({ fonctionId })}
          />
          {/* Dire d'où vient ce qu'on regarde : un plan dessiné et un repli
              automatique n'ont pas la même autorité, et rien ne les distingue
              à l'œil. */}
          <p className="text-muted-foreground text-xs">
            {(bureau.postes ?? []).length > 0 ? (
              <>
                Organigramme <strong>dessiné</strong> pour ce bureau. Modifiez-le depuis
                le menu ⋮ de sa carte, « Définir l&apos;organigramme ».
              </>
            ) : (
              <>
                Aucun organigramme n&apos;a été dessiné : les blocs suivent le{' '}
                <strong>rang protocolaire</strong>, qui exprime une préséance et non un
                lien de subordination.
              </>
            )}
          </p>
        </div>
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
          onChange={onChange}
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
          onChange={onChange}
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
          confirmLabel="Retirer"
          onConfirm={() => retirer({ id: aRetirer.id, nom: aRetirer.nom })}
        />
      )}

      <OperationDialog
        // Ne depend QUE de `operation` : le retrait part de `ConfirmDialog`, qui
        // execute `onConfirm` dans SA transition — la notre s'y fondrait.
        ouvert={operation !== null}
        titre={operation ?? ''}
        description="La fonction redevient vacante ; le mandat reste dans l’historique."
      />
    </div>
  );
}
