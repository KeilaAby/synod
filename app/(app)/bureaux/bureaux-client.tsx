'use client';

import { Briefcase, CircleCheck, CircleSlash, Search, X } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';

import { BureauComposition } from '@/components/bureaux/bureau-composition';
import type { CandidatOption } from '@/components/bureaux/designation-dialog';
import { MandatDialog } from '@/components/bureaux/mandat-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
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
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';
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

  /** Noms des bureaux déjà ouverts, par entité — pilote l'avertissement. */
  const bureauxActifsParEntite = useMemo(() => {
    const table: Record<string, string[]> = {};
    for (const b of bureaux) {
      if (!b.is_active) continue;
      (table[b.entity_id] ??= []).push(b.libelle);
    }
    return table;
  }, [bureaux]);

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
                    <button
                      type="button"
                      onClick={() => setOuvert(bureau)}
                      className="w-full space-y-3 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 space-y-1">
                          <span className="text-foreground block truncate text-sm font-semibold transition-colors hover:text-indigo-700">
                            {bureau.libelle}
                          </span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {bureau.entite?.nom}
                          </span>
                        </span>
                        {bureau.entite && <TypeBadge type={bureau.entite.type} />}
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
                    </button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

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
