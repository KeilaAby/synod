'use client';

import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  CloudOff,
  FileType,
  GripVertical,
  Loader2,
  Lock,
  Plus,
  Printer,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { ApercuPanneau } from '@/components/rapports/apercu-panneau';
import {
  ICONES_BLOC,
  PaletteBlocs,
  TYPE_BLOC_NEUF,
  TYPE_BLOC_POSE,
} from '@/components/rapports/palette-blocs';
import {
  ReglagesBlocDialog,
  ReglagesDocumentDialog,
} from '@/components/rapports/reglages-dialog';
import type { EnteteRapport } from '@/components/rapports/rendu-rapport';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { avertir } from '@/components/shared/messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { enregistrerStructure } from '@/lib/actions/rapports';
import {
  type BlocRapport,
  type LargeurBloc,
  type SectionRapport,
  type StructureRapport,
  type TypeBloc,
  ajouterBloc,
  ajouterSection,
  definitionBloc,
  deplacerBloc,
  deplacerBlocDUnRang,
  deplacerSection,
  reglerBloc,
  reglerLargeur,
  renommerSection,
  retirerBloc,
  retirerSection,
  trouverBloc,
} from '@/lib/domain/rapport';
import { appelerAction } from '@/lib/utils/appeler-action';
import { cn } from '@/lib/utils';

/**
 * L'éditeur de modèle — EF-RAP-01, EF-RAP-04.
 *
 * TROIS PANNEAUX : ce qu'on peut poser, ce qu'on a posé, ce qu'on règle. C'est
 * la disposition annoncée par `plan.md` §9.6, et celle que le squelette
 * dessine — un squelette qui mentirait ferait sauter la page au moment où les
 * données se posent.
 *
 * TOUTE LA MÉCANIQUE EST DANS LE DOMAINE. Déplacer un bloc, c'est réécrire un
 * tableau : `deplacerBloc`, `ajouterBloc`, `reglerLargeur` sont des fonctions
 * pures, testées sans navigateur. Ce composant ne fait que les appeler et
 * rendre le résultat — ce qui part en base est décidé là-bas, où on peut le
 * vérifier.
 *
 * LE GLISSER-DÉPOSER EST NATIF (règle 29). Le tableau de bord l'a montré :
 * quelques `dataTransfer` suffisent, contre les dizaines de kilooctets d'une
 * bibliothèque. Et il est **doublé au clavier** — poser depuis la palette par
 * un clic, réordonner les sections par deux flèches : un éditeur qui n'obéit
 * qu'au pointeur n'est un éditeur que pour ceux qui ont une souris.
 */

/**
 * Six colonnes, comme le tableau de bord — et pour la même raison : 6 se divise
 * par 1, 2 et 3, soit exactement les trois largeurs d'EF-RAP-04. Les classes
 * sont LITTÉRALES : Tailwind lit le source, un `col-span-${n}` n'existe dans
 * aucune feuille.
 */
const CLASSES_LARGEUR: Record<LargeurBloc, string> = {
  PLEINE: 'col-span-6',
  DEMI: 'col-span-3',
  TIERS: 'col-span-2',
};

type EtatEnregistrement = 'repos' | 'en-attente' | 'en-cours' | 'enregistre' | 'echec';

/** Le temps d'arrêt de frappe au bout duquel on écrit. */
const DELAI_SAUVEGARDE_MS = 1200;

/**
 * La largeur de l'aperçu — EF-RAP-05.
 *
 * 560 px et non les 384 px d'un panneau ordinaire : une feuille A4 fait 210 mm,
 * soit environ 794 px. À 384 px elle tenait à 48 %, et un texte composé en
 * 10 pt y descendait sous les six pixels — on voyait des masses grises, pas un
 * document. À 560 px on est à 70 %, et les intertitres se lisent.
 *
 * Le plancher garde une feuille encore reconnaissable ; le plafond garde à la
 * COMPOSITION de quoi travailler, puisque c'est elle qu'on manipule.
 */
const LARGEUR_APERCU_DEFAUT = 560;
const LARGEUR_APERCU_MIN = 320;
const LARGEUR_APERCU_MAX = 900;

/** La largeur choisie se retient : on ne la repose pas à chaque ouverture. */
const CLE_LARGEUR = 'synod:rapport-apercu-largeur';

/**
 * `localStorage` est un système EXTERNE à React — même idiome que la barre
 * latérale : on s'y abonne plutôt que d'en recopier l'état dans un `useState`
 * par un effet. Un `setState` synchrone dans un effet déclenche une cascade de
 * rendus, qu'ESLint refuse ici à juste titre.
 *
 * La valeur est GARDÉE EN MÉMOIRE : pendant un glisser, `useSyncExternalStore`
 * relit à chaque rendu, et relire `localStorage` soixante fois par seconde
 * coûterait plus que le réglage lui-même.
 */
let largeurEnMemoire: number | null = null;
const abonnesLargeur = new Set<() => void>();

function abonnerLargeur(callback: () => void) {
  abonnesLargeur.add(callback);
  window.addEventListener('storage', callback);
  return () => {
    abonnesLargeur.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

function lireLargeur(): number {
  if (largeurEnMemoire === null) {
    const memorisee = Number(window.localStorage.getItem(CLE_LARGEUR));
    // Une valeur hors bornes vient d'une version antérieure ou d'une main
    // curieuse : on retombe sur le défaut plutôt que sur un panneau inutilisable.
    largeurEnMemoire =
      memorisee >= LARGEUR_APERCU_MIN && memorisee <= LARGEUR_APERCU_MAX
        ? memorisee
        : LARGEUR_APERCU_DEFAUT;
  }
  return largeurEnMemoire;
}

function ecrireLargeur(valeur: number) {
  largeurEnMemoire = valeur;
  window.localStorage.setItem(CLE_LARGEUR, String(valeur));
  for (const notifier of abonnesLargeur) notifier();
}

export function EditeurClient({
  modeleId,
  nom,
  version,
  structureInitiale,
  entete,
  modifiable,
  motifLectureSeule,
}: {
  modeleId: string;
  nom: string;
  version: number;
  structureInitiale: StructureRapport;
  /** EF-RAP-05 — ce que l'aperçu porte en tête de chaque feuille. */
  entete: EnteteRapport;
  modifiable: boolean;
  /** Pourquoi l'édition est fermée. `null` quand elle est ouverte. */
  motifLectureSeule: string | null;
}) {
  const [structure, setStructure] = useState(structureInitiale);
  const [selection, setSelection] = useState<string | null>(null);
  const [etat, setEtat] = useState<EtatEnregistrement>('repos');
  const [saisi, setSaisi] = useState<string | null>(null);
  const [sectionASupprimer, setSectionASupprimer] = useState<SectionRapport | null>(null);
  const [reglagesDocument, setReglagesDocument] = useState(false);
  /** Le serveur rend toujours la largeur par défaut : aucune divergence. */
  const largeurApercu = useSyncExternalStore(
    abonnerLargeur,
    lireLargeur,
    () => LARGEUR_APERCU_DEFAUT,
  );

  /**
   * SÉLECTIONNER, C'EST OUVRIR SES RÉGLAGES.
   *
   * La sélection n'a pas d'autre usage dans cet éditeur : un bloc « choisi »
   * sans panneau ouvert ne servirait qu'à se souvenir de ce qu'on a cliqué.
   * L'état de sélection EST donc l'ouverture du pop-up, et le refermer
   * désélectionne — un seul état pour une seule intention.
   */
  function selectionner(blocId: string) {
    setSelection(blocId);
  }

  /**
   * La dernière composition ÉCRITE, sérialisée.
   *
   * Elle évite deux écritures inutiles : celle du tout premier rendu — sans
   * quoi ouvrir un modèle sans y toucher ferait monter sa version — et celle
   * d'une modification qui revient à son point de départ. Un `useRef` et non
   * un état : la comparer ne doit rien redessiner.
   */
  const derniereEcrite = useRef(JSON.stringify(structureInitiale));

  /**
   * L'AUTO-SAUVEGARDE — EF-RAP-01.
   *
   * Elle attend un arrêt de frappe plutôt que d'écrire à chaque caractère : ce
   * qui coûte, c'est le NOMBRE d'allers-retours, pas leur durée (règle 28).
   * Taper un paragraphe de titre en produirait quarante.
   *
   * Une écriture ne se rejoue JAMAIS en cas d'échec de transport : la requête a
   * pu aboutir et seule la réponse se perdre. L'échec s'affiche, et la frappe
   * suivante réessaiera — c'est l'utilisateur qui décide, pas une boucle.
   */
  useEffect(() => {
    if (!modifiable) return;

    const serialisee = JSON.stringify(structure);
    if (serialisee === derniereEcrite.current) return;

    setEtat('en-attente');
    const minuteur = setTimeout(async () => {
      setEtat('en-cours');
      const resultat = await appelerAction(() =>
        enregistrerStructure({ modeleId, structure }),
      );

      if (!resultat.ok) {
        setEtat('echec');
        avertir(resultat.error);
        return;
      }

      derniereEcrite.current = serialisee;
      setEtat('enregistre');
    }, DELAI_SAUVEGARDE_MS);

    return () => clearTimeout(minuteur);
  }, [structure, modeleId, modifiable]);

  /**
   * `beforeunload` — fermer l'onglet pendant l'attente perdrait la frappe.
   *
   * Le navigateur n'affiche que son propre message, et seulement si l'onglet a
   * reçu une interaction : c'est peu, mais c'est la seule chose qui existe.
   */
  useEffect(() => {
    if (etat !== 'en-attente' && etat !== 'en-cours') return;

    const garde = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', garde);
    return () => window.removeEventListener('beforeunload', garde);
  }, [etat]);

  /** Toute modification passe par ici : un seul chemin vers l'état. */
  function poser(suivante: StructureRapport) {
    if (!modifiable) return;
    setStructure(suivante);
  }

  const sectionCourante =
    structure.sections.find((s) => s.blocs.some((b) => b.id === selection)) ??
    structure.sections[structure.sections.length - 1];

  function ajouterDepuisPalette(type: TypeBloc) {
    if (!sectionCourante) return;
    poser(ajouterBloc(structure, sectionCourante.id, type));
  }

  function deposer(sectionId: string, rang: number, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    const neuf = e.dataTransfer.getData(TYPE_BLOC_NEUF);
    if (neuf) {
      poser(ajouterBloc(structure, sectionId, neuf as TypeBloc, rang));
      return;
    }

    const pose = e.dataTransfer.getData(TYPE_BLOC_POSE);
    if (pose) poser(deplacerBloc(structure, pose, sectionId, rang));
  }

  const blocSelectionne = trouverBloc(structure, selection);

  return (
    // `data-large` : le gabarit resserre sa gouttière et lève son plafond de
    // 1600 px. La palette et le panneau de réglages ont une largeur fixe — tout
    // ce qu'on leur retire est pris sur la composition, au milieu.
    <div data-large className="space-y-4">
      <EnTeteEditeur
        nom={nom}
        version={version}
        etat={etat}
        motifLectureSeule={motifLectureSeule}
        modifiable={modifiable}
        onReglagesDocument={() => setReglagesDocument(true)}
        // Imprimer, c'est imprimer l'aperçu du panneau : `globals.css` masque
        // le reste et le rend à l'échelle 1 (règle 16).
        onImprimer={() => window.print()}
      />

      <div
        /*
          La largeur de l'aperçu voyage en VARIABLE CSS, pas en style inline.

          Un `style={{ width }}` s'appliquerait aussi en dessous de `lg`, où les
          trois panneaux s'empilent : la feuille y serait bornée à 560 px sur un
          écran qui en offre toute la largeur. La variable est lue par la classe
          `.panneau-apercu` de `globals.css`, sous son point de rupture — donc
          au seul moment où les colonnes existent.

          Elle n'est PAS lue par un utilitaire Tailwind à valeur arbitraire :
          voir le commentaire de `.panneau-apercu` dans `globals.css`, qui dit
          pourquoi — sans réécrire la classe en question.
        */
        style={{ '--largeur-apercu': `${largeurApercu}px` } as React.CSSProperties}
        className="flex flex-col gap-4 lg:h-[calc(100vh-14rem)] lg:flex-row"
      >
        {/* --- Ce qu'on peut poser ------------------------------------------ */}
        <Card className="no-print defilement-discret shrink-0 lg:w-64 lg:overflow-y-auto">
          <CardContent className="p-4">
            {modifiable ? (
              <PaletteBlocs
                onAjouter={ajouterDepuisPalette}
                desactivee={structure.sections.length === 0}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                La palette est fermée : ce modèle est en lecture seule.
              </p>
            )}
          </CardContent>
        </Card>

        {/* --- Ce qu'on a posé ---------------------------------------------- */}
        <div className="no-print defilement-discret flex-1 space-y-4 lg:overflow-y-auto">
          {structure.sections.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
                <p className="text-sm font-semibold text-foreground">
                  Ce modèle ne contient encore aucune section
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Une section regroupe des blocs sous un intertitre. C’est elle qui reçoit
                  ce que vous tirez de la palette.
                </p>
                {modifiable && (
                  <Button className="h-10" onClick={() => poser(ajouterSection(structure))}>
                    <Plus className="mr-2 size-4" aria-hidden />
                    Ajouter une section
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            structure.sections.map((section, rangSection) => (
              <SectionCarte
                key={section.id}
                section={section}
                rang={rangSection}
                total={structure.sections.length}
                modifiable={modifiable}
                selection={selection}
                saisi={saisi}
                onRenommer={(titre) => poser(renommerSection(structure, section.id, titre))}
                onDeplacer={(pas) => poser(deplacerSection(structure, section.id, pas))}
                onSupprimer={() => setSectionASupprimer(section)}
                onSelectionner={selectionner}
                onPrendre={setSaisi}
                onLacher={() => setSaisi(null)}
                onDeposer={(rang, e) => deposer(section.id, rang, e)}
                onDeplacerBloc={(blocId, pas) =>
                  poser(deplacerBlocDUnRang(structure, blocId, pas))
                }
                onRetirerBloc={(blocId) => {
                  poser(retirerBloc(structure, blocId));
                  if (selection === blocId) setSelection(null);
                }}
              />
            ))
          )}

          {modifiable && structure.sections.length > 0 && (
            <Button
              variant="outline"
              className="h-10 w-full"
              onClick={() => poser(ajouterSection(structure))}
            >
              <Plus className="mr-2 size-4" aria-hidden />
              Ajouter une section
            </Button>
          )}
        </div>

        <PoigneeRedimension largeur={largeurApercu} onLargeur={ecrireLargeur} />

        {/*
          --- Ce qu'on obtient -----------------------------------------------

          LA COLONNE N'EST PLUS PARTAGÉE. Les réglages y disputaient la place à
          l'aperçu par un onglet : régler masquait la feuille, et voir l'effet
          demandait de rebasculer — alors que c'est exactement la boucle qu'on
          vient vérifier. Ils sont passés en pop-up, qui laisse la feuille
          visible derrière lui.
        */}
        <Card className="panneau-apercu defilement-discret shrink-0 lg:overflow-y-auto">
          <CardContent className="p-4">
            <ApercuPanneau structure={structure} entete={entete} />
          </CardContent>
        </Card>
      </div>

      {/* Régler un bloc laisse l'aperçu visible derrière : on change la forme
          d'un graphique et on voit le résultat, sans rien échanger. */}
      <ReglagesBlocDialog
        bloc={modifiable ? blocSelectionne : null}
        structure={structure}
        onReglerBloc={(reglages) =>
          selection && poser(reglerBloc(structure, selection, reglages))
        }
        onReglerLargeur={(largeur) =>
          selection && poser(reglerLargeur(structure, selection, largeur))
        }
        onFermer={() => setSelection(null)}
      />

      <ReglagesDocumentDialog
        ouvert={reglagesDocument}
        structure={structure}
        onRegler={poser}
        onOuvrir={setReglagesDocument}
      />

      {/* Supprimer une section emporte ses blocs : cela se confirme. */}
      <ConfirmDialog
        open={sectionASupprimer !== null}
        onOpenChange={(v) => !v && setSectionASupprimer(null)}
        title="Supprimer cette section ?"
        description={
          sectionASupprimer && sectionASupprimer.blocs.length > 0
            ? `Ses ${sectionASupprimer.blocs.length} bloc${sectionASupprimer.blocs.length > 1 ? 's' : ''} seront supprimés avec elle.`
            : 'Cette section est vide.'
        }
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (sectionASupprimer) poser(retirerSection(structure, sectionASupprimer.id));
          setSectionASupprimer(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * La poignée qui partage la composition et l'aperçu — EF-RAP-05.
 *
 * ELLE DÉPLACE UNE SEULE FRONTIÈRE. L'aperçu prend la largeur qu'on lui donne,
 * la composition prend le reste : elle est en `flex-1`, donc elle absorbe. Deux
 * largeurs à régler auraient demandé de savoir laquelle cède quand l'écran
 * rétrécit.
 *
 * `setPointerCapture` PLUTÔT QUE DES ÉCOUTEURS SUR LE DOCUMENT. Une poignée
 * qu'on tire vite laisse le pointeur sortir de ses quelques pixels : sans
 * capture, le `pointermove` part à l'élément survolé et le glisser s'arrête
 * tout seul, au milieu du geste. La capture le retient jusqu'au relâchement, et
 * couvre la souris comme le tactile avec le même code.
 *
 * ET AU CLAVIER. Une largeur qu'on ne peut régler qu'au pointeur n'est un
 * réglage que pour ceux qui en ont un (ENF-ACC). `role="separator"` avec ses
 * bornes annonce à quoi on touche, les flèches déplacent par pas de 32 px.
 */
function PoigneeRedimension({
  largeur,
  onLargeur,
}: {
  largeur: number;
  onLargeur: (largeur: number) => void;
}) {
  const [enCours, setEnCours] = useState(false);

  function borner(valeur: number) {
    return Math.min(LARGEUR_APERCU_MAX, Math.max(LARGEUR_APERCU_MIN, Math.round(valeur)));
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Largeur de l’aperçu"
      aria-valuenow={largeur}
      aria-valuemin={LARGEUR_APERCU_MIN}
      aria-valuemax={LARGEUR_APERCU_MAX}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setEnCours(true);
      }}
      onPointerMove={(e) => {
        if (!enCours) return;
        // La largeur se mesure depuis le bord DROIT de la fenêtre : c'est de ce
        // côté que le panneau est ancré, et la mesure reste juste quelle que
        // soit la gouttière ou la navigation repliée.
        onLargeur(borner(window.innerWidth - e.clientX));
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setEnCours(false);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        // Flèche GAUCHE = la frontière recule = l'aperçu s'agrandit.
        onLargeur(borner(largeur + (e.key === 'ArrowLeft' ? 32 : -32)));
      }}
      className={cn(
        'no-print hidden w-2 shrink-0 cursor-col-resize touch-none items-center justify-center rounded-full transition-colors lg:flex',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        enCours ? 'bg-indigo-500' : 'bg-transparent hover:bg-slate-200',
      )}
    >
      {/* Une poignée invisible ne se trouve pas : deux points la signalent
          sans occuper la place d'une barre pleine. */}
      <GripVertical className="size-4 text-slate-400" aria-hidden />
    </div>
  );
}

/**
 * L'en-tête dit TOUJOURS où en est l'enregistrement.
 *
 * Une auto-sauvegarde muette est pire que pas d'auto-sauvegarde : on ne sait
 * pas si l'on peut fermer l'onglet. Les cinq états se nomment, et l'échec ne
 * disparaît pas tout seul.
 */
function EnTeteEditeur({
  nom,
  version,
  etat,
  motifLectureSeule,
  modifiable,
  onReglagesDocument,
  onImprimer,
}: {
  nom: string;
  version: number;
  etat: EtatEnregistrement;
  motifLectureSeule: string | null;
  modifiable: boolean;
  onReglagesDocument: () => void;
  onImprimer: () => void;
}) {
  return (
    <div className="no-print flex flex-wrap items-center gap-4">
      <Button asChild variant="ghost" size="icon" className="size-10">
        <Link href="/rapports" aria-label="Retour à la bibliothèque">
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-semibold text-foreground">{nom}</h1>
        <p className="text-xs text-muted-foreground">
          Version <span className="tabular-nums">{version}</span>
        </p>
      </div>

      {motifLectureSeule ? (
        <Badge variant="outline" className="h-8 gap-2 px-3">
          <Lock className="size-3.5" aria-hidden />
          {motifLectureSeule}
        </Badge>
      ) : (
        <EtatSauvegarde etat={etat} />
      )}

      {/* EF-RAP-06 — ce qui entoure la feuille n'appartient à aucun bloc : il
          se règle depuis la barre d'outils, pas depuis la composition. */}
      {modifiable && (
        <Button variant="outline" className="h-10" onClick={onReglagesDocument}>
          <FileType className="mr-2 size-4" aria-hidden />
          En-tête et pied
        </Button>
      )}

      <Button variant="outline" className="h-10" onClick={onImprimer}>
        <Printer className="mr-2 size-4" aria-hidden />
        Imprimer
      </Button>
    </div>
  );
}

function EtatSauvegarde({ etat }: { etat: EtatEnregistrement }) {
  if (etat === 'repos') return null;

  const contenu = {
    'en-attente': { icone: <Loader2 className="size-3.5 animate-spin" aria-hidden />, texte: 'Modifications en attente…' },
    'en-cours': { icone: <Loader2 className="size-3.5 animate-spin" aria-hidden />, texte: 'Enregistrement…' },
    enregistre: { icone: <Check className="size-3.5" aria-hidden />, texte: 'Enregistré' },
    echec: { icone: <CloudOff className="size-3.5" aria-hidden />, texte: 'Non enregistré' },
  }[etat];

  return (
    <p
      // `aria-live` : le lecteur d'écran annonce l'enregistrement au lieu de le
      // manquer — c'est la seule confirmation que reçoit l'utilisateur.
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-2 text-xs font-medium',
        etat === 'echec' ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {contenu.icone}
      {contenu.texte}
    </p>
  );
}

// ---------------------------------------------------------------------------

function SectionCarte({
  section,
  rang,
  total,
  modifiable,
  selection,
  saisi,
  onRenommer,
  onDeplacer,
  onSupprimer,
  onSelectionner,
  onPrendre,
  onLacher,
  onDeposer,
  onDeplacerBloc,
  onRetirerBloc,
}: {
  section: SectionRapport;
  rang: number;
  total: number;
  modifiable: boolean;
  selection: string | null;
  saisi: string | null;
  onRenommer: (titre: string) => void;
  onDeplacer: (pas: -1 | 1) => void;
  onSupprimer: () => void;
  onSelectionner: (blocId: string) => void;
  onPrendre: (blocId: string) => void;
  onLacher: () => void;
  onDeposer: (rang: number, e: React.DragEvent) => void;
  onDeplacerBloc: (blocId: string, pas: -1 | 1) => void;
  onRetirerBloc: (blocId: string) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Input
            value={section.titre}
            onChange={(e) => onRenommer(e.target.value)}
            disabled={!modifiable}
            placeholder={`Section ${rang + 1} — sans titre`}
            aria-label={`Titre de la section ${rang + 1}`}
            className="h-10 border-transparent bg-transparent text-sm font-semibold shadow-none focus-visible:border-input"
          />

          {modifiable && (
            <>
              {/* Le clavier fait ce que fait la souris (ENF-ACC). */}
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label={`Monter la section ${rang + 1}`}
                disabled={rang === 0}
                onClick={() => onDeplacer(-1)}
              >
                <ChevronUp className="size-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label={`Descendre la section ${rang + 1}`}
                disabled={rang === total - 1}
                onClick={() => onDeplacer(1)}
              >
                <ChevronDown className="size-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label={`Supprimer la section ${rang + 1}`}
                onClick={onSupprimer}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </>
          )}
        </div>

        {section.blocs.length === 0 ? (
          <ZoneDepot
            rang={0}
            modifiable={modifiable}
            onDeposer={onDeposer}
            libelle="Déposez un bloc ici, ou cliquez-en un dans la palette."
          />
        ) : (
          <div className="grid grid-cols-6 gap-4">
            {section.blocs.map((bloc, i) => (
              <BlocCarte
                key={bloc.id}
                bloc={bloc}
                modifiable={modifiable}
                selectionne={selection === bloc.id}
                enSaisie={saisi === bloc.id}
                premier={i === 0}
                dernier={i === section.blocs.length - 1}
                onSelectionner={() => onSelectionner(bloc.id)}
                onPrendre={() => onPrendre(bloc.id)}
                onLacher={onLacher}
                // Le rang visé dépend du côté survolé : devant le bloc, ou
                // derrière lui. C'est ce qui rend la descente possible.
                onDeposer={(cote, e) => onDeposer(cote === 'apres' ? i + 1 : i, e)}
                onDeplacer={(pas) => onDeplacerBloc(bloc.id, pas)}
                onRetirer={() => onRetirerBloc(bloc.id)}
              />
            ))}

            {/* La fin de section est une cible à part : sans elle, impossible
                de poser un bloc APRÈS le dernier. */}
            <div className="col-span-6">
              <ZoneDepot
                rang={section.blocs.length}
                modifiable={modifiable}
                onDeposer={onDeposer}
                libelle="Déposez ici pour ajouter à la fin"
                compacte
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ZoneDepot({
  rang,
  modifiable,
  onDeposer,
  libelle,
  compacte = false,
}: {
  rang: number;
  modifiable: boolean;
  onDeposer: (rang: number, e: React.DragEvent) => void;
  libelle: string;
  compacte?: boolean;
}) {
  const [survol, setSurvol] = useState(false);

  if (!modifiable) return null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setSurvol(true);
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        setSurvol(false);
        onDeposer(rang, e);
      }}
      className={cn(
        'flex items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground transition-colors',
        compacte ? 'py-2' : 'py-8',
        survol ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-border',
      )}
    >
      {libelle}
    </div>
  );
}

function BlocCarte({
  bloc,
  modifiable,
  selectionne,
  enSaisie,
  premier,
  dernier,
  onSelectionner,
  onPrendre,
  onLacher,
  onDeposer,
  onDeplacer,
  onRetirer,
}: {
  bloc: BlocRapport;
  modifiable: boolean;
  selectionne: boolean;
  enSaisie: boolean;
  premier: boolean;
  dernier: boolean;
  onSelectionner: () => void;
  onPrendre: () => void;
  onLacher: () => void;
  onDeposer: (cote: 'avant' | 'apres', e: React.DragEvent) => void;
  onDeplacer: (pas: -1 | 1) => void;
  onRetirer: () => void;
}) {
  const definition = definitionBloc(bloc.type);
  const Icone = ICONES_BLOC[bloc.type] ?? GripVertical;

  /**
   * DE QUEL CÔTÉ DU BLOC SURVOLÉ ON VA POSER — et c'était LE défaut.
   *
   * Déposer insérait toujours AVANT le bloc visé. Descendre un bloc d'un cran
   * revenait donc à le remettre exactement où il était : on tirait vers le bas,
   * on lâchait, rien ne bougeait. Vers le haut, cela marchait — d'où
   * l'impression que le glisser vertical « ne marche qu'à moitié ».
   *
   * Le côté se lit maintenant dans la POSITION DU POINTEUR : au-delà du milieu
   * du bloc, on passe derrière lui. C'est ce que fait n'importe quel éditeur,
   * et ce que la main attend sans y penser.
   *
   * L'AXE SUIT LA MISE EN PAGE. Un bloc pleine largeur occupe sa rangée : la
   * question est « au-dessus ou en dessous ». Deux blocs côte à côte se
   * départagent horizontalement — comparer leurs hauteurs n'apprendrait rien.
   */
  const [cote, setCote] = useState<'avant' | 'apres' | null>(null);
  const pleineLargeur = bloc.largeur === 'PLEINE';

  function coteSousLePointeur(e: React.DragEvent<HTMLDivElement>): 'avant' | 'apres' {
    const cadre = e.currentTarget.getBoundingClientRect();
    return pleineLargeur
      ? e.clientY > cadre.top + cadre.height / 2
        ? 'apres'
        : 'avant'
      : e.clientX > cadre.left + cadre.width / 2
        ? 'apres'
        : 'avant';
  }

  // Ce que le bloc DIT, quand il dit quelque chose : un titre vide se
  // reconnaît mieux à son libellé de type qu'à un cadre blanc.
  const apercu =
    (typeof bloc.reglages.texte === 'string' && bloc.reglages.texte) ||
    (typeof bloc.reglages.titre === 'string' && bloc.reglages.titre) ||
    (typeof bloc.reglages.contenu === 'string' && bloc.reglages.contenu) ||
    '';

  const libelle = definition?.libelle ?? bloc.type;

  return (
    <div
      className={cn('relative', CLASSES_LARGEUR[bloc.largeur])}
      draggable={modifiable}
      onDragStart={(e) => {
        e.dataTransfer.setData(TYPE_BLOC_POSE, bloc.id);
        e.dataTransfer.effectAllowed = 'move';
        onPrendre();
      }}
      onDragEnd={() => {
        setCote(null);
        onLacher();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!enSaisie) setCote(coteSousLePointeur(e));
      }}
      onDragLeave={() => setCote(null)}
      onDrop={(e) => {
        const ou = coteSousLePointeur(e);
        setCote(null);
        onDeposer(ou, e);
      }}
    >
      {/* Le trait d'insertion : il annonce OÙ le bloc va se poser, du bon côté
          et sur le bon axe. Sans lui, on lâche et on découvre. */}
      {cote && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute rounded-full bg-indigo-500',
            pleineLargeur
              ? cote === 'avant'
                ? '-top-2 left-0 h-1 w-full'
                : '-bottom-2 left-0 h-1 w-full'
              : cote === 'avant'
                ? '-left-2 top-0 h-full w-1'
                : '-right-2 top-0 h-full w-1',
          )}
        />
      )}

      {/*
        UN `div` ET NON UN `button`. Il en contenait trois autres — retirer,
        monter, descendre —, et un bouton dans un bouton est un balisage que
        chaque navigateur défait à sa façon : le clic partait au mauvais
        endroit. Le rôle et les touches sont posés à la main, ce qui donne
        exactement le même comportement au clavier.
      */}
      <div
        role="button"
        tabIndex={0}
        onClick={onSelectionner}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          onSelectionner();
        }}
        aria-pressed={selectionne}
        aria-label={`Bloc ${libelle}`}
        className={cn(
          'group flex h-full w-full flex-col gap-2 rounded-md border p-3 text-left transition-colors',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          modifiable && 'cursor-grab',
          selectionne
            ? 'border-indigo-500 bg-indigo-50'
            : 'border-border bg-card hover:border-slate-300',
          enSaisie && 'opacity-40',
        )}
      >
        <div className="flex items-center gap-2">
          <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {libelle}
          </span>

          {modifiable && (
            // Les commandes apparaissent au survol ET au focus : sans le
            // second, elles seraient inatteignables au clavier.
            <div className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={`Monter le bloc ${libelle}`}
                disabled={premier}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeplacer(-1);
                }}
              >
                <ChevronUp className="size-3.5" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={`Descendre le bloc ${libelle}`}
                disabled={dernier}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeplacer(1);
                }}
              >
                <ChevronDown className="size-3.5" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 hover:text-destructive"
                aria-label={`Retirer le bloc ${libelle}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRetirer();
                }}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </div>
          )}
        </div>

        {apercu && <p className="line-clamp-2 text-xs text-muted-foreground">{apercu}</p>}
      </div>
    </div>
  );
}
