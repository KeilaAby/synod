import type { Metadata } from 'next';
import { AlertCircle } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CourbeFinances } from '@/components/tableau-de-bord/courbe-finances';
import { DerniersCroyants } from '@/components/tableau-de-bord/derniers-croyants';
import { chargerSyntheseAnnuelle } from '@/lib/data/finances';
import { signerPhotos } from '@/lib/data/photos';
import { getParametres } from '@/lib/data/settings';
import {
  chargerDerniersCroyants,
  chargerDisposition,
  chargerTableauDeBord,
} from '@/lib/data/tableau-de-bord';
import { ENTITY_LABELS, type EntityType } from '@/lib/domain/hierarchy';
import { KPI_REGISTRY, kpisVisibles } from '@/lib/domain/kpi';
import { detient } from '@/lib/domain/permissions';
import { bornesPeriode, libellePeriode } from '@/lib/domain/synthese';
import { requireSession } from '@/lib/session';

import { TableauDeBordClient } from './tableau-de-bord-client';

export const metadata: Metadata = { title: 'Tableau de bord' };

/**
 * Tableau de bord du périmètre — EF-DSH-01 à 04, EF-DSH-07, EF-DSH-11/12.
 *
 * TOUT EN UNE PASSE. `fn_tableau_de_bord` rend dix-huit mesures d'un coup : les
 * demander une par une coûterait dix-huit allers-retours avant le premier
 * chiffre, pour une page dont l'intérêt est justement de s'ouvrir d'un coup
 * (règle 28).
 *
 * LE PÉRIMÈTRE EST CELUI DE LA SESSION, et la RLS le borne — la fonction est
 * `SECURITY INVOKER`. EF-DSH-02 tient donc sans qu'aucun filtrage soit refait
 * ici : ce qu'on ne refait pas, on ne peut pas le rater.
 *
 * LE FILTRAGE PAR HABILITATION SE FAIT CÔTÉ SERVEUR (EF-DSH-12), avant que
 * quoi que ce soit ne traverse. Le client ne reçoit donc jamais la définition
 * d'un indicateur qu'il n'a pas le droit de voir, et sa personnalisation ne
 * peut pas le faire réapparaître.
 *
 * Ce que le lot 5 apportera ensuite : les rendus alternatifs — jauge, courbe,
 * camembert (EF-DSH-06) — et les indicateurs analytiques (EF-DSH-05).
 */
export default async function TableauDeBordPage() {
  const session = await requireSession();

  const typeEntite = session.entiteType as EntityType;
  const libelleType = ENTITY_LABELS[typeEntite]?.singulier ?? session.entiteType;

  // La période par défaut est le MOIS COURANT : c'est celle qu'on regarde en
  // arrivant, et la seule dont les chiffres bougent encore.
  const bornes = bornesPeriode('MOIS', new Date().toISOString().slice(0, 10));

  const visibles = kpisVisibles(KPI_REGISTRY, (p) => detient(session, p));

  /**
   * LES BLOCS COMPOSÉS NE SE CHARGENT QUE S'ILS SONT VISIBLES.
   *
   * EF-DSH-12 masque déjà leur rendu ; lire quand même leurs données coûterait
   * deux allers-retours pour un contenu que personne ne verra (règle 28) — et
   * les compter à zéro dans une RLS qui refuse est un travail parfaitement
   * inutile.
   */
  const veut = (cle: string) => visibles.some((k) => k.cle === cle);
  const annee = new Date().getFullYear();

  const [resultat, disposition, parametres, derniers, synthese] = await Promise.all([
    chargerTableauDeBord(session.entityId, bornes.debut, bornes.fin),
    chargerDisposition(),
    getParametres(),
    veut('derniers_croyants') ? chargerDerniersCroyants() : Promise.resolve([]),
    /**
     * L'ÉVOLUTION RÉUTILISE LA SYNTHÈSE DU LOT 4 : `chargerSyntheseAnnuelle`
     * rend déjà l'année entière, mois par mois et catégorie par catégorie.
     * Écrire une seconde fonction SQL pour la même somme aurait créé deux
     * chiffres que rien ne garantit égaux.
     */
    veut('evolution_finances')
      ? chargerSyntheseAnnuelle(session.entityId, annee)
      : Promise.resolve(null),
  ]);

  // EF-CRO-09 — une seule signature pour tout le lot ; aucune requête si
  // personne n'a encore de photo.
  const photos = await signerPhotos(derniers.map((c) => c.photoKey));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Périmètre — ${libelleType} ${session.entiteNom}`}
        title="Tableau de bord"
        description={`${session.entiteNom} et l'ensemble de ses entités rattachées. Les montants portent sur ${libellePeriode('MOIS', bornes.debut).toLocaleLowerCase('fr')}.`}
      />

      {/*
        UNE LECTURE QUI ÉCHOUE SE DIT. Des zéros affichés sans nuance se lisent
        « nous ne sommes rien », quand la vérité peut être « la mesure n'a pas
        abouti » (règle 15).
      */}
      {resultat.illisible && (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>
            Les indicateurs n’ont pas pu être calculés. Les chiffres ci-dessous
            sont à zéro par défaut : ils ne mesurent rien.
          </AlertDescription>
        </Alert>
      )}

      {/*
        Aucun indicateur visible est un cas RÉEL, pas une panne : un compte de
        lecture sans droit sur les croyants ni sur la structure existe.
      */}
      {visibles.length === 0 && !resultat.illisible ? (
        <Alert role="status">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>
            Aucun indicateur ne correspond à vos habilitations. Demandez à votre
            administrateur les droits de consultation dont vous avez besoin.
          </AlertDescription>
        </Alert>
      ) : (
        <TableauDeBordClient
          kpis={visibles}
          mesures={resultat.mesures}
          disposition={disposition}
          devise={parametres.devise}
          blocs={{
            LISTE_CROYANTS: (
              <DerniersCroyants
                croyants={derniers}
                photos={Object.fromEntries(photos)}
              />
            ),
            COURBE_FINANCES: synthese ? (
              <CourbeFinances
                lignes={synthese.categories}
                annee={annee}
                devise={parametres.devise}
              />
            ) : null,
          }}
        />
      )}
    </div>
  );
}
