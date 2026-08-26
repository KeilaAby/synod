import {
  ArrowRightLeft,
  Award,
  Ban,
  Briefcase,
  Check,
  Clock,
  Droplets,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react';

import {
  type CleIcone,
  type EvenementCroyant,
  apparenceEvenement,
} from '@/lib/domain/historique';
import { formatDateLongue } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

/**
 * Frise chronologique d'un croyant — EF-CRO-06, EF-TRF-08.
 *
 * Une FRISE et non un tableau : ce qu'on lit ici, c'est un enchaînement dans le
 * temps. Un tableau alignerait des colonnes qui n'ont pas la même nature d'un
 * événement à l'autre — un baptême n'a ni origine ni destination — et perdrait
 * la seule information qui les relie : l'ordre.
 *
 * Le trait vertical porte l'ordre, la pastille porte la nature, la couleur
 * porte l'issue. Trois signaux distincts, aucun redondant.
 */

/**
 * La CLE d'icone se rend en composant — la DECISION, elle, est dans le domaine.
 *
 * Une icone est une fonction React : elle ne traverse pas vers le document HTML
 * de l'impression (règle 24). C'est donc la clé qui voyage, et cette table est
 * la moitié « écran » du rendu ; l'autre vit dans `imprimer-fiche.ts`.
 */
const ICONES: Record<CleIcone, LucideIcon> = {
  creation: UserPlus,
  bapteme: Droplets,
  mandat: Briefcase,
  grade: Award,
  'grade-attente': Award,
  'transfert-effectue': Check,
  'transfert-refuse': X,
  'transfert-annule': Ban,
  'transfert-attente': Clock,
  transfert: ArrowRightLeft,
};

/**
 * Les teintes de Tailwind, par clé.
 *
 * Elles ne se déduisent pas des couleurs littérales du domaine : Tailwind lit
 * le SOURCE, et une classe composée à l'exécution n'existe dans aucune feuille
 * (règle 32). La table est donc littérale, et le test d'exhaustivité garantit
 * qu'aucune clé n'y manque.
 */
const TEINTES_UI: Record<CleIcone, string> = {
  creation: 'bg-slate-100 text-slate-600 ring-slate-200',
  bapteme: 'bg-sky-100 text-sky-700 ring-sky-200',
  mandat: 'bg-violet-100 text-violet-700 ring-violet-200',
  grade: 'bg-teal-100 text-teal-700 ring-teal-200',
  'grade-attente': 'bg-amber-100 text-amber-700 ring-amber-200',
  'transfert-effectue': 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  'transfert-refuse': 'bg-rose-100 text-rose-700 ring-rose-200',
  'transfert-annule': 'bg-slate-100 text-slate-500 ring-slate-200',
  'transfert-attente': 'bg-amber-100 text-amber-700 ring-amber-200',
  transfert: 'bg-indigo-100 text-indigo-700 ring-indigo-200',
};

function apparence(evenement: EvenementCroyant): { icone: LucideIcon; classe: string } {
  const { icone } = apparenceEvenement(evenement);
  return { icone: ICONES[icone], classe: TEINTES_UI[icone] };
}

export function HistoriqueCroyant({ evenements }: { evenements: EvenementCroyant[] }) {
  return (
    <ol className="relative space-y-6">
      {/*
        Le trait court d'une pastille à l'autre, et s'arrête à la dernière :
        un trait qui déborde sous le dernier point suggère une suite qui
        n'existe pas.
      */}
      <span
        aria-hidden
        className="absolute top-4 bottom-4 left-4 w-px -translate-x-1/2 bg-border"
      />

      {evenements.map((e) => {
        const { icone: Icone, classe } = apparence(e);

        return (
          <li key={e.cle} className="relative flex gap-4">
            <span
              className={cn(
                'z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card',
                classe,
              )}
            >
              <Icone className="size-4" aria-hidden />
            </span>

            <div className="min-w-0 flex-1 space-y-1 pt-0.5">
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-foreground">{e.titre}</span>
                {/* Un événement en attente n'est pas encore arrivé : le taire
                    laisserait croire qu'il l'est. */}
                {e.enAttente && (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    En attente
                  </span>
                )}
              </p>

              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatDateLongue(e.date)}
                {e.detail && <span className="font-sans"> · {e.detail}</span>}
              </p>

              {e.note && (
                <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
                  « {e.note} »
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
