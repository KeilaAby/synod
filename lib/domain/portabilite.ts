import { createHash } from 'node:crypto';

/**
 * Manifeste d'export intégral — ENF-POR-06.
 *
 * Décrit l'intégralité d'un export de données SYNOD :
 * - Version de l'application et dernière migration appliquée.
 * - Horodatage précis (ISO 8601).
 * - Dénombrement exact des lignes par table.
 * - Inventaire et empreintes SHA-256 de chaque fichier du stockage.
 * - Empreinte globale du dump de la base de données.
 */

export interface FichierStockeManifeste {
  readonly cle: string;
  readonly tailleOctets: number;
  readonly sha256: string;
  readonly contentType?: string;
}

export interface ManifesteExport {
  readonly application: 'SYNOD';
  readonly versionApp: string;
  readonly versionSchema: string;
  readonly dateExport: string;
  readonly tables: Record<string, number>;
  readonly stockage: {
    readonly totalFichiers: number;
    readonly totalOctets: number;
    readonly fichiers: readonly FichierStockeManifeste[];
  };
  readonly empreintes: {
    readonly databaseSqlSha256: string;
  };
}

export function calculerSha256(buffer: Buffer | Uint8Array | string): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export interface RapportVerificationManifeste {
  readonly valide: boolean;
  readonly erreurs: readonly string[];
  readonly avertissements: readonly string[];
}

export function verifierIntegriteExport(
  manifeste: ManifesteExport,
  comptagesReels: Record<string, number>,
  sqlDumpSha256?: string,
): RapportVerificationManifeste {
  const erreurs: string[] = [];
  const avertissements: string[] = [];

  if (manifeste.application !== 'SYNOD') {
    erreurs.push(`Application invalide : ${manifeste.application}, attendu SYNOD`);
  }

  if (sqlDumpSha256 && manifeste.empreintes.databaseSqlSha256 !== sqlDumpSha256) {
    erreurs.push(
      `Empreinte du dump SQL corrompue : attendu ${manifeste.empreintes.databaseSqlSha256}, obtenu ${sqlDumpSha256}`,
    );
  }

  for (const [table, attendu] of Object.entries(manifeste.tables)) {
    const reel = comptagesReels[table];
    if (reel === undefined) {
      avertissements.push(`Table ${table} absente du contrôle de dénombrement`);
    } else if (reel !== attendu) {
      erreurs.push(
        `Écart de dénombrement sur la table ${table} : ${attendu} attendus dans le manifeste, ${reel} trouvés en base`,
      );
    }
  }

  return {
    valide: erreurs.length === 0,
    erreurs,
    avertissements,
  };
}
