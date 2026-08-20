'use client';

import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { deconnexion } from '@/lib/actions/auth';

/**
 * Se deconnecter, depuis un ecran qui n'a pas de barre de navigation.
 *
 * La barre du haut porte deja cette action, mais elle n'existe que dans le
 * gabarit applicatif. Les ecrans du groupe `(auth)` — mandat echu, changement
 * impose — en sont volontairement prives, et ont pourtant besoin d'une SORTIE :
 * sur un poste partage, la personne suivante doit pouvoir ouvrir sa session.
 */
export function DeconnexionBouton({ libelle = 'Se déconnecter' }: { libelle?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 w-full"
      onClick={() => {
        // `deconnexion` redirige : elle ne rend jamais la main, et son
        // resultat n'est donc pas a attendre.
        void deconnexion();
      }}
    >
      <LogOut className="mr-2 size-4" aria-hidden />
      {libelle}
    </Button>
  );
}
