import type { Metadata } from 'next';

import { NouveauCroyantDialog } from '@/components/croyants/croyant-dialog';
import { ImportCroyantsDialog } from '@/components/croyants/import-dialog';
import { PromotionsEnAttente } from '@/components/croyants/promotions-en-attente';
import { RapprochementsDimes } from '@/components/croyants/rapprochements-dimes';
import { PageHeader } from '@/components/shared/page-header';
import { chargerCroyants } from '@/lib/data/croyants';
import { chargerPorteursDEnveloppe, chargerRapprochements } from '@/lib/data/dimes';
import { getOptionsCroyant } from '@/lib/data/croyant-options';
import { signerPhotos } from '@/lib/data/photos';
import { chargerPromotionsEnAttente } from '@/lib/data/promotions';
import { getParametres } from '@/lib/data/settings';
import {
  FILTRES_LISTE_VIDES,
  type FiltresListeCroyants,
  SEXES,
  STATUTS_CROYANT,
  type Sexe,
  type StatutCroyant,
} from '@/lib/domain/croyant';
import { formatNombre } from '@/lib/utils/format';

import { CroyantsClient } from './croyants-client';

export const metadata: Metadata = { title: 'Croyants' };

/**
 * EF-CRO-04 — liste des croyants.
 *
 * La page ne fait plus qu'une chose : charger le périmètre en UNE requête.
 * Filtrage, pagination et pop-up vivent ensuite dans le navigateur, ce qui rend
 * la recherche instantanée (voir `croyants-client.tsx` pour la raison, et
 * `chargerCroyants` pour la limite qui borne ce choix).
 *
 * Les paramètres d'URL ne servent qu'à AMORCER l'état : ils ne déclenchent plus
 * de rendu serveur à chaque changement de filtre.
 */
export default async function CroyantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const [lot, options, rapprochements, porteurs, parametres, promotions] =
    await Promise.all([
    // Le périmètre chargé se restreint à l'église choisie : c'est le seul
    // filtre qui change le VOLUME lu, et donc le seul qui reste côté serveur.
    chargerCroyants(params.eglise),
    getOptionsCroyant(),
    /**
     * EF-FIN-34 — les versements de dîme dont le nom n'a pas été reconnu.
     *
     * Ils sont ICI, et non dans les finances : le travail à faire est de
     * l'IDENTIFICATION, pas de la comptabilité. Le montant est déjà compté ;
     * ce qu'on cherche, c'est qui est « Razafindraparany » écrit autrement.
     */
    chargerRapprochements(),
    /**
     * EF-FIN-27 — qui a déjà porté chaque numéro d'enveloppe.
     *
     * La ligne d'import apporte souvent un NUMÉRO en même temps que le nom
     * qu'on n'a pas reconnu : c'est la piste la plus sûre des deux, une
     * enveloppe se gardant d'une année sur l'autre.
     */
    chargerPorteursDEnveloppe(),
    getParametres(),
    /**
     * EF-CRO-12 — les promotions de grade qui attendent une décision.
     *
     * Elles sont ICI pour la même raison que les rapprochements : ce qui ATTEND
     * passe avant ce qui se consulte, et une file invisible ne se traite jamais.
     */
    chargerPromotionsEnAttente(),
  ]);

  // EF-CRO-09 — une seule signature pour tout le lot ; aucune requête si
  // personne n'a encore de photo, ce qui reste le cas le plus fréquent.
  const photos = await signerPhotos(lot.lignes.map((c) => c.photo_key));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Croyants"
        title="Croyants"
        description={
          lot.tronque
            ? `Plus de ${formatNombre(lot.lignes.length)} croyants dans votre périmètre — restreignez l'église pour une recherche exhaustive.`
            : `${formatNombre(lot.lignes.length)} croyant${lot.lignes.length > 1 ? 's' : ''} dans votre périmètre.`
        }
        actions={
          <>
            {/* EF-CRO-11 — l'import vient AVANT la saisie unitaire dans l'ordre
                de lecture : c'est le premier geste d'une reprise de donnees. */}
            <ImportCroyantsDialog />
            <NouveauCroyantDialog options={options} />
          </>
        }
      />

      {/* Ce qui ATTEND passe avant ce qui se consulte : une file invisible ne
          se traite jamais. */}
      <PromotionsEnAttente
        promotions={promotions}
        photos={Object.fromEntries(photos)}
      />

      <RapprochementsDimes
        rapprochements={rapprochements}
        croyants={lot.lignes.map((c) => ({
          id: c.id,
          nom: c.nom,
          prenom: c.prenom,
          matricule: c.matricule,
          photoKey: c.photo_key,
          detail: c.eglise?.nom ?? null,
        }))}
        photos={Object.fromEntries(photos)}
        devise={parametres.devise}
        options={options}
        porteurs={Object.fromEntries(porteurs)}
      />

      <CroyantsClient
        croyants={lot.lignes}
        photos={Object.fromEntries(photos)}
        tronque={lot.tronque}
        options={options}
        // L'église de l'URL n'est retenue que si c'en est vraiment une : une
        // URL modifiée à la main donnerait sinon une liste vide sans raison
        // visible, et un vide inexpliqué se lit comme une panne.
        filtresInitiaux={filtresDepuisUrl(
          params,
          options.eglises.some((e) => e.id === params.eglise),
        )}
      />
    </div>
  );
}

/** Amorce les filtres depuis l'URL, en ignorant silencieusement l'invalide. */
function filtresDepuisUrl(
  params: Record<string, string | undefined>,
  egliseConnue: boolean,
): FiltresListeCroyants {
  const dans = <T extends string>(liste: readonly T[], valeur?: string): T | null =>
    valeur && (liste as readonly string[]).includes(valeur) ? (valeur as T) : null;

  const entier = (valeur?: string): number | null => {
    if (!valeur) return null;
    const n = Number.parseInt(valeur, 10);
    return Number.isFinite(n) && n >= 0 && n <= 130 ? n : null;
  };

  return {
    recherche: params.q ?? '',
    egliseId: egliseConnue ? (params.eglise ?? null) : null,
    sexe: dans<Sexe>(SEXES, params.sexe),
    statut:
      dans<StatutCroyant>(STATUTS_CROYANT, params.statut) ?? FILTRES_LISTE_VIDES.statut,
    enCellule:
      params.encellule === 'oui' ? true : params.encellule === 'non' ? false : null,
    gradeId: params.grade ?? null,
    nationaliteId: params.nationalite ?? null,
    ageMin: entier(params.age_min),
    ageMax: entier(params.age_max),
  };
}
