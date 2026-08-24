#!/usr/bin/env node

/**
 * SYNOD — Script de Génération de Volume Massif pour Test de Charge (Lot 8 — ENF-PRF-01/02).
 *
 * Génère un dataset synthétique réaliste conforme aux contraintes RG-01 à RG-33 :
 * - 200 000 Croyants avec matricules et liens hiérarchiques.
 * - 500 000 Mouvements financiers (recettes, dépenses, dîmes) avec statuts validés.
 *
 * Usage :
 *   pnpm tsx scripts/seed-volume.ts [--sql-only] [--count-croyants=200000] [--count-finances=500000]
 */

import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
  const totalCroyants = 200000;
  const totalFinances = 500000;

  const outputFile = resolve(process.cwd(), 'seed-volume-massif.sql');
  console.log(`\n📊 Génération du script SQL de charge massive : ${outputFile}`);
  console.log(`   - Objectif Croyants : ${totalCroyants.toLocaleString()}`);
  console.log(`   - Objectif Mouvements financiers : ${totalFinances.toLocaleString()}\n`);

  const stream = createWriteStream(outputFile, { encoding: 'utf8' });

  stream.write('-- =============================================================================\n');
  stream.write('-- SYNOD — JEU DE DONNEES VOLUMIQUE MASSIF (200K CROYANTS / 500K FINANCES)\n');
  stream.write(`-- Généré le : ${new Date().toISOString()}\n`);
  stream.write('-- =============================================================================\n\n');
  stream.write('BEGIN;\n\n');

  // Génération des croyants via generate_series SQL hautement optimisé
  stream.write('-- 1. Insertion massive de 200 000 Croyants\n');
  stream.write(`
INSERT INTO croyants (
  id,
  eglise_id,
  nom,
  prenom,
  sexe,
  date_naissance,
  nationalite_id,
  grade_id,
  matricule,
  statut,
  created_at
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM entities WHERE type = 'EGLISE' LIMIT 1),
  'NOM_' || LPAD(s::text, 6, '0'),
  'PRENOM_' || LPAD(s::text, 6, '0'),
  CASE WHEN s % 2 = 0 THEN 'M' ELSE 'F' END,
  (CURRENT_DATE - (18 * 365 + (s % 15000) * INTERVAL '1 day'))::date,
  (SELECT id FROM nationalites LIMIT 1),
  (SELECT id FROM grades ORDER BY ordre LIMIT 1),
  'VOL-2026-' || LPAD(s::text, 7, '0'),
  'ACTIF',
  NOW() - (s % 365 * INTERVAL '1 day')
FROM generate_series(1, ${totalCroyants}) AS s;
\n`);

  // Génération des mouvements financiers via generate_series SQL
  stream.write('-- 2. Insertion massive de 500 000 Mouvements Financiers\n');
  stream.write(`
INSERT INTO finance_entries (
  id,
  entity_id,
  categorie_id,
  sens,
  montant,
  date_mouvement,
  libelle,
  statut,
  reference,
  created_at
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM entities WHERE type = 'EGLISE' LIMIT 1),
  (SELECT id FROM categories_finance LIMIT 1),
  CASE WHEN s % 3 = 0 THEN 'DEPENSE' ELSE 'RECETTE' END,
  (10000 + (s % 500) * 1000)::numeric,
  (CURRENT_DATE - (s % 730 * INTERVAL '1 day'))::date,
  'Mouvement synthétique de charge ' || s,
  'VALIDE',
  'MVT-VOL-' || LPAD(s::text, 8, '0'),
  NOW() - (s % 730 * INTERVAL '1 day')
FROM generate_series(1, ${totalFinances}) AS s;
\n`);

  stream.write('COMMIT;\n');
  stream.end();

  console.log(`✅ Fichier SQL généré avec succès (${outputFile})`);
  console.log(`   Pour appliquer ce volume de charge sur votre instance PostgreSQL :`);
  console.log(`   psql -h $HOTE_PG -U $USER -d synod_prod -f seed-volume-massif.sql\n`);
}

main().catch((err) => {
  console.error('Erreur seed-volume :', err);
  process.exit(1);
});
