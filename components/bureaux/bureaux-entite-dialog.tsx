'use client';

import { AlertCircle, ArrowLeft, Briefcase, ListChecks, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { TableSkeleton } from '@/components/skeletons';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CompositionEntite } from '@/lib/actions/bureaux';
import type { BureauComplet } from '@/lib/data/bureaux';
import { type FonctionBureau, composerBureau, libelleAffichage } from '@/lib/domain/bureau';
import { nomComplet } from '@/lib/domain/croyant';
import type { EntityType } from '@/lib/domain/hierarchy';
import { formatNombre } from '@/lib/utils/format';

import { BureauComposition } from './bureau-composition';

/**
 * Bureaux d'une entité, depuis la structure — EF-BUR-03, EF-BUR-04, EF-STR-04.
 *
 * Deux vues dans UN pop-up, parce qu'on passe sans cesse de l'une à l'autre :
 *
 *   · la LISTE des titulaires — photo, nom, grade, fonction. C'est la réponse à
 *     « qui siège au bureau de cette paroisse ? », et elle ne demande aucun
 *     droit d'écriture ;
 *   · la COMPOSITION par rang, qui montre aussi les fonctions vacantes et
 *     permet de désigner.
 *
 * Un bureau sans titulaire s'ouvre directement sur la composition : une liste
 * vide n'apprend rien, et la seule chose à y faire est d'y nommer quelqu'un.
 *
 * Le composant est PRÉSENTATIONNEL : les données lui arrivent chargées, ou
 * `null` tant qu'elles ne le sont pas. Les charger ici demanderait un effet, là
 * où l'appelant sait déjà, au clic, ce qu'il veut afficher.
 */
export function BureauxEntiteDialog({
  entite,
  contexte,
  erreur,
  bureauInitial,
  peutGerer,
  ouvert,
  onOuvertChange,
  onRafraichir,
  joursDelai,
}: {
  entite: { id: string; nom: string };
  /** `null` tant que le chargement n'a pas abouti — squelette à l'écran. */
  contexte: CompositionEntite | null;
  erreur: string | null;
  /** Bureau à composer d'emblée : sortie de création, ou bureau sans titulaire. */
  bureauInitial?: string;
  peutGerer: boolean;
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
  /** Les données viennent d'une action, pas de la page : à recharger nous-mêmes. */
  onRafraichir: () => void;
  /** EF-BUR-08 — délai de correction, réglé dans « Corrections de saisie ». */
  joursDelai: number;
}) {
  /**
   * TROIS états, et non deux : `undefined` signifie « l'utilisateur n'a pas
   * encore choisi », auquel cas c'est l'appelant qui décide via `bureauInitial`.
   * Avec un simple `string | null` initialisé au montage, le bureau à composer
   * — qui n'est connu qu'une fois les données arrivées — n'aurait plus aucun
   * moyen de s'imposer.
   */
  const [choix, setChoix] = useState<string | null | undefined>(undefined);
  const cible = choix === undefined ? (bureauInitial ?? null) : choix;

  const actifs = (contexte?.bureaux ?? []).filter((b) => b.is_active);
  const clos = (contexte?.bureaux ?? []).length - actifs.length;
  const compose = cible
    ? (contexte?.bureaux.find((b) => b.id === cible) ?? null)
    : null;

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,72rem)] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <p className="eyebrow">{entite.nom}</p>
          <DialogTitle className="text-2xl">
            {compose ? compose.libelle : 'Bureaux de cette entité'}
          </DialogTitle>
          <DialogDescription>
            {compose
              ? libelleAffichage(compose.libelle, compose.date_debut, compose.date_fin)
              : 'RG-10 — une entité peut avoir plusieurs bureaux, mais un seul mandat en cours par nom.'}
          </DialogDescription>
        </DialogHeader>

        {erreur && (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="size-4" aria-hidden />
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}

        {/* Règle 4 — un chargement de DONNÉES prend un squelette, jamais un
            spinner : la forme de ce qui arrive est déjà connue. */}
        {!contexte && !erreur && (
          <TableSkeleton lignes={4} colonnes={3} avecEntete={false} avecFiltres={false} />
        )}

        {contexte && compose && (
          <div className="space-y-6">
            {actifs.length > 1 && (
              <Button
                variant="ghost"
                className="-ml-2 h-9"
                onClick={() => setChoix(null)}
              >
                <ArrowLeft className="mr-2 size-4" aria-hidden />
                Tous les bureaux de {entite.nom}
              </Button>
            )}

            <BureauComposition
              bureau={compose}
              fonctions={contexte.fonctions}
              candidats={contexte.candidats}
              photos={contexte.photos}
              peutGerer={peutGerer}
              onChange={onRafraichir}
              joursDelai={joursDelai}
            />
          </div>
        )}

        {contexte && !compose && (
          <div className="space-y-8">
            {actifs.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="Aucun bureau en cours"
                description="Ouvrez un bureau pour cette entité : vous composerez ensuite ses fonctions."
              />
            ) : (
              actifs.map((bureau) => (
                <SectionBureau
                  key={bureau.id}
                  bureau={bureau}
                  fonctions={contexte.fonctions}
                  photos={contexte.photos}
                  peutGerer={peutGerer}
                  onComposer={() => setChoix(bureau.id)}
                />
              ))
            )}

            {clos > 0 && (
              <p className="text-muted-foreground text-xs">
                {formatNombre(clos)} mandat{clos > 1 ? 's' : ''} clos pour cette entité —
                consultable{clos > 1 ? 's' : ''} depuis l&apos;écran{' '}
                <Link href="/bureaux" className="underline">
                  Bureaux
                </Link>
                .
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Les titulaires d'un bureau, par RANG PROTOCOLAIRE.
 *
 * L'ordre vient de `composerBureau`, la même fonction que la vue composition :
 * deux tris écrits séparément placeraient le trésorier à deux rangs différents
 * selon l'écran d'où on le regarde. Seules les fonctions POURVUES sont
 * retenues — les vacantes appartiennent à la composition, pas à une liste de
 * personnes.
 */
function SectionBureau({
  bureau,
  fonctions,
  photos,
  peutGerer,
  onComposer,
}: {
  bureau: BureauComplet;
  fonctions: FonctionBureau[];
  photos: Record<string, string>;
  peutGerer: boolean;
  onComposer: () => void;
}) {
  const titulaires = useMemo(() => {
    const parId = new Map(bureau.membres.map((m) => [m.id, m]));

    return composerBureau(
      fonctions,
      bureau.membres.map((m) => ({
        id: m.id,
        croyantId: m.croyant_id,
        fonctionId: m.fonction_id,
        dateDebut: m.date_debut,
        dateFin: m.date_fin,
      })),
      (bureau.entite?.type ?? 'EGLISE') as EntityType,
    )
      .filter((poste) => poste.mandat !== null)
      .map((poste) => ({
        fonction: poste.fonction,
        membre: parId.get(poste.mandat!.id)!,
      }))
      .filter((ligne) => ligne.membre !== undefined);
  }, [bureau.membres, bureau.entite?.type, fonctions]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-foreground text-sm font-semibold">{bureau.libelle}</h3>
        <StatusBadge tone="success">En cours</StatusBadge>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {formatNombre(titulaires.length)} titulaire{titulaires.length > 1 ? 's' : ''}
        </span>

        <Button variant="outline" className="ml-auto h-9" onClick={onComposer}>
          {peutGerer ? (
            <UserPlus className="mr-2 size-4" aria-hidden />
          ) : (
            <ListChecks className="mr-2 size-4" aria-hidden />
          )}
          {peutGerer ? 'Composer' : 'Voir les fonctions'}
        </Button>
      </div>

      {titulaires.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-6 text-sm">
            Ce bureau n&apos;a encore aucun titulaire. « Composer » liste les fonctions
            applicables à ce niveau, par rang protocolaire.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nom et prénom</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Fonction</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {titulaires.map(({ fonction, membre }) => {
                  const croyant = membre.croyant;

                  return (
                    <TableRow key={membre.id} className="h-14">
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
                          <span className="text-muted-foreground text-sm">
                            Croyant introuvable
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="text-muted-foreground text-sm">
                        {croyant?.grade?.libelle ?? '—'}
                      </TableCell>

                      <TableCell className="text-sm">
                        <span className="flex flex-wrap items-center gap-2">
                          {fonction.libelle}
                          {/* RG-31 — ce qui fait un « membre de finances ». */}
                          {fonction.estFinanciere && (
                            <StatusBadge tone="accent">Finances</StatusBadge>
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
