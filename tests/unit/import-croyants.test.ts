import { describe, expect, it } from 'vitest';

import { detecterSeparateur, lireCsv, separerEntetes } from '@/lib/domain/csv';
import {
  type Referentiels,
  analyserLot,
  champsRequisManquants,
  deviner,
  lireDate,
  lireSexe,
  lireStatutMarital,
} from '@/lib/domain/import-croyants';

/**
 * EF-CRO-11 — import d'un lot de croyants.
 *
 * Un import se juge sur ce qu'il REFUSE : accepter une ligne douteuse produit
 * une fiche fausse que personne ne relira jamais. Ces tests portent donc
 * surtout sur les rejets et sur les ambiguites de format.
 */

// -----------------------------------------------------------------------------

describe('Lecture CSV', () => {
  it('detecte le point-virgule d Excel francais', () => {
    expect(detecterSeparateur('nom;prenom;sexe')).toBe(';');
  });

  it('detecte la virgule des autres outils', () => {
    expect(detecterSeparateur('nom,prenom,sexe')).toBe(',');
  });

  it('ignore la ponctuation contenue dans un champ entre guillemets', () => {
    // « Cotonou, Zogbo » ne doit pas faire croire a un fichier separe par des
    // virgules : sans cela, un fichier sur deux se lirait de travers.
    expect(detecterSeparateur('"Cotonou, Zogbo";prenom;sexe')).toBe(';');
  });

  it('lit les champs entre guillemets, virgule comprise', () => {
    const lignes = lireCsv('nom;adresse\nKOFFI;"Cotonou, Zogbo"');
    expect(lignes[1]).toEqual(['KOFFI', 'Cotonou, Zogbo']);
  });

  it('lit un guillemet echappe', () => {
    const lignes = lireCsv('libelle\n"Eglise ""Bethel"""');
    expect(lignes[1]).toEqual(['Eglise "Bethel"']);
  });

  it('lit un saut de ligne a l interieur d un champ', () => {
    // Une adresse sur deux lignes est frequente dans un tableur.
    const lignes = lireCsv('nom;adresse\nKOFFI;"Rue 12\nCotonou"');
    expect(lignes).toHaveLength(2);
    expect(lignes[1]?.[1]).toBe('Rue 12\nCotonou');
  });

  it('ecarte le BOM d Excel', () => {
    // Sans cela le premier entete devient « ﻿nom » et ne correspond a rien.
    const { entetes } = separerEntetes(lireCsv('﻿nom;prenom\nKOFFI;Amos'));
    expect(entetes[0]).toBe('nom');
  });

  it('accepte les fins de ligne Windows', () => {
    const lignes = lireCsv('nom;prenom\r\nKOFFI;Amos\r\n');
    expect(lignes[1]).toEqual(['KOFFI', 'Amos']);
  });

  it('ecarte les lignes vides de fin, qu un tableur produit toujours', () => {
    const { donnees } = separerEntetes(lireCsv('nom;prenom\nKOFFI;Amos\n;\n\n'));
    expect(donnees).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------

describe('Conversions', () => {
  it('lit une date au format francais', () => {
    const date = lireDate('03/04/2020');
    // 3 AVRIL, pas 4 mars : dans un fichier francais, l'interpretation
    // americaine produirait une erreur silencieuse et indetectable.
    expect(date?.getDate()).toBe(3);
    expect(date?.getMonth()).toBe(3);
  });

  it('lit une date ISO', () => {
    const date = lireDate('2020-04-03');
    expect(date?.getDate()).toBe(3);
    expect(date?.getMonth()).toBe(3);
  });

  it('refuse une date impossible plutot que de la decaler', () => {
    // `new Date(2020, 1, 31)` donne le 2 mars sans se plaindre.
    expect(lireDate('31/02/2020')).toBeNull();
    expect(lireDate('pas une date')).toBeNull();
    expect(lireDate('')).toBeNull();
  });

  it('reconnait le sexe sous ses formes courantes', () => {
    for (const valeur of ['M', 'm', 'Homme', 'MASCULIN', 'H']) {
      expect(lireSexe(valeur), valeur).toBe('M');
    }
    for (const valeur of ['F', 'Femme', 'féminin']) {
      expect(lireSexe(valeur), valeur).toBe('F');
    }
    expect(lireSexe('inconnu')).toBeNull();
  });

  it('reconnait le statut marital accorde au feminin', () => {
    expect(lireStatutMarital('Mariée')).toBe('MARIE');
    expect(lireStatutMarital('veuve')).toBe('VEUF');
    expect(lireStatutMarital('')).toBeNull();
  });
});

// -----------------------------------------------------------------------------

describe('Correspondance des colonnes', () => {
  it('devine les entetes usuelles', () => {
    const c = deviner(['Nom', 'Prénom', 'Sexe', 'Date de naissance', 'Adresse']);
    expect(c.nom).toBe(0);
    expect(c.prenom).toBe(1);
    expect(c.sexe).toBe(2);
    expect(c.dateNaissance).toBe(3);
    expect(c.adresse).toBe(4);
  });

  it('ne laisse pas « nom » capturer « prenom »', () => {
    // « prenom » contient « nom » : une recherche par inclusion seule
    // attribuerait les deux champs a la meme colonne.
    const c = deviner(['Prénom', 'Nom']);
    expect(c.prenom).toBe(0);
    expect(c.nom).toBe(1);
  });

  it('signale les champs requis sans colonne', () => {
    const manquants = champsRequisManquants({ nom: 0, prenom: 1 });
    expect(manquants.map((m) => m.cle)).toContain('sexe');
    expect(manquants.map((m) => m.cle)).not.toContain('nom');
    // Les facultatifs ne doivent jamais bloquer.
    expect(manquants.map((m) => m.cle)).not.toContain('telephone');
  });
});

// -----------------------------------------------------------------------------

describe('EF-CRO-11 — pre-validation du lot', () => {
  const aujourdhui = new Date(2026, 7, 7);

  const referentiels: Referentiels = {
    eglises: new Map([
      ['iavoambony', 'e1'],
      ['egl-0007', 'e1'],
      ['antsahatsiresy', 'e2'],
    ]),
    cellules: new Map([
      ['cellule volahanta', 'c1'],
      ['cellule lointaine', 'c2'],
    ]),
    grades: new Map([
      ['croyant', 'g1'],
      ['pasteur', 'g2'],
    ]),
    nationalites: new Map([['malgache', 'n1']]),
    egliseDeLaCellule: new Map([
      ['c1', 'e1'],
      ['c2', 'e2'],
    ]),
  };

  const correspondance = {
    nom: 0,
    prenom: 1,
    sexe: 2,
    dateNaissance: 3,
    adresse: 4,
    eglise: 5,
    grade: 6,
    nationalite: 7,
    cellule: 8,
    dateBapteme: 9,
  };

  const ligne = (p: Partial<Record<number, string>> = {}) => {
    const base = [
      'RAKOTO',
      'Jean',
      'M',
      '12/03/1990',
      'Ambohitromanjaka',
      'IAVOAMBONY',
      'Croyant',
      'Malgache',
      '',
      '',
    ];
    for (const [i, v] of Object.entries(p)) base[Number(i)] = v!;
    return base;
  };

  it('accepte une ligne complete et resout les references', () => {
    const { valides, erreurs } = analyserLot([ligne()], correspondance, referentiels, aujourdhui);

    expect(erreurs).toEqual([]);
    expect(valides).toHaveLength(1);
    expect(valides[0]).toMatchObject({
      egliseId: 'e1',
      gradeId: 'g1',
      nationaliteId: 'n1',
      dateNaissance: '1990-03-12',
    });
  });

  it('resout une eglise par son CODE autant que par son nom', () => {
    const { valides } = analyserLot(
      [ligne({ 5: 'EGL-0007' })],
      correspondance,
      referentiels,
      aujourdhui,
    );
    expect(valides[0]?.egliseId).toBe('e1');
  });

  it('ignore la casse et les accents des references', () => {
    const { valides, erreurs } = analyserLot(
      [ligne({ 5: '  iavoambony  ', 7: 'MALGACHE' })],
      correspondance,
      referentiels,
      aujourdhui,
    );
    expect(erreurs).toEqual([]);
    expect(valides[0]?.egliseId).toBe('e1');
  });

  it('RG-05 — refuse une cellule etrangere a l eglise indiquee', () => {
    const { valides, erreurs } = analyserLot(
      [ligne({ 8: 'Cellule lointaine' })],
      correspondance,
      referentiels,
      aujourdhui,
    );

    expect(valides).toHaveLength(0);
    expect(erreurs[0]?.message).toContain('RG-05');
    expect(erreurs[0]?.champ).toBe('cellule');
  });

  it('RG-28 — refuse un bapteme anterieur a la naissance', () => {
    const { erreurs } = analyserLot(
      [ligne({ 9: '01/01/1980' })],
      correspondance,
      referentiels,
      aujourdhui,
    );
    expect(erreurs[0]?.message).toContain('RG-28');
  });

  it('refuse une naissance dans le futur', () => {
    const { erreurs } = analyserLot(
      [ligne({ 3: '12/03/2030' })],
      correspondance,
      referentiels,
      aujourdhui,
    );
    expect(erreurs[0]?.champ).toBe('dateNaissance');
  });

  it('signale TOUTES les erreurs d une ligne, pas seulement la premiere', () => {
    // Decouvrir ses fautes une par une obligerait a relancer l'import autant de
    // fois qu'il y a d'erreurs.
    const { erreurs } = analyserLot(
      [ligne({ 0: '', 2: 'X', 5: 'INCONNUE' })],
      correspondance,
      referentiels,
      aujourdhui,
    );

    const champs = erreurs.map((e) => e.champ);
    expect(champs).toContain('nom');
    expect(champs).toContain('sexe');
    expect(champs).toContain('eglise');
  });

  it('poursuit apres une ligne fautive', () => {
    const { valides, erreurs } = analyserLot(
      [ligne({ 0: '' }), ligne({ 1: 'Paul' })],
      correspondance,
      referentiels,
      aujourdhui,
    );

    expect(erreurs).toHaveLength(1);
    expect(valides).toHaveLength(1);
    expect(valides[0]?.prenom).toBe('Paul');
  });

  it('situe chaque erreur sur SA ligne', () => {
    const { erreurs } = analyserLot(
      [ligne(), ligne({ 2: 'X' })],
      correspondance,
      referentiels,
      aujourdhui,
    );
    expect(erreurs[0]?.ligne).toBe(2);
  });

  it('EF-CRO-13 — detecte un doublon INTERNE au fichier', () => {
    // Deux fois la meme personne dans le meme lot passerait tous les controles
    // ligne a ligne sans etre vue.
    const { valides, erreurs } = analyserLot(
      [ligne(), ligne()],
      correspondance,
      referentiels,
      aujourdhui,
    );

    expect(valides).toHaveLength(1);
    expect(erreurs[0]?.message).toContain('ligne 1');
  });

  it('ignore une ligne entierement vide sans la signaler', () => {
    const { valides, erreurs } = analyserLot(
      [ligne(), ['', '', '', '', '', '', '', '', '', '']],
      correspondance,
      referentiels,
      aujourdhui,
    );

    expect(valides).toHaveLength(1);
    expect(erreurs).toEqual([]);
  });

  it('laisse passer les champs facultatifs absents', () => {
    const { erreurs } = analyserLot(
      [ligne({ 8: '', 9: '' })],
      correspondance,
      referentiels,
      aujourdhui,
    );
    expect(erreurs).toEqual([]);
  });
});
