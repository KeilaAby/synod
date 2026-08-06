import { cn } from '@/lib/utils';

/**
 * En-tete de page — UI-11.
 *
 * Motif repris des maquettes de reference : sur-titre en majuscules espacees,
 * titre large en gras, sous-titre gris, actions alignees a droite.
 * Espacements sur la grille de 8px (UI-01) : gap-4, pb-6, gap-2.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  /** Sur-titre contextuel, ex. « PERIMETRE — DISTRICT AVARADRANO ». */
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between',
        className,
      )}
    >
      <div className="space-y-2">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
