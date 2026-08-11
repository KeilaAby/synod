import { describe, expect, it } from 'vitest';

import {
  type BlocImprime,
  construireSvg,
  disposerEnArbre,
  echapperXml,
  replierTexte,
} from '@/lib/domain/organigramme-svg';

/**
 * EF-BUR-11 — impression de l'organigramme d'un bureau.
 *
 * Le SVG est produit sans bibliotheque : ces tests tiennent lieu de garantie
 * que le document reste VALIDE, parce qu'un SVG mal forme ne s'affiche pas de
 * travers — il ne s'affiche pas du tout.
 */

const ENTETE = {
  titre: 'Bureau executif',
  entite: 'District AVARADRANO',
  periode: 'Bureau executif 2026-2029',
  edite: '09/08/2026',
};

const bloc = (p: Partial<BlocImprime>): BlocImprime => ({
  fonctionId: 'f1',
  x: 0,
  y: 0,
  fonction: 'President',
  titulaire: { nom: 'KOFFI', prenom: 'Amos', matricule: 'KA-00001-26' },
  estFinanciere: false,
  parentFonctionId: null,
  ...p,
});

describe('Le document reste valide quoi que contiennent les noms', () => {
  it('echappe ce qui casserait le SVG', () => {
    // « Ratsimba & Fils » suffit a rendre le document illisible par
    // l'analyseur, qui n'affiche alors RIEN.
    expect(echapperXml('Ratsimba & Fils <Commission>')).toBe(
      'Ratsimba &amp; Fils &lt;Commission&gt;',
    );
  });

  it('echappe le nom du titulaire dans le rendu', () => {
    const svg = construireSvg(
      [bloc({ titulaire: { nom: 'A&B', prenom: 'C', matricule: 'X-1' } })],
      ENTETE,
    );

    expect(svg).toContain('A&amp;B');
    expect(svg).not.toMatch(/A&B/);
  });

  it('echappe aussi l en-tete', () => {
    const svg = construireSvg([bloc({})], { ...ENTETE, entite: 'Paroisse « A & B »' });
    expect(svg).toContain('&amp;');
  });
});

describe('Un texte SVG ne se replie pas tout seul', () => {
  /** Reconstitue la largeur estimee par le module : 0,6 em par caractere. */
  const tient = (r: { lignes: readonly string[]; taille: number }, largeur: number) =>
    r.lignes.every((l) => l.length * r.taille * 0.6 <= largeur);

  it('laisse intact ce qui tient sur une ligne', () => {
    expect(replierTexte('  President  ', 170, [13], 3)).toEqual({
      lignes: ['President'],
      taille: 13,
    });
  });

  it('coupe entre les MOTS plutot que dans un mot', () => {
    const r = replierTexte('RANOMENJANAHARY Christian Nicolas', 170, [13, 12, 11, 10, 9], 3);

    expect(r.lignes.join(' ')).toBe('RANOMENJANAHARY Christian Nicolas');
    expect(r.lignes.length).toBeGreaterThan(1);
    expect(tient(r, 170)).toBe(true);
  });

  it("n'ampute JAMAIS le nom, quitte a reduire la police", () => {
    /**
     * C'est la raison d'etre de la fonction : le 11 aout 2026, les noms
     * sortaient coupes a vingt caracteres sur une feuille remise a des gens
     * qui la lisent. Un organigramme sert a NOMMER.
     */
    const long = 'RAKOTOMALALA ANDRIANJAFY Jean Baptiste Emmanuel';
    const r = replierTexte(long, 100, [13, 12, 11, 10, 9], 3);

    expect(r.lignes.join(' ')).toBe(long);
    expect(r.taille).toBeLessThan(13);
    expect(r.taille).toBeGreaterThanOrEqual(9);
    expect(r.lignes.length).toBeLessThanOrEqual(3);
  });

  it('rend le nom entier meme quand il depasse le nombre de lignes prevu', () => {
    // Mieux vaut un bloc un peu charge qu'un nom faux.
    const r = replierTexte('A B C D E F G H I J K L', 40, [13, 11, 9], 2);
    expect(r.lignes.join(' ')).toBe('A B C D E F G H I J K L');
  });

  it('laisse deborder un mot indivisible plutot que de le couper', () => {
    // Un patronyme sans espace plus large que le bloc n'a aucune coupe
    // legitime : le reduire suffit, l'amputer non.
    const r = replierTexte('RANDRIANARISOAMANANARIVO', 60, [13, 11, 9], 2);
    expect(r.lignes).toEqual(['RANDRIANARISOAMANANARIVO']);
    expect(r.taille).toBe(9);
  });

  it('ne rend aucune ligne pour un texte vide', () => {
    expect(replierTexte('   ', 170, [13], 3).lignes).toEqual([]);
  });
});

describe('Le bloc imprime porte le nom en entier', () => {
  it('sort le nom COMPLET, sur plusieurs lignes s il le faut', () => {
    const svg = construireSvg(
      [
        bloc({
          titulaire: {
            nom: 'RAKOTOMALALA ANDRIANJAFY',
            prenom: 'Jean Baptiste',
            matricule: 'RA-00007-26',
          },
        }),
      ],
      ENTETE,
    )!;

    // Aucun caractere perdu : chaque mot doit se retrouver dans le document.
    for (const mot of ['RAKOTOMALALA', 'ANDRIANJAFY', 'Jean', 'Baptiste']) {
      expect(svg).toContain(mot);
    }
    expect(svg).not.toContain('…');
  });

  it('garde le nom DANS le bloc', () => {
    const svg = construireSvg(
      [bloc({ titulaire: { nom: 'RAZAFIMAHATRATRA', prenom: 'Nirina', matricule: 'R-1' } })],
      ENTETE,
    )!;

    // Le bloc est pose en 0,0 et mesure 248 de large ; le nom demarre a 62.
    for (const [, y] of svg.matchAll(/<text x="62" y="(\d+)"/g)) {
      expect(Number(y)).toBeLessThan(168);
    }
  });

  it("reduit la police plutot que d'abreger l intitule de la fonction", () => {
    const svg = construireSvg(
      [bloc({ fonction: 'Secretaire general adjoint aux affaires sociales' })],
      ENTETE,
    )!;

    expect(svg).toContain('sociales');
    expect(svg).not.toContain('…');
  });
});

describe("Le cadrage se met au format de la page", () => {
  const cadre = (svg: string) => {
    const [x, y, largeur, hauteur] = svg
      .match(/viewBox="([^"]+)"/)![1]!
      .split(' ')
      .map(Number);
    return { x: x!, y: y!, largeur: largeur!, hauteur: hauteur! };
  };

  it('rend TOUJOURS le rapport A4 paysage, quelle que soit la forme du plan', () => {
    /**
     * Sans cela, un organigramme large sort en bande etroite et un
     * organigramme profond en colonne : la feuille reste aux trois quarts
     * vide, et deux bureaux ne s'impriment pas a la meme echelle.
     */
    const large = construireSvg(
      [
        bloc({ fonctionId: 'f1' }),
        bloc({ fonctionId: 'f2', parentFonctionId: 'f1' }),
        bloc({ fonctionId: 'f3', parentFonctionId: 'f1' }),
        bloc({ fonctionId: 'f4', parentFonctionId: 'f1' }),
        bloc({ fonctionId: 'f5', parentFonctionId: 'f1' }),
      ],
      ENTETE,
    )!;

    const profond = construireSvg(
      [
        bloc({ fonctionId: 'f1' }),
        bloc({ fonctionId: 'f2', parentFonctionId: 'f1' }),
        bloc({ fonctionId: 'f3', parentFonctionId: 'f2' }),
        bloc({ fonctionId: 'f4', parentFonctionId: 'f3' }),
      ],
      ENTETE,
    )!;

    for (const svg of [large, profond]) {
      const { largeur, hauteur } = cadre(svg);
      expect(largeur / hauteur).toBeCloseTo(297 / 210, 2);
    }
  });

  it("occupe la page entiere, sans hauteur figee", () => {
    // `width`/`height` en pourcentage : c'est la feuille qui commande, et
    // `preserveAspectRatio` centre sans jamais rogner.
    const svg = construireSvg([bloc({})], ENTETE)!;

    expect(svg).toContain('width="100%"');
    expect(svg).toContain('height="100%"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it('ECARTE la disposition de l ecran au profit de la hierarchie', () => {
    /**
     * Sur le plan, l'utilisateur place les blocs pour travailler — a portee de
     * souris, quitte a les etaler. Imprimer ces coordonnees telles quelles
     * donnait une feuille en vrac. Ce qu'une impression doit rendre, c'est qui
     * depend de qui.
     */
    const eparpille = construireSvg(
      [
        bloc({ fonctionId: 'f1', x: 4000, y: 3000 }),
        bloc({ fonctionId: 'f2', x: -900, y: 12, parentFonctionId: 'f1' }),
      ],
      ENTETE,
    )!;

    const range = construireSvg(
      [
        bloc({ fonctionId: 'f1', x: 0, y: 0 }),
        bloc({ fonctionId: 'f2', x: 0, y: 212, parentFonctionId: 'f1' }),
      ],
      ENTETE,
    )!;

    // Meme hierarchie, meme dessin : la mise en page de l'ecran n'y entre pas.
    expect(eparpille).toBe(range);
  });

  it('trace un trait par lien, et aucun vers un bloc absent', () => {
    const svg = construireSvg(
      [
        bloc({ fonctionId: 'f1' }),
        bloc({ fonctionId: 'f2', y: 250, parentFonctionId: 'f1' }),
        // Parent hors du plan : le trait irait dans le vide.
        bloc({ fonctionId: 'f3', y: 500, parentFonctionId: 'absent' }),
      ],
      ENTETE,
    );

    expect(svg!.match(/<path /g)).toHaveLength(1);
  });
});

describe('Ce que la feuille montre', () => {
  it('sort une fonction vacante en POINTILLE, sans nom', () => {
    const svg = construireSvg([bloc({ titulaire: null })], ENTETE)!;

    expect(svg).toContain('stroke-dasharray');
    expect(svg).toContain('Vacante');
    expect(svg).not.toContain('KOFFI');
  });

  it('marque les fonctions financieres — RG-31', () => {
    expect(construireSvg([bloc({ estFinanciere: true })], ENTETE)).toContain('FINANCES');
  });

  it('date la feuille : un organigramme imprime se perime', () => {
    expect(construireSvg([bloc({})], ENTETE)).toContain('09/08/2026');
  });

  it('rend null plutot qu une page blanche quand rien n est pose', () => {
    // Le bouton doit pouvoir le DIRE. Une feuille vide n'explique pas pourquoi
    // elle est vide.
    expect(construireSvg([], ENTETE)).toBeNull();
  });
});

describe("disposerEnArbre — la hierarchie decide, pas l'ecran", () => {
  it('centre un parent au-dessus de ses enfants', () => {
    const plan = disposerEnArbre([
      bloc({ fonctionId: 'p' }),
      bloc({ fonctionId: 'a', parentFonctionId: 'p' }),
      bloc({ fonctionId: 'b', parentFonctionId: 'p' }),
    ]);

    const par = new Map(plan.map((b) => [b.fonctionId, b]));
    const milieu = (par.get('a')!.x + par.get('b')!.x) / 2;

    expect(par.get('p')!.x).toBeCloseTo(milieu, 5);
    // C'est ce centrage qui fait lire un organigramme comme un arbre plutot
    // que comme une liste indentee.
    expect(par.get('a')!.y).toBeGreaterThan(par.get('p')!.y);
  });

  it('descend d un niveau par generation', () => {
    const plan = disposerEnArbre([
      bloc({ fonctionId: 'p' }),
      bloc({ fonctionId: 'a', parentFonctionId: 'p' }),
      bloc({ fonctionId: 'b', parentFonctionId: 'a' }),
    ]);

    const y = new Map(plan.map((b) => [b.fonctionId, b.y]));
    expect(y.get('a')! - y.get('p')!).toBe(y.get('b')! - y.get('a')!);
  });

  it('n empile jamais deux blocs au meme endroit', () => {
    const plan = disposerEnArbre([
      bloc({ fonctionId: 'p' }),
      bloc({ fonctionId: 'a', parentFonctionId: 'p' }),
      bloc({ fonctionId: 'b', parentFonctionId: 'p' }),
      bloc({ fonctionId: 'c', parentFonctionId: 'p' }),
      bloc({ fonctionId: 'd', parentFonctionId: 'b' }),
    ]);

    const places = plan.map((b) => `${b.x}:${b.y}`);
    expect(new Set(places).size).toBe(places.length);
  });

  it('aligne PLUSIEURS racines cote a cote', () => {
    // Un bureau se compose parfois de branches sans sommet commun.
    const plan = disposerEnArbre([bloc({ fonctionId: 'r1' }), bloc({ fonctionId: 'r2' })]);

    expect(plan[0]!.y).toBe(plan[1]!.y);
    expect(plan[0]!.x).not.toBe(plan[1]!.x);
  });

  it('traite comme racine un bloc dont le parent est absent', () => {
    const plan = disposerEnArbre([bloc({ fonctionId: 'x', parentFonctionId: 'disparu' })]);
    expect(plan[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('ne boucle pas indefiniment sur un cycle', () => {
    // Le trigger l'interdit en base, mais une reprise de donnees pourrait en
    // introduire un : une impression qui tourne sans fin est pire qu'une
    // impression fausse.
    const plan = disposerEnArbre([
      bloc({ fonctionId: 'a', parentFonctionId: 'b' }),
      bloc({ fonctionId: 'b', parentFonctionId: 'a' }),
    ]);
    expect(plan).toHaveLength(2);
  });
});
