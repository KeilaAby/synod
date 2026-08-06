#!/usr/bin/env node
/**
 * Assemble les migrations et l'amorce en un fichier unique, collable d'un seul
 * tenant dans l'editeur SQL de Supabase.
 *
 * Les migrations restent la SOURCE DE VERITE : ce fichier est genere, jamais
 * edite a la main. Le regenerer apres toute nouvelle migration :
 *
 *     pnpm db:bundle
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dossierMigrations = join(racine, 'supabase', 'migrations');
const sortie = join(racine, 'supabase', 'install.sql');

const migrations = readdirSync(dossierMigrations)
  .filter((f) => f.endsWith('.sql'))
  .sort(); // l'ordre lexicographique EST l'ordre d'application (0001, 0002...)

const morceaux = [
  `-- =============================================================================
-- SYNOD — Installation complete de la base
-- =============================================================================
-- FICHIER GENERE — ne pas editer a la main.
-- Source : supabase/migrations/*.sql + supabase/seed.sql
-- Regenerer avec : pnpm db:bundle
--
-- Utilisation : coller l'integralite dans l'editeur SQL de Supabase, puis
-- executer. L'ordre des instructions est significatif.
--
-- Genere le ${new Date().toISOString()}
-- Migrations incluses : ${migrations.length} + seed.sql
-- =============================================================================
`,
];

for (const fichier of migrations) {
  morceaux.push(
    `\n\n-- #############################################################################\n` +
      `-- ## ${fichier}\n` +
      `-- #############################################################################\n\n` +
      readFileSync(join(dossierMigrations, fichier), 'utf8').trimEnd(),
  );
}

morceaux.push(
  `\n\n-- #############################################################################\n` +
    `-- ## seed.sql — amorce des donnees de reference\n` +
    `-- #############################################################################\n\n` +
    readFileSync(join(racine, 'supabase', 'seed.sql'), 'utf8').trimEnd(),
);

writeFileSync(sortie, `${morceaux.join('')}\n`, 'utf8');

console.log(`supabase/install.sql genere — ${migrations.length} migrations + seed.`);
for (const fichier of migrations) console.log(`  · ${fichier}`);
