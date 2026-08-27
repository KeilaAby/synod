import { describe, expect, it } from 'vitest';

import {
  type CroyantHistorique,
  type MandatHistorique,
  type TransfertHistorique,
  CLES_ICONE,
  apparenceEvenement,
  construireHistorique,
} from '@/lib/domain/historique';

/**
 * EF-CRO-06, EF-TRF-08 — frise chronologique d'un croyant.
 *
 * Ces tests existent parce que la section « Historique » de la fiche est restee
 * un texte d'attente apres la livraison des transferts : le module etait ecrit,
 * l'ecran ne l'appelait pas. Ce qui n'est pas verifie n'est pas branche.
 */

const croyant: CroyantHistorique = {
  created_at: '2026-01-15T09:00:00Z',
  date_bapteme: '2026-03-20',
  eglise: { nom: 'IAVOAMBONY', type: 'EGLISE' },
  createur: { nom_complet: 'Christian' },
};

const gabarit = (p: Partial<TransfertHistorique>): TransfertHistorique => ({
  id: 't1',
  statut: 'EFFECTUE',
  motif: 'Demenagement',
  motif_refus: null,
  date_demande: '2026-06-01T10:00:00Z',
  date_decision: '2026-06-02T10:00:00Z',
  date_effet: '2026-06-03',
  origine: { nom: 'IAVOAMBONY', type: 'EGLISE' as const },
  destination: { nom: 'AMBOHITRIMANJAKA' },
  celluleDestination: null,
  demandeur: { nom_complet: 'Christian' },
  decideur: { nom_complet: 'Le Siege' },
  ...p,
});

describe('EF-CRO-06 — composition de la frise', () => {
  it('porte toujours la creation de la fiche', () => {
    const frise = construireHistorique({ ...croyant, date_bapteme: null }, []);
    expect(frise).toHaveLength(1);
    expect(frise[0]).toMatchObject({ type: 'CREATION', enAttente: false });
  });

  it("n'invente pas de bapteme quand la date est absente", () => {
    // La date de bapteme est facultative depuis le 6 aout 2026 : un evenement
    // sans date se placerait n'importe ou sur la frise.
    const frise = construireHistorique({ ...croyant, date_bapteme: null }, []);
    expect(frise.some((e) => e.type === 'BAPTEME')).toBe(false);
  });

  /**
   * L'ORDRE A CHANGE LE 26 AOUT 2026, sur decision de l'utilisateur : la
   * frise se lit desormais du plus ANCIEN au plus recent, a l ecran comme
   * sur le papier. Une frise raconte un parcours, et un parcours se lit dans
   * le sens ou il a eu lieu.
   *
   * « Fiche creee » est EPINGLEE en tete :  date
   * l'enregistrement, pas un evenement de la vie du croyant.
   */
  it('classe du plus ancien au plus recent, la creation en tete', () => {
    const frise = construireHistorique(croyant, [gabarit({})]);
    expect(frise.map((e) => e.type)).toEqual(['CREATION', 'BAPTEME', 'TRANSFERT']);
  });
});

describe('EF-TRF-08 — un transfert se lit a la date ou il a produit son effet', () => {
  it('situe un transfert EFFECTUE a sa date d effet', () => {
    // Ce n'est pas le jour de la demande qui compte, c'est celui ou le croyant
    // a effectivement change d'eglise.
    const transfert = construireHistorique(croyant, [gabarit({})]).find(
      (e) => e.type === 'TRANSFERT',
    );
    expect(transfert!.date).toBe('2026-06-03');
    expect(transfert!.titre).toContain('IAVOAMBONY');
    expect(transfert!.titre).toContain('AMBOHITRIMANJAKA');
  });

  it('situe un refus a la date de decision, et montre son motif', () => {
    const transfert = construireHistorique(croyant, [
      gabarit({
        statut: 'REFUSE',
        date_effet: null,
        motif_refus: 'Effectif deja au complet',
      }),
    ]).find(
      (e) => e.type === 'TRANSFERT',
    );

    expect(transfert!.date).toBe('2026-06-02T10:00:00Z');
    expect(transfert!.titre).toContain('refuse');
    // Le motif du REFUS prime sur celui de la demande : c'est lui qui explique
    // l'issue, et c'est ce que le demandeur a besoin de lire.
    expect(transfert!.note).toBe('Effectif deja au complet');
    expect(transfert!.enAttente).toBe(false);
  });

  it('situe une demande en attente a sa date de demande, et la signale', () => {
    const transfert = construireHistorique(croyant, [
      gabarit({ statut: 'DEMANDE', date_decision: null, date_effet: null }),
    ]).find(
      (e) => e.type === 'TRANSFERT',
    );

    expect(transfert!.date).toBe('2026-06-01T10:00:00Z');
    // RG-11 — rien n'est encore arrive au croyant : la frise ne doit pas le
    // laisser croire.
    expect(transfert!.enAttente).toBe(true);
    expect(transfert!.detail).toContain('Christian');
  });

  it('EF-TRF-06 — porte la chaine complete : qui a demande, qui a decide, quand', () => {
    const transfert = construireHistorique(croyant, [gabarit({})]).find(
      (e) => e.type === 'TRANSFERT',
    );

    // L'evenement est situe au 3 juin (date d'effet) ; le recit doit donc
    // porter les DEUX autres dates, sans quoi l'ecart entre demande et
    // application resterait invisible.
    expect(transfert!.detail).toContain('Christian');
    expect(transfert!.detail).toContain('Le Siege');
    expect(transfert!.detail).toContain('1 juin 2026');
    expect(transfert!.detail).toContain('2 juin 2026');
  });

  it('nomme un compte supprime plutot que de laisser un blanc', () => {
    // `on delete set null` sur le demandeur : un blanc ferait croire a une
    // donnee manquante plutot qu'a un compte disparu.
    const transfert = construireHistorique(croyant, [
      gabarit({ demandeur: null, decideur: null }),
    ]).find(
      (e) => e.type === 'TRANSFERT',
    );
    expect(transfert!.detail).toContain('supprime');
  });

  it('marque un transfert approuve comme non encore applique', () => {
    const transfert = construireHistorique(croyant, [
      gabarit({ statut: 'APPROUVE', date_effet: null }),
    ]).find(
      (e) => e.type === 'TRANSFERT',
    );
    expect(transfert!.enAttente).toBe(true);
  });

  it('reste lisible quand une entite a disparu', () => {
    // `on delete set null` sur l'origine : une entite supprimee ne doit pas
    // produire « Transfere de undefined ».
    const transfert = construireHistorique(croyant, [gabarit({ origine: null })]).find(
      (e) => e.type === 'TRANSFERT',
    );
    expect(transfert!.titre).not.toContain('undefined');
    expect(transfert!.titre).toContain('AMBOHITRIMANJAKA');
  });
});

describe('EF-BUR-10 — les fonctions occupees rejoignent la frise', () => {
  const mandat = (p: Partial<MandatHistorique> = {}): MandatHistorique => ({
    id: 'b1',
    date_debut: '2026-02-01',
    date_fin: null,
    fonction: { libelle: 'Tresorier' },
    bureau: {
      libelle: 'Bureau executif',
      entite: { nom: 'AVARADRANO', type: 'DISTRICT' },
    },
    ...p,
  });

  it('situe un mandat a sa PRISE DE FONCTION', () => {
    // C'est le jour ou la personne est devenue tresoriere qui fait evenement,
    // pas celui ou elle a cesse de l'etre.
    const frise = construireHistorique(croyant, [], [mandat()]);
    const evenement = frise.find((e) => e.type === 'MANDAT');

    expect(evenement?.date).toBe('2026-02-01');
  });

  it('dit CE QU ON ETAIT, avec le niveau de l entite', () => {
    // « President — ANTSAHATSIRESY » obligeait a deviner : president de quoi,
    // et ANTSAHATSIRESY est-il une eglise ou un district ?
    const [evenement] = construireHistorique(croyant, [], [mandat()]).filter(
      (e) => e.type === 'MANDAT',
    );

    expect(evenement?.titre).toBe('Membre de bureau du District AVARADRANO');
  });

  it('porte la PERIODE et la fonction dans le detail', () => {
    const [clos] = construireHistorique(
      croyant,
      [],
      [mandat({ date_fin: '2026-06-30' })],
    ).filter((e) => e.type === 'MANDAT');

    expect(clos?.detail).toBe('du 1 février 2026 au 30 juin 2026 : Tresorier');
    // Un mandat clos a bien eu lieu : il n'est pas « en attente ».
    expect(clos?.enAttente).toBe(false);
  });

  it('distingue un mandat EN COURS, qui n a pas de fin a annoncer', () => {
    const [enCours] = construireHistorique(croyant, [], [mandat()]).filter(
      (e) => e.type === 'MANDAT',
    );

    expect(enCours?.detail).toBe('depuis le 1 février 2026 : Tresorier');
  });

  it('reste lisible quand l entite du bureau est illisible', () => {
    const [sansEntite] = construireHistorique(
      croyant,
      [],
      [mandat({ bureau: { libelle: 'Bureau', entite: null } })],
    ).filter((e) => e.type === 'MANDAT');

    expect(sansEntite?.titre).toBe('Membre de bureau');
    expect(sansEntite?.titre).not.toContain('undefined');
  });

  it('s intercale chronologiquement avec les autres evenements', () => {
    const frise = construireHistorique(croyant, [], [mandat()]);
    // Creation 15 janvier, mandat 1er fevrier, bapteme 20 mars — et la
    // creation reste en tete, ce que sa date confirme ici par hasard.
    expect(frise.map((e) => e.type)).toEqual(['CREATION', 'MANDAT', 'BAPTEME']);
  });

  it('reste lisible quand une fonction ou une entite a disparu', () => {
    const [evenement] = construireHistorique(
      croyant,
      [],
      [mandat({ fonction: null, bureau: null })],
    ).filter((e) => e.type === 'MANDAT');

    expect(evenement?.titre).not.toContain('undefined');
    expect(evenement?.detail).not.toContain('undefined');
  });
});

/**
 * EF-CRO-06 — L'ECRAN ET LE PAPIER MONTRENT LA MEME PASTILLE.
 *
 * La decision vit dans le domaine ; chaque cote la REND a sa facon — le
 * composant par une icone de la bibliotheque, l'impression par un `<svg>` ecrit
 * en clair. Ces tests verrouillent l'accord : sans eux, ajouter un type
 * d'evenement laisserait un trou dans l'un des deux rendus, et c'est le PAPIER
 * qu'on ne regarde qu'apres impression.
 */
describe('apparenceEvenement', () => {
  const cas = [
    ['CREATION', 'creation'],
    ['BAPTEME', 'bapteme'],
    ['MANDAT', 'mandat'],
  ] as const;

  it.each(cas)('rend une clé stable pour %s', (type, attendue) => {
    expect(
      apparenceEvenement({ type, enAttente: false }).icone,
    ).toBe(attendue);
  });

  /**
   * Un refus garde l'icone du GRADE et non celle d'un rejet : c'est la
   * reconnaissance qui a ete refusee, pas la personne, et la frise raconte un
   * parcours, pas un verdict.
   */
  it('EF-CRO-12 — un grade en attente se distingue d’un grade décidé', () => {
    expect(apparenceEvenement({ type: 'GRADE', enAttente: true }).icone).toBe(
      'grade-attente',
    );
    expect(apparenceEvenement({ type: 'GRADE', enAttente: false }).icone).toBe('grade');
  });

  it('distingue les quatre issues d’un transfert', () => {
    const issue = (statut: 'EFFECTUE' | 'REFUSE' | 'ANNULE' | 'DEMANDE') =>
      apparenceEvenement({ type: 'TRANSFERT', statut, enAttente: false }).icone;

    expect(issue('EFFECTUE')).toBe('transfert-effectue');
    expect(issue('REFUSE')).toBe('transfert-refuse');
    expect(issue('ANNULE')).toBe('transfert-annule');
    expect(issue('DEMANDE')).toBe('transfert-attente');
  });

  /**
   * UN STATUT INCONNU NE FAIT PAS TOMBER LA FRISE : il retombe sur l'icone
   * generique du transfert. Une pastille manquante laisserait un trou dans un
   * document imprime, sans rien dire.
   */
  it('retombe sur l’icône générique pour un statut non prévu', () => {
    expect(apparenceEvenement({ type: 'TRANSFERT', enAttente: false }).icone).toBe(
      'transfert',
    );
  });

  /** Les teintes servent AUSSI au HTML imprime : elles doivent etre litterales. */
  it('rend des couleurs littérales, utilisables hors de Tailwind', () => {
    for (const type of ['CREATION', 'BAPTEME', 'MANDAT', 'GRADE', 'TRANSFERT'] as const) {
      const a = apparenceEvenement({ type, enAttente: false });
      expect(a.fond, type).toMatch(/^#[0-9a-f]{6}$/i);
      expect(a.trait, type).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  /**
   * TOUTE CLE DECLAREE DOIT ETRE ATTEIGNABLE. Une cle que rien ne produit est
   * du rendu mort dans les deux tables — et si l'inverse arrive (une cle
   * produite sans entree de table), le typage `Record<CleIcone, …>` le refuse
   * a la compilation.
   */
  it('ne déclare aucune clé que rien ne produit', () => {
    const produites = new Set<string>();

    for (const type of ['CREATION', 'BAPTEME', 'MANDAT'] as const) {
      produites.add(apparenceEvenement({ type, enAttente: false }).icone);
    }
    for (const enAttente of [true, false]) {
      produites.add(apparenceEvenement({ type: 'GRADE', enAttente }).icone);
    }
    for (const statut of ['EFFECTUE', 'REFUSE', 'ANNULE', 'DEMANDE'] as const) {
      produites.add(
        apparenceEvenement({ type: 'TRANSFERT', statut, enAttente: false }).icone,
      );
    }
    produites.add(apparenceEvenement({ type: 'TRANSFERT', enAttente: false }).icone);

    expect([...produites].sort()).toEqual([...CLES_ICONE].sort());
  });
});

/**
 * EF-CRO-06 — L'ORDRE DE LA FRISE, a l'ecran comme sur le papier.
 *
 * Les deux rendus montraient la meme vie dans deux sens opposes : qui
 * verifiait l'un contre l'autre devait relire a l'envers, et finissait par
 * douter des deux. Le tri est donc UNIQUE, dans le domaine.
 */
describe('L’ordre de la frise', () => {
  const croyant: CroyantHistorique = {
    // La fiche est SAISIE en 2026, pour un bapteme de 1995 : c'est le cas qui
    // fait tout l'interet de l'epinglage.
    created_at: '2026-08-24T09:00:00Z',
    date_bapteme: '1995-04-12',
    eglise: { nom: 'Ambohipo', type: 'EGLISE' },
    createur: { nom_complet: 'Christian' },
  };

  it('se lit du plus ANCIEN au plus récent', () => {
    const frise = construireHistorique(croyant, []);
    const dates = frise.filter((e) => e.cle !== 'creation').map((e) => e.date);

    expect([...dates].sort()).toEqual(dates);
  });

  /**
   * `created_at` date l'ENREGISTREMENT, pas un evenement de la vie du croyant.
   * Un tri sur les seules dates placerait le bapteme de 1995 AVANT la creation
   * de 2026, et la frise commencerait par un evenement survenu dans un systeme
   * qui n'existait pas encore.
   */
  it('EF-CRO-06 — « Fiche créée » est TOUJOURS en tête, même saisie après coup', () => {
    const frise = construireHistorique(croyant, []);

    expect(frise[0]?.cle).toBe('creation');
    // Et la preuve que ce n'est pas la date qui l'y met :
    expect(frise[0]!.date > frise[1]!.date).toBe(true);
  });

  it('garde la création en tête même quand elle précède tout le reste', () => {
    const ancienne = { ...croyant, created_at: '1990-01-01T00:00:00Z' };
    expect(construireHistorique(ancienne, [])[0]?.cle).toBe('creation');
  });
});

/**
 * EF-CRO-06 — LA LIGNE « FICHE CREEE » PORTE L'EGLISE D'ORIGINE.
 *
 * LE DEFAUT, signale sur une fiche reelle le 27 aout 2026 : elle affichait le
 * rattachement COURANT, donc changeait retroactivement apres un transfert. Une
 * fiche creee a ANTSAHATSIRESY, transferee vers ALASORA, annoncait « Rattache a
 * ALASORA » a sa date de creation — et le meme extrait laissait croire a une
 * violation de RG-09, le croyant siegeant le jour meme au bureau d'une AUTRE
 * eglise.
 *
 * Un historique qui se reecrit ne vaut pas mieux que pas d'historique.
 */
describe('L’église portée par la ligne de création', () => {
  const creation = (frise: ReturnType<typeof construireHistorique>) =>
    frise.find((e) => e.cle === 'creation');

  it('EF-CRO-06 — porte l’église D’ORIGINE, pas celle d’aujourd’hui', () => {
    // Le croyant est AUJOURD'HUI a AMBOHITRIMANJAKA ; il a ete cree a
    // IAVOAMBONY, d'ou le transfert l'a fait partir.
    const frise = construireHistorique(
      { ...croyant, eglise: { nom: 'AMBOHITRIMANJAKA', type: 'EGLISE' } },
      [gabarit({})],
    );

    expect(creation(frise)?.detail).toContain('IAVOAMBONY');
    expect(creation(frise)?.detail).not.toContain('AMBOHITRIMANJAKA');
  });

  /**
   * LE PLUS ANCIEN transfert donne l'origine : les suivants ne disent que des
   * etapes intermediaires. Deux transferts, et c'est le premier qui compte.
   */
  it('remonte au PLUS ANCIEN transfert, pas au dernier', () => {
    const frise = construireHistorique(croyant, [
      gabarit({
        id: 'recent',
        date_effet: '2026-07-10',
        origine: { nom: 'ETAPE', type: 'EGLISE' },
      }),
      gabarit({ id: 'ancien', date_effet: '2026-02-01' }),
    ]);

    expect(creation(frise)?.detail).toContain('IAVOAMBONY');
    expect(creation(frise)?.detail).not.toContain('ETAPE');
  });

  /**
   * UNE DEMANDE REFUSEE OU EN ATTENTE N'A DEPLACE PERSONNE : son origine est
   * l'eglise ACTUELLE, pas une precedente. La prendre ferait dire a la frise
   * que le croyant vient de la ou il est.
   */
  it.each(['REFUSE', 'DEMANDE', 'ANNULE'] as const)(
    'IGNORE un transfert %s : il n’a déplacé personne',
    (statut) => {
      const frise = construireHistorique(
        { ...croyant, eglise: { nom: 'ACTUELLE', type: 'EGLISE' } },
        [gabarit({ statut, origine: { nom: 'ACTUELLE', type: 'EGLISE' } })],
      );

      expect(creation(frise)?.detail).toContain('ACTUELLE');
    },
  );

  it('retombe sur l’église courante quand aucun transfert n’a eu lieu', () => {
    const frise = construireHistorique(
      { ...croyant, eglise: { nom: 'SEULE', type: 'EGLISE' } },
      [],
    );
    expect(creation(frise)?.detail).toContain('SEULE');
  });

  /** Le TYPE accompagne le nom : « ALASORA » seul ne dit pas ce que c'est. */
  it('nomme le type de l’entité, jamais le seul nom', () => {
    const frise = construireHistorique(croyant, [gabarit({})]);
    expect(creation(frise)?.detail).toMatch(/Église|Eglise/i);
  });
});
