'use client';

import { AlertCircle, Check, Loader2, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { avertir } from '@/components/shared/messages';
import { PermissionGate } from '@/components/shared/permission-gate';
import { StatusBadge } from '@/components/shared/status-badge';
import { TypeBadge } from '@/components/structure/type-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { reglerWorkflowEntite } from '@/lib/actions/finances';
import type { ReglageWorkflow } from '@/lib/data/finances';
import type { EntityType } from '@/lib/domain/hierarchy';
import { normaliserRecherche } from '@/lib/domain/croyant';
import { cn } from '@/lib/utils';

/**
 * Réglage du workflow de validation, entité par entité — EF-FIN-15 (adapté).
 *
 * UNE LISTE, PAS UN INTERRUPTEUR PAR ÉCRAN. Le réglage est per-entité : le
 * poser depuis la fiche de chaque entité obligerait à ouvrir cinquante écrans
 * pour répondre à « lesquelles de mes églises valident ? ». La question est de
 * comparaison, la réponse doit l'être aussi.
 *
 * AUCUN HÉRITAGE. « Par défaut » ne veut pas dire « comme mon parent » mais
 * « comme l'organisation » : chaque entité a son bureau, et chaque bureau gère
 * ses finances — la hiérarchie ne fait que les consulter. C'est écrit à
 * l'écran, parce qu'un arbre affiché en colonne suggère l'inverse.
 */

export interface LigneReglage extends ReglageWorkflow {
  readonly nom: string;
  readonly code: string;
  readonly type: EntityType;
  readonly niveau: number;
}

type Choix = 'defaut' | 'actif' | 'inactif';

const CHOIX: readonly { valeur: Choix; libelle: string; actif: boolean | null }[] = [
  { valeur: 'defaut', libelle: 'Par défaut', actif: null },
  { valeur: 'actif', libelle: 'Actif', actif: true },
  { valeur: 'inactif', libelle: 'Inactif', actif: false },
];

function choixDe(decide: boolean | null): Choix {
  return decide === null ? 'defaut' : decide ? 'actif' : 'inactif';
}

export function WorkflowDialog({
  lignes,
  defautOrganisation,
}: {
  lignes: LigneReglage[];
  defautOrganisation: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);

  /**
   * L'état local suit les réglages déjà écrits.
   *
   * Chaque changement part immédiatement — il n'y a rien à « valider » : le
   * réglage EST l'action. Un bouton « Enregistrer » aurait fait croire qu'on
   * peut tout régler puis tout perdre en fermant la fenêtre.
   */
  const [etat, setEtat] = useState<Record<string, boolean | null>>(() =>
    Object.fromEntries(lignes.map((l) => [l.entiteId, l.decide])),
  );

  // Filtre en MÉMOIRE : le périmètre est déjà chargé, un aller-retour par
  // frappe coûterait plus que tout le reste de l'écran (règle 17).
  const visibles = useMemo(() => {
    const terme = normaliserRecherche(recherche);
    if (!terme) return lignes;
    return lignes.filter((l) =>
      normaliserRecherche(`${l.nom} ${l.code}`).includes(terme),
    );
  }, [lignes, recherche]);

  const comptes = useMemo(() => {
    const valeurs = lignes.map((l) => etat[l.entiteId] ?? defautOrganisation);
    return {
      actives: valeurs.filter(Boolean).length,
      total: lignes.length,
    };
  }, [lignes, etat, defautOrganisation]);

  async function choisir(entiteId: string, actif: boolean | null) {
    const precedent = etat[entiteId] ?? null;
    if (precedent === actif) return;

    // Optimiste : le contrôle répond tout de suite, et l'on revient en arrière
    // si le serveur refuse. Sur une liaison à 0,5–4 s, attendre la réponse
    // rendrait le réglage d'une liste de cinquante entités interminable.
    setEtat((e) => ({ ...e, [entiteId]: actif }));
    setEnCours(entiteId);

    const resultat = await reglerWorkflowEntite({ entiteId, actif });

    setEnCours(null);

    if (!resultat.ok) {
      setEtat((e) => ({ ...e, [entiteId]: precedent }));
      avertir(resultat.error, { ton: 'refus', titre: 'Réglage refusé' });
      return;
    }

    router.refresh();
  }

  return (
    <>
      <PermissionGate perm="settings.manage">
        <Button variant="outline" className="h-10" onClick={() => setOuvert(true)}>
          <SlidersHorizontal className="mr-2 size-4" aria-hidden />
          Workflow de validation
        </Button>
      </PermissionGate>

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="max-h-[92vh] w-[min(96vw,56rem)] overflow-x-hidden overflow-y-auto sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="text-2xl">Workflow de validation</DialogTitle>
            <DialogDescription>
              Actif, une écriture suit « Brouillon → Soumis → Validé » et seules les
              validées alimentent le solde. Inactif, une saisie compte immédiatement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/*
              Dit noir sur blanc ce qu'un arbre en colonne laisse croire :
              « Par défaut » ne veut pas dire « comme mon parent ».
            */}
            <div className="border-border bg-muted/40 flex items-start gap-3 rounded-lg border p-4">
              <ShieldCheck
                className="text-muted-foreground mt-0.5 size-4 shrink-0"
                aria-hidden
              />
              <p className="text-muted-foreground text-xs">
                Chaque entité décide <span className="text-foreground">pour elle seule</span> :
                un district n’impose rien à ses églises, il consulte leurs finances.
                « Par défaut » suit le réglage de l’organisation — actuellement{' '}
                <span className="text-foreground font-medium">
                  {defautOrganisation ? 'actif' : 'inactif'}
                </span>{' '}
                — et non celui du parent.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-muted-foreground text-sm">
                <span className="font-mono tabular-nums">{comptes.actives}</span> entité
                {comptes.actives > 1 ? 's' : ''} sur{' '}
                <span className="font-mono tabular-nums">{comptes.total}</span> en
                validation.
              </p>

              <Input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher une entité…"
                className="h-9 w-full sm:w-64"
                aria-label="Rechercher une entité"
              />
            </div>

            <ul className="border-border divide-border divide-y rounded-lg border">
              {visibles.length === 0 && (
                <li className="text-muted-foreground p-6 text-center text-sm">
                  Aucune entité ne correspond.
                </li>
              )}

              {visibles.map((ligne) => {
                const decide = etat[ligne.entiteId] ?? null;
                const effectif = decide ?? defautOrganisation;

                return (
                  <li
                    key={ligne.entiteId}
                    className="flex flex-wrap items-center justify-between gap-4 p-4"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <TypeBadge type={ligne.type} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {ligne.nom}
                        </span>
                        <span className="text-muted-foreground font-mono text-xs">
                          {ligne.code}
                        </span>
                      </span>
                      {effectif && (
                        <StatusBadge tone="accent">Validation requise</StatusBadge>
                      )}
                    </span>

                    <span className="flex items-center gap-2">
                      {enCours === ligne.entiteId && (
                        <Loader2
                          className="text-muted-foreground size-4 animate-spin"
                          aria-hidden
                        />
                      )}

                      {/* Ensemble CLOS et connu : trois pictogrammes, pas un
                          sélecteur (règle 18). */}
                      <span
                        className="border-border inline-flex rounded-lg border p-1"
                        role="group"
                        aria-label={`Workflow de ${ligne.nom}`}
                      >
                        {CHOIX.map((choix) => {
                          const retenu = choixDe(decide) === choix.valeur;
                          return (
                            <button
                              key={choix.valeur}
                              type="button"
                              onClick={() => choisir(ligne.entiteId, choix.actif)}
                              aria-pressed={retenu}
                              disabled={enCours !== null}
                              className={cn(
                                'inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium transition-colors',
                                retenu
                                  ? 'bg-foreground text-background'
                                  : 'text-muted-foreground hover:bg-muted',
                              )}
                            >
                              {retenu && <Check className="size-3" aria-hidden />}
                              {choix.libelle}
                            </button>
                          );
                        })}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>

            {comptes.total === 0 && (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <AlertCircle className="size-4" aria-hidden />
                Aucune entité dans votre périmètre.
              </p>
            )}
          </div>

          <DialogFooter>
            {/* Chaque choix est déjà écrit : il n'y a rien à valider ici. */}
            <Button className="h-10" onClick={() => setOuvert(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
