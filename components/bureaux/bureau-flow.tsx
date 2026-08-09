'use client';

import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import { useMemo } from 'react';

import type { MembreBureau } from '@/lib/data/bureaux';
import { type PosteBureau, ancienneteMandat } from '@/lib/domain/bureau';
import {
  type DispositionPoste,
  dispositionParDefaut,
} from '@/lib/domain/organigramme-bureau';

import { NoeudPoste } from './bureau-node';

import '@xyflow/react/dist/style.css';

/**
 * Organigramme d'un bureau — EF-BUR-07.
 *
 * CE QUE LE GRAPHE DIT
 *
 * **Ce que l'utilisateur a dessiné**, et rien de plus. Les traits viennent de
 * `bureau_postes`, propre à ce bureau : ils expriment la dépendance telle
 * qu'elle a été décrite.
 *
 * Tant que rien n'a été dessiné, les blocs sont posés en grille et **sans
 * aucun trait**. C'est délibéré : depuis le retrait de l'ordre protocolaire
 * (9 août 2026), plus aucune donnée ne dit qui dépend de qui, et en dessiner
 * un l'inventerait — le défaut le plus coûteux d'un organigramme, parce qu'il
 * se lit comme un fait.
 *
 * POURQUOI PAS DAGRE, ICI
 *
 * L'organigramme de structure emprunte Dagre parce que son arbre est
 * quelconque. Ici les positions sont DONNÉES — enregistrées ou calculées en
 * grille : il n'y a rien à résoudre, et Dagre déplacerait ce que l'utilisateur
 * a placé.
 *
 * Chargé en différé par `bureau-flow-loader` (règle 7).
 */

const TYPES_NOEUDS = { poste: NoeudPoste };

/** Ce que porte un bloc — la même donnée que dans l'éditeur, un seul format. */
function donnees(
  poste: PosteBureau,
  membre: MembreBureau | undefined,
  photos: Record<string, string>,
  peutGerer: boolean,
  onDesigner: (fonctionId: string) => void,
) {
  const croyant = membre?.croyant ?? null;

  return {
    fonctionId: poste.fonction.id,
    fonction: poste.fonction.libelle,
    estFinanciere: poste.fonction.estFinanciere,
    titulaire: croyant
      ? {
          nom: croyant.nom,
          prenom: croyant.prenom,
          matricule: croyant.matricule,
          photoUrl: croyant.photo_key ? (photos[croyant.photo_key] ?? null) : null,
        }
      : null,
    anciennete: poste.mandat ? ancienneteMandat(poste.mandat.dateDebut) : '',
    peutGerer,
    surDesigner: onDesigner,
  };
}

/** Le plan tel qu'il a été dessiné : positions et traits viennent de la base. */
function dessinerPlan(
  plan: DispositionPoste[],
  postes: PosteBureau[],
  parMandat: Map<string, MembreBureau>,
  photos: Record<string, string>,
  peutGerer: boolean,
  onDesigner: (fonctionId: string) => void,
): { noeuds: Node[]; aretes: Edge[] } {
  const parFonction = new Map(postes.map((p) => [p.fonction.id, p]));

  const noeuds: Node[] = [];
  const aretes: Edge[] = [];

  for (const place of plan) {
    const poste = parFonction.get(place.fonctionId);
    // Une fonction sortie du référentiel depuis le dessin : on ne dessine pas
    // un bloc dont plus rien ne dit le libellé.
    if (!poste) continue;

    noeuds.push({
      id: place.fonctionId,
      type: 'poste',
      position: { x: place.x, y: place.y },
      data: donnees(
        poste,
        poste.mandat ? parMandat.get(poste.mandat.id) : undefined,
        photos,
        peutGerer,
        onDesigner,
      ),
    });

    if (place.parentFonctionId && parFonction.has(place.parentFonctionId)) {
      aretes.push({
        id: `${place.parentFonctionId}-${place.fonctionId}`,
        source: place.parentFonctionId,
        target: place.fonctionId,
        type: 'smoothstep',
        style: { stroke: '#cbd5e1', strokeWidth: 1.5 },
      });
    }
  }

  return { noeuds, aretes };
}

function Graphe({
  postes,
  membres,
  plan,
  photos,
  peutGerer,
  onDesigner,
}: {
  postes: PosteBureau[];
  membres: MembreBureau[];
  /** Plan dessiné dans l'éditeur. Vide : les blocs sont posés en grille. */
  plan: DispositionPoste[];
  photos: Record<string, string>;
  peutGerer: boolean;
  onDesigner: (fonctionId: string) => void;
}) {
  const { noeuds, aretes } = useMemo(() => {
    const parMandat = new Map(membres.map((m) => [m.id, m]));

    /**
     * Le plan DESSINE, ou la disposition par défaut à défaut.
     *
     * UNE SEULE règle de mise en place, partagée avec l'éditeur : cet écran
     * avait la sienne, calquée sur le rang protocolaire, et les deux se sont
     * mises à diverger le jour où le rang a disparu.
     *
     * Sans plan, les blocs sont posés en grille et sans aucun trait — plus
     * aucune donnée ne dit qui dépend de qui, et en dessiner un l'inventerait.
     */
    return dessinerPlan(
      plan.length > 0 ? plan : dispositionParDefaut(postes),
      postes,
      parMandat,
      photos,
      peutGerer,
      onDesigner,
    );
  }, [postes, membres, plan, photos, peutGerer, onDesigner]);

  return (
    <div className="border-border h-[28rem] w-full overflow-hidden rounded-xl border bg-slate-50/60">
      <ReactFlow
        nodes={noeuds}
        edges={aretes}
        nodeTypes={TYPES_NOEUDS}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        // Un organigramme de bureau se CONSULTE : rien ne s'y réorganise, la
        // composition se change au tableau ou par « Désigner ».
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />
        <Controls showInteractive={false} className="!rounded-md !border !border-border" />
        {noeuds.length > 8 && (
          <MiniMap pannable className="!rounded-md !border !border-border" />
        )}
      </ReactFlow>
    </div>
  );
}

/** Le provider doit envelopper le graphe : React Flow en dépend. */
export default function BureauFlow(props: {
  postes: PosteBureau[];
  membres: MembreBureau[];
  plan: DispositionPoste[];
  photos: Record<string, string>;
  peutGerer: boolean;
  onDesigner: (fonctionId: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <Graphe {...props} />
    </ReactFlowProvider>
  );
}
