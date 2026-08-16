import { describe, expect, it } from 'vitest';

import {
  analyserVersements,
  champsVersementManquants,
  cleDonateur,
  devinerVersement,
  indexerDonateurs,
} from '@/lib/domain/import-dimes';

/**
 * EF-FIN-34 — import d'une feuille de versements de dimes.
 *
 * CE QUI DISTINGUE CET IMPORT DE CELUI DES CROYANTS : ici, une ligne represente
 * de l'ARGENT DEJA RECU. L'enveloppe est dans l'urne, elle ne disparaitra pas
 * parce que le fichier est imparfait — aucune ligne portant un montant n'est
 * donc rejetee.
 */

const index = indexerDonateurs([
  { id: 'c1', nom: 'RAZAFINDRAPARANY', prenom: 'Edmond' },
  { id: 'c2', nom: 'Koffi', prenom: 'Amos' },
]);

/** Les colonnes du fichier : nom, prenom, enveloppe, montant. */
const CORRESPONDANCE = { nom: 0, prenom: 1, enveloppe: 2, montant: 3 };

describe('Le rapprochement porte sur le nom ET le prenom', () => {
  it('ignore casse, accents et espaces multiples', () => {
    // « RAZAFINDRAPARANY Edmond » doit retrouver « Razafindraparany  edmond ».
    expect(cleDonateur('RAZAFINDRAPARANY', 'Edmond')).toBe(
      cleDonateur('  razafindraparany ', 'édmond'.replace('é', 'e')),
    );
  });

  it('ne rapproche PAS sur le seul nom', () => {
    /**
     * Deux freres portent le meme nom : attribuer la dime de l'un a l'autre
     * serait pire que de ne rien attribuer.
     */
    expect(cleDonateur('RAKOTO', 'Jean')).not.toBe(cleDonateur('RAKOTO', 'Paul'));
  });

  it('ECARTE une cle ambigue plutot que de choisir au hasard', () => {
    // Deux fiches pour « Rakoto Jean » : rendre l'une des deux attribuerait la
    // dime a la mauvaise personne, en silence.
    const ambigu = indexerDonateurs([
      { id: 'a', nom: 'Rakoto', prenom: 'Jean' },
      { id: 'b', nom: 'RAKOTO', prenom: 'jean' },
    ]);

    expect(ambigu.get(cleDonateur('Rakoto', 'Jean'))).toBeNull();
  });
});

describe('EF-FIN-34 — quatre sorts, et un seul est un rejet', () => {
  it('reconnait un nom connu : versement NOMINATIF', () => {
    const rapport = analyserVersements(
      [['RAZAFINDRAPARANY', 'Edmond', 'E-012', '10000']],
      CORRESPONDANCE,
      index,
    );

    expect(rapport.retenues[0]).toMatchObject({
      croyantId: 'c1',
      nature: 'NOMINATIF',
      aRapprocher: false,
      montant: 10000,
    });
  });

  it('garde un nom INCONNU en anonyme, ET le met a rapprocher', () => {
    /**
     * Le montant compte DES MAINTENANT — l'argent est recu. Le nom se retrouve
     * ensuite dans `/croyants`. Rejeter la ligne aurait perdu la collecte.
     */
    const rapport = analyserVersements(
      [['INCONNU', 'Personne', 'E-099', '5000']],
      CORRESPONDANCE,
      index,
    );

    expect(rapport.retenues[0]).toMatchObject({
      croyantId: null,
      nature: 'ENVELOPPE_ANONYME',
      aRapprocher: true,
      nomSource: 'INCONNU',
    });
    expect(rapport.total).toBe(5000);
  });

  it('classe une ligne SANS NOM avec enveloppe en anonyme, SANS rapprochement', () => {
    /**
     * EF-FIN-34 — une ligne sans nom n'entre pas dans la file : il n'y a rien
     * a y rapprocher, et l'y inscrire remplirait la file de lignes qu'aucun
     * travail ne peut clore.
     */
    const rapport = analyserVersements([['', '', 'E-500', '3000']], CORRESPONDANCE, index);

    expect(rapport.retenues[0]).toMatchObject({
      nature: 'ENVELOPPE_ANONYME',
      aRapprocher: false,
      nomSource: null,
    });
  });

  it('classe une ligne sans nom NI enveloppe en vrac', () => {
    const rapport = analyserVersements([['', '', '', '2500']], CORRESPONDANCE, index);
    expect(rapport.retenues[0]).toMatchObject({ nature: 'EN_VRAC', aRapprocher: false });
  });

  it('ECARTE la seule ligne sans montant lisible', () => {
    const rapport = analyserVersements(
      [['RAKOTO', 'Jean', 'E-001', 'illisible']],
      CORRESPONDANCE,
      index,
    );

    expect(rapport.retenues).toHaveLength(0);
    expect(rapport.ecartees[0]).toMatchObject({ ligne: 2, motif: 'Aucun montant lisible.' });
  });

  it('ignore SILENCIEUSEMENT une ligne entierement vide', () => {
    // Un tableur en produit des dizaines apres la derniere donnee : les
    // signaler noierait les vraies anomalies.
    const rapport = analyserVersements([['', '', '', '']], CORRESPONDANCE, index);

    expect(rapport.retenues).toHaveLength(0);
    expect(rapport.ecartees).toHaveLength(0);
  });

  it('numerote les lignes comme le tableur, en-tete comprise', () => {
    // L'utilisateur doit retrouver la ligne dans SON fichier : la deuxieme
    // ligne du tableur est la premiere donnee.
    const rapport = analyserVersements(
      [['RAKOTO', 'Jean', '', 'x'], ['', '', '', 'y']],
      CORRESPONDANCE,
      index,
    );
    expect(rapport.ecartees.map((e) => e.ligne)).toEqual([2, 3]);
  });
});

describe('Le montant, tel qu un tableur le rend', () => {
  const montant = (brut: string) =>
    analyserVersements([['', '', '', brut]], CORRESPONDANCE, index).retenues[0]?.montant;

  it('accepte la virgule decimale et les espaces de milliers', () => {
    expect(montant('1 500,50')).toBe(1500.5);
  });

  it('accepte une devise collee au nombre', () => {
    expect(montant('10000 Ar')).toBe(10000);
  });

  it('refuse zero et le negatif : un versement se verse', () => {
    expect(montant('0')).toBeUndefined();
    expect(montant('-500')).toBeUndefined();
  });
});

describe('La correspondance des colonnes se DEVINE, elle ne se decide pas', () => {
  it('reconnait les entetes courantes', () => {
    const devine = devinerVersement(['Nom', 'Prénom', 'N° enveloppe', 'Montant']);
    expect(devine).toMatchObject({ nom: 0, prenom: 1, enveloppe: 2, montant: 3 });
  });

  it("n'attribue jamais deux champs a la meme colonne", () => {
    const devine = devinerVersement(['Nom', 'Nom']);
    expect(devine.prenom).not.toBe(devine.nom);
  });

  it('exige la seule colonne indispensable : le montant', () => {
    // Le nom est facultatif — une feuille peut ne porter que des anonymes.
    expect(champsVersementManquants({ nom: 0 }).map((c) => c.cle)).toEqual(['montant']);
    expect(champsVersementManquants({ montant: 3 })).toEqual([]);
  });
});
