import { describe, expect, it } from 'vitest';

import {
  calculerAge,
  formatMontant,
  formatNombre,
  formatPourcentage,
  formatValeur,
  formatVariation,
  initiales,
} from '@/lib/utils/format';

/** UI-07 / UI-13 — un montant doit s'afficher a l'identique partout. */

describe('Formatage des nombres et des montants', () => {
  it('separe les milliers', () => {
    // Intl utilise l'espace insecable etroit en fr-FR.
    expect(formatNombre(12480).replace(/\s/g, ' ')).toBe('12 480');
  });

  it('affiche un tiret cadratin pour une valeur absente', () => {
    expect(formatNombre(null)).toBe('—');
    expect(formatNombre(undefined)).toBe('—');
    expect(formatMontant(null)).toBe('—');
    expect(formatNombre(Number.NaN)).toBe('—');
  });

  it('n affiche pas de centimes pour un montant entier en ariary', () => {
    const rendu = formatMontant(3550000);
    expect(rendu).not.toContain(',00');
    expect(rendu.replace(/\s/g, ' ')).toContain('3 550 000');
  });

  it('conserve les decimales quand elles existent', () => {
    expect(formatMontant(1234.5, 'EUR')).toContain(',50');
  });

  it('affiche un montant negatif avec son signe', () => {
    expect(formatMontant(-180000)).toMatch(/-|−/);
  });
});

describe('Pourcentages et variations', () => {
  it('affiche une decimale par defaut', () => {
    expect(formatPourcentage(57).replace(/\s/g, ' ')).toBe('57,0 %');
  });

  it('prefixe une variation positive et utilise un vrai signe moins', () => {
    expect(formatVariation(4.2).startsWith('+')).toBe(true);
    expect(formatVariation(-1.8).startsWith('−')).toBe(true);
  });

  it('n ajoute aucun signe a une variation nulle', () => {
    expect(formatVariation(0).startsWith('+')).toBe(false);
    expect(formatVariation(0).startsWith('−')).toBe(false);
  });
});

describe('Formatage pilote par le registre d indicateurs', () => {
  it('choisit le rendu selon le format declare', () => {
    expect(formatValeur(12480, 'number').replace(/\s/g, ' ')).toBe('12 480');
    expect(formatValeur(57, 'percent').replace(/\s/g, ' ')).toBe('57,0 %');
    expect(formatValeur(3550000, 'currency')).toMatch(/M|3\s?550\s?000/);
  });
});

describe('Initiales et age', () => {
  it('retient les deux premiers mots', () => {
    expect(initiales('KOFFI', 'Amos')).toBe('AK');
    expect(initiales('Jean-Paul DOSSOU')).toBe('JP');
  });

  it('calcule un age revolu, anniversaire non encore passe', () => {
    const aujourdhui = new Date();
    const naissance = new Date(aujourdhui);
    naissance.setFullYear(aujourdhui.getFullYear() - 30);
    naissance.setDate(naissance.getDate() + 1); // anniversaire demain

    expect(calculerAge(naissance)).toBe(29);
  });

  it('calcule un age revolu, anniversaire deja passe', () => {
    const aujourdhui = new Date();
    const naissance = new Date(aujourdhui);
    naissance.setFullYear(aujourdhui.getFullYear() - 30);
    naissance.setDate(naissance.getDate() - 1); // anniversaire hier

    expect(calculerAge(naissance)).toBe(30);
  });
});
