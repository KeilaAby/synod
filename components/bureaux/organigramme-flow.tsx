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
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
// `LayoutGrid` plutôt que `RotateCcw` : l'icône de réinitialisation annonçait
// un retour en arrière, et c'est bien ce que faisait le bouton.
import { GripVertical, LayoutGrid, Printer, Search, Unlink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { avertir } from '@/components/shared/messages';
import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import { OperationDialog } from '@/components/shared/operation-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  designerMembre,
  enregistrerDisposition,
  retirerMembre,
} from '@/lib/actions/bureaux';
import type { BureauComplet, MembreBureau } from '@/lib/data/bureaux';
import {
  type FonctionBureau,
  type MotifRetrait,
  type PosteBureau,
  ancienneteMandat,
  composerBureau,
} from '@/lib/domain/bureau';
import { nomComplet, normaliserRecherche } from '@/lib/domain/croyant';
import type { EntityType } from '@/lib/domain/hierarchy';
import {
  type DispositionPoste,
  disposerLesManquantes,
  nettoyerDisposition,
  retirerPoste,
  validerLien,
} from '@/lib/domain/organigramme-bureau';
import { cn } from '@/lib/utils';

import { NoeudPoste, TYPE_CROYANT_GLISSE, TYPE_FONCTION_GLISSE } from './bureau-node';
import { imprimerOrganigramme } from './imprimer-organigramme';
import { DesignationDialog, type CandidatOption } from './designation-dialog';
import { RetraitDialog } from './retrait-dialog';

import '@xyflow/react/dist/style.css';

/**
 * Éditeur d'organigramme de bureau — EF-BUR-07.
 *
 * QUI POSSÈDE QUOI
 *
 * React Flow possède les **positions** pendant toute l'interaction ; ce
 * composant possède les **liens** et la liste des blocs posés. La première
 * version reconstruisait les nœuds à partir de son propre état à chaque
 * changement de position — donc à chaque image d'un déplacement. React Flow
 * perdait ses mesures (« trying to drag a node that is not initialized »), le
 * geste devenait saccadé, et chaque micro-mouvement partait en écriture.
 *
 * Règle qui en découle : *ce qui bouge en continu appartient à la bibliothèque
 * qui l'anime ; on ne le lui reprend qu'à la fin du geste.*
 *
 * TROIS GESTES, TROIS SENS
 *
 *   · **poser** une fonction en la faisant glisser de la palette sur le plan ;
 *   · **tirer un trait** d'une poignée à l'autre — le seul geste qui décide
 *     d'une dépendance. Déplacer un bloc n'est que de la mise en page, et un
 *     rattachement déclenché par un simple survol la rendrait impraticable ;
 *   · **faire glisser un croyant** de la liste sur un bloc — la désignation.
 *
 * Chargé en différé par `organigramme-loader` (règle 7).
 */

const TYPES_NOEUDS = { poste: NoeudPoste };

/** Ce que le plan enregistre : les blocs posés, avec leur position et leur lien. */
type Liens = Record<string, string | null>;

/** Ce que porte un bloc. Hors du composant : une donnée de nœud n'a pas d'état. */
function donneesNoeud(
  poste: PosteBureau,
  membre: MembreBureau | null,
  urls: Record<string, string>,
  actions: {
    modifiable: boolean;
    surDesigner: (fonctionId: string) => void;
    surDeposerCroyant: (fonctionId: string, croyantId: string) => void;
    surRetirerTitulaire: (fonctionId: string) => void;
    surOterDuPlan: (fonctionId: string) => void;
  },
  /**
   * EF-BUR-07 — le poste se dessine A COTE DU TRONC de son supérieur.
   *
   * Il vit dans la donnée du NŒUD, et non dans un état séparé : `plan()` lit
   * déjà les nœuds pour composer ce qu'on enregistre, si bien que le drapeau
   * suit le bloc partout — ajout, retrait, repositionnement — sans qu'aucun
   * des six points d'écriture n'ait à le savoir.
   */
  enDerivation = false,
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
          photoUrl: croyant.photo_key ? (urls[croyant.photo_key] ?? null) : null,
        }
      : null,
    anciennete: poste.mandat ? ancienneteMandat(poste.mandat.dateDebut) : '',
    peutGerer: actions.modifiable,
    surDesigner: actions.surDesigner,
    surDeposerCroyant: actions.surDeposerCroyant,
    surRetirerTitulaire: actions.surRetirerTitulaire,
    surOterDuPlan: actions.surOterDuPlan,
    enDerivation,
  };
}

function plan(noeuds: Node[], liens: Liens): DispositionPoste[] {
  return noeuds.map((noeud) => ({
    fonctionId: noeud.id,
    parentFonctionId: liens[noeud.id] ?? null,
    x: noeud.position.x,
    y: noeud.position.y,
    /**
     * EF-BUR-07 — le drapeau vient de la donnée du nœud, comme le reste.
     *
     * UNE DÉRIVATION SANS SUPÉRIEUR N'EN EST PAS UNE : il n'y a pas de tronc
     * auquel s'accrocher. Détacher un bloc marqué le remet donc dans la
     * rangée, ici plutôt qu'en base — la contrainte de `0064` refuserait
     * l'écriture entière, et le plan serait perdu pour un détail de dessin.
     */
    enDerivation:
      Boolean((noeud.data as { enDerivation?: boolean }).enDerivation) &&
      Boolean(liens[noeud.id]),
  }));
}

function Editeur({
  bureau,
  fonctions,
  candidats,
  photos,
  dispositionInitiale,
  peutGerer,
  joursDelai,
}: {
  bureau: BureauComplet;
  fonctions: FonctionBureau[];
  candidats: CandidatOption[];
  photos: Record<string, string>;
  dispositionInitiale: DispositionPoste[];
  peutGerer: boolean;
  /** EF-BUR-08 — délai de correction, pour le pop-up de retrait de titulaire. */
  joursDelai: number;
}) {
  const router = useRouter();
  const { screenToFlowPosition, deleteElements } = useReactFlow();
  const [enCours, demarrer] = useTransition();

  const [recherche, setRecherche] = useState('');
  const [aretesSelectionnees, setAretesSelectionnees] = useState<string[]>([]);
  const [aDesigner, setADesigner] = useState<string | null>(null);
  /** EF-BUR-08 — le titulaire qu'on s'apprête à retirer, et depuis quand il l'est. */
  const [aRetirer, setARetirer] = useState<{
    id: string;
    nom: string;
    fonction: string;
    enregistreLe: string;
  } | null>(null);
  /**
   * Ce qui est en train de se faire. Une désignation touche la base puis
   * attend le re-rendu : sans pop-up, le glisser-déposer se termine et rien ne
   * bouge pendant plusieurs secondes — l'utilisateur recommence.
   */
  const [operation, setOperation] = useState<{ titre: string; description: string } | null>(
    null,
  );

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

  const parMandat = useMemo(
    () => new Map(bureau.membres.map((m) => [m.id, m])),
    [bureau.membres],
  );
  const parFonction = useMemo(
    () => new Map(postes.map((p) => [p.fonction.id, p])),
    [postes],
  );

  /**
   * Désignation. Le rafraîchissement remonte la page, dont l'éditeur repart
   * avec la composition à jour — voir la clé de remontage dans la page.
   */
  /**
   * Une opération, son libellé et son attente, noués au même endroit — comme
   * sur l'écran des bureaux. Deux états réglés séparément finissent toujours
   * par se contredire.
   */
  const lancer = useCallback(
    (
      annonce: { titre: string; description: string },
      executer: () => Promise<{ ok: boolean; error?: string }>,
      succes: string,
    ) => {
      setOperation(annonce);
      demarrer(async () => {
        const resultat = await executer();
        if (!resultat.ok) {
          setOperation(null);
          avertir(resultat.error ?? "L'opération a échoué.");
          return;
        }
        toast.success(succes);
        router.refresh();
        setOperation(null);
      });
    },
    [router],
  );

  const designer = useCallback(
    (fonctionId: string, croyantId: string) => {
      lancer(
        {
          titre: 'Désignation en cours…',
          description: 'Le mandat est ouvert, puis la composition se rafraîchit.',
        },
        // RG-08, RG-09 — le refus vient du serveur et reste explicite ; il ne
        // se devine pas d'un bloc resté vacant.
        () => designerMembre({ bureauId: bureau.id, croyantId, fonctionId, notes: '' }),
        'Titulaire désigné.',
      );
    },
    [bureau.id, lancer],
  );

  /**
   * EF-BUR-08 — LE MÊME POP-UP QU'AILLEURS, ET C'EST TOUT L'OBJET DE LA
   * RÈGLE 16.
   *
   * Il avait d'abord été posé ici un motif d'office — « retiré depuis
   * l'organigramme » —, au prétexte que le choix appartenait à l'écran de
   * composition. C'était l'inverse de ce que dit la règle : deux entrées pour
   * la MÊME opération qui n'agissent pas pareil, c'est exactement la divergence
   * qu'elle interdit. Une désignation fautive corrigée depuis le plan laissait
   * un mandat d'un jour dans la frise du croyant, là où le même geste fait deux
   * écrans plus loin l'effaçait.
   *
   * Un seul chemin : le pop-up décide, ici comme là-bas.
   */
  const retirerTitulaire = useCallback(
    (fonctionId: string) => {
      const poste = parFonction.get(fonctionId);
      const membreId = poste?.mandat?.id;
      if (!membreId) return;

      const membre = parMandat.get(membreId);
      const croyant = membre?.croyant;

      setARetirer({
        id: membreId,
        nom: croyant ? `${croyant.nom} ${croyant.prenom}`.trim() : 'ce membre',
        fonction: poste!.fonction.libelle,
        // La date d'ENREGISTREMENT, pas celle de début : elle seule ouvre — ou
        // ferme — la fenêtre de quinze jours.
        enregistreLe: membre?.created_at ?? '',
      });
    },
    [parFonction, parMandat],
  );

  /** Ce que le pop-up a décidé — voir `RetraitDialog`. */
  const confirmerRetrait = useCallback(
    (nature: MotifRetrait, motif: string | null) => {
      const cible = aRetirer;
      if (!cible) return;

      setARetirer(null);
      lancer(
        nature === 'ERREUR'
          ? {
              titre: 'Effacement de la désignation…',
              description:
                'La désignation est retirée sans trace : rien n’entrera dans l’historique du croyant.',
            }
          : {
              titre: 'Retrait du titulaire…',
              description:
                'Son mandat est clos à ce jour et reste dans son historique ; la fonction redevient vacante.',
            },
        () => retirerMembre({ membreId: cible.id, nature, motif }),
        nature === 'ERREUR'
          ? 'Désignation effacée. Rien n’a été inscrit dans l’historique du croyant.'
          : 'Mandat clos. La fonction est vacante.',
      );
    },
    [aRetirer, lancer],
  );

  /**
   * Ôter un bloc passe par `deleteElements` plutôt que par notre état.
   *
   * Un SEUL chemin de retrait (règle 16) : le menu et la touche Suppr.
   * déclenchent la même suite `onBeforeDelete` → `onNodesDelete`, donc le même
   * refus quand le poste est occupé et le même enregistrement ensuite. Écrire
   * un second chemin ici l'aurait fait diverger du premier.
   */
  const oterDuPlan = useCallback(
    (fonctionId: string) => void deleteElements({ nodes: [{ id: fonctionId }] }),
    [deleteElements],
  );

  const construireNoeud = useCallback(
    (poste: PosteBureau, x: number, y: number, enDerivation = false): Node => ({
      id: poste.fonction.id,
      type: 'poste',
      position: { x, y },
      data: donneesNoeud(
        poste,
        (poste.mandat ? parMandat.get(poste.mandat.id) : undefined) ?? null,
        photos,
        {
          modifiable,
          surDesigner: setADesigner,
          surDeposerCroyant: designer,
          surRetirerTitulaire: retirerTitulaire,
          surOterDuPlan: oterDuPlan,
        },
        enDerivation,
      ),
    }),
    [parMandat, photos, modifiable, designer, retirerTitulaire, oterDuPlan],
  );

  /**
   * État INITIAL seulement : la suite appartient à React Flow.
   *
   * Un bureau jamais dessiné démarre sur un plan VIDE et une palette pleine —
   * c'est l'utilisateur qui décide des blocs, pas une disposition devinée.
   */
  const planInitial = useMemo(
    () => nettoyerDisposition(postes, dispositionInitiale),
    [postes, dispositionInitiale],
  );

  const [noeuds, setNoeuds, surChangementNoeuds] = useNodesState<Node>(
    planInitial.map((place) =>
      construireNoeud(
        parFonction.get(place.fonctionId)!,
        place.x,
        place.y,
        place.enDerivation,
      ),
    ),
  );

  const [liens, setLiens] = useState<Liens>(() =>
    Object.fromEntries(planInitial.map((d) => [d.fonctionId, d.parentFonctionId])),
  );

  /**
   * EF-BUR-07 — poser un bloc EN DÉRIVATION, ou le remettre dans la rangée.
   *
   * Le geste ne touche NI la parenté NI la position : un adjoint reste enfant
   * de son supérieur, et l'impression le replacera d'elle-même. À l'écran il
   * garde la place où on l'a mis — un plan de travail n'est pas un document
   * (règle 33).
   */
  const basculerDerivation = useCallback(
    (fonctionId: string) => {
      setNoeuds((precedents) =>
        precedents.map((n) =>
          n.id === fonctionId
            ? {
                ...n,
                data: {
                  ...n.data,
                  enDerivation: !(n.data as { enDerivation?: boolean }).enDerivation,
                },
              }
            : n,
        ),
      );
    },
    [setNoeuds],
  );

  /**
   * LE GESTIONNAIRE S'INJECTE AU RENDU, LE DRAPEAU VIT DANS LA DONNÉE.
   *
   * Le mettre dans `construireNoeud` l'aurait fait capturer par l'initialisateur
   * d'état — donc lu avant sa propre déclaration, puisqu'il a besoin de
   * `setNoeuds`. La distinction est juste par ailleurs : `enDerivation` est un
   * fait qu'on enregistre, `surBasculerDerivation` une capacité du rendu
   * courant. Seul le premier a sa place dans l'état.
   */
  const noeudsAffiches = useMemo(
    () =>
      noeuds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          surBasculerDerivation: basculerDerivation,
          aUnSuperieur: Boolean(liens[n.id]),
        },
      })),
    [noeuds, liens, basculerDerivation],
  );

  /**
   * Dernier plan écrit. Un déplacement qui revient à sa place, un lien refait
   * à l'identique : sans cette signature, chaque geste partirait en écriture,
   * y compris ceux qui ne changent rien.
   */
  const dernierEcrit = useRef(JSON.stringify(planInitial));

  const enregistrer = useCallback(
    (noeudsAEcrire: Node[], liensAEcrire: Liens) => {
      const suivant = plan(noeudsAEcrire, liensAEcrire);
      const signature = JSON.stringify(suivant);
      if (signature === dernierEcrit.current) return;
      dernierEcrit.current = signature;

      demarrer(async () => {
        const resultat = await enregistrerDisposition({
          bureauId: bureau.id,
          postes: suivant,
        });
        if (!resultat.ok) {
          // La base a refusé : la signature ne doit pas rester, sinon le
          // prochain geste identique se croirait déjà enregistré.
          dernierEcrit.current = '';
          avertir(resultat.error);
        }
      });
    },
    [bureau.id],
  );

  const libelleDe = useCallback(
    (fonctionId: string) => parFonction.get(fonctionId)?.fonction.libelle ?? 'cette fonction',
    [parFonction],
  );

  // --- Palette : les fonctions applicables PAS ENCORE posées -------------------

  const poses = useMemo(() => new Set(noeuds.map((n) => n.id)), [noeuds]);

  /** EF-BUR-07 — ceux qui reçoivent leur trait par le côté, et non par le haut. */
  const enDerivation = useMemo(
    () =>
      new Set(
        noeuds
          .filter((n) => (n.data as { enDerivation?: boolean }).enDerivation)
          .map((n) => n.id),
      ),
    [noeuds],
  );
  const palette = useMemo(
    () => postes.filter((p) => !poses.has(p.fonction.id)),
    [postes, poses],
  );

  const poser = useCallback(
    (fonctionId: string, position: { x: number; y: number }) => {
      const poste = parFonction.get(fonctionId);
      if (!poste || poses.has(fonctionId)) return;

      const suivants = [...noeuds, construireNoeud(poste, position.x, position.y)];
      const suivantsLiens = { ...liens, [fonctionId]: null };
      setNoeuds(suivants);
      setLiens(suivantsLiens);
      enregistrer(suivants, suivantsLiens);
    },
    [parFonction, poses, noeuds, liens, construireNoeud, setNoeuds, enregistrer],
  );

  // --- Le plan ----------------------------------------------------------------

  const aretes: Edge[] = useMemo(
    () =>
      Object.entries(liens)
        .filter(([fonctionId, parent]) => parent !== null && poses.has(fonctionId))
        .map(([fonctionId, parent]) => {
          const id = `${parent}-${fonctionId}`;
          const choisie = aretesSelectionnees.includes(id);
          const parentNoeud = noeuds.find((n) => n.id === parent);
          const enfantNoeud = noeuds.find((n) => n.id === fonctionId);
          const estAGaucheDuParent =
            parentNoeud && enfantNoeud && enfantNoeud.position.x < parentNoeud.position.x;
          const memeNiveauY =
            parentNoeud &&
            enfantNoeud &&
            Math.abs(enfantNoeud.position.y - parentNoeud.position.y) < 70;

          let sourceHandle = 'source-bas';
          let targetHandle = 'haut';

          if (enDerivation.has(fonctionId)) {
            if (memeNiveauY) {
              // Règle 4 et 5 : trait horizontal direct de boîte à boîte
              if (estAGaucheDuParent) {
                sourceHandle = 'source-gauche';
                targetHandle = 'droite';
              } else {
                sourceHandle = 'source-droite';
                targetHandle = 'gauche';
              }
            } else {
              // Règle 2 et 3 : dérivation intermédiaire depuis le tronc
              sourceHandle = 'source-bas';
              targetHandle = estAGaucheDuParent ? 'droite' : 'gauche';
            }
          } else {
            // Règle 1 : liaison hiérarchique verticale ordinaire
            sourceHandle = 'source-bas';
            targetHandle = 'haut';
          }

          return {
            id,
            source: parent!,
            sourceHandle,
            target: fonctionId,
            targetHandle,
            type: 'smoothstep',
            selected: choisie,
            style: {
              stroke: choisie ? '#4f46e5' : '#cbd5e1',
              strokeWidth: choisie ? 2.5 : 1.5,
            },
          };
        }),
    [liens, poses, enDerivation, aretesSelectionnees, noeuds],
  );

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

  /** Fin de déplacement : c'est LÀ qu'on reprend les positions, et pas avant. */
  const surFinDeplacement = useCallback(
    () => enregistrer(noeuds, liens),
    [noeuds, liens, enregistrer],
  );

  const relier = useCallback(
    (fonctionId: string, parentId: string | null, parLaGauche = false) => {
      if (parentId !== null) {
        const verdict = validerLien(
          { id: fonctionId, libelle: libelleDe(fonctionId) },
          { id: parentId, libelle: libelleDe(parentId) },
          plan(noeuds, liens),
        );
        if (!verdict.ok) {
          avertir(verdict.error);
          return;
        }
      }

      /**
       * EF-BUR-07 — LA POIGNÉE DE GAUCHE **EST** LE GESTE.
       *
       * Le premier jet ne proposait « Poser en dérivation » qu'au menu ⋮, et
       * seulement une fois le bloc relié. Personne ne pouvait le deviner : pour
       * obtenir un adjoint il fallait relier normalement, puis chercher une
       * entrée de menu dont rien n'annonçait l'existence.
       *
       * Déposer le trait sur le côté gauche pose donc la dérivation
       * directement. Le menu reste, pour défaire — et pour ceux qui ont relié
       * d'abord.
       */
      const noeudsSuivants = noeuds.map((n) =>
        n.id === fonctionId
          ? { ...n, data: { ...n.data, enDerivation: parLaGauche } }
          : n,
      );

      setNoeuds(noeudsSuivants);

      const suivants = { ...liens, [fonctionId]: parentId };
      setLiens(suivants);
      enregistrer(noeudsSuivants, suivants);
    },
    [noeuds, liens, libelleDe, enregistrer, setNoeuds],
  );

  const resoudreSensConnexion = useCallback(
    (
      connexion: Connection | Edge,
    ): {
      valide: boolean;
      subordonneId: string;
      superieurId: string;
      parLaDerivation: boolean;
      erreur?: string;
    } => {
      if (!connexion.source || !connexion.target) {
        return { valide: false, subordonneId: '', superieurId: '', parLaDerivation: false };
      }

      const sourceId = connexion.source;
      const targetId = connexion.target;
      const disposition = plan(noeuds, liens);

      const sourceHandle = connexion.sourceHandle ?? '';
      const targetHandle = connexion.targetHandle ?? '';

      const estDerivation =
        targetHandle === 'gauche' ||
        targetHandle === 'droite' ||
        sourceHandle === 'source-gauche' ||
        sourceHandle === 'source-droite';

      // 1. Sens normal : de la source (supérieur) vers la cible (subordonné)
      const verdictDirect = validerLien(
        { id: targetId, libelle: libelleDe(targetId) },
        { id: sourceId, libelle: libelleDe(sourceId) },
        disposition,
      );

      if (verdictDirect.ok) {
        return {
          valide: true,
          subordonneId: targetId,
          superieurId: sourceId,
          parLaDerivation: estDerivation,
        };
      }

      // 2. Si tiré à l'envers : de la cible (supérieur) vers la source (subordonné)
      const verdictInverse = validerLien(
        { id: sourceId, libelle: libelleDe(sourceId) },
        { id: targetId, libelle: libelleDe(targetId) },
        disposition,
      );

      if (verdictInverse.ok) {
        return {
          valide: true,
          subordonneId: sourceId,
          superieurId: targetId,
          parLaDerivation: estDerivation,
        };
      }

      const erreur = !verdictDirect.ok
        ? verdictDirect.error
        : !verdictInverse.ok
          ? verdictInverse.error
          : undefined;

      return {
        valide: false,
        subordonneId: targetId,
        superieurId: sourceId,
        parLaDerivation: estDerivation,
        erreur,
      };
    },
    [noeuds, liens, libelleDe],
  );

  const connexionValide = useCallback(
    (connexion: Connection | Edge) => resoudreSensConnexion(connexion).valide,
    [resoudreSensConnexion],
  );

  /** Retirer un trait détache le bloc : il redevient une racine. */
  const surSuppressionAretes = useCallback(
    (supprimees: Edge[]) => {
      const suivants = { ...liens };
      for (const arete of supprimees) suivants[arete.target] = null;
      setLiens(suivants);
      setAretesSelectionnees([]);
      enregistrer(noeuds, suivants);
    },
    [noeuds, liens, enregistrer],
  );

  /**
   * Retirer un bloc du plan. Un poste OCCUPÉ ne se retire pas ainsi : cela
   * reviendrait à démettre quelqu'un par un raccourci clavier, sans trace et
   * sans le dire. Le retrait du titulaire a son propre geste (EF-BUR-08).
   */
  const surAvantSuppression = useCallback(
    async ({ nodes }: { nodes: Node[] }) => {
      const occupe = nodes.find((n) => parFonction.get(n.id)?.mandat);
      if (occupe) {
        avertir(
          `« ${libelleDe(occupe.id)} » a un titulaire en fonction. Retirez-le du bureau avant d'ôter son bloc du plan.`,
        );
        return false;
      }
      return true;
    },
    [parFonction, libelleDe],
  );

  const surSuppressionNoeuds = useCallback(
    (supprimes: Node[]) => {
      // `retirerPoste` racine les subordonnés du bloc ôté : les emporter avec
      // lui effacerait une branche entière que le geste ne visait pas.
      let restant = plan(noeuds, liens);
      for (const noeud of supprimes) restant = retirerPoste(restant, noeud.id);

      const retires = new Set(supprimes.map((n) => n.id));
      const suivantsLiens = Object.fromEntries(
        restant.map((d) => [d.fonctionId, d.parentFonctionId]),
      );

      setLiens(suivantsLiens);
      enregistrer(
        noeuds.filter((n) => !retires.has(n.id)),
        suivantsLiens,
      );
    },
    [noeuds, liens, enregistrer],
  );

  /**
   * EF-BUR-11 — meme impression que le pop-up de composition, meme fonction.
   *
   * `photos` porte les URL signees deja affichees a l'ecran : elles sont
   * converties en `data:` avant l'ouverture de la feuille, sans quoi les
   * portraits n'arriveraient pas a temps.
   */
  const versImpression = useCallback(() => {
    void imprimerOrganigramme(bureau, postes, plan(noeuds, liens), photos);
  }, [bureau, postes, noeuds, liens, photos]);

  /**
   * Pose ce qui MANQUE, et rien d'autre.
   *
   * Le bouton repartait d'une grille neuve sur tous les postes : les traits
   * déjà tirés — la seule chose qu'aucune donnée ne porte, depuis le retrait du
   * rang protocolaire — disparaissaient d'un clic, et il fallait retracer toute
   * la hiérarchie. Il n'ajoute plus que les blocs absents, sous les autres.
   */
  const poserLesManquantes = useCallback(() => {
    if (palette.length === 0) return;

    const ajouts = disposerLesManquantes(palette, plan(noeuds, liens));
    const suivants = [
      ...noeuds,
      ...ajouts
        .map((d) => {
          const poste = parFonction.get(d.fonctionId);
          return poste ? construireNoeud(poste, d.x, d.y) : null;
        })
        .filter((n) => n !== null),
    ];
    const suivantsLiens = {
      ...liens,
      ...Object.fromEntries(ajouts.map((d) => [d.fonctionId, d.parentFonctionId])),
    };

    setNoeuds(suivants);
    setLiens(suivantsLiens);
    enregistrer(suivants, suivantsLiens);
    toast.success(
      ajouts.length > 1
        ? `${ajouts.length} fonctions posées. Les liens existants sont intacts.`
        : 'Fonction posée. Les liens existants sont intacts.',
    );
  }, [palette, noeuds, liens, parFonction, construireNoeud, setNoeuds, enregistrer]);

  // --- Croyants éligibles ------------------------------------------------------

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
    <div className="grid gap-6 lg:grid-cols-[19rem_1fr_19rem]">
      {/* --- Palette des fonctions --------------------------------------------- */}
      <aside className="space-y-3">
        <div className="border-border space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">Fonctions à poser</p>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">
              {palette.length}
            </span>
          </div>

          <p className="text-muted-foreground text-xs">
            EF-REF-03 — celles qui s&apos;appliquent au niveau{' '}
            {bureau.entite?.type.toLocaleLowerCase('fr')}. Faites-en glisser une sur le
            plan pour l&apos;y placer.
          </p>

          <ul className="max-h-[30rem] space-y-1 overflow-y-auto">
            {palette.length === 0 && (
              <li className="text-muted-foreground py-4 text-center text-xs">
                Toutes les fonctions applicables sont posées.
              </li>
            )}

            {palette.map((poste) => (
              <li key={poste.fonction.id}>
                <div
                  draggable={modifiable}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TYPE_FONCTION_GLISSE, poste.fonction.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-md border border-dashed p-2 transition-colors',
                    modifiable
                      ? 'cursor-grab border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 active:cursor-grabbing'
                      : 'border-slate-200 opacity-70',
                  )}
                >
                  <GripVertical className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block truncate text-sm">
                      {poste.fonction.libelle}
                    </span>
                  </span>
                  {poste.fonction.estFinanciere && (
                    <StatusBadge tone="accent">Fin.</StatusBadge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          {/* Désactivé quand la palette est vide : le bouton n'aurait plus rien
              à ajouter, et son seul effet possible serait de défaire. */}
          {modifiable && (
            <Button
              variant="outline"
              className="h-9 w-full"
              onClick={poserLesManquantes}
              disabled={palette.length === 0}
              title={
                palette.length === 0
                  ? 'Toutes les fonctions applicables sont déjà posées.'
                  : undefined
              }
            >
              <LayoutGrid className="mr-2 size-4" aria-hidden />
              Poser les manquantes
            </Button>
          )}

          {/* EF-BUR-11 — le plan ENTIER, pas la portion visible à l'écran. */}
          <Button variant="outline" className="h-9 w-full" onClick={versImpression}>
            <Printer className="mr-2 size-4" aria-hidden />
            Imprimer / PDF
          </Button>
        </div>
      </aside>

      {/* --- Le plan ------------------------------------------------------------ */}
      <div
        className="border-border h-[38rem] overflow-hidden rounded-xl border bg-slate-50/60"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(e) => {
          const fonctionId = e.dataTransfer.getData(TYPE_FONCTION_GLISSE);
          if (!fonctionId) return;
          e.preventDefault();
          // Le bloc se pose LÀ où on le lâche : convertir les coordonnées de
          // l'écran vers celles du plan tient compte du zoom et du décalage.
          poser(fonctionId, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
        }}
      >
        <ReactFlow
          nodes={noeudsAffiches}
          edges={aretes}
          nodeTypes={TYPES_NOEUDS}
          onNodesChange={surChangementNoeuds}
          onNodeDragStop={surFinDeplacement}
          onEdgesChange={surChangementAretes}
          onConnect={(c) => {
            const res = resoudreSensConnexion(c);
            if (!res.valide) {
              if (res.erreur) avertir(res.erreur);
              return;
            }
            relier(res.subordonneId, res.superieurId, res.parLaDerivation);
          }}
          isValidConnection={connexionValide}
          onBeforeDelete={surAvantSuppression}
          onNodesDelete={surSuppressionNoeuds}
          onEdgesDelete={surSuppressionAretes}
          nodesDraggable={modifiable}
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

      {/* --- Croyants éligibles -------------------------------------------------- */}
      <aside className="space-y-3">
        <div className="border-border space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">Croyants éligibles</p>
            {enCours && !operation && (
              // Un enregistrement de plan est discret : il ne bloque rien, et
              // n'a pas à s'annoncer par un pop-up.
              <span className="text-muted-foreground text-xs">Enregistrement…</span>
            )}
          </div>

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

          <ul className="max-h-[26rem] space-y-1 overflow-y-auto">
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
            Sélectionnez un trait ou un bloc, puis Suppr. Un trait détaché rend le bloc
            racine ; un bloc ôté retourne dans la palette.
          </p>
        )}
      </aside>

      {/* Une désignation part d'un glisser-déposer : le geste se termine et
          rien ne bouge tant que la base n'a pas répondu. Le pop-up dit ce qui
          se passe et empêche de recommencer par-dessus. */}
      <OperationDialog
        // Ne depend QUE de `operation` : une designation partie du glisser-deposer
        // ou de `ConfirmDialog` ne fait pas toujours basculer `isPending`.
        ouvert={operation !== null}
        titre={operation?.titre ?? ''}
        description={operation?.description}
      />

      {/* Le MÊME dialogue que la vue tabulaire (règle 16). */}
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

      {/* EF-BUR-08 — celui-là aussi est partagé : effacer une désignation
          fautive ou clore un mandat motivé se décide au même endroit, quel que
          soit l'écran d'où l'on part. */}
      <RetraitDialog
        cible={aRetirer}
        enCours={operation !== null}
        onAnnuler={() => setARetirer(null)}
        onConfirmer={confirmerRetrait}
        joursDelai={joursDelai}
      />
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
  /** EF-BUR-08 — délai de correction, pour le pop-up de retrait de titulaire. */
  joursDelai: number;
}) {
  return (
    <ReactFlowProvider>
      <Editeur {...props} />
    </ReactFlowProvider>
  );
}
