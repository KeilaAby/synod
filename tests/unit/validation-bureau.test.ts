import { describe, expect, it } from 'vitest';

import {
  cloreMandatSchema,
  modifierBureauSchema,
  ouvrirMandatSchema,
} from '@/lib/validation/bureau';

/**
 * EF-BUR-01, EF-BUR-02 — schemas des bureaux.
 *
 * Ces tests fixent la BORNE des periodes. Elle a coute une panne le 8 aout
 * 2026 : la contrainte exigeait `date_fin > date_debut`, donc interdisait de
 * clore un bureau le jour de son ouverture — precisement le geste par lequel on
 * corrige une ouverture faite par erreur.
 */

const ENTITE = '11111111-1111-4111-8111-111111111111';
const BUREAU = '22222222-2222-4222-8222-222222222222';

describe('EF-BUR-02 — la periode se clot le jour meme, jamais avant', () => {
  it('accepte une fin egale au debut', () => {
    const r = ouvrirMandatSchema.safeParse({
      entityId: ENTITE,
      libelle: 'Bureau executif',
      dateDebut: '2026-08-08',
      dateFin: '2026-08-08',
    });
    expect(r.success).toBe(true);
  });

  it('refuse une fin anterieure au debut', () => {
    const r = ouvrirMandatSchema.safeParse({
      entityId: ENTITE,
      libelle: 'Bureau executif',
      dateDebut: '2026-08-08',
      dateFin: '2026-08-07',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path).toEqual(['dateFin']);
    }
  });

  it('laisse la fin facultative — un mandat peut rester ouvert', () => {
    const r = ouvrirMandatSchema.safeParse({
      entityId: ENTITE,
      libelle: 'Bureau executif',
      dateDebut: '2026-08-08',
      dateFin: '',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dateFin).toBeNull();
  });

  it('applique la meme borne a la modification', () => {
    const memeJour = modifierBureauSchema.safeParse({
      bureauId: BUREAU,
      libelle: 'Comite des finances',
      dateDebut: '2026-08-08',
      dateFin: '2026-08-08',
    });
    expect(memeJour.success).toBe(true);

    const inverse = modifierBureauSchema.safeParse({
      bureauId: BUREAU,
      libelle: 'Comite des finances',
      dateDebut: '2026-08-08',
      dateFin: '2026-01-01',
    });
    expect(inverse.success).toBe(false);
  });
});

describe('EF-BUR-02 — ce que la modification NE touche pas', () => {
  /**
   * Regle 19 — un champ absent du formulaire ne doit pas voyager. L'entite de
   * rattachement en est un : la changer invaliderait RG-09 pour tous les
   * titulaires, qui appartiennent au sous-arbre de l'entite d'origine.
   */
  it("ignore l'entite et le cycle de vie qu'on tenterait de lui passer", () => {
    const r = modifierBureauSchema.safeParse({
      bureauId: BUREAU,
      libelle: 'Bureau executif',
      dateDebut: '2026-08-08',
      dateFin: '',
      entityId: ENTITE,
      is_active: true,
      deleted_at: null,
    });

    expect(r.success).toBe(true);
    if (r.success) {
      expect(Object.keys(r.data).sort()).toEqual([
        'bureauId',
        'dateDebut',
        'dateFin',
        'libelle',
      ]);
    }
  });
});

describe('Regle 12 — les schemas partages sont idempotents', () => {
  it('revalide sans se contredire ce qu il a deja transforme', () => {
    const brut = {
      bureauId: BUREAU,
      libelle: '  Bureau executif  ',
      dateDebut: '2026-08-08',
      dateFin: '',
    };

    const premier = modifierBureauSchema.parse(brut);
    const second = modifierBureauSchema.parse(premier);

    expect(second).toEqual(premier);
    expect(premier.libelle).toBe('Bureau executif');
    // `z.preprocess` et non `z.coerce` : `coerce.date('')` donnerait 1970.
    expect(premier.dateFin).toBeNull();
  });

  it('accepte la date de cloture sous ses deux formes', () => {
    const chaine = cloreMandatSchema.parse({ bureauId: BUREAU, dateFin: '2026-08-08' });
    const objet = cloreMandatSchema.parse({ bureauId: BUREAU, dateFin: chaine.dateFin });
    expect(objet.dateFin.getTime()).toBe(chaine.dateFin.getTime());
  });
});
