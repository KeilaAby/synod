import { describe, expect, it } from 'vitest';

import { masquerDateFr, versFrancais, versIso } from '@/lib/domain/date-fr';

/**
 * Les dates saisies A LA FRANCAISE — jj/mm/aaaa.
 *
 * CE QUE CES TESTS PROTEGENT. Un `<input type="date">` affiche la date dans la
 * langue DU NAVIGATEUR : sur un poste en anglais, « 04/07/1988 » devient
 * « 07/04/1988 » — le meme texte, deux sens opposes. Le defaut est silencieux,
 * et ne se voit que le jour ou quelqu'un compare la fiche a un acte de
 * naissance.
 */

describe('versIso — du francais vers ce que la base attend', () => {
  it('lit le JOUR en premier, jamais le mois', () => {
    // Le cas qui a motive ce module : 4 juillet, pas 7 avril.
    expect(versIso('04/07/1988')).toBe('1988-07-04');
  });

  it('accepte un jour ou un mois sur un seul chiffre', () => {
    expect(versIso('4/7/1988')).toBe('1988-07-04');
  });

  /**
   * TOLERANT SUR LE SEPARATEUR : un pave numerique n'a pas de barre oblique, et
   * la personne qui tape vite ne doit pas etre reprise sur une ponctuation.
   */
  it('accepte le tiret et le point comme séparateurs', () => {
    expect(versIso('04-07-1988')).toBe('1988-07-04');
    expect(versIso('04.07.1988')).toBe('1988-07-04');
  });

  /**
   * `new Date(1988, 1, 31)` rend le 2 mars sans broncher : le 31 fevrier serait
   * accepte, et la fiche porterait une date que personne n'a saisie.
   */
  it('REFUSE un jour qui n’existe pas, que `Date` accepterait en glissant', () => {
    expect(versIso('31/02/2026')).toBeNull();
    expect(versIso('31/04/2026')).toBeNull();
    expect(versIso('30/02/2024')).toBeNull();
  });

  it('accepte le 29 février d’une année bissextile, refuse celui des autres', () => {
    expect(versIso('29/02/2024')).toBe('2024-02-29');
    expect(versIso('29/02/2025')).toBeNull();
  });

  /**
   * L'ANNEE EST EXIGEE SUR QUATRE CHIFFRES : « 88 » pourrait valoir 1988 ou
   * 2088, et deviner reviendrait a inventer un siecle.
   */
  it('refuse une année sur deux chiffres', () => {
    expect(versIso('04/07/88')).toBeNull();
  });

  it('refuse ce qui n’est pas une date', () => {
    expect(versIso('hier')).toBeNull();
    expect(versIso('1988-07-04')).toBeNull();
    expect(versIso('04/07')).toBeNull();
  });

  it('rend null sur une saisie vide', () => {
    expect(versIso('')).toBeNull();
    expect(versIso('   ')).toBeNull();
  });
});

describe('versFrancais — de la base vers ce que l’utilisateur lit', () => {
  it('remet le jour en premier', () => {
    expect(versFrancais('1988-07-04')).toBe('04/07/1988');
  });

  it('accepte une date-heure ISO complète', () => {
    expect(versFrancais('1988-07-04T10:30:00Z')).toBe('04/07/1988');
  });

  it('rend une chaîne vide sur une absence, jamais « null »', () => {
    expect(versFrancais(null)).toBe('');
    expect(versFrancais(undefined)).toBe('');
    expect(versFrancais('')).toBe('');
    expect(versFrancais('illisible')).toBe('');
  });

  /** L'aller-retour doit etre fidele : c'est ce qui rend le champ sur. */
  it('fait un aller-retour fidèle', () => {
    for (const iso of ['1988-07-04', '2026-12-31', '2024-02-29']) {
      expect(versIso(versFrancais(iso))).toBe(iso);
    }
  });
});

describe('masquerDateFr — les barres obliques se posent seules', () => {
  /**
   * LA SAISIE N'EST JAMAIS REFUSEE PENDANT LA FRAPPE : « 04/0 » est un etat
   * transitoire normal. C'est `versIso` qui tranche, a la fin.
   */
  it('groupe les chiffres 2-2-4 au fil de la frappe', () => {
    expect(masquerDateFr('0')).toBe('0');
    expect(masquerDateFr('04')).toBe('04');
    expect(masquerDateFr('040')).toBe('04/0');
    expect(masquerDateFr('0407')).toBe('04/07');
    expect(masquerDateFr('04071988')).toBe('04/07/1988');
  });

  it('ignore ce qui n’est pas un chiffre, séparateurs compris', () => {
    expect(masquerDateFr('04/07/1988')).toBe('04/07/1988');
    expect(masquerDateFr('04-07-1988')).toBe('04/07/1988');
  });

  /** Au-dela de huit chiffres, on ne rallonge pas : une date en a huit. */
  it('borne la saisie à huit chiffres', () => {
    expect(masquerDateFr('040719889999')).toBe('04/07/1988');
  });

  it('laisse effacer jusqu’au vide', () => {
    expect(masquerDateFr('')).toBe('');
  });
});
