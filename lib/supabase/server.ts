import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { envClient, envServeur } from '@/lib/env';

/**
 * Client PostgreSQL cote serveur, porteur de la session de l'utilisateur.
 *
 * IMPORTANT — c'est ce client, et lui seul, qui doit servir a lire et ecrire
 * les donnees metier : il transporte le JWT, donc la RLS s'applique
 * (ENF-SEC-01). Toute requete hors perimetre retourne zero ligne.
 *
 * Ne pas importer ce module hors de `lib/data`, `lib/actions` et des Server
 * Components : une regle ESLint `no-restricted-imports` le verifie.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    envClient.NEXT_PUBLIC_SUPABASE_URL,
    envClient.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Appel depuis un Server Component : les cookies y sont en lecture
            // seule. Le rafraichissement de session est assure par le
            // middleware, ce silence est donc sans consequence.
          }
        },
      },
    },
  );
}

/**
 * Client d'administration, porteur de la cle de service.
 *
 * ENF-SEC-09 : reserve aux operations qui ne peuvent pas passer par la session
 * de l'utilisateur (invitation d'un compte, reinitialisation de mot de passe).
 * Il CONTOURNE la RLS : chaque appel doit donc etre precede d'un controle
 * d'habilitation explicite dans la Server Action appelante.
 */
export function createAdminClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = envServeur();

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY est absente : les operations d administration sont indisponibles.',
    );
  }

  return createServerClient(
    envClient.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: { getAll: () => [], setAll: () => {} },
    },
  );
}
