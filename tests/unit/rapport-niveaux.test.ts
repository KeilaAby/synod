import { describe, expect, it } from 'vitest';

import { ENTITY_TYPES, type EntityType } from '@/lib/domain/hierarchy';
import { niveauxProposables, niveauxTenables } from '@/lib/domain/rapport';

/**
 * EF-RAP-10 — les niveaux auxquels une entite peut proposer son modele.
 *
 * L'ANOMALIE CORRIGEE (signalee le 20 aout 2026) : l'ecran offrait les SIX
 * niveaux a tout le monde, si bien qu'un district cochait « Siege » et
 * annoncait son modele a une entite hors de son perimetre. C'est la regle du
 * lot 6 — « une entite ne compose que pour elle-meme » — qui fuyait par une
 * autre porte.
 */

describe('niveauxProposables', () => {
  /**
   * LE SIEGE LES OBTIENT TOUS, non par exception mais par application : il est
   * au niveau 1, et tout est en dessous de lui.
   */
  it('rend les six niveaux au Siège', () => {
    expect(niveauxProposables('SIEGE')).toEqual([...ENTITY_TYPES]);
  });

  it('EF-RAP-10 — un district ne propose qu’à lui-même et à ce qui en dépend', () => {
    expect(niveauxProposables('DISTRICT')).toEqual([
      'DISTRICT',
      'PAROISSE',
      'EGLISE',
      'CELLULE',
    ]);
  });

  /** Une eglise se propose a elle-meme et a ses cellules, jamais au-dessus. */
  it('n’ouvre jamais un niveau SUPÉRIEUR à celui de l’auteur', () => {
    expect(niveauxProposables('EGLISE')).toEqual(['EGLISE', 'CELLULE']);
    expect(niveauxProposables('CELLULE')).toEqual(['CELLULE']);
  });

  it('inclut TOUJOURS son propre niveau', () => {
    for (const t of ENTITY_TYPES) {
      expect(niveauxProposables(t), t).toContain(t);
    }
  });

  /**
   * Mieux vaut ne rien proposer qu'ouvrir tout sur une valeur qu'on ne sait pas
   * lire : une liste vide se remarque, une liste complete passe inapercue.
   */
  it('rend une liste VIDE sur un niveau inconnu ou absent', () => {
    expect(niveauxProposables(null)).toEqual([]);
    expect(niveauxProposables(undefined)).toEqual([]);
    expect(niveauxProposables('INVENTE' as EntityType)).toEqual([]);
  });
});

describe('niveauxTenables', () => {
  it('accepte ce qui est à son niveau ou en dessous', () => {
    expect(niveauxTenables(['PAROISSE', 'EGLISE'], 'DISTRICT')).toBe(true);
    expect(niveauxTenables(['DISTRICT'], 'DISTRICT')).toBe(true);
  });

  it('EF-RAP-10 — REFUSE un niveau supérieur à celui de l’auteur', () => {
    expect(niveauxTenables(['SIEGE'], 'DISTRICT')).toBe(false);
    expect(niveauxTenables(['EGLISE', 'REGIONAL'], 'DISTRICT')).toBe(false);
  });

  /**
   * UNE LISTE VIDE EST TENABLE, et ce n'est pas un oubli : ne cocher aucun
   * niveau signifie « a tous ceux que je peux atteindre », pas « a personne ».
   * La RLS borne de toute facon la lecture au perimetre — ne rien restreindre
   * n'ouvre donc rien de plus.
   */
  it('accepte une liste vide : ne rien restreindre n’est pas tout ouvrir', () => {
    expect(niveauxTenables([], 'CELLULE')).toBe(true);
  });

  it('refuse tout quand le niveau de l’auteur est illisible', () => {
    expect(niveauxTenables(['EGLISE'], null)).toBe(false);
    expect(niveauxTenables([], null)).toBe(true);
  });
});
