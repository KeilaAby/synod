import { describe, expect, it } from 'vitest';

import {
  calculerAge,
  cleDoublon,
  compteDansLesEffectifs,
  composerMatricule,
  decomposerMatricule,
  estNouveauBaptise,
  initialesAvatar,
  initialesMatricule,
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
  it('compose <INITIALES>-<SEQUENCE 5>-<AA>', () => {
    expect(composerMatricule('NAKOU', 'Marc Kevin', 1, 2026)).toBe('NMK-00001-26');
  });

  it('decompose un matricule valide', () => {
    expect(decomposerMatricule('MNK-00001-26')).toEqual({
      initiales: 'MNK',
      sequence: 1,
      annee: 26,
    });
  });

  it('rejette un matricule mal forme', () => {
    for (const m of ['MNK-1-26', 'MNKL-00001-26', 'MNK-00001-2026', '']) {
      expect(decomposerMatricule(m), m).toBeNull();
    }
  });
});

describe('Initiales du matricule', () => {
  it('prend le nom puis les prenoms, dans l ordre de saisie', () => {
    expect(initialesMatricule('RAKOTONIRINA', 'Mamitiana Nantenaina')).toBe('RMN');
  });

  it('se limite a trois lettres', () => {
    expect(initialesMatricule('DUPONT', 'Jean Pierre Marie Louis')).toBe('DJP');
  });

  it('replie les accents sur leur lettre de base', () => {
    // Un matricule se saisit au clavier, parfois sans disposition francaise.
    expect(initialesMatricule('ÉLISE', 'Ève')).toBe('EE');
  });

  it('traite tout groupe de lettres comme un mot, quel que soit le séparateur', () => {
    // « N DIAYE » et « D'Artagnan » donnent N, D, D : espace, tiret et
    // apostrophe séparent de la même façon. Même règle que `fn_initiales`
    // en SQL, qui découpe aussi sur tout caractère non alphabétique.
    expect(initialesMatricule('N DIAYE', "D'Artagnan")).toBe('NDD');
    expect(initialesMatricule('Jean-Baptiste', 'Marie')).toBe('JBM');
  });

  it('ne rend jamais une chaine vide', () => {
    expect(initialesMatricule('123', '456')).toBe('XXX');
  });
});

describe('Affichage — le NOM precede les prenoms', () => {
  it('met le nom en capitales, devant', () => {
    expect(nomComplet('Rakotonirina', 'Mamitiana Nantenaina')).toBe(
      'RAKOTONIRINA Mamitiana Nantenaina',
    );
  });

  it('compose un avatar de deux lettres', () => {
    expect(initialesAvatar('Rakotonirina', 'Mamitiana')).toBe('RM');
    expect(initialesAvatar('Élise', 'Ève')).toBe('EE');
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


