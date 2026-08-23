'use client';

import {
  ChevronDown,
  ChevronRight,
  Coins,
  MoreVertical,
  Printer,
  Receipt,
  Search,
  Truck,
  UserSearch,
  UserX,
} from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  CollecteDialog,
  type CroyantOption,
} from '@/components/finances/collecte-dialog';
import { ImportVersementsDialog } from '@/components/finances/import-versements-dialog';
import { imprimerRecus } from '@/components/finances/imprimer-recus';
import { RapprocherDialog } from '@/components/finances/rapprocher-dialog';
import { RemiseDialog } from '@/components/finances/remise-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { avertir } from '@/components/shared/messages';
import { useSession } from '@/components/shared/session-provider';
import { StatusBadge } from '@/components/shared/status-badge';
import type { OptionEntite } from '@/components/structure/entity-picker';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { marquerEnveloppeAnonyme } from '@/lib/actions/dimes';
import type { CollecteListe } from '@/lib/data/dimes';
import { normaliserRecherche } from '@/lib/domain/croyant';
import {
  LIBELLES_EVENEMENT,
  LIBELLES_NATURE,
  type ModeDime,
  type OptionEvenementDime,
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
  evenements,
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
  evenements?: OptionEvenementDime[];
}) {
  const { peut } = useSession();
  const router = useRouter();
  const [recherche, setRecherche] = useState('');
  const [aRemettre, setARemettre] = useState(false);
  const [deplies, setDeplies] = useState<Set<string>>(new Set());
  /** La ligne qu'on est en train de rapprocher, ou `null` — EF-FIN-34. */
  const [aRapprocher, setARapprocher] = useState<{
    id: string;
    nom_source: string;
    prenom_source: string | null;
    enveloppe_source: string | null;
  } | null>(null);
  /**
   * L'entité pour laquelle on ajoute UN versement individuel, ou `null` —
   * demande du 20 août 2026. Un seul pop-up partagé (règle 16), piloté par
   * cette ligne plutôt qu'un par collecte.
   */
  const [aAjouter, setAAjouter] = useState<{ id: string; nom: string } | null>(null);
  /** La ligne qu'on s'apprête à déclarer anonyme — EF-FIN-34, migration 0072. */
  const [aAnonymiser, setAAnonymiser] = useState<string | null>(null);

  const aujourdhui = new Date().toISOString().slice(0, 10);

  const mapEvenements = useMemo(() => {
    const map: Record<string, string> = { ...LIBELLES_EVENEMENT };
    if (evenements) {
      for (const e of evenements) {
        map[e.code] = e.libelle;
      }
    }
    return map;
  }, [evenements]);

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

  /**
   * Les versements d'une collecte qui ouvrent un reçu — EF-FIN-33.
   *
   * C'est `recu_numero` qui fait foi, pas la nature ni la fiche : la base est
   * seule à l'attribuer, et elle ne l'attribue qu'à ce qui a un destinataire.
   *
   * UN NOM SUFFIT — IL N'EST PAS BESOIN D'UNE FICHE. Le fichier portait
   * « KABORE Windyam », aucune fiche ne le reconnaît : la personne existe
   * quand même, elle a donné, et elle attend son talon. Ce qui manque est un
   * enregistrement administratif, pas une identité. Lui refuser son reçu le
   * temps qu'on ouvre sa fiche ferait porter à un donateur le délai de notre
   * propre travail.
   *
   * Le matricule, lui, reste vide : il n'existe pas encore, et en inventer un
   * sur un papier qui fait foi serait pire que son absence.
   */
  const recusDe = (c: CollecteListe) =>
    c.versements
      .filter((v) => v.recu_numero && (v.croyant || v.rapprochement?.[0]?.nom_source))
      .map((v) => ({
        reference: v.recu_numero!,
        nom: v.croyant?.nom ?? v.rapprochement[0]!.nom_source,
        prenom: v.croyant?.prenom ?? (v.rapprochement[0]?.prenom_source ?? ''),
        matricule: v.croyant?.matricule ?? '',
        enveloppe: v.enveloppe_numero ?? (v.rapprochement[0]?.enveloppe_source ?? null),
        montant: Number(v.montant),
        // La cérémonie est celle de la collecte : ici, toutes les lignes la
        // partagent — mais c'est le TICKET qui la porte, pas le lot.
        entite: c.collecteur?.nom ?? '—',
        dateOperation: c.date_operation,
        evenement: c.dime_evenement ? mapEvenements[c.dime_evenement] : null,
      }));

  const basculer = (id: string) =>
    setDeplies((d) => {
      const suivant = new Set(d);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  async function anonymiser() {
    if (!aAnonymiser) return;

    const resultat = await marquerEnveloppeAnonyme({ rapprochementId: aAnonymiser });

    if (!resultat.ok) {
      avertir(resultat.error);
      return;
    }
    toast.success('Enveloppe déclarée anonyme. Elle ne reste plus en attente.');
    router.refresh();
  }

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

            <ImportVersementsDialog 
              entites={entites} 
              evenementsDisponibles={evenements}
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
              evenementsDisponibles={evenements}
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
          <ImportVersementsDialog 
            entites={entites} 
            evenementsDisponibles={evenements}
          />
        )}

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
            evenementsDisponibles={evenements}
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
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
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
                        {c.dime_evenement
                          ? (mapEvenements[c.dime_evenement] ?? c.dime_evenement)
                          : '—'}
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

                      {/*
                        EF-FIN-30 — LA RÉFÉRENCE DU BORDEREAU, pas un simple
                        badge. « Remise » ne dit ni quand, ni par qui, ni sous
                        quel numéro : c'est pourtant ce qu'on cherche quand on
                        rapproche un versement du papier que le Siège détient.
                      */}
                      <TableCell>
                        {c.remise ? (
                          <span className="block space-y-0.5">
                            <StatusBadge tone="success">Remise</StatusBadge>
                            <span className="text-muted-foreground block font-mono text-xs">
                              {c.remise.reference}
                            </span>
                            <span className="text-muted-foreground block text-xs">
                              {formatDate(c.remise.date_remise)}
                              {c.remise.porteur &&
                                ` · ${c.remise.porteur.nom.toLocaleUpperCase('fr')} ${c.remise.porteur.prenom}`}
                            </span>
                            {c.remise.observation && (
                              <span className="text-muted-foreground block text-xs italic">
                                {c.remise.observation}
                              </span>
                            )}
                          </span>
                        ) : retard ? (
                          <StatusBadge tone="danger">En retard</StatusBadge>
                        ) : (
                          <StatusBadge tone="warning">À remettre</StatusBadge>
                        )}
                      </TableCell>

                      {/*
                        EF-FIN-34, demande du 20 août 2026 — un versement
                        individuel, entité VERROUILLÉE sur celle de la ligne :
                        même principe que l'enregistrement d'un croyant depuis
                        le menu ⋮ de la structure, où le rattachement est
                        imposé (règle 16).
                      */}
                      <TableCell className="text-right">
                        {c.entite_collecte_id && peut('finance.dime.collect', c.entite_collecte_id) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label={`Actions sur la collecte de ${c.collecteur?.nom ?? 'cette entité'}`}
                              >
                                <MoreVertical className="size-4" aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={() =>
                                  setAAjouter({
                                    id: c.entite_collecte_id!,
                                    nom: c.collecteur?.nom ?? '—',
                                  })
                                }
                              >
                                <Coins className="mr-2 size-4" aria-hidden />
                                Nouveau versement
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
                        <TableCell colSpan={7} className="py-4">
                          {/*
                            EF-FIN-27 — LE TALON S'IMPRIME.

                            Le reçu existe déjà, la base l'a numéroté à la
                            collecte : ce qui manquait, c'est le papier. Sa
                            référence se recopiait à la main, et une référence
                            recopiée est une référence fausse un jour sur dix.

                            Le bouton est ICI, sous le détail, parce que c'est
                            le détail qu'on imprime — une collecte globale ou
                            entièrement anonyme n'ouvre aucun reçu (EF-FIN-33).

                            CELUI-CI EST LE LOT : la feuille A4 qu'on découpe
                            après le culte. Le ticket de caisse, lui, se
                            déclenche ligne par ligne — c'est un geste qu'on
                            fait devant quelqu'un.
                          */}
                          <div className="mb-3 flex justify-end">
                            <Button
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() => imprimerRecus(recusDe(c), devise)}
                            >
                              <Printer className="mr-2 size-3.5" aria-hidden />
                              Imprimer les reçus (A4)
                            </Button>
                          </div>

                          <ul className="divide-border divide-y">
                            {c.versements.map((v) => {
                              // PostgREST rend un tableau pour cette relation
                              // inverse, même quand il n'y a qu'une ligne.
                              const rappr = v.rapprochement?.[0] ?? null;

                              /**
                               * L'ENVELOPPE HABITUELLE, quand le versement n'en
                               * portait pas.
                               *
                               * Quelqu'un dont l'enveloppe est connue donne
                               * parfois sans rien écrire dessus : la ligne
                               * arrive nue, et il faut ouvrir sa fiche pour
                               * retrouver un numéro que la base connaît déjà.
                               *
                               * Elle s'affiche donc, mais PAS comme les autres :
                               * « habituelle » dit que ce numéro vient de la
                               * fiche et non du versement. Les confondre ferait
                               * croire que l'enveloppe a été présentée, et
                               * fausserait un rapprochement fait plus tard.
                               */
                              const habituelle =
                                !v.enveloppe_numero && v.croyant_id
                                  ? (enveloppes[v.croyant_id] ?? null)
                                  : null;

                              /**
                               * Rapprochable : la ligne attend une identité, et
                               * personne ne la lui a encore donnée. Une ligne
                               * résolue garde son rapprochement — c'est la
                               * trace de ce que le fichier disait — mais il n'y
                               * a plus rien à y faire.
                               *
                               * `resolu_le`, PAS `croyant_id` (migration 0072) :
                               * une enveloppe basculée en anonyme ferme la
                               * ligne SANS jamais lui donner de croyant, et
                               * `croyant_id === null` resterait vrai pour
                               * toujours.
                               */
                              const rapprochable = rappr !== null && rappr.resolu_le === null;

                              /**
                               * EF-FIN-34, migration 0072 — le porteur d'une
                               * enveloppe reste introuvable : l'église peut
                               * renoncer plutôt que de laisser la ligne trainer
                               * indéfiniment. Réservé aux lignes SANS nom lu :
                               * un nom lu mérite d'abord la recherche.
                               */
                              const anonymisable =
                                rapprochable &&
                                !rappr.nom_source &&
                                Boolean(v.enveloppe_numero);

                              /**
                               * IMPRIMABLE DÈS QU'IL Y A UN NOM, fiche ou pas.
                               *
                               * La personne a donné et on sait qui elle est ;
                               * ce qui manque est son enregistrement, pas son
                               * identité. Lui refuser son talon le temps qu'on
                               * ouvre sa fiche lui ferait porter le délai de
                               * notre propre travail.
                               */
                              const imprimable = Boolean(
                                v.recu_numero && (v.croyant || rappr?.nom_source),
                              );

                              return (
                              <li
                                key={v.id}
                                className="flex flex-wrap items-center justify-between gap-4 py-2"
                              >
                                <span className="text-sm">
                                  {v.croyant ? (
                                    `${v.croyant.nom.toLocaleUpperCase('fr')} ${v.croyant.prenom}`
                                  ) : rappr?.nom_source ? (
                                    /* Ce que le fichier disait, et qu'aucune
                                       fiche n'a reconnu : le taire ferait lire
                                       « anonyme » là où un nom a bien été lu. */
                                    <span className="text-muted-foreground italic">
                                      {rappr.nom_source}
                                      {rappr.prenom_source && ` ${rappr.prenom_source}`}
                                      {' — à rapprocher'}
                                    </span>
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
                                  {habituelle && (
                                    <span className="text-muted-foreground/70 ml-2 font-mono text-xs">
                                      enveloppe {habituelle}
                                      <span className="ml-1 font-sans italic">
                                        (habituelle)
                                      </span>
                                    </span>
                                  )}
                                  {/*
                                    EF-FIN-34, migration 0072 — CE QUE LE
                                    FICHIER DISAIT DE L'ÉGLISE, même quand
                                    rien ne l'a reconnue : c'est elle qui
                                    permet d'associer la personne à la bonne
                                    église sans deviner, la seule raison
                                    d'être de cette colonne (`0058`).
                                  */}
                                  {rappr?.eglise_source && (
                                    <span className="text-muted-foreground block text-xs">
                                      {rappr.eglise_source}
                                      {!rappr.eglise_id && (
                                        <span className="ml-1 italic">
                                          — église non reconnue
                                        </span>
                                      )}
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

                                  {/*
                                    UN MENU, ET NON DEUX BOUTONS CÔTE À CÔTE.

                                    La ligne porte déjà deux nombres et un
                                    numéro de reçu ; y poser « Ticket » ET
                                    « Rapprocher » l'aurait rendue illisible
                                    sur les collectes de cent versements — et
                                    ces deux actions ne se présentent presque
                                    jamais ensemble : l'une suppose un reçu
                                    émis, l'autre une identité manquante.

                                    L'emplacement est RÉSERVÉ même quand le
                                    menu est vide : sans cela, les montants
                                    d'une liste mêlant nominatifs et anonymes
                                    ne s'aligneraient plus d'une ligne à
                                    l'autre.
                                  */}
                                  <span className="flex w-10 justify-end">
                                    {(imprimable || rapprochable) && (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            className="size-8 p-0"
                                            aria-label={
                                              v.croyant
                                                ? `Actions pour ${v.croyant.nom} ${v.croyant.prenom}`
                                                : 'Actions pour ce versement'
                                            }
                                          >
                                            <MoreVertical className="size-4" aria-hidden />
                                          </Button>
                                        </DropdownMenuTrigger>

                                        <DropdownMenuContent align="end" className="w-auto">
                                          {/*
                                            EF-FIN-27 — LE TICKET DE CAISSE, un
                                            reçu à la fois. C'est le geste qu'on
                                            fait devant quelqu'un : le croyant
                                            vient réclamer son talon, on le sort
                                            et on le lui tend. Imprimer la
                                            feuille entière pour une personne
                                            gâcherait sept talons.
                                          */}
                                          {imprimable && (
                                            <DropdownMenuItem
                                              onSelect={() =>
                                                imprimerRecus(
                                                  recusDe(c).filter(
                                                    (r) => r.reference === v.recu_numero,
                                                  ),
                                                  devise,
                                                  'CAISSE',
                                                )
                                              }
                                            >
                                              <Receipt className="mr-2 size-4" aria-hidden />
                                              Ticket
                                            </DropdownMenuItem>
                                          )}

                                          {/*
                                            EF-FIN-34 — RAPPROCHER SANS CHANGER
                                            D'ÉCRAN. On constate ici qu'une
                                            enveloppe n'a pas de nom ; l'envoyer
                                            dans `/croyants` pour un seul geste
                                            ferait perdre la collecte qu'on est
                                            en train de lire.

                                            L'entrée n'apparaît QUE si le
                                            rapprochement est encore ouvert :
                                            proposer une action déjà faite
                                            ferait douter de ce qui l'a été.
                                          */}
                                          {rapprochable && (
                                            <DropdownMenuItem
                                              onSelect={() => setARapprocher(rappr)}
                                            >
                                              <UserSearch
                                                className="mr-2 size-4"
                                                aria-hidden
                                              />
                                              Rapprocher
                                            </DropdownMenuItem>
                                          )}

                                          {/*
                                            EF-FIN-34, migration 0072 — LE
                                            PORTEUR RESTE INTROUVABLE. L'argent
                                            est déjà compté (nature
                                            ENVELOPPE_ANONYME dès l'import) ;
                                            ce geste ferme seulement la ligne
                                            qui attendait un nom, pour qu'elle
                                            cesse de trainer indéfiniment.
                                          */}
                                          {anonymisable && (
                                            <DropdownMenuItem
                                              onSelect={() => setAAnonymiser(rappr.id)}
                                            >
                                              <UserX className="mr-2 size-4" aria-hidden />
                                              Marquer anonyme
                                            </DropdownMenuItem>
                                          )}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                  </span>
                                </span>
                              </li>
                              );
                            })}
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

      {/*
        UN SEUL POP-UP pour tout l'écran, piloté par la ligne retenue (règle
        16) : un par versement en monterait autant que la collecte en compte,
        tous invisibles. Il vit hors du tableau, sinon replier une collecte
        pendant le rapprochement le démonterait.
      */}
      <RapprocherDialog
        rapprochement={aRapprocher}
        croyants={croyants.map((c) => ({
          id: c.id,
          nom: c.nom,
          prenom: c.prenom,
          matricule: c.matricule,
          photoKey: c.photoKey,
          detail: c.egliseNom,
        }))}
        photos={photos}
        porteurs={porteurs}
        open={aRapprocher !== null}
        onOpenChange={(ouvert) => {
          if (!ouvert) setARapprocher(null);
        }}
      />

      {/*
        UN VERSEMENT INDIVIDUEL, entité VERROUILLÉE — demande du 20 août 2026.
        Même `CollecteDialog` que « Nouvelle collecte » (règle 16) : piloté
        ici, il ne rend pas son propre bouton et reçoit l'entité de la ligne
        d'où le geste est parti.
      */}
      <CollecteDialog
        entites={entites}
        devise={devise}
        modes={modes}
        croyants={croyants}
        croyantsTronques={croyantsTronques}
        enveloppes={enveloppes}
        photos={photos}
        porteurs={porteurs}
        evenementsDisponibles={evenements}
        entiteImposee={aAjouter ?? undefined}
        open={aAjouter !== null}
        onOpenChange={(ouvert) => {
          if (!ouvert) setAAjouter(null);
        }}
      />

      {/*
        EF-FIN-34, migration 0072 — la ligne ne revient pas dans la file une
        fois fermée : une confirmation, comme pour clore ou supprimer.
      */}
      <ConfirmDialog
        open={aAnonymiser !== null}
        onOpenChange={(v) => !v && setAAnonymiser(null)}
        title="Déclarer cette enveloppe anonyme ?"
        description="Le montant reste compté, mais la ligne ne demandera plus de nom : personne ne pourra plus s’en voir attribuer le reçu."
        confirmLabel="Déclarer anonyme"
        onConfirm={anonymiser}
      />
    </div>
  );
}
