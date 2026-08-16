import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, ArrowUpRight } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { getParametres } from '@/lib/data/settings';
import { chargerTableauDeBord } from '@/lib/data/tableau-de-bord';
import { ENTITY_LABELS, type EntityType } from '@/lib/domain/hierarchy';
import {
  KPI_REGISTRY,
  LIBELLES_GROUPE_KPI,
  type DefinitionKpi,
  groupesVisibles,
  kpiEstAlerte,
  kpisVisibles,
} from '@/lib/domain/kpi';
import { detient } from '@/lib/domain/permissions';
import { bornesPeriode, libellePeriode } from '@/lib/domain/synthese';
import { requireSession } from '@/lib/session';
import { formatMontant, formatNombre } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Tableau de bord' };

/**
 * Tableau de bord du périmètre — EF-DSH-01, EF-DSH-02, EF-DSH-04, EF-DSH-12.
 *
 * TOUT EN UNE PASSE. `fn_tableau_de_bord` rend quinze mesures d'un coup : les
 * demander une par une coûterait quinze allers-retours avant le premier
 * chiffre, pour une page dont l'intérêt est justement de s'ouvrir d'un coup
 * (règle 28).
 *
 * LE PÉRIMÈTRE EST CELUI DE LA SESSION, et la RLS le borne — la fonction est
 * `SECURITY INVOKER`. EF-DSH-02 tient donc sans qu'aucun filtrage soit refait
 * ici : ce qu'on ne refait pas, on ne peut pas le rater.
 *
 * LES INDICATEURS NON HABILITÉS DISPARAISSENT (EF-DSH-12), ils ne s'affichent
 * pas à zéro. Ce n'est pas de la cosmétique : la RLS COMPTE zéro ce qu'on ne
 * peut pas lire, et ce zéro affiché se lirait « nous n'avons rien » là où la
 * vérité est « je n'ai pas le droit de savoir » (règle 15).
 *
 * Ce que le lot 5 apportera ensuite : le choix des indicateurs par
 * l'utilisateur, leur réorganisation au glisser-déposer (EF-DSH-03, EF-DSH-07)
 * et les rendus alternatifs — jauge, courbe, camembert (EF-DSH-06).
 */
export default async function TableauDeBordPage() {
  const session = await requireSession();

  const typeEntite = session.entiteType as EntityType;
  const libelleType = ENTITY_LABELS[typeEntite]?.singulier ?? session.entiteType;

  // La période par défaut est le MOIS COURANT : c'est celle qu'on regarde en
  // arrivant, et la seule dont les chiffres bougent encore.
  const bornes = bornesPeriode('MOIS', new Date().toISOString().slice(0, 10));

  const [resultat, parametres] = await Promise.all([
    chargerTableauDeBord(session.entityId, bornes.debut, bornes.fin),
    getParametres(),
  ]);

  const visibles = kpisVisibles(KPI_REGISTRY, (p) => detient(session, p));
  const groupes = groupesVisibles(visibles);

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
        Aucun indicateur visible n'est un cas RÉEL, pas une panne : un compte
        de lecture sans droit sur les croyants ni sur la structure existe.
      */}
      {visibles.length === 0 && !resultat.illisible && (
        <Alert role="status">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>
            Aucun indicateur ne correspond à vos habilitations. Demandez à votre
            administrateur les droits de consultation dont vous avez besoin.
          </AlertDescription>
        </Alert>
      )}

      {groupes.map((groupe) => (
        <section key={groupe} className="space-y-3">
          <p className="eyebrow">{LIBELLES_GROUPE_KPI[groupe]}</p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {visibles
              .filter((k) => k.groupe === groupe)
              .map((kpi) => (
                <CarteKpi
                  key={kpi.cle}
                  definition={kpi}
                  valeur={resultat.mesures[kpi.cle] ?? 0}
                  devise={parametres.devise}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Un indicateur.
 *
 * LE CHIFFRE EST UN LIEN quand un écran porte son détail (EF-DSH-09) : voir
 * « 12 transferts à décider » sans pouvoir y aller oblige à retrouver l'écran
 * et à y reposer le filtre qu'on vient de lire.
 */
function CarteKpi({
  definition,
  valeur,
  devise,
}: {
  definition: DefinitionKpi;
  valeur: number;
  devise: string;
}) {
  const alerte = kpiEstAlerte(definition, valeur);

  const contenu = (
    <CardContent className="space-y-1 p-6">
      <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
        {definition.libelle}
        {definition.lien && (
          <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        )}
      </p>

      <p
        className={`text-2xl font-semibold tabular-nums ${
          alerte ? 'text-rose-700' : 'text-foreground'
        }`}
      >
        {definition.format === 'MONTANT'
          ? formatMontant(valeur, devise)
          : formatNombre(valeur)}
      </p>

      {definition.aide && (
        <p className="text-muted-foreground text-xs">{definition.aide}</p>
      )}
    </CardContent>
  );

  if (!definition.lien) return <Card>{contenu}</Card>;

  return (
    <Card className="group hover:border-foreground/20 transition-colors">
      <Link href={definition.lien} className="block">
        {contenu}
      </Link>
    </Card>
  );
}
