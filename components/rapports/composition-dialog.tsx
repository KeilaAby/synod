'use client';

import { Loader2, Lock, LockOpen, SlidersHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { avertir } from '@/components/shared/messages';
import { PermissionGate } from '@/components/shared/permission-gate';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { reglerCompositionModeles } from '@/lib/actions/rapports';
import { appelerAction } from '@/lib/utils/appeler-action';
import { cn } from '@/lib/utils';

/**
 * Ouvrir ou fermer la composition de modèles — EF-RAP-07, EF-ADM-11.
 *
 * SA PLACE EST DANS « ADMINISTRATION » (lot 7), pas sur `/rapports`. Un
 * paramètre d'organisation ne se règle pas depuis l'écran du module qu'il
 * commande : on le chercherait alors dans autant d'endroits qu'il y a de
 * modules, et deux réglages voisins finiraient sur deux écrans différents.
 * Le composant est donc écrit et prêt, et **monté par personne** en attendant
 * l'écran d'administration — d'ici là, la colonne se règle en SQL.
 *
 * UN RÉGLAGE D'ORGANISATION, POUR TOUTES LES ENTITÉS À LA FOIS. La question
 * n'est pas « qui compose ? » — `report.template.manage` y répond déjà, compte
 * par compte et avec sa portée — mais « l'organisation autorise-t-elle qu'on
 * compose ailleurs qu'au Siège ? ». Elle se pose une fois, elle se règle en un
 * endroit, et `settings.manage` — non délégable — la garde.
 *
 * LES DEUX ÉTATS SE LISENT CÔTE À CÔTE, et chacun dit ce qu'il produit. Un
 * interrupteur nu obligerait à se rappeler ce que « activé » veut dire ici,
 * et la moitié des gens se tromperaient de sens une fois sur deux.
 *
 * Le Siège n'est jamais concerné par son propre verrou : fermé, il ne pourrait
 * plus poser la trame à laquelle les autres doivent se conformer. C'est écrit
 * dans le pop-up, parce que c'est exactement la question qu'on se pose en
 * cliquant.
 */
export function CompositionDialog({ compositionLibre }: { compositionLibre: boolean }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState(compositionLibre);
  const [enCours, setEnCours] = useState(false);

  async function envoyer() {
    setEnCours(true);
    const resultat = await appelerAction(() =>
      reglerCompositionModeles({ compositionLibre: choix }),
    );
    setEnCours(false);

    if (!resultat.ok) {
      avertir(resultat.error);
      return;
    }

    toast.success(
      resultat.data.compositionLibre
        ? 'Les entités peuvent composer leurs modèles.'
        : 'Seul le Siège compose désormais.',
    );
    setOuvert(false);
    router.refresh();
  }

  return (
    <PermissionGate perm="settings.manage">
      <Button
        variant="outline"
        className="h-10"
        onClick={() => {
          setChoix(compositionLibre);
          setOuvert(true);
        }}
      >
        <SlidersHorizontal className="mr-2 size-4" aria-hidden />
        Réglages
      </Button>

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="max-h-[90vh] w-[min(96vw,42rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Composition des modèles</DialogTitle>
            <DialogDescription>
              Qui, dans l’organisation, a le droit de dessiner un modèle de rapport. Ce
              réglage vaut pour <strong>toutes les entités à la fois</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <ChoixComposition
              actif={choix}
              valeur
              icone={LockOpen}
              titre="Ouverte aux entités"
              texte="Chaque entité emploie les modèles du Siège ET dessine les siens, si son habilitation le lui permet."
              onChoisir={() => setChoix(true)}
            />
            <ChoixComposition
              actif={!choix}
              valeur={false}
              icone={Lock}
              titre="Réservée au Siège"
              texte="Les entités se conforment aux modèles du Siège. Ceux qu’elles ont déjà composés restent lisibles et rangeables ; elles n’en créent simplement plus."
              onChoisir={() => setChoix(false)}
            />

            <p className="text-xs text-muted-foreground">
              Le Siège compose dans les deux cas : fermé sur lui-même, ce réglage
              supprimerait la trame à laquelle les autres doivent se conformer.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="h-10"
              onClick={() => setOuvert(false)}
              disabled={enCours}
            >
              Annuler
            </Button>
            <Button
              className="h-10"
              onClick={envoyer}
              disabled={enCours || choix === compositionLibre}
            >
              {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PermissionGate>
  );
}

function ChoixComposition({
  actif,
  valeur,
  icone: Icone,
  titre,
  texte,
  onChoisir,
}: {
  actif: boolean;
  valeur: boolean;
  icone: typeof Lock;
  titre: string;
  texte: string;
  onChoisir: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChoisir}
      aria-pressed={actif}
      className={cn(
        'flex w-full items-start gap-4 rounded-md border p-4 text-left transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        actif
          ? 'border-indigo-500 bg-indigo-50'
          : 'border-border bg-card hover:border-slate-300',
      )}
    >
      <Icone
        className={cn('mt-0.5 size-5 shrink-0', actif ? 'text-indigo-600' : 'text-slate-400')}
        aria-hidden
      />
      <span className="space-y-1">
        <span className="block text-sm font-medium text-foreground">{titre}</span>
        <span className="block text-xs text-muted-foreground">{texte}</span>
      </span>
      <span className="sr-only">{valeur ? 'Ouvrir' : 'Réserver au Siège'}</span>
    </button>
  );
}
