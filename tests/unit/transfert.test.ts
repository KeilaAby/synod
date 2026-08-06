import { describe, expect, it } from 'vitest';

import type { SessionUtilisateur } from '@/lib/domain/permissions';
import {
  STATUTS_TRANSFERT,
  aModifieLeCroyant,
  ancetreCommunTransfert,
  autoApprobationPossible,
  estApprobateurCompetent,
  estEnAttente,
  niveauDeTransfert,
  transitionAutorisee,
  validerDemandeTransfert,
} from '@/lib/domain/transfert';

/**
 * CA-07 — aucun transfert n'est appliqué sans approbation, et l'approbateur
 * couvre les deux côtés du mouvement.
 *
 * Arborescence de référence :
 *   siege(n1)
 *     regional(n1.n2)
 *       districtA(n1.n2.n3)
 *         paroisse1(n1.n2.n3.n4) > eglise1(n1.n2.n3.n4.n5)
 *         paroisse2(n1.n2.n3.n6) > eglise2(n1.n2.n3.n6.n7)
 *       districtB(n1.n2.n8) > paroisse3(n1.n2.n8.n9) > eglise3(n1.n2.n8.n9.na)
 */
const P = {
  siege: 'n1',
  regional: 'n1.n2',
  districtA: 'n1.n2.n3',
  paroisse1: 'n1.n2.n3.n4',
  eglise1: 'n1.n2.n3.n4.n5',
  eglise1bis: 'n1.n2.n3.n4.n5b',
  paroisse2: 'n1.n2.n3.n6',
  eglise2: 'n1.n2.n3.n6.n7',
  districtB: 'n1.n2.n8',
  eglise3: 'n1.n2.n8.n9.na',
} as const;

function session(over: Partial<SessionUtilisateur> = {}): SessionUtilisateur {
  return {
    profileId: 'p-1',
    role: 'ENTITE_ADMIN',
    entityId: 'e-1',
    scopePath: P.districtA,
    permissions: [{ permission: 'transfer.approve', scopePath: null }],
    ...over,
  };
}

describe('RG-11 — transitions du workflow de transfert', () => {
  it('déclare cinq statuts', () => {
    expect(STATUTS_TRANSFERT).toHaveLength(5);
  });

  it('autorise les décisions depuis « demandé »', () => {
    expect(transitionAutorisee('DEMANDE', 'APPROUVE')).toBe(true);
    expect(transitionAutorisee('DEMANDE', 'REFUSE')).toBe(true);
    expect(transitionAutorisee('DEMANDE', 'ANNULE')).toBe(true);
  });

  it('interdit de sauter l’approbation', () => {
    expect(transitionAutorisee('DEMANDE', 'EFFECTUE')).toBe(false);
  });

  it('n’applique le transfert qu’après approbation', () => {
    expect(transitionAutorisee('APPROUVE', 'EFFECTUE')).toBe(true);
  });

  it('rend les états terminaux définitifs', () => {
    for (const terminal of ['REFUSE', 'ANNULE', 'EFFECTUE'] as const) {
      for (const cible of STATUTS_TRANSFERT) {
        expect(transitionAutorisee(terminal, cible), `${terminal} → ${cible}`).toBe(false);
      }
    }
  });

  it('ne considère « en attente » que l’état demandé', () => {
    expect(estEnAttente('DEMANDE')).toBe(true);
    expect(estEnAttente('APPROUVE')).toBe(false);
  });

  it('ne reconnaît une modification du croyant qu’à l’état effectué', () => {
    expect(aModifieLeCroyant('EFFECTUE')).toBe(true);
    for (const s of ['DEMANDE', 'APPROUVE', 'REFUSE', 'ANNULE'] as const) {
      expect(aModifieLeCroyant(s), s).toBe(false);
    }
  });
});

describe('EF-TRF-01 — niveau réel du transfert', () => {
  it('qualifie de CELLULE un changement au sein de la même église', () => {
    expect(niveauDeTransfert(P.eglise1, P.eglise1, true)).toBe('CELLULE');
  });

  it('qualifie d’ÉGLISE un transfert entre deux églises d’une même paroisse', () => {
    expect(niveauDeTransfert(P.eglise1, P.eglise1bis)).toBe('EGLISE');
  });

  it('qualifie de PAROISSE un transfert entre paroisses d’un même district', () => {
    expect(niveauDeTransfert(P.eglise1, P.eglise2)).toBe('PAROISSE');
  });

  it('qualifie de DISTRICT un transfert entre districts d’un même régional', () => {
    expect(niveauDeTransfert(P.eglise1, P.eglise3)).toBe('DISTRICT');
  });

  it('retombe sur ÉGLISE quand l’origine est inconnue', () => {
    expect(niveauDeTransfert(null, P.eglise1)).toBe('EGLISE');
  });
});

describe('RG-12 — compétence de l’approbateur', () => {
  it('retourne le plus petit ancêtre commun, pas la racine', () => {
    expect(ancetreCommunTransfert(P.eglise1, P.eglise2)).toBe(P.districtA);
    expect(ancetreCommunTransfert(P.eglise1, P.eglise3)).toBe(P.regional);
  });

  it('reconnaît compétent celui dont le périmètre couvre l’ancêtre commun', () => {
    const admin = session({ scopePath: P.districtA });
    expect(estApprobateurCompetent(admin, P.districtA)).toBe(true);
  });

  it('refuse celui dont le périmètre ne couvre qu’un seul côté', () => {
    // Un administrateur de districtA ne peut pas arbitrer un transfert dont
    // l'ancêtre commun est le régional : il « aspirerait » des croyants
    // d'un district voisin.
    const admin = session({ scopePath: P.districtA });
    expect(estApprobateurCompetent(admin, P.regional)).toBe(false);
  });

  it('refuse celui qui ne détient pas le droit d’approbation', () => {
    const sans = session({ permissions: [{ permission: 'croyant.read', scopePath: null }] });
    expect(estApprobateurCompetent(sans, P.districtA)).toBe(false);
  });

  it('laisse le SuperAdmin approuver partout', () => {
    const sa = session({ role: 'SUPERADMIN', scopePath: P.siege, permissions: [] });
    expect(estApprobateurCompetent(sa, P.regional)).toBe(true);
  });
});

describe('EF-TRF-05 — auto-approbation intra-périmètre', () => {
  it('accepte un transfert entièrement contenu dans le périmètre', () => {
    const admin = session({ scopePath: P.districtA });
    expect(autoApprobationPossible(admin, P.eglise1, P.eglise2, true)).toBe(true);
  });

  it('refuse dès qu’un côté sort du périmètre', () => {
    const admin = session({ scopePath: P.districtA });
    expect(autoApprobationPossible(admin, P.eglise1, P.eglise3, true)).toBe(false);
  });

  it('refuse si l’option est désactivée', () => {
    const admin = session({ scopePath: P.districtA });
    expect(autoApprobationPossible(admin, P.eglise1, P.eglise2, false)).toBe(false);
  });

  it('refuse si le demandeur n’est pas approbateur compétent', () => {
    const sans = session({
      scopePath: P.districtA,
      permissions: [{ permission: 'croyant.transfer', scopePath: null }],
    });
    expect(autoApprobationPossible(sans, P.eglise1, P.eglise2, true)).toBe(false);
  });
});

describe('Recevabilité d’une demande', () => {
  const origine = { egliseId: 'e1', cheminEglise: P.eglise1, celluleId: 'c1' };

  it('refuse une destination identique au rattachement actuel', () => {
    const r = validerDemandeTransfert(origine, { ...origine }, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('identique');
  });

  it('accepte un simple changement de cellule dans la même église', () => {
    const r = validerDemandeTransfert(
      origine,
      { egliseId: 'e1', cheminEglise: P.eglise1, celluleId: 'c2' },
      `${P.eglise1}.nc2`,
    );
    expect(r.ok).toBe(true);
  });

  it('RG-05 : refuse une cellule étrangère à l’église de destination', () => {
    const r = validerDemandeTransfert(
      origine,
      { egliseId: 'e2', cheminEglise: P.eglise2, celluleId: 'c9' },
      `${P.eglise1}.nc9`, // cellule de l'ancienne église
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('cellule');
  });
});
