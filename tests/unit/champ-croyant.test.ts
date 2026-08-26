import { describe, expect, it } from 'vitest';

import {
  CHAMPS,
  CHAMPS_EDITABLES,
  type ChampEditable,
  colonneDe,
  estChampEditable,
} from '@/lib/domain/champ-croyant';
import { valeurDeChamp } from '@/lib/validation/croyant';

/**
 * EF-CRO-01 — la modification d'un champ depuis la fiche.
 *
 * CE QUE CES TESTS PROTEGENT : la colonne ecrite vient du REGISTRE, jamais de
 * la charge utile. Un appel forge ne peut donc designer que ce qui est declare
 * ici — et ce qui n'y est PAS declare est le coeur de la regle.
 */

describe('EF-CRO-01 — ce qui ne s’édite jamais sur place', () => {
  /**
   * TROIS EXCLUSIONS, TROIS CIRCUITS QUI EXISTENT DEJA.
   *
   * L'eglise est un TRANSFERT (EF-TRF-01), avec approbation et trace. Le grade
   * passe par le circuit de promotion (EF-CRO-12), qui demande « erreur ou
   * decision » et peut exiger un motif. Le conjoint est un lien SYMETRIQUE
   * (migration 0071) : le poser ecrit sur DEUX fiches.
   *
   * Un crayon a cote de l'un de ces trois contournerait tout cela d'un clic.
   */
  it.each(['egliseId', 'eglise_id', 'gradeId', 'grade_id', 'conjointId', 'conjoint_id'])(
    '« %s » n’est pas modifiable sur place',
    (interdit) => {
      expect(estChampEditable(interdit)).toBe(false);
    },
  );

  /** Le matricule est attribue par la BASE (règle 14) : rien ne le réécrit. */
  it('n’expose ni le matricule ni la photo', () => {
    expect(estChampEditable('matricule')).toBe(false);
    expect(estChampEditable('photo_key')).toBe(false);
  });

  /**
   * AUCUNE COLONNE DECLAREE NE DOIT ETRE INTERDITE. Le test precedent verifie
   * les CLES ; celui-ci verifie les COLONNES, car c'est elles qui atteignent la
   * base — une cle anodine pointant `eglise_id` produirait le meme dégât.
   */
  it('ne pointe aucune colonne réservée', () => {
    const interdites = ['eglise_id', 'grade_id', 'conjoint_id', 'matricule', 'photo_key'];
    const visees = CHAMPS_EDITABLES.map(colonneDe);

    expect(visees.filter((c) => interdites.includes(c))).toEqual([]);
  });

  it('déclare une colonne pour chaque champ, sans doublon', () => {
    const colonnes = CHAMPS_EDITABLES.map(colonneDe);
    expect(colonnes.every(Boolean)).toBe(true);
    expect(new Set(colonnes).size).toBe(colonnes.length);
  });
});

describe('valeurDeChamp — un vide n’a pas le même sens partout', () => {
  /**
   * UN CHAMP FACULTATIF SE VIDE, et c'est une operation legitime : on retire un
   * telephone qui n'est plus le bon. Il rend `null`, pas la chaine vide — la
   * base distingue « pas de valeur » de « valeur vide ».
   */
  it('vide un champ facultatif vers null', () => {
    expect(valeurDeChamp('telephone', '')).toEqual({ ok: true, valeur: null });
    expect(valeurDeChamp('dateBapteme', '   ')).toEqual({ ok: true, valeur: null });
  });

  it('REFUSE de vider un champ obligatoire', () => {
    const r = valeurDeChamp('nom', '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toContain('Nom');
  });
});

describe('valeurDeChamp — les ensembles clos', () => {
  it('accepte une valeur de la liste', () => {
    expect(valeurDeChamp('sexe', 'F')).toEqual({ ok: true, valeur: 'F' });
    expect(valeurDeChamp('statut', 'INACTIF')).toEqual({ ok: true, valeur: 'INACTIF' });
  });

  /**
   * Une valeur hors liste vient d'un appel FORGE, pas d'un ecran : on la refuse
   * sans chercher a l'interpreter.
   */
  it('refuse une valeur que la liste ne contient pas', () => {
    expect(valeurDeChamp('sexe', 'X').ok).toBe(false);
    expect(valeurDeChamp('statut', 'SUPPRIME').ok).toBe(false);
  });
});

describe('valeurDeChamp — les dates', () => {
  it('accepte le format d’un champ de date', () => {
    expect(valeurDeChamp('dateNaissance', '1988-07-04')).toEqual({
      ok: true,
      valeur: '1988-07-04',
    });
  });

  /**
   * ON NE PASSE PAS PAR `Date` POUR VALIDER : `new Date('2026-02-31')` donne le
   * 3 mars sans broncher, et la fiche porterait une date que personne n'a
   * saisie.
   */
  it('refuse un 31 février, que `Date` accepterait en glissant', () => {
    expect(valeurDeChamp('dateNaissance', '2026-02-31').ok).toBe(false);
  });

  it('refuse un format qui n’est pas une date', () => {
    expect(valeurDeChamp('dateNaissance', '04/07/1988').ok).toBe(false);
    expect(valeurDeChamp('dateNaissance', 'hier').ok).toBe(false);
  });
});

describe('valeurDeChamp — les références et le texte', () => {
  it('exige un identifiant pour une référence', () => {
    expect(valeurDeChamp('nationaliteId', 'Malgache').ok).toBe(false);
    expect(
      valeurDeChamp('nationaliteId', '3f2504e0-4f89-11d3-9a0c-0305e82c3301').ok,
    ).toBe(true);
  });

  /**
   * LES BORNES SONT CELLES DU FORMULAIRE COMPLET : deux chemins qui ecrivent la
   * meme colonne avec deux regles finiraient par accepter ici ce que l'autre
   * refuse.
   */
  it('applique les mêmes bornes que le formulaire complet', () => {
    expect(valeurDeChamp('nom', 'A').ok).toBe(false);
    expect(valeurDeChamp('adresse', 'ab').ok).toBe(false);
    expect(valeurDeChamp('email', 'pas-une-adresse').ok).toBe(false);
    expect(valeurDeChamp('email', 'jean@exemple.mg').ok).toBe(true);
  });

  it('coupe les espaces autour de la valeur retenue', () => {
    expect(valeurDeChamp('prenom', '  Jean  ')).toEqual({ ok: true, valeur: 'Jean' });
  });
});

describe('Le registre reste cohérent', () => {
  it('donne une liste de valeurs à chaque champ de type « choix »', () => {
    for (const cle of CHAMPS_EDITABLES) {
      const def = CHAMPS[cle as ChampEditable];
      if (def.nature === 'choix') {
        expect(def.options?.length, cle).toBeGreaterThan(0);
      }
    }
  });

  it('porte un libellé pour chaque champ', () => {
    for (const cle of CHAMPS_EDITABLES) {
      expect(CHAMPS[cle as ChampEditable].label.length, cle).toBeGreaterThan(1);
    }
  });
});
