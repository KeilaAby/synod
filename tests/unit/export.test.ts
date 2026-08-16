import { describe, expect, it } from 'vitest';

import { BOM_UTF8, ecrireCsv, lireCsv } from '@/lib/domain/csv';
import { lireXlsx } from '@/lib/domain/xlsx';
import { ecrireXlsx, referenceColonne } from '@/lib/domain/xlsx-ecriture';

/**
 * EF-FIN-25 — exporter mouvements et syntheses.
 *
 * Les deux ecritures sont sans dependance, comme les lectures : un `.xlsx` est
 * une archive ZIP de quelques fichiers XML, et l'ecrire en STORED ne demande
 * qu'un CRC32 (regle 29).
 */
describe('EF-FIN-25 — le CSV', () => {
  it('separe au POINT-VIRGULE', () => {
    /**
     * Excel choisit son separateur d'apres la langue de l'installation, et en
     * francais c'est le point-virgule : un fichier a la virgule s'y ouvre en
     * UNE colonne, ce que l'utilisateur lit comme un export casse.
     */
    expect(ecrireCsv([['a', 'b']])).toBe('a;b');
  });

  it('ne cite QUE ce qui l exige', () => {
    // Un fichier tout entre guillemets se lit mal a l'oeil, et l'oeil est le
    // premier outil de verification d'un export.
    expect(ecrireCsv([['simple', 'avec;separateur']])).toBe('simple;"avec;separateur"');
    expect(ecrireCsv([['sans guillemet']])).toBe('sans guillemet');
  });

  it('DOUBLE le guillemet, il ne l echappe pas', () => {
    // C'est la convention du format (RFC 4180), et la seule que les tableurs
    // comprennent : une contre-oblique resterait dans la cellule.
    expect(ecrireCsv([['il a dit "oui"']])).toBe('"il a dit ""oui"""');
  });

  it('cite un champ contenant un saut de ligne', () => {
    expect(ecrireCsv([['deux\nlignes']])).toBe('"deux\nlignes"');
  });

  it('se relit lui-meme', () => {
    /**
     * L'aller-retour est le vrai test : un ecrivain qui se relit ne peut pas
     * avoir invente une convention que personne d'autre ne suit.
     */
    const source = [
      ['Date', 'Libelle', 'Montant'],
      ['2026-08-16', 'Offrande; dominicale', '100000'],
      ['2026-08-17', 'Il a dit "merci"', '250000'],
    ];

    expect(lireCsv(ecrireCsv(source))).toEqual(source);
  });

  it('porte une marque d ordre des octets pour Excel', () => {
    // Sans elle, « Andrianjafy Ratsimbazafy » perd ses accents et le fichier
    // se lit en latin-1.
    expect(BOM_UTF8).toBe('﻿');
    expect(BOM_UTF8.length).toBe(1);
  });
});

describe('EF-FIN-25 — le classeur XLSX', () => {
  it('numerote les colonnes en base 26 bijective', () => {
    expect(referenceColonne(0)).toBe('A');
    expect(referenceColonne(25)).toBe('Z');
    // 26 n'est pas « BA » : Excel n'a pas de chiffre zero dans cette base.
    expect(referenceColonne(26)).toBe('AA');
    expect(referenceColonne(27)).toBe('AB');
    expect(referenceColonne(51)).toBe('AZ');
    expect(referenceColonne(52)).toBe('BA');
  });

  it('produit une archive ZIP', async () => {
    const octets = ecrireXlsx([['a']]);
    // « PK\x03\x04 » — la signature d'une entree locale.
    expect([...octets.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('SE RELIT AVEC NOTRE PROPRE LECTEUR', async () => {
    /**
     * L'aller-retour est ce qui rend cet ecrivain verifiable sans Excel : le
     * lecteur du projet applique la specification, pas les conventions de
     * l'ecrivain. S'ils se comprennent, c'est que le fichier est conforme.
     */
    const source = [
      ['Date', 'Entite', 'Libelle', 'Montant'],
      ['2026-08-16', 'Antsahatsiresy', 'Offrande dominicale', 100000],
      ['2026-08-17', 'Avaradrano', 'Dime « speciale » & co', 1275500],
    ];

    const relu = await lireXlsx(ecrireXlsx(source).buffer as ArrayBuffer);

    expect(relu[0]).toEqual(['Date', 'Entite', 'Libelle', 'Montant']);
    expect(relu[1]).toEqual([
      '2026-08-16',
      'Antsahatsiresy',
      'Offrande dominicale',
      '100000',
    ]);
    // Les entites XML sont bien restituees : « & » ne casse pas le classeur.
    expect(relu[2]![2]).toBe('Dime « speciale » & co');
  });

  it('garde les montants en NOMBRES', async () => {
    /**
     * C'est toute la raison de ne pas se contenter d'un CSV : dans un CSV,
     * « 1 200 000 » redevient du texte et ne se somme plus — la premiere chose
     * qu'on fait d'un export financier.
     */
    const xml = new TextDecoder().decode(ecrireXlsx([[42]]));
    // Une cellule numerique n'a PAS d'attribut `t` : c'est le defaut du format.
    expect(xml).toContain('<c r="A1"><v>42</v></c>');
    expect(xml).not.toContain('t="inlineStr"><is><t xml:space="preserve">42');
  });

  it('laisse vides le nul, la chaine vide et l infini', async () => {
    // `NaN` et l'infini n'ont pas de representation : mieux vaut une cellule
    // vide qu'un classeur qu'Excel refuse d'ouvrir en entier.
    const relu = await lireXlsx(
      ecrireXlsx([['a', null, '', Number.NaN, Number.POSITIVE_INFINITY, 'f']])
        .buffer as ArrayBuffer,
    );
    expect(relu[0]).toEqual(['a', '', '', '', '', 'f']);
  });

  it('borne le nom de feuille et en purge ce qu Excel interdit', async () => {
    /**
     * Au-dela de 31 caracteres, ou avec un `/`, Excel refuse d'ouvrir le
     * fichier — sans dire lequel des deux defauts l'a gene.
     */
    const xml = new TextDecoder().decode(
      ecrireXlsx([['a']], 'Synthese/2026 : un nom beaucoup trop long pour Excel'),
    );
    const nom = /<sheet name="([^"]*)"/.exec(xml)?.[1] ?? '';
    expect(nom.length).toBeLessThanOrEqual(31);
    expect(nom).not.toContain('/');
    expect(nom).not.toContain(':');
  });
});
