import type { Metadata } from 'next';
import { AlertCircle } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CourbeFinances } from '@/components/tableau-de-bord/courbe-finances';
import { DerniersCroyants } from '@/components/tableau-de-bord/derniers-croyants';
import { Jauge } from '@/components/tableau-de-bord/jauge';
import { RepartitionBarres } from '@/components/tableau-de-bord/repartition-barres';
import { chargerSyntheseAnnuelle } from '@/lib/data/finances';
import { signerPhotos } from '@/lib/data/photos';
import { getArbrePerimetre } from '@/lib/data/entities';
import { versOptions } from '@/lib/data/entity-options';
import { getParametres } from '@/lib/data/settings';
import {
  chargerDerniersCroyants,
  chargerDisposition,
  chargerRepartitions,
  chargerTableauDeBord,
} from '@/lib/data/tableau-de-bord';
import { ENTITY_LABELS, type EntityType } from '@/lib/domain/hierarchy';
import {
  KPI_REGISTRY,
  type TrancheRepartition,
  couverture,
  kpisVisibles,
  preparerRepartition,
} from '@/lib/domain/kpi';
import { detient } from '@/lib/domain/permissions';
import { bornesPeriode, estGranularite, libellePeriode } from '@/lib/domain/synthese';
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
 * LE PÉRIMÈTRE ET LA PÉRIODE SE RÈGLENT (EF-DSH-06), et voyagent par l'URL. Ce
 * n'est pas une préférence durable comme le choix des indicateurs : « comment
 * allait mars ? » est une question du moment, et la ranger dans
 * `dashboard_layouts` ferait rouvrir l'écran sur un mois figé des semaines plus
 * tard. L'URL, elle, se partage — ce qu'une préférence ne fait pas.
 */
export default async function TableauDeBordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const arbre = await getArbrePerimetre();

  /**
   * L'ENTITÉ OBSERVÉE — celle de l'URL si elle appartient VRAIMENT au
   * périmètre, sinon celle de la session.
   *
   * La vérification n'est pas de la défiance : la RLS refuserait de toute
   * façon une entité hors portée, mais elle rendrait des zéros — et des zéros
   * se lisent « nous n'avons rien » (règle 15). Retomber sur la session dit la
   * vérité : l'écran montre bien quelque chose, et on voit lequel.
   */
  const observee =
    arbre.find((e) => e.id === params.entite) ??
    arbre.find((e) => e.id === session.entityId) ??
    null;

  const entiteId = observee?.id ?? session.entityId;
  const entiteNom = observee?.nom ?? session.entiteNom;
  const typeEntite = (observee?.type ?? session.entiteType) as EntityType;
  const libelleType = ENTITY_LABELS[typeEntite]?.singulier ?? typeEntite;

  /**
   * La période. Par défaut le MOIS COURANT : c'est celle qu'on regarde en
   * arrivant, et la seule dont les chiffres bougent encore.
   */
  const granularite = estGranularite(params.granularite) ? params.granularite : 'MOIS';
  const ancre = /^\d{4}-\d{2}-\d{2}$/.test(params.ancre ?? '')
    ? params.ancre!
    : new Date().toISOString().slice(0, 10);

  const bornes = bornesPeriode(granularite, ancre);

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

  const veutUneRepartition = ['age', 'grade', 'nationalite', 'entite'].some((d) =>
    veut(`repartition_${d}`),
  );

  const [resultat, disposition, parametres, derniers, synthese, repartitions] =
    await Promise.all([
    chargerTableauDeBord(entiteId, bornes.debut, bornes.fin),
    chargerDisposition(),
    getParametres(),
    veut('derniers_croyants') ? chargerDerniersCroyants() : Promise.resolve([]),
    /**
     * L'ÉVOLUTION RÉUTILISE LA SYNTHÈSE DU LOT 4 : `chargerSyntheseAnnuelle`
     * rend déjà l'année entière, mois par mois et catégorie par catégorie.
     * Écrire une seconde fonction SQL pour la même somme aurait créé deux
     * chiffres que rien ne garantit égaux.
     */
    /**
     * `catch` — UN BLOC QUI ÉCHOUE N'EMPORTE PAS LES DIX-NEUF AUTRES.
     *
     * `chargerSyntheseAnnuelle` LÈVE, et c'est juste sur `/finances/synthese`
     * où elle EST l'écran : mieux vaut une erreur franche qu'une page vide.
     * Ici elle n'alimente qu'un bloc parmi vingt, et sa panne faisait tomber le
     * tableau de bord entier — effectifs, structure et gouvernance compris,
     * qui n'ont rien à voir avec les finances.
     *
     * Toutes les autres lectures de cet écran dégradent déjà ainsi ; celle-ci
     * était la seule à ne pas le faire, parce qu'elle avait été écrite pour un
     * autre écran. Le bloc affiche alors « Ce bloc n'a pas pu être chargé ».
     */
    veut('evolution_finances')
      ? chargerSyntheseAnnuelle(entiteId, annee).catch(() => null)
      : Promise.resolve(null),
    /**
     * QUATRE RÉPARTITIONS, UNE SEULE LECTURE. Elles répondent à la même
     * question — « comment se décompose notre effectif ? » — et ne diffèrent
     * que par la colonne de regroupement (règle 28). Il suffit donc qu'UNE
     * seule soit visible pour que la lecture vaille la peine.
     */
    veutUneRepartition
      ? chargerRepartitions(entiteId)
      : Promise.resolve([] as TrancheRepartition[]),
  ]);

  // EF-CRO-09 — une seule signature pour tout le lot ; aucune requête si
  // personne n'a encore de photo.
  const photos = await signerPhotos(derniers.map((c) => c.photoKey));

  return (
    /*
      FOND BLANC pour cet écran : les cartes s'y détachent par leur OMBRE, pas
      par un contraste de fond. Sur le gris de page, une carte blanche se
      découpe toute seule ; ici, c'est le relief qui la sépare — et la lecture
      y gagne, parce que rien ne vient concurrencer les chiffres.
    */
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Périmètre — ${libelleType} ${entiteNom}`}
        title="Tableau de bord"
        /* CE QUE LES CHIFFRES COMPTENT, dit sans détour : un écran dont la
           période se règle doit annoncer celle qu'il montre, sinon on lit les
           chiffres d'un mois en croyant lire ceux d'un autre. */
        description={`${entiteNom} et l'ensemble de ses entités rattachées. Les montants portent sur ${libellePeriode(granularite, ancre).toLocaleLowerCase('fr')}.`}
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
          // EF-DSH-06 — le réglage voyage par l'URL, pas par la disposition.
          entites={versOptions(
            arbre.filter((e) => e.is_active),
            arbre,
          )}
          entiteId={entiteId}
          entiteNom={entiteNom}
          granularite={granularite}
          ancre={ancre}
          devise={parametres.devise}
          /*
            CHAQUE BLOC PORTE UNE `key`, et ce n'est pas superflu.

            Ces éléments sont construits ici puis traversent la frontière
            serveur → client à l'intérieur d'un objet. React les voit alors
            comme une COLLECTION venue d'un même parent et réclame une identité
            stable ; sans elle, il avertit en console et se réserve le droit de
            démonter puis remonter un bloc quand l'ordre change — ce que la
            personnalisation fait précisément.

            La clé du bloc est déjà cette identité : on la reprend telle quelle.
          */
          blocs={{
            derniers_croyants: (
              <DerniersCroyants
                key="derniers_croyants"
                croyants={derniers}
                photos={Object.fromEntries(photos)}
              />
            ),

            evolution_finances: synthese ? (
              <CourbeFinances
                key="evolution_finances"
                lignes={synthese.categories}
                annee={annee}
                devise={parametres.devise}
              />
            ) : null,

            /*
              LES QUATRE RÉPARTITIONS SORTENT DE LA MÊME LECTURE, préparées
              chacune selon sa dimension. `preparerRepartition` est pur et
              testé : l'ordre, les parts et le plafond n'ont pas à être refaits
              dans le composant.
            */
            repartition_age: (
              <RepartitionBarres
                key="repartition_age"
                {...preparerRepartition(repartitions, 'AGE')}
                titre="Répartition par âge"
              />
            ),

            repartition_grade: (
              <RepartitionBarres
                key="repartition_grade"
                {...preparerRepartition(repartitions, 'GRADE')}
                titre="Répartition par grade"
              />
            ),

            repartition_nationalite: (
              <RepartitionBarres
                key="repartition_nationalite"
                {...preparerRepartition(repartitions, 'NATIONALITE')}
                titre="Répartition par nationalité"
              />
            ),

            repartition_entite: (
              <RepartitionBarres
                key="repartition_entite"
                {...preparerRepartition(repartitions, 'ENTITE')}
                titre="Effectif par entité fille"
              />
            ),

            couverture_bureaux: (
              <Jauge
                key="couverture_bureaux"
                valeur={couverture(
                  resultat.mesures.bureaux_actifs ?? 0,
                  resultat.mesures.entites_a_bureau ?? 0,
                )}
                couvertes={resultat.mesures.bureaux_actifs ?? 0}
                total={resultat.mesures.entites_a_bureau ?? 0}
                suffixe="entités"
              />
            ),
          }}
        />
      )}
    </div>
  );
}
