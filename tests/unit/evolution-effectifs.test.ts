import { describe, expect, it } from 'vitest';

import {
  ABREVIATIONS_PERIODE_EVOLUTION,
  LIBELLES_PERIODE_EVOLUTION,
  PERIODES_EVOLUTION,
  calculerVariation,
  formatPourcentageVariation,
} from '@/lib/domain/evolution-effectifs';

describe('Évolution des effectifs — Domaine', () => {
  it('définit les 5 périodes d’évolution dans l’ordre attendu', () => {
    expect(PERIODES_EVOLUTION).toEqual([
      'SEMAINE',
      'MOIS',
      'TRIMESTRE',
      'SEMESTRE',
      'ANNEE',
    ]);
  });

  it('fournit les libellés et abréviations pour chaque période', () => {
    for (const p of PERIODES_EVOLUTION) {
      expect(LIBELLES_PERIODE_EVOLUTION[p]).toBeDefined();
      expect(ABREVIATIONS_PERIODE_EVOLUTION[p]).toBeDefined();
    }
    expect(ABREVIATIONS_PERIODE_EVOLUTION.MOIS).toBe('M-1');
    expect(ABREVIATIONS_PERIODE_EVOLUTION.ANNEE).toBe('N-1');
    expect(ABREVIATIONS_PERIODE_EVOLUTION.SEMAINE).toBe('S-1');
  });

  describe('calculerVariation', () => {
    it('calcule correctement une hausse', () => {
      const v = calculerVariation(379, 320);
      expect(v.valeurCourante).toBe(379);
      expect(v.valeurPrecedente).toBe(320);
      expect(v.difference).toBe(59);
      expect(v.sens).toBe('HAUSSE');
      expect(v.pourcentage).toBeCloseTo(18.4375, 2);
    });

    it('calcule correctement une baisse', () => {
      const v = calculerVariation(180, 200);
      expect(v.valeurCourante).toBe(180);
      expect(v.valeurPrecedente).toBe(200);
      expect(v.difference).toBe(-20);
      expect(v.sens).toBe('BAISSE');
      expect(v.pourcentage).toBeCloseTo(-10.0, 1);
    });

    it('calcule correctement une stabilité', () => {
      const v = calculerVariation(199, 199);
      expect(v.difference).toBe(0);
      expect(v.sens).toBe('STABLE');
      expect(v.pourcentage).toBe(0);
    });

    it('gère le cas où la valeur précédente était 0', () => {
      const v1 = calculerVariation(10, 0);
      expect(v1.difference).toBe(10);
      expect(v1.sens).toBe('HAUSSE');
      expect(v1.pourcentage).toBe(100);

      const v0 = calculerVariation(0, 0);
      expect(v0.difference).toBe(0);
      expect(v0.sens).toBe('STABLE');
      expect(v0.pourcentage).toBe(0);
    });
  });

  describe('formatPourcentageVariation', () => {
    it('formate les pourcentages positifs avec signe + et virgule', () => {
      expect(formatPourcentageVariation(18.4375)).toBe('+18,4 %');
      expect(formatPourcentageVariation(2.5)).toBe('+2,5 %');
    });

    it('formate les pourcentages négatifs avec signe - et virgule', () => {
      expect(formatPourcentageVariation(-12.6)).toBe('-12,6 %');
    });

    it('formate 0 % proprement', () => {
      expect(formatPourcentageVariation(0)).toBe('0,0 %');
    });

    it('gère les valeurs nulles ou invalides', () => {
      expect(formatPourcentageVariation(null)).toBe('—');
      expect(formatPourcentageVariation(Number.NaN)).toBe('—');
    });
  });
});
