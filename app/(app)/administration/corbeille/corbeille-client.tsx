'use client';

import { RotateCcw, Search, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { avertir } from '@/components/shared/messages';
import { OperationDialog } from '@/components/shared/operation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { purgerElements } from '@/lib/actions/corbeille';
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
 * L'EFFACEMENT DÉFINITIF EXISTE, ET IL EST À PART — EF-ADM-10.
 *
 * La suppression reste logique par défaut : la ligne demeure, et c'est ce qui
 * garde justes les références de l'historique. La purge accepte de rompre cela,
 * et c'est pourquoi elle n'est pas un second bouton à côté de « Restaurer » :
 * elle demande son propre droit (`trash.purge`, non délégable), une sélection
 * explicite, et une confirmation qui nomme ce qui part.
 *
 * SANS CE DROIT, RIEN DE TOUT CELA N'APPARAÎT — pas de cases à cocher, pas de
 * barre de sélection. Montrer des gestes qu'on ne peut pas faire est une
 * promesse qu'on retire au clic.
 */
export function CorbeilleClient({
  elements,
  peutPurger,
}: {
  elements: ElementSupprime[];
  peutPurger: boolean;
}) {
  const router = useRouter();

  const [recherche, setRecherche] = useState('');
  const [operation, setOperation] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [aPurger, setAPurger] = useState<ElementSupprime[] | null>(null);

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

  const cle = (e: ElementSupprime) => `${e.type}-${e.id}`;

  /**
   * « Tout sélectionner » porte sur CE QUI EST À L'ÉCRAN, pas sur la corbeille
   * entière. Une recherche en cours restreint la liste ; cocher au-delà
   * effacerait des éléments que l'utilisateur n'a pas sous les yeux.
   */
  const selectionnes = filtres.filter((e) => selection.has(cle(e)));
  const toutCoche = filtres.length > 0 && selectionnes.length === filtres.length;

  function basculer(element: ElementSupprime) {
    setSelection((precedent) => {
      const suivant = new Set(precedent);
      if (suivant.has(cle(element))) suivant.delete(cle(element));
      else suivant.add(cle(element));
      return suivant;
    });
  }

  function basculerTout() {
    setSelection(toutCoche ? new Set() : new Set(filtres.map(cle)));
  }

  async function purger(elements: ElementSupprime[]) {
    setAPurger(null);
    setOperation('Effacement définitif…');

    const resultat = await appelerAction(() =>
      purgerElements({
        elements: elements.map((e) => ({ type: e.type, id: e.id })),
      }),
    );
    setOperation(null);

    if (!resultat.ok) {
      avertir(resultat.error, { ton: 'refus', titre: 'Effacement refusé' });
      return;
    }

    setSelection(new Set());
    const { effaces, refuses } = resultat.data;

    /**
     * UN REFUS PARTIEL SE DIT, ET IL NOMME. Annoncer « 28 effacés » en taisant
     * les 2 qui restent ferait chercher pourquoi la corbeille n'est pas vide.
     */
    if (refuses.length > 0) {
      avertir(
        `${effaces} élément${effaces > 1 ? 's effacés' : ' effacé'} définitivement. ` +
          `${refuses.length} n’${refuses.length > 1 ? 'ont' : 'a'} pas pu l’être :\n\n` +
          refuses.map((r) => `• ${r.libelle} — ${r.motif}`).join('\n'),
        { ton: 'refus', titre: 'Effacement partiel' },
      );
    } else {
      toast.success(
        `${effaces} élément${effaces > 1 ? 's effacés' : ' effacé'} définitivement.`,
      );
    }

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

      {/*
        LA BARRE DE SÉLECTION N'APPARAÎT QUE QUAND ELLE SERT. Affichée en
        permanence avec « 0 sélectionné », elle occuperait une place pour ne
        rien dire et éloignerait la liste du champ de recherche.
      */}
      {peutPurger && filtres.length > 0 && (
        <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <label className="flex items-center gap-3 text-sm">
            <Checkbox checked={toutCoche} onCheckedChange={basculerTout} />
            <span className="text-muted-foreground">
              {selectionnes.length > 0
                ? `${selectionnes.length} sélectionné${selectionnes.length > 1 ? 's' : ''} sur ${filtres.length}`
                : `Tout sélectionner (${filtres.length})`}
            </span>
          </label>

          {selectionnes.length > 0 && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive h-10"
              onClick={() => setAPurger(selectionnes)}
            >
              <Trash2 className="mr-2 size-4" aria-hidden />
              Effacer définitivement
            </Button>
          )}
        </div>
      )}

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
                  className="border-border flex flex-wrap items-center gap-4 border-b px-6 py-4 last:border-0"
                >
                  {peutPurger && (
                    <Checkbox
                      checked={selection.has(cle(element))}
                      onCheckedChange={() => basculer(element)}
                      aria-label={`Sélectionner ${element.libelle}`}
                    />
                  )}

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
      <p className="text-muted-foreground text-xs">
        Restaurer une entité remet aussi en service ce qu’elle contenait.
        {peutPurger &&
          ' Un élément effacé définitivement ne revient pas : le journal d’audit garde la trace du geste, mais plus le détail de ce qui est parti.'}
      </p>

      {/*
        ENF-UTI-04 — LA CONFIRMATION NOMME CE QUI PART, et ne se contente pas
        d'un compte. « Effacer 12 éléments » ne permet pas de vérifier qu'on
        n'a pas coché une ligne de trop, ce qui est exactement le risque ici.
      */}
      {aPurger && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setAPurger(null)}
          title={
            aPurger.length === 1
              ? `Effacer définitivement « ${aPurger[0]!.libelle} » ?`
              : `Effacer définitivement ${aPurger.length} éléments ?`
          }
          description={
            'Cette opération est SANS RETOUR : ni la corbeille ni une restauration ' +
            'ne les ramèneront.\n\n' +
            aPurger
              .slice(0, 10)
              .map((e) => `• ${e.libelle}`)
              .join('\n') +
            (aPurger.length > 10 ? `\n• … et ${aPurger.length - 10} autres` : '') +
            '\n\nCe qui est encore cité ailleurs — un bureau, un mouvement, un ' +
            'baptême — sera conservé et vous sera nommé.'
          }
          confirmLabel="Effacer définitivement"
          onConfirm={() => purger(aPurger)}
        />
      )}

      <OperationDialog ouvert={operation !== null} titre={operation ?? ''} />
    </div>
  );
}
