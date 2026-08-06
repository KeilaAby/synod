'use client';

import { createBrowserClient } from '@supabase/ssr';

import { envClient } from '@/lib/env';

/**
 * Client navigateur — porteur de la cle anonyme uniquement.
 *
 * Usage strictement limite a l'authentification (connexion, deconnexion,
 * reinitialisation de mot de passe) et aux televersements directs.
 *
 * Regle non negociable (plan.md §18.2 n°1) : AUCUNE ecriture metier depuis un
 * composant. Toute mutation passe par une Server Action, seul endroit ou
 * validation Zod, habilitation, portee et audit sont appliques ensemble.
 */
export function createClient() {
  return createBrowserClient(
    envClient.NEXT_PUBLIC_SUPABASE_URL,
    envClient.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
