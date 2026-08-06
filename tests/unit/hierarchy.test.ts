import { describe, expect, it } from 'vitest';

import {
  ENTITY_LEVELS,
  ENTITY_TYPES,
  ancetreCommun,
  construireChemin,
  creeraitUnCycle,
  estAncetre,
  estDescendant,
  etiquetteLtree,
  normaliserCode,
  peutAvoirUnCompte,
  peutEtreParent,
  profondeur,
  typeEnfantDe,
  typeParentDe,
  validerCode,
  validerRattachement,
} from '@/lib/domain/hierarchy';

/**
 * CA-02 — chaque regle de gestion est couverte par un test nomme et tracable.
 * L'intitule porte le code de la regle : la couverture est verifiable en recette.
 */

describe('RG-01 — hierarchie strictement ordonnee, aucun saut de niveau', () => {
  it('ordonne les six niveaux du Siege a la Cellule', () => {
    expect(ENTITY_TYPES).toEqual([
      'SIEGE',
      'REGIONAL',
      'DISTRICT',
      'PAROISSE',
      'EGLISE',
      'CELLULE',
    ]);
    expect(ENTITY_LEVELS.SIEGE).toBe(1);
    expect(ENTITY_LEVELS.CELLULE).toBe(6);
  });

  it('designe le parent attendu de chaque niveau', () => {
    expect(typeParentDe('SIEGE')).toBeNull();
    expect(typeParentDe('REGIONAL')).toBe('SIEGE');
    expect(typeParentDe('DISTRICT')).toBe('REGIONAL');
    expect(typeParentDe('PAROISSE')).toBe('DISTRICT');
    expect(typeParentDe('EGLISE')).toBe('PAROISSE');
    expect(typeParentDe('CELLULE')).toBe('EGLISE');
  });

  it('designe l enfant attendu, la Cellule etant une feuille', () => {
    expect(typeEnfantDe('SIEGE')).toBe('REGIONAL');
    expect(typeEnfantDe('EGLISE')).toBe('CELLULE');
    expect(typeEnfantDe('CELLULE')).toBeNull();
  });

  it('accepte un rattachement au niveau immediatement superieur', () => {
    expect(peutEtreParent('PAROISSE', 'EGLISE')).toBe(true);
    expect(validerRattachement('EGLISE', 'PAROISSE').ok).toBe(true);
  });

  it('refuse un saut de niveau : une Eglise sous un District', () => {
    expect(peutEtreParent('DISTRICT', 'EGLISE')).toBe(false);

    const resultat = validerRattachement('EGLISE', 'DISTRICT');
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.error).toContain('Paroisse');
      expect(resultat.error).toContain('District');
    }
  });

  it('refuse un rattachement inverse : une Paroisse sous une Eglise', () => {
    expect(peutEtreParent('EGLISE', 'PAROISSE')).toBe(false);
    expect(validerRattachement('PAROISSE', 'EGLISE').ok).toBe(false);
  });

  it('refuse une entite non racine depourvue de parent', () => {
    const resultat = validerRattachement('REGIONAL', null);
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.error).toContain('Siege');
  });
});

describe('RG-03 — le Siege est la racine unique', () => {
  it('accepte un Siege sans parent', () => {
    expect(validerRattachement('SIEGE', null).ok).toBe(true);
  });

  it('refuse un Siege dote d un parent', () => {
    const resultat = validerRattachement('SIEGE', 'REGIONAL');
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.error).toContain('racine');
  });
});

describe('RG-21 — une Cellule ne dispose jamais d un compte', () => {
  it('exclut la Cellule et n exclut aucun autre niveau', () => {
    expect(peutAvoirUnCompte('CELLULE')).toBe(false);
    expect(peutAvoirUnCompte('EGLISE')).toBe(true);
    expect(peutAvoirUnCompte('SIEGE')).toBe(true);
  });
});

describe('RG-02 — code d au moins 3 caracteres, normalise', () => {
  it('met le code en majuscules et supprime les espaces de bord', () => {
    expect(normaliserCode('  egl-cot ')).toBe('EGL-COT');
  });

  it('accepte un code conforme', () => {
    const resultat = validerCode('egl-cot');
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.data).toBe('EGL-COT');
  });

  it('refuse un code de moins de 3 caracteres', () => {
    expect(validerCode('AB').ok).toBe(false);
  });

  it('refuse un code de plus de 16 caracteres', () => {
    expect(validerCode('A'.repeat(17)).ok).toBe(false);
  });

  it('refuse les caracteres non autorises', () => {
    expect(validerCode('EGL_COT').ok).toBe(false);
    expect(validerCode('EGL COT').ok).toBe(false);
    expect(validerCode('EGL.COT').ok).toBe(false);
  });

  it('refuse un code commencant par un tiret', () => {
    expect(validerCode('-EGL').ok).toBe(false);
  });
});

describe('DA-2 — chemins materialises ltree', () => {
  const siege = '11111111-1111-1111-1111-111111111111';
  const regional = '22222222-2222-2222-2222-222222222222';
  const district = '33333333-3333-3333-3333-333333333333';

  const cheminSiege = construireChemin(null, siege);
  const cheminRegional = construireChemin(cheminSiege, regional);
  const cheminDistrict = construireChemin(cheminRegional, district);

  it('produit une etiquette ltree valide a partir d un uuid', () => {
    // Prefixe + tirets remplaces : conforme au jeu de caracteres ltree.
    expect(etiquetteLtree(siege)).toBe('n11111111_1111_1111_1111_111111111111');
    expect(etiquetteLtree(siege)).toMatch(/^[A-Za-z0-9_]+$/);
  });

  it('empile les etiquettes de la racine vers la feuille', () => {
    expect(profondeur(cheminSiege)).toBe(1);
    expect(profondeur(cheminRegional)).toBe(2);
    expect(profondeur(cheminDistrict)).toBe(3);
  });

  it('reproduit l operateur SQL <@ : une entite est son propre descendant', () => {
    expect(estDescendant(cheminSiege, cheminSiege)).toBe(true);
    expect(estDescendant(cheminDistrict, cheminSiege)).toBe(true);
    expect(estDescendant(cheminSiege, cheminDistrict)).toBe(false);
  });

  it('ne confond pas deux chemins partageant un prefixe textuel', () => {
    // Sans le point separateur, "n1.n22" serait vu comme descendant de "n1.n2".
    expect(estDescendant('n1.n22', 'n1.n2')).toBe(false);
    expect(estDescendant('n1.n2.n3', 'n1.n2')).toBe(true);
  });

  it('retourne faux pour un perimetre absent — fermeture par defaut', () => {
    expect(estDescendant(cheminDistrict, null)).toBe(false);
    expect(estDescendant('', cheminSiege)).toBe(false);
  });

  it('expose la relation inverse', () => {
    expect(estAncetre(cheminSiege, cheminDistrict)).toBe(true);
    expect(estAncetre(cheminDistrict, cheminSiege)).toBe(false);
  });
});

describe('RG-12 — plus petit ancetre commun, borne des approbateurs', () => {
  it('retourne la branche commune de deux chemins', () => {
    expect(ancetreCommun('n1.n2.n3.n4', 'n1.n2.n9.n8')).toBe('n1.n2');
  });

  it('retourne le chemin lui-meme quand l un contient l autre', () => {
    expect(ancetreCommun('n1.n2', 'n1.n2.n3')).toBe('n1.n2');
  });

  it('retourne null quand les deux chemins n ont aucune racine commune', () => {
    expect(ancetreCommun('n1.n2', 'n9.n8')).toBeNull();
  });
});

describe('EF-STR-07 — un rattachement ne doit jamais creer de cycle', () => {
  it('refuse de rattacher une entite sous l un de ses descendants', () => {
    expect(creeraitUnCycle('n1.n2', 'n1.n2.n3')).toBe(true);
  });

  it('refuse de rattacher une entite sous elle-meme', () => {
    expect(creeraitUnCycle('n1.n2', 'n1.n2')).toBe(true);
  });

  it('accepte un rattachement vers une autre branche', () => {
    expect(creeraitUnCycle('n1.n2', 'n1.n9')).toBe(false);
  });
});
