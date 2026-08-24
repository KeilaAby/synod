import { describe, it, expect } from 'vitest';
import {
  calculerSha256,
  verifierIntegriteExport,
  type ManifesteExport,
} from '@/lib/domain/portabilite';

describe('Portabilité & Réversibilité — ENF-POR-06', () => {
  const manifesteExemple: ManifesteExport = {
    application: 'SYNOD',
    versionApp: '0.1.0',
    versionSchema: '0075',
    dateExport: '2026-08-24T12:00:00.000Z',
    tables: {
      entities: 6,
      croyants: 150,
      finance_entries: 42,
      bureaux: 6,
    },
    stockage: {
      totalFichiers: 2,
      totalOctets: 1024,
      fichiers: [
        {
          cle: 'photos/croyant-1.webp',
          tailleOctets: 512,
          sha256: 'a1b2c3d4',
          contentType: 'image/webp',
        },
        {
          cle: 'justificatifs/piece-1.pdf',
          tailleOctets: 512,
          sha256: 'e5f6g7h8',
          contentType: 'application/pdf',
        },
      ],
    },
    empreintes: {
      databaseSqlSha256: 'hash-sql-valide',
    },
  };

  it('calcule une empreinte SHA-256 correcte', () => {
    const hash = calculerSha256('SYNOD_TEST');
    expect(hash).toBeDefined();
    expect(hash.length).toBe(64);
  });

  it('valide un export conforme sans aucune erreur', () => {
    const comptages = {
      entities: 6,
      croyants: 150,
      finance_entries: 42,
      bureaux: 6,
    };

    const rapport = verifierIntegriteExport(manifesteExemple, comptages, 'hash-sql-valide');
    expect(rapport.valide).toBe(true);
    expect(rapport.erreurs).toHaveLength(0);
  });

  it('détecte un écart de dénombrement par table', () => {
    const comptagesCorrompus = {
      entities: 6,
      croyants: 140, // 140 au lieu de 150
      finance_entries: 42,
      bureaux: 6,
    };

    const rapport = verifierIntegriteExport(manifesteExemple, comptagesCorrompus, 'hash-sql-valide');
    expect(rapport.valide).toBe(false);
    expect(rapport.erreurs[0]).toContain('croyants');
  });

  it('détecte une corruption d empreinte du dump SQL', () => {
    const comptages = {
      entities: 6,
      croyants: 150,
      finance_entries: 42,
      bureaux: 6,
    };

    const rapport = verifierIntegriteExport(manifesteExemple, comptages, 'hash-sql-invalide');
    expect(rapport.valide).toBe(false);
    expect(rapport.erreurs[0]).toContain('Empreinte du dump SQL corrompue');
  });
});
