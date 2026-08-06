import { Logo } from '@/components/shared/logo';

/**
 * Gabarit des ecrans publics — UI-03.
 *
 * Fond Gray-50, carte blanche a bordure fine, contenu centre et etroit.
 * Aucune navigation : un visiteur non authentifie n'a nulle part ou aller.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md space-y-8">
          <div className="flex justify-center">
            <Logo taille="lg" />
          </div>
          {children}
        </div>
      </main>

      <footer className="pb-8 text-center text-xs text-muted-foreground">
        SYNOD — Plateforme de gestion ecclesiale
      </footer>
    </div>
  );
}
