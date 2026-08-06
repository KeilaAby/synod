'use client';

import { Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ENTITY_LABELS, ENTITY_TYPES } from '@/lib/domain/hierarchy';

/**
 * Barre de filtres — EF-STR-09.
 *
 * L'etat vit dans l'URL, jamais dans un `useState` isole : la vue filtree est
 * partageable, et le retour arriere restitue exactement ce que l'utilisateur
 * regardait.
 */
export function FiltresStructure() {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  const [enCours, demarrer] = useTransition();

  const [recherche, setRecherche] = useState(params.get('q') ?? '');

  // Debounce : une frappe ne doit pas declencher une navigation par caractere.
  useEffect(() => {
    const actuelle = params.get('q') ?? '';
    if (recherche === actuelle) return;

    const minuteur = setTimeout(() => {
      appliquer('q', recherche || null);
    }, 300);

    return () => clearTimeout(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche]);

  function appliquer(cle: string, valeur: string | null) {
    const suivants = new URLSearchParams(params.toString());
    if (valeur === null || valeur === '' || valeur === 'tous') suivants.delete(cle);
    else suivants.set(cle, valeur);

    demarrer(() => {
      router.replace(`${chemin}${suivants.size ? `?${suivants}` : ''}`, { scroll: false });
    });
  }

  const type = params.get('type') ?? 'tous';
  const actif = params.get('actif') ?? 'tous';
  const aDesFiltres = params.size > 0;

  return (
    <div className="flex flex-wrap items-center gap-2" data-pending={enCours || undefined}>
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

      <Select value={type} onValueChange={(v) => appliquer('type', v)}>
        <SelectTrigger className="h-10 w-48" aria-label="Filtrer par niveau">
          <SelectValue placeholder="Tous les niveaux" />
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

      <Select value={actif} onValueChange={(v) => appliquer('actif', v)}>
        <SelectTrigger className="h-10 w-40" aria-label="Filtrer par statut">
          <SelectValue placeholder="Tous les statuts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tous">Tous les statuts</SelectItem>
          <SelectItem value="actifs">Actives</SelectItem>
          <SelectItem value="inactifs">Inactives</SelectItem>
        </SelectContent>
      </Select>

      {aDesFiltres && (
        <Button
          variant="ghost"
          className="h-10"
          onClick={() => {
            setRecherche('');
            demarrer(() => router.replace(chemin, { scroll: false }));
          }}
        >
          <X className="mr-2 size-4" aria-hidden />
          Effacer
        </Button>
      )}
    </div>
  );
}
