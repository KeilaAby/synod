import { describe, expect, it } from 'vitest';

import {
  ENTITY_LEVELS,
  ENTITY_TYPES,
  PREFIXES_CODE,
  ancetreCommun,
  construireChemin,
  creeraitUnCycle,
  designerEntite,
  estAncetre,
  estDescendant,
  etiquetteLtree,
  gabaritCode,
  normaliserCode,
  peutAvoirUnCompte,
  peutEtreParent,
  profondeur,
  typeEnfantDe,
  typeParentDe,
  validerCode,
  validerDeplacement,
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

describe('EF-STR-02 — code attribue automatiquement par niveau', () => {
  // Le prefixe est DUPLIQUE en SQL (`fn_prefixe_entite`, migration 0013) parce
  // que seule la base peut garantir l'unicite de la sequence. Ce test fige la
  // table de correspondance : une divergence produirait des codes incoherents
  // selon le chemin de creation, et personne ne s'en apercevrait avant la
  // premiere collision.
  it('associe un prefixe distinct a chacun des six niveaux', () => {
    expect(PREFIXES_CODE).toEqual({
      SIEGE: 'SG',
      REGIONAL: 'REG',
      DISTRICT: 'DIS',
      PAROISSE: 'PAR',
      EGLISE: 'EGL',
      CELLULE: 'CEL',
    });

    const prefixes = Object.values(PREFIXES_CODE);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('annonce la forme du code a venir, sequence de 4 chiffres', () => {
    expect(gabaritCode('PAROISSE')).toBe('PAR-XXXX');
    expect(gabaritCode('SIEGE')).toBe('SG-XXXX');
  });

  it('produit des codes que `validerCode` accepte', () => {
    // Sans cette verification, un prefixe trop long ou mal forme ne serait
    // refuse qu'a la modification, une fois l'entite deja creee.
    for (const type of ENTITY_TYPES) {
      const code = `${PREFIXES_CODE[type]}-0001`;
      expect(validerCode(code), code).toMatchObject({ ok: true });
    }
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

describe('EF-STR-07 — deplacement dans l organigramme', () => {
  // siege(n1) > regional(n1.n2) > districtA(n1.n2.n3) > paroisse1(n1.n2.n3.n4)
  //                                                   > eglise1(n1.n2.n3.n4.n5)
  //                            > districtB(n1.n2.n7)
  const districtA = {
    id: 'a',
    nom: 'District A',
    type: 'DISTRICT' as const,
    path: 'n1.n2.n3',
    parentId: 'reg',
  };
  const districtB = {
    id: 'b',
    nom: 'District B',
    type: 'DISTRICT' as const,
    path: 'n1.n2.n7',
    parentId: 'reg',
  };
  const paroisse1 = {
    id: 'p1',
    nom: 'Paroisse 1',
    type: 'PAROISSE' as const,
    path: 'n1.n2.n3.n4',
    parentId: 'a',
  };
  const eglise1 = {
    id: 'e1',
    nom: 'Eglise 1',
    type: 'EGLISE' as const,
    path: 'n1.n2.n3.n4.n5',
    parentId: 'p1',
  };

  it('accepte un deplacement vers un parent de niveau valide', () => {
    expect(validerDeplacement(paroisse1, districtB).ok).toBe(true);
  });

  it('refuse un saut de niveau : une Eglise directement sous un District', () => {
    const resultat = validerDeplacement(eglise1, districtB);
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.error).toContain('Paroisse');
  });

  it('refuse un rattachement a soi-meme', () => {
    const resultat = validerDeplacement(paroisse1, paroisse1);
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.error).toContain('elle-meme');
  });

  it('refuse un deplacement vers le parent actuel', () => {
    const resultat = validerDeplacement(paroisse1, districtA);
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.error).toContain('deja rattachee');
  });

  it('refuse un cycle : deplacer une branche sous l un de ses descendants', () => {
    // Meme niveau valide, mais paroisse1 est dans le sous-arbre de districtA :
    // le rattachement detacherait tout le sous-arbre de la racine.
    const paroisseCible = { ...paroisse1, type: 'DISTRICT' as const };
    const districtDeplace = { ...districtA, parentId: 'autre' };
    const resultat = validerDeplacement(
      { ...districtDeplace, type: 'PAROISSE' as const },
      { ...paroisseCible, type: 'DISTRICT' as const, id: 'p1' },
    );
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.error).toContain('cycle');
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

describe("Designer une entite en francais — EF-CRO-06, EF-BUR-10", () => {
  it('contracte l article selon le GENRE du niveau', () => {
    // « Membre de bureau de District AVARADRANO » n'est pas une phrase.
    expect(designerEntite('DISTRICT', 'AVARADRANO', 'de')).toBe('du District AVARADRANO');
    expect(designerEntite('PAROISSE', 'EBENEZER', 'de')).toBe('de la Paroisse EBENEZER');
  });

  it('ELIDE devant une voyelle, sans seconde table a tenir', () => {
    // L'elision se deduit du libelle : deux tables a tenir d'accord finissent
    // toujours par se contredire.
    expect(designerEntite('EGLISE', 'ANTSAHATSIRESY', 'a')).toBe(
      "a l'Eglise ANTSAHATSIRESY",
    );
    expect(designerEntite('EGLISE', 'ANTSAHATSIRESY', 'de')).toBe(
      "de l'Eglise ANTSAHATSIRESY",
    );
  });

  it('accorde aussi la preposition « a »', () => {
    expect(designerEntite('DISTRICT', 'AVARADRANO', 'a')).toBe('au District AVARADRANO');
    expect(designerEntite('CELLULE', 'SHALOM', 'a')).toBe(
      'a la Cellule de priere SHALOM',
    );
  });

  it('couvre les six niveaux sans produire d article vide', () => {
    for (const type of ENTITY_TYPES) {
      const texte = designerEntite(type, 'X', 'de');
      expect(texte).toMatch(/^(du |de la |de l')/);
      expect(texte.endsWith(' X')).toBe(true);
    }
  });
});
