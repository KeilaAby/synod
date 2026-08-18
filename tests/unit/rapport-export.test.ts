import { describe, expect, it } from 'vitest';

import { lignesExportables } from '@/components/rapports/exporter-donnees';
import type { ContenuRapport, StructureRapport } from '@/lib/domain/rapport';

/**
 * EF-RAP-16 — l'export des donnees sous-jacentes.
 */

const structure: StructureRapport = {
  sections: [
    {
      id: 's1',
      titre: 'Effectifs',
      blocs: [
        { id: 'b1', type: 'INDICATEUR', largeur: 'TIERS', reglages: {} },
        { id: 'b2', type: 'TABLEAU', largeur: 'PLEINE', reglages: { titre: 'Croyants' } },
        { id: 'b3', type: 'TITRE', largeur: 'PLEINE', reglages: { texte: 'Ignoré' } },
      ],
    },
    {
      id: 's2',
      titre: 'Finances',
      blocs: [{ id: 'b4', type: 'GRAPHIQUE', largeur: 'DEMI', reglages: {} }],
    },
  ],
};

const contenu: ContenuRapport = {
  b1: { genre: 'INDICATEUR', valeur: '412', legende: 'Croyants actifs' },
  b2: {
    genre: 'TABLEAU',
    colonnes: ['Nom', 'Matricule'],
    lignes: [
      ['RAKOTO Jean', 'CRO-00412'],
      ['RASOA Marie', 'CRO-00518'],
    ],
  },
  b4: {
    genre: 'SERIE',
    libelles: ['Jan', 'Fév'],
    valeurs: [1_240_000, 385_000],
    legende: 'Recettes par mois',
  },
};

describe('EF-RAP-16 — les donnees sous-jacentes', () => {
  it('exporte les blocs de DONNEES, pas la mise en page', () => {
    // Un titre ou un saut de page n'a rien a faire dans un classeur : ce sont
    // des elements de document, pas des donnees a retravailler.
    const lignes = lignesExportables(structure, contenu);
    const plat = lignes.flat().join('|');

    expect(plat).toContain('RAKOTO Jean');
    expect(plat).not.toContain('Ignoré');
  });

  it('garde les montants en NOMBRES', () => {
    /**
     * C'est la premiere chose qu'on fait d'un export : le sommer. Un texte le
     * perdrait — meme raison qu'EF-FIN-25, ou le XLSX existe justement pour
     * cela quand le CSV ne le peut pas.
     */
    const lignes = lignesExportables(structure, contenu);
    const serie = lignes.find((l) => l[0] === 'Jan');

    expect(serie?.[1]).toBe(1_240_000);
    expect(typeof serie?.[1]).toBe('number');
  });

  it('n exporte QUE ce qui a ete fige', () => {
    // Un bloc sans contenu resolu — omis par RG-26, ou d'un type que le
    // resolveur ne remplit pas — ne produit aucune ligne : le classeur dit
    // exactement ce que dit le papier.
    const lignes = lignesExportables(structure, { b1: contenu.b1! });
    expect(lignes.flat().join('|')).not.toContain('RAKOTO Jean');
  });

  it('titre chaque tableau, pour qu il se retrouve dans le classeur', () => {
    const lignes = lignesExportables(structure, contenu);
    expect(lignes.some((l) => l[0] === 'Croyants')).toBe(true);
  });

  it('rend une liste vide quand rien n a ete resolu', () => {
    expect(lignesExportables(structure, {})).toEqual([]);
  });
});
