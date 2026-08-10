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

  /**
   * VERIFICATION LOCALE du jeton — ENF-PRF-01.
   *
   * `getUser()` interrogeait le serveur d'identite a CHAQUE requete : une
   * navigation, une Server Action, un rafraichissement payaient tous un
   * aller-retour reseau complet avant meme d'atteindre la page. Sur un lien
   * lointain, cela representait l'essentiel du temps mesure dans le proxy.
   *
   * `getClaims()` fait mieux pour le meme resultat : il lit la session dans le
   * cookie — en la rafraichissant si elle a expire —, puis VERIFIE LA SIGNATURE
   * du jeton avec la cle publique du projet, mise en cache. Aucun appel reseau
   * tant que le jeton est valide.
   *
   * Si le projet signe encore ses jetons avec un secret symetrique (HS256), la
   * bibliotheque retombe d'elle-meme sur `getUser()` : le comportement est
   * alors celui d'avant, jamais moins sur. Basculer le projet sur des cles
   * asymetriques (Supabase > JWT Keys) supprime l'aller-retour pour de bon.
   */
  const { data: jeton, error } = await supabase.auth.getClaims();
  const user = jeton?.claims ?? null;

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
