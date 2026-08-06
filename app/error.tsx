'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * ENF-UTI-05 — message d'erreur explicite, en francais, oriente correction.
 * Jamais de trace technique brute : elle part dans la supervision, pas a
 * l'ecran (ENF-EXP-06).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[erreur]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-6 p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <AlertTriangle className="size-6" strokeWidth={1.5} aria-hidden />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Une erreur est survenue
            </h1>
            <p className="text-sm text-muted-foreground">
              L&apos;operation n&apos;a pas pu aboutir. Reessayez ; si le probleme persiste,
              signalez-le a l&apos;administrateur du Siege.
            </p>
            {error.digest && (
              <p className="font-mono text-xs text-muted-foreground">
                Reference : {error.digest}
              </p>
            )}
          </div>

          <Button onClick={reset} className="h-10 w-full">
            <RotateCcw className="mr-2 size-4" aria-hidden />
            Reessayer
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
