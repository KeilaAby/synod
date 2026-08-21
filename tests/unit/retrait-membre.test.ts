import { describe, expect, it } from 'vitest';

import {
  JOURS_ERREUR_ASSIGNATION,
  retraitPourErreurPossible,
  retraitRecevable,
} from '@/lib/domain/bureau';

/**
 * EF-BUR-08 — retirer un titulaire : une ERREUR, ou une DECISION.
 *
 * CE QUI SE JOUE ICI EST UN EFFACEMENT. Le cas « erreur » SUPPRIME la ligne :
 * rien n'entre dans l'historique du croyant, parce qu'il ne s'est rien passe
 * dans sa vie — on a tape le mauvais nom. Le cas « decision » CLOT le mandat
 * avec son motif. Les deux ne laissent pas la meme trace, donc ils ne se
 * devinent pas.
 */

/** Le 21 aout 2026 a midi, pour que les calculs de jours soient lisibles. */
const MAINTENANT = new Date('2026-08-21T12:00:00Z');

/** Une date d'enregistrement, `n` jours avant `MAINTENANT`. */
function ilYA(jours: number): string {
  return new Date(MAINTENANT.getTime() - jours * 86_400_000).toISOString();
}

describe('retraitPourErreurPossible', () => {
  it('accepte une désignation enregistrée aujourd’hui', () => {
    expect(retraitPourErreurPossible(ilYA(0), MAINTENANT)).toBe(true);
  });

  /**
   * LA BORNE EST INCLUSE. Un mandat saisi le matin et corrige le soir du
   * quinzieme jour reste une faute de frappe rattrapable.
   */
  it(`EF-BUR-08 — accepte encore au ${JOURS_ERREUR_ASSIGNATION}ᵉ jour`, () => {
    expect(retraitPourErreurPossible(ilYA(JOURS_ERREUR_ASSIGNATION), MAINTENANT)).toBe(
      true,
    );
  });

  /**
   * PASSE LE DELAI, CE N'EST PLUS UNE CORRECTION DE SAISIE. Laisser la porte
   * ouverte permettrait d'effacer, six mois plus tard, un mandat qui a
   * reellement eu lieu.
   */
  it('REFUSE au-delà du délai', () => {
    expect(
      retraitPourErreurPossible(ilYA(JOURS_ERREUR_ASSIGNATION + 1), MAINTENANT),
    ).toBe(false);
    expect(retraitPourErreurPossible(ilYA(200), MAINTENANT)).toBe(false);
  });

  /**
   * DANS LE DOUTE, C'EST UNE DECISION. Un refus se corrige ; une ligne effacee
   * ne revient pas.
   */
  it('refuse sur une date illisible ou absente', () => {
    expect(retraitPourErreurPossible('', MAINTENANT)).toBe(false);
    expect(retraitPourErreurPossible('pas-une-date', MAINTENANT)).toBe(false);
  });

  it('refuse une date d’enregistrement dans le futur', () => {
    expect(retraitPourErreurPossible(ilYA(-3), MAINTENANT)).toBe(false);
  });
});

describe('retraitRecevable', () => {
  it('accepte une erreur dans le délai, sans motif', () => {
    expect(retraitRecevable('ERREUR', null, ilYA(2), MAINTENANT)).toEqual({ ok: true });
  });

  /**
   * `ERREUR` hors delai est REFUSE, et pas silencieusement converti en
   * decision : les deux gestes n'ont pas le meme resultat, et deviner a la
   * place de l'utilisateur ferait perdre une ligne d'historique qu'il croyait
   * garder — ou l'inverse.
   */
  it('EF-BUR-08 — refuse une erreur hors délai, et le DIT', () => {
    const r = retraitRecevable('ERREUR', null, ilYA(40), MAINTENANT);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.raison).toContain(String(JOURS_ERREUR_ASSIGNATION));
      expect(r.raison).toContain('motif');
    }
  });

  it('exige un motif pour une décision', () => {
    expect(retraitRecevable('DECISION', null, ilYA(2), MAINTENANT).ok).toBe(false);
    expect(retraitRecevable('DECISION', '  ', ilYA(2), MAINTENANT).ok).toBe(false);
    expect(retraitRecevable('DECISION', 'ab', ilYA(2), MAINTENANT).ok).toBe(false);
  });

  it('accepte une décision motivée, quel que soit l’âge du mandat', () => {
    expect(retraitRecevable('DECISION', 'Décès', ilYA(2), MAINTENANT)).toEqual({
      ok: true,
    });
    expect(retraitRecevable('DECISION', 'Démission', ilYA(900), MAINTENANT)).toEqual({
      ok: true,
    });
  });
});
