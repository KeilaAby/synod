import { describe, expect, it } from 'vitest';

import {
  PLAFOND_POINTS,
  bornesValides,
  courbeExploitable,
  derniersMois,
  evolutionDesDimes,
  libelleJour,
  libelleMoisCourt,
  libellePeriode,
  moisEnCours,
  nombreDePoints,
} from '@/lib/domain/dime-evolution';

/**
 * EF-FIN-35 — l'evolution des dimes d'un croyant.
 *
 * CE QUE CES TESTS PROTEGENT : la courbe repond a une question de TENDANCE.
 * Toute simplification qui rapproche deux periodes non consecutives, ou qui
 * coupe la fenetre au dernier versement, fait mentir la pente — et c'est la
 * pente qu'on vient lire.
 */

// Le 14 aout 2026, en heure LOCALE : ce module lit les composantes locales,
// et un `Z` ferait basculer d'un jour a l'ouest de Greenwich.
const AOUT = new Date(2026, 7, 14, 10, 0, 0);

describe('moisEnCours — la vue par défaut', () => {
  /**
   * ON S'ARRETE AUJOURD'HUI, pas a la fin du mois : tracer jusqu'au 31 quand on
   * est le 14 dessinerait dix-sept jours a zero qui n'ont pas encore eu lieu,
   * et la courbe se lirait comme une chute.
   */
  it('va du premier du mois à AUJOURD’HUI, pas à la fin du mois', () => {
    expect(moisEnCours(AOUT)).toEqual({
      granularite: 'JOUR',
      debut: '2026-08-01',
      fin: '2026-08-14',
    });
  });

  it('rend un seul jour le premier du mois', () => {
    const b = moisEnCours(new Date(2026, 7, 1, 8, 0, 0));
    expect(b.debut).toBe(b.fin);
    expect(nombreDePoints(b)).toBe(1);
  });
});

describe('derniersMois', () => {
  it('compte le mois en cours dans les douze', () => {
    expect(derniersMois(12, AOUT)).toEqual({
      granularite: 'MOIS',
      debut: '2025-09',
      fin: '2026-08',
    });
  });

  it('franchit le passage d’année sans trou', () => {
    const b = derniersMois(4, new Date(2026, 1, 10));
    expect(b.debut).toBe('2025-11');
    expect(nombreDePoints(b)).toBe(4);
  });
});

describe('evolutionDesDimes — au JOUR', () => {
  const bornes = moisEnCours(AOUT);

  it('rend un point par jour écoulé du mois', () => {
    expect(evolutionDesDimes([], bornes)).toHaveLength(14);
  });

  /**
   * LA DECISION CENTRALE. Une periode sans versement est une INFORMATION —
   * c'est meme celle qu'on vient chercher. Ne garder que les jours servis
   * rapprocherait le 3 du 28 sur l'axe.
   */
  it('règle 15 — un jour SANS versement vaut zéro, il ne disparaît pas', () => {
    const points = evolutionDesDimes([{ montant: 50000, date: '2026-08-02' }], bornes);

    expect(points).toHaveLength(14);
    expect(points.filter((p) => p.montant === 0)).toHaveLength(13);
    expect(points[1]).toMatchObject({ cle: '2026-08-02', montant: 50000, nombre: 1 });
  });

  it('additionne plusieurs versements du même jour, et les compte', () => {
    const points = evolutionDesDimes(
      [
        { montant: 30000, date: '2026-08-09' },
        { montant: 20000, date: '2026-08-09' },
      ],
      bornes,
    );

    expect(points.find((p) => p.cle === '2026-08-09')).toMatchObject({
      montant: 50000,
      nombre: 2,
    });
  });

  it('IGNORE ce qui précède la période, sans décaler les jours', () => {
    const points = evolutionDesDimes(
      [
        { montant: 90000, date: '2026-07-31' },
        { montant: 10000, date: '2026-08-01' },
      ],
      bornes,
    );

    expect(points).toHaveLength(14);
    expect(points.reduce((s, p) => s + p.montant, 0)).toBe(10000);
  });

  it('porte le quantième en graduation, sans zéro inutile', () => {
    const points = evolutionDesDimes([], bornes);
    expect(points[0]!.libelle).toBe('1');
    expect(points[13]!.libelle).toBe('14');
  });
});

describe('evolutionDesDimes — au MOIS', () => {
  const bornes = derniersMois(12, AOUT);

  it('regroupe les versements du même mois', () => {
    const points = evolutionDesDimes(
      [
        { montant: 30000, date: '2026-07-05' },
        { montant: 20000, date: '2026-07-26' },
      ],
      bornes,
    );

    expect(points.find((p) => p.cle === '2026-07')).toMatchObject({
      montant: 50000,
      nombre: 2,
    });
  });

  it('rend douze points et porte le mois en graduation', () => {
    const points = evolutionDesDimes([], bornes);
    expect(points).toHaveLength(12);
    expect(points.at(-1)!.libelle).toBe('août');
  });
});

describe('Les bornes', () => {
  /**
   * Une date absente ne fait pas tomber le calcul : le versement existe, sa
   * ligne reste dans le tableau, il n'entre simplement dans aucune periode.
   */
  it('ignore un versement sans date, sans échouer', () => {
    const points = evolutionDesDimes(
      [
        { montant: 1000, date: null },
        { montant: 2000, date: undefined },
      ],
      moisEnCours(AOUT),
    );

    expect(points.reduce((s, p) => s + p.montant, 0)).toBe(0);
  });

  it('refuse une plage à l’envers', () => {
    expect(
      bornesValides({ granularite: 'JOUR', debut: '2026-08-14', fin: '2026-08-01' }),
    ).toBe(false);
    expect(
      bornesValides({ granularite: 'JOUR', debut: '2026-08-01', fin: '2026-08-14' }),
    ).toBe(true);
  });

  it('accepte une plage d’un seul jour', () => {
    expect(
      bornesValides({ granularite: 'JOUR', debut: '2026-08-14', fin: '2026-08-14' }),
    ).toBe(true);
  });

  /**
   * UNE PLAGE DE DIX ANS JOUR PAR JOUR ferait trois mille six cents points de
   * quelques pixels : illisible, et lourd a tracer. La borne existe pour que
   * l'ecran puisse AVERTIR avant de dessiner.
   */
  it('borne le nombre de points, quelle que soit la plage demandée', () => {
    const points = evolutionDesDimes([], {
      granularite: 'JOUR',
      debut: '2000-01-01',
      fin: '2026-12-31',
    });

    expect(points).toHaveLength(PLAFOND_POINTS);
  });
});

describe('courbeExploitable', () => {
  /**
   * UNE COURBE PLATE A ZERO N'APPREND RIEN et se lit comme une panne : mieux
   * vaut ne rien afficher et laisser le tableau dire qu'il n'y a rien.
   */
  it('refuse une période entièrement à zéro', () => {
    expect(courbeExploitable(evolutionDesDimes([], moisEnCours(AOUT)))).toBe(false);
  });

  it('accepte dès qu’une seule période porte un montant', () => {
    const points = evolutionDesDimes(
      [{ montant: 1, date: '2026-08-03' }],
      moisEnCours(AOUT),
    );
    expect(courbeExploitable(points)).toBe(true);
  });
});

describe('libellePeriode — la courbe dit ce qu’elle couvre', () => {
  /**
   * Une courbe sans periode annoncee se lit comme la TOTALITE : le creux qu'on
   * y voit passerait pour un arret, alors qu'il n'est qu'une borne.
   */
  it('nomme les deux bornes au jour', () => {
    expect(
      libellePeriode({ granularite: 'JOUR', debut: '2026-08-01', fin: '2026-08-14' }),
    ).toContain('août');
  });

  it('nomme les deux bornes au mois', () => {
    expect(
      libellePeriode({ granularite: 'MOIS', debut: '2025-09', fin: '2026-08' }),
    ).toBe('Du sept. 2025 au août 2026');
  });

  it('ne répète pas une borne unique', () => {
    const seul = libellePeriode({
      granularite: 'MOIS',
      debut: '2026-08',
      fin: '2026-08',
    });
    expect(seul).toBe('août 2026');
    expect(seul).not.toContain('Du');
  });
});

describe('Les libellés de graduation', () => {
  it('rend le mois sans répéter l’année', () => {
    expect(libelleMoisCourt('2026-03')).toBe('mars');
    expect(libelleMoisCourt('2026-12-25')).toBe('déc.');
  });

  it('rend le quantième sans zéro de tête', () => {
    expect(libelleJour('2026-08-04')).toBe('4');
    expect(libelleJour('2026-08-31')).toBe('31');
  });
});
