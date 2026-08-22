'use client';

import { Loader2, PencilOff, UserMinus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { type MotifRetrait, retraitPourErreurPossible } from '@/lib/domain/bureau';
import { cn } from '@/lib/utils';

/**
 * Retirer un titulaire — EF-BUR-08.
 *
 * DEUX GESTES QUE L'APPLICATION CONFONDAIT. « Retirer » fermait le mandat du
 * jour, sans rien demander, alors que deux situations très différentes passent
 * par ce même bouton :
 *
 *   — UNE ERREUR D'ASSIGNATION. On a désigné Rakoto au lieu de Rabe, on s'en
 *     aperçoit le lendemain. Ce n'est pas un événement de la vie de Rakoto,
 *     c'est une faute de frappe. La ligne est **effacée** : un mandat d'un jour
 *     laissé dans sa frise se lirait un jour comme une destitution, et personne
 *     ne saurait dire le contraire.
 *
 *   — UN RETRAIT EN COURS DE MANDAT. Décès, démission, sanction. Le mandat est
 *     **clos**, et le motif est **obligatoire** : un mandat interrompu sans
 *     raison écrite est exactement ce qu'on cherchera dans dix ans.
 *
 * ON DEMANDE, ON NE DEVINE PAS. Les deux gestes n'ont pas le même résultat —
 * l'un efface, l'autre conserve — et choisir à la place de l'utilisateur ferait
 * perdre une ligne d'historique qu'il croyait garder, ou l'inverse.
 *
 * L'ERREUR SE FERME AU BOUT DU DÉLAI DE CORRECTION. Passé ce délai, ce n'est
 * plus une correction de saisie mais une décision. Le choix disparaît alors de
 * l'écran, et le serveur le refuserait de toute façon : ce qui est en jeu est
 * un effacement, et un refus se corrige là où une ligne effacée ne revient pas.
 *
 * « ERREUR » EST LE DÉFAUT QUAND ELLE EST PROPOSÉE — 22 août 2026, décision de
 * l'utilisateur. Elle n'apparaît que DANS la fenêtre de correction : quand elle
 * est là, une faute de saisie récente est le cas le plus probable, et forcer un
 * second clic pour le cas courant n'aidait personne.
 */
export function RetraitDialog({
  cible,
  onConfirmer,
  onAnnuler,
  enCours,
  joursDelai,
}: {
  cible: {
    id: string;
    nom: string;
    fonction: string;
    /** Quand la désignation a été ENREGISTRÉE — c'est elle qui ouvre le délai. */
    enregistreLe: string;
  } | null;
  onConfirmer: (nature: MotifRetrait, motif: string | null) => void;
  onAnnuler: () => void;
  enCours: boolean;
  /**
   * EF-BUR-08 — réglé dans « Corrections de saisie » (migration `0069`).
   *
   * Un simple HINT côté écran : la Server Action relit ce paramètre à
   * l'instant de l'écriture et tranche pour de bon. Cette valeur-ci peut dater
   * de l'ouverture de la page — au pire, le pop-up propose une option que le
   * serveur refusera juste après, motif à l'appui.
   */
  joursDelai: number;
}) {
  const [nature, setNature] = useState<MotifRetrait>('ERREUR');
  const [motif, setMotif] = useState('');

  if (!cible) return null;

  const erreurPossible = retraitPourErreurPossible(cible.enregistreLe, joursDelai);
  const choix: MotifRetrait = erreurPossible ? nature : 'DECISION';
  const pretAValider = choix === 'ERREUR' || motif.trim().length >= 3;

  function fermer() {
    setNature('ERREUR');
    setMotif('');
    onAnnuler();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && fermer()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Retirer {cible.nom} du bureau&nbsp;?
          </DialogTitle>
          <DialogDescription>
            Son mandat de «&nbsp;{cible.fonction}&nbsp;» prend fin, et la fonction
            redevient vacante. Ce qui change, c’est ce qu’il en restera.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/*
            LE CAS « ERREUR » NE S'AFFICHE QUE DANS LE DÉLAI. Le montrer grisé
            au-delà ferait chercher comment le rouvrir ; ne rien montrer laisse
            le seul geste qui reste possible.
          */}
          {erreurPossible && (
            <Choix
              icone={PencilOff}
              titre="Erreur d’assignation"
              texte="La désignation était une faute de saisie. La ligne est effacée : rien n’apparaîtra dans l’historique du croyant, parce qu’il ne s’est rien passé dans sa vie."
              actif={choix === 'ERREUR'}
              onClick={() => setNature('ERREUR')}
            />
          )}

          <Choix
            icone={UserMinus}
            titre="Retrait en cours de mandat"
            texte="Décès, démission, sanction… Le mandat est clos à ce jour et reste dans l’historique, avec son motif."
            actif={choix === 'DECISION'}
            onClick={() => setNature('DECISION')}
          />

          {choix === 'DECISION' && (
            <div className="space-y-1">
              <label htmlFor="motif-retrait" className="text-sm font-medium">
                Motif du retrait
              </label>
              <Textarea
                id="motif-retrait"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Décès, démission, sanction pour faute lourde…"
                rows={3}
              />
              <p className="text-muted-foreground text-xs">
                Il restera attaché au mandat. Un retrait sans raison écrite est
                inexplicable quand on le relit des années plus tard.
              </p>
            </div>
          )}

          {!erreurPossible && (
            <p className="text-muted-foreground text-xs">
              Cette désignation date de plus de {joursDelai} jours :
              elle ne peut plus être effacée comme une erreur de saisie.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={fermer} disabled={enCours}>
            Annuler
          </Button>
          <Button
            variant={choix === 'ERREUR' ? 'destructive' : 'default'}
            className="h-10"
            disabled={!pretAValider || enCours}
            onClick={() => onConfirmer(choix, choix === 'ERREUR' ? null : motif.trim())}
          >
            {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            {choix === 'ERREUR' ? 'Effacer la désignation' : 'Retirer du bureau'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Un des deux gestes, présenté avec SA CONSÉQUENCE.
 *
 * Le titre seul — « erreur » / « retrait » — ne suffit pas : ce qui distingue
 * les deux n'est pas le mot mais ce qu'il advient de l'historique. C'est donc
 * cela qu'on écrit, avant le clic et non après.
 */
function Choix({
  icone: Icone,
  titre,
  texte,
  actif,
  onClick,
}: {
  icone: typeof UserMinus;
  titre: string;
  texte: string;
  actif: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors',
        actif
          ? 'border-indigo-300 bg-indigo-50/60'
          : 'border-border hover:bg-muted/40',
      )}
    >
      <Icone
        className={cn('mt-0.5 size-4 shrink-0', actif ? 'text-indigo-700' : 'text-muted-foreground')}
        aria-hidden
      />
      <span className="flex-1 text-sm">
        <span className="block font-medium">{titre}</span>
        <span className="text-muted-foreground">{texte}</span>
      </span>
    </button>
  );
}
