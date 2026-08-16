import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Bibliotheque de squelettes — UI-15, UI-17, ENF-PRF-09.
 *
 * REGLE SYSTEMATIQUE (designrules.md) : toute page qui charge des donnees
 * affiche un squelette. Jamais d'ecran blanc, jamais de spinner plein ecran.
 * `Loader2` est reserve aux ACTIONS ponctuelles.
 *
 * Chaque squelette est calque sur la structure FINALE de son ecran, aux
 * dimensions definitives : c'est ce qui maintient le CLS proche de zero.
 * En particulier `h-9` correspond a la hauteur reelle de `text-3xl`.
 */

// -----------------------------------------------------------------------------
// Brique commune : l'en-tete de page (UI-11)
// -----------------------------------------------------------------------------

export function PageHeaderSkeleton({ avecActions = true }: { avecActions?: boolean }) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" /> {/* eyebrow */}
        <Skeleton className="h-9 w-72" /> {/* titre  : hauteur de text-3xl */}
        <Skeleton className="h-4 w-96 max-w-full" /> {/* sous-titre */}
      </div>
      {avecActions && (
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" /> {/* bouton : h-10 = 40px */}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Tableau de bord — plan.md §9.3
// -----------------------------------------------------------------------------

export function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" /> {/* libelle */}
            <Skeleton className="h-9 w-20" /> {/* valeur en text-3xl */}
          </div>
          <Skeleton className="size-10 rounded-md" /> {/* icone */}
        </div>
        <Skeleton className="mt-4 h-5 w-28" /> {/* badge de variation */}
      </CardContent>
    </Card>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="space-y-4 p-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-64 w-full rounded-md" />
      </CardContent>
    </Card>
  );
}

/**
 * EF-DSH-11 — CALQUE SUR LA GRILLE FINALE, pas sur une grille plausible.
 *
 * Il annoncait huit cartes puis deux graphiques ; l'ecran rend des SECTIONS
 * titrees de cartes, et aucun graphique. Un squelette qui ment sur ce qui
 * arrive fait sauter la page au moment ou les donnees se posent — l'inverse
 * exact de ce qu'il est cense eviter.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton avecActions={false} />

      {/* La barre « Personnaliser », qui existe avant les donnees. */}
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Effectifs — cinq cartes, puis le bloc des dernieres fiches. */}
      <section className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
          <div className="col-span-2 xl:col-span-3">
            <ChartSkeleton />
          </div>
        </div>
      </section>

      {/* Structure et gouvernance — que des chiffres. */}
      {[5, 4].map((cartes, section) => (
        <section key={section} className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: cartes }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
        </section>
      ))}

      {/* Finances — trois montants larges, un compteur, puis la courbe. */}
      <section className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="col-span-2">
              <StatCardSkeleton />
            </div>
          ))}
          <StatCardSkeleton />
          <div className="col-span-2 md:col-span-4 xl:col-span-6">
            <ChartSkeleton />
          </div>
        </div>
      </section>
    </div>
  );
}

/** Squelette d'un widget isole, dimensionne selon son type de rendu. */
export function WidgetSkeleton({ renderer }: { renderer: string }) {
  if (renderer === 'stat') return <StatCardSkeleton />;
  if (renderer === 'table') return <TableSkeleton lignes={5} colonnes={4} avecEntete={false} />;
  return <ChartSkeleton />;
}

// -----------------------------------------------------------------------------
// Listes — UI-07
// -----------------------------------------------------------------------------

export function TableSkeleton({
  lignes = 8,
  colonnes = 6,
  avecEntete = true,
  avecFiltres = true,
}: {
  lignes?: number;
  colonnes?: number;
  avecEntete?: boolean;
  avecFiltres?: boolean;
}) {
  return (
    <div className="space-y-8">
      {avecEntete && <PageHeaderSkeleton />}

      {avecFiltres && (
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-64" /> {/* recherche */}
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {/* En-tete de colonnes */}
          <div
            className="grid gap-4 border-b border-border px-6 py-4"
            style={{ gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: colonnes }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-20" />
            ))}
          </div>

          {/* Lignes : h-12 = 48px, hauteur reelle d'une ligne de DataTable */}
          {Array.from({ length: lignes }).map((_, l) => (
            <div
              key={l}
              className="grid items-center gap-4 border-b border-border px-6 py-4 last:border-0"
              style={{ gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: colonnes }).map((_, c) => (
                <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-32' : 'w-16')} />
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Formulaires — plan.md §9.4 (trois sections en carte, jamais monolithique)
// -----------------------------------------------------------------------------

export function FormSkeleton({ sections = 3, champsParSection = 4 }: {
  sections?: number;
  champsParSection?: number;
}) {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton avecActions={false} />

      {Array.from({ length: sections }).map((_, s) => (
        <Card key={s}>
          <CardContent className="space-y-6 p-6">
            <Skeleton className="h-3 w-40" /> {/* titre de section */}
            <div className="grid gap-6 md:grid-cols-2">
              {Array.from({ length: champsParSection }).map((_, c) => (
                <div key={c} className="space-y-2">
                  <Skeleton className="h-3 w-28" /> {/* libelle */}
                  <Skeleton className="h-10 w-full" /> {/* champ : h-10 = 40px */}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end gap-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-40" />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Fiches de detail
// -----------------------------------------------------------------------------

export function DetailSkeleton() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="space-y-4 p-6">
            <Skeleton className="size-24 rounded-xl" /> {/* photo */}
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-24" />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="space-y-6 p-6">
            <Skeleton className="h-3 w-40" />
            <div className="grid gap-6 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-36" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Organigrammes React Flow — ENF-PRF-09 : la bibliotheque pese ~120 ko
// et n'est chargee qu'en differe (UI-18).
// -----------------------------------------------------------------------------

export function FlowSkeleton() {
  return (
    <div className="relative h-[calc(100vh-14rem)] min-h-96 w-full overflow-hidden rounded-xl border border-border bg-card">
      {/* Esquisse d'arborescence : trois niveaux, comme le rendu final. */}
      <div className="flex h-full flex-col items-center justify-center gap-8 p-8">
        <Skeleton className="h-20 w-56 rounded-xl" />
        <div className="flex gap-8">
          <Skeleton className="h-20 w-48 rounded-xl" />
          <Skeleton className="h-20 w-48 rounded-xl" />
          <Skeleton className="h-20 w-48 rounded-xl" />
        </div>
        <div className="flex gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-36 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Emplacement de la mini-carte, pour ne pas decaler au chargement. */}
      <Skeleton className="absolute right-4 bottom-4 h-24 w-32 rounded-md" />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Editeur de rapport — plan.md §9.6 (trois panneaux)
// -----------------------------------------------------------------------------

export function ReportEditorSkeleton() {
  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <Card className="w-64 shrink-0">
        <CardContent className="space-y-4 p-6">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>

      <Card className="flex-1">
        <CardContent className="space-y-4 p-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>

      <Card className="w-96 shrink-0">
        <CardContent className="p-6">
          {/* Ratio A4 : 210 x 297 mm */}
          <Skeleton className="aspect-[210/297] w-full rounded-md" />
        </CardContent>
      </Card>
    </div>
  );
}
