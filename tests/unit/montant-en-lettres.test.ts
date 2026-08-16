import { describe, expect, it } from 'vitest';

import { montantEnLettres, nombreEnLettres } from '@/lib/domain/montant-en-lettres';

/**
 * EF-FIN-27 — le montant en toutes lettres du recu de dime.
 *
 * « 12 000 » devient « 112 000 » d'un trait de stylo ; « douze mille ariary »
 * ne se rallonge pas. C'est la seule raison d'etre de ces fonctions, et elle
 * justifie qu'on verifie les accords : le recu est le document que le croyant
 * garde, et une faute y est vue par tout le monde.
 */
describe('EF-FIN-27 — le nombre en toutes lettres', () => {
  it('dit les petits nombres et les irregularites du francais', () => {
    expect(nombreEnLettres(0)).toBe('zéro');
    expect(nombreEnLettres(16)).toBe('seize');
    expect(nombreEnLettres(17)).toBe('dix-sept');
    expect(nombreEnLettres(21)).toBe('vingt et un');
    expect(nombreEnLettres(22)).toBe('vingt-deux');
  });

  it('dit 70 et 90 sur la dizaine precedente', () => {
    // La seule irregularite vraiment structurelle : « soixante-dix » et
    // « quatre-vingt-dix » comptent au-dela de dix sur la dizaine d'avant.
    expect(nombreEnLettres(70)).toBe('soixante-dix');
    expect(nombreEnLettres(71)).toBe('soixante et onze');
    expect(nombreEnLettres(79)).toBe('soixante-dix-neuf');
    expect(nombreEnLettres(90)).toBe('quatre-vingt-dix');
    expect(nombreEnLettres(91)).toBe('quatre-vingt-onze');
  });

  it('n accorde « quatre-vingts » que lorsque rien ne suit', () => {
    expect(nombreEnLettres(80)).toBe('quatre-vingts');
    // « quatre-vingt-un » n'a pas de « et », contrairement a « vingt et un ».
    expect(nombreEnLettres(81)).toBe('quatre-vingt-un');
    expect(nombreEnLettres(180)).toBe('cent quatre-vingts');
    // Devant `mille`, le s tombe.
    expect(nombreEnLettres(80_000)).toBe('quatre-vingt mille');
  });

  it('n accorde « cent » que lorsque rien ne suit', () => {
    expect(nombreEnLettres(100)).toBe('cent');
    expect(nombreEnLettres(200)).toBe('deux cents');
    // Le s tombe des que quelque chose suit — un chiffre comme une echelle.
    expect(nombreEnLettres(201)).toBe('deux cent un');
    expect(nombreEnLettres(200_000)).toBe('deux cent mille');
    // …sauf devant `million`, qui est un nom et non un numeral.
    expect(nombreEnLettres(200_000_000)).toBe('deux cents millions');
  });

  it('ne compte pas « mille », mais compte les millions', () => {
    // On ne dit pas « un mille ».
    expect(nombreEnLettres(1_000)).toBe('mille');
    expect(nombreEnLettres(2_000)).toBe('deux mille');
    expect(nombreEnLettres(1_000_000)).toBe('un million');
    expect(nombreEnLettres(2_000_000)).toBe('deux millions');
    expect(nombreEnLettres(1_000_000_000)).toBe('un milliard');
  });

  it('saute les tranches vides sans laisser d espace en trop', () => {
    // 1 000 001 : la tranche des milliers est nulle et ne se dit pas.
    expect(nombreEnLettres(1_000_001)).toBe('un million un');
    expect(nombreEnLettres(15_000_000)).toBe('quinze millions');
  });

  it('dit un montant de collecte reel', () => {
    expect(nombreEnLettres(12_000)).toBe('douze mille');
    expect(nombreEnLettres(1_275_500)).toBe(
      'un million deux cent soixante-quinze mille cinq cents',
    );
  });

  it('rend une chaine vide plutot qu une lecture fausse', () => {
    /**
     * Un recu n'a pas a inventer une lecture de `NaN` : il vaut mieux qu'il
     * n'en porte aucune que d'en porter une fausse.
     */
    expect(nombreEnLettres(Number.NaN)).toBe('');
    expect(nombreEnLettres(-1)).toBe('');
    expect(nombreEnLettres(1e15)).toBe('');
  });
});

describe('EF-FIN-27 — le montant d un recu', () => {
  it('nomme la monnaie au pluriel', () => {
    expect(montantEnLettres(12_000, 'MGA')).toBe('douze mille ariary');
    expect(montantEnLettres(21, 'EUR')).toBe('vingt et un euros');
  });

  it('retombe sur le code ISO d une monnaie inconnue', () => {
    // « 12 000 XYZ » reste juste ; c'est seulement moins bien dit, et mieux
    // qu'une monnaie inventee.
    expect(montantEnLettres(12_000, 'XYZ')).toBe('douze mille XYZ');
  });

  it('tait les centimes quand il n y en a pas', () => {
    /**
     * L'ariary n'a pas de subdivision en usage : « et zero centime » serait
     * une precision que personne n'attend et qui ferait douter du reste.
     */
    expect(montantEnLettres(12_000.0, 'MGA')).toBe('douze mille ariary');
  });

  it('dit les centimes quand il y en a', () => {
    expect(montantEnLettres(12.5, 'EUR')).toBe('douze euros et cinquante centimes');
    expect(montantEnLettres(12.01, 'EUR')).toBe('douze euros et un centime');
  });
});
