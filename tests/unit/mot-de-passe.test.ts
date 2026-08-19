import { describe, expect, it } from 'vitest';

import { MOT_DE_PASSE_LONGUEUR_MIN } from '@/lib/auth/types';
import { genererMotDePasse, respecteLaPolitique } from '@/lib/domain/mot-de-passe';

/**
 * EF-ADM-01, EF-ADM-08, ENF-SEC-03 — le mot de passe remis en main propre.
 */

const CENT = Array.from({ length: 100 }, () => genererMotDePasse());

describe('ENF-SEC-03 — le mot de passe genere respecte la politique', () => {
  it('la respecte a CHAQUE tirage, pas en moyenne', () => {
    /**
     * Les trois exigences sont POSEES puis melangees, jamais esperees d'un
     * tirage : sinon, une fois sur quelques centaines, le generateur
     * produirait un mot de passe que le serveur refuserait — et l'echec
     * arriverait a la creation du compte, devant l'utilisateur.
     */
    for (const mot of CENT) {
      expect(respecteLaPolitique(mot, MOT_DE_PASSE_LONGUEUR_MIN), mot).toBe(true);
    }
  });
});

describe('EF-ADM-01 — il doit se dicter et se recopier', () => {
  it('n emploie AUCUN caractere ambigu', () => {
    // `0`/`O`, `1`/`l`/`I` : la moitie des echecs de premiere connexion vient
    // de la. On y perd un peu d'entropie par caractere, on la reprend en
    // longueur.
    for (const mot of CENT) {
      expect(mot, mot).not.toMatch(/[0O1lI]/);
    }
  });

  it('n emploie aucune ponctuation', () => {
    // Elle ne survit ni a la dictee — « tiret du huit ou underscore ? » — ni
    // aux claviers de telephone. Le tiret de groupe est la seule exception.
    for (const mot of CENT) {
      expect(mot.replaceAll('-', ''), mot).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it('se lit en trois groupes de cinq', () => {
    for (const mot of CENT) {
      const groupes = mot.split('-');
      expect(groupes, mot).toHaveLength(3);
      for (const groupe of groupes) expect(groupe, mot).toHaveLength(5);
    }
  });
});

describe('Le generateur ne se repete pas', () => {
  it('rend cent valeurs distinctes', () => {
    // Un generateur qui rendrait deux fois la meme chose sur cent tirages
    // aurait un defaut de tirage, pas de la malchance.
    expect(new Set(CENT).size).toBe(CENT.length);
  });
});

describe('Le filet de la politique', () => {
  it('refuse ce qui manque une exigence', () => {
    expect(respecteLaPolitique('abcdefghijklmno', 12)).toBe(false); // ni majuscule ni chiffre
    expect(respecteLaPolitique('ABCDEFGHIJKLMNO', 12)).toBe(false); // ni minuscule ni chiffre
    expect(respecteLaPolitique('Abc2', 12)).toBe(false); // trop court
  });

  it('mesure la longueur SANS les tirets de groupe', () => {
    // Ils aident a la lecture, ils n'ajoutent rien a la robustesse : les
    // compter ferait passer un mot de passe plus court qu'il n'y parait.
    expect(respecteLaPolitique('Ab2de-Fg3hi', 12)).toBe(false);
    expect(respecteLaPolitique('Ab2de-Fg3hi-Jk4mn', 12)).toBe(true);
  });
});
