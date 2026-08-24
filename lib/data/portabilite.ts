import 'server-only';

import { createAdminClient } from '@/lib/supabase/server';
import { storage } from '@/lib/storage';
import {
  calculerSha256,
  type FichierStockeManifeste,
  type ManifesteExport,
} from '@/lib/domain/portabilite';
import { ok, ko, type ActionResult } from '@/lib/domain/result';

export const TABLES_EXPORT = [
  'organisations',
  'organisation_settings',
  'entities',
  'grades',
  'fonctions',
  'nationalites',
  'categories_finance',
  'croyants',
  'liens_conjugaux',
  'croyant_retraits',
  'transferts',
  'baptemes',
  'bureaux',
  'bureau_postes',
  'bureau_membres',
  'finance_entries',
  'evenements_dime',
  'dime_enveloppes',
  'dime_versements',
  'dime_remises',
  'dime_rapprochements',
  'report_templates',
  'report_instances',
  'profiles',
  'user_permissions',
  'permission_profiles',
  'audit_logs',
] as const;

export interface ResultatExportIntegral {
  readonly manifeste: ManifesteExport;
  readonly sqlDump: string;
  readonly fichiers: readonly {
    readonly cle: string;
    readonly base64: string;
    readonly contentType: string;
  }[];
}

function escapeSqlValue(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

export async function genererExportIntegral(): Promise<ActionResult<ResultatExportIntegral>> {
  try {
    const supabase = createAdminClient();
    const comptages: Record<string, number> = {};
    const sqlChunks: string[] = [];

    sqlChunks.push('-- =============================================================================');
    sqlChunks.push('-- SYNOD — DUMP DE DONNEES POSTGRESQL STANDARD (ENF-POR-01, ENF-POR-06)');
    sqlChunks.push(`-- Date d\'export : ${new Date().toISOString()}`);
    sqlChunks.push('-- =============================================================================\n');
    sqlChunks.push('BEGIN;\n');

    // 1. Export de chaque table
    for (const table of TABLES_EXPORT) {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact' });

      if (error) {
        // Si une table n'est pas encore créée ou accessible, consigner 0
        comptages[table] = 0;
        continue;
      }

      comptages[table] = count ?? (data?.length ?? 0);

      if (data && data.length > 0) {
        sqlChunks.push(`-- Table : ${table} (${data.length} lignes)`);
        const colonnes = Object.keys(data[0]);
        const colonnesStr = colonnes.map((c) => `"${c}"`).join(', ');

        for (const row of data as Record<string, unknown>[]) {
          const valeurs = colonnes.map((c) => escapeSqlValue(row[c])).join(', ');
          sqlChunks.push(`INSERT INTO "${table}" (${colonnesStr}) VALUES (${valeurs});`);
        }
        sqlChunks.push('');
      }
    }

    sqlChunks.push('COMMIT;\n');
    const sqlDump = sqlChunks.join('\n');
    const sqlDumpSha256 = calculerSha256(sqlDump);

    // 2. Inventaire et extraction des fichiers de stockage
    const store = storage();
    const fichiersExportes: { cle: string; base64: string; contentType: string }[] = [];
    const fichiersManifeste: FichierStockeManifeste[] = [];

    const prefixListRes = await store.list('');
    const cles = prefixListRes.ok ? prefixListRes.data : [];

    let totalOctets = 0;
    for (const cle of cles) {
      const dlRes = await store.download(cle);
      if (dlRes.ok) {
        const buffer = Buffer.from(dlRes.data.base64, 'base64');
        const sha256 = calculerSha256(buffer);
        totalOctets += buffer.length;

        fichiersExportes.push({
          cle,
          base64: dlRes.data.base64,
          contentType: dlRes.data.contentType,
        });

        fichiersManifeste.push({
          cle,
          tailleOctets: buffer.length,
          sha256,
          contentType: dlRes.data.contentType,
        });
      }
    }

    const manifeste: ManifesteExport = {
      application: 'SYNOD',
      versionApp: '0.1.0',
      versionSchema: '0075',
      dateExport: new Date().toISOString(),
      tables: comptages,
      stockage: {
        totalFichiers: fichiersManifeste.length,
        totalOctets,
        fichiers: fichiersManifeste,
      },
      empreintes: {
        databaseSqlSha256: sqlDumpSha256,
      },
    };

    return ok({
      manifeste,
      sqlDump,
      fichiers: fichiersExportes,
    });
  } catch (err) {
    return ko(err instanceof Error ? err.message : "Erreur lors de la génération de l'export intégral");
  }
}
