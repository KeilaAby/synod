import { ArrowRight, Ban, Check, Clock, ShieldCheck, X } from 'lucide-react';

import { StatusBadge } from '@/components/shared/status-badge';
import { TypeBadge } from '@/components/structure/type-badge';
import { Separator } from '@/components/ui/separator';
import type { TransfertListe } from '@/lib/data/transferts';
import { LIBELLES_STATUT_TRANSFERT, type StatutTransfert } from '@/lib/domain/transfert';
import { formatDateLongue } from '@/lib/utils/format';

/**
 * Fiche complète d'un transfert — EF-TRF-06, EF-TRF-08.
 *
 * EF-TRF-06 énumère ce qu'un transfert doit enregistrer : date de demande, date
 * effective, origine, destination, motif, demandeur, approbateur, décision. La
 * base les portait toutes ; l'écran n'en montrait que trois. Enregistrer sans
 * montrer revient à ne pas enregistrer — le jour où quelqu'un conteste un
 * mouvement, c'est ici qu'il faut pouvoir répondre.
 *
 * Bloc partagé par le journal et le dialogue de décision : deux présentations
 * du même dossier auraient fini par ne plus dire la même chose.
 */

const TONS: Record<StatutTransfert, 'success' | 'warning' | 'danger' | 'neutral' | 'accent'> = {
  DEMANDE: 'warning',
  APPROUVE: 'accent',
  EFFECTUE: 'success',
  REFUSE: 'danger',
  ANNULE: 'neutral',
};

const ICONES: Record<StatutTransfert, typeof Check> = {
  DEMANDE: Clock,
  APPROUVE: ShieldCheck,
  EFFECTUE: Check,
  REFUSE: X,
  ANNULE: Ban,
};

export function TransfertDetail({ transfert }: { transfert: TransfertListe }) {
  const Icone = ICONES[transfert.statut];

  return (
    <div className="space-y-6">
      {/* --- Trajet --- */}
      <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-slate-50 p-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Origine</p>
          <p className="text-sm font-medium text-foreground">
            {transfert.origine?.nom ?? '—'}
          </p>
          <p className="text-xs text-muted-foreground">
            {transfert.celluleOrigine
              ? `Cellule ${transfert.celluleOrigine.nom}`
              : 'Aucune cellule'}
          </p>
        </div>

        <ArrowRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Destination</p>
          <p className="text-sm font-medium text-foreground">
            {transfert.destination?.nom ?? '—'}
          </p>
          <p className="text-xs text-muted-foreground">
            {transfert.celluleDestination
              ? `Cellule ${transfert.celluleDestination.nom}`
              : 'Aucune cellule'}
          </p>
        </div>

        <div className="ml-auto flex flex-col items-end gap-2">
          <StatusBadge tone={TONS[transfert.statut]}>
            <Icone className="mr-1 size-3" aria-hidden />
            {LIBELLES_STATUT_TRANSFERT[transfert.statut]}
          </StatusBadge>
          <TypeBadge type={transfert.niveau_transfert} />
        </div>
      </div>

      {/* --- Qui, quand — EF-TRF-06 --- */}
      <dl className="grid gap-6 sm:grid-cols-2">
        <Donnee
          libelle="Demandé par"
          valeur={transfert.demandeur?.nom_complet ?? 'Compte supprimé'}
          secondaire={formatDateLongue(transfert.date_demande)}
        />

        <Donnee
          libelle={etiquetteDecision(transfert.statut)}
          valeur={
            transfert.date_decision
              ? (transfert.decideur?.nom_complet ?? 'Compte supprimé')
              : 'En attente de décision'
          }
          secondaire={
            transfert.date_decision
              ? formatDateLongue(transfert.date_decision)
              : // RG-11 — dire ce qui manque, plutôt qu'un tiret muet.
                'Aucun rattachement n’a changé'
          }
        />

        {transfert.date_effet && (
          <Donnee
            libelle="Appliqué le"
            valeur={formatDateLongue(transfert.date_effet)}
            secondaire="Le croyant a changé de rattachement ce jour-là"
          />
        )}

        {/* RG-12 — au nom de quoi la décision est prise, ou le sera. */}
        {transfert.arbitre && (
          <Donnee
            libelle="Arbitré au niveau de"
            valeur={transfert.arbitre.nom}
            secondaire="Plus petite entité couvrant l’origine et la destination"
          />
        )}
      </dl>

      {/* --- Ce que les humains ont écrit --- */}
      {(transfert.motif || transfert.motif_refus) && <Separator />}

      {transfert.motif && (
        <section className="space-y-2">
          <p className="eyebrow">Motif de la demande</p>
          <p className="rounded-md bg-slate-50 p-4 text-sm text-muted-foreground">
            « {transfert.motif} »
          </p>
        </section>
      )}

      {transfert.motif_refus && (
        <section className="space-y-2">
          <p className="eyebrow text-rose-700">Motif du refus</p>
          <p className="rounded-md bg-rose-50 p-4 text-sm text-rose-900">
            « {transfert.motif_refus} »
          </p>
        </section>
      )}
    </div>
  );
}

/** Le libellé suit l'issue : « Approuvé par » ne convient pas à un refus. */
function etiquetteDecision(statut: StatutTransfert): string {
  switch (statut) {
    case 'REFUSE':
      return 'Refusé par';
    case 'ANNULE':
      return 'Retiré par';
    case 'DEMANDE':
      return 'Décision';
    default:
      return 'Approuvé par';
  }
}

function Donnee({
  libelle,
  valeur,
  secondaire,
}: {
  libelle: string;
  valeur: string;
  secondaire?: string;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{libelle}</dt>
      <dd className="text-sm font-medium text-foreground">{valeur}</dd>
      {secondaire && <dd className="text-xs text-muted-foreground">{secondaire}</dd>}
    </div>
  );
}
