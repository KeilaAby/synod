'use client';

import dagre from '@dagrejs/dagre';
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { Maximize2, Minimize2, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { EntityType } from '@/lib/domain/hierarchy';

import { NoeudEntite } from './entity-node';

import '@xyflow/react/dist/style.css';

/**
 * Organigramme de structure — EF-STR-04, EF-STR-05.
 *
 * Charge en differe par `entity-flow-loader` : React Flow pese ~120 ko et
 * n'a aucune raison d'entrer dans le bundle initial (ENF-PRF-09, UI-18).
 */

export interface EntiteFlux {
  id: string;
  nom: string;
  code: string;
  type: EntityType;
  parent_id: string | null;
  niveau: number;
  nbDescendants: number;
  nbEnfants: number;
  sans_acces_application: boolean;
  is_active: boolean;
}

/** Grille de 8px, jusque dans la disposition du graphe (UI-01). */
const LARGEUR_NOEUD = 224; // w-56
const HAUTEUR_NOEUD = 160;
const ESPACEMENT_FRERES = 40;
const ESPACEMENT_NIVEAUX = 80;

/**
 * Au-dela de ce nombre de noeuds, les branches profondes sont repliees a
 * l'ouverture. Le graphe reste lisible et le rendu instantane, sans recourir
 * a un chargement paresseux qui compliquerait la recherche.
 */
const SEUIL_REPLI_AUTO = 40;
const PROFONDEUR_VISIBLE_PAR_DEFAUT = 2;

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

const TYPES_NOEUDS = { entite: NoeudEntite };

function Organigramme({ entites }: { entites: EntiteFlux[] }) {
  const router = useRouter();
  const { fitView, setCenter, getNode } = useReactFlow();
  const [recherche, setRecherche] = useState('');

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

  const basculerRepli = useCallback((id: string) => {
    setReplies((precedent) => {
      const suivant = new Set(precedent);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  }, []);

  const ouvrirFiche = useCallback(
    (id: string) => router.push(`/structure/${id}`),
    [router],
  );

  const { noeuds, aretes } = useMemo(() => {
    const parId = new Map(entites.map((e) => [e.id, e]));

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

    const listeNoeuds: Node[] = visibles.map((e) => ({
      id: e.id,
      type: 'entite',
      position: { x: 0, y: 0 }, // recalcule par Dagre
      data: {
        nom: e.nom,
        code: e.code,
        type: e.type,
        nbDescendants: e.nbDescendants,
        nbEnfants: e.nbEnfants,
        sansAcces: e.sans_acces_application,
        actif: e.is_active,
        replie: replies.has(e.id),
        surReplier: basculerRepli,
        surOuvrir: ouvrirFiche,
      },
    }));

    const listeAretes: Edge[] = visibles
      .filter((e) => e.parent_id && idsVisibles.has(e.parent_id))
      .map((e) => ({
        id: `${e.parent_id}-${e.id}`,
        source: e.parent_id!,
        target: e.id,
        type: 'smoothstep',
        style: { stroke: '#cbd5e1', strokeWidth: 1.5 },
      }));

    return { noeuds: disposer(listeNoeuds, listeAretes), aretes: listeAretes };
  }, [entites, replies, basculerRepli, ouvrirFiche]);

  /** EF-STR-04 — recherche puis centrage anime sur le resultat. */
  function rechercher(evenement: React.FormEvent) {
    evenement.preventDefault();
    const terme = recherche.trim().toLowerCase();
    if (!terme) return;

    const cible = entites.find(
      (e) => e.nom.toLowerCase().includes(terme) || e.code.toLowerCase().includes(terme),
    );
    if (!cible) return;

    // Deplier tous les ancetres, sinon la cible resterait invisible.
    const parId = new Map(entites.map((e) => [e.id, e]));
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
        setCenter(noeud.position.x + LARGEUR_NOEUD / 2, noeud.position.y + HAUTEUR_NOEUD / 2, {
          zoom: 1,
          duration: 400,
        });
      }
    });
  }

  const toutReplie = replies.size > 0;

  return (
    <div className="relative h-[calc(100vh-16rem)] min-h-96 w-full overflow-hidden rounded-xl border border-border bg-card">
      {/* Barre d'outils flottante */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
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
          <Button type="submit" variant="outline" className="h-10">
            Localiser
          </Button>
        </form>

        <Button
          type="button"
          variant="outline"
          className="h-10"
          onClick={() => {
            if (toutReplie) setReplies(new Set());
            else setReplies(new Set(entites.filter((e) => e.nbEnfants > 0).map((e) => e.id)));
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

      <ReactFlow
        nodes={noeuds}
        edges={aretes}
        nodeTypes={TYPES_NOEUDS}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={1.6}
        proOptions={{ hideAttribution: false }}
        nodesDraggable={false}
        nodesConnectable={false}
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
  );
}

/** Teintes pleines pour la mini-carte : les classes Tailwind n'y sont pas rendues. */
const MINIMAP_COULEURS: Record<EntityType, string> = {
  SIEGE: '#0f172a',
  REGIONAL: '#6366f1',
  DISTRICT: '#0ea5e9',
  PAROISSE: '#14b8a6',
  EGLISE: '#f59e0b',
  CELLULE: '#94a3b8',
};

/** Le provider doit envelopper le graphe : `useReactFlow` en depend. */
export default function EntityFlow({ entites }: { entites: EntiteFlux[] }) {
  return (
    <ReactFlowProvider>
      <Organigramme entites={entites} />
    </ReactFlowProvider>
  );
}
