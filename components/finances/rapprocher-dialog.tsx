'use client';

import { Loader2, UserCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CroyantPicker, type OptionCroyant } from '@/components/croyants/croyant-picker';
import {
  type PorteurSuggere,
  SuggestionsEnveloppe,
} from '@/components/finances/suggestions-enveloppe';
import { avertir } from '@/components/shared/messages';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { resoudreRapprochement } from '@/lib/actions/dimes';
import { suggestionsPourEnveloppe } from '@/lib/domain/dime';
import { appelerAction } from '@/lib/utils/appeler-action';

/**
 * Rapprocher UNE ligne, depuis le relevé des dîmes — EF-FIN-34.
 *
 * POURQUOI ICI EN PLUS DE `/croyants`. La file de `/croyants` traite un LOT :
 * on s'y assied avec vingt lignes et on les résout à la suite. Ce pop-up traite
 * UNE ligne, à l'endroit où on la voit — en dépliant une collecte, on constate
 * qu'une enveloppe n'a pas de nom, et on la rattache sans changer d'écran.
 *
 * CE N'EST PAS UN SECOND CHEMIN (règle 16) : l'opération reste
 * `resoudreRapprochement`, la même que la file appelle, avec les mêmes
 * contrôles serveur. Ce qui change est l'endroit d'où on la déclenche, pas ce
 * qu'elle fait.
 *
 * LES DEUX MÊMES AIDES QUE LA FILE, et pour la même raison : le numéro
 * d'enveloppe propose, la recherche trouve. Il manque volontairement la
 * troisième — « créer la fiche ». Ouvrir un formulaire de croyant par-dessus un
 * relevé financier ferait deux pop-ups empilés pour un geste qui appartient à
 * `/croyants`, où l'on connaît les gens.
 */
export function RapprocherDialog({
  rapprochement,
  croyants,
  photos,
  porteurs,
  open,
  onOpenChange,
}: {
  rapprochement: {
    id: string;
    nom_source: string;
    prenom_source: string | null;
    enveloppe_source: string | null;
  } | null;
  croyants: OptionCroyant[];
  photos: Record<string, string>;
  porteurs: Record<string, PorteurSuggere[]>;
  open: boolean;
  onOpenChange: (ouvert: boolean) => void;
}) {
  const router = useRouter();
  /**
   * LE CHOIX PORTE LA LIGNE POUR LAQUELLE IL A ÉTÉ FAIT.
   *
   * Une ligne chasse l'autre : garder le nom retenu pour la précédente
   * rattacherait la seconde enveloppe à la mauvaise personne. Le remettre à
   * zéro dans un effet marcherait, mais React refuse un `setState` synchrone
   * dans un effet — et il a raison, ce serait un rendu de plus pour une donnée
   * qui se DÉDUIT. On la déduit donc.
   */
  const [choix, setChoix] = useState<{ pour: string; croyantId: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  if (!rapprochement) return null;

  const retenu = choix?.pour === rapprochement.id ? choix.croyantId : null;
  const setRetenu = (croyantId: string | null) =>
    setChoix(croyantId ? { pour: rapprochement.id, croyantId } : null);

  const suggestions = retenu
    ? []
    : suggestionsPourEnveloppe(rapprochement.enveloppe_source, porteurs);

  const libelle = rapprochement.nom_source
    ? `${rapprochement.nom_source}${rapprochement.prenom_source ? ` ${rapprochement.prenom_source}` : ''}`
    : null;

  async function rattacher() {
    if (!retenu || !rapprochement) return;
    setEnCours(true);

    try {
      const resultat = await appelerAction(() =>
        resoudreRapprochement({ rapprochementId: rapprochement.id, croyantId: retenu }),
      );

      if (!resultat.ok) {
        avertir(resultat.error, { ton: 'refus', titre: 'Rapprochement impossible' });
        return;
      }

      /**
       * LE REÇU SE REPORTE SUR LE TALON. Il vient d'être émis : sans cette
       * mention, la référence resterait en base et le croyant n'aurait jamais
       * rien en main.
       */
      avertir(
        `Reçu ${resultat.data.recu}\n\n` + 'À reporter sur le talon remis au croyant.',
        { ton: 'information', titre: 'Reçu attribué' },
      );

      onOpenChange(false);
      router.refresh();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rapprocher ce versement</DialogTitle>
          <DialogDescription>
            {libelle ? (
              <>
                Le fichier portait «&nbsp;<span className="font-medium">{libelle}</span>
                &nbsp;», qu’aucune fiche ne reconnaît.
              </>
            ) : (
              <>
                Cette enveloppe n’avait pas de nom. Le numéro, lui, a déjà été porté :
                c’est par lui que la personne se retrouve.
              </>
            )}{' '}
            Le montant est déjà compté&nbsp;; il ne manque que l’identité.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {rapprochement.enveloppe_source && (
            <p className="text-muted-foreground text-sm">
              Enveloppe{' '}
              <span className="text-foreground font-mono">
                {rapprochement.enveloppe_source}
              </span>
            </p>
          )}

          <CroyantPicker
            options={croyants}
            value={retenu}
            onChange={setRetenu}
            photos={photos}
            placeholder="Chercher la fiche"
            aria-label="Croyant à rattacher"
          />

          {/* EF-FIN-27 — le numéro en dit souvent plus que le nom, qui est
              justement celui qu'on n'a pas reconnu. */}
          <SuggestionsEnveloppe
            porteurs={suggestions}
            photos={photos}
            fiche={(id) => {
              const f = croyants.find((c) => c.id === id);
              return f
                ? { matricule: f.matricule, detail: f.detail, photoKey: f.photoKey }
                : null;
            }}
            onChoisir={setRetenu}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="h-10" disabled={!retenu || enCours} onClick={rattacher}>
            {enCours ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <UserCheck className="mr-2 size-4" aria-hidden />
            )}
            Rattacher
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
