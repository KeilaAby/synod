'use client';

import {
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  MiniMap,
  type Node,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import { Loader2, RotateCcw, Search, Unlink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { designerMembre, enregistrerDisposition } from '@/lib/actions/bureaux';
import type { BureauComplet } from '@/lib/data/bureaux';
import { type FonctionBureau, ancienneteMandat, composerBureau } from '@/lib/domain/bureau';
import { nomComplet, normaliserRecherche } from '@/lib/domain/croyant';
import type { EntityType } from '@/lib/domain/hierarchy';
import { cn } from '@/lib/utils';
import {
  type DispositionPoste,
  dispositionParDefaut,
  fusionnerDisposition,
  rattacherPoste,
  validerLien,
} from '@/lib/domain/organigramme-bureau';

import { NoeudPoste, TYPE_CROYANT_GLISSE } from './bureau-node';
import { DesignationDialog, type CandidatOption } from './designation-dialog';

import '@xyflow/react/dist/style.css';

/**
 * Éditeur d'organigramme de bureau — EF-BUR-07.
 *
 * TROIS GESTES, ET CE QUE CHACUN SIGNIFIE
 *
 *   · **déplacer** un bloc — librement, sur tout le plan : c'est de la mise en
 *     page, cela n'engage rien ;
 *   · **tirer un trait** d'une poignée à l'autre — c'est là, et là seulement,
 *     que se décide la dépendance. Séparer les deux gestes est délibéré : dans
 *     l'organigramme de structure, lâcher un nœud sur un autre le rattache,
 *     parce que la position n'y veut rien dire. Ici elle veut dire quelque
 *     chose, et un rattachement déclenché par un simple survol rendrait la mise
 *     en page impraticable ;
 *   · **faire glisser un croyant** de la liste sur un bloc — la désignation.
 *
 * CE QUE L'ÉDITEUR N'INVENTE PAS
 *
 * Il n'énumère pas les postes : ce sont les fonctions applicables au niveau de
 * l'entité (EF-REF-03). Une fonction n'y disparaît jamais — elle se place, elle
 * ne s'ajoute ni ne se retire. Sans cela, un trésorier laissé sur le côté du
 * plan cesserait d'être un poste, et le bureau paraîtrait complet.
 *
 * L'enregistrement est AUTOMATIQUE à la fin de chaque geste, et porte tout le
 * plan : un bouton « Enregistrer » créerait un travail à perdre, et des
 * écritures bloc par bloc laisseraient un trait pointer vers une position pas
 * encore enregistrée.
 *
 * Chargé en différé par `organigramme-loader` (règle 7).
 */

const TYPES_NOEUDS = { poste: NoeudPoste };

function Editeur({
  bureau,
  fonctions,
  candidats,
  photos,
  dispositionInitiale,
  peutGerer,
}: {
  bureau: BureauComplet;
  fonctions: FonctionBureau[];
  candidats: CandidatOption[];
  photos: Record<string, string>;
  dispositionInitiale: DispositionPoste[];
  peutGerer: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();

  const [recherche, setRecherche] = useState('');
  const [aretesSelectionnees, setAretesSelectionnees] = useState<string[]>([]);
  const [aDesigner, setADesigner] = useState<string | null>(null);

  const modifiable = peutGerer && bureau.is_active;

  const postes = useMemo(
    () =>
      composerBureau(
        fonctions,
        bureau.membres.map((m) => ({
          id: m.id,
          croyantId: m.croyant_id,
          fonctionId: m.fonction_id,
          dateDebut: m.date_debut,
          dateFin: m.date_fin,
        })),
        (bureau.entite?.type ?? 'EGLISE') as EntityType,
      ),
    [fonctions, bureau.membres, bureau.entite?.type],
  );

  const [disposition, setDisposition] = useState<DispositionPoste[]>(() =>
    fusionnerDisposition(postes, dispositionInitiale),
  );

  const libelleDe = useCallback(
    (fonctionId: string) =>
      postes.find((p) => p.fonction.id === fonctionId)?.fonction.libelle ??
      'cette fonction',
    [postes],
  );

  /** Écrit tout le plan. L'écran est déjà à jour : on ne l'attend pas. */
  const enregistrer = useCallback(
    (suivante: DispositionPoste[]) => {
      demarrer(async () => {
        const resultat = await enregistrerDisposition({
          bureauId: bureau.id,
          postes: suivante,
        });

        if (!resultat.ok) {
          toast.error(resultat.error);
          // L'écran montrait un état que la base a refusé : le remettre
          // conforme vaut mieux que de laisser croire au succès.
          setDisposition(fusionnerDisposition(postes, dispositionInitiale));
        }
      });
    },
    [bureau.id, postes, dispositionInitiale],
  );

  // --- Désignation -----------------------------------------------------------

  const designer = useCallback(
    (fonctionId: string, croyantId: string) => {
      demarrer(async () => {
        const resultat = await designerMembre({
          bureauId: bureau.id,
          croyantId,
          fonctionId,
          notes: '',
        });

        if (!resultat.ok) {
          // RG-08, RG-09 — le refus est explicite, il ne se devine pas d'un
          // bloc resté vacant.
          toast.error(resultat.error);
          return;
        }
        toast.success('Titulaire désigné.');
        router.refresh();
      });
    },
    [bureau.id, router],
  );

  // --- Le graphe -------------------------------------------------------------

  const parMandat = useMemo(
    () => new Map(bureau.membres.map((m) => [m.id, m])),
    [bureau.membres],
  );

  const noeuds: Node[] = useMemo(
    () =>
      disposition.map((place) => {
        const poste = postes.find((p) => p.fonction.id === place.fonctionId)!;
        const membre = poste.mandat ? parMandat.get(poste.mandat.id) : undefined;
        const croyant = membre?.croyant ?? null;

        return {
          id: place.fonctionId,
          type: 'poste',
          position: { x: place.x, y: place.y },
          draggable: modifiable,
          data: {
            fonctionId: place.fonctionId,
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
            peutGerer: modifiable,
            surDesigner: setADesigner,
            surDeposerCroyant: designer,
          },
        };
      }),
    [disposition, postes, parMandat, photos, modifiable, designer],
  );

  const aretes: Edge[] = useMemo(
    () =>
      disposition
        .filter((d) => d.parentFonctionId !== null)
        .map((d) => {
          const id = `${d.parentFonctionId}-${d.fonctionId}`;
          return {
            id,
            source: d.parentFonctionId!,
            target: d.fonctionId,
            type: 'smoothstep',
            // La sélection est tenue ICI : les arêtes sont recalculées à chaque
            // changement de disposition, et une sélection laissée au magasin
            // interne de React Flow disparaîtrait au premier déplacement — la
            // touche Suppr. n'aurait alors plus rien à supprimer.
            selected: aretesSelectionnees.includes(id),
            style: {
              stroke: aretesSelectionnees.includes(id) ? '#4f46e5' : '#cbd5e1',
              strokeWidth: aretesSelectionnees.includes(id) ? 2.5 : 1.5,
            },
          };
        }),
    [disposition, aretesSelectionnees],
  );

  // --- Gestes ----------------------------------------------------------------

  /** Seules les POSITIONS nous intéressent : elles vivent dans `disposition`. */
  const surChangementNoeuds = useCallback((changements: NodeChange[]) => {
    setDisposition((precedente) => {
      let suivante = precedente;

      for (const changement of changements) {
        if (changement.type !== 'position' || !changement.position) continue;
        const position = changement.position;
        suivante = suivante.map((d) =>
          d.fonctionId === changement.id ? { ...d, x: position.x, y: position.y } : d,
        );
      }
      return suivante;
    });
  }, []);

  const surChangementAretes = useCallback((changements: EdgeChange[]) => {
    setAretesSelectionnees((precedente) => {
      const selection = new Set(precedente);
      for (const changement of changements) {
        if (changement.type !== 'select') continue;
        if (changement.selected) selection.add(changement.id);
        else selection.delete(changement.id);
      }
      return [...selection];
    });
  }, []);

  /**
   * Fin de déplacement : on enregistre à partir des positions que React Flow
   * donne pour ACQUISES, et non de l'état local — rien ne garantit qu'il ait
   * déjà été rafraîchi quand cet événement survient.
   */
  const surFinDeplacement = useCallback(
    // React Flow transmet l'événement DOM natif, pas un événement synthétique.
    (_evenement: MouseEvent | TouchEvent, __noeud: Node, deplaces: Node[]) => {
      const positions = new Map(deplaces.map((n) => [n.id, n.position]));
      const suivante = disposition.map((d) => {
        const position = positions.get(d.fonctionId);
        return position ? { ...d, x: position.x, y: position.y } : d;
      });

      setDisposition(suivante);
      enregistrer(suivante);
    },
    [disposition, enregistrer],
  );

  const relier = useCallback(
    (fonctionId: string, parentId: string | null) => {
      if (parentId !== null) {
        const verdict = validerLien(
          { id: fonctionId, libelle: libelleDe(fonctionId) },
          { id: parentId, libelle: libelleDe(parentId) },
          disposition,
        );
        if (!verdict.ok) {
          toast.error(verdict.error);
          return;
        }
      }

      const suivante = rattacherPoste(disposition, fonctionId, parentId);
      setDisposition(suivante);
      enregistrer(suivante);
    },
    [disposition, libelleDe, enregistrer],
  );

  const surConnexion = useCallback(
    (connexion: Connection) => {
      if (connexion.source && connexion.target) relier(connexion.target, connexion.source);
    },
    [relier],
  );

  /** Écarte la cible invalide AVANT le relâchement : le trait ne s'accroche pas. */
  const connexionValide = useCallback(
    (connexion: Connection | Edge) => {
      if (!connexion.source || !connexion.target) return false;
      return validerLien(
        { id: connexion.target, libelle: libelleDe(connexion.target) },
        { id: connexion.source, libelle: libelleDe(connexion.source) },
        disposition,
      ).ok;
    },
    [disposition, libelleDe],
  );

  /** Détacher un trait ne supprime pas le bloc : il redevient une racine. */
  const surSuppressionAretes = useCallback(
    (supprimees: Edge[]) => {
      let suivante = disposition;
      for (const arete of supprimees) {
        suivante = rattacherPoste(suivante, arete.target, null);
      }
      setDisposition(suivante);
      setAretesSelectionnees([]);
      enregistrer(suivante);
    },
    [disposition, enregistrer],
  );

  const reinitialiser = useCallback(() => {
    const defaut = dispositionParDefaut(postes);
    setDisposition(defaut);
    enregistrer(defaut);
    toast.success('Organigramme replacé selon le rang protocolaire.');
  }, [postes, enregistrer]);

  // --- Croyants éligibles, à faire glisser ------------------------------------

  const eligibles = useMemo(() => {
    const terme = normaliserRecherche(recherche);
    const dejaMembres = new Set(
      bureau.membres.filter((m) => m.date_fin === null).map((m) => m.croyant_id),
    );

    return candidats
      .filter((c) => !dejaMembres.has(c.id))
      .filter((c) => {
        if (!terme) return true;
        const texte = normaliserRecherche(`${c.nom} ${c.prenom} ${c.matricule}`);
        return terme.split(' ').every((mot) => texte.includes(mot));
      })
      .slice(0, 100);
  }, [candidats, bureau.membres, recherche]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="border-border h-[38rem] overflow-hidden rounded-xl border bg-slate-50/60">
        <ReactFlow
          nodes={noeuds}
          edges={aretes}
          nodeTypes={TYPES_NOEUDS}
          onNodesChange={surChangementNoeuds}
          onNodeDragStop={surFinDeplacement}
          onEdgesChange={surChangementAretes}
          onConnect={surConnexion}
          isValidConnection={connexionValide}
          onEdgesDelete={surSuppressionAretes}
          nodesConnectable={modifiable}
          edgesReconnectable={false}
          deleteKeyCode={modifiable ? ['Backspace', 'Delete'] : null}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          maxZoom={1.5}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />
          <Controls showInteractive={false} className="!rounded-md !border !border-border" />
          <MiniMap pannable zoomable className="!rounded-md !border !border-border" />
        </ReactFlow>
      </div>

      <aside className="space-y-4">
        {modifiable && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="h-9" onClick={reinitialiser}>
              <RotateCcw className="mr-2 size-4" aria-hidden />
              Replacer par rang
            </Button>
            {enCours && (
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Enregistrement…
              </span>
            )}
          </div>
        )}

        <div className="border-border space-y-3 rounded-xl border p-4">
          <p className="eyebrow">Croyants éligibles</p>
          <p className="text-muted-foreground text-xs">
            RG-09 — le périmètre de {bureau.entite?.nom}. Faites glisser un nom sur un
            bloc pour l&apos;y désigner.
          </p>

          <div className="relative">
            <Search
              className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Nom, prénom, matricule…"
              aria-label="Rechercher un croyant éligible"
              className="h-10 pl-9"
            />
          </div>

          <ul className="max-h-[24rem] space-y-1 overflow-y-auto">
            {eligibles.length === 0 && (
              <li className="text-muted-foreground py-4 text-center text-xs">
                Aucun croyant éligible ne correspond.
              </li>
            )}

            {eligibles.map((croyant) => (
              <li key={croyant.id}>
                <div
                  draggable={modifiable}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TYPE_CROYANT_GLISSE, croyant.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-md p-2 transition-colors',
                    modifiable
                      ? 'cursor-grab hover:bg-slate-100 active:cursor-grabbing'
                      : 'opacity-70',
                  )}
                >
                  <AvatarCroyant
                    nom={croyant.nom}
                    prenom={croyant.prenom}
                    url={croyant.photoKey ? (photos[croyant.photoKey] ?? null) : null}
                  />
                  <span className="min-w-0">
                    <span className="text-foreground block truncate text-sm">
                      {nomComplet(croyant.nom, croyant.prenom)}
                    </span>
                    <span className="text-muted-foreground block font-mono text-xs">
                      {croyant.matricule}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {modifiable && (
          <p className="text-muted-foreground flex items-start gap-2 text-xs">
            <Unlink className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Cliquez un trait puis pressez Suppr. pour détacher un bloc : il redevient une
            racine, il ne disparaît pas.
          </p>
        )}
      </aside>

      {/* Le MÊME dialogue que la vue tabulaire (règle 16) : désigner ici ou
          là-bas doit poser les mêmes questions et appliquer les mêmes règles. */}
      {aDesigner && (
        <DesignationDialog
          mode="designer"
          bureau={bureau}
          fonctions={fonctions}
          candidats={candidats}
          photos={photos}
          fonctionId={aDesigner}
          ouvert
          onOuvertChange={(v) => !v && setADesigner(null)}
        />
      )}
    </div>
  );
}

/** Le provider doit envelopper l'éditeur : React Flow en dépend. */
export default function OrganigrammeFlow(props: {
  bureau: BureauComplet;
  fonctions: FonctionBureau[];
  candidats: CandidatOption[];
  photos: Record<string, string>;
  dispositionInitiale: DispositionPoste[];
  peutGerer: boolean;
}) {
  return (
    <ReactFlowProvider>
      <Editeur {...props} />
    </ReactFlowProvider>
  );
}
