import { describe, expect, it } from 'vitest';

import {
  type ReferentielsBapteme,
  analyserBaptemes,
  champsBaptemeManquants,
  devinerBapteme,
} from '@/lib/domain/import-baptemes';

/**
 * EF-BAP-07 — import d'une feuille de nouveaux baptises.
 *
 * CE QUI LE DISTINGUE DE L'IMPORT DE DIMES : une ligne fautive est REJETEE. Une
 * dime represente de l'argent deja recu — l'enveloppe est dans l'urne. Ici, la
 * fiche n'existe pas encore : une ligne incomplete ne perd rien, elle se
 * corrige et se rejoue.
 */

const REFS: ReferentielsBapteme = {
  eglises: new Map([
    ['ambohipo', 'e1'],
    ['amb', 'e1'],
    ['antsahatsiresy', 'e2'],
  ]),
  cellules: new Map([
    ['cellule nord', 'c1'],
    ['cellule sud', 'c2'],
  ]),
  nationalites: new Map([
    ['malagasy', 'n1'],
    ['ivoirienne', 'n2'],
  ]),
  egliseDeLaCellule: new Map([
    ['c1', 'e1'],
    ['c2', 'e2'],
  ]),
  egliseImplicite: null,
};

/** Les colonnes du canevas : nom, prenom, sexe, naissance, adresse, eglise… */
const COLONNES = {
  nom: 0,
  prenom: 1,
  sexe: 2,
  dateNaissance: 3,
  adresse: 4,
  eglise: 5,
  nationalite: 6,
  cellule: 7,
  telephone: 8,
};

const CEREMONIE = '2026-08-27';

const LIGNE = [
  'RAKOTO',
  'Jean',
  'M',
  '04/07/1998',
  'Lot II A 45',
  'Ambohipo',
  '',
  '',
  '034 12 345 67',
];

function analyser(lignes: string[][], refs: Partial<ReferentielsBapteme> = {}) {
  return analyserBaptemes(lignes, COLONNES, { ...REFS, ...refs }, CEREMONIE);
}

describe('La correspondance des colonnes se DEVINE', () => {
  it('reconnait les entetes courantes', () => {
    const devine = devinerBapteme([
      'Nom',
      'Prénom',
      'Sexe',
      'Date de naissance',
      'Adresse',
      'Église',
      'Nationalité',
    ]);

    expect(devine).toMatchObject({
      nom: 0,
      prenom: 1,
      sexe: 2,
      dateNaissance: 3,
      adresse: 4,
      eglise: 5,
      nationalite: 6,
    });
  });

  it("n'attribue jamais deux champs a la meme colonne", () => {
    const devine = devinerBapteme(['Nom', 'Nom']);
    expect(devine.prenom).not.toBe(devine.nom);
  });

  /**
   * L'EGLISE N'EST PAS OBLIGATOIRE : un perimetre a une seule eglise n'a rien a
   * designer, et l'exiger ferait recopier trente fois la meme valeur.
   */
  it('exige cinq colonnes, et l’église n’en fait pas partie', () => {
    expect(champsBaptemeManquants({}).map((c) => c.cle)).toEqual([
      'nom',
      'prenom',
      'sexe',
      'dateNaissance',
      'adresse',
    ]);
  });
});

describe('EF-BAP-07 — une ligne complete', () => {
  it('produit une ligne prete pour la saisie en lot', () => {
    const { valides, erreurs } = analyser([LIGNE]);

    expect(erreurs).toEqual([]);
    expect(valides[0]).toMatchObject({
      ligne: 2,
      nom: 'RAKOTO',
      prenom: 'Jean',
      sexe: 'M',
      dateNaissance: '1998-07-04',
      egliseId: 'e1',
      celluleId: null,
      nationaliteId: null,
    });
  });

  /**
   * LE JOUR D'ABORD, comme partout dans l'application : un fichier produit a
   * Madagascar ecrit « 04/07/1998 » pour le 4 juillet. Lire le mois en premier
   * donnerait le 7 avril — une erreur silencieuse, plausible onze mois sur
   * douze.
   */
  it('EF-BAP-07 — lit la date A LA FRANCAISE, le jour en premier', () => {
    expect(analyser([LIGNE]).valides[0]?.dateNaissance).toBe('1998-07-04');
  });

  /** Un export de tableur produit souvent l'ISO : le refuser obligerait a
   *  reformater un fichier deja juste. */
  it('accepte aussi une date deja au format ISO', () => {
    const l = [...LIGNE];
    l[3] = '1998-07-04';
    expect(analyser([l]).valides[0]?.dateNaissance).toBe('1998-07-04');
  });

  it.each([
    ['Homme', 'M'],
    ['femme', 'F'],
    ['f', 'F'],
    ['MASCULIN', 'M'],
  ])('lit « %s » comme le sexe %s', (brut, attendu) => {
    const l = [...LIGNE];
    l[2] = brut;
    expect(analyser([l]).valides[0]?.sexe).toBe(attendu);
  });
});

describe('EF-BAP-07 — ce qui fait REJETER une ligne', () => {
  const refus = (index: number, valeur: string) => {
    const l = [...LIGNE];
    l[index] = valeur;
    return analyser([l]).erreurs;
  };

  it('refuse un nom ou un prenom trop court', () => {
    expect(refus(0, '')[0]?.champ).toBe('nom');
    expect(refus(1, 'X')[0]?.champ).toBe('prenom');
  });

  it('refuse un sexe illisible, en le citant', () => {
    const [e] = refus(2, 'inconnu');
    expect(e?.champ).toBe('sexe');
    expect(e?.valeur).toBe('inconnu');
  });

  it('refuse une date illisible', () => {
    expect(refus(3, 'hier')[0]?.champ).toBe('dateNaissance');
  });

  /**
   * `new Date(1998, 1, 31)` rend le 2 mars sans broncher : le 31 fevrier
   * passerait, et la fiche porterait une date que personne n'a saisie.
   */
  it('refuse un jour qui n’existe pas, que `Date` accepterait en glissant', () => {
    expect(refus(3, '31/02/1998')[0]?.champ).toBe('dateNaissance');
  });

  /** RG-28 — on ne baptise pas quelqu'un qui n'est pas ne. */
  it('RG-28 — refuse une naissance POSTERIEURE au bapteme', () => {
    const [e] = refus(3, '31/12/2030');
    expect(e?.champ).toBe('dateNaissance');
    expect(e?.message).toContain('RG-28');
  });

  it('refuse une eglise inconnue du perimetre', () => {
    expect(refus(5, 'SOANIERANA')[0]?.champ).toBe('eglise');
  });

  /**
   * RG-05 — une cellule d'une AUTRE eglise serait acceptee par la colonne et
   * refusee par la base : autant le dire ici, avec le numero de ligne.
   */
  it('RG-05 — refuse une cellule qui n’appartient pas a l’eglise de la ligne', () => {
    const l = [...LIGNE];
    l[7] = 'Cellule Sud'; // rattachee a e2, alors que la ligne vise e1
    const [e] = analyser([l]).erreurs;
    expect(e?.champ).toBe('cellule');
    expect(e?.message).toContain('RG-05');
  });

  it('accepte une cellule de la BONNE eglise', () => {
    const l = [...LIGNE];
    l[7] = 'Cellule Nord';
    expect(analyser([l]).valides[0]?.celluleId).toBe('c1');
  });

  /**
   * UN LIBELLE ECRIT ET INCONNU EST UNE ERREUR, pas un silence. Retomber sur
   * « Malagasy » ferait passer une faute de frappe pour un choix, sur une
   * donnee que personne ne relira.
   */
  it('EF-BAP-07 — refuse une nationalite ECRITE mais inconnue', () => {
    const l = [...LIGNE];
    l[6] = 'Malgachee';
    expect(analyser([l]).erreurs[0]?.champ).toBe('nationalite');
  });

  it('laisse la nationalite VIDE passer : le serveur posera « Malagasy »', () => {
    expect(analyser([LIGNE]).valides[0]?.nationaliteId).toBeNull();
  });

  it('resout une nationalite connue', () => {
    const l = [...LIGNE];
    l[6] = 'Ivoirienne';
    expect(analyser([l]).valides[0]?.nationaliteId).toBe('n2');
  });
});

describe('L’église, quand la colonne est absente', () => {
  /**
   * UN PERIMETRE A UNE SEULE EGLISE n'a rien a designer : elle se deduit, et
   * l'exiger ferait recopier trente fois la meme valeur.
   */
  it('EF-BAP-07 — deduit l’unique eglise du perimetre', () => {
    const l = [...LIGNE];
    l[5] = '';
    const { valides } = analyser([l], { egliseImplicite: 'e1' });
    expect(valides[0]?.egliseId).toBe('e1');
  });

  /** A plusieurs eglises, l'absence devient une erreur — et on dit laquelle. */
  it('REFUSE l’absence quand le perimetre en compte plusieurs', () => {
    const l = [...LIGNE];
    l[5] = '';
    const [e] = analyser([l]).erreurs;
    expect(e?.champ).toBe('eglise');
    expect(e?.message).toContain('plusieurs');
  });
});

describe('La forme du fichier', () => {
  /**
   * TOUTES LES LIGNES SONT ANALYSEES avant que la moindre ne soit ecrite :
   * l'utilisateur doit voir l'ensemble de ses erreurs d'un coup, pas les
   * decouvrir une par une en relancant l'import treize fois.
   */
  it('EF-BAP-07 — n’interrompt pas l’analyse a la premiere erreur', () => {
    const mauvaise = [...LIGNE];
    mauvaise[2] = 'inconnu';

    const autre = [...LIGNE];
    autre[3] = 'hier';

    const { valides, erreurs } = analyser([mauvaise, autre, LIGNE]);

    expect(erreurs).toHaveLength(2);
    expect(valides).toHaveLength(1);
    // Le numero retrouve la ligne DANS LE TABLEUR, en-tete comprise.
    expect(erreurs.map((e) => e.ligne)).toEqual([2, 3]);
  });

  /** Un tableur produit des dizaines de lignes vides apres la derniere donnee :
   *  les signaler noierait les vraies anomalies. */
  it('ignore SILENCIEUSEMENT une ligne entierement vide', () => {
    const { valides, erreurs } = analyser([['', '', '', '', '', '', '', '', '']]);
    expect(valides).toHaveLength(0);
    expect(erreurs).toHaveLength(0);
  });

  it('numerote les lignes comme le tableur, en-tete comprise', () => {
    const { valides } = analyser([LIGNE, LIGNE]);
    expect(valides.map((v) => v.ligne)).toEqual([2, 3]);
  });
});
