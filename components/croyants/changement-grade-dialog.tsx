'use client';

import { ArrowDown, ArrowUp, Loader2, PencilOff } from 'lucide-react';
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
import { type NatureChangementGrade, correctionDeGradePossible } from '@/lib/domain/promotion';
import { cn } from '@/lib/utils';

/**
 * Changer le grade d'un croyant — EF-CRO-12.
 *
 * DEUX GESTES, comme le retrait d'un titulaire (EF-BUR-08), et pour la même
 * raison : ils ne laissent pas la même trace.
 *
 *   — ERREUR DE SAISIE : on a coché le mauvais grade. Rien n'entre dans
 *     l'historique du croyant, parce qu'il ne s'est rien passé dans sa vie. Un
 *     « Diacre » de trois jours inscrit au journal se lirait plus tard comme
 *     une dégradation, et personne ne saurait dire le contraire.
 *
 *   — DÉCISION : une montée ou une descente réelle. Elle s'inscrit, avec son
 *     opérateur et son validateur — et **une descente se motive**.
 *
 * POURQUOI LA DESCENTE SEULE SE MOTIVE. Une promotion se justifie d'elle-même :
 * on reconnaît ce qui est déjà là. Une rétrogradation retire quelque chose à
 * quelqu'un, et ce qui retire s'explique.
 *
 * LE MOTIF SE DONNE ICI, PAS À LA DÉCISION. Celui qui descend le grade sait
 * pourquoi ; l'entité supérieure se prononce **sur** ce motif. L'inverse lui
 * ferait juger sans savoir de quoi.
 *
 * L'ERREUR SE FERME AU BOUT DE QUINZE JOURS — sans ce délai, « erreur de
 * saisie » deviendrait la porte par laquelle on rétrograde sans rien écrire.
 */
export function ChangementGradeDialog({
  ouvert,
  gradeActuel,
  gradeDemande,
  descente,
  ficheCreeeLe,
  enCours,
  onConfirmer,
  onAnnuler,
  joursDelai,
}: {
  ouvert: boolean;
  gradeActuel: string;
  gradeDemande: string;
  /** Le nouveau grade est-il INFÉRIEUR ? Décidé par le rang, pas par le nom. */
  descente: boolean;
  /** Quand la fiche a été créée — c'est elle qui ouvre la fenêtre de correction. */
  ficheCreeeLe: string;
  enCours: boolean;
  onConfirmer: (nature: NatureChangementGrade, motif: string | null) => void;
  onAnnuler: () => void;
  /**
   * EF-CRO-12 — réglé dans « Corrections de saisie » (migration `0069`).
   *
   * Simple HINT côté écran : la Server Action relit ce paramètre à l'instant
   * de l'écriture et tranche pour de bon.
   */
  joursDelai: number;
}) {
  const [nature, setNature] = useState<NatureChangementGrade>('DECISION');
  const [motif, setMotif] = useState('');

  const erreurPossible = correctionDeGradePossible(ficheCreeeLe, joursDelai);
  const choix: NatureChangementGrade = erreurPossible ? nature : 'DECISION';

  // Une descente enregistrée comme décision exige son motif ; une correction
  // n'en a pas, et une montée non plus.
  const motifRequis = choix === 'DECISION' && descente;
  const pret = !motifRequis || motif.trim().length >= 3;

  function fermer() {
    setNature('DECISION');
    setMotif('');
    onAnnuler();
  }

  return (
    <Dialog open={ouvert} onOpenChange={(v) => !v && fermer()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {descente ? 'Descente en grade' : 'Changement de grade'}
          </DialogTitle>
          <DialogDescription>
            De «&nbsp;{gradeActuel}&nbsp;» à «&nbsp;{gradeDemande}&nbsp;». Ce qui
            change, c’est ce qu’il en restera dans l’historique du croyant.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Le cas « erreur » ne s'affiche que dans le délai : le montrer grisé
              au-delà ferait chercher comment le rouvrir. */}
          {erreurPossible && (
            <Choix
              icone={PencilOff}
              titre="Erreur de saisie"
              texte="Le mauvais grade avait été coché. Rien n’apparaîtra dans l’historique : il ne s’est rien passé dans la vie du croyant."
              actif={choix === 'ERREUR'}
              onClick={() => setNature('ERREUR')}
            />
          )}

          <Choix
            icone={descente ? ArrowDown : ArrowUp}
            titre={descente ? 'Descente en grade décidée' : 'Promotion décidée'}
            texte={
              descente
                ? 'Sanction, retrait de charge… Le changement s’inscrit dans l’historique, avec son motif.'
                : 'Le changement s’inscrit dans l’historique, avec l’opérateur et le validateur.'
            }
            actif={choix === 'DECISION'}
            onClick={() => setNature('DECISION')}
          />

          {motifRequis && (
            <div className="space-y-1">
              <label htmlFor="motif-grade" className="text-sm font-medium">
                Motif de la descente
              </label>
              <Textarea
                id="motif-grade"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Sanction disciplinaire, retrait de charge…"
                rows={3}
              />
              <p className="text-muted-foreground text-xs">
                Une montée en grade se justifie d’elle-même ; une descente retire
                quelque chose à quelqu’un, et cela s’explique.
              </p>
            </div>
          )}

          {!erreurPossible && (
            <p className="text-muted-foreground text-xs">
              Cette fiche a plus de {joursDelai} jours : son grade ne se
              corrige plus comme une erreur de saisie.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={fermer} disabled={enCours}>
            Annuler
          </Button>
          <Button
            className="h-10"
            disabled={!pret || enCours}
            onClick={() =>
              onConfirmer(choix, choix === 'DECISION' && descente ? motif.trim() : null)
            }
          >
            {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Un geste, présenté avec SA CONSÉQUENCE — le mot seul ne distingue pas. */
function Choix({
  icone: Icone,
  titre,
  texte,
  actif,
  onClick,
}: {
  icone: typeof ArrowUp;
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
        actif ? 'border-indigo-300 bg-indigo-50/60' : 'border-border hover:bg-muted/40',
      )}
    >
      <Icone
        className={cn(
          'mt-0.5 size-4 shrink-0',
          actif ? 'text-indigo-700' : 'text-muted-foreground',
        )}
        aria-hidden
      />
      <span className="flex-1 text-sm">
        <span className="block font-medium">{titre}</span>
        <span className="text-muted-foreground">{texte}</span>
      </span>
    </button>
  );
}
