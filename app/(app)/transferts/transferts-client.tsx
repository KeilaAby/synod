'use client';

import {
  ArrowRight,
  ArrowRightLeft,
  Ban,
  CircleCheck,
  CircleSlash,
  Clock,
  FileText,
  Inbox,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { avertir } from '@/components/shared/messages';
import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import { EmptyState } from '@/components/shared/empty-state';
import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { useSession } from '@/components/shared/session-provider';
import { StatusBadge } from '@/components/shared/status-badge';
import { imprimerAttestation } from '@/components/transferts/imprimer-attestation';
import { TransfertDetail } from '@/components/transferts/transfert-detail';
import { TypeBadge } from '@/components/structure/type-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { annulerTransfert } from '@/lib/actions/transferts';
import type { TransfertListe } from '@/lib/data/transferts';
import { nomComplet, normaliserRecherche } from '@/lib/domain/croyant';
import {
  LIBELLES_STATUT_TRANSFERT,
  PERMISSION_APPROBATION,
  PERMISSION_ATTESTATION,
  type StatutTransfert,
  transfertAttestable,
} from '@/lib/domain/transfert';
import { formatDate, formatNombre } from '@/lib/utils/format';

import { DecisionDialog } from './decision-dialog';

/**
 * File d'attente et journal des transferts — EF-TRF-07, EF-TRF-08.
 *
 * La FILE n'est pas une liste à part : c'est le journal restreint à ce que
 * l'utilisateur peut réellement trancher (RG-12). L'écrire deux fois aurait
 * fait diverger la règle de compétence de son affichage.
 *
 * Filtrage instantané en mémoire, comme les autres listes de l'application.
 */

const TONS: Record<StatutTransfert, 'success' | 'warning' | 'danger' | 'neutral' | 'accent'> = {
  DEMANDE: 'warning',
  APPROUVE: 'accent',
  EFFECTUE: 'success',
  REFUSE: 'danger',
  ANNULE: 'neutral',
};

export function TransfertsClient({
  transferts,
  organisation,
}: {
  transferts: TransfertListe[];
  /** EF-TRF-08 — l'en-tete de l'attestation. Lu a chaque rendu (regle 21). */
  organisation: string;
}) {
  const router = useRouter();
  const { peut, session } = useSession();

  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState<StatutTransfert | 'tous'>('tous');
  const [aDecider, setADecider] = useState<TransfertListe | null>(null);
  const [aConsulter, setAConsulter] = useState<TransfertListe | null>(null);
  const [enCours, demarrer] = useTransition();

  const rechercheDifferee = useDeferredValue(recherche);

  /** RG-12 — la compétence se juge sur l'ancêtre commun figé à la demande. */
  const peutDecider = useMemo(
    () => (t: TransfertListe) =>
      t.statut === 'DEMANDE' &&
      t.arbitre !== null &&
      peut(PERMISSION_APPROBATION, t.arbitre.path),
    [peut],
  );

  /**
   * EF-TRF-08 — QUI PEUT ATTESTER, ET DE QUOI.
   *
   * Deux conditions, et la première n'est pas un droit : le transfert doit
   * avoir ABOUTI. Attester d'une demande en attente ferait circuler un papier
   * qui affirme ce qui n'est pas encore décidé.
   *
   * La portée est celle de l'entité d'ACCUEIL : c'est elle qui reçoit le
   * croyant, c'est donc elle qui délivre le document qu'il présentera. À
   * défaut, l'origine — un transfert dont la destination échappe au périmètre
   * reste attestable par celui qui l'a laissé partir.
   */
  const peutAttester = useMemo(
    () => (t: TransfertListe) => {
      if (!transfertAttestable(t.statut)) return false;
      const portee = t.destination?.path ?? t.origine?.path;
      return portee ? peut(PERMISSION_ATTESTATION, portee) : false;
    },
    [peut],
  );

  function attester(t: TransfertListe) {
    imprimerAttestation({
      reference: t.id.slice(0, 8).toLocaleUpperCase('fr'),
      nom: t.croyant?.nom ?? '',
      prenom: t.croyant?.prenom ?? '',
      matricule: t.croyant?.matricule ?? '',
      origine: t.origine?.nom ?? '—',
      destination: t.destination?.nom ?? '—',
      celluleOrigine: t.celluleOrigine?.nom ?? null,
      celluleDestination: t.celluleDestination?.nom ?? null,
      dateDemande: t.date_demande,
      dateDecision: t.date_decision,
      dateEffet: t.date_effet,
      motif: t.motif,
      organisation,
      // L'entité qui délivre est celle d'ACCUEIL : c'est elle qui reçoit.
      entiteEmettrice: t.destination?.nom ?? t.origine?.nom ?? '—',
      decideur: t.decideur?.nom_complet ?? null,
    });
  }

  const aDeciderParMoi = useMemo(
    () => transferts.filter(peutDecider),
    [transferts, peutDecider],
  );

  const filtres = useMemo(() => {
    const terme = normaliserRecherche(rechercheDifferee);

    return transferts.filter((t) => {
      if (statut !== 'tous' && t.statut !== statut) return false;
      if (!terme) return true;

      const texte = normaliserRecherche(
        [
          t.croyant ? nomComplet(t.croyant.nom, t.croyant.prenom) : '',
          t.croyant?.matricule ?? '',
          t.origine?.nom ?? '',
          t.destination?.nom ?? '',
        ].join(' '),
      );
      return terme.split(' ').every((mot) => texte.includes(mot));
    });
  }, [transferts, rechercheDifferee, statut]);

  const comptes = useMemo(() => {
    const c = { DEMANDE: 0, APPROUVE: 0, EFFECTUE: 0, REFUSE: 0, ANNULE: 0 };
    for (const t of transferts) c[t.statut] += 1;
    return c;
  }, [transferts]);

  function retirer(t: TransfertListe) {
    demarrer(async () => {
      const resultat = await annulerTransfert({ id: t.id });
      if (!resultat.ok) {
        avertir(resultat.error);
        return;
      }
      toast.success('Demande retirée.');
      router.refresh();
    });
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-8">
        {/* --- File d'attente : ce que JE peux trancher --- */}
        {aDeciderParMoi.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Inbox className="size-4 text-amber-600" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">
                {formatNombre(aDeciderParMoi.length)} demande
                {aDeciderParMoi.length > 1 ? 's' : ''} à trancher
              </h2>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {aDeciderParMoi.map((t) => (
                <Card key={t.id} className="border-l-4 border-l-amber-500">
                  <CardContent className="space-y-4 p-6">
                    <div className="flex items-start gap-3">
                      {t.croyant && (
                        <AvatarCroyant
                          nom={t.croyant.nom}
                          prenom={t.croyant.prenom}
                          taille="md"
                        />
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <Link
                          href={`/croyants/${t.croyant_id}`}
                          className="block truncate font-medium text-foreground transition-colors hover:text-indigo-700"
                        >
                          {t.croyant
                            ? nomComplet(t.croyant.nom, t.croyant.prenom)
                            : 'Croyant'}
                        </Link>
                        <p className="font-mono text-xs text-muted-foreground">
                          {t.croyant?.matricule}
                        </p>
                      </div>
                      <TypeBadge type={t.niveau_transfert} />
                    </div>

                    <Trajet transfert={t} />

                    {t.motif && (
                      <p className="rounded-md bg-slate-50 p-3 text-sm text-muted-foreground">
                        « {t.motif} »
                      </p>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Demandé le {formatDate(t.date_demande)}
                      {t.demandeur ? ` par ${t.demandeur.nom_complet}` : ''}
                    </p>

                    <div className="flex justify-end gap-2 border-t border-border pt-4">
                      <Button
                        variant="outline"
                        className="h-10"
                        onClick={() => setADecider(t)}
                      >
                        Décider
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* --- Journal complet --- */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="relative">
              <Search
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Croyant, matricule, église…"
                aria-label="Rechercher un transfert"
                className="h-10 w-72 pl-9"
              />
            </div>

            <GroupeFiltres libelle="Filtrer par statut">
              <FiltreIcone
                icone={Clock}
                libelle={LIBELLES_STATUT_TRANSFERT.DEMANDE}
                badge={formatNombre(comptes.DEMANDE)}
                actif={statut === 'DEMANDE'}
                classeActive="bg-amber-100 text-amber-700"
                onClick={() => setStatut(statut === 'DEMANDE' ? 'tous' : 'DEMANDE')}
              />
              <FiltreIcone
                icone={CircleCheck}
                libelle={LIBELLES_STATUT_TRANSFERT.EFFECTUE}
                badge={formatNombre(comptes.EFFECTUE)}
                actif={statut === 'EFFECTUE'}
                classeActive="bg-emerald-100 text-emerald-700"
                onClick={() => setStatut(statut === 'EFFECTUE' ? 'tous' : 'EFFECTUE')}
              />
              <FiltreIcone
                icone={CircleSlash}
                libelle={LIBELLES_STATUT_TRANSFERT.REFUSE}
                badge={formatNombre(comptes.REFUSE)}
                actif={statut === 'REFUSE'}
                classeActive="bg-rose-100 text-rose-700"
                onClick={() => setStatut(statut === 'REFUSE' ? 'tous' : 'REFUSE')}
              />
              <FiltreIcone
                icone={Ban}
                libelle={LIBELLES_STATUT_TRANSFERT.ANNULE}
                badge={formatNombre(comptes.ANNULE)}
                actif={statut === 'ANNULE'}
                classeActive="bg-slate-200 text-slate-700"
                onClick={() => setStatut(statut === 'ANNULE' ? 'tous' : 'ANNULE')}
              />
            </GroupeFiltres>

            {(recherche !== '' || statut !== 'tous') && (
              <Button
                variant="ghost"
                className="h-10"
                onClick={() => {
                  setRecherche('');
                  setStatut('tous');
                }}
              >
                <X className="mr-2 size-4" aria-hidden />
                Effacer
              </Button>
            )}

            <span
              className="ml-auto font-mono text-xs tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              {formatNombre(filtres.length)} / {formatNombre(transferts.length)}
            </span>
          </div>

          {filtres.length === 0 ? (
            <EmptyState
              icon={ArrowRightLeft}
              title={
                transferts.length === 0
                  ? 'Aucun transfert enregistré'
                  : 'Aucun transfert ne correspond'
              }
              description={
                transferts.length === 0
                  ? "Une demande se lance depuis la fiche d'un croyant, ou depuis le menu de la liste."
                  : 'Élargissez les filtres.'
              }
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Croyant</TableHead>
                      <TableHead>Trajet</TableHead>
                      <TableHead>Niveau</TableHead>
                      <TableHead>Demande</TableHead>
                      <TableHead>Décision</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filtres.map((t) => (
                      <TableRow key={t.id} className="h-12">
                        <TableCell>
                          <Link
                            href={`/croyants/${t.croyant_id}`}
                            className="flex items-center gap-3 font-medium text-foreground transition-colors hover:text-indigo-700"
                          >
                            {t.croyant && (
                              <AvatarCroyant nom={t.croyant.nom} prenom={t.croyant.prenom} />
                            )}
                            <span className="truncate">
                              {t.croyant
                                ? nomComplet(t.croyant.nom, t.croyant.prenom)
                                : '—'}
                            </span>
                          </Link>
                        </TableCell>

                        <TableCell className="text-xs text-muted-foreground">
                          <Trajet transfert={t} compact />
                        </TableCell>

                        <TableCell>
                          <TypeBadge type={t.niveau_transfert} />
                        </TableCell>

                        {/* EF-TRF-06 — qui, et quand : le dossier doit repondre
                            sans qu'on ait a l'ouvrir. */}
                        <TableCell>
                          <Horodatage
                            date={t.date_demande}
                            auteur={t.demandeur?.nom_complet}
                          />
                        </TableCell>

                        <TableCell>
                          {t.date_decision ? (
                            <Horodatage
                              date={t.date_decision}
                              auteur={t.decideur?.nom_complet}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              En attente
                            </span>
                          )}
                        </TableCell>

                        <TableCell>
                          <StatusBadge tone={TONS[t.statut]}>
                            {LIBELLES_STATUT_TRANSFERT[t.statut]}
                          </StatusBadge>
                        </TableCell>

                        <TableCell className="text-right">
                          {/*
                            EF-TRF-08 — L'ATTESTATION, ET SEULEMENT SUR UN
                            TRANSFERT ABOUTI.

                            Une demande en attente ou refusée n'a rien produit :
                            en délivrer le papier ferait circuler un document
                            qui affirme un transfert qui n'a pas eu lieu — et
                            personne, en le lisant, ne saurait qu'il ne vaut
                            rien.

                            Le bouton précède l'action principale sans la
                            remplacer : attester n'est pas décider, et le droit
                            est distinct (`transfer.certify`).
                          */}
                          {peutAttester(t) && (
                            <Button
                              variant="ghost"
                              className="mr-1 h-8"
                              onClick={() => attester(t)}
                            >
                              <FileText className="mr-2 size-3.5" aria-hidden />
                              Attestation
                            </Button>
                          )}

                          {peutDecider(t) ? (
                            <Button
                              variant="outline"
                              className="h-8"
                              onClick={() => setADecider(t)}
                            >
                              Décider
                            </Button>
                          ) : t.statut === 'DEMANDE' &&
                            t.demandeur?.id === session.profileId ? (
                            // EF-TRF-10 — retirer sa propre demande tant qu'elle
                            // n'est pas tranchée.
                            <Button
                              variant="ghost"
                              className="h-8"
                              disabled={enCours}
                              onClick={() => retirer(t)}
                            >
                              {enCours && (
                                <Loader2 className="mr-2 size-3 animate-spin" aria-hidden />
                              )}
                              Retirer
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              className="h-8"
                              onClick={() => setAConsulter(t)}
                            >
                              Détail
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </section>

        <DecisionDialog
          transfert={aDecider}
          ouvert={aDecider !== null}
          onOuvertChange={(v) => !v && setADecider(null)}
        />

        {/* EF-TRF-08 — consulter un dossier clos, sans pouvoir le rouvrir. */}
        <Dialog
          open={aConsulter !== null}
          onOpenChange={(v) => !v && setAConsulter(null)}
        >
          <DialogContent className="max-h-[90vh] w-[min(96vw,48rem)] overflow-y-auto sm:max-w-2xl">
            {aConsulter && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-2xl">Dossier de transfert</DialogTitle>
                  <DialogDescription>
                    {aConsulter.croyant
                      ? nomComplet(aConsulter.croyant.nom, aConsulter.croyant.prenom)
                      : 'Croyant'}{' '}
                    — matricule {aConsulter.croyant?.matricule}.
                  </DialogDescription>
                </DialogHeader>

                <div className="py-2">
                  <TransfertDetail transfert={aConsulter} />
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

/** Origine → destination, cellules comprises. */
function Trajet({
  transfert,
  compact = false,
}: {
  transfert: TransfertListe;
  compact?: boolean;
}) {
  const de = transfert.origine?.nom ?? '—';
  const vers = transfert.destination?.nom ?? '—';

  return (
    <span className={compact ? 'flex items-center gap-1.5' : 'flex items-center gap-2 text-sm'}>
      <span className="truncate">
        {de}
        {transfert.celluleOrigine && !compact && (
          <span className="text-muted-foreground"> · {transfert.celluleOrigine.nom}</span>
        )}
      </span>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate font-medium">
        {vers}
        {transfert.celluleDestination && !compact && (
          <span className="font-normal text-muted-foreground">
            {' '}
            · {transfert.celluleDestination.nom}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Une date et son auteur, sur deux lignes — EF-TRF-06.
 *
 * « Le 3 juin » sans « par qui » ne repond pas a la question que l'on se pose
 * en consultant un journal : c'est toujours la responsabilite que l'on cherche.
 */
function Horodatage({ date, auteur }: { date: string; auteur?: string }) {
  return (
    <span className="block space-y-0.5">
      <span className="block font-mono text-xs tabular-nums text-foreground">
        {formatDate(date)}
      </span>
      <span className="block truncate text-xs text-muted-foreground">
        {auteur ?? 'Compte supprimé'}
      </span>
    </span>
  );
}
