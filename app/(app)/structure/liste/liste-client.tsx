'use client';

import { Network, Search, WifiOff, X } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { TypeBadge } from '@/components/structure/type-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ENTITY_LABELS, ENTITY_TYPES, type EntityType } from '@/lib/domain/hierarchy';
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
 * Ce choix est tenable parce que la structure est bornee (5 000 entites au
 * plus, ENF-PRF-05). La liste des croyants, elle, restera paginee cote
 * serveur (ENF-PRF-08).
 */

export interface LigneStructure {
  id: string;
  nom: string;
  code: string;
  type: EntityType;
  niveau: number;
  cheminParent: string;
  nbDescendants: number;
  isActive: boolean;
  sansAcces: boolean;
}

type FiltreActif = 'tous' | 'actifs' | 'inactifs';

export function ListeStructureClient({
  entites,
  filtresInitiaux,
}: {
  entites: LigneStructure[];
  filtresInitiaux: { recherche: string; type: string; actif: FiltreActif };
}) {
  const [recherche, setRecherche] = useState(filtresInitiaux.recherche);
  const [type, setType] = useState(filtresInitiaux.type);
  const [actif, setActif] = useState<FiltreActif>(filtresInitiaux.actif);

  // Deconnecte la frappe du filtrage : la saisie reste fluide meme si le
  // rendu de la table prend quelques millisecondes.
  const rechercheDifferee = useDeferredValue(recherche);

  // Synchronisation de l'URL sans navigation : pas de rendu serveur declenche.
  useEffect(() => {
    const params = new URLSearchParams();
    if (rechercheDifferee.trim()) params.set('q', rechercheDifferee.trim());
    if (type !== 'tous') params.set('type', type);
    if (actif !== 'tous') params.set('actif', actif);

    const url = params.size > 0 ? `?${params}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [rechercheDifferee, type, actif]);

  const filtrees = useMemo(() => {
    const terme = rechercheDifferee.trim().toLowerCase();

    return entites.filter((e) => {
      if (type !== 'tous' && e.type !== type) return false;
      if (actif === 'actifs' && !e.isActive) return false;
      if (actif === 'inactifs' && e.isActive) return false;
      if (terme && !`${e.nom} ${e.code}`.toLowerCase().includes(terme)) return false;
      return true;
    });
  }, [entites, rechercheDifferee, type, actif]);

  const aDesFiltres = recherche !== '' || type !== 'tous' || actif !== 'tous';

  function effacer() {
    setRecherche('');
    setType('tous');
    setActif('tous');
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher par nom ou par code…"
            aria-label="Rechercher une entite"
            className="h-10 w-64 pl-9"
          />
        </div>

        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-10 w-48" aria-label="Filtrer par niveau">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les niveaux</SelectItem>
            {ENTITY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {ENTITY_LABELS[t].pluriel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={actif} onValueChange={(v) => setActif(v as FiltreActif)}>
          <SelectTrigger className="h-10 w-40" aria-label="Filtrer par statut">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les statuts</SelectItem>
            <SelectItem value="actifs">Actives</SelectItem>
            <SelectItem value="inactifs">Inactives</SelectItem>
          </SelectContent>
        </Select>

        {aDesFiltres && (
          <Button variant="ghost" className="h-10" onClick={effacer}>
            <X className="mr-2 size-4" aria-hidden />
            Effacer
          </Button>
        )}

        <span
          className="ml-auto font-mono text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {formatNombre(filtrees.length)} / {formatNombre(entites.length)}
        </span>
      </div>

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
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtrees.map((entite) => (
                  <TableRow key={entite.id} className="h-12">
                    <TableCell>
                      <Link
                        href={`/structure/${entite.id}`}
                        className="font-medium text-foreground transition-colors hover:text-indigo-700"
                      >
                        {entite.nom}
                      </Link>
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
                        <StatusBadge tone={entite.isActive ? 'success' : 'neutral'}>
                          {entite.isActive ? 'Active' : 'Inactive'}
                        </StatusBadge>
                        {entite.sansAcces && (
                          <span title="Sans acces a l'application — saisie assuree par le Siege">
                            <WifiOff className="size-4 text-slate-400" aria-hidden />
                          </span>
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
