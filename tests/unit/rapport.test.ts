import { describe, expect, it } from 'vitest';

import { ALL_PERMISSIONS, type Permission } from '@/lib/domain/permissions';
import {
  BLOCS_RAPPORT,
  type LargeurBloc,
  PERMISSION_SOURCE,
  SOURCES,
  type StructureRapport,
  TYPES_BLOC,
  definitionBloc,
  estStructure,
  mentionOmissions,
  modeleSApplique,
  resoudreStructure,
} from '@/lib/domain/rapport';

/**
 * EF-RAP-02, EF-RAP-03, RG-26 — le registre des blocs et l'omission.
 */
describe('EF-RAP-02 — le registre des blocs', () => {
  it('porte les onze types du cahier des charges', () => {
    /**
     * Liste FIGEE volontairement : EF-RAP-02 les enumere. Un type qui en sort
     * ne provoque aucune erreur — la palette en propose simplement un de
     * moins, et personne ne s'apercoit lequel.
     */
    expect([...TYPES_BLOC].sort()).toEqual(
      [
        'FRISE',
        'GRAPHIQUE',
        'IMAGE',
        'INDICATEUR',
        'JAUGE',
        'ORGANIGRAMME',
        'SAUT_DE_PAGE',
        'SIGNATURE',
        'TABLEAU',
        'TEXTE',
        'TITRE',
      ].sort(),
    );
  });

  it('definit chaque type exactement une fois', () => {
    expect(BLOCS_RAPPORT).toHaveLength(TYPES_BLOC.length);
    for (const type of TYPES_BLOC) expect(definitionBloc(type)).not.toBeNull();
    expect(definitionBloc('INCONNU')).toBeNull();
  });

  it('ne s appuie que sur des habilitations qui existent', () => {
    // Une permission mal orthographiee n'echouerait pas : le bloc serait omis
    // pour TOUT LE MONDE, et le rapport serait silencieusement plus court.
    for (const source of SOURCES) {
      expect(ALL_PERMISSIONS).toContain(PERMISSION_SOURCE[source]);
    }
  });

  it('laisse les blocs de MISE EN PAGE sans source', () => {
    /**
     * Un titre, un saut de page ou une signature n'interrogent rien : leur
     * donner une source les rendrait omissibles, et un rapport dont le titre
     * disparait faute de droit serait illisible pour une raison qui n'a rien a
     * voir avec lui.
     */
    for (const type of ['TITRE', 'TEXTE', 'IMAGE', 'SAUT_DE_PAGE', 'SIGNATURE']) {
      expect(definitionBloc(type)!.source).toBeNull();
    }
  });
});

describe('RG-26 — les blocs non habilites sont OMIS', () => {
  const detient = (accordees: Permission[]) => (p: Permission) => accordees.includes(p);

  const bloc = (id: string, type: string, largeur: LargeurBloc = 'PLEINE') => ({
    id,
    type: type as (typeof TYPES_BLOC)[number],
    largeur,
    reglages: {},
  });

  const structure: StructureRapport = {
    sections: [
      {
        id: 's1',
        titre: 'Effectifs',
        blocs: [bloc('b1', 'TITRE'), bloc('b2', 'TABLEAU')],
      },
      {
        id: 's2',
        titre: 'Finances',
        blocs: [bloc('b3', 'GRAPHIQUE')],
      },
    ],
  };

  it('retire le bloc, il ne le vide pas', () => {
    /**
     * Un tableau de finances rendu VIDE afficherait « aucun mouvement » — ce
     * qui est faux, et se lit comme une information.
     */
    const { sections, omis } = resoudreStructure(structure, detient(['croyant.read']));

    expect(omis).toHaveLength(1);
    expect(omis[0]!.blocId).toBe('b3');
    expect(omis[0]!.motif).toContain('Finances');
    expect(sections.flatMap((s) => s.blocs).some((b) => b.id === 'b3')).toBe(false);
  });

  it('fait DISPARAITRE une section qui perd tous ses blocs', () => {
    /**
     * Un intertitre « Finances » suivi de rien apprendrait qu'il existe des
     * finances — ce que l'omission vise precisement a taire — et laisserait un
     * blanc qu'on prendrait pour un defaut de mise en page.
     */
    const { sections } = resoudreStructure(structure, detient(['croyant.read']));
    expect(sections.map((s) => s.id)).toEqual(['s1']);
  });

  it('n omet JAMAIS un bloc de mise en page', () => {
    // Aucune habilitation : le titre reste, le tableau part.
    const { sections, omis } = resoudreStructure(structure, detient([]));

    expect(sections).toHaveLength(1);
    expect(sections[0]!.blocs.map((b) => b.id)).toEqual(['b1']);
    expect(omis.map((o) => o.blocId).sort()).toEqual(['b2', 'b3']);
  });

  it('ecarte un type inconnu EN LE DISANT', () => {
    // Il vient d'une version anterieure : tenter un rendu qu'on ne sait pas
    // faire vaudrait moins que de l'ecarter et de le compter.
    const abimee: StructureRapport = {
      sections: [{ id: 's', titre: 'X', blocs: [bloc('b', 'CAMEMBERT_3D')] }],
    };

    const { sections, omis } = resoudreStructure(abimee, detient(ALL_PERMISSIONS));
    expect(sections).toHaveLength(0);
    expect(omis[0]!.motif).toContain('inconnu');
  });

  it('ne retire rien quand tout est habilite', () => {
    const { sections, omis } = resoudreStructure(structure, detient(ALL_PERMISSIONS));
    expect(omis).toEqual([]);
    expect(sections).toHaveLength(2);
  });
});

describe('RG-26 — la mention portee en pied de page', () => {
  it('se tait quand rien n a ete omis', () => {
    expect(mentionOmissions([])).toBeNull();
  });

  it('COMPTE, elle n enumere pas', () => {
    /**
     * Lister les blocs manquants apprendrait exactement ce que l'omission
     * cache : « tableau des recettes » dit qu'il y a des recettes.
     */
    const mention = mentionOmissions([
      { blocId: 'b1', type: 'TABLEAU', motif: 'Finances — habilitation non détenue.' },
      { blocId: 'b2', type: 'GRAPHIQUE', motif: 'Finances — habilitation non détenue.' },
    ])!;

    expect(mention).toContain('2 blocs');
    expect(mention).not.toContain('TABLEAU');
    expect(mention).not.toContain('Finances');
  });

  it('accorde le singulier', () => {
    expect(
      mentionOmissions([{ blocId: 'b', type: 'JAUGE', motif: 'x' }]),
    ).toContain('Un bloc');
  });
});

describe('EF-RAP-10 — les niveaux auxquels un modele s applique', () => {
  it('propose le modele au niveau declare', () => {
    expect(modeleSApplique(['DISTRICT', 'REGIONAL'], 'DISTRICT')).toBe(true);
    expect(modeleSApplique(['DISTRICT'], 'CELLULE')).toBe(false);
  });

  it('ne borne RIEN quand la liste est vide', () => {
    /**
     * Une absence de restriction n'est pas une restriction totale (regle 15).
     * L'inverse rendrait invisible tout modele dont on a oublie de cocher les
     * niveaux — sans que rien ne le signale.
     */
    expect(modeleSApplique([], 'CELLULE')).toBe(true);
  });
});

describe('EF-RAP-07 — une structure lue en base', () => {
  it('accepte une structure bien formee', () => {
    expect(estStructure({ sections: [] })).toBe(true);
    expect(
      estStructure({
        sections: [
          {
            id: 's',
            titre: 'T',
            blocs: [{ id: 'b', type: 'TITRE', largeur: 'PLEINE', reglages: {} }],
          },
        ],
      }),
    ).toBe(true);
  });

  it('refuse ce qui n en est pas une', () => {
    /**
     * `structure` est du `jsonb` que rien ne contraint. Une valeur inattendue
     * traversant vers le client ferait echouer la page ENTIERE (regle 24), et
     * un editeur blanc pour un modele abime serait une panne sans cause
     * visible.
     */
    expect(estStructure(null)).toBe(false);
    expect(estStructure({})).toBe(false);
    expect(estStructure({ sections: {} })).toBe(false);
    expect(estStructure({ sections: [{ id: 's' }] })).toBe(false);
    // Un type de bloc inconnu ou une largeur inventee.
    expect(
      estStructure({
        sections: [{ id: 's', titre: 'T', blocs: [{ id: 'b', type: 'X', largeur: 'PLEINE' }] }],
      }),
    ).toBe(false);
    expect(
      estStructure({
        sections: [
          { id: 's', titre: 'T', blocs: [{ id: 'b', type: 'TITRE', largeur: 'QUART' }] },
        ],
      }),
    ).toBe(false);
  });
});
