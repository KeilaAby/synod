import { describe, expect, it } from 'vitest';

import { type LargeurBloc, type TypeBloc } from '@/lib/domain/rapport';
import { contenuExemple } from '@/lib/domain/rapport-exemple';

/**
 * EF-RAP-05 — les donnees d'exemple de l'apercu.
 */

function bloc(id: string, type: TypeBloc, reglages: Record<string, unknown> = {}) {
  return { id, type, largeur: 'PLEINE' as LargeurBloc, reglages };
}

describe('EF-RAP-05 — les donnees d exemple', () => {
  it('est DETERMINISTE — deux lectures du meme bloc donnent la meme chose', () => {
    /**
     * Un apercu qui changerait de chiffres a chaque frappe donnerait
     * l'impression que les donnees bougent, et rendrait toute comparaison
     * impossible. La valeur derive de l'IDENTIFIANT, jamais d'un tirage.
     */
    expect(contenuExemple(bloc('b1', 'INDICATEUR'))).toEqual(
      contenuExemple(bloc('b1', 'INDICATEUR')),
    );
  });

  it('DISTINGUE deux blocs — trois indicateurs cote a cote ne se repetent pas', () => {
    const a = contenuExemple(bloc('b1', 'INDICATEUR'));
    const b = contenuExemple(bloc('b2', 'INDICATEUR'));

    expect(a).not.toEqual(b);
  });

  it('suit la SOURCE du bloc, pas seulement son type (EF-RAP-03)', () => {
    // Un tableau de finances ne montre pas les colonnes d'un tableau de
    // croyants : c'est la source qui decide de ce qu'on voit.
    const croyants = contenuExemple(bloc('b1', 'TABLEAU'));
    const finances = contenuExemple(bloc('b1', 'TABLEAU', { source: 'FINANCES' }));

    expect(croyants).not.toEqual(finances);
    expect(finances).toMatchObject({ genre: 'TABLEAU' });
    if (finances?.genre === 'TABLEAU') {
      expect(finances.colonnes).toContain('Montant');
    }
  });

  it('ne simule RIEN pour un bloc de mise en page', () => {
    // Ils n'interrogent aucune source : il n'y a rien a simuler, et un cadre
    // de donnees pose sous un titre serait un bloc de plus a l'ecran.
    expect(contenuExemple(bloc('b', 'TITRE'))).toBeNull();
    expect(contenuExemple(bloc('b', 'TEXTE'))).toBeNull();
    expect(contenuExemple(bloc('b', 'SAUT_DE_PAGE'))).toBeNull();
    expect(contenuExemple(bloc('b', 'SIGNATURE'))).toBeNull();
    expect(contenuExemple(bloc('b', 'IMAGE'))).toBeNull();
  });

  it('rend un contenu pour CHAQUE bloc de donnees', () => {
    // Un type de donnees oublie ici afficherait un cadre vide dans l'apercu,
    // et l'auteur croirait son bloc mal reglé.
    for (const type of [
      'INDICATEUR',
      'TABLEAU',
      'GRAPHIQUE',
      'JAUGE',
      'FRISE',
      'ORGANIGRAMME',
    ] as const) {
      expect(contenuExemple(bloc('b', type)), type).not.toBeNull();
    }
  });

  it('ne rend JAMAIS une jauge pleine ni une barre a zero', () => {
    /**
     * Une jauge a 100 % ne montre pas ce qu'une jauge sait faire, et une barre
     * a zero ressemble a une donnee manquante plutot qu'a un exemple. L'apercu
     * sert a juger une FORME : elle doit se voir.
     */
    for (let i = 0; i < 50; i += 1) {
      const jauge = contenuExemple(bloc(`j${i}`, 'JAUGE'));
      if (jauge?.genre === 'JAUGE') {
        expect(jauge.atteint).toBeGreaterThan(0);
        expect(jauge.atteint).toBeLessThan(jauge.total);
      }

      const serie = contenuExemple(bloc(`g${i}`, 'GRAPHIQUE'));
      if (serie?.genre === 'SERIE') {
        expect(Math.min(...serie.valeurs)).toBeGreaterThan(0);
        expect(serie.valeurs).toHaveLength(serie.libelles.length);
      }
    }
  });
});
