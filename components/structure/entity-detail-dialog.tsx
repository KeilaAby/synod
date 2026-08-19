'use client';

import { ExternalLink, Pencil, Plus, WifiOff } from 'lucide-react';
import Link from 'next/link';

import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import type { ChiffresEntite } from '@/lib/data/entities';
import type { Solde } from '@/lib/domain/finance';
import {
  ENTITY_LABELS,
  ENTITY_TYPES,
  type EntityType,
  estDescendant,
  typeEnfantDe,
} from '@/lib/domain/hierarchy';
import { formatDateLongue, formatNombre } from '@/lib/utils/format';

import { ChiffresEntiteBloc, type DroitsChiffres } from './chiffres-entite';
import { TypeBadge } from './type-badge';

/**
 * Consultation d'une entite sans quitter l'organigramme — EF-STR-06.
 *
 * Les donnees viennent de l'arbre DEJA charge : aucune requete, aucun
 * squelette, ouverture instantanee. La page `/structure/[id]` reste
 * accessible pour le lien profond et le partage.
 */

export interface EntiteDetail {
  id: string;
  nom: string;
  code: string;
  type: EntityType;
  path: string;
  parent_id: string | null;
  description: string | null;
  nbDescendants: number;
  nbEnfants: number;
  descendantsParType: Partial<Record<EntityType, number>>;
  sans_acces_application: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function EntityDetailDialog({
  entite,
  toutes,
  peutModifier,
  ouvert,
  onOuvertChange,
  onModifier,
  onCreerEnfant,
  chiffres,
  solde,
  devise,
  droits,
}: {
  entite: EntiteDetail | null;
  /** Arbre complet : sert a reconstituer le chemin d'ancetres, sans requete. */
  toutes: readonly { id: string; nom: string; path: string; niveau: number }[];
  peutModifier: boolean;
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
  onModifier: (id: string) => void;
  onCreerEnfant: (id: string) => void;
  /** EF-STR-06 — pris du perimetre deja charge : aucune requete a l'ouverture. */
  chiffres: ChiffresEntite | null;
  solde: Solde | null;
  devise: string;
  droits: DroitsChiffres;
}) {
  if (!entite) return null;

  const ancetres = toutes
    .filter((e) => e.id !== entite.id && estDescendant(entite.path, e.path))
    .sort((a, b) => a.niveau - b.niveau);

  const typeEnfant = typeEnfantDe(entite.type);
  const typesPresents = ENTITY_TYPES.filter((t) => entite.descendantsParType[t]);

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent className="max-h-[90vh] w-[min(96vw,64rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <p className="eyebrow">
            {ancetres.map((a) => a.nom).join(' › ') || 'Racine de la hierarchie'}
          </p>
          <DialogTitle className="text-2xl">{entite.nom}</DialogTitle>
          {entite.description && (
            <DialogDescription>{entite.description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-8 py-2">
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

          <Separator />

          {/* --- Identification et rattachement --- */}
          <div className="grid gap-8 md:grid-cols-2">
            <section className="space-y-4">
              <p className="eyebrow">Identification</p>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Donnee libelle="Niveau" valeur={ENTITY_LABELS[entite.type].singulier} />
                <Donnee libelle="Code" valeur={entite.code} mono />
                <Donnee
                  libelle="Sous-entites directes"
                  valeur={formatNombre(entite.nbEnfants)}
                  mono
                />
                <Donnee
                  libelle="Total du sous-arbre"
                  valeur={formatNombre(entite.nbDescendants)}
                  mono
                />
              </dl>
            </section>

            <section className="space-y-4">
              <p className="eyebrow">Rattachement</p>
              <dl className="space-y-4">
                <Donnee
                  libelle="Chemin complet"
                  valeur={[...ancetres.map((a) => a.nom), entite.nom].join(' › ')}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Donnee libelle="Creee le" valeur={formatDateLongue(entite.created_at)} />
                  <Donnee
                    libelle="Derniere modification"
                    valeur={formatDateLongue(entite.updated_at)}
                  />
                </div>
              </dl>
            </section>
          </div>

          {/* --- Composition --- */}
          {entite.nbDescendants > 0 && (
            <>
              <Separator />
              <section className="space-y-4">
                <div className="space-y-1">
                  <p className="eyebrow">Composition du sous-arbre</p>
                  <p className="text-sm text-muted-foreground">
                    Repartie par niveau, « {entite.nom} » exclue.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  {typesPresents.map((type) => (
                    <div key={type} className="space-y-2 rounded-md border border-border p-4">
                      <p className="text-xs text-muted-foreground">
                        {ENTITY_LABELS[type].pluriel}
                      </p>
                      <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
                        {formatNombre(entite.descendantsParType[type] ?? 0)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/*
            EF-STR-06 — les chiffres promis « avec les lots 2, 3 et 4 ». Ces
            lots sont livrés ; la promesse ne l'était pas.

            Ils viennent du périmètre DÉJÀ chargé avec l'arbre : l'ouverture
            reste instantanée, sans requête ni squelette (règle 28).
          */}
          <div className="border-border space-y-4 border-t pt-4">
            <p className="eyebrow">Ce que porte cette entité</p>
            <ChiffresEntiteBloc
              entiteId={entite.id}
              nom={entite.nom}
              chiffres={chiffres}
              solde={solde}
              devise={devise}
              droits={droits}
              colonnes={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button asChild variant="ghost" className="h-10">
            <Link href={`/structure/${entite.id}`}>
              <ExternalLink className="mr-2 size-4" aria-hidden />
              Ouvrir en pleine page
            </Link>
          </Button>

          {peutModifier && (
            <div className="flex gap-2">
              {typeEnfant && (
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() => onCreerEnfant(entite.id)}
                >
                  <Plus className="mr-2 size-4" aria-hidden />
                  Ajouter {ENTITY_LABELS[typeEnfant].singulier.toLowerCase()}
                </Button>
              )}
              <Button className="h-10" onClick={() => onModifier(entite.id)}>
                <Pencil className="mr-2 size-4" aria-hidden />
                Modifier
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
