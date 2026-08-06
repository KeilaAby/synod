import type { Metadata } from 'next';
import { Suspense } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { ConnexionForm } from './connexion-form';

export const metadata: Metadata = { title: 'Connexion' };

/**
 * EF-AUT-01 — connexion par e-mail et mot de passe.
 *
 * Le formulaire lit `?suite=` : il est donc enveloppe dans <Suspense>, comme
 * l'exige `useSearchParams` en rendu statique. Le fallback est un squelette
 * aux dimensions du formulaire final (UI-15, UI-17).
 */
export default function ConnexionPage() {
  return (
    <Card>
      <CardContent className="space-y-8 p-6 sm:p-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Connexion</h1>
          <p className="text-sm text-muted-foreground">
            Accedez a votre espace de gestion.
          </p>
        </div>

        <Suspense fallback={<ConnexionFormSkeleton />}>
          <ConnexionForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}

function ConnexionFormSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="ml-auto h-3 w-32" />
      </div>
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
