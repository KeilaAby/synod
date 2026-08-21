import { describe, expect, it } from 'vitest';

import type { SessionUtilisateur } from '@/lib/domain/permissions';
import {
  type EntiteDeLArbre,
  PERMISSION_PROMOTION,
  JOURS_ERREUR_GRADE,
  arbitreDePromotion,
  correctionDeGradePossible,
  estRetrogradation,
  motifDeRetrogradationManquant,
  peutDeciderPromotion,
  peutRetirerPromotion,
  promotionSoumiseAValidation,
} from '@/lib/domain/promotion';

/**
 * EF-CRO-12, RG-06 — la promotion de grade passe par l'entite superieure.
 *
 * CE QUE CE CIRCUIT PROTEGE : un grade vaut dans TOUTE l'organisation.
 * « Pasteur a Antananarivo » et « Pasteur a Toamasina » doivent designer la
 * meme chose, sans quoi le referentiel ne veut plus rien dire.
 */

const ARBRE: EntiteDeLArbre[] = [
  { id: 'siege', nom: 'Siège', path: 'siege', parent_id: null },
  { id: 'district', nom: 'District Nord', path: 'siege.district', parent_id: 'siege' },
  {
    id: 'paroisse',
    nom: 'Paroisse Centre',
    path: 'siege.district.paroisse',
    parent_id: 'district',
  },
  {
    id: 'eglise',
    nom: 'Ambohipo',
    path: 'siege.district.paroisse.eglise',
    parent_id: 'paroisse',
  },
];

function session(partiel: Partial<SessionUtilisateur> = {}): SessionUtilisateur {
  return {
    profileId: 'p1',
    role: 'GESTIONNAIRE',
    entityId: 'paroisse',
    scopePath: 'siege.district.paroisse',
    permissions: [],
    ...partiel,
  } as SessionUtilisateur;
}

describe('arbitreDePromotion', () => {
  /**
   * LE PARENT, ET NON UN ANCETRE QUELCONQUE. Remonter plus haut ferait
   * trancher le Siege des promotions de cellule ; s'arreter a l'eglise ne
   * serait plus une validation par un tiers.
   */
  it('EF-CRO-12 — rend le PARENT immédiat de l’église', () => {
    expect(arbitreDePromotion('siege.district.paroisse.eglise', ARBRE)?.id).toBe(
      'paroisse',
    );
    expect(arbitreDePromotion('siege.district.paroisse', ARBRE)?.id).toBe('district');
  });

  /**
   * Une promotion decidee au Siege n'a personne au-dessus. Refuser tout
   * changement de grade la-haut serait pire que l'absence de circuit.
   */
  it('rend null au sommet : le Siège n’a personne au-dessus', () => {
    expect(arbitreDePromotion('siege', ARBRE)).toBeNull();
  });

  it('rend null sur une entité introuvable', () => {
    expect(arbitreDePromotion('siege.inexistante', ARBRE)).toBeNull();
  });
});

describe('promotionSoumiseAValidation', () => {
  const base = {
    validationActive: true,
    gradeActuelId: 'croyant',
    gradeDemandeId: 'diacre',
    arbitreId: 'paroisse',
  };

  it('EF-CRO-12 — soumet un changement de grade quand le circuit est ouvert', () => {
    expect(promotionSoumiseAValidation(base)).toBe(true);
  });

  /**
   * LE REGLAGE EST FERME PAR DEFAUT : une organisation qui n'en veut pas
   * continue de poser les grades directement, comme avant.
   */
  it('ne soumet RIEN quand le réglage est fermé', () => {
    expect(promotionSoumiseAValidation({ ...base, validationActive: false })).toBe(false);
  });

  /**
   * Reenregistrer une fiche sans toucher au grade ne doit ouvrir aucune
   * demande : la file se remplirait de promotions vers le grade deja porte.
   */
  it('RG-06 — ne soumet pas un grade inchangé', () => {
    expect(
      promotionSoumiseAValidation({ ...base, gradeDemandeId: base.gradeActuelId! }),
    ).toBe(false);
  });

  /** Sans entite superieure, il n'y a personne a qui demander. */
  it('ne soumet pas quand il n’y a pas d’arbitre', () => {
    expect(promotionSoumiseAValidation({ ...base, arbitreId: null })).toBe(false);
  });

  it('soumet une PREMIÈRE attribution de grade', () => {
    expect(promotionSoumiseAValidation({ ...base, gradeActuelId: null })).toBe(true);
  });
});

describe('peutDeciderPromotion', () => {
  const octroi = (portee: string) => ({ permission: PERMISSION_PROMOTION, scopePath: portee });

  /**
   * LA PORTEE FAIT TOUT LE TRAVAIL : le droit s'evalue sur l'entite SUPERIEURE
   * figee a la demande.
   */
  it('EF-CRO-12 — accepte celui dont la portée couvre l’arbitre', () => {
    const s = session({
      scopePath: 'siege.district.paroisse',
      permissions: [octroi('siege.district.paroisse')],
    });
    expect(
      peutDeciderPromotion(s, {
        statut: 'DEMANDE',
        arbitrePath: 'siege.district.paroisse',
      }),
    ).toBe(true);
  });

  /**
   * L'ANTI-AUTO-APPROBATION, ET ELLE NE COUTE AUCUNE REGLE DE PLUS. Un compte
   * borne a l'eglise ne couvre pas son parent, donc ne peut pas s'approuver
   * lui-meme.
   */
  it('EF-CRO-12 — REFUSE un compte borné à l’église : il ne couvre pas son parent', () => {
    const s = session({
      entityId: 'eglise',
      scopePath: 'siege.district.paroisse.eglise',
      permissions: [octroi('siege.district.paroisse.eglise')],
    });
    expect(
      peutDeciderPromotion(s, {
        statut: 'DEMANDE',
        arbitrePath: 'siege.district.paroisse',
      }),
    ).toBe(false);
  });

  /**
   * Une demande DEJA TRANCHEE ne se retranche pas : le second verdict
   * ecraserait le premier sans que personne ne l'ait voulu.
   */
  it('refuse toute demande déjà tranchée', () => {
    const s = session({ permissions: [octroi('siege.district.paroisse')] });
    for (const statut of ['APPROUVE', 'REFUSE', 'ANNULE'] as const) {
      expect(
        peutDeciderPromotion(s, { statut, arbitrePath: 'siege.district.paroisse' }),
        statut,
      ).toBe(false);
    }
  });

  it('refuse sans le droit, même avec la bonne portée', () => {
    expect(
      peutDeciderPromotion(session(), {
        statut: 'DEMANDE',
        arbitrePath: 'siege.district.paroisse',
      }),
    ).toBe(false);
  });
});

describe('peutRetirerPromotion', () => {
  /**
   * Se raviser n'est pas trancher : cela ne demande pas le droit de l'arbitre,
   * mais cela ne permet pas non plus de retirer la demande d'une autre eglise.
   */
  it('laisse l’église retirer SA demande tant que rien n’est tranché', () => {
    const s = session({
      scopePath: 'siege.district.paroisse',
      permissions: [{ permission: 'croyant.update', scopePath: 'siege.district.paroisse' }],
    });
    expect(
      peutRetirerPromotion(s, {
        statut: 'DEMANDE',
        eglisePath: 'siege.district.paroisse.eglise',
      }),
    ).toBe(true);
  });

  it('refuse une demande déjà tranchée', () => {
    const s = session({
      permissions: [{ permission: 'croyant.update', scopePath: 'siege.district.paroisse' }],
    });
    expect(
      peutRetirerPromotion(s, {
        statut: 'APPROUVE',
        eglisePath: 'siege.district.paroisse.eglise',
      }),
    ).toBe(false);
  });

  it('refuse la demande d’une église hors du périmètre', () => {
    const s = session({
      scopePath: 'siege.district.paroisse',
      permissions: [{ permission: 'croyant.update', scopePath: 'siege' }],
    });
    expect(
      peutRetirerPromotion(s, { statut: 'DEMANDE', eglisePath: 'siege.autre.eglise' }),
    ).toBe(false);
  });
});

/**
 * EF-CRO-12 — MONTER, OU DESCENDRE.
 *
 * Meme principe que le retrait d'un titulaire : ce qui RETIRE quelque chose a
 * quelqu'un se motive, ce qui lui en donne non.
 */
describe('estRetrogradation', () => {
  /**
   * LE PLUS PETIT `ordre` EST LE GRADE LE PLUS ELEVE.
   *
   * CE SENS A ETE ECRIT A L'ENVERS DEUX FOIS AVANT D'ETRE VERIFIE, et c'est un
   * ESSAI qui l'a tranche le 21 aout 2026 : promouvoir un Croyant en Diacre
   * declenchait le pop-up de retrogradation. Dans les donnees reelles,
   * « Diacre » porte donc un `ordre` PLUS PETIT que « Croyant » tout en lui
   * etant superieur.
   *
   * La lecon vaut d'etre gardee : sur une convention de tri, l'enonce et la
   * donnee peuvent diverger, et c'est la donnee qui a raison.
   *
   * Ce test verrouille les DEUX directions — se tromper de sens fait exiger un
   * motif sur les promotions tout en laissant passer les retrogradations sans
   * rien, et aucun des deux ne se remarque tant que personne n'essaie.
   */
  it('EF-CRO-12 — un ordre PLUS GRAND désigne un grade INFÉRIEUR', () => {
    // Diacre (10) -> Croyant (100) : une descente.
    expect(estRetrogradation(10, 100)).toBe(true);
    // Croyant (100) -> Diacre (10) : une promotion, aucun motif exige.
    expect(estRetrogradation(100, 10)).toBe(false);
  });

  it('ne voit pas de rétrogradation à rang égal', () => {
    expect(estRetrogradation(50, 50)).toBe(false);
  });

  /**
   * ON NE CONCLUT PAS SUR CE QU'ON NE SAIT PAS COMPARER : exiger un motif sur
   * une promotion ordinaire ferait taper une justification pour rien, et
   * l'utilisateur apprendrait a ecrire n'importe quoi dans ce champ.
   */
  it('règle 15 — ne conclut à rien quand un rang est inconnu', () => {
    expect(estRetrogradation(null, 100)).toBe(false);
    expect(estRetrogradation(10, undefined)).toBe(false);
  });
});

describe('motifDeRetrogradationManquant', () => {
  it('EF-CRO-12 — exige un motif pour une descente', () => {
    expect(
      motifDeRetrogradationManquant({ ordreActuel: 10, ordreDemande: 100, motif: null }),
    ).toBe(true);
    expect(
      motifDeRetrogradationManquant({ ordreActuel: 10, ordreDemande: 100, motif: '  ' }),
    ).toBe(true);
  });

  it('n’exige RIEN pour une montée : elle se justifie d’elle-même', () => {
    expect(
      motifDeRetrogradationManquant({ ordreActuel: 100, ordreDemande: 10, motif: null }),
    ).toBe(false);
  });

  it('accepte une descente motivée', () => {
    expect(
      motifDeRetrogradationManquant({
        ordreActuel: 10,
        ordreDemande: 100,
        motif: 'Sanction disciplinaire',
      }),
    ).toBe(false);
  });
});

describe('correctionDeGradePossible', () => {
  const MAINTENANT = new Date('2026-08-21T12:00:00Z');
  const ilYA = (j: number) =>
    new Date(MAINTENANT.getTime() - j * 86_400_000).toISOString();

  it('accepte une correction dans le délai', () => {
    expect(correctionDeGradePossible(ilYA(0), MAINTENANT)).toBe(true);
    expect(correctionDeGradePossible(ilYA(JOURS_ERREUR_GRADE), MAINTENANT)).toBe(true);
  });

  /**
   * LA FENETRE EMPECHE LE CONTOURNEMENT : sans elle, « erreur de saisie »
   * deviendrait la porte par laquelle on retrograde quelqu'un sans rien ecrire.
   */
  it('EF-CRO-12 — REFUSE au-delà du délai : ce n’est plus une correction', () => {
    expect(correctionDeGradePossible(ilYA(JOURS_ERREUR_GRADE + 1), MAINTENANT)).toBe(false);
    expect(correctionDeGradePossible(ilYA(400), MAINTENANT)).toBe(false);
  });

  it('refuse sur une date illisible ou future', () => {
    expect(correctionDeGradePossible('', MAINTENANT)).toBe(false);
    expect(correctionDeGradePossible(ilYA(-2), MAINTENANT)).toBe(false);
  });
});
