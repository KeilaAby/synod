'use client';

import { PanneauReglages } from '@/components/rapports/panneau-reglages';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  type BlocRapport,
  type LargeurBloc,
  type StructureRapport,
  definitionBloc,
} from '@/lib/domain/rapport';

/**
 * Les réglages, en pop-up — EF-RAP-01.
 *
 * POURQUOI ILS ONT QUITTÉ LA TROISIÈME COLONNE.
 *
 * Réglages et aperçu s'y partageaient un onglet : régler un bloc masquait la
 * feuille, et voir l'effet du réglage demandait de rebasculer. Or c'est
 * exactement la boucle qu'on vient vérifier — je change la forme du graphique,
 * je regarde ce que ça donne. La faire passer par deux clics d'onglet la rend
 * si coûteuse qu'on cesse de regarder, et qu'on découvre le résultat à
 * l'impression.
 *
 * Le pop-up laisse l'aperçu VISIBLE derrière lui : on règle et on voit, sans
 * rien échanger. Et il rend sa largeur entière à la feuille, qui n'a plus à
 * partager la colonne.
 *
 * IL NE BLOQUE PAS. Fermer d'un `Échap` ou d'un clic extérieur est sans risque
 * — chaque réglage est déjà posé dans la structure au moment où on le change,
 * et l'auto-sauvegarde suit. Ce n'est pas un formulaire qu'on valide, c'est un
 * panneau qu'on referme.
 */
export function ReglagesBlocDialog({
  bloc,
  structure,
  onReglerBloc,
  onReglerLargeur,
  onFermer,
}: {
  /** `null` : aucun bloc sélectionné, le pop-up reste fermé. */
  bloc: BlocRapport | null;
  structure: StructureRapport;
  onReglerBloc: (reglages: Record<string, unknown>) => void;
  onReglerLargeur: (largeur: LargeurBloc) => void;
  onFermer: () => void;
}) {
  const definition = bloc ? definitionBloc(bloc.type) : null;

  return (
    <Dialog open={bloc !== null} onOpenChange={(ouvert) => !ouvert && onFermer()}>
      <DialogContent className="max-h-[85vh] w-[min(96vw,32rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{definition?.libelle ?? 'Réglages du bloc'}</DialogTitle>
          <DialogDescription>{definition?.description}</DialogDescription>
        </DialogHeader>

        {bloc && (
          <PanneauReglages
            bloc={bloc}
            structure={structure}
            onReglerBloc={onReglerBloc}
            onReglerLargeur={onReglerLargeur}
            onReglerDocument={() => {}}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * EF-RAP-06 — l'en-tête et le pied de page.
 *
 * Ce sont des réglages du DOCUMENT : ils n'appartiennent à aucun bloc, et
 * n'avaient donc aucun endroit naturel dans la composition. Un bouton de la
 * barre d'outils les ouvre — là où l'on va chercher ce qui concerne la feuille
 * entière plutôt qu'un de ses éléments.
 */
export function ReglagesDocumentDialog({
  ouvert,
  structure,
  onRegler,
  onOuvrir,
}: {
  ouvert: boolean;
  structure: StructureRapport;
  onRegler: (structure: StructureRapport) => void;
  onOuvrir: (ouvert: boolean) => void;
}) {
  return (
    <Dialog open={ouvert} onOpenChange={onOuvrir}>
      <DialogContent className="max-h-[85vh] w-[min(96vw,32rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>En-tête et pied de page</DialogTitle>
          <DialogDescription>
            Ce qui entoure chaque feuille du rapport : logo, titre, numérotation,
            mention de confidentialité.
          </DialogDescription>
        </DialogHeader>

        <PanneauReglages
          bloc={null}
          structure={structure}
          onReglerBloc={() => {}}
          onReglerLargeur={() => {}}
          onReglerDocument={onRegler}
        />
      </DialogContent>
    </Dialog>
  );
}
