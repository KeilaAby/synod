#!/usr/bin/env node
/**
 * Détection de secrets — ENF-SEC-09.
 *
 * Un secret versionné ne se retire pas : il se révoque. Une fois poussé, il vit
 * dans l'historique git, dans les clones et dans les caches des forges. Ce
 * script existe donc pour BLOQUER avant le commit, pas pour constater après.
 *
 * Trois points d'ancrage :
 *   - `.githooks/pre-commit` — refuse le commit  (installé par `pnpm prepare`)
 *   - `pnpm verify`          — refuse la publication locale
 *   - CI                     — refuse la fusion
 *
 * Usage :
 *   node scripts/check-secrets.mjs            # fichiers indexés (pre-commit)
 *   node scripts/check-secrets.mjs --all      # tous les fichiers suivis (CI)
 *
 * Dérogation ponctuelle : ajouter `secret-scan:ignore` sur la ligne concernée.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const TOUT = process.argv.includes('--all');

/** Fichiers dont le contenu n'a pas à être analysé. */
const CHEMINS_EXCLUS = [
  /^pnpm-lock\.yaml$/,
  /^package-lock\.json$/,
  /^\.next\//,
  /^node_modules\//,
  /^public\/.*\.(png|jpg|jpeg|gif|webp|ico|svg)$/,
  /\.woff2?$/,
];

/**
 * Motifs recherchés.
 *
 * `eyJ` est le début d'un objet JSON encodé en base64url : c'est la signature
 * d'un JWT. On exige les TROIS segments — le seul en-tête est une constante
 * publique, sans valeur de secret.
 */
const MOTIFS = [
  {
    nom: 'Jeton JWT',
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    explication:
      "Un JWT Supabase (anon ou service_role) n'a rien à faire dans le dépôt. " +
      'Placez-le dans .env.local, qui est ignoré.',
  },
  {
    nom: 'Clé de service renseignée',
    regex: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+/g,
    explication:
      'Cette clé CONTOURNE la RLS : sa fuite annule tout le cloisonnement par ' +
      'périmètre (ENF-SEC-01). Elle ne doit exister que dans .env.local.',
  },
  {
    nom: 'Clé privée',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    explication: 'Une clé privée ne se versionne jamais.',
  },
  {
    nom: "Identifiant d'accès AWS",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    explication: 'Identifiant AWS en clair.',
  },
  {
    nom: 'Secret assigné en clair',
    regex:
      /\b(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["'][^"'\s]{20,}["']/gi,
    explication:
      'Valeur sensible codée en dur. Passez par une variable d\'environnement.',
  },
];

function fichiersACcontroler() {
  const commande = TOUT
    ? ['ls-files']
    : ['diff', '--cached', '--name-only', '--diff-filter=ACMR'];

  const sortie = execFileSync('git', commande, { encoding: 'utf8' });

  return sortie
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((f) => !CHEMINS_EXCLUS.some((r) => r.test(f)));
}

/** Lit la version INDEXÉE, pas celle du disque : c'est elle qui sera commitée. */
function lireContenu(chemin) {
  try {
    if (TOUT) {
      if (statSync(chemin).size > 5 * 1024 * 1024) return null;
      return readFileSync(chemin, 'utf8');
    }
    return execFileSync('git', ['show', `:${chemin}`], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return null; // binaire, supprimé, ou illisible
  }
}

const trouvailles = [];

for (const fichier of fichiersACcontroler()) {
  const contenu = lireContenu(fichier);
  // Un octet nul signe un fichier binaire : rien a analyser ligne par ligne.
  if (contenu === null || contenu.includes('\0')) continue;

  const lignes = contenu.split('\n');

  for (const motif of MOTIFS) {
    for (const [index, ligne] of lignes.entries()) {
      // Dérogation explicite, assumée par celui qui l'écrit.
      if (ligne.includes('secret-scan:ignore')) continue;

      motif.regex.lastIndex = 0;
      const correspondance = motif.regex.exec(ligne);
      if (!correspondance) continue;

      trouvailles.push({
        fichier,
        ligne: index + 1,
        motif: motif.nom,
        explication: motif.explication,
        extrait: correspondance[0].slice(0, 24) + '…',
      });
    }
  }
}

if (trouvailles.length === 0) {
  console.log(
    `✓ Aucun secret détecté (${TOUT ? 'tous les fichiers suivis' : 'fichiers indexés'}).`,
  );
  process.exit(0);
}

console.error('\n✗ SECRETS DÉTECTÉS — opération interrompue\n');

for (const t of trouvailles) {
  console.error(`  ${t.fichier}:${t.ligne}`);
  console.error(`    ${t.motif} — ${t.extrait}`);
  console.error(`    ${t.explication}\n`);
}

console.error(
  'Retirez ces valeurs, puis recommencez.\n' +
    "Si un secret a DÉJÀ été poussé, le retirer ne suffit pas : il faut le RÉVOQUER.\n" +
    'Procédure : voir « Rotation d\'un secret » dans README.md.\n' +
    'Dérogation ponctuelle : ajouter `secret-scan:ignore` sur la ligne.\n',
);

process.exit(1);
