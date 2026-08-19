import type { Metadata } from 'next';
import { Network, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ChiffresEntiteBloc } from '@/components/structure/chiffres-entite';
import { EntityActions } from '@/components/structure/entity-actions';
import { NouvelleEntiteBouton } from '@/components/structure/nouvelle-entite-bouton';
import { TypeBadge } from '@/components/structure/type-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  chargerChiffresPerimetre,
  getArbrePerimetre,
  getEntite,
} from '@/lib/data/entities';
import { versOptions } from '@/lib/data/entity-options';
import { chargerSoldesPerimetre } from '@/lib/data/finances';
import { getParametres } from '@/lib/data/settings';
import {
  ENTITY_LABELS,
  ENTITY_TYPES,
  type EntityType,
  typeEnfantDe,
  typeParentDe,
} from '@/lib/domain/hierarchy';
import { peut } from '@/lib/domain/permissions';
import { getSession } from '@/lib/session';
import { formatDateLongue, formatNombre } from '@/lib/utils/format';

type Params = { params: Promise<{ entityId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { entityId } = await params;
  const fiche = await getEntite(entityId);
  return { title: fiche?.entite.nom ?? 'Entite' };
}

/**
 * EF-STR-06 — fiche d'une entite.
 *
 * Les effectifs, le bureau courant et le solde figurent dans l'onglet
 * Statistiques, chacun renvoyant vers son ecran. Un bloc dont l'habilitation
 * manque DISPARAIT : la RLS le compterait a zero, et ce zero se lirait « il n'y
 * a personne » la ou la verite est « je n'ai pas le droit de savoir »
 * (regle 15).
 */
export default async function FicheEntitePage({ params }: Params) {
  const { entityId } = await params;

  const fiche = await getEntite(entityId);
  if (!fiche) notFound();

  const { entite, ancetres, enfants } = fiche;

  /**
   * EF-STR-06 — tout part EN PARALLÈLE (règle 28). Quatre lectures enchaînées,
   * c'est quatre fois 0,5 à 4 s avant le premier pixel ; simultanées, c'est le
   * coût de la plus lente.
   *
   * Les soldes viennent de `chargerSoldesPerimetre` et non d'une somme écrite
   * ici : deux calculs du même nombre finissent par différer (règle 16).
   */
  const session = await getSession();
  const [arbre, chiffres, soldes, parametres] = await Promise.all([
    getArbrePerimetre(),
    chargerChiffresPerimetre(),
    chargerSoldesPerimetre(),
    getParametres(),
  ]);

  /**
   * RÈGLE 15 — un bloc non habilité DISPARAÎT, il ne s'affiche pas à zéro.
   *
   * La RLS compte à zéro ce qu'on n'a pas le droit de lire, et ce zéro se
   * lirait « cette église n'a personne » quand la vérité est « je n'ai pas le
   * droit de savoir ». Le droit s'évalue AVEC SA PORTÉE (règle 3) : détenir
   * `croyant.read` ne dit rien tant qu'on ne sait pas sur quelle entité.
   */
  const droitsChiffres = {
    croyants: session ? peut(session, 'croyant.read', entite.path) : false,
    bureau: session ? peut(session, 'bureau.read', entite.path) : false,
    finances: session ? peut(session, 'finance.read', entite.path) : false,
  };

  const typeEnfant = typeEnfantDe(entite.type);
  const typeParent = typeParentDe(entite.type);

  // Creer depuis cette fiche ne peut produire qu'un enfant DE CETTE entite :
  // le rattachement est impose, il n'y a rien a choisir (RG-01).
  const cible = {
    id: entite.id,
    nom: entite.nom,
    code: entite.code,
    type: entite.type,
  };

  // Destinations valides pour un rattachement : meme niveau que le parent
  // actuel, l'entite elle-meme et son sous-arbre exclus (pas de cycle).
  const parentsValides = versOptions(
    arbre.filter(
      (e) =>
        e.type === typeParent &&
        e.id !== entite.id &&
        !e.path.startsWith(`${entite.path}.`) &&
        e.id !== entite.parent_id,
    ),
    arbre,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={ancetres.map((a) => a.nom).join(' › ') || 'Racine de la hierarchie'}
        title={entite.nom}
        description={entite.description ?? undefined}
        actions={
          <>
            {typeEnfant && (
              <NouvelleEntiteBouton
                parent={cible}
                scope={entite.path}
                variant="outline"
                libelle={`Ajouter ${ENTITY_LABELS[typeEnfant].singulier.toLowerCase()}`}
              />
            )}
            <EntityActions
              entite={{
                id: entite.id,
                nom: entite.nom,
                type: entite.type,
                path: entite.path,
                sans_acces_application: entite.sans_acces_application,
                nbEnfants: entite.nbEnfants,
              }}
              parentsValides={parentsValides}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type={entite.type} />
        <span className="font-mono text-sm text-muted-foreground">{entite.code}</span>
        <StatusBadge tone={entite.is_active ? 'success' : 'neutral'}>
          {entite.is_active ? 'Active' : 'Inactive'}
        </StatusBadge>
        {entite.sans_acces_application && (
          <StatusBadge tone="warning">
            <WifiOff className="mr-1 size-3" aria-hidden />
            Sans acces — saisie deleguee au Siege
          </StatusBadge>
        )}
      </div>

      <Tabs defaultValue="informations">
        <TabsList>
          <TabsTrigger value="informations">Informations</TabsTrigger>
          <TabsTrigger value="sous-entites">
            Sous-entites
            {enfants.length > 0 && (
              <span className="ml-2 font-mono text-xs tabular-nums">{enfants.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="statistiques">Statistiques</TabsTrigger>
        </TabsList>

        {/* --- Informations --- */}
        <TabsContent value="informations" className="mt-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="space-y-6 p-6">
                <p className="eyebrow">Identification</p>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Donnee libelle="Nom" valeur={entite.nom} />
                  <Donnee libelle="Code" valeur={entite.code} mono />
                  <Donnee
                    libelle="Niveau"
                    valeur={ENTITY_LABELS[entite.type].singulier}
                  />
                  <Donnee
                    libelle="Profondeur"
                    valeur={`Niveau ${entite.niveau} sur ${ENTITY_TYPES.length}`}
                  />
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-6 p-6">
                <p className="eyebrow">Rattachement</p>
                <dl className="grid gap-4">
                  <Donnee
                    libelle="Chemin complet"
                    valeur={
                      [...ancetres.map((a) => a.nom), entite.nom].join(' › ')
                    }
                  />
                  <Donnee
                    libelle="Cree le"
                    valeur={formatDateLongue(entite.created_at)}
                  />
                  <Donnee
                    libelle="Derniere modification"
                    valeur={formatDateLongue(entite.updated_at)}
                  />
                </dl>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* --- Sous-entites --- */}
        <TabsContent value="sous-entites" className="mt-6">
          {enfants.length === 0 ? (
            <EmptyState
              icon={Network}
              title={
                typeEnfant
                  ? `Aucune ${ENTITY_LABELS[typeEnfant].singulier.toLowerCase()} rattachee`
                  : 'Ce niveau est une feuille de la hierarchie'
              }
              description={
                typeEnfant
                  ? `Creez la premiere ${ENTITY_LABELS[typeEnfant].singulier.toLowerCase()} de « ${entite.nom} ».`
                  : 'Une cellule de priere regroupe des croyants, pas des sous-entites.'
              }
              action={
                typeEnfant ? (
                  <NouvelleEntiteBouton
                    parent={cible}
                    scope={entite.path}
                    libelle={`Ajouter ${ENTITY_LABELS[typeEnfant].singulier.toLowerCase()}`}
                  />
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {enfants.map((enfant) => (
                <Link key={enfant.id} href={`/structure/${enfant.id}`} className="group">
                  <Card className="h-full transition-colors group-hover:border-slate-300">
                    <CardContent className="space-y-4 p-6">
                      <div className="flex items-start justify-between gap-2">
                        <TypeBadge type={enfant.type} />
                        {enfant.sans_acces_application && (
                          <WifiOff className="size-4 text-slate-400" aria-hidden />
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {enfant.nom}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {enfant.code}
                        </p>
                      </div>
                      <p className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatNombre(enfant.nbDescendants)} sous-entite
                        {enfant.nbDescendants > 1 ? 's' : ''}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* --- Statistiques --- */}
        <TabsContent value="statistiques" className="mt-6">
          <Card>
            <CardContent className="space-y-6 p-6">
              <div className="space-y-1">
                <p className="eyebrow">Composition du sous-arbre</p>
                <p className="text-sm text-muted-foreground">
                  Reparti par niveau, « {entite.nom} » exclue.
                </p>
              </div>

              {entite.nbDescendants === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune entite rattachee pour le moment.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  {ENTITY_TYPES.filter((t) => entite.descendantsParType[t]).map((type) => (
                    <div
                      key={type}
                      className="space-y-2 rounded-md border border-border p-4"
                    >
                      <p className="text-xs text-muted-foreground">
                        {ENTITY_LABELS[type].pluriel}
                      </p>
                      <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
                        {formatNombre(entite.descendantsParType[type as EntityType] ?? 0)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/*
                EF-STR-06 — les chiffres promis « avec les lots 2, 3 et 4 ».
                Ces lots sont livrés ; la promesse ne l'était pas.
              */}
              <div className="border-border space-y-4 border-t pt-6">
                <div className="space-y-1">
                  <p className="eyebrow">Ce que porte cette entité</p>
                  <p className="text-muted-foreground text-sm">
                    Effectifs et solde comptent « {entite.nom} » et tout son
                    périmètre.
                  </p>
                </div>

                <ChiffresEntiteBloc
                  entiteId={entite.id}
                  nom={entite.nom}
                  chiffres={chiffres.get(entite.id) ?? null}
                  solde={soldes.get(entite.id) ?? null}
                  devise={parametres.devise}
                  droits={droitsChiffres}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
      <dd
        className={
          mono ? 'font-mono text-sm text-foreground' : 'text-sm text-foreground'
        }
      >
        {valeur}
      </dd>
    </div>
  );
}
