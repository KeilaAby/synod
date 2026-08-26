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
  visuel,
  sous,
  actions,
  className,
}: {
  /** Sur-titre contextuel, ex. « PERIMETRE — DISTRICT AVARADRANO ». */
  eyebrow?: string;
  title: string;
  description?: string;
  /**
   * Portrait, logo ou vignette, POSE A GAUCHE DU TITRE — EF-CRO-09.
   *
   * Une fiche qui montre quelqu'un ne se lit pas comme un ecran de liste : le
   * visage et le nom vont ensemble, et les separer obligeait a chercher de qui
   * parle la page. Facultatif : les ecrans qui n'ont rien a montrer gardent
   * exactement l'en-tete d'avant.
   */
  visuel?: React.ReactNode;
  /** Ce qui QUALIFIE le titre — badges de statut, mentions. Sous la description. */
  sous?: React.ReactNode;
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
      {/*
        `items-end` ALIGNE LE NOM SUR LE BAS DU PORTRAIT, et non sur son milieu.
        Centre, un texte de trois lignes flotte au travers d'un grand rond et
        l'ensemble n'a plus de ligne de base commune.
      */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
        {visuel}

        <div className="space-y-2">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
          {sous && <div className="flex flex-wrap items-center gap-2 pt-1">{sous}</div>}
        </div>
      </div>

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
