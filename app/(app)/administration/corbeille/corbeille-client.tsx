'use client';

import { RotateCcw, Search, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/shared/empty-state';
import { avertir } from '@/components/shared/messages';
import { OperationDialog } from '@/components/shared/operation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { restaurerCroyant } from '@/lib/actions/croyants';
import { restaurerEntite } from '@/lib/actions/entities';
import type { ElementSupprime } from '@/lib/data/corbeille';
import { appelerAction } from '@/lib/utils/appeler-action';
import { formatDateHeure } from '@/lib/utils/format';

/**
 * La corbeille — EF-ADM-10.
 *
 * UNE SEULE LISTE, TOUS TYPES MÊLÉS, du plus récemment supprimé au plus ancien.
 * On ne vient pas y parcourir un inventaire : on vient récupérer ce qu'on a
 * effacé il y a dix minutes, et on ne se souvient pas toujours si c'était une
 * entité ou un croyant. Deux onglets feraient chercher deux fois.
 *
 * PAS DE SUPPRESSION DÉFINITIVE. La suppression est logique : la ligne reste,
 * et c'est ce qui garde justes les références de l'historique. Effacer
 * réellement les romprait — le journal citerait des identifiants qui ne
 * renvoient plus à rien.
 */
export function CorbeilleClient({ elements }: { elements: ElementSupprime[] }) {
  const router = useRouter();

  const [recherche, setRecherche] = useState('');
  const [operation, setOperation] = useState<string | null>(null);

  const rechercheDifferee = useDeferredValue(recherche);

  const filtres = useMemo(() => {
    const terme = rechercheDifferee.trim().toLocaleLowerCase('fr');
    if (!terme) return elements;

    return elements.filter((e) =>
      `${e.libelle} ${e.detail}`.toLocaleLowerCase('fr').includes(terme),
    );
  }, [elements, rechercheDifferee]);

  async function restaurer(element: ElementSupprime) {
    setOperation('Restauration en cours…');

    const resultat = await appelerAction(() =>
      element.type === 'ENTITE'
        ? restaurerEntite({ entityId: element.id })
        : restaurerCroyant({ croyantId: element.id }),
    );
    setOperation(null);

    if (!resultat.ok) {
      // Restaurer une entité peut échouer pour une raison qui se comprend — le
      // parent a été supprimé depuis. Le motif compte plus que l'échec.
      avertir(resultat.error);
      return;
    }
    toast.success('Élément restauré.');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Nom, code, matricule…"
          aria-label="Rechercher dans la corbeille"
          className="h-10 pl-9"
        />
      </div>

      {filtres.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title={
            rechercheDifferee.trim() ? 'Aucun élément ne correspond' : 'La corbeille est vide'
          }
          description={
            rechercheDifferee.trim()
              ? 'Rien ne correspond à cette recherche parmi les éléments supprimés.'
              : 'Rien n’a été supprimé dans votre périmètre. Ce qui l’est arrive ici, et peut être remis en service.'
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul>
              {filtres.map((element) => (
                <li
                  key={`${element.type}-${element.id}`}
                  className="flex flex-wrap items-center gap-4 border-b border-border px-6 py-4 last:border-0"
                >
                  <Badge variant="secondary" className="shrink-0">
                    {element.type === 'ENTITE' ? 'Entité' : 'Croyant'}
                  </Badge>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {element.libelle}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {element.detail}
                    </p>
                  </div>

                  <p className="text-xs tabular-nums text-muted-foreground">
                    Supprimé le {formatDateHeure(element.supprimeLe)}
                  </p>

                  <Button
                    variant="outline"
                    className="h-10 shrink-0"
                    onClick={() => restaurer(element)}
                  >
                    <RotateCcw className="mr-2 size-4" aria-hidden />
                    Restaurer
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Une entité restaurée revient avec ses descendants : le dire évite la
          surprise d'une branche entière qui réapparaît. */}
      <p className="text-xs text-muted-foreground">
        Restaurer une entité remet aussi en service ce qu’elle contenait. Rien n’est jamais
        effacé définitivement : les références de l’historique doivent rester justes.
      </p>

      <OperationDialog ouvert={operation !== null} titre={operation ?? ''} />
    </div>
  );
}
