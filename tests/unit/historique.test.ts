import { describe, expect, it } from 'vitest';

import {
  type CroyantHistorique,
  type TransfertHistorique,
  construireHistorique,
} from '@/lib/domain/historique';

/**
 * EF-CRO-06, EF-TRF-08 — frise chronologique d'un croyant.
 *
 * Ces tests existent parce que la section « Historique » de la fiche est restee
 * un texte d'attente apres la livraison des transferts : le module etait ecrit,
 * l'ecran ne l'appelait pas. Ce qui n'est pas verifie n'est pas branche.
 */

const croyant: CroyantHistorique = {
  created_at: '2026-01-15T09:00:00Z',
  date_bapteme: '2026-03-20',
  eglise: { nom: 'IAVOAMBONY' },
};

const gabarit = (p: Partial<TransfertHistorique>): TransfertHistorique => ({
  id: 't1',
  statut: 'EFFECTUE',
  motif: 'Demenagement',
  motif_refus: null,
  date_demande: '2026-06-01T10:00:00Z',
  date_decision: '2026-06-02T10:00:00Z',
  date_effet: '2026-06-03',
  origine: { nom: 'IAVOAMBONY' },
  destination: { nom: 'AMBOHITRIMANJAKA' },
  celluleDestination: null,
  demandeur: { nom_complet: 'Christian' },
  decideur: { nom_complet: 'Le Siege' },
  ...p,
});

describe('EF-CRO-06 — composition de la frise', () => {
  it('porte toujours la creation de la fiche', () => {
    const frise = construireHistorique({ ...croyant, date_bapteme: null }, []);
    expect(frise).toHaveLength(1);
    expect(frise[0]).toMatchObject({ type: 'CREATION', enAttente: false });
  });

  it("n'invente pas de bapteme quand la date est absente", () => {
    // La date de bapteme est facultative depuis le 6 aout 2026 : un evenement
    // sans date se placerait n'importe ou sur la frise.
    const frise = construireHistorique({ ...croyant, date_bapteme: null }, []);
    expect(frise.some((e) => e.type === 'BAPTEME')).toBe(false);
  });

  it('classe du plus recent au plus ancien', () => {
    const frise = construireHistorique(croyant, [gabarit({})]);
    expect(frise.map((e) => e.type)).toEqual(['TRANSFERT', 'BAPTEME', 'CREATION']);
  });
});

describe('EF-TRF-08 — un transfert se lit a la date ou il a produit son effet', () => {
  it('situe un transfert EFFECTUE a sa date d effet', () => {
    // Ce n'est pas le jour de la demande qui compte, c'est celui ou le croyant
    // a effectivement change d'eglise.
    const [transfert] = construireHistorique(croyant, [gabarit({})]);
    expect(transfert!.date).toBe('2026-06-03');
    expect(transfert!.titre).toContain('IAVOAMBONY');
    expect(transfert!.titre).toContain('AMBOHITRIMANJAKA');
  });

  it('situe un refus a la date de decision, et montre son motif', () => {
    const [transfert] = construireHistorique(croyant, [
      gabarit({
        statut: 'REFUSE',
        date_effet: null,
        motif_refus: 'Effectif deja au complet',
      }),
    ]);

    expect(transfert!.date).toBe('2026-06-02T10:00:00Z');
    expect(transfert!.titre).toContain('refuse');
    // Le motif du REFUS prime sur celui de la demande : c'est lui qui explique
    // l'issue, et c'est ce que le demandeur a besoin de lire.
    expect(transfert!.note).toBe('Effectif deja au complet');
    expect(transfert!.enAttente).toBe(false);
  });

  it('situe une demande en attente a sa date de demande, et la signale', () => {
    const [transfert] = construireHistorique(croyant, [
      gabarit({ statut: 'DEMANDE', date_decision: null, date_effet: null }),
    ]);

    expect(transfert!.date).toBe('2026-06-01T10:00:00Z');
    // RG-11 — rien n'est encore arrive au croyant : la frise ne doit pas le
    // laisser croire.
    expect(transfert!.enAttente).toBe(true);
    expect(transfert!.detail).toContain('Christian');
  });

  it('EF-TRF-06 — porte la chaine complete : qui a demande, qui a decide, quand', () => {
    const [transfert] = construireHistorique(croyant, [gabarit({})]);

    // L'evenement est situe au 3 juin (date d'effet) ; le recit doit donc
    // porter les DEUX autres dates, sans quoi l'ecart entre demande et
    // application resterait invisible.
    expect(transfert!.detail).toContain('Christian');
    expect(transfert!.detail).toContain('Le Siege');
    expect(transfert!.detail).toContain('1 juin 2026');
    expect(transfert!.detail).toContain('2 juin 2026');
  });

  it('nomme un compte supprime plutot que de laisser un blanc', () => {
    // `on delete set null` sur le demandeur : un blanc ferait croire a une
    // donnee manquante plutot qu'a un compte disparu.
    const [transfert] = construireHistorique(croyant, [
      gabarit({ demandeur: null, decideur: null }),
    ]);
    expect(transfert!.detail).toContain('supprime');
  });

  it('marque un transfert approuve comme non encore applique', () => {
    const [transfert] = construireHistorique(croyant, [
      gabarit({ statut: 'APPROUVE', date_effet: null }),
    ]);
    expect(transfert!.enAttente).toBe(true);
  });

  it('reste lisible quand une entite a disparu', () => {
    // `on delete set null` sur l'origine : une entite supprimee ne doit pas
    // produire « Transfere de undefined ».
    const [transfert] = construireHistorique(croyant, [gabarit({ origine: null })]);
    expect(transfert!.titre).not.toContain('undefined');
    expect(transfert!.titre).toContain('AMBOHITRIMANJAKA');
  });
});
