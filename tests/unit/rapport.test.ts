import { describe, expect, it } from 'vitest';

import { ALL_PERMISSIONS, type Permission } from '@/lib/domain/permissions';
import {
  BLOCS_RAPPORT,
  GROUPES_BLOC,
  LARGEURS_BLOC,
  type LargeurBloc,
  PERMISSION_SOURCE,
  SOURCES,
  type StructureRapport,
  ONGLETS_BIBLIOTHEQUE,
  TYPES_BLOC,
  type TypeBloc,
  VISIBILITES,
  afficheChamp,
  ajouterBloc,
  blocsDuGroupe,
  capacitesModele,
  compositionAutorisee,
  decouperEnFeuilles,
  definitionBloc,
  deplacerBloc,
  deplacerBlocDUnRang,
  deplacerSection,
  estOnglet,
  estStructure,
  largeurEffective,
  margeDocument,
  mentionOmissions,
  modeleExploitable,
  modeleSApplique,
  nomDuplique,
  ongletDuModele,
  porteeReserveeAuSiege,
  reglerBloc,
  reglerLargeur,
  resoudreStructure,
  resumeStructure,
  retirerBloc,
  retirerSection,
  sourceDuBloc,
  trouverBloc,
  typeGraphique,
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

// ---------------------------------------------------------------------------
// EF-RAP-08, EF-RAP-09 — la portee de visibilite
// ---------------------------------------------------------------------------

describe('EF-RAP-09 — les quatre portees de visibilite', () => {
  it('porte les quatre valeurs de l enum SQL', () => {
    // Liste FIGEE : `visibilite_modele` en base (migration 0002) porte les
    // memes. Une valeur ajoutee ici sans l'etre la-bas serait refusee a
    // l'ecriture, et l'inverse ne serait jamais propose a l'utilisateur.
    expect([...VISIBILITES].sort()).toEqual(['DESCENDANTS', 'ENTITE', 'GLOBAL', 'PRIVE']);
  });
});

describe('EF-RAP-08 — ce qui est reserve au Siege', () => {
  it('reserve la portee GLOBALE', () => {
    /**
     * La RLS ne peut pas s'en charger : elle autorise l'ecriture des lors qu'on
     * gere les modeles de l'entite proprietaire. Une paroisse qui gere les
     * siens pourrait donc s'annoncer a toute l'organisation.
     */
    expect(porteeReserveeAuSiege('GLOBAL', false)).toBe(true);
  });

  it('reserve le modele OFFICIEL, quelle que soit sa portee', () => {
    expect(porteeReserveeAuSiege('ENTITE', true)).toBe(true);
    expect(porteeReserveeAuSiege('PRIVE', true)).toBe(true);
  });

  it('laisse passer ce qui ne deborde pas l entite', () => {
    expect(porteeReserveeAuSiege('PRIVE', false)).toBe(false);
    expect(porteeReserveeAuSiege('ENTITE', false)).toBe(false);
    // DESCENDANTS reste dans la hierarchie du proprietaire : un district qui
    // ouvre a ses eglises n'atteint personne d'autre.
    expect(porteeReserveeAuSiege('DESCENDANTS', false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EF-RAP-11 — ce qu'on peut faire d'un modele
// ---------------------------------------------------------------------------

describe('EF-RAP-11 — les capacites sur un modele', () => {
  const base = {
    estArchive: false,
    estOfficiel: false,
    peutGererLeModele: true,
    peutComposer: true,
  };

  it('ouvre tout sur son propre modele actif', () => {
    expect(capacitesModele(base)).toEqual({
      modifiable: true,
      archivable: true,
      duplicable: true,
      motif: null,
    });
  });

  it('ferme la modification d un modele ARCHIVE, sans fermer l archivage', () => {
    // Desarchiver EST une operation d'archivage : c'est le meme bouton, et le
    // fermer enfermerait le modele hors de la bibliotheque pour toujours.
    const c = capacitesModele({ ...base, estArchive: true });
    expect(c.modifiable).toBe(false);
    expect(c.archivable).toBe(true);
    expect(c.motif).toMatch(/archive/i);
  });

  it('ferme la modification d un OFFICIEL qu on ne gere pas, et dit de le dupliquer', () => {
    /**
     * C'est tout l'objet d'une trame officielle (EF-RAP-08) : chaque entite
     * l'emploie telle quelle ou la duplique pour l'adapter. Un refus muet
     * ferait chercher un droit manquant la ou il y a une marche a suivre.
     */
    const c = capacitesModele({ ...base, estOfficiel: true, peutGererLeModele: false });
    expect(c.modifiable).toBe(false);
    expect(c.archivable).toBe(false);
    expect(c.duplicable).toBe(true);
    expect(c.motif).toMatch(/upliquez/);
  });

  it('DUPLIQUE meme ce qu on ne peut pas modifier', () => {
    // Copier ne touche pas a l'original : archive ou officiel, un modele se
    // copie parfaitement — et c'est la seule facon de repartir du second.
    expect(capacitesModele({ ...base, estArchive: true }).duplicable).toBe(true);
    expect(
      capacitesModele({ ...base, estOfficiel: true, peutGererLeModele: false }).duplicable,
    ).toBe(true);
  });

  it('refuse la duplication a qui ne compose nulle part', () => {
    // Le duplicata doit appartenir a une entite : sans `report.template.manage`
    // sur au moins une des siennes, il n'y a nulle part ou le poser.
    expect(capacitesModele({ ...base, peutComposer: false }).duplicable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EF-RAP-01 a 04 — composer
// ---------------------------------------------------------------------------

/** Un bloc minimal, pour les operations de structure. */
function bloc(id: string, type: TypeBloc, reglages: Record<string, unknown> = {}) {
  return { id, type, largeur: 'PLEINE' as LargeurBloc, reglages };
}

describe('EF-RAP-02 — les familles de la palette', () => {
  it('range les onze types, et chacun dans une seule famille', () => {
    const ranges = GROUPES_BLOC.flatMap((g) => blocsDuGroupe(g).map((b) => b.type));

    expect(ranges).toHaveLength(TYPES_BLOC.length);
    expect(new Set(ranges).size).toBe(TYPES_BLOC.length);
  });
});

describe('EF-RAP-03 — la source d un bloc', () => {
  it('prend celle de son TYPE par defaut', () => {
    expect(sourceDuBloc(bloc('b', 'TABLEAU'))).toBe('CROYANTS');
    expect(sourceDuBloc(bloc('b', 'GRAPHIQUE'))).toBe('FINANCES');
  });

  it('accepte celle que le BLOC declare', () => {
    /**
     * Sans cela, « Tableau » ne signifierait jamais qu'un tableau de croyants,
     * et un rapport financier n'aurait aucun moyen d'en presenter un — alors
     * qu'EF-RAP-03 demande que chaque bloc puise dans les sources de
     * l'application.
     */
    expect(sourceDuBloc(bloc('b', 'TABLEAU', { source: 'FINANCES' }))).toBe('FINANCES');
  });

  it('ignore une source inventee et retombe sur celle du type', () => {
    expect(sourceDuBloc(bloc('b', 'TABLEAU', { source: 'CAISSE' }))).toBe('CROYANTS');
  });

  it('ne donne JAMAIS de source a un bloc de mise en page', () => {
    // Un titre qui se declarerait « FINANCES » se ferait omettre par RG-26 chez
    // qui n'a pas `finance.read` — un intertitre disparu pour une raison qui
    // n'a rien a voir avec lui.
    expect(sourceDuBloc(bloc('b', 'TITRE', { source: 'FINANCES' }))).toBeNull();
    expect(sourceDuBloc(bloc('b', 'SAUT_DE_PAGE', { source: 'FINANCES' }))).toBeNull();
  });

  it('RG-26 omet sur la source du BLOC, pas sur celle de son type', () => {
    // Un tableau de finances chez qui ne lit que les croyants : lire la source
    // du type l'aurait laisse passer.
    const structure: StructureRapport = {
      sections: [
        {
          id: 's',
          titre: 'Finances',
          blocs: [bloc('b1', 'TABLEAU', { source: 'FINANCES' })],
        },
      ],
    };

    const resolution = resoudreStructure(structure, (p) => p === 'croyant.read');
    expect(resolution.sections).toHaveLength(0);
    expect(resolution.omis[0]?.motif).toMatch(/Finances/);
  });
});

describe('EF-RAP-04 — la largeur admise', () => {
  it('force la pleine largeur sur les blocs qui l exigent', () => {
    expect(largeurEffective('SAUT_DE_PAGE', 'TIERS')).toBe('PLEINE');
    expect(largeurEffective('FRISE', 'DEMI')).toBe('PLEINE');
  });

  it('laisse les autres a la largeur demandee', () => {
    expect(largeurEffective('INDICATEUR', 'TIERS')).toBe('TIERS');
  });

  it('est IDEMPOTENTE — le serveur revalide sa propre sortie', () => {
    for (const type of TYPES_BLOC) {
      for (const largeur of LARGEURS_BLOC) {
        const une = largeurEffective(type, largeur);
        expect(largeurEffective(type, une)).toBe(une);
      }
    }
  });

  it('applique la contrainte du type quand on regle une largeur', () => {
    const structure: StructureRapport = {
      sections: [{ id: 's', titre: '', blocs: [bloc('b1', 'SAUT_DE_PAGE')] }],
    };
    const apres = reglerLargeur(structure, 'b1', 'TIERS');
    expect(apres.sections[0]?.blocs[0]?.largeur).toBe('PLEINE');
  });
});

describe('EF-RAP-01 — deplacer un bloc', () => {
  const structure: StructureRapport = {
    sections: [
      {
        id: 's1',
        titre: 'A',
        blocs: [bloc('b1', 'TITRE'), bloc('b2', 'TEXTE'), bloc('b3', 'IMAGE')],
      },
      { id: 's2', titre: 'B', blocs: [bloc('b4', 'SIGNATURE')] },
    ],
  };

  const rangs = (s: StructureRapport, sectionId: string) =>
    s.sections.find((x) => x.id === sectionId)?.blocs.map((b) => b.id);

  it('recule un bloc dans sa section', () => {
    expect(rangs(deplacerBloc(structure, 'b3', 's1', 0), 's1')).toEqual([
      'b3',
      'b1',
      'b2',
    ]);
  });

  it('avance un bloc SANS le poser un cran trop loin', () => {
    /**
     * Le piege : le rang vise est lu AVANT le retrait. Deplacer `b1` « en
     * position 2 » sur une liste dont il fait partie doit l'amener entre `b2`
     * et `b3` — sans la correction, il finirait apres `b3`.
     */
    expect(rangs(deplacerBloc(structure, 'b1', 's1', 2), 's1')).toEqual([
      'b2',
      'b1',
      'b3',
    ]);
  });

  it('deplace vers une AUTRE section', () => {
    const apres = deplacerBloc(structure, 'b2', 's2', 0);
    expect(rangs(apres, 's1')).toEqual(['b1', 'b3']);
    expect(rangs(apres, 's2')).toEqual(['b2', 'b4']);
  });

  it('ne touche a rien pour un bloc inconnu', () => {
    expect(deplacerBloc(structure, 'inconnu', 's1', 0)).toBe(structure);
  });
});

describe('EF-RAP-04 — sections', () => {
  const structure: StructureRapport = {
    sections: [
      { id: 's1', titre: 'A', blocs: [] },
      { id: 's2', titre: 'B', blocs: [] },
    ],
  };

  it('deplace une section d un rang', () => {
    expect(deplacerSection(structure, 's2', -1).sections.map((s) => s.id)).toEqual([
      's2',
      's1',
    ]);
  });

  it('NE S ENROULE PAS au bord', () => {
    // Une section qui repasserait en tete depuis la fin donnerait un document
    // reorganise par surprise, sur un clic qu'on croyait sans effet.
    expect(deplacerSection(structure, 's1', -1)).toBe(structure);
    expect(deplacerSection(structure, 's2', 1)).toBe(structure);
  });

  it('ajoute un bloc au rang demande', () => {
    const avecDeux = ajouterBloc(ajouterBloc(structure, 's1', 'TITRE'), 's1', 'TEXTE');
    const insere = ajouterBloc(avecDeux, 's1', 'IMAGE', 1);

    expect(insere.sections[0]?.blocs.map((b) => b.type)).toEqual([
      'TITRE',
      'IMAGE',
      'TEXTE',
    ]);
  });

  it('cree des identifiants distincts', () => {
    const deux = ajouterBloc(ajouterBloc(structure, 's1', 'TITRE'), 's1', 'TITRE');
    const [a, b] = deux.sections[0]!.blocs;
    expect(a!.id).not.toBe(b!.id);
  });

  it('retire un bloc ou qu il soit', () => {
    const avec = ajouterBloc(structure, 's2', 'TITRE');
    const id = avec.sections[1]!.blocs[0]!.id;
    expect(retirerBloc(avec, id).sections[1]?.blocs).toEqual([]);
  });

  it('supprime une section avec ses blocs', () => {
    const avec = ajouterBloc(structure, 's1', 'TITRE');
    expect(retirerSection(avec, 's1').sections.map((s) => s.id)).toEqual(['s2']);
  });
});

describe('EF-RAP-01 — deplacer un bloc d un rang', () => {
  const structure: StructureRapport = {
    sections: [
      { id: 's1', titre: 'A', blocs: [bloc('b1', 'TITRE'), bloc('b2', 'TEXTE')] },
      { id: 's2', titre: 'B', blocs: [bloc('b3', 'IMAGE')] },
    ],
  };

  it('echange avec son voisin', () => {
    // Deux fleches font ce que fait le glisser, exactement, et sans viser — ni
    // un ecran tactile ni un clavier n'ont de glisser (ENF-ACC).
    const apres = deplacerBlocDUnRang(structure, 'b2', -1);
    expect(apres.sections[0]?.blocs.map((b) => b.id)).toEqual(['b2', 'b1']);
  });

  it('NE S ENROULE PAS au bord de sa section', () => {
    expect(deplacerBlocDUnRang(structure, 'b1', -1)).toBe(structure);
    expect(deplacerBlocDUnRang(structure, 'b2', 1)).toBe(structure);
  });

  it('ne franchit PAS la frontiere de section', () => {
    // Un bloc seul dans sa section ne bouge pas : passer chez la voisine est un
    // autre geste, et il se fait au glisser, ou il se voit.
    expect(deplacerBlocDUnRang(structure, 'b3', -1)).toBe(structure);
  });

  it('ne touche a rien pour un bloc inconnu', () => {
    expect(deplacerBlocDUnRang(structure, 'inconnu', 1)).toBe(structure);
  });
});

describe('EF-RAP-05 — le decoupage en feuilles A4', () => {
  it('rend UNE feuille quand rien ne coupe', () => {
    const feuilles = decouperEnFeuilles([
      { id: 's', titre: 'A', blocs: [bloc('b1', 'TITRE'), bloc('b2', 'TEXTE')] },
    ]);
    expect(feuilles).toHaveLength(1);
  });

  it('coupe au SAUT DE PAGE, et ne le rend pas', () => {
    // Il EST la coupure. Le rendre comme un cadre vide laisserait un blanc en
    // bas de page, qu'on prendrait pour un defaut de mise en page.
    const feuilles = decouperEnFeuilles([
      {
        id: 's',
        titre: 'A',
        blocs: [bloc('b1', 'TITRE'), bloc('saut', 'SAUT_DE_PAGE'), bloc('b2', 'TEXTE')],
      },
    ]);

    expect(feuilles).toHaveLength(2);
    expect(feuilles.flatMap((f) => f.flatMap((s) => s.blocs.map((b) => b.type)))).not.toContain(
      'SAUT_DE_PAGE',
    );
  });

  it('ne REPETE PAS le titre de la section coupee', () => {
    // Repete en tete de la feuille suivante, il ferait croire a un second
    // chapitre du meme nom.
    const feuilles = decouperEnFeuilles([
      {
        id: 's',
        titre: 'Finances',
        blocs: [bloc('b1', 'TITRE'), bloc('saut', 'SAUT_DE_PAGE'), bloc('b2', 'TEXTE')],
      },
    ]);

    expect(feuilles[0]?.[0]?.titre).toBe('Finances');
    expect(feuilles[1]?.[0]?.titre).toBe('');
  });

  it('ne rend aucune feuille pour une structure vide', () => {
    expect(decouperEnFeuilles([])).toEqual([]);
    expect(decouperEnFeuilles([{ id: 's', titre: '', blocs: [] }])).toEqual([]);
  });
});

describe('EF-RAP-01 — regler un bloc', () => {
  const structure: StructureRapport = {
    sections: [{ id: 's', titre: '', blocs: [bloc('b1', 'TABLEAU', { titre: 'Effectifs' })] }],
  };

  it('FUSIONNE, il ne remplace pas', () => {
    /**
     * Le panneau ne connait qu'une partie des cles — celles du type courant.
     * Ecraser l'objet entier effacerait ce qu'une version ulterieure y aura
     * pose, sans qu'aucun message ne le dise.
     */
    const apres = reglerBloc(structure, 'b1', { source: 'FINANCES' });
    expect(apres.sections[0]?.blocs[0]?.reglages).toEqual({
      titre: 'Effectifs',
      source: 'FINANCES',
    });
  });

  it('RETIRE une cle mise a `undefined`', () => {
    // C'est ainsi qu'un reglage revient a son defaut, sans avoir a inventer une
    // valeur « vide » par type.
    const apres = reglerBloc(structure, 'b1', { titre: undefined });
    expect(apres.sections[0]?.blocs[0]?.reglages).toEqual({});
  });

  it('trouve le bloc designe, et rien pour un identifiant inconnu', () => {
    expect(trouverBloc(structure, 'b1')?.type).toBe('TABLEAU');
    expect(trouverBloc(structure, 'inconnu')).toBeNull();
    expect(trouverBloc(structure, null)).toBeNull();
  });
});

describe('EF-RAP-07 — l organisation ouvre-t-elle la composition ?', () => {
  it('laisse composer quand le droit est detenu et le reglage ouvert', () => {
    expect(
      compositionAutorisee({
        detientLeDroit: true,
        compositionLibre: true,
        estSiege: false,
      }),
    ).toBe(true);
  });

  it('FERME la composition aux entites quand le reglage est ferme', () => {
    // « S'il n'a pas la possibilite, alors il doit se conformer au modele du
    // Siege. » Le droit ne suffit donc pas : le reglage s'y ajoute.
    expect(
      compositionAutorisee({
        detientLeDroit: true,
        compositionLibre: false,
        estSiege: false,
      }),
    ).toBe(false);
  });

  it('N ENFERME JAMAIS LE SIEGE dans son propre verrou', () => {
    /**
     * Ferme sur lui-meme, le Siege ne pourrait plus poser la trame a laquelle
     * les autres doivent se conformer : le reglage se retournerait contre ce
     * qu'il sert, et plus personne ne pourrait composer quoi que ce soit.
     */
    expect(
      compositionAutorisee({
        detientLeDroit: true,
        compositionLibre: false,
        estSiege: true,
      }),
    ).toBe(true);
  });

  it('ne remplace JAMAIS l habilitation', () => {
    // Un reglage ouvert n'accorde pas `report.template.manage` : il autorise
    // qui le detient deja. L'inverse ferait du reglage une porte derobee.
    expect(
      compositionAutorisee({
        detientLeDroit: false,
        compositionLibre: true,
        estSiege: true,
      }),
    ).toBe(false);
  });
});

describe('EF-RAP-07 — quels modeles restent EXPLOITABLES', () => {
  it('n emploie PAS le modele d une autre entite quand la composition est fermee', () => {
    /**
     * C'est le point qui donne son sens au verrou. Sans lui, une paroisse
     * privee de composition reprendrait la trame que son district partage a
     * ses descendants — et ne plus pouvoir en dessiner n'aurait plus aucune
     * consequence : le modele du Siege ne serait impose que sur le papier.
     */
    expect(
      modeleExploitable({ estOfficiel: false, estSien: false, compositionLibre: false }),
    ).toBe(false);
  });

  it('emploie le modele d une autre entite quand la composition est ouverte', () => {
    // EF-RAP-09 — un district qui ouvre ses modeles a ses eglises garde tout
    // son sens tant que le verrou n'est pas pose.
    expect(
      modeleExploitable({ estOfficiel: false, estSien: false, compositionLibre: true }),
    ).toBe(true);
  });

  it('garde TOUJOURS les modeles du Siege — c est ce qui est impose', () => {
    expect(
      modeleExploitable({ estOfficiel: true, estSien: false, compositionLibre: false }),
    ).toBe(true);
  });

  it('garde TOUJOURS les siens — fermer ne detruit rien', () => {
    // Ce qu'une entite a compose avant le verrou lui reste acquis, et
    // redevient employable des qu'on lui rend l'habilitation.
    expect(
      modeleExploitable({ estOfficiel: false, estSien: true, compositionLibre: false }),
    ).toBe(true);
  });
});

describe('EF-RAP-05 — la marge du papier', () => {
  it('vaut 16 mm quand rien n est regle', () => {
    // L'ancienne valeur figee : rien ne bouge sous les modeles deja composes.
    expect(margeDocument({ sections: [] })).toBe(16);
  });

  it('rend la marge reglee', () => {
    expect(margeDocument({ sections: [], marge: 10 })).toBe(10);
  });

  it('RAMENE une valeur hors bornes plutot que de rendre une feuille fausse', () => {
    /**
     * Sous 5 mm, la plupart des imprimantes rognent : le texte sort coupe sans
     * que rien ne l'ait annonce. La valeur peut venir d'une version anterieure
     * ou d'un appel direct a l'API — le rendu, lui, doit rester imprimable.
     */
    expect(margeDocument({ sections: [], marge: 0 })).toBe(5);
    expect(margeDocument({ sections: [], marge: 120 })).toBe(30);
  });

  it('ignore ce qui n est pas un nombre', () => {
    expect(margeDocument({ sections: [], marge: Number.NaN })).toBe(16);
    expect(
      margeDocument({ sections: [], marge: 'large' } as unknown as StructureRapport),
    ).toBe(16);
  });
});

describe('EF-RAP-02 — la forme d un graphique', () => {
  it('vaut les barres par defaut', () => {
    expect(typeGraphique(bloc('b', 'GRAPHIQUE'))).toBe('BARRES');
  });

  it('rend la forme choisie', () => {
    expect(typeGraphique(bloc('b', 'GRAPHIQUE', { graphique: 'CAMEMBERT' }))).toBe(
      'CAMEMBERT',
    );
  });

  it('ignore une forme inventee', () => {
    // Un reglage venu d'une version ulterieure ne doit pas faire tomber le
    // rendu : on retombe sur une forme que celle-ci sait dessiner.
    expect(typeGraphique(bloc('b', 'GRAPHIQUE', { graphique: 'RADAR' }))).toBe('BARRES');
  });
});

describe('EF-RAP-06 — un champ d en-tete absent AFFICHE', () => {
  it('lit l absence comme un oui', () => {
    /**
     * `!== false` et non `=== true` : une structure composee avant que le champ
     * n'existe ne le porte pas. Lire `=== true` ferait disparaitre le logo de
     * tous les modeles existants le jour de la mise a jour, sans que personne
     * n'ait rien decide.
     */
    expect(afficheChamp(undefined)).toBe(true);
    expect(afficheChamp(true)).toBe(true);
    expect(afficheChamp(false)).toBe(false);
  });
});

describe('Les onglets de la bibliotheque', () => {
  it('range chaque modele dans UN SEUL onglet', () => {
    /**
     * Un modele officiel que je gere depuis le Siege est *officiel*, pas
     * « officiel et mien » : compte deux fois, la somme des onglets depasserait
     * la bibliotheque et l'utilisateur chercherait le doublon.
     */
    expect(ongletDuModele({ estOfficiel: true, estSien: true })).toBe('officiels');
    expect(ongletDuModele({ estOfficiel: true, estSien: false })).toBe('officiels');
    expect(ongletDuModele({ estOfficiel: false, estSien: true })).toBe('miens');
    expect(ongletDuModele({ estOfficiel: false, estSien: false })).toBe('partages');
  });

  it('rend toujours un onglet qui existe', () => {
    for (const estOfficiel of [true, false]) {
      for (const estSien of [true, false]) {
        expect(estOnglet(ongletDuModele({ estOfficiel, estSien }))).toBe(true);
      }
    }
  });

  it('garde ce qui vient de l URL', () => {
    // Un onglet inconnu afficherait une liste vide sous un libelle qui n'existe
    // pas — et l'utilisateur conclurait a une bibliotheque vide (regle 15).
    expect(estOnglet('miens')).toBe(true);
    expect(estOnglet('archives')).toBe(false);
    expect(estOnglet(undefined)).toBe(false);
  });

  it('porte « tous » en plus des trois classements', () => {
    expect([...ONGLETS_BIBLIOTHEQUE].sort()).toEqual([
      'miens',
      'officiels',
      'partages',
      'tous',
    ]);
  });
});

describe('EF-RAP-11 — le nom d un duplicata', () => {
  it('suffixe la premiere copie', () => {
    expect(nomDuplique('Synthese trimestrielle', [])).toBe('Synthese trimestrielle (copie)');
  });

  it('NUMEROTE quand le nom est deja pris', () => {
    /**
     * Trois lignes « X (copie) » dans une bibliotheque ne se distinguent que
     * par leur date, qu'on ne lit pas. Rien en base ne l'interdit — c'est bien
     * pourquoi la regle est ici.
     */
    expect(nomDuplique('Bilan', ['Bilan', 'Bilan (copie)'])).toBe('Bilan (copie 2)');
    expect(nomDuplique('Bilan', ['Bilan (copie)', 'Bilan (copie 2)'])).toBe('Bilan (copie 3)');
  });

  it('ne fabrique pas « (copie) (copie) »', () => {
    // Une copie de copie repart du nom d'origine et renumerote : sinon le nom
    // s'allonge d'un suffixe a chaque passage et cesse d'etre lisible.
    expect(nomDuplique('Bilan (copie)', ['Bilan (copie)'])).toBe('Bilan (copie 2)');
    expect(nomDuplique('Bilan (copie 2)', ['Bilan (copie)', 'Bilan (copie 2)'])).toBe(
      'Bilan (copie 3)',
    );
  });

  it('compare comme un lecteur — casse et espaces de bord ignores', () => {
    expect(nomDuplique('Bilan', ['  bilan (COPIE)  '])).toBe('Bilan (copie 2)');
  });
});

// ---------------------------------------------------------------------------
// Le resume d'une composition
// ---------------------------------------------------------------------------

describe('Le resume d une structure', () => {
  const structure: StructureRapport = {
    sections: [
      {
        id: 's1',
        titre: 'Effectifs',
        blocs: [
          { id: 'b1', type: 'TITRE', largeur: 'PLEINE', reglages: {} },
          { id: 'b2', type: 'INDICATEUR', largeur: 'TIERS', reglages: {} },
          { id: 'b3', type: 'TABLEAU', largeur: 'PLEINE', reglages: {} },
        ],
      },
      {
        id: 's2',
        titre: 'Finances',
        blocs: [{ id: 'b4', type: 'GRAPHIQUE', largeur: 'DEMI', reglages: {} }],
      },
    ],
  };

  it('compte les sections et les blocs', () => {
    const resume = resumeStructure(structure);
    expect(resume.nbSections).toBe(2);
    expect(resume.nbBlocs).toBe(4);
  });

  it('DEDOUBLONNE les sources et les rend dans l ordre du registre', () => {
    /**
     * L'ordre de RENCONTRE ferait lire differemment deux modeles au meme
     * contenu, selon l'ordre ou l'auteur a pose ses blocs. Deux blocs
     * « CROYANTS » ne font pas non plus deux sources : ce qu'on annonce, c'est
     * ce qu'il faudra etre habilite a lire (RG-26).
     */
    const resume = resumeStructure(structure);
    expect(resume.sources).toEqual(['CROYANTS', 'FINANCES']);
    expect(resume.sources).toEqual(SOURCES.filter((s) => resume.sources.includes(s)));
  });

  it('ne compte AUCUNE source pour une composition de mise en page seule', () => {
    // Titre, texte, image, saut de page, signature : ils n'interrogent rien, et
    // RG-26 ne les omet donc jamais.
    const resume = resumeStructure({
      sections: [
        {
          id: 's',
          titre: 'Garde',
          blocs: [
            { id: 'a', type: 'TITRE', largeur: 'PLEINE', reglages: {} },
            { id: 'b', type: 'SIGNATURE', largeur: 'DEMI', reglages: {} },
          ],
        },
      ],
    });
    expect(resume.sources).toEqual([]);
    expect(resume.nbBlocs).toBe(2);
  });

  it('rend zero sur une structure vide', () => {
    expect(resumeStructure({ sections: [] })).toEqual({
      nbSections: 0,
      nbBlocs: 0,
      sources: [],
    });
  });
});
