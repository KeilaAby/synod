import type { Metadata } from 'next';

import { BaptemeDialog } from '@/components/baptemes/bapteme-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { chargerBaptemes, listerCelebrants } from '@/lib/data/baptemes';
import { getOptionsCroyant } from '@/lib/data/croyant-options';
import { signerPhotos } from '@/lib/data/photos';
import { getParametres } from '@/lib/data/settings';
import { estNouveauBaptise } from '@/lib/domain/croyant';
import { formatNombre } from '@/lib/utils/format';

import { BaptemesClient } from './baptemes-client';

export const metadata: Metadata = { title: 'Baptêmes' };

/**
 * EF-BAP-04, EF-BAP-05, EF-BAP-06 — registre des baptêmes.
 *
 * La fenêtre « nouveaux baptisés » est PARAMÉTRABLE (ARB-5, RG-30) : elle est
 * donc lue en base à chaque rendu, jamais codée en dur dans l'écran. La
 * modifier dans les paramètres doit changer ce que cette page montre, sans
 * qu'on ait à toucher au code.
 */
export default async function BaptemesPage() {
  const [baptemes, options, celebrants, parametres] = await Promise.all([
    chargerBaptemes(),
    getOptionsCroyant(),
    listerCelebrants(),
    getParametres(),
  ]);

  const fenetre = parametres.fenetre_nouveaux_baptises_jours;
  // Une seule signature pour tout l'ecran : celles des baptises ET celles des
  // celebrants proposes dans le formulaire. Deux appels auraient double le
  // cout pour un meme resultat.
  const photos = await signerPhotos([
    ...baptemes.map((b) => b.croyant?.photo_key),
    ...celebrants.map((c) => c.photoKey),
  ]);

  const nouveaux = baptemes.filter((b) =>
    estNouveauBaptise(new Date(b.date_bapteme), fenetre),
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Croyants"
        title="Baptêmes"
        description={
          nouveaux > 0
            ? `${formatNombre(nouveaux)} nouveau${nouveaux > 1 ? 'x' : ''} baptisé${nouveaux > 1 ? 's' : ''} sur les ${fenetre} derniers jours, sur ${formatNombre(baptemes.length)} enregistré${baptemes.length > 1 ? 's' : ''}.`
            : `${formatNombre(baptemes.length)} baptême${baptemes.length > 1 ? 's' : ''} enregistré${baptemes.length > 1 ? 's' : ''} dans votre périmètre.`
        }
        actions={
          <BaptemeDialog
            eglises={options.eglises}
            cellules={options.cellules}
            grades={options.grades}
            nationalites={options.nationalites}
            celebrants={celebrants}
            photos={Object.fromEntries(photos)}
          />
        }
      />

      <BaptemesClient
        baptemes={baptemes}
        photos={Object.fromEntries(photos)}
        fenetreJours={fenetre}
        options={options}
        celebrants={celebrants}
      />
    </div>
  );
}
