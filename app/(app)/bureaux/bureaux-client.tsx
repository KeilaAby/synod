'use client';

import {
  Briefcase,
  CircleCheck,
  CircleSlash,
  List,
  MoreVertical,
  Pencil,
  Search,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { BureauComposition } from '@/components/bureaux/bureau-composition';
import type { CandidatOption } from '@/components/bureaux/designation-dialog';
import {
  type BureauxActifsParEntite,
  MandatDialog,
} from '@/components/bureaux/mandat-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { OperationDialog } from '@/components/shared/operation-dialog';
import { useSession } from '@/components/shared/session-provider';
import { StatusBadge } from '@/components/shared/status-badge';
import type { OptionEntite } from '@/components/structure/entity-picker';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cloreMandat, supprimerBureau } from '@/lib/actions/bureaux';
import type { BureauComplet } from '@/lib/data/bureaux';
import {
  type FonctionBureau,
  composerBureau,
  comptePostes,
  libelleAffichage,
} from '@/lib/domain/bureau';
import { normaliserRecherche } from '@/lib/domain/croyant';
import type { EntityType } from '@/lib/domain/hierarchy';
import { formatDate, formatNombre } from '@/lib/utils/format';

/**
 * Bureaux du périmètre — EF-BUR-01, EF-BUR-07.
 *
 * Une carte par bureau, sa composition en pop-up : consulter qui est trésorier
 * ne justifie pas une navigation, et l'on revient ensuite sur un autre bureau.
 *
 * Les cartes portent le taux de remplissage, parce que c'est la première
 * question qu'on se pose devant une liste de bureaux — lequel est incomplet.
 */
export function BureauxClient({
  bureaux,
  fonctions,
  candidats,
  photos,
  entites,
}: {
  bureaux: BureauComplet[];
  fonctions: FonctionBureau[];
  candidats: CandidatOption[];
  photos: Record<string, string>;
  entites: OptionEntite[];
}) {
  const { peut } = useSession();
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [aModifier, setAModifier] = useState<BureauComplet | null>(null);
  const [aSupprimer, setASupprimer] = useState<BureauComplet | null>(null);
  /** Ce qui est en train de se faire — alimente le pop-up d'attente. */
  const [operation, setOperation] = useState<{
    titre: string;
    description: string;
  } | null>(null);

  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState<'tous' | 'actifs' | 'clos'>('actifs');
  const [ouvert, setOuvert] = useState<BureauComplet | null>(null);

  const rechercheDifferee = useDeferredValue(recherche);

  const filtres = useMemo(() => {
    const terme = normaliserRecherche(rechercheDifferee);

    return bureaux.filter((b) => {
      if (statut === 'actifs' && !b.is_active) return false;
      if (statut === 'clos' && b.is_active) return false;
      if (!terme) return true;

      const texte = normaliserRecherche(
        [b.libelle, b.entite?.nom ?? '', b.entite?.code ?? ''].join(' '),
      );
      return terme.split(' ').every((mot) => texte.includes(mot));
    });
  }, [bureaux, rechercheDifferee, statut]);

  const comptes = useMemo(
    () => ({
      actifs: bureaux.filter((b) => b.is_active).length,
      clos: bureaux.filter((b) => !b.is_active).length,
    }),
    [bureaux],
  );

  /**
   * Bureaux déjà ouverts, par entité — pilote l'avertissement de renouvellement.
   * L'identifiant accompagne le nom : en modification, le bureau doit pouvoir
   * s'exclure lui-même, sans quoi corriger son propre nom déclencherait un
   * conflit avec soi.
   */
  const bureauxActifsParEntite = useMemo(() => {
    const table: BureauxActifsParEntite = {};
    for (const b of bureaux) {
      if (!b.is_active) continue;
      (table[b.entity_id] ??= []).push({ id: b.id, libelle: b.libelle });
    }
    return table;
  }, [bureaux]);

  /**
   * `useTransition` couvre l'action ET le re-rendu serveur qui suit : c'est
   * `router.refresh()` qui prend le plus de temps, et le laisser hors du
   * transition rendrait la main avant que l'écran ne soit à jour.
   */
  function clore(bureau: BureauComplet) {
    setOperation({
      titre: 'Clôture du mandat…',
      description: `« ${bureau.libelle} » et les mandats de ses titulaires se clôturent ensemble.`,
    });
    demarrer(async () => {
      const resultat = await cloreMandat({
        bureauId: bureau.id,
        dateFin: new Date().toISOString().slice(0, 10),
      });
      if (!resultat.ok) {
        setOperation(null);
        toast.error(resultat.error);
        return;
      }
      toast.success('Mandat clos. La composition reste consultable.');
      router.refresh();
    });
  }

  function supprimer(bureau: BureauComplet) {
    setASupprimer(null);
    setOperation({
      titre: 'Suppression du bureau…',
      description: `« ${bureau.libelle} » et ses ${formatNombre(bureau.membres.length)} mandat(s) sont effacés.`,
    });
    demarrer(async () => {
      const resultat = await supprimerBureau({ bureauId: bureau.id });
      if (!resultat.ok) {
        setOperation(null);
        toast.error(resultat.error);
        return;
      }
      toast.success('Bureau supprimé, avec son historique.');
      router.refresh();
    });
  }

  /** Le mandat rouvert après un rafraîchissement doit rester celui affiché. */
  const affiche = ouvert ? (bureaux.find((b) => b.id === ouvert.id) ?? null) : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="relative">
            <Search
              className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Bureau, entité, code…"
              aria-label="Rechercher un bureau"
              className="h-10 w-72 pl-9"
            />
          </div>

          <GroupeFiltres libelle="Filtrer par statut">
            <FiltreIcone
              icone={CircleCheck}
              libelle="Mandats en cours"
              badge={formatNombre(comptes.actifs)}
              actif={statut === 'actifs'}
              classeActive="bg-emerald-100 text-emerald-700"
              onClick={() => setStatut(statut === 'actifs' ? 'tous' : 'actifs')}
            />
            <FiltreIcone
              icone={CircleSlash}
              libelle="Mandats clos"
              badge={formatNombre(comptes.clos)}
              actif={statut === 'clos'}
              classeActive="bg-slate-200 text-slate-700"
              onClick={() => setStatut(statut === 'clos' ? 'tous' : 'clos')}
            />
          </GroupeFiltres>

          {(recherche !== '' || statut !== 'actifs') && (
            <Button
              variant="ghost"
              className="h-10"
              onClick={() => {
                setRecherche('');
                setStatut('actifs');
              }}
            >
              <X className="mr-2 size-4" aria-hidden />
              Effacer
            </Button>
          )}

          <span className="ml-auto flex items-center gap-3">
            <span
              className="text-muted-foreground font-mono text-xs tabular-nums"
              aria-live="polite"
            >
              {formatNombre(filtres.length)} / {formatNombre(bureaux.length)}
            </span>
            <MandatDialog
              entites={entites}
              bureauxActifsParEntite={bureauxActifsParEntite}
            />
          </span>
        </div>

        {filtres.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title={
              bureaux.length === 0
                ? 'Aucun bureau enregistré'
                : 'Aucun bureau ne correspond'
            }
            description={
              bureaux.length === 0
                ? 'Ouvrez un bureau pour une entité de votre périmètre : vous composerez ensuite ses fonctions.'
                : 'Élargissez les filtres.'
            }
            action={
              bureaux.length === 0 ? (
                <MandatDialog
                  entites={entites}
                  bureauxActifsParEntite={bureauxActifsParEntite}
                  libelle="Ouvrir le premier bureau"
                />
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtres.map((bureau) => {
              const niveau = (bureau.entite?.type ?? 'EGLISE') as EntityType;
              const compte = comptePostes(
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
              );

              return (
                <Card
                  key={bureau.id}
                  className={
                    bureau.is_active
                      ? 'transition-colors hover:border-slate-300'
                      : 'opacity-70 transition-colors hover:border-slate-300'
                  }
                >
                  <CardContent className="space-y-4 p-6">
                    {/*
                      La carte n'est plus un bouton géant : le menu ⋮ en porte
                      un, et un bouton dans un bouton est un HTML invalide que
                      les lecteurs d'écran ne restituent pas. Seul le TITRE
                      ouvre la composition.
                    */}
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 space-y-1">
                          <button
                            type="button"
                            onClick={() => setOuvert(bureau)}
                            className="text-foreground block max-w-full truncate text-left text-sm font-semibold transition-colors hover:text-indigo-700"
                          >
                            {bureau.libelle}
                          </button>
                          <span className="text-muted-foreground block truncate text-xs">
                            {bureau.entite?.nom}
                          </span>
                        </span>

                        <span className="flex shrink-0 items-center gap-2">
                          {bureau.entite && <TypeBadge type={bureau.entite.type} />}

                          {/* Le même menu ⋮ que partout ailleurs. */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label={`Actions sur ${bureau.libelle}`}
                                className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-md transition-colors hover:bg-slate-100"
                              >
                                <MoreVertical className="size-4" aria-hidden />
                              </button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end" className="w-64">
                              <DropdownMenuItem onSelect={() => setOuvert(bureau)}>
                                <List className="mr-2 size-4" aria-hidden />
                                Voir la composition
                              </DropdownMenuItem>

                              {bureau.entite &&
                                peut('bureau.manage', bureau.entite.path) && (
                                  <>
                                    {/* Règle 16 — la modification rouvre le
                                        pop-up de création, pré-rempli. */}
                                    <DropdownMenuItem
                                      onSelect={() => setAModifier(bureau)}
                                    >
                                      <Pencil className="mr-2 size-4" aria-hidden />
                                      Modifier le bureau
                                    </DropdownMenuItem>

                                    {bureau.is_active && (
                                      <DropdownMenuItem
                                        onSelect={() => clore(bureau)}
                                        disabled={enCours}
                                      >
                                        <SquarePen className="mr-2 size-4" aria-hidden />
                                        Clore le mandat
                                        <span className="text-muted-foreground ml-auto text-xs">
                                          conserve
                                        </span>
                                      </DropdownMenuItem>
                                    )}
                                  </>
                                )}

                              {/* EF-BUR-08 — droit DISTINCT : clore conserve,
                                  supprimer efface l'historique des titulaires. */}
                              {bureau.entite &&
                                peut('bureau.delete', bureau.entite.path) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onSelect={() => setASupprimer(bureau)}
                                    >
                                      <Trash2 className="mr-2 size-4" aria-hidden />
                                      Supprimer le bureau
                                    </DropdownMenuItem>
                                  </>
                                )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={bureau.is_active ? 'success' : 'neutral'}>
                          {bureau.is_active ? 'En cours' : 'Clos'}
                        </StatusBadge>
                        {/* Le manque avant le reste : c'est ce qu'on cherche. */}
                        {compte.vacants > 0 && bureau.is_active && (
                          <StatusBadge tone="warning">
                            {formatNombre(compte.vacants)} vacant
                            {compte.vacants > 1 ? 's' : ''}
                          </StatusBadge>
                        )}
                      </div>

                      <p className="text-muted-foreground font-mono text-xs tabular-nums">
                        {formatNombre(compte.pourvus)} / {formatNombre(compte.total)} ·{' '}
                        {formatDate(bureau.date_debut)}
                        {bureau.date_fin && ` → ${formatDate(bureau.date_fin)}`}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Règle 16 — UN SEUL chemin par opération : la modification passe par
            le pop-up de création. `key` le remonte à chaque bureau, ce qui
            repart des bonnes valeurs sans effet de synchronisation. */}
        {aModifier && (
          <MandatDialog
            key={aModifier.id}
            entites={entites}
            bureauxActifsParEntite={bureauxActifsParEntite}
            bureau={{
              id: aModifier.id,
              entity_id: aModifier.entity_id,
              entite_nom: aModifier.entite?.nom ?? '—',
              libelle: aModifier.libelle,
              date_debut: aModifier.date_debut,
              date_fin: aModifier.date_fin,
            }}
            open
            onOpenChange={(v) => !v && setAModifier(null)}
          />
        )}

        {/* EF-BUR-08 — la suppression EFFACE : la confirmation doit le dire,
            et proposer la clôture qui, elle, conserve. */}
        {aSupprimer && (
          <ConfirmDialog
            open
            onOpenChange={(v) => !v && setASupprimer(null)}
            title={`Supprimer « ${aSupprimer.libelle} » ?`}
            description={
              `Ce bureau et ses ${aSupprimer.membres.length} mandat(s) seront EFFACÉS. ` +
              'Les fonctions occupées disparaîtront des fiches des croyants concernés — ' +
              'rien n’en restera dans leur historique. ' +
              'Pour conserver la trace, clôturez le mandat plutôt que de le supprimer.'
            }
            confirmLabel="Supprimer définitivement"
            onConfirm={() => supprimer(aSupprimer)}
          />
        )}

        {/* Une opération lancée depuis un menu ⋮ n'a rien pour se signaler : le
            menu se referme et l'écran redevient identique. */}
        <OperationDialog
          ouvert={enCours && operation !== null}
          titre={operation?.titre ?? ''}
          description={operation?.description}
        />

        {/* --- Composition, en pop-up --- */}
        <Dialog open={affiche !== null} onOpenChange={(v) => !v && setOuvert(null)}>
          <DialogContent className="max-h-[92vh] w-[min(96vw,72rem)] overflow-y-auto sm:max-w-5xl">
            {affiche && (
              <>
                <DialogHeader>
                  <p className="eyebrow">{affiche.entite?.nom}</p>
                  <DialogTitle className="text-2xl">
                    {libelleAffichage(
                      affiche.libelle,
                      affiche.date_debut,
                      affiche.date_fin,
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    Composition par rang protocolaire. Les fonctions vacantes restent à
                    leur rang : c&apos;est lui qui dit l&apos;importance du manque.
                  </DialogDescription>
                </DialogHeader>

                <BureauComposition
                  bureau={affiche}
                  fonctions={fonctions}
                  candidats={candidats}
                  photos={photos}
                  peutGerer={
                    affiche.entite ? peut('bureau.manage', affiche.entite.path) : false
                  }
                />
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
