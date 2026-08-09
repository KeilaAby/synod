import { describe, expect, it } from 'vitest';

import { ENTITY_TYPES } from '@/lib/domain/hierarchy';
import {
  REFERENTIELS,
  SLUGS_REFERENTIELS,
  estSlugReferentiel,
} from '@/lib/domain/referentiels';
import { creerEntiteSchema, filtresEntiteSchema } from '@/lib/validation/entity';

/**
 * CA-02 — les regles portees par les schemas de validation sont couvertes au
 * meme titre que celles portees par le domaine.
 */

describe('RG-02 — validation du code d une entite', () => {
  const base = { type: 'DISTRICT' as const, nom: 'District Avaradrano', parentId: crypto.randomUUID() };

  it('normalise le code en majuscules', () => {
    const resultat = creerEntiteSchema.safeParse({ ...base, code: ' dis-ava ' });
    expect(resultat.success).toBe(true);
    if (resultat.success) expect(resultat.data.code).toBe('DIS-AVA');
  });

  it('refuse un code de moins de 3 caracteres', () => {
    expect(creerEntiteSchema.safeParse({ ...base, code: 'DA' }).success).toBe(false);
  });

  it('refuse un code de plus de 16 caracteres', () => {
    expect(creerEntiteSchema.safeParse({ ...base, code: 'A'.repeat(17) }).success).toBe(false);
  });

  it('refuse les caracteres interdits', () => {
    for (const code of ['DIS_AVA', 'DIS AVA', 'DIS.AVA', '-DISAVA']) {
      expect(creerEntiteSchema.safeParse({ ...base, code }).success, code).toBe(false);
    }
  });

  it('applique false par defaut a sansAccesApplication', () => {
    const resultat = creerEntiteSchema.safeParse({ ...base, code: 'DIS-AVA' });
    expect(resultat.success).toBe(true);
    if (resultat.success) expect(resultat.data.sansAccesApplication).toBe(false);
  });

  it('accepte un parent nul — le controle croise type/parent est fait ailleurs', () => {
    // `validerRattachement` produit le message metier ; le schema ne verifie
    // que la FORME. Les deux sont testes separement.
    const resultat = creerEntiteSchema.safeParse({
      type: 'SIEGE',
      code: 'SIEGE',
      nom: 'Siege National',
      parentId: null,
    });
    expect(resultat.success).toBe(true);
  });
});

describe('Filtres de la liste des entites', () => {
  it('retient « tous » par defaut', () => {
    const resultat = filtresEntiteSchema.parse({});
    expect(resultat.actif).toBe('tous');
  });

  it('refuse un type inconnu', () => {
    expect(filtresEntiteSchema.safeParse({ type: 'CANTON' }).success).toBe(false);
  });
});

describe('Registre des referentiels — EF-REF-01 a 04', () => {
  it('declare les quatre referentiels attendus', () => {
    expect([...SLUGS_REFERENTIELS].sort()).toEqual([
      'categories-finance',
      'fonctions',
      'grades',
      'nationalites',
    ]);
  });

  it('reconnait un slug valide et rejette les autres', () => {
    expect(estSlugReferentiel('grades')).toBe(true);
    expect(estSlugReferentiel('paroisses')).toBe(false);
  });

  it('associe a chaque referentiel une table, des colonnes et des champs', () => {
    for (const slug of SLUGS_REFERENTIELS) {
      const definition = REFERENTIELS[slug];
      expect(definition.table, slug).toBeTruthy();
      expect(definition.colonnes.length, slug).toBeGreaterThan(0);
      expect(definition.champs.length, slug).toBeGreaterThan(0);
    }
  });

  it('RG-13 : le sens d une categorie financiere est immuable apres creation', () => {
    const champSens = REFERENTIELS['categories-finance'].champs.find((c) => c.cle === 'sens');
    // Le retourner reviendrait a inverser retroactivement le signe de tous les
    // mouvements deja enregistres.
    expect(champSens?.immuable).toBe(true);
  });

  it('marque les codes comme immuables : ce sont des references stables', () => {
    for (const slug of SLUGS_REFERENTIELS) {
      const champCode = REFERENTIELS[slug].champs.find(
        (c) => c.cle === 'code' || c.cle === 'code_iso',
      );
      expect(champCode?.immuable, slug).toBe(true);
    }
  });

  it('RG-31 : les fonctions portent l indicateur « financiere »', () => {
    const champ = REFERENTIELS.fonctions.champs.find((c) => c.cle === 'est_financiere');
    expect(champ?.type).toBe('booleen');
  });

  it('propose tous les niveaux hierarchiques pour une fonction', () => {
    const champ = REFERENTIELS.fonctions.champs.find((c) => c.cle === 'niveaux_applicables');
    expect(champ?.type).toBe('choix-multiple');
    if (champ?.type === 'choix-multiple') {
      expect(champ.options.map((o) => o.valeur)).toEqual([...ENTITY_TYPES]);
    }
  });
});

describe('Schemas des referentiels', () => {
  it('normalise un code de grade', () => {
    const resultat = REFERENTIELS.grades.schema.safeParse({
      code: 'chef de choeur',
      libelle: 'Chef de choeur',
      ordre: 60,
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) expect(resultat.data.code).toBe('CHEF_DE_CHOEUR');
  });

  it('impose exactement trois lettres a un code ISO', () => {
    const schema = REFERENTIELS.nationalites.schema;
    expect(schema.safeParse({ code_iso: 'BE', libelle: 'Beninoise' }).success).toBe(false);
    expect(schema.safeParse({ code_iso: 'BENI', libelle: 'Beninoise' }).success).toBe(false);

    const bon = schema.safeParse({ code_iso: 'ben', libelle: 'Beninoise' });
    expect(bon.success).toBe(true);
    if (bon.success) expect(bon.data.code_iso).toBe('BEN');
  });

  it('exige au moins un niveau applicable pour une fonction', () => {
    const resultat = REFERENTIELS.fonctions.schema.safeParse({
      code: 'TEST',
      libelle: 'Test',
      categorie: 'AUTRE',
      niveaux_applicables: [],
    });
    expect(resultat.success).toBe(false);
  });

  it('n accepte qu un sens connu pour une categorie financiere', () => {
    const schema = REFERENTIELS['categories-finance'].schema;
    expect(schema.safeParse({ code: 'X', libelle: 'X', sens: 'AUTRE' }).success).toBe(false);
    expect(schema.safeParse({ code: 'DIME2', libelle: 'Dime', sens: 'RECETTE' }).success).toBe(
      true,
    );
  });
});

describe('EF-REF-05 — ou chaque referentiel est employe', () => {
  it('declare un usage pour tout referentiel deja reference', () => {
    // Le decompte prealable sert a MOTIVER un refus : « ce grade est porte par
    // 42 croyants » se corrige, un code 23503 ne se comprend pas.
    expect(REFERENTIELS.grades.usages).toContainEqual({
      table: 'croyants',
      colonne: 'grade_id',
      quoi: 'croyant',
    });
    expect(REFERENTIELS.nationalites.usages.map((u) => u.table)).toEqual(['croyants']);
    expect(REFERENTIELS.fonctions.usages.map((u) => u.table)).toEqual([
      'bureau_membres',
      'bureau_postes',
    ]);
  });

  it('laisse vide ce que rien ne reference encore', () => {
    // Les mouvements financiers arrivent au lot 4 : cette liste devra grandir
    // avec eux. La cle etrangere protege meme si on l'oublie.
    expect(REFERENTIELS['categories-finance'].usages).toEqual([]);
  });

  it('nomme une colonne et un libelle pour chaque usage declare', () => {
    for (const slug of SLUGS_REFERENTIELS) {
      for (const usage of REFERENTIELS[slug].usages) {
        expect(usage.table.length, slug).toBeGreaterThan(0);
        expect(usage.colonne.endsWith('_id'), `${slug} → ${usage.colonne}`).toBe(true);
        // Le libelle est au SINGULIER : l'action accorde selon le decompte.
        expect(usage.quoi.endsWith('s'), `${slug} → ${usage.quoi}`).toBe(false);
      }
    }
  });
});
