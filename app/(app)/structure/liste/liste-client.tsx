'use client';

import { Network, WifiOff } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import { EmptyState } from '@/components/shared/empty-state';
import { useSession } from '@/components/shared/session-provider';
import { StatusBadge } from '@/components/shared/status-badge';
import type { EntiteFlux } from '@/components/structure/entite';
import { EntityFilters, type FiltreActif } from '@/components/structure/entity-filters';
import { EntityMenu } from '@/components/structure/entity-menu';
import { TypeBadge } from '@/components/structure/type-badge';
import { useEntityDialogs } from '@/components/structure/use-entity-dialogs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ENTITY_TYPES, type EntityType } from '@/lib/domain/hierarchy';
import { formatNombre } from '@/lib/utils/format';

/**
 * Liste des entites — EF-STR-09.
 *
 * PERFORMANCE : le filtrage est INSTANTANE, cote client. L'arbre est deja
 * charge en entier par le serveur (une requete, mise en cache) ; le refiltrer
 * par un aller-retour reseau a chaque frappe ajouterait 200 a 400 ms pour
 * recalculer ce que le navigateur a deja sous la main.
 *
 * L'URL reste synchronisee via `history.replaceState` : la vue demeure
 * partageable et restauree au retour arriere, SANS declencher de navigation.
 * `router.replace` aurait relance un rendu serveur complet — c'est
 * precisement ce qu'on evite ici.
 *
 * Meme philosophie pour le CRUD : cliquer une entite ouvre sa fiche en pop-up
 * (`useEntityDialogs`, partage avec l'organigramme). Naviguer vers une page
 * ferait perdre les filtres et la position de defilement pour un simple
 * coup d'oeil.
 *
 * Ce choix est tenable parce que la structure est bornee (5 000 entites au
 * plus, ENF-PRF-05). La liste des croyants, elle, restera paginee cote
 * serveur (ENF-PRF-08).
 */

/** L'entite complete — la fiche en pop-up s'ouvre donc sans requete. */
export interface LigneStructure extends EntiteFlux {
  /** Chemin des ancetres, calcule par le serveur : O(n) au lieu de O(n²) ici. */
  cheminParent: string;
}

export function ListeStructureClient({
  entites,
  filtresInitiaux,
}: {
  entites: LigneStructure[];
  filtresInitiaux: {
    recherche: string;
    type: EntityType | 'tous';
    actif: FiltreActif;
    sansAcces: boolean;
  };
}) {
  const { peut } = useSession();

  const [recherche, setRecherche] = useState(filtresInitiaux.recherche);
  const [type, setType] = useState<EntityType | 'tous'>(filtresInitiaux.type);
  const [actif, setActif] = useState<FiltreActif>(filtresInitiaux.actif);
  const [sansAcces, setSansAcces] = useState(filtresInitiaux.sansAcces);

  const { ouvrirFiche, modifier, creerEnfant, demanderSuppression, dialogues } =
    useEntityDialogs(entites);

  // Deconnecte la frappe du filtrage : la saisie reste fluide meme si le
  // rendu de la table prend quelques millisecondes.
  const rechercheDifferee = useDeferredValue(recherche);

  // Synchronisation de l'URL sans navigation : pas de rendu serveur declenche.
  useEffect(() => {
    const params = new URLSearchParams();
    if (rechercheDifferee.trim()) params.set('q', rechercheDifferee.trim());
    if (type !== 'tous') params.set('type', type);
    if (actif !== 'tous') params.set('actif', actif);
    if (sansAcces) params.set('acces', 'sans');

    const url = params.size > 0 ? `?${params}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [rechercheDifferee, type, actif, sansAcces]);

  /**
   * Tous les filtres SAUF le niveau : c'est sur cette base que sont comptes
   * les effectifs affiches sur les pictogrammes. Un compteur qui tiendrait
   * compte du niveau selectionne afficherait zero partout ailleurs, et le
   * filtre deviendrait un cul-de-sac.
   */
  const base = useMemo(() => {
    const terme = rechercheDifferee.trim().toLowerCase();

    return entites.filter((e) => {
      if (actif === 'actifs' && !e.is_active) return false;
      if (actif === 'inactifs' && e.is_active) return false;
      if (sansAcces && !e.sans_acces_application) return false;
      if (terme && !`${e.nom} ${e.code}`.toLowerCase().includes(terme)) return false;
      return true;
    });
  }, [entites, rechercheDifferee, actif, sansAcces]);

  const comptesParType = useMemo(() => {
    const comptes = Object.fromEntries(ENTITY_TYPES.map((t) => [t, 0])) as Record<
      EntityType,
      number
    >;
    for (const e of base) comptes[e.type] += 1;
    return comptes;
  }, [base]);

  const filtrees = useMemo(
    () => (type === 'tous' ? base : base.filter((e) => e.type === type)),
    [base, type],
  );

  const aDesFiltres =
    recherche !== '' || type !== 'tous' || actif !== 'tous' || sansAcces;

  function effacer() {
    setRecherche('');
    setType('tous');
    setActif('tous');
    setSansAcces(false);
  }

  return (
    <div className="space-y-8">
      <EntityFilters
        recherche={recherche}
        onRecherche={setRecherche}
        type={type}
        onType={setType}
        actif={actif}
        onActif={setActif}
        sansAcces={sansAcces}
        onSansAcces={setSansAcces}
        comptesParType={comptesParType}
        affichees={filtrees.length}
        total={entites.length}
        onEffacer={effacer}
      />

      {filtrees.length === 0 ? (
        <EmptyState
          icon={Network}
          title="Aucune entite ne correspond"
          description="Elargissez les filtres, ou creez la premiere entite de ce niveau."
          action={
            aDesFiltres ? (
              <Button variant="outline" className="h-10" onClick={effacer}>
                Effacer les filtres
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* UI-07 : pas de bordures verticales, valeurs numeriques en font-mono. */}
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nom</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Niveau</TableHead>
                  <TableHead>Rattachement</TableHead>
                  <TableHead className="text-right">Sous-entites</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-12 text-right">
                    <span className="sr-only">Options</span>
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtrees.map((entite) => (
                  <TableRow key={entite.id} className="h-12">
                    <TableCell>
                      {/*
                        Un bouton, pas un lien : le clic ouvre la fiche sur
                        place. Le lien profond `/structure/[id]` reste offert
                        depuis la fiche elle-meme.
                      */}
                      <button
                        type="button"
                        onClick={() => ouvrirFiche(entite.id)}
                        className="text-left font-medium text-foreground transition-colors hover:text-indigo-700"
                      >
                        {entite.nom}
                      </button>
                    </TableCell>

                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {entite.code}
                    </TableCell>

                    <TableCell>
                      <TypeBadge type={entite.type} />
                    </TableCell>

                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {entite.cheminParent || '—'}
                    </TableCell>

                    <TableCell className="text-right font-mono tabular-nums">
                      {formatNombre(entite.nbDescendants)}
                    </TableCell>

                    <TableCell>
                      <span className="flex items-center gap-2">
                        <StatusBadge tone={entite.is_active ? 'success' : 'neutral'}>
                          {entite.is_active ? 'Active' : 'Inactive'}
                        </StatusBadge>
                        {entite.sans_acces_application && (
                          <span title="Sans acces a l'application — saisie assuree par le Siege">
                            <WifiOff className="size-4 text-slate-400" aria-hidden />
                          </span>
                        )}
                      </span>
                    </TableCell>

                    <TableCell className="text-right">
                      {/* Le MEME menu que dans l'organigramme (EF-STR-08). */}
                      <EntityMenu
                        id={entite.id}
                        nom={entite.nom}
                        type={entite.type}
                        peutModifier={peut('entity.update', entite.path)}
                        onOuvrir={ouvrirFiche}
                        onCreerEnfant={creerEnfant}
                        onModifier={modifier}
                        onSupprimer={demanderSuppression}
                        className="ml-auto"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {dialogues}
    </div>
  );
}
