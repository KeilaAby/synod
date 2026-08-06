import type { Metadata } from 'next';
import { ArrowLeftRight, Pencil, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { PermissionGate } from '@/components/shared/permission-gate';
import { StatusBadge, TON_CROYANT } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getCroyant } from '@/lib/data/croyants';
import { getArbrePerimetre, cheminLisible, indexerParChemin } from '@/lib/data/entities';
import {
  LIBELLES_SEXE,
  LIBELLES_STATUT_CROYANT,
  LIBELLES_STATUT_MARITAL,
  type StatutCroyant,
  type StatutMarital,
  calculerAge,
  estNouveauBaptise,
  nomComplet,
} from '@/lib/domain/croyant';
import { formatDateLongue } from '@/lib/utils/format';

type Params = { params: Promise<{ croyantId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { croyantId } = await params;
  const croyant = await getCroyant(croyantId);
  return {
    title: croyant ? nomComplet(croyant.nom, croyant.prenom) : 'Croyant',
  };
}

/** EF-CRO-06 — fiche complète du croyant. */
export default async function FicheCroyantPage({ params }: Params) {
  const { croyantId } = await params;

  const croyant = await getCroyant(croyantId);
  if (!croyant) notFound();

  const arbre = await getArbrePerimetre();
  const index = indexerParChemin(arbre);
  const eglise = arbre.find((e) => e.id === croyant.eglise_id);

  const age = calculerAge(new Date(croyant.date_naissance));
  const nouveauBaptise = estNouveauBaptise(new Date(croyant.date_bapteme));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={eglise ? cheminLisible(eglise, index) : 'Croyant'}
        title={nomComplet(croyant.nom, croyant.prenom)}
        description={`Matricule ${croyant.matricule}`}
        actions={
          eglise && (
            <>
              <PermissionGate perm="croyant.transfer" scope={eglise.path}>
                <Button asChild variant="outline" className="h-10">
                  <Link href={`/croyants/${croyant.id}/transferer`}>
                    <ArrowLeftRight className="mr-2 size-4" aria-hidden />
                    Transférer
                  </Link>
                </Button>
              </PermissionGate>

              <PermissionGate perm="croyant.update" scope={eglise.path}>
                <Button asChild className="h-10">
                  <Link href={`/croyants/${croyant.id}/modifier`}>
                    <Pencil className="mr-2 size-4" aria-hidden />
                    Modifier
                  </Link>
                </Button>
              </PermissionGate>
            </>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={TON_CROYANT[croyant.statut] ?? 'neutral'}>
          {LIBELLES_STATUT_CROYANT[croyant.statut as StatutCroyant] ?? croyant.statut}
        </StatusBadge>

        {/* RG-30 — fenêtre de 15 jours, paramétrable. */}
        {nouveauBaptise && <StatusBadge tone="accent">Nouveau baptisé</StatusBadge>}

        {eglise?.sans_acces_application && (
          <StatusBadge tone="warning">
            <WifiOff className="mr-1 size-3" aria-hidden />
            Église sans accès à l&apos;application
          </StatusBadge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="space-y-6 p-6">
            <p className="eyebrow">Identité</p>
            <dl className="space-y-4">
              <Donnee libelle="Nom" valeur={croyant.nom.toLocaleUpperCase('fr')} />
              <Donnee libelle="Prénom" valeur={croyant.prenom} />
              <Donnee libelle="Sexe" valeur={LIBELLES_SEXE[croyant.sexe]} />
              <Donnee
                libelle="Date de naissance"
                valeur={`${formatDateLongue(croyant.date_naissance)} · ${age} ans`}
              />
              <Donnee
                libelle="Statut marital"
                valeur={
                  croyant.statut_marital
                    ? (LIBELLES_STATUT_MARITAL[croyant.statut_marital as StatutMarital] ??
                      croyant.statut_marital)
                    : 'Non renseigné'
                }
              />
              <Donnee
                libelle="Nationalité"
                valeur={croyant.nationalite?.libelle ?? '—'}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-6 p-6">
            <p className="eyebrow">Coordonnées</p>
            <dl className="space-y-4">
              <Donnee libelle="Adresse" valeur={croyant.adresse} />
              <Donnee libelle="Téléphone" valeur={croyant.telephone ?? 'Non renseigné'} mono />
              <Donnee libelle="Adresse e-mail" valeur={croyant.email ?? 'Non renseignée'} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-6 p-6">
            <p className="eyebrow">Rattachement ecclésial</p>
            <dl className="space-y-4">
              <Donnee libelle="Église" valeur={croyant.eglise?.nom ?? '—'} />
              <Donnee
                libelle="Cellule de prière"
                valeur={croyant.cellule?.nom ?? 'Aucune'}
              />
              <Donnee libelle="Grade" valeur={croyant.grade?.libelle ?? '—'} />
              <Donnee
                libelle="Date de baptême"
                valeur={formatDateLongue(croyant.date_bapteme)}
              />
              <Donnee libelle="Matricule" valeur={croyant.matricule} mono />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="eyebrow">Historique</p>
          <p className="text-sm text-muted-foreground">
            Fiche créée le {formatDateLongue(croyant.created_at)} · dernière modification le{' '}
            {formatDateLongue(croyant.updated_at)}.
          </p>
          <p className="border-t border-border pt-4 text-xs text-muted-foreground">
            L&apos;historique des transferts et les fonctions occupées en bureau
            apparaîtront ici avec la suite du lot 2 et le lot 3.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Donnee({
  libelle,
  valeur,
  mono,
}: {
  libelle: string;
  valeur: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{libelle}</dt>
      <dd className={mono ? 'font-mono text-sm text-foreground' : 'text-sm text-foreground'}>
        {valeur}
      </dd>
    </div>
  );
}
