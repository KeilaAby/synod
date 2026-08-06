import { z } from 'zod';

/**
 * Variables d'environnement — validees au demarrage plutot qu'au premier usage.
 * Une variable manquante doit faire echouer le build, pas une page en production.
 *
 * ENF-POR-02/03 : les noms sont volontairement generiques cote application
 * (AUTH_PROVIDER, STORAGE_PROVIDER). Seules les cles techniques nomment
 * l'hebergeur, et elles ne sont lues que dans les adaptateurs.
 */

const schemaClient = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url("L'URL Supabase est invalide."),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'La cle anonyme Supabase est requise.'),
});

const schemaServeur = z.object({
  // Cle de service : operations d'administration (invitation de compte,
  // reinitialisation de mot de passe). ENF-SEC-09 : jamais exposee au navigateur.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  STORAGE_BUCKET: z.string().min(1).default('synod'),
  AUTH_PROVIDER: z.enum(['supabase']).default('supabase'),
  STORAGE_PROVIDER: z.enum(['supabase', 's3']).default('supabase'),
});

/**
 * Les references a `process.env.NEXT_PUBLIC_*` doivent etre litterales :
 * Next les remplace statiquement a la compilation.
 */
function lireEnvClient() {
  const resultat = schemaClient.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!resultat.success) {
    const details = resultat.error.issues
      .map((i) => `  - ${i.path.join('.')} : ${i.message}`)
      .join('\n');
    throw new Error(
      `Configuration incomplete. Renseignez .env.local :\n${details}\n` +
        'Voir .env.example pour le modele.',
    );
  }

  return resultat.data;
}

/**
 * Une variable declaree mais vide (`CLE=` dans un .env) vaut `''`, pas
 * `undefined` : sans cette normalisation, `.optional()` ne s'applique pas et
 * `.default()` non plus.
 */
function vide(valeur: string | undefined): string | undefined {
  return valeur === undefined || valeur.trim() === '' ? undefined : valeur;
}

function lireEnvServeur() {
  const resultat = schemaServeur.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: vide(process.env.SUPABASE_SERVICE_ROLE_KEY),
    STORAGE_BUCKET: vide(process.env.STORAGE_BUCKET),
    AUTH_PROVIDER: vide(process.env.AUTH_PROVIDER),
    STORAGE_PROVIDER: vide(process.env.STORAGE_PROVIDER),
  });

  if (!resultat.success) {
    const details = resultat.error.issues
      .map((i) => `  - ${i.path.join('.')} : ${i.message}`)
      .join('\n');
    throw new Error(`Configuration serveur invalide :\n${details}`);
  }

  return resultat.data;
}

export const envClient = lireEnvClient();

/** A n'appeler que cote serveur : leve si invoque depuis le navigateur. */
export function envServeur() {
  if (typeof window !== 'undefined') {
    throw new Error(
      'envServeur() a ete appele cote client. ENF-SEC-09 : aucun secret ne doit atteindre le navigateur.',
    );
  }
  return lireEnvServeur();
}
