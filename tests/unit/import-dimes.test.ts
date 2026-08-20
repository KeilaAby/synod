import { describe, expect, it } from 'vitest';

import {
  analyserVersements,
  champsVersementManquants,
  cleDonateur,
  devinerVersement,
  indexerDonateurs,
  indexerEglises,
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

  /**
   * REGLE C — CE TEST DISAIT L'INVERSE JUSQU'AU 20 AOUT 2026, et il avait
   * raison a l'epoque : « une ligne sans nom n'entre pas dans la file, il n'y a
   * rien a y rapprocher ». Le raisonnement valait TANT QU'IL N'Y AVAIT RIEN
   * POUR TRAVAILLER — or un numero d'enveloppe est precisement ce quelque
   * chose : il a deja ete porte, la file propose son dernier porteur, et la
   * question se tranche.
   */
  it('EF-FIN-34, règle C — une ligne SANS NOM mais AVEC un numéro entre dans la file', () => {
    const rapport = analyserVersements([['', '', 'E-500', '3000']], CORRESPONDANCE, index);

    expect(rapport.retenues[0]).toMatchObject({
      nature: 'ENVELOPPE_ANONYME',
      aRapprocher: true,
      nomSource: null,
      enveloppe: 'E-500',
    });
  });

  /**
   * LA RAISON D'ORIGINE TIENT TOUJOURS ICI, et c'est la borne de la regle C :
   * sans nom NI numero, il n'y a vraiment rien a rapprocher. L'y inscrire
   * remplirait la file de lignes qu'aucun travail ne peut clore.
   */
  it('règle C — sans nom NI enveloppe : en vrac, et RIEN à rapprocher', () => {
    const rapport = analyserVersements([['', '', '', '2500']], CORRESPONDANCE, index);
    expect(rapport.retenues[0]).toMatchObject({ nature: 'EN_VRAC', aRapprocher: false });
  });

  /**
   * REGLE B — le numero VOYAGE avec la ligne meme quand le nom est reconnu.
   *
   * C'est `fn_attribuer_enveloppe` (migration 0056) qui l'attribuera au
   * croyant ; encore faut-il que l'analyse ne le perde pas en route.
   */
  it('règle B — un nom reconnu conserve le numéro lu, pour qu’il lui soit attribué', () => {
    const rapport = analyserVersements(
      [['Koffi', 'Amos', 'E-777', '8000']],
      CORRESPONDANCE,
      index,
    );

    expect(rapport.retenues[0]).toMatchObject({
      croyantId: 'c2',
      nature: 'NOMINATIF',
      enveloppe: 'E-777',
      aRapprocher: false,
    });
  });

  /**
   * REGLE A — sans numero, un nom reconnu se rattache tout simplement, et rien
   * n'est attribue : il n'y a pas de numero a donner.
   */
  it('règle A — un nom reconnu sans numéro se rattache, sans enveloppe', () => {
    const rapport = analyserVersements(
      [['Koffi', 'Amos', '', '4000']],
      CORRESPONDANCE,
      index,
    );

    expect(rapport.retenues[0]).toMatchObject({
      croyantId: 'c2',
      nature: 'NOMINATIF',
      enveloppe: null,
      aRapprocher: false,
    });
  });

  /**
   * REGLE A, second cas — un nom INCONNU sans numero part quand meme dans la
   * file : c'est le vivier des personnes non rattachees. La nature retombe sur
   * le vrac, faute de numero, mais le montant compte et le nom est conserve.
   */
  it('règle A — un nom inconnu SANS numéro entre dans la file des non rattachés', () => {
    const rapport = analyserVersements(
      [['NOUVEAU', 'Venu', '', '1500']],
      CORRESPONDANCE,
      index,
    );

    expect(rapport.retenues[0]).toMatchObject({
      croyantId: null,
      nature: 'EN_VRAC',
      aRapprocher: true,
      nomSource: 'NOUVEAU',
      prenomSource: 'Venu',
    });
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

/**
 * EF-FIN-34 — L'EGLISE DE RATTACHEMENT LUE DANS LE FICHIER (migration 0058).
 *
 * Celui qui a tenu la collecte connait ses gens : quand il ecrit l'eglise, ce
 * temoignage vaut mieux que toute deduction. Reste a ne pas le croire quand il
 * designe quelque chose d'introuvable ou d'ambigu.
 */
describe("L'eglise lue dans le fichier", () => {
  const eglises = indexerEglises([
    { id: 'e1', nom: 'Ambohipo', code: 'AMB' },
    { id: 'e2', nom: 'Antsahatsiresy', code: 'ANT' },
  ]);

  /** Les colonnes : nom, prenom, enveloppe, montant, eglise. */
  const AVEC_EGLISE = { nom: 0, prenom: 1, enveloppe: 2, montant: 3, eglise: 4 };

  it('reconnait une eglise par son NOM, casse et accents indifferents', () => {
    const rapport = analyserVersements(
      [['NOUVEAU', 'Venu', '', '1000', '  ambohipo ']],
      AVEC_EGLISE,
      index,
      eglises,
    );

    expect(rapport.retenues[0]).toMatchObject({
      egliseId: 'e1',
      egliseSource: 'ambohipo',
    });
  });

  it('reconnait une eglise par son CODE', () => {
    const rapport = analyserVersements(
      [['NOUVEAU', 'Venu', '', '1000', 'ANT']],
      AVEC_EGLISE,
      index,
      eglises,
    );

    expect(rapport.retenues[0]?.egliseId).toBe('e2');
  });

  /**
   * `null` N'EST PAS UN ECHEC : le rapprochement se fera comme avant, en
   * choisissant l'eglise a la main. Et le LIBELLE est conserve quand meme —
   * « Soanierana » suffit souvent a trancher a l'oeil, la ou un champ vide ne
   * dit rien.
   */
  it('garde le libelle meme quand rien ne le reconnait', () => {
    const rapport = analyserVersements(
      [['NOUVEAU', 'Venu', '', '1000', 'Soanierana']],
      AVEC_EGLISE,
      index,
      eglises,
    );

    expect(rapport.retenues[0]).toMatchObject({
      egliseId: null,
      egliseSource: 'Soanierana',
    });
  });

  /**
   * MEME TRAITEMENT DE L'AMBIGUITE QUE POUR LES DONATEURS. Deux eglises du
   * meme nom : en choisir une au hasard rattacherait le croyant a la mauvaise
   * paroisse, en silence et pour toujours.
   */
  it('ECARTE un libelle qui designe deux eglises', () => {
    const ambigu = indexerEglises([
      { id: 'a', nom: 'Ambohipo', code: 'AMB1' },
      { id: 'b', nom: 'AMBOHIPO', code: 'AMB2' },
    ]);

    expect(ambigu.get('ambohipo')).toBeNull();
  });

  /**
   * Une eglise dont le code s'ecrit comme le nom se designerait elle-meme deux
   * fois. La traiter comme ambigue la rendrait introuvable — alors qu'il n'y a
   * qu'une seule reponse possible.
   */
  it("ne s'ambigue pas elle-meme quand son code egale son nom", () => {
    const meme = indexerEglises([{ id: 'x', nom: 'ANT', code: 'ANT' }]);
    expect(meme.get('ant')).toBe('x');
  });

  it('laisse l’eglise vide quand le fichier n’a pas la colonne', () => {
    const rapport = analyserVersements(
      [['NOUVEAU', 'Venu', '', '1000']],
      CORRESPONDANCE,
      index,
    );

    expect(rapport.retenues[0]).toMatchObject({ egliseId: null, egliseSource: null });
  });

  it('reconnait l’entete « Eglise » et ses synonymes', () => {
    expect(devinerVersement(['Nom', 'Montant', 'Paroisse']).eglise).toBe(2);
    expect(devinerVersement(['Nom', 'Montant', 'Église']).eglise).toBe(2);
  });
});
