#!/usr/bin/env node

/**
 * SYNOD — Script d'Export Intégral (ENF-POR-06).
 *
 * Usage :
 *   pnpm export:integral [dossier_destination]
 *
 * Produit :
 *   - manifest.json (horodatage, comptages tables, empreintes SHA-256)
 *   - database.sql (dump SQL PostgreSQL standard restaurable)
 *   - storage/ (arborescence des objets stockés : photos, justificatifs, etc.)
 *   - RESTORE.md (procédure de restauration pas à pas)
 */

import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

async function main() {
  const destDirArg = process.argv[2];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetDir = destDirArg
    ? resolve(destDirArg)
    : resolve(process.cwd(), `export-synod-${timestamp}`);

  console.log(`\n📦 Initialisation de l'export intégral SYNOD vers : ${targetDir}`);
  mkdirSync(targetDir, { recursive: true });

  const { genererExportIntegral } = await import('../lib/data/portabilite');
  const res = await genererExportIntegral();

  if (!res.ok) {
    console.error(`❌ Échec de l'export : ${res.error}`);
    process.exit(1);
  }

  const { manifeste, sqlDump, fichiers } = res.data;

  // 1. Écriture du dump SQL
  const sqlPath = join(targetDir, 'database.sql');
  writeFileSync(sqlPath, sqlDump, 'utf8');
  console.log(`  ✓ Dump SQL exporté (${(sqlDump.length / 1024).toFixed(1)} Ko) -> database.sql`);

  // 2. Écriture des fichiers de stockage
  const storageDir = join(targetDir, 'storage');
  mkdirSync(storageDir, { recursive: true });

  for (const fichier of fichiers) {
    const filePath = join(storageDir, fichier.cle);
    mkdirSync(dirname(filePath), { recursive: true });
    const buffer = Buffer.from(fichier.base64, 'base64');
    writeFileSync(filePath, buffer);
  }
  console.log(`  ✓ ${fichiers.length} fichiers exportés dans storage/`);

  // 3. Écriture du manifeste
  const manifestPath = join(targetDir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifeste, null, 2), 'utf8');
  console.log('  ✓ Manifeste d\'intégrité généré -> manifest.json');

  // 4. Copie du guide de restauration
  const restoreSource = resolve(process.cwd(), 'RESTORE.md');
  if (existsSync(restoreSource)) {
    copyFileSync(restoreSource, join(targetDir, 'RESTORE.md'));
    console.log('  ✓ Guide de restauration inclus -> RESTORE.md');
  }

  console.log(`\n✅ Export intégral terminé avec succès dans :\n   ${targetDir}\n`);
}

main().catch((err) => {
  console.error('Erreur fatale export-integral :', err);
  process.exit(1);
});
