import { describe, expect, it } from 'vitest';

import {
  bornesPeriode,
  decalerPeriode,
  libelleMois,
  libellePeriode,
  partDeCategorie,
  totauxDeSynthese,
} from '@/lib/domain/synthese';

/**
 * EF-FIN-24 — la synthese periodique.
 *
 * TOUT EST EN CHAINES « AAAA-MM-JJ ». Une colonne `date` n'a pas de fuseau, et
 * lui en inventer un a deja fait basculer une collecte du 31 aout dans le mois
 * de septembre. Ces tests verrouillent ce choix.
 */
describe('EF-FIN-24 — les bornes d une periode', () => {
  it('borne un mois sur son premier et son dernier jour', () => {
    expect(bornesPeriode('MOIS', '2026-08-16')).toEqual({
      debut: '2026-08-01',
      fin: '2026-08-31',
    });
  });

  it('connait les mois courts, fevrier bissextile compris', () => {
    expect(bornesPeriode('MOIS', '2026-02-10').fin).toBe('2026-02-28');
    // 2028 est bissextile : le 29 existe et doit entrer dans la periode.
    expect(bornesPeriode('MOIS', '2028-02-10').fin).toBe('2028-02-29');
    expect(bornesPeriode('MOIS', '2026-04-05').fin).toBe('2026-04-30');
  });

  it('deduit le trimestre du mois', () => {
    // Janvier a mars est le premier trimestre, quel que soit l'exercice :
    // l'organisation n'en a declare aucun autre.
    expect(bornesPeriode('TRIMESTRE', '2026-02-14')).toEqual({
      debut: '2026-01-01',
      fin: '2026-03-31',
    });
    expect(bornesPeriode('TRIMESTRE', '2026-08-16')).toEqual({
      debut: '2026-07-01',
      fin: '2026-09-30',
    });
    expect(bornesPeriode('TRIMESTRE', '2026-12-31')).toEqual({
      debut: '2026-10-01',
      fin: '2026-12-31',
    });
  });

  it('borne une annee civile', () => {
    expect(bornesPeriode('ANNEE', '2026-08-16')).toEqual({
      debut: '2026-01-01',
      fin: '2026-12-31',
    });
  });

  it('ne depend pas du jour d ancrage dans la periode', () => {
    // L'ecran s'ouvre sur « aujourd'hui » : c'est la periode d'aujourd'hui
    // qu'on veut, pas celle qui commence aujourd'hui.
    expect(bornesPeriode('MOIS', '2026-08-01')).toEqual(
      bornesPeriode('MOIS', '2026-08-31'),
    );
  });
});

describe('EF-FIN-24 — le passage d une periode a l autre', () => {
  it('recule et avance d un mois', () => {
    expect(decalerPeriode('MOIS', '2026-08-16', -1)).toBe('2026-07-01');
    expect(decalerPeriode('MOIS', '2026-08-16', 1)).toBe('2026-09-01');
  });

  it('franchit le changement d annee dans les deux sens', () => {
    expect(decalerPeriode('MOIS', '2026-01-15', -1)).toBe('2025-12-01');
    expect(decalerPeriode('MOIS', '2026-12-15', 1)).toBe('2027-01-01');
  });

  it('ne saute JAMAIS un mois court', () => {
    /**
     * Reculer d'un mois depuis le 31 mars donnerait un « 31 fevrier », que
     * `Date` corrigerait silencieusement en 3 mars : on aurait saute fevrier
     * entier. On decale la PERIODE, pas le jour.
     */
    expect(decalerPeriode('MOIS', '2026-03-31', -1)).toBe('2026-02-01');
    expect(bornesPeriode('MOIS', decalerPeriode('MOIS', '2026-03-31', -1))).toEqual({
      debut: '2026-02-01',
      fin: '2026-02-28',
    });
  });

  it('decale d un trimestre et d une annee entiers', () => {
    expect(decalerPeriode('TRIMESTRE', '2026-08-16', -1)).toBe('2026-04-01');
    expect(decalerPeriode('TRIMESTRE', '2026-02-16', -1)).toBe('2025-10-01');
    expect(decalerPeriode('ANNEE', '2026-08-16', -1)).toBe('2025-01-01');
  });
});

describe('EF-FIN-24 — les libelles', () => {
  it('nomme la periode en francais, majuscule comprise', () => {
    expect(libellePeriode('MOIS', '2026-08-16')).toBe('Août 2026');
    expect(libellePeriode('TRIMESTRE', '2026-08-16')).toBe('T3 2026');
    expect(libellePeriode('ANNEE', '2026-08-16')).toBe('Année 2026');
  });

  it('abrege le mois pour une abscisse de courbe', () => {
    expect(libelleMois('2026-08-01')).toBe('août');
    expect(libelleMois('2026-01-01')).toBe('janv');
    expect(libelleMois('2026-08-01', true)).toBe('août 26');
  });
});

describe('EF-FIN-24 — les totaux', () => {
  const lignes = [
    { sens: 'RECETTE', montant: 1_000_000 },
    { sens: 'RECETTE', montant: 500_000 },
    { sens: 'DEPENSE', montant: 300_000 },
  ];

  it('rend le solde de la PERIODE, pas un cumul', () => {
    /**
     * `fn_finance_solde` repond pour un cumul depuis toujours. Confondre les
     * deux afficherait un solde de tresorerie sous un titre qui annonce un
     * resultat de periode : deux nombres plausibles, un seul qui reponde.
     */
    expect(totauxDeSynthese(lignes)).toEqual({
      recettes: 1_500_000,
      depenses: 300_000,
      solde: 1_200_000,
    });
  });

  it('rend un solde negatif tel quel', () => {
    // EF-FIN-13 — un solde negatif se SIGNALE, il ne se borne pas a zero.
    expect(totauxDeSynthese([{ sens: 'DEPENSE', montant: 42 }]).solde).toBe(-42);
  });

  it('rend zero sur une periode vide', () => {
    expect(totauxDeSynthese([])).toEqual({ recettes: 0, depenses: 0, solde: 0 });
  });

  it('rapporte une categorie au total de SON sens', () => {
    /**
     * « Les dimes font 60 % » se comprend comme 60 % des recettes. Rapporter
     * une recette a la somme des recettes ET des depenses donnerait un nombre
     * que personne n'interprete.
     */
    expect(partDeCategorie(1_000_000, 1_500_000)).toBeCloseTo(66.67, 1);
    // Un sens sans aucun mouvement ne provoque pas de division par zero.
    expect(partDeCategorie(0, 0)).toBe(0);
  });
});
