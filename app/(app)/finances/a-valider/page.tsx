import type { Metadata } from 'next';

import { PageHeader } from '@/components/shared/page-header';
import { chargerFileValidation } from '@/lib/data/finances';
import { signerJustificatifs } from '@/lib/data/photos';
import { getParametres } from '@/lib/data/settings';
import { formatNombre } from '@/lib/utils/format';

import { FileValidationClient } from './file-client';

export const metadata: Metadata = { title: 'À valider' };

/**
 * File de validation — EF-FIN-21.
 *
 * UN ÉCRAN À PART, ET NON UN FILTRE DU REGISTRE. Le registre répond à
 * « qu'avons-nous enregistré ? » ; la file répond à « que dois-je décider ? ».
 * Ce ne sont pas les mêmes questions, et l'ordre n'est pas le même : ici le
 * plus ANCIEN vient en tête, parce qu'une file se traite par le bas de la pile.
 *
 * Le compteur du menu pointe ici (UI-21) : un badge annonçant trois décisions
 * doit mener à ces trois décisions, pas à une liste où il faut les retrouver.
 */
export default async function FileValidationPage() {
  const [mouvements, parametres] = await Promise.all([
    chargerFileValidation(),
    getParametres(),
  ]);

  // EF-FIN-07 — les pièces signées en une fois : on valide en les regardant.
  const justificatifs = await signerJustificatifs(
    mouvements.map((m) => m.justificatif_key),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Finances"
        title="À valider"
        description={
          mouvements.length === 0
            ? 'Aucun mouvement n’attend de décision dans votre périmètre.'
            : `${formatNombre(mouvements.length)} mouvement${mouvements.length > 1 ? 's' : ''} en attente, du plus ancien au plus récent.`
        }
      />

      <FileValidationClient
        mouvements={mouvements}
        devise={parametres.devise}
        justificatifs={Object.fromEntries(justificatifs)}
      />
    </div>
  );
}
