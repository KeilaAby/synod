import { ENTITY_LABELS, type EntityType } from '@/lib/domain/hierarchy';
import { cn } from '@/lib/utils';

/**
 * Code couleur des niveaux hierarchiques — plan.md §13.1.
 *
 * Un seul jeu de couleurs pour l'organigramme, les listes et les rapports :
 * un District doit se reconnaitre a la meme teinte partout.
 */
export const COULEURS_NIVEAU: Record<EntityType, { badge: string; bordure: string }> = {
  SIEGE: { badge: 'bg-slate-900 text-white', bordure: 'border-l-slate-900' },
  REGIONAL: { badge: 'bg-indigo-100 text-indigo-700', bordure: 'border-l-indigo-500' },
  DISTRICT: { badge: 'bg-sky-100 text-sky-700', bordure: 'border-l-sky-500' },
  PAROISSE: { badge: 'bg-teal-100 text-teal-700', bordure: 'border-l-teal-500' },
  EGLISE: { badge: 'bg-amber-100 text-amber-700', bordure: 'border-l-amber-500' },
  CELLULE: { badge: 'bg-slate-100 text-slate-600', bordure: 'border-l-slate-400' },
};

export function TypeBadge({
  type,
  className,
}: {
  type: EntityType;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        COULEURS_NIVEAU[type].badge,
        className,
      )}
    >
      {ENTITY_LABELS[type].singulier}
    </span>
  );
}
