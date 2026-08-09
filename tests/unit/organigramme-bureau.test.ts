import { describe, expect, it } from 'vitest';

import { type FonctionBureau, type MandatMembre, composerBureau } from '@/lib/domain/bureau';
import {
  type DispositionPoste,
  dispositionParDefaut,
  nettoyerDisposition,
  racines,
  retirerPoste,
  validerLien,
} from '@/lib/domain/organigramme-bureau';

/**
 * EF-BUR-07 — disposition de l'organigramme d'un bureau.
 *
 * Ces tests doublent le trigger `fn_poste_sans_cycle` : le SQL protege contre
 * les appels directs, ce module produit le message a l'utilisateur (CA-02).
 */

const fonction = (p: Partial<FonctionBureau>): FonctionBureau => ({
  id: 'f1',
  code: 'PRESIDENT',
  libelle: 'President',
  estFinanciere: false,
  niveauxApplicables: ['SIEGE', 'REGIONAL', 'DISTRICT', 'PAROISSE', 'EGLISE', 'CELLULE'],
  isActive: true,
  ...p,
});

const FONCTIONS = [
  fonction({ id: 'f1', libelle: 'President' }),
  fonction({ id: 'f2', libelle: 'Vice-president' }),
  fonction({ id: 'f3', libelle: 'Secretaire' }),
  fonction({ id: 'f4', libelle: 'Tresorier', estFinanciere: true }),
];

const postesVides = () => composerBureau(FONCTIONS, [] as MandatMembre[], 'EGLISE');

describe('Disposition de depart — une grille, et AUCUN lien', () => {
  it("n'invente aucune dependance", () => {
    // C'est le point de la revision du 9 aout : l'ordre protocolaire retire,
    // plus aucune donnee ne dit qui depend de qui. Dessiner un trait
    // affirmerait une organisation que personne n'a decrite — et un
    // organigramme se lit comme un fait.
    expect(
      dispositionParDefaut(postesVides()).every((d) => d.parentFonctionId === null),
    ).toBe(true);
  });

  it('pose tous les postes applicables, cote a cote', () => {
    const disposition = dispositionParDefaut(postesVides());

    expect(disposition.map((d) => d.fonctionId).sort()).toEqual(['f1', 'f2', 'f3', 'f4']);
    // Quatre blocs sur une meme rangee : meme ordonnee, abscisses distinctes.
    expect(new Set(disposition.map((d) => d.y)).size).toBe(1);
    expect(new Set(disposition.map((d) => d.x)).size).toBe(4);
  });

  it('passe a la rangee suivante au-dela de quatre blocs', () => {
    // Une rangee interminable deborde de l'ecran avant de se lire.
    const large = Array.from({ length: 6 }, (_, i) =>
      fonction({ id: `g${i}`, libelle: `Fonction ${i}` }),
    );
    const disposition = dispositionParDefaut(composerBureau(large, [], 'EGLISE'));

    expect(new Set(disposition.map((d) => d.y)).size).toBe(2);
  });

  it('ne propose rien pour un bureau sans fonction applicable', () => {
    expect(dispositionParDefaut([])).toEqual([]);
  });
});

describe('Nettoyage — un plan survit au referentiel qui l a nourri', () => {
  it('ne pose QUE ce qui a ete dessine', () => {
    // Depuis la palette (9 aout), c'est l'utilisateur qui decide des blocs :
    // une fonction applicable mais jamais posee n'apparait pas sur le plan.
    // Elle reste dans la palette, prete a l'etre.
    const plan = nettoyerDisposition(postesVides(), [
      { fonctionId: 'f1', parentFonctionId: null, x: 100, y: 200 },
    ]);

    expect(plan).toEqual([{ fonctionId: 'f1', parentFonctionId: null, x: 100, y: 200 }]);
  });

  it('ecarte un bloc dont la fonction n est plus applicable', () => {
    // Fonction desactivee, ou entite changee de niveau : on ne dessine pas un
    // bloc dont plus rien ne dit le libelle.
    const plan = nettoyerDisposition(postesVides(), [
      { fonctionId: 'f1', parentFonctionId: null, x: 0, y: 0 },
      { fonctionId: 'disparue', parentFonctionId: null, x: 5, y: 5 },
    ]);

    expect(plan.map((d) => d.fonctionId)).toEqual(['f1']);
  });

  it('RACINE un bloc dont le parent a disparu, au lieu de le laisser pendu', () => {
    const plan = nettoyerDisposition(postesVides(), [
      { fonctionId: 'f3', parentFonctionId: 'disparue', x: 0, y: 0 },
    ]);

    expect(plan[0]?.parentFonctionId).toBeNull();
  });
});

describe("Retrait d'un bloc — le referentiel n'est jamais touche", () => {
  const plan: DispositionPoste[] = [
    { fonctionId: 'f1', parentFonctionId: null, x: 0, y: 0 },
    { fonctionId: 'f2', parentFonctionId: 'f1', x: 0, y: 100 },
    { fonctionId: 'f3', parentFonctionId: 'f2', x: 0, y: 200 },
  ];

  it('ote le bloc du plan', () => {
    expect(retirerPoste(plan, 'f2').map((d) => d.fonctionId)).toEqual(['f1', 'f3']);
  });

  it('RACINE ses subordonnes plutot que de les emporter', () => {
    // Les faire disparaitre effacerait d'un geste une branche entiere que le
    // geste ne visait pas — et il ne demande rien.
    expect(
      retirerPoste(plan, 'f2').find((d) => d.fonctionId === 'f3')?.parentFonctionId,
    ).toBeNull();
  });

  it('laisse intact ce qui ne le concerne pas', () => {
    expect(retirerPoste(plan, 'f3').find((d) => d.fonctionId === 'f2')).toEqual(plan[1]);
  });

  it('admet PLUSIEURS racines apres retrait', () => {
    // Un bureau se compose parfois de branches sans sommet commun. Imposer une
    // racine unique obligerait a inventer un poste.
    expect(racines(retirerPoste(plan, 'f2')).map((d) => d.fonctionId)).toEqual([
      'f1',
      'f3',
    ]);
  });
});

describe('EF-BUR-07 — un organigramme reste un ARBRE', () => {
  /**
   * Une chaine f1 → f2 → f3, dessinee a la main.
   *
   * La disposition par defaut ne porte plus de lien depuis le retrait de
   * l'ordre protocolaire : elle ne peut plus servir de terrain aux tests de
   * boucle, qui ont besoin d'une hierarchie a fermer.
   */
  const disposition = (): DispositionPoste[] => [
    { fonctionId: 'f1', parentFonctionId: null, x: 0, y: 0 },
    { fonctionId: 'f2', parentFonctionId: 'f1', x: 0, y: 100 },
    { fonctionId: 'f3', parentFonctionId: 'f2', x: 0, y: 200 },
    { fonctionId: 'f4', parentFonctionId: null, x: 300, y: 0 },
  ];

  it('refuse qu une fonction depende d elle-meme', () => {
    const verdict = validerLien(
      { id: 'f2', libelle: 'Vice-president' },
      { id: 'f2', libelle: 'Vice-president' },
      disposition(),
    );
    expect(verdict.ok).toBe(false);
  });

  it('refuse une BOUCLE, en nommant les deux fonctions', () => {
    // f2 depend deja de f1 : rattacher f1 sous f2 detacherait la branche, et
    // plus personne ne remonterait a la racine.
    const verdict = validerLien(
      { id: 'f1', libelle: 'President' },
      { id: 'f2', libelle: 'Vice-president' },
      disposition(),
    );

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.error).toContain('President');
      expect(verdict.error).toContain('Vice-president');
      expect(verdict.error).toContain('boucle');
    }
  });

  it('refuse une boucle INDIRECTE, a plusieurs niveaux de distance', () => {
    // f3 depend de f2 qui depend de f1. Rattacher f1 sous f3 ferme le cercle
    // sans qu'aucun lien direct ne le laisse voir.
    const verdict = validerLien(
      { id: 'f1', libelle: 'President' },
      { id: 'f3', libelle: 'Secretaire' },
      disposition(),
    );
    expect(verdict.ok).toBe(false);
  });

  it('signale un rattachement DEJA en place plutot que de le rejouer', () => {
    const verdict = validerLien(
      { id: 'f2', libelle: 'Vice-president' },
      { id: 'f1', libelle: 'President' },
      disposition(),
    );

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error).toContain('deja');
  });

  it('accepte un rattachement lateral entre deux branches', () => {
    // Tresorier sous Secretaire : rien ne l'interdit, l'organisation reelle
    // peut le vouloir.
    const verdict = validerLien(
      { id: 'f4', libelle: 'Tresorier' },
      { id: 'f3', libelle: 'Secretaire' },
      disposition(),
    );
    expect(verdict.ok).toBe(true);
  });

  it('ne boucle pas indefiniment sur une disposition DEJA cyclique', () => {
    // Un cycle entre en base par un appel direct que le trigger aurait rate :
    // l'ecran doit rester utilisable pour permettre de le defaire.
    const cyclique: DispositionPoste[] = [
      { fonctionId: 'f1', parentFonctionId: 'f2', x: 0, y: 0 },
      { fonctionId: 'f2', parentFonctionId: 'f1', x: 0, y: 0 },
    ];

    expect(() =>
      validerLien({ id: 'f3', libelle: 'S' }, { id: 'f1', libelle: 'P' }, cyclique),
    ).not.toThrow();
  });
});

