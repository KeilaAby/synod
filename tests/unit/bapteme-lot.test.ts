import { describe, expect, it } from 'vitest';

import {
  doublonsInternes,
  egliseImplicite,
  trouverGradeCroyant,
  trouverNationaliteParDefaut,
} from '@/lib/domain/bapteme-lot';
import { LIGNES_LOT_MAX, saisirLotSchema } from '@/lib/validation/bapteme';

/**
 * EF-BAP-07 — saisie d'un lot de baptises d'une meme ceremonie.
 */

const UUID = {
  nationalite: '22222222-2222-4222-8222-222222222222',
  eglise: '33333333-3333-4333-8333-333333333333',
};

const ligne = (p: Record<string, unknown> = {}) => ({
  nom: 'RAKOTO',
  prenom: 'Jean',
  sexe: 'M',
  dateNaissance: '2000-05-04',
  adresse: 'Ambohitromanjaka',
  ...p,
});

const lot = (p: Record<string, unknown> = {}) => ({
  dateBapteme: '2026-04-05',
  nationaliteId: UUID.nationalite,
  lignes: [ligne()],
  ...p,
});

describe("EF-BAP-07 — l'eglise ne se demande que si elle se discute", () => {
  it("s'efface quand le perimetre n'en compte qu'une", () => {
    // Le seul choix possible n'a pas a etre demande : c'est le cas du
    // gestionnaire d'une eglise, qui saisit trente lignes de suite.
    expect(egliseImplicite([{ id: 'e1' }])).toBe('e1');
  });

  it("s'impose des qu'il y en a plusieurs", () => {
    /**
     * Y compris pour un gestionnaire de DISTRICT, qui n'est pas SuperAdmin.
     * Deduire son entite de rattachement rangerait ses baptises sous un
     * district — ce que RG-04 interdit — ou sous une eglise au hasard.
     */
    expect(egliseImplicite([{ id: 'e1' }, { id: 'e2' }])).toBeNull();
  });

  it('ne devine rien quand le perimetre est vide', () => {
    expect(egliseImplicite([])).toBeNull();
  });
});

describe('EF-BAP-01 — le grade ne se demande plus', () => {
  const grades = [
    { id: 'g1', libelle: 'Pasteur' },
    { id: 'g2', libelle: 'Croyant' },
    { id: 'g3', libelle: 'Diacre' },
  ];

  it('resout « Croyant » sans le demander a l utilisateur', () => {
    // Le champ n'offrait pas un choix, il offrait une occasion de se tromper
    // — et trente fois de suite dans un lot.
    expect(trouverGradeCroyant(grades)).toBe('g2');
  });

  it('ignore la casse et les accents du referentiel', () => {
    expect(trouverGradeCroyant([{ id: 'x', libelle: '  CROYANT ' }])).toBe('x');
  });

  it('ne prend RIEN par defaut quand « Croyant » a disparu', () => {
    /**
     * Quelqu'un peut l'avoir renomme ou desactive. Prendre le premier grade
     * venu rangerait tout un lot sous « Pasteur » sans que personne le voie :
     * l'appelant doit pouvoir refuser et le dire.
     */
    expect(trouverGradeCroyant([{ id: 'g1', libelle: 'Pasteur' }])).toBeNull();
    expect(trouverGradeCroyant([])).toBeNull();
  });

  it("n'accepte plus de grade venu du client", () => {
    // Regle 19 : une action n'ecrit que les champs dont son formulaire est la
    // source. Le grade est resolu par le serveur, ce qui arrive est ignore.
    const analyse = saisirLotSchema.safeParse(lot({ gradeId: UUID.eglise }));

    expect(analyse.success).toBe(true);
    expect(analyse.data).not.toHaveProperty('gradeId');
  });
});

describe('EF-CRO-13 — la meme personne deux fois dans le meme lot', () => {
  it('ecarte la REPETITION, pas la premiere occurrence', () => {
    const repetees = doublonsInternes([
      { nom: 'RAKOTO', prenom: 'Jean', dateNaissance: '2000-05-04' },
      { nom: 'RABE', prenom: 'Paul', dateNaissance: '1999-01-02' },
      { nom: 'RAKOTO', prenom: 'Jean', dateNaissance: '2000-05-04' },
    ]);

    expect(repetees).toEqual([2]);
  });

  it('ignore la casse et les accents, comme le rapprochement en base', () => {
    const repetees = doublonsInternes([
      { nom: 'RAKOTO', prenom: 'Jean', dateNaissance: '2000-05-04' },
      { nom: '  rakoto ', prenom: 'Jéan', dateNaissance: '2000-05-04' },
    ]);

    // « Jéan » et « Jean » : une liste manuscrite recopiee deux fois ne
    // reproduit pas les accents a l'identique.
    expect(repetees).toEqual([1]);
  });

  it('laisse passer deux homonymes nes des jours DIFFERENTS', () => {
    expect(
      doublonsInternes([
        { nom: 'RAKOTO', prenom: 'Jean', dateNaissance: '2000-05-04' },
        { nom: 'RAKOTO', prenom: 'Jean', dateNaissance: '2001-05-04' },
      ]),
    ).toEqual([]);
  });

  it('ne prend pas une ligne incomplete pour un doublon', () => {
    // Elle sera refusee ailleurs, avec son propre motif : la confondre ici
    // donnerait un message faux.
    expect(
      doublonsInternes([
        { nom: '', prenom: '', dateNaissance: '' },
        { nom: '', prenom: '', dateNaissance: '' },
      ]),
    ).toEqual([]);
  });
});

describe('RG-28 — la ceremonie ne precede pas la naissance', () => {
  it('situe le refus sur la LIGNE fautive', () => {
    const analyse = saisirLotSchema.safeParse(
      lot({
        dateBapteme: '2026-04-05',
        lignes: [ligne(), ligne({ dateNaissance: '2030-01-01' })],
      }),
    );

    expect(analyse.success).toBe(false);
    // Sans le chemin, le message se poserait en bas du formulaire et
    // l'utilisateur chercherait laquelle des trente lignes est en cause.
    expect(analyse.error!.issues[0]!.path).toEqual(['lignes', 1, 'dateNaissance']);
  });

  it('accepte un bapteme le jour meme des annees plus tard', () => {
    expect(saisirLotSchema.safeParse(lot()).success).toBe(true);
  });
});

describe("Ce que le schema du lot exige et ce qu'il laisse vide", () => {
  it("n'accepte pas un lot sans aucune ligne", () => {
    expect(saisirLotSchema.safeParse(lot({ lignes: [] })).success).toBe(false);
  });

  it('borne le lot : au-dela, cela releve d un fichier', () => {
    const trop = Array.from({ length: LIGNES_LOT_MAX + 1 }, (_, i) =>
      ligne({ prenom: `Jean${i}` }),
    );
    expect(saisirLotSchema.safeParse(lot({ lignes: trop })).success).toBe(false);
  });

  it("laisse l'eglise vide : le serveur la deduit du perimetre", () => {
    const analyse = saisirLotSchema.safeParse(lot());
    expect(analyse.success).toBe(true);
    expect(analyse.data!.lignes[0]!.egliseId).toBeNull();
  });

  it('garde le vide d un champ facultatif VIDE — jamais 1970', () => {
    /**
     * `z.coerce` sur un champ optionnel fabriquait des valeurs absurdes a
     * partir de `''`. Le schema doit rester idempotent : le serveur revalide
     * sans dommage ce que le client a deja transforme (regle 12).
     */
    const analyse = saisirLotSchema.safeParse(
      lot({ lieu: '', sessionLibelle: '', lignes: [ligne({ telephone: '' })] }),
    );

    expect(analyse.success).toBe(true);
    expect(analyse.data!.lieu).toBeNull();
    expect(analyse.data!.lignes[0]!.telephone).toBeNull();
  });

  it('accepte deux fois de suite sa propre sortie (idempotence)', () => {
    const premier = saisirLotSchema.parse(lot({ lieu: 'Ikopa' }));
    expect(saisirLotSchema.safeParse(premier).success).toBe(true);
  });

  it('dedoublonne les celebrants communs au lot', () => {
    const analyse = saisirLotSchema.safeParse(
      lot({ celebrantIds: [UUID.eglise, UUID.eglise] }),
    );
    expect(analyse.data!.celebrantIds).toEqual([UUID.eglise]);
  });
});

/**
 * EF-BAP-07 — LA NATIONALITE PAR DEFAUT D'UN BAPTISE.
 *
 * Elle est passee de l'en-tete du lot a la LIGNE le 27 aout 2026 : une
 * ceremonie reunit des baptises de plusieurs nationalites, et le champ commun
 * obligeait a corriger les fiches une par une apres coup. Elle reste
 * facultative — remplir trente cases identiques serait plus penible que le
 * champ qu'elle remplace.
 */
describe('trouverNationaliteParDefaut', () => {
  /**
   * DEUX ORTHOGRAPHES : « Malagasy » est la forme malgache, « Malgache » la
   * forme francaise. Les deux se rencontrent dans les referentiels reels, et
   * n'en reconnaitre qu'une ferait echouer le defaut sur la moitie des bases.
   */
  it.each([
    ['Malagasy', 'n1'],
    ['Malgache', 'n1'],
    ['MALAGASY', 'n1'],
    ['  malgache  ', 'n1'],
  ])('reconnaît « %s »', (libelle, attendu) => {
    expect(trouverNationaliteParDefaut([{ id: 'n1', libelle }])).toBe(attendu);
  });

  it('ignore les accents, comme le reste du projet', () => {
    expect(trouverNationaliteParDefaut([{ id: 'n1', libelle: 'Malgaché' }])).toBe('n1');
  });

  it('choisit la bonne parmi plusieurs nationalités', () => {
    expect(
      trouverNationaliteParDefaut([
        { id: 'fr', libelle: 'Française' },
        { id: 'mg', libelle: 'Malagasy' },
        { id: 'us', libelle: 'Américaine' },
      ]),
    ).toBe('mg');
  });

  /**
   * ON REND `null` PLUTOT QUE DE PRENDRE LA PREMIERE : ranger tout un lot sous
   * une nationalite choisie au hasard serait pire qu'un refus, parce que
   * personne ne le verrait. L'appelant le DIT — meme raisonnement que
   * `trouverGradeCroyant`.
   */
  it('rend null quand aucune nationalité malgache n’existe', () => {
    expect(
      trouverNationaliteParDefaut([
        { id: 'fr', libelle: 'Française' },
        { id: 'us', libelle: 'Américaine' },
      ]),
    ).toBeNull();
  });

  it('rend null sur un référentiel vide', () => {
    expect(trouverNationaliteParDefaut([])).toBeNull();
  });

  /** Un libelle approchant n'est pas la bonne : « Malawite » n'est pas malgache. */
  it('ne se laisse pas prendre par un libellé approchant', () => {
    expect(trouverNationaliteParDefaut([{ id: 'mw', libelle: 'Malawite' }])).toBeNull();
  });
});
