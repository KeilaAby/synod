import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { envClient } from '@/lib/env';

import {
  DELAI_RESEAU_PROXY_MS,
  estPanneReseau,
  fetchAvecDelai,
} from './reseau';

/** Routes accessibles sans session. */
const ROUTES_PUBLIQUES = ['/connexion', '/mot-de-passe-oublie', '/reinitialiser'];

function estRoutePublique(chemin: string): boolean {
  return ROUTES_PUBLIQUES.some((r) => chemin === r || chemin.startsWith(`${r}/`));
}

/**
 * Rafraichissement de session et garde de route — plan.md §4.3.
 *
 * Le middleware est la SEULE couche autorisee a ecrire les cookies de session :
 * les Server Components les recoivent en lecture seule. C'est pourquoi le
 * client cree ici propage systematiquement les cookies dans la reponse.
 *
 * Ce n'est pas une barriere de securite — un appel direct a l'API contourne le
 * middleware. La securite reste la RLS (ENF-SEC-01). Ici, on evite seulement
 * d'afficher une coquille vide a un visiteur non authentifie.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    envClient.NEXT_PUBLIC_SUPABASE_URL,
    envClient.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      // Le proxy s'exécute sur CHAQUE requête : sans délai borné, une coupure
      // réseau ajoute dix secondes à la moindre navigation.
      global: { fetch: fetchAvecDelai(DELAI_RESEAU_PROXY_MS) },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Revalide le jeton aupres du serveur d'identite et rafraichit le cookie.
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user ?? null;

  const chemin = request.nextUrl.pathname;

  /**
   * Une session NON VERIFIABLE n'est pas une session absente.
   *
   * Rediriger vers /connexion sur une panne reseau deconnecte l'utilisateur au
   * premier hoquet — et le renvoie sur un formulaire de connexion qui echouera
   * pour la meme raison. On laisse donc passer : la RLS protege les donnees, et
   * les pages afficheront un message honnete sur l'indisponibilite.
   */
  if (!user && error && estPanneReseau(error)) {
    console.warn('[proxy] verification de session impossible — reseau', error.message);
    return response;
  }

  if (!user && !estRoutePublique(chemin)) {
    const url = request.nextUrl.clone();
    url.pathname = '/connexion';
    // Conserve la destination pour y revenir apres authentification.
    if (chemin !== '/') url.searchParams.set('suite', chemin);
    return NextResponse.redirect(url);
  }

  if (user && (chemin === '/connexion' || chemin === '/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/tableau-de-bord';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

/**
 * ENF-SEC-07 — en-tetes de securite appliques a toutes les reponses.
 * La CSP est volontairement stricte : aucune ressource externe n'est chargee
 * (polices auto-hebergees par next/font, aucun CDN).
 */
export function appliquerEnTetesSecurite(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  );
  return response;
}
