import { describe, expect, it } from 'vitest';

import { ENTITY_LEVELS } from '@/lib/domain/hierarchy';
import {
  NIVEAU_REPLI_PAR_DEFAUT,
  type NoeudRepliable,
  replisParDefaut,
} from '@/lib/domain/organigramme';

/**
 * EF-STR-04 — repli par defaut de l'organigramme.
 *
 * Le comportement depend du perimetre du compte : une regle unique appliquee
 * sans discernement afficherait un ecran vide a un administrateur de Regional.
 */

function n(id: string, type: keyof typeof ENTITY_LEVELS, nbEnfants: number): NoeudRepliable {
  return { id, niveau: ENTITY_LEVELS[type], nbEnfants };
}

describe('Repli par defaut au niveau Regional', () => {
  it('replie les Regionaux vus depuis le Siege', () => {
    const arbre = [
      n('siege', 'SIEGE', 2),
      n('reg1', 'REGIONAL', 3),
      n('reg2', 'REGIONAL', 1),
      n('dis1', 'DISTRICT', 2),
    ];

    const replies = replisParDefaut(arbre);

    // Le Siege reste deploye : c'est la racine du perimetre.
    expect(replies.has('siege')).toBe(false);
    expect(replies.has('reg1')).toBe(true);
    expect(replies.has('reg2')).toBe(true);
  });

  it('replie aussi les niveaux plus profonds : chaque depliage ne revele qu un niveau', () => {
    const arbre = [
      n('siege', 'SIEGE', 1),
      n('reg', 'REGIONAL', 1),
      n('dis', 'DISTRICT', 1),
      n('par', 'PAROISSE', 1),
    ];

    const replies = replisParDefaut(arbre);
    expect(replies.has('dis')).toBe(true);
    expect(replies.has('par')).toBe(true);
  });

  it('ne replie jamais la racine du perimetre — sinon la page paraitrait vide', () => {
    // Perimetre d'un administrateur de Regional : sa propre entite est racine.
    const arbre = [
      n('reg', 'REGIONAL', 2),
      n('disA', 'DISTRICT', 1),
      n('disB', 'DISTRICT', 0),
    ];

    const replies = replisParDefaut(arbre);
    expect(replies.has('reg')).toBe(false);
    expect(replies.has('disA')).toBe(true);
  });

  it('deploie l arbre d un perimetre demarrant sous le seuil', () => {
    // Administrateur de District : rien n'est plus haut que sa racine, donc
    // seuls ses descendants ayant des enfants sont replies.
    const arbre = [
      n('dis', 'DISTRICT', 1),
      n('par', 'PAROISSE', 1),
      n('egl', 'EGLISE', 0),
    ];

    const replies = replisParDefaut(arbre);
    expect(replies.has('dis')).toBe(false);
    expect(replies.has('par')).toBe(true);
    expect(replies.has('egl')).toBe(false); // aucune branche a replier
  });

  it('ne replie pas une entite sans enfant', () => {
    const arbre = [n('siege', 'SIEGE', 1), n('reg', 'REGIONAL', 0)];
    expect(replisParDefaut(arbre).has('reg')).toBe(false);
  });

  it('tolere un arbre vide', () => {
    expect(replisParDefaut([]).size).toBe(0);
  });

  it('accepte un autre niveau de repli', () => {
    const arbre = [
      n('siege', 'SIEGE', 1),
      n('reg', 'REGIONAL', 1),
      n('dis', 'DISTRICT', 1),
    ];

    // Repli au District : les Regionaux restent deployes.
    const replies = replisParDefaut(arbre, 'DISTRICT');
    expect(replies.has('reg')).toBe(false);
    expect(replies.has('dis')).toBe(true);
  });

  it('retient bien le Regional comme seuil par defaut', () => {
    expect(NIVEAU_REPLI_PAR_DEFAUT).toBe('REGIONAL');
  });
});
