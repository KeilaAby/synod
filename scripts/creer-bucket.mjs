#!/usr/bin/env node
/**
 * Cree ou remet en conformite le seau de stockage — EF-CRO-09, ENF-SEC-06.
 *
 * POURQUOI UN SCRIPT ET NON UNE MIGRATION SQL
 *
 * Le stockage n'est pas une table applicative : `storage.buckets` et
 * `storage.objects` appartiennent a `supabase_storage_admin`, et le role
 * `postgres` de l'editeur SQL n'en est pas membre. Toute tentative de les
 * configurer en SQL se solde par un 42501.
 *
 * L'API de stockage, elle, accepte la cle de service. C'est donc l'interface
 * legitime — et le resultat reste versionne dans le depot, contrairement a des
 * clics dans un tableau de bord que personne ne pourra rejouer.
 *
 *   pnpm db:bucket
 *
 * Le script est IDEMPOTENT : il cree le seau s'il manque, corrige ses reglages
 * s'il derive, et ne touche a aucun fichier deja depose.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RACINE = resolve(import.meta.dirname, '..');

/** Reglages attendus. Toute derive est corrigee, et signalee. */
const SEAU = {
  public: false, // ENF-SEC-06 : acces par URL signee uniquement
  file_size_limit: 5 * 1024 * 1024, // EF-CRO-09
  allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
};

function lireEnv() {
  let contenu;
  try {
    contenu = readFileSync(resolve(RACINE, '.env.local'), 'utf8');
  } catch {
    echouer('.env.local est introuvable. Copiez .env.example et renseignez-le.');
  }

  const valeurs = {};
  for (const ligne of contenu.split('\n')) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) valeurs[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return valeurs;
}

function echouer(message, indice) {
  console.error(`\n✗ ${message}`);
  if (indice) console.error(`  → ${indice}`);
  console.error('');
  process.exit(1);
}

const env = lireEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const cle = env.SUPABASE_SERVICE_ROLE_KEY;
const nom = env.STORAGE_BUCKET || 'synod';

if (!url) echouer('NEXT_PUBLIC_SUPABASE_URL est absente de .env.local.');
if (!cle) {
  echouer(
    'SUPABASE_SERVICE_ROLE_KEY est absente de .env.local.',
    'Tableau de bord Supabase > Project Settings > API > service_role.',
  );
}

const entetes = { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' };

async function appeler(chemin, options = {}) {
  const reponse = await fetch(`${url}/storage/v1${chemin}`, { ...options, headers: entetes });
  const texte = await reponse.text();

  let corps;
  try {
    corps = texte ? JSON.parse(texte) : null;
  } catch {
    corps = texte;
  }
  return { ok: reponse.ok, statut: reponse.status, corps };
}

const liste = await appeler('/bucket');
if (!liste.ok) {
  echouer(
    `Le service de stockage a repondu ${liste.statut}.`,
    typeof liste.corps === 'object' ? JSON.stringify(liste.corps) : String(liste.corps),
  );
}

const existant = liste.corps.find((s) => s.id === nom);

if (!existant) {
  const creation = await appeler('/bucket', {
    method: 'POST',
    body: JSON.stringify({ id: nom, name: nom, ...SEAU }),
  });
  if (!creation.ok) {
    echouer(`Creation du seau « ${nom} » refusee (${creation.statut}).`, JSON.stringify(creation.corps));
  }
  console.log(`✓ Seau « ${nom} » cree — prive, 5 Mo par fichier.`);
} else {
  // Un seau PUBLIC exposerait la photo de chaque croyant a qui devine son
  // identifiant : la derive se corrige, elle ne se signale pas seulement.
  const derive = existant.public !== SEAU.public;

  const maj = await appeler(`/bucket/${nom}`, {
    method: 'PUT',
    body: JSON.stringify(SEAU),
  });
  if (!maj.ok) {
    echouer(`Mise a jour du seau « ${nom} » refusee (${maj.statut}).`, JSON.stringify(maj.corps));
  }

  console.log(
    derive
      ? `✓ Seau « ${nom} » remis en PRIVE — il etait public.`
      : `✓ Seau « ${nom} » deja conforme.`,
  );
}

// Un seau public dans le projet est un risque, meme s'il n'est pas le notre.
const publics = liste.corps.filter((s) => s.public && s.id !== nom);
if (publics.length > 0) {
  console.warn(
    `\n⚠ Seau(x) PUBLIC(s) dans ce projet : ${publics.map((s) => s.id).join(', ')}.` +
      "\n  Tout fichier qui s'y trouve est lisible par quiconque connait son URL." +
      '\n  Supprimez-les depuis le tableau de bord si vous ne les utilisez pas.',
  );
}

console.log('');
