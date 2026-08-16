'use client';

import { AlertCircle, Loader2, UserSearch } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { CroyantPicker, type OptionCroyant } from '@/components/croyants/croyant-picker';
import { avertir } from '@/components/shared/messages';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { resoudreRapprochement } from '@/lib/actions/dimes';
import type { RapprochementEnAttente } from '@/lib/data/dimes';
import { formatDate, formatMontant, formatNombre } from '@/lib/utils/format';

/**
 * Les noms d'un import que rien n'a reconnu — EF-FIN-34.
 *
 * CE N'EST PAS UNE FILE D'ERREURS. Le montant est déjà compté, l'argent est
 * reçu : l'enveloppe était dans l'urne, elle n'a pas disparu parce que le
 * fichier écrivait « Razafindraparany » autrement que la fiche.
 *
 * Ce qui manque, c'est de savoir **à qui** l'attribuer — et cela se décide ici,
 * dans la page des croyants, où l'on connaît les gens. C'est aussi pourquoi
 * cette zone n'est pas dans les finances : le travail à faire est de
 * l'identification, pas de la comptabilité.
 *
 * LE REÇU EST ÉMIS À LA RÉSOLUTION : c'est à ce moment qu'il y a quelqu'un à
 * qui le remettre.
 */
export function RapprochementsDimes({
  rapprochements,
  croyants,
  photos,
  devise,
}: {
  rapprochements: RapprochementEnAttente[];
  croyants: OptionCroyant[];
  photos: Record<string, string>;
  devise: string;
}) {
  const router = useRouter();
  const [choix, setChoix] = useState<Record<string, string | null>>({});
  const [enCours, setEnCours] = useState<string | null>(null);

  async function resoudre(id: string) {
    const croyantId = choix[id];
    if (!croyantId) return;

    setEnCours(id);
    try {
      const resultat = await resoudreRapprochement({
        rapprochementId: id,
        croyantId,
      });

      if (!resultat.ok) {
        avertir(resultat.error, { ton: 'refus', titre: 'Rapprochement refusé' });
        return;
      }

      toast.success('Versement rattaché.');

      /**
       * LE REÇU SE REPORTE SUR LE TALON. Il vient d'être émis : sans cette
       * mention, la référence resterait dans la base et le croyant n'aurait
       * jamais rien en main.
       */
      avertir(
        `Reçu ${resultat.data.recu}\n\n` +
          'À reporter sur le talon remis au croyant.',
        { ton: 'information', titre: 'Reçu attribué' },
      );

      router.refresh();
    } finally {
      setEnCours(null);
    }
  }

  if (rapprochements.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="border-destructive/30 bg-destructive/5 flex items-start gap-3 rounded-lg border p-4">
        <UserSearch className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="text-sm">
          <span className="font-medium">
            {formatNombre(rapprochements.length)} versement
            {rapprochements.length > 1 ? 's' : ''} sans fiche
          </span>{' '}
          <span className="text-muted-foreground">
            — le montant est déjà compté, seul le nom reste à retrouver.
          </span>
        </p>
      </div>

      <div className="border-border overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Culte</TableHead>
              <TableHead>Nom lu dans le fichier</TableHead>
              <TableHead className="w-28">Enveloppe</TableHead>
              <TableHead className="w-32 text-right">Montant</TableHead>
              <TableHead className="w-80">Rattacher à</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {rapprochements.map((r) => (
              <TableRow
                key={r.id}
                className="hover:bg-transparent has-aria-expanded:bg-transparent"
              >
                <TableCell className="text-xs tabular-nums">
                  {r.versement?.entree
                    ? formatDate(r.versement.entree.date_operation)
                    : formatDate(r.created_at)}
                </TableCell>

                <TableCell className="text-sm">
                  {/* CE QUE LE FICHIER DISAIT, tel quel : c'est contre lui
                      qu'on rapproche, et le corriger effacerait la trace. */}
                  <span className="font-medium">{r.nom_source}</span>
                  {r.prenom_source && ` ${r.prenom_source}`}
                  {r.entite && (
                    <span className="text-muted-foreground block text-xs">
                      {r.entite.nom}
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-muted-foreground font-mono text-xs">
                  {r.enveloppe_source ?? '—'}
                </TableCell>

                <TableCell className="text-right text-sm tabular-nums">
                  {formatMontant(Number(r.versement?.montant ?? 0), devise)}
                </TableCell>

                <TableCell>
                  <CroyantPicker
                    options={croyants}
                    value={choix[r.id] ?? null}
                    onChange={(id) => setChoix((c) => ({ ...c, [r.id]: id }))}
                    photos={photos}
                    placeholder="Chercher la fiche"
                    aria-label={`Rattacher ${r.nom_source}`}
                  />
                </TableCell>

                <TableCell>
                  <Button
                    variant="outline"
                    className="h-9"
                    disabled={!choix[r.id] || enCours !== null}
                    onClick={() => void resoudre(r.id)}
                  >
                    {enCours === r.id ? (
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    ) : (
                      <AlertCircle className="mr-2 size-4" aria-hidden />
                    )}
                    Rattacher
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
