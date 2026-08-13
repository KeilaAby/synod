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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { reglerWorkflowEntite } from '@/lib/actions/finances';
import type { ReglageWorkflow } from '@/lib/data/finances';
import { ENTITY_LABELS, ENTITY_TYPES, type EntityType } from '@/lib/domain/hierarchy';
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

  /**
   * UN ONGLET PAR NIVEAU.
   *
   * Un périmètre de district mêle vingt églises, six paroisses et quarante
   * cellules dans une seule liste : on y cherche « mes églises » et l'on
   * parcourt tout. Le niveau est un ensemble CLOS et connu — c'est exactement
   * ce que des onglets rendent bien (règle 18).
   *
   * Le regroupement porte sur TOUTES les lignes, jamais sur un résultat de
   * recherche : un onglet qui disparaît en cours de frappe déplace ce qu'on
   * était en train de viser, et son compteur cesse de dire combien d'entités
   * ce niveau compte.
   */
  const onglets = useMemo(() => {
    const parType = new Map<EntityType, LigneReglage[]>();
    for (const ligne of lignes) {
      const liste = parType.get(ligne.type) ?? [];
      liste.push(ligne);
      parType.set(ligne.type, liste);
    }

    return ENTITY_TYPES.filter((type) => parType.has(type)).map((type) => ({
      type,
      libelle: ENTITY_LABELS[type].pluriel,
      entites: parType.get(type)!.sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    }));
  }, [lignes]);

  const [ongletActif, setOngletActif] = useState<string>('');
  const actif = ongletActif || onglets[0]?.type || '';

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

            <p className="text-muted-foreground text-sm">
              <span className="font-mono tabular-nums">{comptes.actives}</span> entité
              {comptes.actives > 1 ? 's' : ''} sur{' '}
              <span className="font-mono tabular-nums">{comptes.total}</span> en
              validation.
            </p>

            {comptes.total === 0 ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <AlertCircle className="size-4" aria-hidden />
                Aucune entité dans votre périmètre.
              </p>
            ) : (
              <Tabs value={actif} onValueChange={setOngletActif}>
                {/*
                  `variant="line"` : le trait sous l'onglet actif, et rien
                  d'autre — pas de pastille, pas de fond. Le filet qui court
                  sous toute la rangée est ce qui donne à ce trait sa place.
                */}
                <TabsList
                  variant="line"
                  className="border-border h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b p-0"
                >
                  {onglets.map((onglet) => (
                    /*
                      Le trait de l'onglet actif POSE SUR le filet gris, sans
                      interstice : `after:bottom-0` l'aligne sur le bord bas du
                      déclencheur, que `p-0` sur la liste fait coïncider avec la
                      bordure. Les deux classes reprennent le préfixe de variante
                      du composant partagé — sans lui, elles s'ajouteraient aux
                      siennes au lieu de les remplacer.
                    */
                    <TabsTrigger
                      key={onglet.type}
                      value={onglet.type}
                      className="group-data-horizontal/tabs:after:bottom-0 group-data-horizontal/tabs:after:h-[3px] flex-none px-1 pt-1 pb-3 text-sm"
                    >
                      {onglet.libelle}
                      {/* Le nombre d'entités DU NIVEAU, pas des résultats : il
                          ne bouge pas quand on tape. */}
                      <span className="text-muted-foreground ml-2 font-mono text-xs tabular-nums">
                        {onglet.entites.length}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>

                {onglets.map((onglet) => (
                  <TabsContent key={onglet.type} value={onglet.type} className="mt-4">
                    <PanneauNiveau
                      onglet={onglet}
                      etat={etat}
                      defautOrganisation={defautOrganisation}
                      enCours={enCours}
                      surChoix={choisir}
                    />
                  </TabsContent>
                ))}
              </Tabs>
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

/**
 * Le contenu d'un onglet : sa recherche et sa liste.
 *
 * DEUX CHOSES Y SONT TENUES.
 *
 * La recherche est PROPRE AU NIVEAU. Partagée, taper « Antananarivo » depuis
 * les Régionaux vidait aussi les Églises, et l'on changeait d'onglet pour
 * tomber sur une liste filtrée par une question qu'on ne posait plus.
 *
 * La liste a une HAUTEUR FIXE — cinq lignes — et défile au-delà. Sans cela, la
 * fenêtre grandissait et rétrécissait à chaque changement d'onglet et à chaque
 * frappe : les onglets se déplaçaient sous le curseur, et le bouton « Fermer »
 * avec eux. Une fenêtre qui bouge pendant qu'on la lit se lit deux fois.
 */
function PanneauNiveau({
  onglet,
  etat,
  defautOrganisation,
  enCours,
  surChoix,
}: {
  onglet: { type: EntityType; libelle: string; entites: LigneReglage[] };
  etat: Record<string, boolean | null>;
  defautOrganisation: boolean;
  enCours: string | null;
  surChoix: (entiteId: string, actif: boolean | null) => void;
}) {
  const [recherche, setRecherche] = useState('');

  // Filtre en MÉMOIRE : le périmètre est déjà chargé, un aller-retour par
  // frappe coûterait plus que tout le reste de l'écran (règle 17).
  const visibles = useMemo(() => {
    const terme = normaliserRecherche(recherche);
    if (!terme) return onglet.entites;
    return onglet.entites.filter((l) =>
      normaliserRecherche(`${l.nom} ${l.code}`).includes(terme),
    );
  }, [onglet.entites, recherche]);

  return (
    <div className="space-y-4">
      <Input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder={`Rechercher parmi ${onglet.entites.length} ${onglet.libelle.toLocaleLowerCase('fr')}…`}
        className="h-9 w-full sm:w-72"
        aria-label={`Rechercher parmi les ${onglet.libelle.toLocaleLowerCase('fr')}`}
      />

      {/*
        `h-[22rem]` tient cinq lignes, et la hauteur ne dépend donc plus du
        contenu. La barre de défilement est RENDUE VISIBLE : une liste qui
        défile sans que rien ne l'annonce paraît s'arrêter à la cinquième —
        même correctif que dans le sélecteur d'entité.
      */}
      <div className="border-border h-[22rem] overflow-y-auto rounded-lg border [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar]:block [&::-webkit-scrollbar]:w-2">
        {visibles.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">
            Aucun résultat parmi les {onglet.libelle.toLocaleLowerCase('fr')}.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {visibles.map((ligne) => (
              <LigneEntite
                key={ligne.entiteId}
                ligne={ligne}
                decide={etat[ligne.entiteId] ?? null}
                defautOrganisation={defautOrganisation}
                enCours={enCours === ligne.entiteId}
                verrouille={enCours !== null}
                surChoix={surChoix}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Une entité et son réglage.
 *
 * Extraite pour que basculer d'onglet ne redessine pas les cinquante autres :
 * un périmètre de district en compte facilement soixante-dix, et chacune porte
 * trois boutons.
 */
function LigneEntite({
  ligne,
  decide,
  defautOrganisation,
  enCours,
  verrouille,
  surChoix,
}: {
  ligne: LigneReglage;
  decide: boolean | null;
  defautOrganisation: boolean;
  enCours: boolean;
  verrouille: boolean;
  surChoix: (entiteId: string, actif: boolean | null) => void;
}) {
  const effectif = decide ?? defautOrganisation;

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 p-4">
      <span className="flex min-w-0 items-center gap-3">
        <TypeBadge type={ligne.type} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{ligne.nom}</span>
          <span className="text-muted-foreground font-mono text-xs">{ligne.code}</span>
        </span>
        {effectif && <StatusBadge tone="accent">Validation requise</StatusBadge>}
      </span>

      <span className="flex items-center gap-2">
        {enCours && (
          <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden />
        )}

        {/* Ensemble CLOS et connu : trois pictogrammes, pas un sélecteur
            (règle 18). */}
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
                onClick={() => surChoix(ligne.entiteId, choix.actif)}
                aria-pressed={retenu}
                disabled={verrouille}
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
}
