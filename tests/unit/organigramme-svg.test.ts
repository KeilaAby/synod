import { describe, expect, it } from 'vitest';

import {
  type BlocImprime,
  construireSvg,
  echapperXml,
  tronquer,
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
  it('tronque au-dela de la limite, en le signalant', () => {
    expect(tronquer('Directeur general adjoint des finances', 12)).toBe('Directeur g…');
  });

  it('laisse intact ce qui tient', () => {
    expect(tronquer('  President  ', 12)).toBe('President');
  });
});

describe('Le cadrage embrasse tout le plan', () => {
  it('englobe les blocs les plus eloignes, marges comprises', () => {
    // C'est la raison d'etre du redessin : une capture d'ecran n'emporterait
    // que la portion visible, et l'organigramme imprime serait tronque.
    const svg = construireSvg(
      [
        bloc({ fonctionId: 'f1', x: 0, y: 0 }),
        bloc({ fonctionId: 'f2', x: 900, y: 700, parentFonctionId: 'f1' }),
      ],
      ENTETE,
    );

    const viewBox = svg!.match(/viewBox="([^"]+)"/)?.[1]!.split(' ').map(Number);
    expect(viewBox).toBeDefined();

    const [x, y, largeur, hauteur] = viewBox!;
    // Le bloc le plus a droite (900 + 224) doit tenir dans le cadre.
    expect(x! + largeur!).toBeGreaterThanOrEqual(1124);
    expect(y! + hauteur!).toBeGreaterThanOrEqual(840);
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
