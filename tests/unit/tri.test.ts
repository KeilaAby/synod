import { describe, expect, it } from 'vitest';

import {
  type ColonneTriCroyant,
  type CroyantTriable,
  valeurTriCroyant,
} from '@/lib/domain/croyant';
import { type EtatTri, ariaSort, basculerTri, trierListe } from '@/lib/domain/tri';

/**
 * EF-CRO-04 — le tri d'une liste chargee en memoire.
 *
 * Les cas testes sont ceux qui se decident, pas ceux qui vont de soi : la place
 * des absences, les accents, l'inversion de l'age, la stabilite.
 */

function croyant(partiel: Partial<CroyantTriable>): CroyantTriable {
  return {
    nom: 'Rakoto',
    prenom: 'Jean',
    matricule: 'ANT-00001-26',
    sexe: 'M',
    statut: 'ACTIF',
    date_naissance: '1990-01-01',
    date_bapteme: '2010-06-15',
    eglise: { nom: 'Antananarivo' },
    cellule: { nom: 'Cellule 1' },
    grade: { libelle: 'Croyant' },
    ...partiel,
  };
}

/** Raccourci : trier une liste de croyants sur une colonne. */
function trier(lignes: CroyantTriable[], colonne: ColonneTriCroyant, sens: 'asc' | 'desc') {
  return trierListe(lignes, { colonne, sens }, valeurTriCroyant);
}

describe('basculerTri', () => {
  it('part en ascendant sur une colonne nouvelle', () => {
    expect(basculerTri(null, 'nom')).toEqual({ colonne: 'nom', sens: 'asc' });
    expect(basculerTri({ colonne: 'age', sens: 'desc' }, 'nom')).toEqual({
      colonne: 'nom',
      sens: 'asc',
    });
  });

  it('inverse le sens sur la colonne active', () => {
    const asc: EtatTri<'nom'> = { colonne: 'nom', sens: 'asc' };
    expect(basculerTri(asc, 'nom')).toEqual({ colonne: 'nom', sens: 'desc' });
    expect(basculerTri(basculerTri(asc, 'nom'), 'nom')).toEqual(asc);
  });
});

describe('ariaSort', () => {
  it("n'annonce un ordre que sur la colonne active", () => {
    const etat: EtatTri<'nom' | 'age'> = { colonne: 'nom', sens: 'desc' };
    expect(ariaSort(etat, 'nom')).toBe('descending');
    expect(ariaSort(etat, 'age')).toBe('none');
    expect(ariaSort(null, 'nom')).toBe('none');
  });
});

describe('trierListe', () => {
  it('rend une copie et ne touche pas la liste d’origine', () => {
    const lignes = [croyant({ nom: 'Zoe' }), croyant({ nom: 'Andry' })];
    const trie = trier(lignes, 'nom', 'asc');

    expect(trie[0].nom).toBe('Andry');
    expect(lignes[0].nom).toBe('Zoe');
  });

  it('sans etat de tri, conserve l’ordre reçu', () => {
    const lignes = [croyant({ nom: 'Zoe' }), croyant({ nom: 'Andry' })];
    expect(trierListe(lignes, null, valeurTriCroyant).map((c) => c.nom)).toEqual([
      'Zoe',
      'Andry',
    ]);
  });

  /**
   * LE CAS QUI JUSTIFIE LE COLLATEUR. Une comparaison de codes de caracteres
   * placerait « Émile » (0xC9) apres « Zoe » — donc en fin de liste, ou personne
   * ne le chercherait.
   */
  it('classe les accents avec leur lettre de base, pas apres Z', () => {
    const lignes = [
      croyant({ nom: 'Zoe', prenom: '' }),
      croyant({ nom: 'Émile', prenom: '' }),
      croyant({ nom: 'Andry', prenom: '' }),
    ];

    expect(trier(lignes, 'nom', 'asc').map((c) => c.nom)).toEqual(['Andry', 'Émile', 'Zoe']);
  });

  it('ordonne « Cellule 2 » avant « Cellule 10 »', () => {
    const lignes = [
      croyant({ cellule: { nom: 'Cellule 10' } }),
      croyant({ cellule: { nom: 'Cellule 2' } }),
    ];

    expect(trier(lignes, 'cellule', 'asc').map((c) => c.cellule?.nom)).toEqual([
      'Cellule 2',
      'Cellule 10',
    ]);
  });

  /**
   * UNE ABSENCE N'EST PAS UNE PETITE VALEUR — la regle du module.
   *
   * Un croyant sans date de bapteme n'est pas « le premier baptise ». Les deux
   * sens sont testes : c'est l'inversion qui serait le defaut, pas l'ordre.
   */
  it('renvoie les valeurs absentes en fin de liste, dans LES DEUX sens', () => {
    const lignes = [
      croyant({ nom: 'Sans', date_bapteme: null }),
      croyant({ nom: 'Tard', date_bapteme: '2020-01-01' }),
      croyant({ nom: 'Tot', date_bapteme: '2001-01-01' }),
    ];

    expect(trier(lignes, 'bapteme', 'asc').map((c) => c.nom)).toEqual(['Tot', 'Tard', 'Sans']);
    expect(trier(lignes, 'bapteme', 'desc').map((c) => c.nom)).toEqual(['Tard', 'Tot', 'Sans']);
  });

  it('traite une cellule non renseignee comme une absence', () => {
    const lignes = [
      croyant({ nom: 'Hors', cellule: null }),
      croyant({ nom: 'Dedans', cellule: { nom: 'Ambohipo' } }),
    ];

    expect(trier(lignes, 'cellule', 'asc').map((c) => c.nom)).toEqual(['Dedans', 'Hors']);
    expect(trier(lignes, 'cellule', 'desc').map((c) => c.nom)).toEqual(['Dedans', 'Hors']);
  });

  /**
   * L'AGE SE LIT A L'ENVERS DE SA DATE. « Age croissant » veut dire « du plus
   * jeune au plus vieux » ; trier sur la date de naissance telle quelle
   * donnerait l'ordre inverse de ce que le chevron annonce.
   */
  it('trie l’age croissant du plus JEUNE au plus vieux', () => {
    const lignes = [
      croyant({ nom: 'Aine', date_naissance: '1950-01-01' }),
      croyant({ nom: 'Cadet', date_naissance: '2010-01-01' }),
      croyant({ nom: 'Milieu', date_naissance: '1980-01-01' }),
    ];

    expect(trier(lignes, 'age', 'asc').map((c) => c.nom)).toEqual(['Cadet', 'Milieu', 'Aine']);
    expect(trier(lignes, 'age', 'desc').map((c) => c.nom)).toEqual(['Aine', 'Milieu', 'Cadet']);
  });

  /**
   * LA STABILITE SERT DE SECOND CRITERE. Deux croyants du meme grade gardent
   * l'ordre ou la lecture precedente les avait mis — c'est-a-dire par nom, que
   * le serveur a deja pose. Sans elle, chaque tri sur une colonne peu
   * discriminante melangerait les ex aequo a chaque clic.
   */
  it('garde l’ordre d’origine entre ex aequo', () => {
    const lignes = [
      croyant({ nom: 'Andry', grade: { libelle: 'Croyant' } }),
      croyant({ nom: 'Bema', grade: { libelle: 'Croyant' } }),
      croyant({ nom: 'Claude', grade: { libelle: 'Croyant' } }),
    ];

    expect(trier(lignes, 'grade', 'asc').map((c) => c.nom)).toEqual([
      'Andry',
      'Bema',
      'Claude',
    ]);
  });

  it('trie le nom sur le nom COMPLET, pas sur le seul patronyme', () => {
    const lignes = [
      croyant({ nom: 'Rakoto', prenom: 'Zo' }),
      croyant({ nom: 'Rakoto', prenom: 'Andry' }),
    ];

    expect(trier(lignes, 'nom', 'asc').map((c) => c.prenom)).toEqual(['Andry', 'Zo']);
  });

  /**
   * On trie sur ce que l'ecran AFFICHE. Trier l'eglise sur son identifiant
   * technique rangerait la liste dans un ordre que personne ne peut lire.
   */
  it('trie l’eglise sur son nom, pas sur son identifiant', () => {
    const lignes = [
      croyant({ nom: 'A', eglise: { nom: 'Zoma' } }),
      croyant({ nom: 'B', eglise: { nom: 'Ambohipo' } }),
    ];

    expect(trier(lignes, 'eglise', 'asc').map((c) => c.eglise?.nom)).toEqual([
      'Ambohipo',
      'Zoma',
    ]);
  });

  it('ne considere pas une date de naissance illisible comme un age nul', () => {
    const lignes = [
      croyant({ nom: 'Illisible', date_naissance: 'pas-une-date' }),
      croyant({ nom: 'Valide', date_naissance: '1990-01-01' }),
    ];

    expect(trier(lignes, 'age', 'asc').map((c) => c.nom)).toEqual(['Valide', 'Illisible']);
    expect(trier(lignes, 'age', 'desc').map((c) => c.nom)).toEqual(['Valide', 'Illisible']);
  });
});
