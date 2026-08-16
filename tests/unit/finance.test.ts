import { describe, expect, it } from 'vitest';

import {
  FILTRES_MOUVEMENTS_VIDES,
  type MouvementPourSolde,
  type Solde,
  attendUneValidation,
  compteDansLeSolde,
  estCritique,
  estModifiable,
  filtreEstActif,
  filtrerMouvements,
  nombreFiltresAvances,
  peutValider,
  periodeDe,
  soldeConsolide,
  soldeDeMouvements,
  soldeDesDescendants,
  soldePropre,
  transitionAutorisee,
} from '@/lib/domain/finance';

/**
 * EF-FIN-01 a 20 — finances.
 *
 * Ces tests doublent le trigger `fn_finance_before_write` : le SQL protege
 * contre les appels directs, ce module produit le message a l'utilisateur
 * (CA-02).
 */

const solde = (p: Partial<Solde> = {}): Solde => ({
  recettesPropres: 0,
  depensesPropres: 0,
  recettesConsolidees: 0,
  depensesConsolidees: 0,
  ...p,
});

describe('RG-17 — un mouvement valide est immuable', () => {
  it("ne mene qu'a l'annulation", () => {
    /**
     * Un mouvement valide a deja compte dans un solde, sur lequel quelqu'un a
     * pu decider une depense. Le corriger en silence reecrirait l'histoire :
     * l'annulation, elle, laisse la ligne d'origine visible.
     */
    expect(transitionAutorisee('VALIDE', 'ANNULE')).toBe(true);
    expect(transitionAutorisee('VALIDE', 'BROUILLON')).toBe(false);
    expect(transitionAutorisee('VALIDE', 'SOUMIS')).toBe(false);
    expect(transitionAutorisee('VALIDE', 'REJETE')).toBe(false);
  });

  it('ne se modifie plus a l ecran non plus', () => {
    // Proposer « Modifier » pour declencher ensuite une exception SQL est une
    // promesse qu'on ne tient pas.
    expect(estModifiable('VALIDE')).toBe(false);
    expect(estModifiable('BROUILLON')).toBe(true);
    expect(estModifiable('REJETE')).toBe(true);
  });

  it('un mouvement annule est une fin de course', () => {
    for (const vers of ['BROUILLON', 'SOUMIS', 'VALIDE', 'REJETE'] as const) {
      expect(transitionAutorisee('ANNULE', vers)).toBe(false);
    }
  });
});

describe('EF-FIN-14 — le workflow de validation', () => {
  it('rend un rejet CORRIGIBLE : ce n est pas une fin de course', () => {
    // Un rejet motive est une demande de correction. Sans ce retour, il
    // faudrait ressaisir le mouvement de zero.
    expect(transitionAutorisee('REJETE', 'BROUILLON')).toBe(true);
  });

  it('laisse passer un brouillon directement en valide', () => {
    // RG-16 — c'est le chemin qu'emprunte une entite dont le workflow est
    // inactif : la saisie vaut validation.
    expect(transitionAutorisee('BROUILLON', 'VALIDE')).toBe(true);
  });

  it('ne compte QUE le valide dans le solde — RG-18', () => {
    expect(compteDansLeSolde('VALIDE')).toBe(true);
    for (const statut of ['BROUILLON', 'SOUMIS', 'REJETE', 'ANNULE'] as const) {
      // Un brouillon de dix millions ne rend riche personne.
      expect(compteDansLeSolde(statut)).toBe(false);
    }
  });

  it('ne met dans la file d attente que ce qui attend une decision', () => {
    expect(attendUneValidation('SOUMIS')).toBe(true);
    expect(attendUneValidation('BROUILLON')).toBe(false);
  });
});

describe('EF-FIN-18 — separation entre saisie et validation', () => {
  const mien = { soumis_par: 'moi', saisi_par: 'moi' };
  const autre = { soumis_par: 'toi', saisi_par: 'toi' };

  it('refuse a celui qui a soumis de valider lui-meme', () => {
    const verdict = peutValider(mien, 'moi', {
      separationActive: true,
      detientDoubleRole: false,
    });

    expect(verdict.autorise).toBe(false);
    // Le refus DIT ou se leve la regle : un blocage sans issue fait chercher.
    expect(verdict.motif).toContain('parametres');
  });

  it("laisse valider le mouvement d'un autre", () => {
    expect(
      peutValider(autre, 'moi', { separationActive: true, detientDoubleRole: false })
        .autorise,
    ).toBe(true);
  });

  it('cede devant le double role EXPLICITE', () => {
    // Une eglise de trois personnes n'a personne d'autre — mais le droit se
    // detient, il ne se suppose pas.
    expect(
      peutValider(mien, 'moi', { separationActive: true, detientDoubleRole: true })
        .autorise,
    ).toBe(true);
  });

  it('ne s applique pas quand la separation est levee', () => {
    expect(
      peutValider(mien, 'moi', { separationActive: false, detientDoubleRole: false })
        .autorise,
    ).toBe(true);
  });

  it('retombe sur l auteur de la SAISIE quand rien n a ete soumis', () => {
    // Workflow inactif : le mouvement est valide sans passer par « soumis ».
    // Sans ce repli, `soumis_par` nul aurait laisse tout le monde valider.
    const verdict = peutValider({ soumis_par: null, saisi_par: 'moi' }, 'moi', {
      separationActive: true,
      detientDoubleRole: false,
    });
    expect(verdict.autorise).toBe(false);
  });
});

describe('EF-FIN-09 a 13 — le solde', () => {
  it('distingue le PROPRE du CONSOLIDE — EF-FIN-12', () => {
    /**
     * Une paroisse dont le consolide est confortable peut n'avoir rien en
     * propre : confondre les deux fait engager l'argent de ses eglises.
     */
    const s = solde({
      recettesPropres: 100,
      depensesPropres: 140,
      recettesConsolidees: 1000,
      depensesConsolidees: 400,
    });

    expect(soldePropre(s)).toBe(-40);
    expect(soldeConsolide(s)).toBe(600);
    expect(soldeDesDescendants(s)).toBe(640);
  });

  it('signale un consolide negatif — EF-FIN-13', () => {
    expect(estCritique(solde({ depensesConsolidees: 1 }))).toBe(true);
  });

  it("ne signale PAS une entite que son sous-arbre couvre", () => {
    // Solde propre negatif, ensemble positif : ce n'est pas un peril.
    const s = solde({
      depensesPropres: 50,
      recettesConsolidees: 300,
      depensesConsolidees: 50,
    });

    expect(soldePropre(s)).toBe(-50);
    expect(estCritique(s)).toBe(false);
  });

  it('un solde nul n est pas critique', () => {
    expect(estCritique(solde())).toBe(false);
  });
});

describe('EF-FIN-10 — le solde d une SELECTION suit les filtres', () => {
  const ligne = (p: Partial<MouvementPourSolde>): MouvementPourSolde => ({
    sens: 'RECETTE',
    montant: 100,
    statut: 'VALIDE',
    entity_id: 'racine',
    ...p,
  });

  it('separe le propre du consolide, comme la fonction SQL', () => {
    const solde = soldeDeMouvements(
      [
        ligne({ montant: 1000 }),
        ligne({ montant: 400, sens: 'DEPENSE' }),
        ligne({ montant: 500, entity_id: 'fille' }),
      ],
      'racine',
    );

    expect(solde.recettesPropres).toBe(1000);
    expect(solde.depensesPropres).toBe(400);
    expect(solde.recettesConsolidees).toBe(1500);
    expect(soldeDesDescendants(solde)).toBe(500);
  });

  it('IGNORE tout ce qui n est pas valide — RG-18', () => {
    /**
     * Le piege de l'exercice. Filtrer sur « Brouillon » puis sommer ce qu'on
     * voit produirait un nombre qui a l'air d'un solde, qui se lit comme un
     * solde, et sur lequel on engagerait une depense.
     */
    const solde = soldeDeMouvements(
      [
        ligne({ montant: 9_000_000, statut: 'BROUILLON' }),
        ligne({ montant: 8_000_000, statut: 'SOUMIS' }),
        ligne({ montant: 7_000_000, statut: 'REJETE' }),
        ligne({ montant: 6_000_000, statut: 'ANNULE' }),
      ],
      'racine',
    );

    expect(soldeConsolide(solde)).toBe(0);
    expect(solde.recettesConsolidees).toBe(0);
  });

  it('ne compte RIEN en propre quand aucune entite n est designee', () => {
    // Le cas du compte sans rattachement lisible : le consolide reste juste,
    // et le propre s'annonce a zero plutot que de designer une entite au
    // hasard.
    const solde = soldeDeMouvements([ligne({ montant: 300 })], null);

    expect(solde.recettesConsolidees).toBe(300);
    expect(solde.recettesPropres).toBe(0);
  });

  it('rend un solde nul sur une selection vide', () => {
    expect(soldeConsolide(soldeDeMouvements([], 'racine'))).toBe(0);
  });

  it('additionne les centimes sans les perdre', () => {
    const solde = soldeDeMouvements(
      [ligne({ montant: 0.1 }), ligne({ montant: 0.2 })],
      'racine',
    );
    expect(solde.recettesConsolidees).toBeCloseTo(0.3, 10);
  });
});

describe('La periode est la maille des consolidations', () => {
  it('ramene toute date au 1er du mois, comme le trigger', () => {
    expect(periodeDe('2026-08-31')).toBe('2026-08-01');
    expect(periodeDe('2026-01-01')).toBe('2026-01-01');
  });

  it('ne change JAMAIS de mois en traversant un fuseau', () => {
    /**
     * Le premier jet passait par `new Date(...)` puis `getMonth()`, qui relit
     * la date dans le fuseau du navigateur. A Antananarivo (UTC+3), une
     * operation du 31 aout ressortait en SEPTEMBRE : un mois se serait ferme
     * avec les recettes du suivant. Une colonne `date` n'a pas de fuseau — on
     * ne lui en invente pas un.
     */
    const dernierJour = ['01', '03', '05', '07', '08', '10', '12'].map(
      (mois) => `2026-${mois}-31`,
    );

    for (const jour of dernierJour) {
      expect(periodeDe(jour)).toBe(`${jour.slice(0, 7)}-01`);
    }
  });
});

describe('EF-FIN-22 — filtrer les mouvements', () => {
  const base = {
    entity_id: 'e1',
    categorie_id: 'c1',
    sens: 'RECETTE' as const,
    montant: 100_000,
    date_operation: '2026-08-15',
    libelle: 'Offrande du dimanche',
    reference: 'REF-1',
    statut: 'VALIDE' as const,
    est_delegue: false,
    saisi_par: 'p1',
    categorie: { libelle: 'Offrandes' },
    entite: { nom: 'Antsahatsiresy' },
  };

  const lot = [
    base,
    { ...base, entity_id: 'e2', categorie_id: 'c2', montant: 30_000,
      date_operation: '2026-07-05', sens: 'DEPENSE' as const, saisi_par: 'p2',
      est_delegue: true, libelle: 'Electricite', reference: 'REF-2',
      categorie: { libelle: 'Charges' }, entite: { nom: 'Avaradrano' } },
    { ...base, montant: 2_000_000, date_operation: '2026-09-20',
      statut: 'BROUILLON' as const, libelle: 'Don exceptionnel', reference: 'REF-3' },
  ];

  it('ne retire rien sans critere', () => {
    expect(filtrerMouvements(lot, FILTRES_MOUVEMENTS_VIDES)).toHaveLength(3);
    expect(filtreEstActif(FILTRES_MOUVEMENTS_VIDES)).toBe(false);
  });

  it('filtre par categorie et par auteur', () => {
    expect(
      filtrerMouvements(lot, { ...FILTRES_MOUVEMENTS_VIDES, categorieId: 'c2' }),
    ).toHaveLength(1);
    expect(
      filtrerMouvements(lot, { ...FILTRES_MOUVEMENTS_VIDES, auteurId: 'p1' }),
    ).toHaveLength(2);
  });

  it('INCLUT les deux bornes de la periode', () => {
    /**
     * « Du 1er au 31 aout » designe aout entier pour tout le monde sauf pour
     * un informaticien. Une borne exclue amputerait silencieusement le dernier
     * jour d'un mois — celui ou l'on saisit le plus.
     */
    const aout = { ...FILTRES_MOUVEMENTS_VIDES, du: '2026-08-01', au: '2026-08-31' };
    expect(filtrerMouvements(lot, aout)).toHaveLength(1);

    const jourExact = { ...FILTRES_MOUVEMENTS_VIDES, du: '2026-08-15', au: '2026-08-15' };
    expect(filtrerMouvements(lot, jourExact)).toHaveLength(1);
  });

  it('compare les dates en CHAINES, sans passer par un fuseau', () => {
    // Une colonne `date` n'a pas de fuseau : la convertir ferait basculer un
    // mouvement du 31 dans le mois suivant selon la machine qui lit.
    const septembre = { ...FILTRES_MOUVEMENTS_VIDES, du: '2026-09-01' };
    expect(filtrerMouvements(lot, septembre).map((m) => m.reference)).toEqual(['REF-3']);
  });

  it('filtre par plage de montants, bornes incluses', () => {
    expect(
      filtrerMouvements(lot, {
        ...FILTRES_MOUVEMENTS_VIDES,
        montantMin: 30_000,
        montantMax: 100_000,
      }),
    ).toHaveLength(2);

    // Une seule borne suffit : chercher « au-dessus d'un million » est le cas
    // le plus courant, et n'a pas de plafond naturel.
    expect(
      filtrerMouvements(lot, { ...FILTRES_MOUVEMENTS_VIDES, montantMin: 1_000_000 }),
    ).toHaveLength(1);
  });

  it('separe la saisie directe de la saisie deleguee', () => {
    // EF-FIN-06 — l'origine se filtre, et pas seulement se signale.
    expect(
      filtrerMouvements(lot, { ...FILTRES_MOUVEMENTS_VIDES, origine: 'DELEGUEE' }),
    ).toHaveLength(1);
    expect(
      filtrerMouvements(lot, { ...FILTRES_MOUVEMENTS_VIDES, origine: 'DIRECTE' }),
    ).toHaveLength(2);
  });

  it('cumule les criteres', () => {
    expect(
      filtrerMouvements(lot, {
        ...FILTRES_MOUVEMENTS_VIDES,
        sens: ['RECETTE'],
        statuts: ['VALIDE'],
        du: '2026-08-01',
      }),
    ).toHaveLength(1);
  });

  it('cherche dans le libelle, la reference, la categorie et l entite', () => {
    for (const terme of ['electricite', 'REF-2', 'charges', 'avaradrano']) {
      expect(
        filtrerMouvements(lot, { ...FILTRES_MOUVEMENTS_VIDES, recherche: terme }),
      ).toHaveLength(1);
    }
  });

  it('compte les criteres AVANCES, ceux qu un panneau replie cache', () => {
    // Sans ce compte, un filtre pose derriere « Plus de filtres » explique un
    // resultat vide sans qu'on puisse le voir.
    expect(nombreFiltresAvances(FILTRES_MOUVEMENTS_VIDES)).toBe(0);
    expect(
      nombreFiltresAvances({
        ...FILTRES_MOUVEMENTS_VIDES,
        categorieId: 'c1',
        du: '2026-08-01',
        origine: 'DELEGUEE',
      }),
    ).toBe(3);
    // L'entite et le sens ne sont PAS avances : ils restent visibles.
    expect(
      nombreFiltresAvances({ ...FILTRES_MOUVEMENTS_VIDES, entiteId: 'e1', sens: ['RECETTE'] }),
    ).toBe(0);
  });
});
