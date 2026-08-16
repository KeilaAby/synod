'use client';

import { ChevronDown, ChevronRight, Coins, Search, Truck } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';

import {
  CollecteDialog,
  type CroyantOption,
} from '@/components/finances/collecte-dialog';
import { RemiseDialog } from '@/components/finances/remise-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { StatusBadge } from '@/components/shared/status-badge';
import type { OptionEntite } from '@/components/structure/entity-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CollecteListe } from '@/lib/data/dimes';
import { normaliserRecherche } from '@/lib/domain/croyant';
import {
  LIBELLES_EVENEMENT,
  LIBELLES_NATURE,
  type ModeDime,
  detailConsultable,
  estEnRetard,
} from '@/lib/domain/dime';
import { formatDate, formatMontant, formatNombre } from '@/lib/utils/format';

/**
 * Relevé des collectes de dîmes — EF-FIN-27 à 31.
 *
 * CE TABLEAU N'EST PAS UN SOLDE. Une dîme n'appartient pas à l'église qui la
 * collecte : ce qu'on lit ici répond à « combien avons-nous recueilli, et
 * remis ? », jamais à « de combien disposons-nous ? ». Aucune carte de solde
 * n'y figure, et c'est délibéré — les deux se ressemblant, un trésorier
 * engagerait une dépense sur un argent qui ne lui appartient pas.
 *
 * LE DÉTAIL SE REPLIE, IL NE DISPARAÎT PAS (EF-FIN-28). Une collecte saisie en
 * mode détaillé garde ses versements après le passage en mode global : masquer
 * ce détail effacerait des reçus que des croyants détiennent.
 */
export function DimesClient({
  collectes,
  entites,
  devise,
  modes,
  croyants,
  croyantsTronques,
  enveloppes,
  photos,
  porteurs,
}: {
  collectes: CollecteListe[];
  entites: OptionEntite[];
  devise: string;
  /** EF-FIN-28 — le mode DÉCIDÉ par chaque entité ; `null` = défaut. */
  modes: Record<string, ModeDime | null>;
  croyants: CroyantOption[];
  /** Le périmètre dépasse le plafond : la liste proposée est une tranche. */
  croyantsTronques: boolean;
  /** Numéro d'enveloppe connu de chaque croyant, pour ne pas le retaper. */
  enveloppes: Record<string, string>;
  /** Cle de stockage -> URL signee, signees en lot par la page (EF-CRO-09). */
  photos: Record<string, string>;
  /** N° d'enveloppe -> ceux qui l'ont déjà portée (EF-FIN-27). */
  porteurs: Record<string, { croyantId: string; nom: string; prenom: string }[]>;
}) {
  const [recherche, setRecherche] = useState('');
  const [aRemettre, setARemettre] = useState(false);
  const [deplies, setDeplies] = useState<Set<string>>(new Set());

  const aujourdhui = new Date().toISOString().slice(0, 10);

  const visibles = useMemo(() => {
    const terme = normaliserRecherche(recherche);

    return collectes.filter((c) => {
      // Non remise : `dime_remise_id` vide. C'est ce qui reste à porter au
      // Siège, et le seul filtre dont un trésorier a réellement besoin.
      if (aRemettre && c.dime_remise_id !== null) return false;
      if (!terme) return true;

      return normaliserRecherche(
        `${c.collecteur?.nom ?? ''} ${c.libelle ?? ''} ${c.reference ?? ''}`,
      ).includes(terme);
    });
  }, [collectes, recherche, aRemettre]);

  /**
   * Ce qui attend d'être porté au Siège, et depuis quand.
   *
   * Le retard se CONSTATE : refuser une remise tardive empêcherait de
   * régulariser, exactement l'inverse du but (EF-FIN-30).
   */
  const enAttente = useMemo(() => {
    const lignes = collectes.filter((c) => c.dime_remise_id === null);
    return {
      nombre: lignes.length,
      montant: lignes.reduce((s, c) => s + Number(c.montant), 0),
      retards: lignes.filter((c) => estEnRetard(c.date_operation, aujourdhui)).length,
    };
  }, [collectes, aujourdhui]);

  const basculer = (id: string) =>
    setDeplies((d) => {
      const suivant = new Set(d);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  return (
    <div className="space-y-4">
      {/*
        EF-FIN-30 — ce qui reste à remettre, dit avant tout le reste. C'est la
        seule question qu'un trésorier se pose en ouvrant cet écran.
      */}
      {enAttente.nombre > 0 && (
        <div className="border-border bg-muted/40 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <Truck className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-sm">
              <span className="font-medium">
                {formatNombre(enAttente.nombre)} collecte
                {enAttente.nombre > 1 ? 's' : ''} à remettre au Siège
              </span>{' '}
              <span className="tabular-nums">
                — {formatMontant(enAttente.montant, devise)}
              </span>
              {enAttente.retards > 0 && (
                <span className="text-destructive block text-xs">
                  dont {formatNombre(enAttente.retards)} au-delà de la semaine suivant
                  le culte.
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* EF-FIN-30 — la remise se decide LA, sous le rappel de ce qui
                reste a porter : c'est la seule question que ce bandeau pose. */}
            <RemiseDialog
              collectes={collectes
                .filter((c) => c.dime_remise_id === null && c.entite_collecte_id)
                .map((c) => ({
                  id: c.id,
                  entiteId: c.entite_collecte_id!,
                  entiteNom: c.collecteur?.nom ?? '—',
                  dateOperation: c.date_operation,
                  montant: Number(c.montant),
                }))}
              porteurs={croyants.map((c) => ({
                id: c.id,
                nom: c.nom,
                prenom: c.prenom,
                matricule: c.matricule,
                photoKey: c.photoKey,
                detail: c.egliseNom,
              }))}
              photos={photos}
              devise={devise}
            />

            <CollecteDialog
              entites={entites}
              devise={devise}
              modes={modes}
              croyants={croyants}
              croyantsTronques={croyantsTronques}
              enveloppes={enveloppes}
              photos={photos}
              porteurs={porteurs}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search
            className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Entité, libellé, référence…"
            className="h-10 pl-9"
            aria-label="Rechercher une collecte"
          />
        </div>

        <GroupeFiltres libelle="Remise">
          <FiltreIcone
            icone={Truck}
            libelle="À remettre"
            actif={aRemettre}
            onClick={() => setARemettre((v) => !v)}
          />
        </GroupeFiltres>

        {enAttente.nombre === 0 && (
          <CollecteDialog
            entites={entites}
            devise={devise}
            modes={modes}
            croyants={croyants}
            croyantsTronques={croyantsTronques}
            enveloppes={enveloppes}
            photos={photos}
            porteurs={porteurs}
          />
        )}
      </div>

      {visibles.length === 0 ? (
        <EmptyState
          icon={Coins}
          title="Aucune collecte"
          description={
            collectes.length === 0
              ? 'Enregistrez la première collecte de dîmes de votre entité.'
              : 'Aucune collecte ne correspond à ces filtres.'
          }
        />
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead className="w-28">Date</TableHead>
                <TableHead>Entité</TableHead>
                <TableHead>Événement</TableHead>
                <TableHead className="w-24 text-right">Versements</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="w-32">Remise</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {visibles.map((c) => {
                const detail = detailConsultable(c.versements.length);
                const ouvert = deplies.has(c.id);
                const retard =
                  c.dime_remise_id === null && estEnRetard(c.date_operation, aujourdhui);

                return (
                  <Fragment key={c.id}>
                    {/*
                      LA LIGNE PARENTE RESTE BLANCHE.

                      `TableRow` porte `has-aria-expanded:bg-muted/50`, qui
                      réagit à la PRÉSENCE de l'attribut et non à sa valeur : le
                      bouton qui déplie en porte un, donc la ligne était grisée
                      en permanence — et le détail, lui, paraissait plus clair
                      que son parent. L'inverse de ce qu'on veut lire.
                    */}
                    <TableRow className="has-aria-expanded:bg-transparent">
                      <TableCell>
                        {detail && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => basculer(c.id)}
                            aria-label={ouvert ? 'Replier le détail' : 'Déplier le détail'}
                            aria-expanded={ouvert}
                          >
                            {ouvert ? (
                              <ChevronDown className="size-4" aria-hidden />
                            ) : (
                              <ChevronRight className="size-4" aria-hidden />
                            )}
                          </Button>
                        )}
                      </TableCell>

                      <TableCell className="text-xs tabular-nums">
                        {formatDate(c.date_operation)}
                      </TableCell>

                      <TableCell className="text-sm">{c.collecteur?.nom ?? '—'}</TableCell>

                      <TableCell className="text-sm">
                        {c.dime_evenement ? LIBELLES_EVENEMENT[c.dime_evenement] : '—'}
                        {c.libelle && (
                          <span className="text-muted-foreground block text-xs">
                            {c.libelle}
                          </span>
                        )}
                      </TableCell>

                      {/*
                        LE NOMBRE EST LE BOUTON. Le chevron seul, dans une
                        colonne étroite à l'autre bout de la ligne, ne se
                        remarquait pas : on voyait « 2 » sans savoir qu'il
                        s'ouvrait. C'est le chiffre qu'on regarde quand on veut
                        le détail — c'est donc lui qu'il faut pouvoir viser.
                      */}
                      <TableCell className="text-right text-sm tabular-nums">
                        {detail ? (
                          <button
                            type="button"
                            onClick={() => basculer(c.id)}
                            className="cursor-pointer hover:underline"
                            aria-expanded={ouvert}
                          >
                            {formatNombre(c.versements.length)}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">global</span>
                        )}
                      </TableCell>

                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                        {formatMontant(Number(c.montant), devise)}
                      </TableCell>

                      <TableCell>
                        {c.dime_remise_id ? (
                          <StatusBadge tone="success">Remise</StatusBadge>
                        ) : retard ? (
                          <StatusBadge tone="danger">En retard</StatusBadge>
                        ) : (
                          <StatusBadge tone="warning">À remettre</StatusBadge>
                        )}
                      </TableCell>
                    </TableRow>

                    {/*
                      Le détail se replie, il ne disparaît pas : ces reçus sont
                      entre les mains de croyants qui peuvent en demander la
                      trace (EF-FIN-31).
                    */}
                    {/* Le DÉTAIL est teinté, lui : c'est ce qui le rattache
                        visuellement à la ligne qui l'ouvre. */}
                    {ouvert && detail && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell />
                        <TableCell colSpan={6} className="py-4">
                          <ul className="divide-border divide-y">
                            {c.versements.map((v) => (
                              <li
                                key={v.id}
                                className="flex flex-wrap items-center justify-between gap-4 py-2"
                              >
                                <span className="text-sm">
                                  {v.croyant ? (
                                    `${v.croyant.nom.toLocaleUpperCase('fr')} ${v.croyant.prenom}`
                                  ) : (
                                    /* Un anonyme n'a pas de nom : le DIRE vaut
                                       mieux qu'un tiret, qui se lit comme une
                                       donnée manquante — donc comme un oubli
                                       de saisie. */
                                    <span className="text-muted-foreground italic">
                                      {LIBELLES_NATURE[v.nature]}
                                    </span>
                                  )}
                                  {v.enveloppe_numero && (
                                    <span className="text-muted-foreground ml-2 font-mono text-xs">
                                      enveloppe {v.enveloppe_numero}
                                    </span>
                                  )}
                                </span>
                                <span className="flex items-center gap-4">
                                  {/* EF-FIN-33 — un anonyme n'ouvre aucun reçu :
                                      il n'y a personne à qui le remettre. */}
                                  <span className="text-muted-foreground font-mono text-xs">
                                    {v.recu_numero ?? '—'}
                                  </span>
                                  <span className="text-sm tabular-nums">
                                    {formatMontant(Number(v.montant), devise)}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
