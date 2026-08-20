import { describe, expect, it } from 'vitest';

import {
  type CompteAEvaluer,
  finDeMandatLaPlusRecente,
  mandatEchu,
  mandatEnCours,
} from '@/lib/domain/mandat';

/**
 * RG-07 — un mandat echu ferme l'application.
 *
 * Ces tests protegent une regle qui, mal ecrite, met TOUTE l'organisation
 * dehors. Les deux exceptions et le silence sont donc testes autant que le cas
 * nominal.
 */

const AUJOURDHUI = '2026-08-20';

function compte(partiel: Partial<CompteAEvaluer> = {}): CompteAEvaluer {
  return {
    role: 'GESTIONNAIRE',
    typeEntite: 'EGLISE',
    estResponsableInformatique: false,
    mandats: [],
    ...partiel,
  };
}

describe('mandatEnCours', () => {
  it('considere un mandat sans terme comme en cours', () => {
    expect(mandatEnCours({ date_fin: null }, AUJOURDHUI)).toBe(true);
  });

  /**
   * LA BORNE EST INCLUSE. Retirer l'acces le dernier jour du mandat le
   * retirerait le jour ou l'on transmet les dossiers.
   */
  it('RG-07 — un mandat qui finit aujourd’hui s’exerce encore aujourd’hui', () => {
    expect(mandatEnCours({ date_fin: AUJOURDHUI }, AUJOURDHUI)).toBe(true);
  });

  it('considere un mandat fini hier comme echu', () => {
    expect(mandatEnCours({ date_fin: '2026-08-19' }, AUJOURDHUI)).toBe(false);
  });
});

describe('mandatEchu', () => {
  it('RG-07 — ferme l’acces quand tous les mandats ont pris fin', () => {
    const c = compte({ mandats: [{ date_fin: '2025-12-31' }, { date_fin: '2026-03-01' }] });
    expect(mandatEchu(c, AUJOURDHUI)).toBe(true);
  });

  it('laisse l’acces ouvert s’il reste UN mandat en cours', () => {
    const c = compte({ mandats: [{ date_fin: '2025-12-31' }, { date_fin: null }] });
    expect(mandatEchu(c, AUJOURDHUI)).toBe(false);
  });

  /**
   * ON REVOQUE SUR PREUVE, JAMAIS SUR ABSENCE DE PREUVE (regle 15).
   *
   * Une liste vide vient d'une fiche non reliee, d'une lecture bornee par la
   * RLS ou d'une base anterieure a la regle. Fermer sur ce silence mettrait
   * l'organisation dehors sans que rien ne l'explique.
   */
  it('règle 15 — un compte sans AUCUN mandat connu n’est pas révoqué', () => {
    expect(mandatEchu(compte({ mandats: [] }), AUJOURDHUI)).toBe(false);
  });

  /**
   * LA DEROGATION DU SIEGE. Quand tous les bureaux se ferment, le Siege seul
   * garde un mandat ouvert : sans lui, plus personne ne peut rouvrir quoi que
   * ce soit, et il ne reste que l'acces direct a la base.
   */
  it('RG-07 — dérogation du Siège : ses membres gardent l’accès sans mandat en cours', () => {
    const c = compte({ typeEntite: 'SIEGE', mandats: [{ date_fin: '2020-01-01' }] });
    expect(mandatEchu(c, AUJOURDHUI)).toBe(false);
  });

  /**
   * LA DEROGATION PORTE SUR L'ENTITE, PAS SUR LE ROLE. Ne dispenser que le
   * SuperAdmin ferait dependre le redemarrage d'UNE personne, absente le jour
   * ou il le faudrait.
   */
  it('la dérogation couvre un administrateur du Siège qui n’est pas SuperAdmin', () => {
    const c = compte({
      role: 'GESTIONNAIRE',
      typeEntite: 'SIEGE',
      mandats: [{ date_fin: '2019-01-01' }],
    });
    expect(mandatEchu(c, AUJOURDHUI)).toBe(false);
  });

  it('ne révoque JAMAIS un SuperAdmin, même sans mandat en cours', () => {
    const c = compte({ role: 'SUPERADMIN', mandats: [{ date_fin: '2020-01-01' }] });
    expect(mandatEchu(c, AUJOURDHUI)).toBe(false);
  });

  /**
   * La derogation ne descend PAS. Un district dont tous les mandats sont echus
   * perd l'acces : c'est la regle, et le Siege est la seule exception.
   */
  it('la dérogation ne couvre que le Siège, pas les niveaux inférieurs', () => {
    for (const niveau of ['REGIONAL', 'DISTRICT', 'PAROISSE', 'EGLISE']) {
      const c = compte({ typeEntite: niveau, mandats: [{ date_fin: '2020-01-01' }] });
      expect(mandatEchu(c, AUJOURDHUI), niveau).toBe(true);
    }
  });

  /**
   * Le responsable informatique ne siege dans aucun bureau : c'est exactement
   * ce pour quoi il a ete cree (migration 0047).
   */
  it('ne révoque jamais le responsable informatique', () => {
    const c = compte({
      estResponsableInformatique: true,
      mandats: [{ date_fin: '2020-01-01' }],
    });
    expect(mandatEchu(c, AUJOURDHUI)).toBe(false);
  });

  /**
   * L'EXCEPTION LE SUIT ET NE LUI SURVIT PAS. Remplace, il redevient un membre
   * de bureau comme les autres — et perd l'acces si aucun mandat ne le couvre.
   * Sa fiche de croyant, elle, ne bouge pas : ce module ne ferme que l'acces.
   */
  it('RG-07 — un responsable informatique REMPLACÉ perd l’accès comme les autres', () => {
    const c = compte({
      estResponsableInformatique: false,
      mandats: [{ date_fin: '2026-03-31' }],
    });
    expect(mandatEchu(c, AUJOURDHUI)).toBe(true);
  });

  it('ne révoque pas le jour même de la fin du mandat', () => {
    expect(mandatEchu(compte({ mandats: [{ date_fin: AUJOURDHUI }] }), AUJOURDHUI)).toBe(
      false,
    );
    expect(mandatEchu(compte({ mandats: [{ date_fin: '2026-08-19' }] }), AUJOURDHUI)).toBe(
      true,
    );
  });
});

describe('finDeMandatLaPlusRecente', () => {
  it('rend la date la plus récente, pas la première rencontrée', () => {
    expect(
      finDeMandatLaPlusRecente([
        { date_fin: '2021-06-30' },
        { date_fin: '2025-12-31' },
        { date_fin: '2023-01-01' },
      ]),
    ).toBe('2025-12-31');
  });

  it('ignore les mandats sans terme', () => {
    expect(finDeMandatLaPlusRecente([{ date_fin: null }, { date_fin: '2024-05-05' }])).toBe(
      '2024-05-05',
    );
  });

  it('rend null quand aucune date n’est connue', () => {
    expect(finDeMandatLaPlusRecente([])).toBeNull();
    expect(finDeMandatLaPlusRecente([{ date_fin: null }])).toBeNull();
  });
});
