import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Etat vide — UI-19.
 *
 * Chaque ecran de liste en possede un. Un tableau vide sans explication laisse
 * l'utilisateur se demander si la donnee manque ou si le filtre est trop
 * restrictif : on repond toujours a cette question.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center',
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
        <Icon className="size-6" strokeWidth={1.5} aria-hidden />
      </div>

      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>

      {description && (
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}

      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
