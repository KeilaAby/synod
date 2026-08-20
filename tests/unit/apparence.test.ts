import { describe, expect, it } from 'vitest';

import {
  DUREE_TOAST_MAX,
  DUREE_TOAST_MIN,
  bornerDuree,
  estCouleurHex,
  texteSurCouleur,
} from '@/lib/domain/apparence';

/**
 * EF-ADM-13 — l'apparence se regle, et le contraste ne se saisit pas.
 */
describe('Couleur des boutons', () => {
  it('n accepte qu un hexadecimal a six chiffres', () => {
    expect(estCouleurHex('#0f172a')).toBe(true);
    expect(estCouleurHex('#FFFFFF')).toBe(true);

    // Ce qui passerait tel quel dans un attribut `style` si on ne bornait pas.
    expect(estCouleurHex('red')).toBe(false);
    expect(estCouleurHex('#fff')).toBe(false);
    expect(estCouleurHex('#0f172a; background:url(x)')).toBe(false);
    expect(estCouleurHex('')).toBe(false);
  });

  it('met du BLANC sur un fond sombre, du NOIR sur un fond clair', () => {
    expect(texteSurCouleur('#0f172a')).toBe('#ffffff');
    expect(texteSurCouleur('#000000')).toBe('#ffffff');
    expect(texteSurCouleur('#ffffff')).toBe('#0f172a');
    expect(texteSurCouleur('#f8fafc')).toBe('#0f172a');
  });

  it('pese le VERT plus que le bleu — une moyenne simple se tromperait', () => {
    /**
     * Le cas qui justifie la formule de luminance : le jaune vif et le bleu vif
     * ont la meme moyenne arithmetique de canaux, et l'oeil les voit
     * radicalement differemment. Une moyenne donnerait du blanc sur le jaune.
     */
    expect(texteSurCouleur('#ffff00')).toBe('#0f172a'); // jaune : clair
    expect(texteSurCouleur('#0000ff')).toBe('#ffffff'); // bleu : sombre
  });

  it('retombe sur le blanc plutot que de lever, si la couleur est invalide', () => {
    // Une valeur invalide ne doit pas casser le rendu d'un bouton : elle est
    // deja refusee en amont, ceci n'est que le dernier filet.
    expect(texteSurCouleur('rouge')).toBe('#ffffff');
  });
});

describe('Duree des notifications', () => {
  it('borne des deux cotes : illisible en deca, empile au-dela', () => {
    expect(bornerDuree(500)).toBe(DUREE_TOAST_MIN);
    expect(bornerDuree(90_000)).toBe(DUREE_TOAST_MAX);
    expect(bornerDuree(5000)).toBe(5000);
  });

  it('retombe sur le defaut devant une valeur qui n en est pas une', () => {
    // `Number('abc')` donne NaN, et un NaN pousse dans Sonner ferait disparaitre
    // la notification instantanement — donc jamais lue.
    expect(bornerDuree(Number.NaN)).toBe(4000);
    expect(bornerDuree(Number.POSITIVE_INFINITY)).toBe(4000);
  });
});
