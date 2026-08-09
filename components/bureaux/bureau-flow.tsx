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
import {
  type PosteBureau,
  ancienneteMandat,
  rangsProtocolaires,
} from '@/lib/domain/bureau';
import type { DispositionPoste } from '@/lib/domain/organigramme-bureau';

import { NoeudPoste } from './bureau-node';

import '@xyflow/react/dist/style.css';

/**
 * Organigramme d'un bureau — EF-BUR-07.
 *
 * CE QUE LE GRAPHE DIT
 *
 * Une **préséance**, pas une chaîne de commandement. Rien dans le modèle ne dit
 * qu'un trésorier rend compte au secrétaire : les traits reliant les rangs
 * expriment l'ordre protocolaire, et l'écran le précise sous le graphe. Un
 * organigramme qui laisse croire à une subordination invente une organisation.
 *
 * POURQUOI PAS DAGRE, ICI
 *
 * L'organigramme de structure emprunte Dagre parce que son arbre est
 * quelconque. Celui d'un bureau ne l'est pas : c'est une liste ordonnée, dont
 * les rangs forment des bandes horizontales. Poser les coordonnées directement
 * tient en dix lignes, donne un rendu stable d'un affichage à l'autre — Dagre
 * peut réordonner des frères de même rang — et économise le moteur de
 * disposition.
 *
 * Chargé en différé par `bureau-flow-loader` (règle 7).
 */

/** Grille de 8 px, jusque dans la disposition (UI-01). */
const LARGEUR = 224; // w-56, comme les nœuds de structure
const HAUTEUR = 140;
const ESPACEMENT_X = 32;
const ESPACEMENT_Y = 88;

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
  /** Plan dessiné dans l'éditeur. Vide : on retombe sur le rang protocolaire. */
  plan: DispositionPoste[];
  photos: Record<string, string>;
  peutGerer: boolean;
  onDesigner: (fonctionId: string) => void;
}) {
  const { noeuds, aretes } = useMemo(() => {
    const parMandat = new Map(membres.map((m) => [m.id, m]));

    /**
     * Le plan DESSINE l'emporte sur le rang.
     *
     * Sans cela, « Définir l'organigramme » produirait une disposition que
     * personne ne verrait ailleurs — deux représentations d'un même bureau,
     * contradictoires, et l'utilisateur croirait son travail perdu.
     *
     * Le rang reste le repli : tant qu'aucun plan n'a été dessiné, il donne une
     * lecture juste plutôt qu'un cadre vide.
     */
    if (plan.length > 0) {
      return dessinerPlan(plan, postes, parMandat, photos, peutGerer, onDesigner);
    }

    const rangs = rangsProtocolaires(postes);
    const noeuds: Node[] = [];
    const aretes: Edge[] = [];

    rangs.forEach((rang, niveau) => {
      // Chaque bande est CENTREE sur l'axe : un rang à un seul titulaire reste
      // dans l'alignement du président, et l'œil suit la préséance de haut en
      // bas sans chercher où elle continue.
      const largeurBande = rang.postes.length * LARGEUR + (rang.postes.length - 1) * ESPACEMENT_X;

      rang.postes.forEach((poste, index) => {
        const membre = poste.mandat ? parMandat.get(poste.mandat.id) : undefined;
        const croyant = membre?.croyant ?? null;

        noeuds.push({
          id: poste.fonction.id,
          type: 'poste',
          position: {
            x: -largeurBande / 2 + index * (LARGEUR + ESPACEMENT_X),
            y: niveau * (HAUTEUR + ESPACEMENT_Y),
          },
          data: {
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
          },
        });
      });

      // Le trait part du poste PRINCIPAL du rang précédent — le premier dans
      // l'ordre protocolaire. Relier chacun à chacun produirait un treillis
      // illisible qui, lui, affirmerait vraiment quelque chose de faux.
      const precedent = rangs[niveau - 1]?.postes[0];
      if (!precedent) return;

      for (const poste of rang.postes) {
        aretes.push({
          id: `${precedent.fonction.id}-${poste.fonction.id}`,
          source: precedent.fonction.id,
          target: poste.fonction.id,
          type: 'smoothstep',
          style: { stroke: '#cbd5e1', strokeWidth: 1.5 },
        });
      }
    });

    return { noeuds, aretes };
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
