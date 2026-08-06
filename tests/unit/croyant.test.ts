import { describe, expect, it } from 'vitest';

import {
  calculerAge,
  cleDoublon,
  compteDansLesEffectifs,
  composerMatricule,
  decomposerMatricule,
  estNouveauBaptise,
  nomComplet,
  trancheAge,
  validerDatesCroyant,
} from '@/lib/domain/croyant';

/** CA-02 — chaque règle de gestion est couverte par un test nommé. */

describe('RG-28 — cohérence des dates du croyant', () => {
  const aujourdhui = new Date('2026-08-06T12:00:00Z');

  it('accepte un baptême postérieur à la naissance', () => {
    const r = validerDatesCroyant(
      new Date('1990-03-12'),
      new Date('2010-06-01'),
      aujourdhui,
    );
    expect(r.ok).toBe(true);
  });

  it('accepte un baptême le jour même de la naissance', () => {
    const jour = new Date('2020-01-15');
    expect(validerDatesCroyant(jour, jour, aujourdhui).ok).toBe(true);
  });

  it('refuse un baptême antérieur à la naissance, en nommant la date fautive', () => {
    const r = validerDatesCroyant(
      new Date('2010-06-01'),
      new Date('1990-03-12'),
      aujourdhui,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('baptême');
  });

  it('refuse une naissance dans le futur', () => {
    const r = validerDatesCroyant(
      new Date('2030-01-01'),
      new Date('2030-06-01'),
      aujourdhui,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('naissance');
  });

  it('refuse un baptême dans le futur', () => {
    const r = validerDatesCroyant(
      new Date('1990-03-12'),
      new Date('2030-01-01'),
      aujourdhui,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('baptême');
  });

  // La date de baptême est FACULTATIVE : une fiche se crée souvent avant
  // qu'elle ne soit connue (reprise de registre, croyant en préparation).
  it('accepte une fiche sans date de baptême', () => {
    expect(validerDatesCroyant(new Date('1990-03-12'), null, aujourdhui).ok).toBe(true);
    expect(validerDatesCroyant(new Date('1990-03-12'), undefined, aujourdhui).ok).toBe(true);
  });

  it('contrôle toujours la date de naissance, même sans baptême', () => {
    const r = validerDatesCroyant(new Date('2030-01-01'), null, aujourdhui);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('naissance');
  });
});

describe('RG-29 — matricule', () => {
  it('compose un matricule avec une séquence sur quatre chiffres', () => {
    expect(composerMatricule('EGL-COT', 2026, 147)).toBe('EGL-COT-2026-0147');
  });

  it('décompose un matricule valide', () => {
    const d = decomposerMatricule('EGL-COT-2026-0147');
    expect(d).toEqual({ codeEglise: 'EGL-COT', annee: 2026, sequence: 147 });
  });

  it('accepte une séquence débordant les quatre chiffres', () => {
    expect(decomposerMatricule('EGL-COT-2026-12345')?.sequence).toBe(12345);
  });

  it('rejette un matricule mal formé', () => {
    for (const m of ['EGL-COT-2026', 'EGL-2026-0147-X', 'ab-2026-0147', '']) {
      expect(decomposerMatricule(m), m).toBeNull();
    }
  });
});

describe('Âge et tranches', () => {
  const aujourdhui = new Date('2026-08-06T12:00:00Z');

  it("retranche une année si l'anniversaire n'est pas encore passé", () => {
    expect(calculerAge(new Date('1990-12-25'), aujourdhui)).toBe(35);
  });

  it("compte l'année si l'anniversaire est passé", () => {
    expect(calculerAge(new Date('1990-01-25'), aujourdhui)).toBe(36);
  });

  it("compte l'année le jour même de l'anniversaire", () => {
    expect(calculerAge(new Date('1990-08-06'), aujourdhui)).toBe(36);
  });

  it('range chaque âge dans sa tranche', () => {
    expect(trancheAge(0)).toBe('0-14');
    expect(trancheAge(14)).toBe('0-14');
    expect(trancheAge(15)).toBe('15-24');
    expect(trancheAge(34)).toBe('25-34');
    expect(trancheAge(64)).toBe('50-64');
    expect(trancheAge(90)).toBe('65+');
  });
});

describe('RG-30 — nouveaux baptisés, fenêtre de 15 jours', () => {
  const aujourdhui = new Date('2026-08-06T12:00:00Z');

  it("retient un baptême du jour", () => {
    expect(estNouveauBaptise(new Date('2026-08-06'), 15, aujourdhui)).toBe(true);
  });

  it('retient un baptême à la limite de la fenêtre', () => {
    expect(estNouveauBaptise(new Date('2026-07-22'), 15, aujourdhui)).toBe(true);
  });

  it('écarte un baptême antérieur à la fenêtre', () => {
    expect(estNouveauBaptise(new Date('2026-07-20'), 15, aujourdhui)).toBe(false);
  });

  it('respecte une fenêtre paramétrée différemment', () => {
    expect(estNouveauBaptise(new Date('2026-06-01'), 90, aujourdhui)).toBe(true);
    expect(estNouveauBaptise(new Date('2026-06-01'), 15, aujourdhui)).toBe(false);
  });

  it("n'est jamais nouveau baptisé sans date de baptême", () => {
    expect(estNouveauBaptise(null, 15, aujourdhui)).toBe(false);
    expect(estNouveauBaptise(undefined, 15, aujourdhui)).toBe(false);
  });
});

describe('EF-CRO-13 — détection de doublons', () => {
  it('rapproche deux saisies ne différant que par la casse ou les espaces', () => {
    const a = cleDoublon('  KOFFI ', 'Amos', new Date('1990-03-12'));
    const b = cleDoublon('koffi', ' amos', new Date('1990-03-12'));
    expect(a).toBe(b);
  });

  it('ignore les accents', () => {
    const a = cleDoublon('DOSSOU', 'Hélène', new Date('1990-03-12'));
    const b = cleDoublon('dossou', 'Helene', new Date('1990-03-12'));
    expect(a).toBe(b);
  });

  it('distingue deux personnes de même nom nées à des dates différentes', () => {
    const a = cleDoublon('KOFFI', 'Amos', new Date('1990-03-12'));
    const b = cleDoublon('KOFFI', 'Amos', new Date('1991-03-12'));
    expect(a).not.toBe(b);
  });
});

describe('RG-12 — seuls les croyants actifs alimentent les effectifs', () => {
  it('ne compte que le statut ACTIF', () => {
    expect(compteDansLesEffectifs('ACTIF')).toBe(true);
    for (const s of ['INACTIF', 'TRANSFERE', 'DECEDE'] as const) {
      expect(compteDansLesEffectifs(s), s).toBe(false);
    }
  });
});

describe('Affichage', () => {
  it('met le nom en capitales et le prénom devant', () => {
    expect(nomComplet('koffi', 'Amos')).toBe('Amos KOFFI');
  });
});
