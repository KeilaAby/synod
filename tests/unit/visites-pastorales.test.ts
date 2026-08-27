import { describe, expect, it } from 'vitest';
import {
  CreerVisiteSchema,
  ModifierVisiteSchema,
  ReprogrammerVisiteSchema,
  peutDeplacerVisite,
  formaterRefOrdreMission,
} from '@/lib/domain/visites-pastorales';
import {
  PERMISSIONS,
  peut,
  porteeDe,
  type SessionUtilisateur,
} from '@/lib/domain/permissions';

describe('Domaine Visites Pastorales — Validation Zod & Règles Métier', () => {
  const dummyUuid1 = '11111111-1111-4111-a111-111111111111';
  const dummyUuid2 = '22222222-2222-4222-a222-222222222222';
  const dummyCroyantId = '33333333-3333-4333-a333-333333333333';

  it('valide la création d’une visite pastorale avec saisie libre du culte et des rôles', () => {
    const input = {
      entite_initiatrice_id: dummyUuid1,
      entite_cible_id: dummyUuid2,
      date_visite: '2026-08-30',
      heure_visite: '09:00',
      type_culte: 'Culte de Sainte-Cène & Consécration Spéciale',
      theme_message: '« Fortifiez-vous dans le Seigneur »',
      instructions: 'Inspection des registres et sainte communion',
      delegues: [
        {
          croyant_id: dummyCroyantId,
          role_mission: 'Prédicateur Principal & Célébrant',
          ordre: 1,
        },
      ],
    };

    const res = CreerVisiteSchema.safeParse(input);
    expect(res.success).toBe(true);
  });

  it('refuse une planification sans aucun délégué désigné', () => {
    const input = {
      entite_initiatrice_id: dummyUuid1,
      entite_cible_id: dummyUuid2,
      date_visite: '2026-08-30',
      type_culte: 'Culte du matin',
      delegues: [],
    };

    const res = CreerVisiteSchema.safeParse(input);
    expect(res.success).toBe(false);
  });

  it('refuse une date au format non ISO (AAAA-MM-JJ)', () => {
    const input = {
      entite_initiatrice_id: dummyUuid1,
      entite_cible_id: dummyUuid2,
      date_visite: '30/08/2026',
      type_culte: 'Culte du matin',
      delegues: [{ croyant_id: dummyCroyantId, role_mission: 'Délégué', ordre: 1 }],
    };

    const res = CreerVisiteSchema.safeParse(input);
    expect(res.success).toBe(false);
  });

  it('valide la modification d’une visite pastorale avec son identifiant', () => {
    const input = {
      id: dummyUuid1,
      entite_initiatrice_id: dummyUuid1,
      entite_cible_id: dummyUuid2,
      date_visite: '2026-09-13',
      heure_visite: '10:00',
      type_culte: 'Culte de Réveil',
      delegues: [
        {
          croyant_id: dummyCroyantId,
          role_mission: 'Évangéliste',
          ordre: 1,
        },
      ],
    };

    const res = ModifierVisiteSchema.safeParse(input);
    expect(res.success).toBe(true);
  });

  it('valide le déplacement de date (Drag & Drop) via ReprogrammerVisiteSchema', () => {
    const input = {
      id: dummyUuid1,
      date_visite: '2026-09-06',
    };

    const res = ReprogrammerVisiteSchema.safeParse(input);
    expect(res.success).toBe(true);
  });

  it('autorise le déplacement seulement pour PLANIFIE et CONFIRME', () => {
    expect(peutDeplacerVisite('PLANIFIE')).toBe(true);
    expect(peutDeplacerVisite('CONFIRME')).toBe(true);
    expect(peutDeplacerVisite('EFFECTUE')).toBe(false);
    expect(peutDeplacerVisite('ANNULE')).toBe(false);
  });

  it('génère un numéro de référence officiel formaté OM-SYNOD-AAAA-MM/XXX', () => {
    const ref = formaterRefOrdreMission('2026-08-30', 42);
    expect(ref).toBe('OM-SYNOD-2026-08/042');
  });
});

describe('Habilitations Fines — Module Visites Pastorales', () => {
  it('déclare les permissions de visites pastorales', () => {
    expect(PERMISSIONS['visite.read']).toBeDefined();
    expect(PERMISSIONS['visite.create']).toBeDefined();
    expect(PERMISSIONS['visite.update']).toBeDefined();
    expect(PERMISSIONS['visite.validate']).toBeDefined();
    expect(PERMISSIONS['visite.print']).toBeDefined();
    expect(PERMISSIONS['visite.delete']).toBeDefined();
  });

  it('attribue une portée PROPRE aux droits de création, modification, validation et annulation', () => {
    expect(porteeDe('visite.create')).toBe('PROPRE');
    expect(porteeDe('visite.update')).toBe('PROPRE');
    expect(porteeDe('visite.validate')).toBe('PROPRE');
    expect(porteeDe('visite.delete')).toBe('PROPRE');
    expect(porteeDe('visite.read')).toBe('DESCENDANTE');
    expect(porteeDe('visite.print')).toBe('DESCENDANTE');
  });

  it('autorise une entité à planifier une visite pour elle-même et refuse pour une autre entité sans délégation', () => {
    const entiteA = 'siege.reg.disA';
    const entiteB = 'siege.reg.disB';

    const sessionUser: SessionUtilisateur = {
      profileId: 'user-1',
      role: 'ENTITE_ADMIN',
      entityId: 'disA',
      scopePath: entiteA,
      permissions: [
        { permission: 'visite.read', scopePath: null },
        { permission: 'visite.create', scopePath: null },
      ],
    };

    // Autorisé sur son entité propre
    expect(peut(sessionUser, 'visite.create', entiteA)).toBe(true);
    // Refusé sur une entité hors de son périmètre
    expect(peut(sessionUser, 'visite.create', entiteB)).toBe(false);
  });
});
