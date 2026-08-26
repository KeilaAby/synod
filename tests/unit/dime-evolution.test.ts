import { describe, expect, it } from 'vitest';

import {
  courbeExploitable,
  evolutionDesDimes,
  libelleMoisCourt,
} from '@/lib/domain/dime-evolution';

/**
 * EF-FIN-35 — l'evolution des dimes d'un croyant.
 *
 * CE QUE CES TESTS PROTEGENT : la courbe repond a une question de TENDANCE.
 * Toute simplification qui rapproche deux mois non consecutifs, ou qui coupe la
 * fenetre au dernier versement, fait mentir la pente — et c'est la pente qu'on
 * vient lire.
 */

const AOUT = new Date('2026-08-15T10:00:00Z');

describe('evolutionDesDimes', () => {
  it('rend douze mois par defaut, du plus ancien au plus recent', () => {
    const points = evolutionDesDimes([], { aujourdhui: AOUT });

    expect(points).toHaveLength(12);
    expect(points[0]!.mois).toBe('2025-09');
    expect(points[11]!.mois).toBe('2026-08');
  });

  /**
   * LA DECISION CENTRALE. Un mois sans versement est une INFORMATION — c'est
   * meme celle qu'on vient chercher. Ne garder que les mois servis
   * rapprocherait janvier de septembre sur l'axe, et la courbe montrerait une
   * regularite qui n'existe pas.
   */
  it('règle 15 — un mois SANS versement vaut zéro, il ne disparaît pas', () => {
    const points = evolutionDesDimes(
      [{ montant: 50000, date: '2026-08-02' }],
      { aujourdhui: AOUT },
    );

    expect(points).toHaveLength(12);
    expect(points.filter((p) => p.montant === 0)).toHaveLength(11);
    expect(points.at(-1)).toMatchObject({ mois: '2026-08', montant: 50000, nombre: 1 });
  });

  it('additionne plusieurs versements du même mois, et les compte', () => {
    const points = evolutionDesDimes(
      [
        { montant: 30000, date: '2026-07-05' },
        { montant: 20000, date: '2026-07-26' },
      ],
      { aujourdhui: AOUT },
    );

    expect(points.find((p) => p.mois === '2026-07')).toMatchObject({
      montant: 50000,
      nombre: 2,
    });
  });

  /**
   * LA FENETRE SE COMPTE DEPUIS AUJOURD'HUI, pas depuis le dernier versement :
   * quelqu'un qui a cesse de donner il y a deux ans verrait sinon une courbe
   * pleine, arretee net a droite, sans que rien ne dise que ce « droite » est
   * ancien.
   */
  it('IGNORE ce qui précède la fenêtre, sans décaler les mois', () => {
    const points = evolutionDesDimes(
      [
        { montant: 90000, date: '2024-03-10' },
        { montant: 10000, date: '2026-08-01' },
      ],
      { aujourdhui: AOUT },
    );

    expect(points).toHaveLength(12);
    expect(points.reduce((s, p) => s + p.montant, 0)).toBe(10000);
    expect(points[0]!.mois).toBe('2025-09');
  });

  it('franchit le passage d’année sans trou', () => {
    const points = evolutionDesDimes([], {
      aujourdhui: new Date('2026-02-10T00:00:00Z'),
      nbMois: 4,
    });

    expect(points.map((p) => p.mois)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  /**
   * Une date absente ne fait pas tomber le calcul : le versement existe, sa
   * ligne reste dans le tableau, il n'entre simplement dans aucun mois.
   */
  it('ignore un versement sans date, sans échouer', () => {
    const points = evolutionDesDimes(
      [
        { montant: 1000, date: null },
        { montant: 2000, date: undefined },
      ],
      { aujourdhui: AOUT },
    );

    expect(points.reduce((s, p) => s + p.montant, 0)).toBe(0);
  });

  it('borne la fenêtre à un mois au minimum', () => {
    expect(evolutionDesDimes([], { aujourdhui: AOUT, nbMois: 0 })).toHaveLength(1);
  });
});

describe('courbeExploitable', () => {
  /**
   * UNE COURBE PLATE A ZERO N'APPREND RIEN et se lit comme une panne : mieux
   * vaut ne rien afficher et laisser le tableau dire qu'il n'y a rien.
   */
  it('refuse une période entièrement à zéro', () => {
    expect(courbeExploitable(evolutionDesDimes([], { aujourdhui: AOUT }))).toBe(false);
  });

  it('accepte dès qu’un seul mois porte un montant', () => {
    const points = evolutionDesDimes([{ montant: 1, date: '2026-08-01' }], {
      aujourdhui: AOUT,
    });
    expect(courbeExploitable(points)).toBe(true);
  });
});

describe('libelleMoisCourt', () => {
  it('rend le mois sans répéter l’année sur chaque graduation', () => {
    expect(libelleMoisCourt('2026-03')).toBe('mars');
    expect(libelleMoisCourt('2026-12')).toBe('déc.');
  });
});
