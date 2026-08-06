import { cn } from '@/lib/utils';

/**
 * Marque SYNOD.
 *
 * Marque typographique volontairement sobre : un glyphe geometrique evoquant
 * la hierarchie (un noeud, trois branches) et le nom en capitales espacees.
 * Aucune image a charger, rendu net a toute taille, fonctionne en impression
 * comme a l'ecran (EF-RAP-06).
 */
export function Logo({
  className,
  avecTexte = true,
  taille = 'md',
}: {
  className?: string;
  avecTexte?: boolean;
  taille?: 'sm' | 'md' | 'lg';
}) {
  const dimensions = { sm: 'size-6', md: 'size-8', lg: 'size-10' } as const;
  const textes = { sm: 'text-sm', md: 'text-base', lg: 'text-xl' } as const;

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-md bg-slate-900 text-white',
          dimensions[taille],
        )}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-2/3" strokeWidth={2}>
          {/* Un noeud racine, trois descendants : la hierarchie en un glyphe. */}
          <circle cx="12" cy="5" r="2.2" fill="currentColor" />
          <circle cx="5" cy="18" r="2.2" fill="currentColor" />
          <circle cx="12" cy="18" r="2.2" fill="currentColor" />
          <circle cx="19" cy="18" r="2.2" fill="currentColor" />
          <path
            d="M12 7.2v3.3M5 15.8v-2.1h14v2.1M12 10.5v3.2"
            stroke="currentColor"
            strokeLinecap="round"
          />
        </svg>
      </span>

      {avecTexte && (
        <span
          className={cn(
            'font-bold tracking-[0.18em] text-slate-900 uppercase',
            textes[taille],
          )}
        >
          Synod
        </span>
      )}
    </span>
  );
}
