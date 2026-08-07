import { describe, expect, it } from 'vitest';

import {
  type CandidatBureau,
  type FonctionBureau,
  type Mandat,
  type MandatMembre,
  aReconduire,
  bureauxActifs,
  candidatsEligibles,
  composerBureau,
  comptePostes,
  croyantEligible,
  fonctionApplicable,
  fonctionsDuNiveau,
  libelleAffichage,
  mandatActifDe,
  memeBureau,
  membresDeFinances,
  validerDesignation,
  validerPeriodeMandat,
} from '@/lib/domain/bureau';

/**
 * CA-02 — chaque regle de gestion est couverte par un test nomme et tracable.
 *
 * RG-07 (un membre est un croyant) est portee par la cle etrangere et le
 * trigger : elle n'a pas de contrepartie applicative a tester ici.
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

const mandat = (p: Partial<MandatMembre>): MandatMembre => ({
  id: 'm1',
  croyantId: 'c1',
  fonctionId: 'f1',
  dateDebut: '2026-01-01',
  dateFin: null,
  ...p,
});

const candidat = (p: Partial<CandidatBureau>): CandidatBureau => ({
  croyantId: 'c1',
  nom: 'KOFFI Amos',
  cheminEglise: 'nSIEGE.nDIS.nEGL',
  statut: 'ACTIF',
  ...p,
});

// -----------------------------------------------------------------------------

describe('EF-REF-03 — une fonction ne vaut que pour certains niveaux', () => {
  const tresorierEglise = fonction({
    id: 'f2',
    code: 'DIR_FINANCES',
    libelle: 'Directeur des finances',
    niveauxApplicables: ['SIEGE', 'REGIONAL', 'DISTRICT'],
    estFinanciere: true,
  });

  it('ecarte une fonction inapplicable au niveau', () => {
    // Un « Directeur des finances » n'existe pas dans une cellule de priere :
    // la proposer la ferait refuser a l'enregistrement, apres coup.
    expect(fonctionApplicable(tresorierEglise, 'DISTRICT')).toBe(true);
    expect(fonctionApplicable(tresorierEglise, 'CELLULE')).toBe(false);
  });

  it('ecarte une fonction desactivee', () => {
    expect(fonctionApplicable(fonction({ isActive: false }), 'EGLISE')).toBe(false);
  });

  it('ordonne par rang protocolaire', () => {
    const liste = [
      fonction({ id: 'a', libelle: 'Secretaire', ordreProtocolaire: 30 }),
      fonction({ id: 'b', libelle: 'President', ordreProtocolaire: 10 }),
      fonction({ id: 'c', libelle: 'Tresorier', ordreProtocolaire: 20 }),
    ];
    expect(fonctionsDuNiveau(liste, 'EGLISE').map((f) => f.libelle)).toEqual([
      'President',
      'Tresorier',
      'Secretaire',
    ]);
  });

  it('departage deux fonctions de meme rang par leur libelle', () => {
    // Sans ce depart, l'ordre dependrait de celui de la base — donc changerait
    // sans raison d'un affichage a l'autre.
    const liste = [
      fonction({ id: 'a', libelle: 'Vice-president', ordreProtocolaire: 20 }),
      fonction({ id: 'b', libelle: 'Tresorier', ordreProtocolaire: 20 }),
    ];
    expect(fonctionsDuNiveau(liste, 'EGLISE').map((f) => f.libelle)).toEqual([
      'Tresorier',
      'Vice-president',
    ]);
  });
});

// -----------------------------------------------------------------------------

describe('EF-BUR-07 — la composition montre les fonctions VACANTES', () => {
  const fonctions = [
    fonction({ id: 'f1', libelle: 'President', ordreProtocolaire: 10 }),
    fonction({ id: 'f2', libelle: 'Tresorier', ordreProtocolaire: 20, estFinanciere: true }),
    fonction({ id: 'f3', libelle: 'Secretaire', ordreProtocolaire: 30 }),
  ];

  it('porte une entree par fonction, occupee ou non', () => {
    // Masquer les vacances laisserait croire un bureau complet alors qu'il n'a
    // ni tresorier ni secretaire.
    const postes = composerBureau(fonctions, [mandat({ fonctionId: 'f1' })], 'EGLISE');

    expect(postes).toHaveLength(3);
    expect(postes[0]?.mandat).not.toBeNull();
    expect(postes[1]?.mandat).toBeNull();
    expect(comptePostes(postes)).toEqual({ total: 3, pourvus: 1, vacants: 2 });
  });

  it('RG-08 — un mandat CLOS ne tient plus la fonction', () => {
    const postes = composerBureau(
      fonctions,
      [mandat({ fonctionId: 'f1', dateFin: '2026-06-30' })],
      'EGLISE',
    );
    expect(postes[0]?.mandat).toBeNull();
  });

  it('n affiche que les fonctions applicables au niveau', () => {
    const restreinte = [
      ...fonctions,
      fonction({ id: 'f4', libelle: 'Directeur regional', niveauxApplicables: ['REGIONAL'] }),
    ];
    expect(composerBureau(restreinte, [], 'EGLISE')).toHaveLength(3);
    expect(composerBureau(restreinte, [], 'REGIONAL')).toHaveLength(4);
  });

  it('RG-31 — les membres de finances sont les titulaires d une fonction financiere', () => {
    const postes = composerBureau(
      fonctions,
      [mandat({ fonctionId: 'f1' }), mandat({ id: 'm2', croyantId: 'c2', fonctionId: 'f2' })],
      'EGLISE',
    );

    const finances = membresDeFinances(postes);
    expect(finances).toHaveLength(1);
    expect(finances[0]?.fonction.libelle).toBe('Tresorier');
  });

  it('RG-31 — une fonction financiere VACANTE ne fait pas un membre de finances', () => {
    const postes = composerBureau(fonctions, [], 'EGLISE');
    expect(membresDeFinances(postes)).toEqual([]);
  });
});

// -----------------------------------------------------------------------------

describe('RG-09 — le membre appartient au sous-arbre de l entite', () => {
  const cheminDistrict = 'nSIEGE.nDIS';

  it('accepte un croyant du sous-arbre', () => {
    expect(croyantEligible(candidat({}), cheminDistrict)).toBe(true);
  });

  it('refuse un croyant d un autre district', () => {
    // Sans cette borne, une entite pourrait nommer n'importe qui dans
    // l'organisation.
    expect(
      croyantEligible(candidat({ cheminEglise: 'nSIEGE.nDIS2.nEGL' }), cheminDistrict),
    ).toBe(false);
  });

  it('ecarte les croyants non actifs de la liste des candidats', () => {
    // Un croyant transfere ou decede n'exerce plus : le proposer reviendrait a
    // composer un bureau avec des absents.
    const liste = [
      candidat({ croyantId: 'c1' }),
      candidat({ croyantId: 'c2', statut: 'DECEDE' }),
      candidat({ croyantId: 'c3', statut: 'TRANSFERE' }),
      candidat({ croyantId: 'c4', cheminEglise: 'nAUTRE' }),
    ];

    expect(candidatsEligibles(liste, cheminDistrict).map((c) => c.croyantId)).toEqual(['c1']);
  });
});

// -----------------------------------------------------------------------------

describe('Recevabilite d une designation', () => {
  const cheminEntite = 'nSIEGE.nDIS';
  const president = fonction({ id: 'f1', libelle: 'President' });

  it('accepte une designation conforme', () => {
    expect(validerDesignation(candidat({}), president, cheminEntite, 'DISTRICT', []).ok).toBe(
      true,
    );
  });

  it('RG-08 — refuse une fonction deja occupee, et propose le remplacement', () => {
    const resultat = validerDesignation(
      candidat({ croyantId: 'c2' }),
      president,
      cheminEntite,
      'DISTRICT',
      [mandat({ fonctionId: 'f1' })],
    );

    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.error).toContain('Remplacez');
  });

  it('refuse un croyant deja membre du MEME bureau', () => {
    const resultat = validerDesignation(
      candidat({ croyantId: 'c1' }),
      fonction({ id: 'f2', libelle: 'Tresorier' }),
      cheminEntite,
      'DISTRICT',
      [mandat({ croyantId: 'c1', fonctionId: 'f1' })],
    );

    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.error).toContain('occupe deja');
  });

  it('RG-09 — refuse un croyant hors perimetre, en le nommant', () => {
    const resultat = validerDesignation(
      candidat({ cheminEglise: 'nAILLEURS', nom: 'DIALLO Fatou' }),
      president,
      cheminEntite,
      'DISTRICT',
      [],
    );

    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.error).toContain('RG-09');
      // ENF-UTI-04 — le refus NOMME la personne concernee.
      expect(resultat.error).toContain('DIALLO Fatou');
    }
  });

  it('refuse une fonction inapplicable au niveau', () => {
    const resultat = validerDesignation(
      candidat({}),
      fonction({ niveauxApplicables: ['SIEGE'] }),
      cheminEntite,
      'DISTRICT',
      [],
    );
    expect(resultat.ok).toBe(false);
  });
});

// -----------------------------------------------------------------------------

describe('RG-10 — au plus un mandat actif PAR BUREAU', () => {
  const m = (p: Partial<Mandat>): Mandat => ({
    id: 'b1',
    entityId: 'e1',
    libelle: 'Bureau executif',
    dateDebut: '2023-01-01',
    dateFin: '2026-01-01',
    isActive: false,
    ...p,
  });

  it('laisse coexister plusieurs bureaux de noms differents', () => {
    // Correction du 7 aout 2026 : la premiere redaction — un seul bureau actif
    // par entite — refusait au Comite des finances d'exister a cote du Bureau
    // executif.
    const mandats = [
      m({ id: 'b1', libelle: 'Bureau executif', isActive: true, dateFin: null }),
      m({ id: 'b2', libelle: 'Comite des finances', isActive: true, dateFin: null }),
      m({ id: 'b3', libelle: 'Commission des jeunes', isActive: true, dateFin: null }),
    ];

    expect(bureauxActifs(mandats)).toHaveLength(3);
  });

  it('ecarte les mandats clos et ordonne par nom', () => {
    const mandats = [
      m({ id: 'b1', libelle: 'Comite des finances', isActive: true, dateFin: null }),
      m({ id: 'b2', libelle: 'Bureau executif', isActive: true, dateFin: null }),
      m({ id: 'b3', libelle: 'Bureau executif' }), // mandat precedent, clos
    ];

    expect(bureauxActifs(mandats).map((b) => b.id)).toEqual(['b2', 'b1']);
  });

  it('retrouve le mandat en cours d un bureau donne', () => {
    const mandats = [
      m({ id: 'b1', libelle: 'Bureau executif', isActive: true, dateFin: null }),
      m({ id: 'b2', libelle: 'Comite des finances', isActive: true, dateFin: null }),
    ];

    expect(mandatActifDe(mandats, 'Comite des finances')?.id).toBe('b2');
    expect(mandatActifDe(mandats, 'Commission des jeunes')).toBeNull();
  });

  it('reconnait un meme bureau malgre la casse et les espaces', () => {
    // Sans cette normalisation, la contrainte d'unicite se contournerait d'une
    // majuscule — et l'entite se retrouverait avec deux « Bureau executif ».
    expect(memeBureau('Bureau Executif', '  bureau executif ')).toBe(true);
    expect(memeBureau('Bureau executif', 'Comite des finances')).toBe(false);
  });

  it('refuse une periode dont la fin precede le debut', () => {
    expect(validerPeriodeMandat('2026-01-01', '2025-12-31').ok).toBe(false);
    expect(validerPeriodeMandat('2026-01-01', '2026-01-01').ok).toBe(false);
    expect(validerPeriodeMandat('2026-01-01', null).ok).toBe(true);
  });

  it('compose l intitule affiche a partir du nom et de la periode', () => {
    // COMPOSE et non stocke : dupliquer la periode dans le libelle produirait
    // un intitule faux le jour ou le mandat est clos par anticipation.
    expect(libelleAffichage('Bureau executif', '2026-01-01', '2029-12-31')).toBe(
      'Bureau executif 2026-2029',
    );
    expect(libelleAffichage('Bureau executif', '2026-01-01', null)).toBe(
      'Bureau executif depuis 2026',
    );
  });
});

// -----------------------------------------------------------------------------

describe('EF-BUR-09 — reconduction de la composition', () => {
  it('ne reconduit QUE les mandats en cours', () => {
    // Reprendre les mandats deja clos ressusciterait des titulaires remplaces
    // en cours de route.
    const mandats = [
      mandat({ id: 'm1', croyantId: 'c1' }),
      mandat({ id: 'm2', croyantId: 'c2', dateFin: '2026-05-01' }),
      mandat({ id: 'm3', croyantId: 'c3', fonctionId: 'f2' }),
    ];

    expect(aReconduire(mandats).map((m) => m.id)).toEqual(['m1', 'm3']);
  });
});
