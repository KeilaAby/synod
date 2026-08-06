import type { NextRequest } from 'next/server';

import { appliquerEnTetesSecurite, updateSession } from '@/lib/supabase/middleware';

/**
 * Convention `proxy` de Next.js 16 — remplace l'ancien `middleware.ts`.
 *
 * Deux responsabilites, et deux seulement :
 *   1. rafraichir la session et rediriger un visiteur non authentifie
 *   2. poser les en-tetes de securite (ENF-SEC-07)
 *
 * Ce n'est PAS une barriere de securite : un appel direct a l'API la contourne.
 * La securite reelle reste la RLS (ENF-SEC-01).
 */
export default async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  return appliquerEnTetesSecurite(response);
}

export const config = {
  matcher: [
    /*
     * Toutes les routes SAUF les actifs statiques.
     * Les routes d'API sont incluses : elles ont besoin du rafraichissement
     * de session.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
};
