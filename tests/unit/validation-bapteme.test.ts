import { describe, expect, it } from 'vitest';

import { saisirBaptiseSchema } from '@/lib/validation/bapteme';

/**
 * EF-BAP-01 a 03 — saisie d'un nouveau baptise.
 *
 * Ces tests portent surtout sur l'IDEMPOTENCE du schema. Le meme schema valide
 * cote client puis cote serveur : le serveur revalide donc des valeurs deja
 * transformees une fois. Un schema non idempotent produit alors des resultats
 * differents au second passage — c'est ce qui avait fait naitre des dates au
 * 1er janvier 1970 a partir d'un champ vide (regle 12 de CLAUDE.md).
 */

const uuid = () => crypto.randomUUID();

const base = {
  nom: 'RAKOTONIRINA',
  prenom: 'Mamitiana',
  sexe: 'M' as const,
  dateNaissance: '2000-12-12',
  adresse: 'Ambohitromanjaka',
  egliseId: uuid(),
  gradeId: uuid(),
  nationaliteId: uuid(),
  dateBapteme: '2026-08-07',
};

describe('EF-BAP-01 — champs obligatoires de la personne', () => {
  it('accepte une saisie minimale', () => {
    const analyse = saisirBaptiseSchema.safeParse(base);
    expect(analyse.success).toBe(true);
  });

  it("exige une adresse : on ne peut pas l'inventer", () => {
    // « Simplifie » qualifie le PARCOURS, pas les donnees : un champ NOT NULL
    // en base le reste dans le formulaire.
    const analyse = saisirBaptiseSchema.safeParse({ ...base, adresse: '' });
    expect(analyse.success).toBe(false);
  });
});

describe('RG-28 — un bapteme ne precede jamais une naissance', () => {
  it('refuse un bapteme anterieur a la naissance', () => {
    const analyse = saisirBaptiseSchema.safeParse({
      ...base,
      dateNaissance: '2020-01-01',
      dateBapteme: '2019-01-01',
    });

    expect(analyse.success).toBe(false);
    if (!analyse.success) {
      // Le message doit se poser sur le champ fautif : une erreur affichee
      // ailleurs que la ou l'on a saisi n'aide personne.
      expect(analyse.error.issues[0]?.path).toEqual(['dateBapteme']);
    }
  });

  it('accepte un bapteme le jour meme de la naissance', () => {
    const analyse = saisirBaptiseSchema.safeParse({
      ...base,
      dateNaissance: '2026-08-07',
      dateBapteme: '2026-08-07',
    });
    expect(analyse.success).toBe(true);
  });
});

describe('Regle 12 — le schema doit etre idempotent', () => {
  const optionnels = ['telephone', 'lieu', 'sessionLibelle'] as const;

  it('transforme le vide en null, et le null reste null', () => {
    const vide = saisirBaptiseSchema.parse({
      ...base,
      telephone: '',
      lieu: '',
      sessionLibelle: '',
    });

    for (const champ of optionnels) {
      expect(vide[champ], champ).toBeNull();
    }

    // SECOND passage sur la sortie du premier : c'est exactement ce que fait le
    // serveur apres le client. Le resultat doit etre identique.
    const rejoue = saisirBaptiseSchema.parse({
      ...vide,
      dateNaissance: vide.dateNaissance,
      dateBapteme: vide.dateBapteme,
    });

    for (const champ of optionnels) {
      expect(rejoue[champ], champ).toBeNull();
    }
    expect(rejoue.dateBapteme.getTime()).toBe(vide.dateBapteme.getTime());
    expect(rejoue.dateNaissance.getTime()).toBe(vide.dateNaissance.getTime());
  });

  it('ne fabrique jamais une date a partir de rien', () => {
    // `z.coerce.date(null)` donne le 1er janvier 1970 : les dates de bapteme
    // et de naissance sont obligatoires, une absence doit donc ECHOUER, pas
    // produire une date absurde.
    for (const valeur of ['', null, undefined]) {
      expect(
        saisirBaptiseSchema.safeParse({ ...base, dateBapteme: valeur }).success,
        String(valeur),
      ).toBe(false);
    }
  });
});
