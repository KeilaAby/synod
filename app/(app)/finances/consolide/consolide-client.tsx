'use client';

import { AlertTriangle, ArrowDown, ArrowUp, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { StatusBadge } from '@/components/shared/status-badge';
import { ICONES_NIVEAU, TypeBadge } from '@/components/structure/type-badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { normaliserRecherche } from '@/lib/domain/croyant';
import {
  type Solde,
  estCritique,
  soldeConsolide,
  soldeDesDescendants,
  soldePropre,
} from '@/lib/domain/finance';
import { ENTITY_LABELS, ENTITY_TYPES, type EntityType } from '@/lib/domain/hierarchy';
import { formatMontant, formatNombre } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

export interface LigneConsolidee {
  readonly id: string;
  readonly nom: string;
  readonly code: string;
  readonly type: EntityType;
  readonly niveau: number;
  readonly parentId: string | null;
  readonly solde: Solde;
}

/** Ce sur quoi le tableau se range. Ensemble CLOS : des colonnes, pas un menu. */
type Tri = 'consolide' | 'propre' | 'nom';

/**
 * Un en-tête cliquable, DÉFINI HORS DU RENDU.
 *
 * Le premier jet le déclarait dans le corps du composant, où il capturait
 * `tri` et `croissant` — pratique à écrire, et refusé par le compilateur React
 * à juste titre : un composant recréé à chaque rendu a une identité neuve à
 * chaque fois, donc React démonte et remonte son sous-arbre au lieu de le
 * mettre à jour. Ici cela n'aurait coûté qu'un peu de travail ; sur un champ
 * de saisie, cela lui ferait perdre le focus à chaque frappe.
 */
function EnTeteTriable({
  colonne,
  libelle,
  triCourant,
  croissant,
  surClic,
}: {
  colonne: Tri;
  libelle: string;
  triCourant: Tri;
  croissant: boolean;
  surClic: (colonne: Tri) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => surClic(colonne)}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
      aria-label={`Trier par ${libelle}`}
    >
      {libelle}
      {triCourant === colonne &&
        (croissant ? (
          <ArrowUp className="size-3" aria-hidden />
        ) : (
          <ArrowDown className="size-3" aria-hidden />
        ))}
    </button>
  );
}

export function ConsolideClient({
  lignes,
  devise,
}: {
  lignes: LigneConsolidee[];
  devise: string;
}) {
  const [recherche, setRecherche] = useState('');
  const [niveaux, setNiveaux] = useState<Set<EntityType>>(new Set());
  const [critiquesSeules, setCritiquesSeules] = useState(false);
  const [tri, setTri] = useState<Tri>('consolide');
  const [croissant, setCroissant] = useState(true);

  /**
   * Le tri par défaut : le solde consolidé, CROISSANT.
   *
   * Les entités en difficulté remontent donc en tête. Un classement décroissant
   * mettrait les plus riches en haut — c'est-à-dire celles dont on n'a rien à
   * faire, et il faudrait dérouler jusqu'au bas de la page pour trouver ce que
   * l'écran est censé montrer (EF-FIN-13).
   */
  const visibles = useMemo(() => {
    const terme = normaliserRecherche(recherche);

    const filtrees = lignes.filter((l) => {
      if (niveaux.size > 0 && !niveaux.has(l.type)) return false;
      if (critiquesSeules && !estCritique(l.solde)) return false;
      if (!terme) return true;
      return normaliserRecherche(`${l.nom} ${l.code}`).includes(terme);
    });

    const sens = croissant ? 1 : -1;

    return [...filtrees].sort((a, b) => {
      if (tri === 'nom') return sens * a.nom.localeCompare(b.nom, 'fr');
      const valeur = tri === 'propre' ? soldePropre : soldeConsolide;
      return sens * (valeur(a.solde) - valeur(b.solde));
    });
  }, [lignes, recherche, niveaux, critiquesSeules, tri, croissant]);

  const critiques = useMemo(
    () => lignes.filter((l) => estCritique(l.solde)).length,
    [lignes],
  );

  /** Les niveaux réellement présents : un filtre vide n'a rien à filtrer. */
  const niveauxPresents = useMemo(
    () => ENTITY_TYPES.filter((t) => lignes.some((l) => l.type === t)),
    [lignes],
  );

  function basculerTri(colonne: Tri) {
    if (tri === colonne) setCroissant((c) => !c);
    else {
      setTri(colonne);
      // Un changement de colonne repart du sens UTILE à cette colonne : le plus
      // bas d'abord pour un solde, l'ordre alphabétique pour un nom.
      setCroissant(colonne !== 'nom');
    }
  }

  return (
    <div className="space-y-4">
      {/*
        EF-FIN-13 — ce qui va mal se dit AVANT le tableau. Un badge rouge perdu
        à la trentième ligne ne se voit pas ; un compte en tête, si.
      */}
      {critiques > 0 && (
        <div className="border-destructive/30 bg-destructive/5 flex items-start gap-3 rounded-lg border p-4">
          <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-sm">
            <span className="font-medium">
              {formatNombre(critiques)} entité{critiques > 1 ? 's' : ''} en solde négatif
            </span>{' '}
            <span className="text-muted-foreground">
              — dépenses validées supérieures aux recettes, sur l’entité et son
              sous-arbre.
            </span>
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search
            className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom ou code d’entité…"
            className="h-10 pl-9"
            aria-label="Rechercher une entité"
          />
        </div>

        {/* Ensemble CLOS et connu : des pictogrammes, pas un sélecteur (règle 18). */}
        <GroupeFiltres libelle="Niveau">
          {niveauxPresents.map((type) => (
            <FiltreIcone
              key={type}
              icone={ICONES_NIVEAU[type]}
              libelle={ENTITY_LABELS[type].pluriel}
              actif={niveaux.has(type)}
              onClick={() =>
                setNiveaux((n) => {
                  const suivant = new Set(n);
                  if (suivant.has(type)) suivant.delete(type);
                  else suivant.add(type);
                  return suivant;
                })
              }
            />
          ))}
        </GroupeFiltres>

        <GroupeFiltres libelle="Alerte">
          <FiltreIcone
            icone={AlertTriangle}
            libelle="Soldes négatifs"
            actif={critiquesSeules}
            onClick={() => setCritiquesSeules((v) => !v)}
          />
        </GroupeFiltres>
      </div>

      <div className="border-border overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <EnTeteTriable
                  colonne="nom"
                  libelle="Entité"
                  triCourant={tri}
                  croissant={croissant}
                  surClic={basculerTri}
                />
              </TableHead>
              <TableHead className="text-right">Recettes</TableHead>
              <TableHead className="text-right">Dépenses</TableHead>
              <TableHead className="text-right">
                <EnTeteTriable
                  colonne="propre"
                  libelle="Solde propre"
                  triCourant={tri}
                  croissant={croissant}
                  surClic={basculerTri}
                />
              </TableHead>
              <TableHead className="text-right">
                <EnTeteTriable
                  colonne="consolide"
                  libelle="Solde consolidé"
                  triCourant={tri}
                  croissant={croissant}
                  surClic={basculerTri}
                />
              </TableHead>
              <TableHead className="text-right">Dont sous-arbre</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {visibles.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-8 text-center text-sm">
                  Aucune entité ne correspond à ces filtres.
                </TableCell>
              </TableRow>
            )}

            {visibles.map((l) => {
              const propre = soldePropre(l.solde);
              const consolide = soldeConsolide(l.solde);

              return (
                <TableRow key={l.id}>
                  <TableCell>
                    <span className="flex min-w-0 items-center gap-2">
                      <TypeBadge type={l.type} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{l.nom}</span>
                        <span className="text-muted-foreground font-mono text-xs">
                          {l.code}
                        </span>
                      </span>
                      {estCritique(l.solde) && (
                        <StatusBadge tone="danger">Critique</StatusBadge>
                      )}
                    </span>
                  </TableCell>

                  <TableCell className="text-right text-sm tabular-nums text-emerald-700">
                    {formatMontant(l.solde.recettesConsolidees, devise)}
                  </TableCell>

                  <TableCell className="text-right text-sm tabular-nums text-rose-700">
                    {formatMontant(l.solde.depensesConsolidees, devise)}
                  </TableCell>

                  {/*
                    EF-FIN-12 — le propre et le consolidé côte à côte, et non
                    l'un à la place de l'autre : une paroisse dont le consolidé
                    est confortable peut n'avoir rien en propre, et c'est
                    précisément l'écart qui doit sauter aux yeux.
                  */}
                  <TableCell
                    className={cn(
                      'text-right text-sm tabular-nums',
                      propre < 0 && 'text-rose-700',
                    )}
                  >
                    {formatMontant(propre, devise)}
                  </TableCell>

                  <TableCell
                    className={cn(
                      'text-right text-sm font-semibold tabular-nums',
                      consolide < 0 ? 'text-rose-700' : 'text-foreground',
                    )}
                  >
                    {formatMontant(consolide, devise)}
                  </TableCell>

                  <TableCell className="text-muted-foreground text-right text-sm tabular-nums">
                    {formatMontant(soldeDesDescendants(l.solde), devise)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
