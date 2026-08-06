'use client';

import dagre from '@dagrejs/dagre';
import {
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
} from '@xyflow/react';
import { Loader2, Maximize2, Minimize2, Move, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useSession } from '@/components/shared/session-provider';
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
import { rattacherEntite, supprimerEntite } from '@/lib/actions/entities';
import {
  ENTITY_LABELS,
  type EntityType,
  validerDeplacement,
} from '@/lib/domain/hierarchy';
import { formatNombre } from '@/lib/utils/format';

import { EntityCreateDialog, type ParentCible } from './entity-create-dialog';
import { NoeudEntite } from './entity-node';

import '@xyflow/react/dist/style.css';

/**
 * Editeur d'organigramme — EF-STR-04, EF-STR-05, EF-STR-07, EF-STR-01.
 *
 * Trois gestes de restructuration, tous ramenes a la meme action serveur :
 *   1. glisser un noeud sur un autre        -> rattachement
 *   2. tirer un trait d'un parent vers un enfant -> rattachement
 *   3. menu du noeud                        -> creation, edition, suppression
 *
 * RG-01 est verifiee AVANT que le geste n'aboutisse (`validerDeplacement`,
 * partagee avec le serveur) : une cible invalide est refusee avec sa raison,
 * jamais silencieusement ignoree.
 *
 * Charge en differe par `entity-flow-loader` (~120 ko, ENF-PRF-09, UI-18).
 */

export interface EntiteFlux {
  id: string;
  nom: string;
  code: string;
  type: EntityType;
  parent_id: string | null;
  path: string;
  niveau: number;
  nbDescendants: number;
  nbEnfants: number;
  sans_acces_application: boolean;
  is_active: boolean;
}

/** Grille de 8px, jusque dans la disposition du graphe (UI-01). */
const LARGEUR_NOEUD = 224; // w-56
const HAUTEUR_NOEUD = 168;
const ESPACEMENT_FRERES = 40;
const ESPACEMENT_NIVEAUX = 80;

const SEUIL_REPLI_AUTO = 40;
const PROFONDEUR_VISIBLE_PAR_DEFAUT = 2;

const TYPES_NOEUDS = { entite: NoeudEntite };

const MINIMAP_COULEURS: Record<EntityType, string> = {
  SIEGE: '#0f172a',
  REGIONAL: '#6366f1',
  DISTRICT: '#0ea5e9',
  PAROISSE: '#14b8a6',
  EGLISE: '#f59e0b',
  CELLULE: '#94a3b8',
};

function disposer(noeuds: Node[], aretes: Edge[]): Node[] {
  const graphe = new dagre.graphlib.Graph();
  graphe.setDefaultEdgeLabel(() => ({}));
  graphe.setGraph({
    rankdir: 'TB',
    nodesep: ESPACEMENT_FRERES,
    ranksep: ESPACEMENT_NIVEAUX,
    marginx: 32,
    marginy: 32,
  });

  for (const noeud of noeuds) {
    graphe.setNode(noeud.id, { width: LARGEUR_NOEUD, height: HAUTEUR_NOEUD });
  }
  for (const arete of aretes) {
    graphe.setEdge(arete.source, arete.target);
  }

  dagre.layout(graphe);

  return noeuds.map((noeud) => {
    const position = graphe.node(noeud.id);
    return {
      ...noeud,
      // Dagre positionne au CENTRE, React Flow au coin superieur gauche.
      position: {
        x: position.x - LARGEUR_NOEUD / 2,
        y: position.y - HAUTEUR_NOEUD / 2,
      },
    };
  });
}

interface Deplacement {
  enfant: EntiteFlux;
  nouveauParent: EntiteFlux;
}

function Organigramme({ entites }: { entites: EntiteFlux[] }) {
  const router = useRouter();
  const { fitView, setCenter, getNode, getIntersectingNodes } = useReactFlow();
  const { peut } = useSession();

  const [recherche, setRecherche] = useState('');
  const [enCours, demarrer] = useTransition();

  const [parentPourCreation, setParentPourCreation] = useState<ParentCible | null>(null);
  const [aSupprimer, setASupprimer] = useState<EntiteFlux | null>(null);
  const [deplacement, setDeplacement] = useState<Deplacement | null>(null);

  const [replies, setReplies] = useState<Set<string>>(() => {
    if (entites.length <= SEUIL_REPLI_AUTO) return new Set();
    const profondeurMin = Math.min(...entites.map((e) => e.niveau));
    return new Set(
      entites
        .filter(
          (e) =>
            e.niveau - profondeurMin >= PROFONDEUR_VISIBLE_PAR_DEFAUT - 1 && e.nbEnfants > 0,
        )
        .map((e) => e.id),
    );
  });

  const parId = useMemo(() => new Map(entites.map((e) => [e.id, e])), [entites]);

  // --- Actions du menu de noeud ---------------------------------------------

  const basculerRepli = useCallback((id: string) => {
    setReplies((precedent) => {
      const suivant = new Set(precedent);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  }, []);

  const ouvrirFiche = useCallback((id: string) => router.push(`/structure/${id}`), [router]);
  const modifier = useCallback(
    (id: string) => router.push(`/structure/${id}/modifier`),
    [router],
  );

  const creerEnfant = useCallback(
    (id: string) => {
      const entite = parId.get(id);
      if (entite) {
        setParentPourCreation({
          id: entite.id,
          nom: entite.nom,
          code: entite.code,
          type: entite.type,
        });
      }
    },
    [parId],
  );

  const demanderSuppression = useCallback(
    (id: string) => {
      const entite = parId.get(id);
      if (entite) setASupprimer(entite);
    },
    [parId],
  );

  // --- Construction du graphe ------------------------------------------------

  const graphe = useMemo(() => {
    /** Une entite est masquee si l'un de ses ANCETRES est replie. */
    const estMasquee = (entite: EntiteFlux): boolean => {
      let parent = entite.parent_id ? parId.get(entite.parent_id) : undefined;
      while (parent) {
        if (replies.has(parent.id)) return true;
        parent = parent.parent_id ? parId.get(parent.parent_id) : undefined;
      }
      return false;
    };

    const visibles = entites.filter((e) => !estMasquee(e));
    const idsVisibles = new Set(visibles.map((e) => e.id));

    const noeuds: Node[] = visibles.map((e) => ({
      id: e.id,
      type: 'entite',
      position: { x: 0, y: 0 },
      data: {
        nom: e.nom,
        code: e.code,
        type: e.type,
        nbDescendants: e.nbDescendants,
        nbEnfants: e.nbEnfants,
        sansAcces: e.sans_acces_application,
        actif: e.is_active,
        replie: replies.has(e.id),
        peutModifier: peut('entity.update', e.path),
        surReplier: basculerRepli,
        surOuvrir: ouvrirFiche,
        surCreerEnfant: creerEnfant,
        surModifier: modifier,
        surSupprimer: demanderSuppression,
      },
    }));

    const aretes: Edge[] = visibles
      .filter((e) => e.parent_id && idsVisibles.has(e.parent_id))
      .map((e) => ({
        id: `${e.parent_id}-${e.id}`,
        source: e.parent_id!,
        target: e.id,
        type: 'smoothstep',
        style: { stroke: '#cbd5e1', strokeWidth: 1.5 },
      }));

    return { noeuds: disposer(noeuds, aretes), aretes };
  }, [
    entites,
    replies,
    parId,
    peut,
    basculerRepli,
    ouvrirFiche,
    creerEnfant,
    modifier,
    demanderSuppression,
  ]);

  /**
   * Positions locales : le glissement doit etre visible pendant le geste, mais
   * la disposition Dagre reprend la main des que la structure change.
   *
   * L'ajustement se fait EN RENDU plutot que dans un effet — un effet
   * declencherait un second rendu et un scintillement du graphe.
   */
  const [signature, setSignature] = useState<string | null>(null);
  const [noeuds, setNoeuds] = useState<Node[]>(graphe.noeuds);

  const signatureCourante = useMemo(
    () => graphe.noeuds.map((n) => n.id).join('|'),
    [graphe.noeuds],
  );

  if (signature !== signatureCourante) {
    setSignature(signatureCourante);
    setNoeuds(graphe.noeuds);
  }

  const surChangementNoeuds = useCallback(
    (changements: NodeChange[]) => setNoeuds((n) => applyNodeChanges(changements, n)),
    [],
  );

  // --- Rattachement ----------------------------------------------------------

  /** Valide puis, si c'est recevable, ouvre la confirmation. */
  const proposerDeplacement = useCallback(
    (idEnfant: string, idParent: string): boolean => {
      const enfant = parId.get(idEnfant);
      const nouveauParent = parId.get(idParent);
      if (!enfant || !nouveauParent) return false;

      const verdict = validerDeplacement(
        {
          id: enfant.id,
          nom: enfant.nom,
          type: enfant.type,
          path: enfant.path,
          parentId: enfant.parent_id,
        },
        {
          id: nouveauParent.id,
          nom: nouveauParent.nom,
          type: nouveauParent.type,
          path: nouveauParent.path,
          parentId: nouveauParent.parent_id,
        },
      );

      if (!verdict.ok) {
        toast.error(verdict.error);
        return false;
      }

      if (
        !peut('entity.update', enfant.path) ||
        !peut('entity.update', nouveauParent.path)
      ) {
        toast.error(
          'Un deplacement modifie l origine ET la destination : votre habilitation doit couvrir les deux.',
        );
        return false;
      }

      setDeplacement({ enfant, nouveauParent });
      return true;
    },
    [parId, peut],
  );

  /** Glisser-deposer : on lache un noeud sur un autre pour le rattacher. */
  const surFinGlissement = useCallback(
    // React Flow transmet l'evenement DOM natif, pas un evenement synthetique.
    (_evenement: MouseEvent | TouchEvent, noeud: Node) => {
      const cibles = getIntersectingNodes(noeud).filter((n) => n.id !== noeud.id);

      if (cibles.length === 0) {
        // Repose ailleurs : on remet la disposition calculee.
        setNoeuds(graphe.noeuds);
        return;
      }

      // La cible la plus proche du centre du noeud lache.
      const cible = cibles[0]!;
      if (!proposerDeplacement(noeud.id, cible.id)) {
        setNoeuds(graphe.noeuds);
      }
    },
    [getIntersectingNodes, graphe.noeuds, proposerDeplacement],
  );

  /** Trait tire d'une poignee de parent vers une poignee d'enfant. */
  const surConnexion = useCallback(
    (connexion: Connection) => {
      if (!connexion.source || !connexion.target) return;
      proposerDeplacement(connexion.target, connexion.source);
    },
    [proposerDeplacement],
  );

  /** Ecarte les cibles invalides AVANT le relachement : le trait ne s'accroche pas. */
  const connexionValide = useCallback(
    (connexion: Connection | Edge) => {
      const source = connexion.source ? parId.get(connexion.source) : undefined;
      const target = connexion.target ? parId.get(connexion.target) : undefined;
      if (!source || !target) return false;

      return validerDeplacement(
        {
          id: target.id,
          nom: target.nom,
          type: target.type,
          path: target.path,
          parentId: target.parent_id,
        },
        {
          id: source.id,
          nom: source.nom,
          type: source.type,
          path: source.path,
          parentId: source.parent_id,
        },
      ).ok;
    },
    [parId],
  );

  function confirmerDeplacement() {
    if (!deplacement) return;
    const { enfant, nouveauParent } = deplacement;

    demarrer(async () => {
      const resultat = await rattacherEntite({
        id: enfant.id,
        nouveauParentId: nouveauParent.id,
      });

      if (!resultat.ok) {
        toast.error(resultat.error);
        setNoeuds(graphe.noeuds);
        setDeplacement(null);
        return;
      }

      toast.success(
        enfant.nbDescendants > 0
          ? `« ${enfant.nom} » et ses ${formatNombre(enfant.nbDescendants)} sous-entites sont rattachees a « ${nouveauParent.nom} ».`
          : `« ${enfant.nom} » est rattachee a « ${nouveauParent.nom} ».`,
      );
      setDeplacement(null);
      router.refresh();
    });
  }

  // --- Recherche -------------------------------------------------------------

  function rechercher(evenement: React.FormEvent) {
    evenement.preventDefault();
    const terme = recherche.trim().toLowerCase();
    if (!terme) return;

    const cible = entites.find(
      (e) => e.nom.toLowerCase().includes(terme) || e.code.toLowerCase().includes(terme),
    );
    if (!cible) {
      toast.error('Aucune entite ne correspond a cette recherche.');
      return;
    }

    // Deplier tous les ancetres, sinon la cible resterait invisible.
    const aDeplier = new Set<string>();
    let parent = cible.parent_id ? parId.get(cible.parent_id) : undefined;
    while (parent) {
      aDeplier.add(parent.id);
      parent = parent.parent_id ? parId.get(parent.parent_id) : undefined;
    }

    setReplies((precedent) => {
      const suivant = new Set(precedent);
      for (const id of aDeplier) suivant.delete(id);
      return suivant;
    });

    // Le noeud n'existe qu'apres le rendu suivant.
    requestAnimationFrame(() => {
      const noeud = getNode(cible.id);
      if (noeud) {
        setCenter(
          noeud.position.x + LARGEUR_NOEUD / 2,
          noeud.position.y + HAUTEUR_NOEUD / 2,
          { zoom: 1, duration: 400 },
        );
      }
    });
  }

  const toutReplie = replies.size > 0;

  return (
    <>
      <div className="relative h-[calc(100vh-16rem)] min-h-96 w-full overflow-hidden rounded-xl border border-border bg-card">
        <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2">
          <form onSubmit={rechercher} className="flex gap-2">
            <div className="relative">
              <Search
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher une entite…"
                aria-label="Rechercher une entite dans l organigramme"
                className="h-10 w-56 bg-card pl-9"
              />
            </div>
            <Button type="submit" variant="outline" className="h-10 bg-card">
              Localiser
            </Button>
          </form>

          <Button
            type="button"
            variant="outline"
            className="h-10 bg-card"
            onClick={() => {
              if (toutReplie) setReplies(new Set());
              else {
                setReplies(new Set(entites.filter((e) => e.nbEnfants > 0).map((e) => e.id)));
              }
              requestAnimationFrame(() => void fitView({ duration: 400, padding: 0.2 }));
            }}
          >
            {toutReplie ? (
              <>
                <Maximize2 className="mr-2 size-4" aria-hidden />
                Tout deployer
              </>
            ) : (
              <>
                <Minimize2 className="mr-2 size-4" aria-hidden />
                Tout replier
              </>
            )}
          </Button>
        </div>

        {/* Mode d'emploi : sans lui, personne ne devine que le graphe est editable. */}
        <div className="absolute top-4 right-4 z-10 hidden max-w-xs rounded-md border border-border bg-card px-3 py-2 lg:block">
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Move className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Glissez une entite sur une autre pour la rattacher, ou tirez un trait depuis
              le point bas d&apos;une entite mere. Le menu <strong>⋮</strong> ouvre les
              actions.
            </span>
          </p>
        </div>

        {enCours && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/60">
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          </div>
        )}

        <ReactFlow
          nodes={noeuds}
          edges={graphe.aretes}
          nodeTypes={TYPES_NOEUDS}
          onNodesChange={surChangementNoeuds}
          onNodeDragStop={surFinGlissement}
          onConnect={surConnexion}
          isValidConnection={connexionValide}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={1.6}
          // Glissement libre en 360° : c'est le geste de restructuration.
          nodesDraggable
          nodesConnectable
          elementsSelectable
          // ENF-PRF-03 : ne rend que ce qui est dans le viewport.
          onlyRenderVisibleElements
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />
          <Controls showInteractive={false} className="!shadow-none" />
          <MiniMap
            pannable
            zoomable
            className="!rounded-md !border !border-border"
            nodeColor={(noeud) => {
              const type = (noeud.data as { type?: EntityType }).type;
              return type ? MINIMAP_COULEURS[type] : '#cbd5e1';
            }}
          />
        </ReactFlow>
      </div>

      {/* --- Creation depuis un noeud (type et parent verrouilles) --- */}
      <EntityCreateDialog
        parent={parentPourCreation}
        ouvert={parentPourCreation !== null}
        onOuvertChange={(v) => !v && setParentPourCreation(null)}
      />

      {/* --- Confirmation de rattachement --- */}
      <Dialog open={deplacement !== null} onOpenChange={(v) => !v && setDeplacement(null)}>
        <DialogContent>
          {deplacement && (
            <>
              <DialogHeader>
                <DialogTitle>Rattacher « {deplacement.enfant.nom} » ?</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-3 pt-2">
                    <p>
                      {ENTITY_LABELS[deplacement.enfant.type].singulier} rattachee a{' '}
                      <strong className="text-foreground">
                        {deplacement.nouveauParent.nom}
                      </strong>{' '}
                      ({ENTITY_LABELS[deplacement.nouveauParent.type].singulier.toLowerCase()}
                      ).
                    </p>
                    {deplacement.enfant.nbDescendants > 0 && (
                      <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                        {formatNombre(deplacement.enfant.nbDescendants)} sous-entite
                        {deplacement.enfant.nbDescendants > 1 ? 's' : ''} suivront ce
                        deplacement.
                      </p>
                    )}
                  </div>
                </DialogDescription>
              </DialogHeader>

              <DialogFooter>
                <Button
                  variant="outline"
                  className="h-10"
                  disabled={enCours}
                  onClick={() => {
                    setNoeuds(graphe.noeuds);
                    setDeplacement(null);
                  }}
                >
                  Annuler
                </Button>
                <Button className="h-10" disabled={enCours} onClick={confirmerDeplacement}>
                  {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
                  Rattacher
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* --- Suppression --- */}
      {aSupprimer && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setASupprimer(null)}
          title={`Supprimer « ${aSupprimer.nom} » ?`}
          description={
            aSupprimer.nbEnfants > 0
              ? `Cette entite contient ${formatNombre(aSupprimer.nbEnfants)} sous-entite(s). La suppression sera refusee : deplacez-les ou desactivez cette entite.`
              : "L'entite sera placee en corbeille et pourra etre restauree."
          }
          confirmLabel="Supprimer"
          onConfirm={async () => {
            const resultat = await supprimerEntite({ id: aSupprimer.id });
            setASupprimer(null);
            if (!resultat.ok) {
              toast.error(resultat.error);
              return;
            }
            toast.success('Entite placee en corbeille.');
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/** Le provider doit envelopper le graphe : `useReactFlow` en depend. */
export default function EntityFlow({ entites }: { entites: EntiteFlux[] }) {
  return (
    <ReactFlowProvider>
      <Organigramme entites={entites} />
    </ReactFlowProvider>
  );
}
