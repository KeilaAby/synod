import { describe, expect, it } from 'vitest';

import {
  type Solde,
  attendUneValidation,
  compteDansLeSolde,
  estCritique,
  estModifiable,
  peutValider,
  periodeDe,
  soldeConsolide,
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
