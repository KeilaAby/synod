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

/**
 * EF-ADM-11 — le formulaire, le schema et l'ECRITURE disent la meme chose.
 *
 * Le defaut du 20 aout 2026 : quatre champs ont ete ajoutes au schema et au
 * formulaire, mais l'objet passe a `.update()` ne les reprenait pas.
 * L'enregistrement reussissait donc SANS RIEN CHANGER — la panne la plus
 * ingrate, parce qu'elle ne se signale nulle part.
 *
 * Le typecheck ne pouvait pas la voir : l'objet donne a `.update()` n'est pas
 * type contre la table. C'est le pendant exact de la regle 19 — une action qui
 * n'ecrit pas un champ dont son formulaire est la source.
 */
describe('EF-ADM-11 — aucun parametre validé ne reste non écrit', () => {
  it('reprend dans l action CHAQUE champ du schema', async () => {
    const { readFile } = await import('node:fs/promises');
    const { parametresSchema } = await import('@/lib/validation/parametres');

    const source = await readFile(
      new URL('../../lib/actions/parametres.ts', import.meta.url),
      'utf8',
    );

    const champs = Object.keys(parametresSchema.shape);

    // Au moins autant de champs que ce qu'on connait : si le schema se vide
    // par accident, le test passerait sans rien verifier.
    expect(champs.length).toBeGreaterThanOrEqual(13);

    for (const champ of champs) {
      expect(
        source.includes(`valeurs.${champ}`),
        `le parametre « ${champ} » est validé mais jamais écrit`,
      ).toBe(true);
    }
  });
});
