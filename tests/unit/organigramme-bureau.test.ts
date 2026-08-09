import { describe, expect, it } from 'vitest';

import { type FonctionBureau, type MandatMembre, composerBureau } from '@/lib/domain/bureau';
import {
  type DispositionPoste,
  dispositionParDefaut,
  fusionnerDisposition,
  racines,
  rattacherPoste,
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
  ordreProtocolaire: 10,
  estFinanciere: false,
  niveauxApplicables: ['SIEGE', 'REGIONAL', 'DISTRICT', 'PAROISSE', 'EGLISE', 'CELLULE'],
  isActive: true,
  ...p,
});

const FONCTIONS = [
  fonction({ id: 'f1', libelle: 'President', ordreProtocolaire: 10 }),
  fonction({ id: 'f2', libelle: 'Vice-president', ordreProtocolaire: 20 }),
  fonction({ id: 'f3', libelle: 'Secretaire', ordreProtocolaire: 30 }),
  fonction({ id: 'f4', libelle: 'Tresorier', ordreProtocolaire: 30, estFinanciere: true }),
];

const postesVides = () => composerBureau(FONCTIONS, [] as MandatMembre[], 'EGLISE');

describe('Disposition de depart — le rang protocolaire', () => {
  it('rattache chaque rang au poste PRINCIPAL du rang precedent', () => {
    const disposition = dispositionParDefaut(postesVides());

    const par = new Map(disposition.map((d) => [d.fonctionId, d]));
    expect(par.get('f1')?.parentFonctionId).toBeNull();
    expect(par.get('f2')?.parentFonctionId).toBe('f1');
    expect(par.get('f3')?.parentFonctionId).toBe('f2');
    expect(par.get('f4')?.parentFonctionId).toBe('f2');
  });

  it('aligne les fonctions de MEME rang sur une bande', () => {
    // Secretaire et Tresorier partagent l'ordre 30 : meme hauteur, abscisses
    // differentes. Les empiler ferait croire que l'un prime sur l'autre.
    const par = new Map(dispositionParDefaut(postesVides()).map((d) => [d.fonctionId, d]));

    expect(par.get('f3')?.y).toBe(par.get('f4')?.y);
    expect(par.get('f3')?.x).not.toBe(par.get('f4')?.x);
  });

  it('ne propose rien pour un bureau sans fonction applicable', () => {
    expect(dispositionParDefaut([])).toEqual([]);
  });
});

describe('Fusion — la disposition ARRANGE des postes, elle ne les enumere pas', () => {
  it('conserve une fonction applicable qui n a jamais ete placee', () => {
    // C'est le point le plus important du module : sans lui, une fonction
    // ajoutee au referentiel apres coup disparaitrait du bureau, qui
    // paraitrait complet.
    const enregistrees: DispositionPoste[] = [
      { fonctionId: 'f1', parentFonctionId: null, x: 100, y: 200 },
    ];

    const fusion = fusionnerDisposition(postesVides(), enregistrees);

    expect(fusion).toHaveLength(4);
    expect(fusion.find((d) => d.fonctionId === 'f1')).toEqual({
      fonctionId: 'f1',
      parentFonctionId: null,
      x: 100,
      y: 200,
    });
    // La nouvelle venue prend sa place par defaut, pas (0, 0).
    expect(fusion.find((d) => d.fonctionId === 'f4')?.parentFonctionId).toBe('f2');
  });

  it('ecarte un parent devenu INAPPLICABLE plutot que de dessiner dans le vide', () => {
    // La fonction f9 n'est plus applicable au niveau de l'entite : un trait
    // vers un bloc absent laisserait un organigramme incoherent a l'ecran.
    const fusion = fusionnerDisposition(postesVides(), [
      { fonctionId: 'f3', parentFonctionId: 'f9', x: 0, y: 0 },
    ]);

    expect(fusion.find((d) => d.fonctionId === 'f3')?.parentFonctionId).toBeNull();
  });

  it('ignore une disposition portant une fonction qui n existe plus', () => {
    const fusion = fusionnerDisposition(postesVides(), [
      { fonctionId: 'disparue', parentFonctionId: null, x: 5, y: 5 },
    ]);

    expect(fusion.map((d) => d.fonctionId)).toEqual(['f1', 'f2', 'f3', 'f4']);
  });
});

describe('EF-BUR-07 — un organigramme reste un ARBRE', () => {
  const disposition = () => dispositionParDefaut(postesVides());

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
    // Tresorier sous Secretaire : rien ne l'interdit, ce sont deux postes de
    // meme rang mais l'organisation reelle peut le vouloir.
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

describe('Rattachement et racines', () => {
  it('detache un bloc sans le supprimer', () => {
    const apres = rattacherPoste(dispositionParDefaut(postesVides()), 'f3', null);

    expect(apres).toHaveLength(4);
    expect(apres.find((d) => d.fonctionId === 'f3')?.parentFonctionId).toBeNull();
  });

  it('admet PLUSIEURS racines', () => {
    // Un bureau se compose parfois de branches sans sommet commun. Imposer une
    // racine unique obligerait a inventer un poste.
    const apres = rattacherPoste(dispositionParDefaut(postesVides()), 'f3', null);
    expect(racines(apres).map((d) => d.fonctionId)).toEqual(['f1', 'f3']);
  });

  it('laisse intacts les blocs que le rattachement ne concerne pas', () => {
    const avant = dispositionParDefaut(postesVides());
    const apres = rattacherPoste(avant, 'f3', 'f1');

    expect(apres.find((d) => d.fonctionId === 'f4')).toEqual(
      avant.find((d) => d.fonctionId === 'f4'),
    );
  });
});
