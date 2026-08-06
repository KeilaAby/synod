import { Compass } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-6 p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <Compass className="size-6" strokeWidth={1.5} aria-hidden />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Page introuvable
            </h1>
            <p className="text-sm text-muted-foreground">
              Cette page n&apos;existe pas, ou ne fait pas partie de votre perimetre.
            </p>
          </div>

          <Button asChild className="h-10 w-full">
            <Link href="/tableau-de-bord">Retour au tableau de bord</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
