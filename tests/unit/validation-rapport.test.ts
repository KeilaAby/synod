import { describe, expect, it } from 'vitest';

import {
  archiverModeleSchema,
  creerModeleSchema,
  dupliquerModeleSchema,
  modifierModeleSchema,
} from '@/lib/validation/rapport';

/**
 * Les schemas de la bibliotheque de modeles — EF-RAP-07 a 11.
 */

const UUID = '11111111-2222-4333-8444-555555555555';

const CREATION = {
  nom: 'Synthese trimestrielle',
  description: '',
  niveauxApplicables: [],
  visibilite: 'ENTITE',
} as const;

describe('EF-RAP-07 — creer un modele', () => {
  it('accepte le formulaire minimal', () => {
    const analyse = creerModeleSchema.safeParse(CREATION);
    expect(analyse.success).toBe(true);
  });

  /**
   * Regle 12 — UN SCHEMA PARTAGE CLIENT/SERVEUR EST IDEMPOTENT.
   *
   * Le client valide puis transforme, le serveur revalide ce qu'il recoit. Un
   * schema qui ne rend pas la meme chose au second passage refuse alors sa
   * propre sortie — et le refus ne vient ni du client ni du serveur.
   */
  it('parse sa propre sortie a l identique', () => {
    const premier = creerModeleSchema.parse(CREATION);
    const second = creerModeleSchema.parse(premier);
    expect(second).toEqual(premier);
  });

  it('ramene une description vide a null, pas a une chaine vide', () => {
    // `''` en base n'est pas `null` : la carte afficherait un paragraphe vide
    // la ou elle doit ne rien afficher du tout.
    expect(creerModeleSchema.parse(CREATION).description).toBeNull();
    expect(
      creerModeleSchema.parse({ ...CREATION, description: '   ' }).description,
    ).toBeNull();
  });

  it('exige trois caracteres, comme la contrainte en base', () => {
    /**
     * `report_templates_nom_check` verifie `length(trim(nom)) >= 3`. Un schema
     * plus permissif laisserait la contrainte refuser sans message lisible ;
     * plus strict, il refuserait ce que la base accepte.
     */
    expect(creerModeleSchema.safeParse({ ...CREATION, nom: 'ab' }).success).toBe(false);
    expect(creerModeleSchema.safeParse({ ...CREATION, nom: '  a  ' }).success).toBe(false);
    expect(creerModeleSchema.safeParse({ ...CREATION, nom: ' abc ' }).success).toBe(true);
  });

  /**
   * UNE ENTITE COMPOSE POUR ELLE-MEME.
   *
   * L'entite proprietaire ne voyage pas dans le formulaire : le serveur la lit
   * dans la session. La laisser passer ouvrirait exactement ce qu'on ferme —
   * composer chez le voisin — et obligerait a le refuser ensuite, ce qui est
   * toujours moins sur que de ne pas le demander.
   */
  it('ECARTE toute entite proprietaire envoyee par le client', () => {
    const analyse = creerModeleSchema.parse({ ...CREATION, entityId: UUID });
    expect(analyse).not.toHaveProperty('entityId');
  });

  it('accepte le modele officiel du Siege — EF-RAP-08', () => {
    const analyse = creerModeleSchema.safeParse({
      ...CREATION,
      estOfficiel: true,
      visibilite: 'GLOBAL',
    });
    expect(analyse.success).toBe(true);
  });

  it('refuse une portee de visibilite inventee', () => {
    expect(creerModeleSchema.safeParse({ ...CREATION, visibilite: 'PUBLIC' }).success).toBe(
      false,
    );
  });
});

describe('EF-RAP-10 — les niveaux auxquels un modele s applique', () => {
  it('accepte une liste VIDE — ne rien restreindre n est pas tout refuser', () => {
    // Regle 15, et `modeleSApplique` dit la meme chose cote domaine : une liste
    // vide ne borne rien. Un `min(1)` ici rendrait le cas le plus courant
    // impossible a saisir.
    expect(creerModeleSchema.parse(CREATION).niveauxApplicables).toEqual([]);
  });

  it('DEDOUBLONNE et remet dans l ordre hierarchique', () => {
    /**
     * La colonne est un `entity_type[]` que rien ne dedoublonne, et l'ordre de
     * saisie n'a aucun sens : deux modeles poses sur les memes niveaux doivent
     * se lire pareil dans la bibliotheque.
     */
    const analyse = creerModeleSchema.parse({
      ...CREATION,
      niveauxApplicables: ['EGLISE', 'DISTRICT', 'EGLISE'],
    });
    expect(analyse.niveauxApplicables).toEqual(['DISTRICT', 'EGLISE']);
  });

  it('refuse un niveau qui n existe pas dans la hierarchie', () => {
    expect(
      creerModeleSchema.safeParse({ ...CREATION, niveauxApplicables: ['DIOCESE'] }).success,
    ).toBe(false);
  });
});

describe('EF-RAP-11 — modifier un modele', () => {
  const MODIFICATION = {
    modeleId: UUID,
    nom: 'Synthese annuelle',
    description: 'Presentee au conseil.',
    niveauxApplicables: ['DISTRICT'],
    visibilite: 'DESCENDANTS',
  } as const;

  it('parse sa propre sortie a l identique', () => {
    const premier = modifierModeleSchema.parse(MODIFICATION);
    expect(modifierModeleSchema.parse(premier)).toEqual(premier);
  });

  /**
   * Regle 19 — UNE ACTION N ECRIT QUE LES CHAMPS DONT SON FORMULAIRE EST LA
   * SOURCE.
   *
   * Le pop-up n'affiche ni la composition, ni l'entite proprietaire, ni le
   * caractere officiel. Envoyes quand meme, ils arriveraient vides et
   * effaceraient la donnee — sans message et sans erreur. Le schema les
   * ECARTE, ce qui rend l'oubli impossible plutot qu'improbable.
   */
  it('ECARTE la structure, l entite et le caractere officiel', () => {
    const analyse = modifierModeleSchema.parse({
      ...MODIFICATION,
      structure: { sections: [] },
      entityId: UUID,
      estOfficiel: true,
      version: 42,
    });

    expect(analyse).not.toHaveProperty('structure');
    expect(analyse).not.toHaveProperty('entityId');
    expect(analyse).not.toHaveProperty('estOfficiel');
    expect(analyse).not.toHaveProperty('version');
  });

  it('exige un identifiant de modele', () => {
    expect(
      modifierModeleSchema.safeParse({ ...MODIFICATION, modeleId: 'pas-un-uuid' }).success,
    ).toBe(false);
  });
});

describe('EF-RAP-11 — dupliquer et archiver', () => {
  it('laisse le nom du duplicata facultatif — le serveur numerote', () => {
    expect(dupliquerModeleSchema.parse({ modeleId: UUID, nom: '' }).nom).toBeNull();
  });

  it('n accepte AUCUNE entite cible — le duplicata revient a celle de l auteur', () => {
    // Meme raison qu'a la creation : une entite compose pour elle-meme, donc
    // elle copie chez elle. Le choix n'existe pas, il n'y a rien a refuser.
    const analyse = dupliquerModeleSchema.parse({ modeleId: UUID, entityId: UUID, nom: null });
    expect(analyse).not.toHaveProperty('entityId');
  });

  it('archive et desarchive par LE MEME schema', () => {
    // Regle 16 — deux actions symetriques qui divergent finissent par ne plus
    // ecrire la meme colonne.
    expect(archiverModeleSchema.parse({ modeleId: UUID, archiver: true }).archiver).toBe(true);
    expect(archiverModeleSchema.parse({ modeleId: UUID, archiver: false }).archiver).toBe(
      false,
    );
  });

  it('exige de dire dans quel sens on archive', () => {
    // Sans booleen explicite, l'action devrait deviner l'etat courant — et deux
    // clics rapides basculeraient deux fois depuis la meme lecture.
    expect(archiverModeleSchema.safeParse({ modeleId: UUID }).success).toBe(false);
  });
});
