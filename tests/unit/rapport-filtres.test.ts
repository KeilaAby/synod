import { describe, expect, it } from 'vitest';

import {
  type BlocRapport,
  FILTRES_SOURCE,
  SOURCES,
  compteFiltres,
  filtresDuBloc,
  filtresPoses,
  mentionFiltres,
} from '@/lib/domain/rapport';

/**
 * EF-RAP-03 — les filtres d'un bloc.
 *
 * LE POINT SENSIBLE EST L'ABSENCE : un modele ecrit avant cette version n'a
 * aucun filtre, et doit continuer a rendre exactement ce qu'il rendait. Un
 * filtre mal lu qui viderait un tableau se lirait « il n'y a rien » (regle 15).
 */

function bloc(reglages: Record<string, unknown> = {}): BlocRapport {
  return { id: 'b1', type: 'TABLEAU', largeur: 'PLEINE', reglages };
}

describe('FILTRES_SOURCE', () => {
  it('couvre les six sources, meme quand la liste est vide', () => {
    for (const s of SOURCES) {
      expect(FILTRES_SOURCE[s], s).toBeDefined();
    }
  });

  /**
   * Regle 18 — que des ensembles CLOS ET CONNUS. Un filtre sans option serait
   * un menu vide ; une option sans libelle, un choix qu'on ne peut pas lire.
   */
  it('declare au moins une option lisible par filtre', () => {
    for (const s of SOURCES) {
      for (const f of FILTRES_SOURCE[s]) {
        expect(f.options.length, `${s}.${f.cle}`).toBeGreaterThan(0);
        for (const o of f.options) {
          expect(o.label.trim(), `${s}.${f.cle}`).not.toBe('');
        }
      }
    }
  });
});

describe('filtresDuBloc', () => {
  it('propose ceux de la source du bloc', () => {
    const cles = filtresDuBloc(bloc({ source: 'CROYANTS' })).map((f) => f.cle);
    expect(cles).toContain('sexe');
    expect(cles).toContain('statut');
  });

  it('ne propose rien a un bloc sans source', () => {
    const texte: BlocRapport = { id: 'b', type: 'TEXTE', largeur: 'PLEINE', reglages: {} };
    expect(filtresDuBloc(texte)).toEqual([]);
  });
});

describe('filtresPoses', () => {
  /** L'ABSENCE VAUT « TOUT ». Un modele ancien ne doit rien perdre. */
  it('rend un objet vide quand le bloc n’a aucun filtre', () => {
    expect(filtresPoses(bloc({ source: 'CROYANTS' }))).toEqual({});
    expect(compteFiltres(bloc({ source: 'CROYANTS' }))).toBe(0);
  });

  it('retient un filtre declare, avec une valeur declaree', () => {
    const b = bloc({ source: 'CROYANTS', filtres: { sexe: 'F' } });
    expect(filtresPoses(b)).toEqual({ sexe: 'F' });
    expect(compteFiltres(b)).toBe(1);
  });

  /**
   * UN FILTRE ORPHELIN NE RESTREINT PAS. Changer la source d'un bloc laisserait
   * sinon un filtre que plus aucun ecran n'affiche — et qui viderait le tableau
   * sans que rien ne l'explique.
   */
  it('ECARTE un filtre que la source ne connait pas', () => {
    const b = bloc({ source: 'FINANCES', filtres: { sexe: 'F', sens: 'DEPENSE' } });
    expect(filtresPoses(b)).toEqual({ sens: 'DEPENSE' });
  });

  /** Une valeur inventee est ignoree, pas appliquee : elle ne filtrerait rien. */
  it('ECARTE une valeur absente des options', () => {
    const b = bloc({ source: 'CROYANTS', filtres: { sexe: 'X' } });
    expect(filtresPoses(b)).toEqual({});
  });

  it('supporte un reglage `filtres` qui n’est pas un objet', () => {
    expect(filtresPoses(bloc({ source: 'CROYANTS', filtres: 'oui' }))).toEqual({});
    expect(filtresPoses(bloc({ source: 'CROYANTS', filtres: null }))).toEqual({});
  });
});

describe('mentionFiltres', () => {
  /**
   * UN FILTRE QUI NE SE VOIT PAS EST PIRE QUE PAS DE FILTRE : sur une feuille
   * imprimee, personne ne peut ouvrir les reglages pour comprendre pourquoi le
   * total ne correspond pas.
   */
  it('dit en toutes lettres ce que le bloc a retenu', () => {
    const b = bloc({ source: 'CROYANTS', filtres: { sexe: 'F', statut: 'ACTIF' } });
    expect(mentionFiltres(b)).toBe('Femmes · Actifs');
  });

  it('se tait quand rien n’est filtre', () => {
    expect(mentionFiltres(bloc({ source: 'CROYANTS' }))).toBeNull();
  });
});
