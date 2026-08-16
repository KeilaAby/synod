'use client';

import { Printer } from 'lucide-react';

import { imprimerRecus } from '@/components/finances/imprimer-recus';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { VersementDuCroyant } from '@/lib/data/dimes';
import { LIBELLES_EVENEMENT } from '@/lib/domain/dime';
import { formatDate, formatMontant, formatNombre } from '@/lib/utils/format';

/**
 * Les versements de dîme d'un croyant — EF-FIN-35, EF-FIN-31.
 *
 * C'est la réponse à « pouvez-vous retrouver ma dîme du mois dernier ? », qui
 * est la question qu'on pose à un bureau — et jusqu'ici il fallait ouvrir les
 * collectes une par une pour y répondre.
 *
 * LE NUMÉRO D'ENVELOPPE AFFICHÉ EST CELUI DU JOUR DU VERSEMENT. Un croyant qui
 * change d'enveloppe ne doit pas voir ses anciens reçus se réécrire sous un
 * numéro qu'ils n'ont jamais porté : c'est le reçu qu'il détient qui fait foi,
 * et il ne change pas.
 *
 * CE N'EST PAS UN SOLDE. Le total dit ce que la personne a donné, pas ce dont
 * l'église dispose : une dîme appartient au Siège (EF-FIN-29).
 */
export function VersementsCroyant({
  versements,
  croyant,
  devise,
}: {
  versements: VersementDuCroyant[];
  croyant: { nom: string; prenom: string; matricule: string };
  devise: string;
}) {
  const total = versements.reduce((s, v) => s + Number(v.montant), 0);

  if (versements.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {/*
          UNE ABSENCE N'EST PAS UN REFUS DE DROIT (règle 15). Ce qui remonte
          est borné par la RLS : un versement fait dans une autre église, par
          un croyant de passage (EF-FIN-32), appartient à cette église.
        */}
        Aucun versement enregistré dans votre périmètre.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-border overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Culte</TableHead>
              <TableHead>Collecté par</TableHead>
              <TableHead>Événement</TableHead>
              <TableHead className="w-28">Enveloppe</TableHead>
              <TableHead className="w-36">Reçu</TableHead>
              <TableHead className="w-32 text-right">Montant</TableHead>
              <TableHead className="w-28">Remise</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {versements.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="text-xs tabular-nums">
                  {v.entree ? formatDate(v.entree.date_operation) : '—'}
                </TableCell>

                <TableCell className="text-sm">
                  {v.entree?.collecteur?.nom ?? '—'}
                </TableCell>

                <TableCell className="text-sm">
                  {v.entree?.dime_evenement
                    ? LIBELLES_EVENEMENT[v.entree.dime_evenement]
                    : '—'}
                  {v.entree?.libelle && (
                    <span className="text-muted-foreground block text-xs">
                      {v.entree.libelle}
                    </span>
                  )}
                </TableCell>

                {/* Le numéro EN VIGUEUR CE JOUR-LÀ, jamais celui d'aujourd'hui. */}
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {v.enveloppe_numero ?? '—'}
                </TableCell>

                <TableCell className="font-mono text-xs">
                  {v.recu_numero ?? (
                    <span className="text-muted-foreground font-sans italic">
                      sans reçu
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-right text-sm tabular-nums">
                  {formatMontant(Number(v.montant), devise)}
                </TableCell>

                {/*
                  EF-FIN-30 — la remise regarde le SIÈGE, pas le donateur : sa
                  dîme est donnée dès qu'il l'a remise. On la montre tout de
                  même, parce que c'est la seule trace que le bureau a portée
                  l'enveloppe plus loin.
                */}
                <TableCell>
                  {v.entree?.dime_remise_id ? (
                    <StatusBadge tone="success">Remise</StatusBadge>
                  ) : (
                    <StatusBadge tone="warning">Au bureau</StatusBadge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm">
          <span className="text-muted-foreground">
            {formatNombre(versements.length)} versement
            {versements.length > 1 ? 's' : ''} —{' '}
          </span>
          <span className="font-semibold tabular-nums">
            {formatMontant(total, devise)}
          </span>
        </p>

        {/*
          EF-FIN-27 — RÉÉDITER UN TALON PERDU.

          Le reçu n'est pas réémis : on réimprime celui qui existe, sous sa
          référence d'origine. En émettre un second pour le même versement
          ferait exister deux papiers pour un seul don.
        */}
        <Button
          variant="outline"
          className="h-9"
          onClick={() =>
            imprimerRecus(
              versements
                .filter((v) => v.recu_numero && v.entree)
                .map((v) => ({
                  reference: v.recu_numero!,
                  nom: croyant.nom,
                  prenom: croyant.prenom,
                  matricule: croyant.matricule,
                  enveloppe: v.enveloppe_numero,
                  montant: Number(v.montant),
                  // Chaque talon porte SA cérémonie : ces reçus viennent de
                  // collectes différentes, parfois d'églises différentes.
                  entite: v.entree!.collecteur?.nom ?? '—',
                  dateOperation: v.entree!.date_operation,
                  evenement: v.entree!.dime_evenement
                    ? LIBELLES_EVENEMENT[v.entree!.dime_evenement]
                    : null,
                })),
              devise,
            )
          }
        >
          <Printer className="mr-2 size-4" aria-hidden />
          Réimprimer les reçus
        </Button>
      </div>
    </div>
  );
}
