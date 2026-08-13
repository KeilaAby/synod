'use client';

import { CheckCircle2, Paperclip, ShieldAlert, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { MontantSigne } from '@/components/finances/mouvement-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { avertir } from '@/components/shared/messages';
import { OperationDialog } from '@/components/shared/operation-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { traiterMouvementsEnLot } from '@/lib/actions/finances';
import type { MouvementListe } from '@/lib/data/finances';
import { formatDate, formatMontant, formatNombre } from '@/lib/utils/format';

import { MotifDialog } from '../motif-dialog';

/**
 * File de validation — EF-FIN-21.
 *
 * LA SÉLECTION EST LE SUJET DE L'ÉCRAN. On ne valide pas vingt mouvements en
 * cliquant vingt fois : on les coche, on regarde le total de ce qu'on s'apprête
 * à engager, et l'on décide une fois.
 *
 * LE TOTAL DE LA SÉLECTION EST AFFICHÉ, et ce n'est pas décoratif. Valider,
 * c'est faire entrer ces montants dans un solde (RG-18) et les rendre immuables
 * (RG-17). Le montant qu'on s'apprête à figer doit être lisible AVANT le clic,
 * pas découvert après.
 */
export function FileValidationClient({
  mouvements,
  devise,
  justificatifs,
}: {
  mouvements: MouvementListe[];
  devise: string;
  /** EF-FIN-07 — clé de stockage -> URL signée, signées en lot par la page. */
  justificatifs: Record<string, string>;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [operation, setOperation] = useState<string | null>(null);
  const [rejet, setRejet] = useState(false);

  const basculer = (id: string) =>
    setSelection((s) => {
      const suivant = new Set(s);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  const toutCocher = () =>
    setSelection((s) =>
      s.size === mouvements.length ? new Set() : new Set(mouvements.map((m) => m.id)),
    );

  /**
   * Ce que la sélection engage, recettes et dépenses séparées.
   *
   * Un net les compenserait : « 0 Ar » pour dix millions de recettes et dix de
   * dépenses ne dit rien de ce qu'on valide.
   */
  const totaux = useMemo(() => {
    let recettes = 0;
    let depenses = 0;
    for (const m of mouvements) {
      if (!selection.has(m.id)) continue;
      if (m.sens === 'RECETTE') recettes += m.montant;
      else depenses += m.montant;
    }
    return { recettes, depenses };
  }, [mouvements, selection]);

  async function traiter(statut: 'VALIDE' | 'REJETE', motif?: string) {
    setOperation(
      statut === 'VALIDE'
        ? `Validation de ${formatNombre(selection.size)} mouvement${selection.size > 1 ? 's' : ''}…`
        : `Rejet de ${formatNombre(selection.size)} mouvement${selection.size > 1 ? 's' : ''}…`,
    );

    try {
      const resultat = await traiterMouvementsEnLot({
        ids: [...selection],
        statut,
        motif,
      });

      if (!resultat.ok) {
        avertir(resultat.error, { ton: 'refus', titre: 'Opération refusée' });
        return;
      }

      const { traites, refuses } = resultat.data;

      if (traites > 0) {
        toast.success(
          `${formatNombre(traites)} mouvement${traites > 1 ? 's' : ''} ${statut === 'VALIDE' ? 'validé' : 'rejeté'}${traites > 1 ? 's' : ''}.`,
        );
      }

      /**
       * Un refus partiel se DIT, ligne par ligne (règle 30).
       *
       * « 18 sur 20 » laisserait chercher les deux manquantes dans une file de
       * vingt. Le pop-up les nomme et donne le motif de chacune.
       */
      if (refuses.length > 0) {
        avertir(
          `${formatNombre(refuses.length)} mouvement${refuses.length > 1 ? 's' : ''} n’${refuses.length > 1 ? 'ont' : 'a'} pas pu être traité${refuses.length > 1 ? 's' : ''} :\n\n` +
            refuses.map((r) => `• ${r.libelle} — ${r.message}`).join('\n'),
          {
            ton: traites > 0 ? 'information' : 'refus',
            titre: traites > 0 ? 'Traité, avec des réserves' : 'Aucun mouvement traité',
          },
        );
      }

      setSelection(new Set());
      router.refresh();
    } finally {
      setOperation(null);
      setRejet(false);
    }
  }

  if (mouvements.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Rien à valider"
        description="Aucun mouvement n’attend de décision dans votre périmètre."
      />
    );
  }

  return (
    <div className="space-y-4">
      <OperationDialog ouvert={operation !== null} titre={operation ?? ''} />

      {/*
        Le motif du rejet groupé se saisit UNE fois : les vingt lignes sont
        refusées pour la même raison, sans quoi ce ne serait pas un lot.
      */}
      <MotifDialog
        key={rejet ? 'lot-ouvert' : 'lot-ferme'}
        action={rejet ? { id: 'lot', statut: 'REJETE' } : null}
        onFermer={() => setRejet(false)}
        onValider={(motif) => void traiter('REJETE', motif)}
      />

      {/* --- La barre d'action, visible dès qu'une ligne est cochée --- */}
      {selection.size > 0 && (
        <div className="border-border bg-muted/40 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              <span className="tabular-nums">{formatNombre(selection.size)}</span>{' '}
              mouvement{selection.size > 1 ? 's' : ''} sélectionné
              {selection.size > 1 ? 's' : ''}
            </p>
            <p className="text-muted-foreground text-xs">
              <span className="text-emerald-700 tabular-nums">
                +{formatMontant(totaux.recettes, devise)}
              </span>
              {' · '}
              <span className="text-rose-700 tabular-nums">
                −{formatMontant(totaux.depenses, devise)}
              </span>
              {' — '}une validation est définitive (RG-17).
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="h-10"
              onClick={() => setRejet(true)}
              disabled={operation !== null}
            >
              <XCircle className="mr-2 size-4" aria-hidden />
              Rejeter la sélection
            </Button>
            <Button
              className="h-10"
              onClick={() => void traiter('VALIDE')}
              disabled={operation !== null}
            >
              <CheckCircle2 className="mr-2 size-4" aria-hidden />
              Valider la sélection
            </Button>
          </div>
        </div>
      )}

      <div className="border-border overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selection.size === mouvements.length && mouvements.length > 0}
                  onCheckedChange={toutCocher}
                  aria-label="Tout sélectionner"
                />
              </TableHead>
              <TableHead className="w-28">Soumis le</TableHead>
              <TableHead>Entité</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead>Libellé</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead className="w-16">Pièce</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {mouvements.map((m) => (
              <TableRow key={m.id} data-state={selection.has(m.id) ? 'selected' : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selection.has(m.id)}
                    onCheckedChange={() => basculer(m.id)}
                    aria-label={`Sélectionner ${m.libelle ?? 'ce mouvement'}`}
                  />
                </TableCell>

                <TableCell className="text-xs tabular-nums">
                  {m.soumis_le ? formatDate(m.soumis_le) : formatDate(m.date_operation)}
                </TableCell>

                <TableCell className="text-sm">
                  {m.entite?.nom ?? '—'}
                  {/* EF-FIN-06 — une saisie déléguée se signale partout. */}
                  {m.est_delegue && (
                    <StatusBadge tone="accent" className="ml-2">
                      Déléguée
                    </StatusBadge>
                  )}
                </TableCell>

                <TableCell className="text-sm">{m.categorie?.libelle ?? '—'}</TableCell>

                <TableCell className="text-sm">
                  {m.libelle ?? <span className="text-muted-foreground">—</span>}
                  {/*
                    EF-FIN-18 — qui a soumis se lit AVANT de valider : c'est ce
                    qui permet de voir qu'on s'apprête à valider sa propre
                    écriture, plutôt que de l'apprendre par un refus.
                  */}
                  {m.auteur && (
                    <span className="text-muted-foreground block text-xs">
                      Saisi par {m.auteur.nom_complet}
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-right">
                  <MontantSigne montant={m.montant} sens={m.sens} devise={devise} />
                </TableCell>

                <TableCell>
                  {m.justificatif_key && justificatifs[m.justificatif_key] ? (
                    <a
                      href={justificatifs[m.justificatif_key]}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                      title="Ouvrir la pièce justificative"
                    >
                      <Paperclip className="size-4" aria-hidden />
                      <span className="sr-only">Ouvrir la pièce justificative</span>
                    </a>
                  ) : (
                    <span
                      className="text-muted-foreground inline-flex items-center text-xs"
                      title="Aucune pièce jointe"
                    >
                      <ShieldAlert className="size-4 opacity-40" aria-hidden />
                      <span className="sr-only">Aucune pièce jointe</span>
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
