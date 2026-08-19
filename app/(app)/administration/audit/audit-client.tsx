'use client';

import { ScrollText, Search } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { LigneAudit } from '@/lib/data/audit';
import { decrireOperation, libelleAction, libelleDomaine } from '@/lib/domain/audit';
import { formatDateHeure, formatNombre } from '@/lib/utils/format';

/**
 * Le journal d'audit — EF-ADM-09.
 *
 * ON NE VIENT PAS LE LIRE, ON VIENT Y CHERCHER. « Qui a désactivé ce compte ? »,
 * « quand ce mouvement a-t-il été validé ? » : personne ne parcourt mille
 * lignes. Le filtrage est donc en mémoire et instantané (règle 17) — la liste
 * est déjà chargée, poser une question dessus n'est pas un motif de repartir au
 * serveur.
 *
 * TROIS CRITÈRES, ET PAS DIX. L'action, le domaine, et une recherche libre sur
 * l'auteur et l'entité. Les dates ne sont pas un filtre : le journal est trié
 * du plus récent au plus ancien, et ce qu'on cherche est presque toujours en
 * haut.
 *
 * LE DÉTAIL NE S'INTERPRÈTE PAS. Sa forme dépend de l'action — un champ modifié,
 * un décompte, un motif de refus. L'afficher tel quel est honnête ; prétendre le
 * mettre en phrases produirait des tournures fausses le jour où une action
 * nouvelle y écrirait autre chose.
 */

/**
 * Les actions qui MÉRITENT D'ÊTRE VUES DE LOIN.
 *
 * Un refus d'accès et une suppression ne se lisent pas comme une connexion :
 * ce sont les deux choses qu'on cherche quand on ouvre un journal.
 */
const ACTIONS_MARQUEES: Record<string, string> = {
  DENIED: 'bg-rose-100 text-rose-700',
  DELETE: 'bg-rose-100 text-rose-700',
  PURGE: 'bg-rose-100 text-rose-700',
  REJECT: 'bg-amber-100 text-amber-700',
};

function DetailOperation({ action, diff }: { action: string; diff: unknown }) {
  const [ouvert, setOuvert] = useState(false);
  const phrase = decrireOperation(action, diff);

  if (diff === null || diff === undefined) return null;

  return (
    <span className="w-full">
      {phrase && <span className="text-xs text-muted-foreground">{phrase}</span>}

      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="ml-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {ouvert ? 'Masquer le détail' : 'Détail technique'}
      </button>

      {ouvert && (
        <code className="mt-1 block font-mono text-xs break-all text-muted-foreground">
          {JSON.stringify(diff)}
        </code>
      )}
    </span>
  );
}

export function AuditClient({
  lignes,
  tronque,
  filtresInitiaux,
}: {
  lignes: LigneAudit[];
  tronque: boolean;
  filtresInitiaux: { recherche: string; action: string; domaine: string };
}) {
  const [recherche, setRecherche] = useState(filtresInitiaux.recherche);
  const [action, setAction] = useState(filtresInitiaux.action);
  const [domaine, setDomaine] = useState(filtresInitiaux.domaine);

  const rechercheDifferee = useDeferredValue(recherche);

  useEffect(() => {
    const params = new URLSearchParams();
    if (rechercheDifferee.trim()) params.set('q', rechercheDifferee.trim());
    if (action !== 'toutes') params.set('action', action);
    if (domaine !== 'tous') params.set('domaine', domaine);

    const url = params.size > 0 ? `?${params}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [rechercheDifferee, action, domaine]);

  /** Les domaines réellement présents : proposer une table vide n'apprend rien. */
  const domaines = useMemo(
    () => [...new Set(lignes.map((l) => l.table_name))].sort(),
    [lignes],
  );

  const actions = useMemo(
    () => [...new Set(lignes.map((l) => l.action))].sort(),
    [lignes],
  );

  const filtrees = useMemo(() => {
    const terme = rechercheDifferee.trim().toLocaleLowerCase('fr');

    return lignes.filter((l) => {
      if (action !== 'toutes' && l.action !== action) return false;
      if (domaine !== 'tous' && l.table_name !== domaine) return false;
      if (!terme) return true;

      return [l.auteur?.nom_complet ?? '', l.entite?.nom ?? '', libelleDomaine(l.table_name)]
        .join(' ')
        .toLocaleLowerCase('fr')
        .includes(terme);
    });
  }, [lignes, action, domaine, rechercheDifferee]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-64 flex-1">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Auteur, entité, domaine…"
            aria-label="Rechercher dans le journal"
            className="h-10 pl-9"
          />
        </div>

        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="h-10 w-52" aria-label="Filtrer par action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="toutes">Toutes les actions</SelectItem>
            {actions.map((a) => (
              <SelectItem key={a} value={a}>
                {libelleAction(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={domaine} onValueChange={setDomaine}>
          <SelectTrigger className="h-10 w-52" aria-label="Filtrer par domaine">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les domaines</SelectItem>
            {domaines.map((d) => (
              <SelectItem key={d} value={d}>
                {libelleDomaine(d)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* LE PLAFOND SE DIT. Un journal qui s'arrête sans prévenir ferait
          conclure qu'il n'y a rien avant — alors qu'il y a simplement trop. */}
      {tronque && (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Seules les <span className="tabular-nums">1 000</span> entrées les plus
          récentes sont affichées. Le journal en contient davantage.
        </p>
      )}

      {filtrees.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Aucune entrée"
          description="Rien ne correspond à ces critères dans les entrées chargées. Le journal enregistre chaque opération : si vous cherchez quelque chose d’ancien, il est peut-être au-delà du millier affiché."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul>
              {filtrees.map((ligne) => (
                <li
                  key={ligne.id}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-6 py-4 last:border-0"
                >
                  <span className="w-40 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatDateHeure(ligne.created_at)}
                  </span>

                  <Badge
                    variant="secondary"
                    className={ACTIONS_MARQUEES[ligne.action]}
                  >
                    {libelleAction(ligne.action)}
                  </Badge>

                  <span className="text-sm text-foreground">
                    {libelleDomaine(ligne.table_name)}
                  </span>

                  <span className="text-xs text-muted-foreground">
                    {/* Un auteur absent n'est pas une anomalie : le compte a pu
                        être supprimé depuis, et la trace lui survit. */}
                    {ligne.auteur?.nom_complet ?? 'Compte supprimé'}
                    {ligne.entite && <> · {ligne.entite.nom}</>}
                  </span>

                  {/*
                    LA PHRASE D'ABORD, LE TECHNIQUE SUR DEMANDE.

                    Le journal enregistre un objet de différences : exact, et
                    illisible. On en tire une phrase quand on sait le faire, et
                    on se tait sinon — une description approximative dans un
                    journal d'audit serait pire que pas de description, on la
                    citerait.

                    Le détail brut reste consultable, replié : il sert à
                    diagnostiquer, pas à être lu.
                  */}
                  <DetailOperation action={ligne.action} diff={ligne.diff} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        <span className="tabular-nums">{formatNombre(filtrees.length)}</span> entrée
        {filtrees.length > 1 ? 's' : ''} affichée{filtrees.length > 1 ? 's' : ''}.
      </p>
    </div>
  );
}
