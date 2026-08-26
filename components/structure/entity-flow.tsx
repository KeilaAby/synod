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

import { avertir } from '@/components/shared/messages';
import { useSession } from '@/components/shared/session-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { rattacherEntite } from '@/lib/actions/entities';
import { type EntityType, validerDeplacement } from '@/lib/domain/hierarchy';
import { replisParDefaut } from '@/lib/domain/organigramme';
import { formatNombre } from '@/lib/utils/format';

import type { OptionsCroyant } from '@/components/croyants/croyant-dialog';
import type { ApercuBureaux } from '@/lib/data/bureaux';
import type { ChiffresStructure } from '@/lib/data/structure-chiffres';

import type { EntiteFlux } from './entite';
import { MenuEntiteUnique } from './entity-menu';
import { NoeudEntite } from './entity-node';
import { useEntityDialogs } from './use-entity-dialogs';

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

export type { EntiteFlux };

/** Grille de 8px, jusque dans la disposition du graphe (UI-01). */
const LARGEUR_NOEUD = 224; // w-56
const HAUTEUR_NOEUD = 168;
const ESPACEMENT_FRERES = 40;
const ESPACEMENT_NIVEAUX = 80;

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

function Organigramme({
  entites,
  apercuBureaux,
  optionsCroyant,
  chiffresStructure,
  joursDelai,
}: {
  entites: EntiteFlux[];
  apercuBureaux: ApercuBureaux;
  optionsCroyant: OptionsCroyant;
  chiffresStructure: ChiffresStructure;
  joursDelai: number;
}) {
  const router = useRouter();
  const { fitView, setCenter, getNode, getIntersectingNodes } = useReactFlow();
  const { peut } = useSession();

  const [recherche, setRecherche] = useState('');
  const [enCours, demarrer] = useTransition();

  const [replies, setReplies] = useState<Set<string>>(() =>
    replisParDefaut(entites),
  );

  // Les quatre pop-up du CRUD sont mutualisees avec la vue liste : meme fiche,
  // meme formulaire, meme confirmation de suppression.
  const {
    parId,
    ouvrirFiche,
    modifier,
    creerEnfant,
    demanderSuppression,
    ouvrirBureaux,
    etatBureau,
    ajouterCroyant,
    peutAjouterCroyant,
    dialogues,
  } = useEntityDialogs(entites, apercuBureaux, optionsCroyant, chiffresStructure, joursDelai);

  // --- Actions du menu de noeud ---------------------------------------------

  const basculerRepli = useCallback((id: string) => {
    setReplies((precedent) => {
      const suivant = new Set(precedent);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  }, []);

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
        bureau: etatBureau(e),
        peutAjouterCroyant: peutAjouterCroyant(e),
        surReplier: basculerRepli,
        surOuvrir: ouvrirFiche,
        surCreerEnfant: creerEnfant,
        surModifier: modifier,
        surSupprimer: demanderSuppression,
        surBureaux: ouvrirBureaux,
        surAjouterCroyant: ajouterCroyant,
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
    etatBureau,
    ouvrirBureaux,
    peutAjouterCroyant,
    ajouterCroyant,
  ]);

  /**
   * Positions locales : le glissement doit etre visible pendant le geste, mais
   * la disposition Dagre reprend la main des que la structure change.
   *
   * On se cale sur l'IDENTITE de `graphe`, pas sur une signature derivee.
   * Une signature construite a partir des seuls identifiants de noeuds ne
   * changeait pas apres un rattachement — les entites sont les memes, seule
   * leur parente differe : les positions ET les donnees restaient figees.
   * `graphe` etant un `useMemo`, son identite change exactement quand la
   * structure, le repli ou les habilitations changent.
   *
   * L'ajustement se fait EN RENDU plutot que dans un effet : un effet
   * declencherait un second rendu et un scintillement du graphe.
   */
  const [grapheAffiche, setGrapheAffiche] = useState(graphe);
  const [noeuds, setNoeuds] = useState<Node[]>(graphe.noeuds);

  if (grapheAffiche !== graphe) {
    setGrapheAffiche(graphe);
    setNoeuds(graphe.noeuds);
  }

  const surChangementNoeuds = useCallback(
    (changements: NodeChange[]) => setNoeuds((n) => applyNodeChanges(changements, n)),
    [],
  );

  // --- Rattachement ----------------------------------------------------------

  /** Remet une entite sous son parent d'origine — l'action « Annuler ». */
  const annulerDeplacement = useCallback(
    (idEnfant: string, ancienParentId: string, nomEnfant: string) => {
      demarrer(async () => {
        const resultat = await rattacherEntite({
          id: idEnfant,
          nouveauParentId: ancienParentId,
        });

        if (!resultat.ok) {
          avertir(`Le retour en arriere a echoue : ${resultat.error}`);
          return;
        }
        toast.success(`« ${nomEnfant} » a retrouve son rattachement d'origine.`);
        router.refresh();
      });
    },
    [router],
  );

  /**
   * ERG-1 — le rattachement s'applique IMMEDIATEMENT, avec une action
   * « Annuler » dans la notification.
   *
   * Une confirmation systematique cassait la fluidite du geste alors que
   * l'operation est entierement reversible : rattacher en sens inverse rend
   * l'etat initial, et les deux mouvements sont journalises. Un dialogue se
   * justifie pour une action irreversible, pas pour celle-ci.
   */
  const executerDeplacement = useCallback(
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
        avertir(verdict.error);
        return false;
      }

      if (
        !peut('entity.update', enfant.path) ||
        !peut('entity.update', nouveauParent.path)
      ) {
        avertir(
          'Un deplacement modifie l origine ET la destination : votre habilitation doit couvrir les deux.',
        );
        return false;
      }

      // Retenu AVANT la mutation : apres rafraichissement, `enfant` sera
      // remplace par une version portant deja le nouveau parent.
      const ancienParentId = enfant.parent_id;

      demarrer(async () => {
        const resultat = await rattacherEntite({
          id: enfant.id,
          nouveauParentId: nouveauParent.id,
        });

        if (!resultat.ok) {
          avertir(resultat.error);
          setNoeuds(graphe.noeuds);
          return;
        }

        toast.success(
          enfant.nbDescendants > 0
            ? `« ${enfant.nom} » et ses ${formatNombre(enfant.nbDescendants)} sous-entites sont rattachees a « ${nouveauParent.nom} ».`
            : `« ${enfant.nom} » est rattachee a « ${nouveauParent.nom} ».`,
          {
            duration: 10_000,
            action: ancienParentId
              ? {
                  label: 'Annuler',
                  onClick: () =>
                    annulerDeplacement(enfant.id, ancienParentId, enfant.nom),
                }
              : undefined,
          },
        );

        router.refresh();
      });

      return true;
    },
    [parId, peut, graphe.noeuds, router, annulerDeplacement],
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
      if (!executerDeplacement(noeud.id, cible.id)) {
        setNoeuds(graphe.noeuds);
      }
    },
    [getIntersectingNodes, graphe.noeuds, executerDeplacement],
  );

  /** Trait tire d'une poignee de parent vers une poignee d'enfant. */
  const surConnexion = useCallback(
    (connexion: Connection) => {
      if (!connexion.source || !connexion.target) return;
      executerDeplacement(connexion.target, connexion.source);
    },
    [executerDeplacement],
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

  // --- Recherche -------------------------------------------------------------

  function rechercher(evenement: React.FormEvent) {
    evenement.preventDefault();
    const terme = recherche.trim().toLowerCase();
    if (!terme) return;

    const cible = entites.find(
      (e) => e.nom.toLowerCase().includes(terme) || e.code.toLowerCase().includes(terme),
    );
    if (!cible) {
      avertir('Aucune entité ne correspond à cette recherche.', {
        ton: 'information',
        titre: 'Recherche sans résultat',
      });
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
              // Seuil au niveau le plus haut : tout est replie SAUF la racine
              // du perimetre, que `replisParDefaut` preserve toujours. La
              // replier aussi ne laisserait qu'un seul noeud a l'ecran.
              setReplies(toutReplie ? new Set() : replisParDefaut(entites, 'SIEGE'));
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

      {dialogues}
    </>
  );
}

/** Le provider doit envelopper le graphe : `useReactFlow` en depend. */
export default function EntityFlow({
  entites,
  apercuBureaux,
  optionsCroyant,
  chiffresStructure,
  joursDelai,
}: {
  entites: EntiteFlux[];
  apercuBureaux: ApercuBureaux;
  optionsCroyant: OptionsCroyant;
  chiffresStructure: ChiffresStructure;
  joursDelai: number;
}) {
  return (
    <ReactFlowProvider>
      {/*
        UN SEUL MENU D'ENTITE OUVERT A LA FOIS.

        React Flow intercepte les evenements pointeur de son canevas, si bien
        que Radix ne voyait jamais le clic « au dehors » qui ferme le menu
        precedent : trois clics successifs laissaient trois menus empiles sur
        le plan. Le fournisseur tient un seul identifiant ouvert, et le
        second clic ferme le premier par construction.
      */}
      <MenuEntiteUnique>
        <Organigramme
          entites={entites}
          apercuBureaux={apercuBureaux}
          optionsCroyant={optionsCroyant}
          chiffresStructure={chiffresStructure}
          joursDelai={joursDelai}
        />
      </MenuEntiteUnique>
    </ReactFlowProvider>
  );
}
