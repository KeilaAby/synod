'use client';

import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { avertir } from '@/components/shared/messages';
import { Button } from '@/components/ui/button';
import {
  type Canevas,
  feuillesDuCanevas,
  nomDuCanevas,
} from '@/lib/domain/canevas-import';

/**
 * Telecharger le canevas d'import — EF-CRO-11, EF-FIN-34.
 *
 * UN SEUL BOUTON POUR LES DEUX ECRANS (regle 16). Les deux imports posent la
 * meme question — « par ou je commence ? » — et deux boutons auraient fini par
 * ne pas nommer leur fichier pareil, ni dire la meme chose de l'etoile.
 *
 * LE CLASSEUR SE FABRIQUE AU CLIC, il n'est pas servi depuis `public/`. Un
 * fichier depose la serait une copie : le jour ou une colonne devient
 * facultative, le code le saurait et le fichier l'ignorerait — et c'est le
 * fichier que le saisiste remplit. En le construisant a partir des memes
 * registres que l'import, la divergence devient impossible plutot
 * qu'improbable.
 *
 * L'ECRITURE EST CHARGEE EN DIFFERE (regle 7) : le module d'ecriture XLSX ne
 * sert qu'a ceux qui cliquent, et il n'a aucune raison de peser sur le premier
 * rendu d'un pop-up d'import.
 */
export function TelechargerCanevas({
  canevas,
  libelle = 'Télécharger le canevas Excel',
}: {
  canevas: Canevas;
  libelle?: string;
}) {
  const [enCours, setEnCours] = useState(false);

  async function telecharger() {
    setEnCours(true);
    try {
      const { ecrireClasseurXlsx } = await import('@/lib/domain/xlsx-ecriture');
      const octets = ecrireClasseurXlsx(feuillesDuCanevas(canevas));

      const url = URL.createObjectURL(
        new Blob([octets as BlobPart], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );

      const lien = document.createElement('a');
      lien.href = url;
      lien.download = nomDuCanevas(canevas);
      lien.click();

      /**
       * L'URL se libere APRES le clic, pas pendant. Revoquee trop tot, le
       * navigateur n'a plus rien a telecharger et echoue EN SILENCE — sans
       * message, et sans fichier.
       */
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // Une panne se DIT : un bouton qui ne fait rien se reclique, et on
      // finit par croire que le navigateur bloque le telechargement.
      avertir('Le canevas n’a pas pu être préparé. Réessayez.', {
        titre: 'Téléchargement impossible',
      });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="h-9 text-xs"
      onClick={() => void telecharger()}
      disabled={enCours}
    >
      {enCours ? (
        <Loader2 className="mr-2 size-3.5 animate-spin" aria-hidden />
      ) : (
        <Download className="mr-2 size-3.5" aria-hidden />
      )}
      {libelle}
    </Button>
  );
}
