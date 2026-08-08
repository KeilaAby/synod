import { describe, expect, it } from 'vitest';

import {
  ALL_PERMISSIONS,
  NON_DELEGABLES,
  PERMISSIONS,
  ROLE_TEMPLATES,
  type SessionUtilisateur,
  detient,
  estDelegable,
  peut,
  peutDeleguer,
  permissionsDeleguables,
  permissionsDuGroupe,
  porteeEffective,
} from '@/lib/domain/permissions';

/**
 * CA-02 / CA-04 — regles d'habilitation et de delegation.
 * Ces tests doublent ceux du trigger SQL `fn_check_delegation` : le SQL protege
 * contre les appels directs, ce module produit les messages a l'utilisateur.
 */

// Arborescence de reference :
//   siege
//     └── regional
//           └── districtA          <- perimetre de l'admin
//                 ├── paroisse1
//                 │     └── eglise1
//                 └── paroisse2
//           └── districtB          <- hors perimetre
const P = {
  siege: 'n1',
  regional: 'n1.n2',
  districtA: 'n1.n2.n3',
  paroisse1: 'n1.n2.n3.n4',
  eglise1: 'n1.n2.n3.n4.n5',
  paroisse2: 'n1.n2.n3.n6',
  districtB: 'n1.n2.n7',
} as const;

function session(over: Partial<SessionUtilisateur> = {}): SessionUtilisateur {
  return {
    profileId: 'p-1',
    role: 'ENTITE_ADMIN',
    entityId: 'e-districtA',
    scopePath: P.districtA,
    permissions: [],
    ...over,
  };
}

describe('Catalogue des habilitations', () => {
  it('range chaque droit dans une categorie connue', () => {
    for (const cle of ALL_PERMISSIONS) {
      expect(PERMISSIONS[cle].group).toBeTruthy();
      expect(PERMISSIONS[cle].label.length).toBeGreaterThan(0);
    }
  });

  it('couvre chaque droit par exactement une categorie', () => {
    const groupes = ['Structure', 'Croyants', 'Bureaux', 'Finances', 'Rapports', 'Pilotage', 'Administration'] as const;
    const total = groupes.reduce((n, g) => n + permissionsDuGroupe(g).length, 0);
    expect(total).toBe(ALL_PERMISSIONS.length);
  });

  it('accorde au SuperAdmin la totalite des droits', () => {
    expect(ROLE_TEMPLATES.SUPERADMIN).toHaveLength(ALL_PERMISSIONS.length);
  });

  it('n accorde au Lecteur aucun droit d ecriture', () => {
    const ecritures = ROLE_TEMPLATES.LECTEUR.filter((p) =>
      /\.(create|update|delete|manage|validate|transfer|approve|submit|delegate|publish)$/.test(p),
    );
    expect(ecritures).toEqual([]);
  });

  it('ne place aucun droit non delegable dans un gabarit d entite', () => {
    for (const role of ['ENTITE_ADMIN', 'ENTITE_OPERATEUR', 'LECTEUR'] as const) {
      const interdits = ROLE_TEMPLATES[role].filter((p) => NON_DELEGABLES.includes(p));
      expect(interdits, `gabarit ${role}`).toEqual([]);
    }
  });
});

describe('RG-20 / RG-25 — droit detenu, portee couvrante, entite dans le perimetre', () => {
  it('autorise une action dans le perimetre quand la portee est totale', () => {
    const s = session({ permissions: [{ permission: 'croyant.create', scopePath: null }] });
    expect(peut(s, 'croyant.create', P.eglise1)).toBe(true);
  });

  it('refuse une action hors du perimetre, meme droit detenu', () => {
    const s = session({ permissions: [{ permission: 'croyant.create', scopePath: null }] });
    expect(peut(s, 'croyant.create', P.districtB)).toBe(false);
  });

  it('refuse une action dont le droit n est pas detenu', () => {
    const s = session({ permissions: [{ permission: 'croyant.read', scopePath: null }] });
    expect(peut(s, 'croyant.create', P.eglise1)).toBe(false);
  });

  it('RG-25 : une portee restreinte ne couvre que sa branche', () => {
    const s = session({
      permissions: [{ permission: 'finance.create', scopePath: P.paroisse1 }],
    });

    expect(peut(s, 'finance.create', P.paroisse1)).toBe(true);
    expect(peut(s, 'finance.create', P.eglise1)).toBe(true); // descendant de la portee
    expect(peut(s, 'finance.create', P.paroisse2)).toBe(false); // autre branche
    expect(peut(s, 'finance.create', P.districtA)).toBe(false); // au-dessus de la portee
  });

  it('distingue la DETENTION d un droit de son exercice sur une entite', () => {
    const s = session({
      permissions: [{ permission: 'finance.create', scopePath: P.paroisse1 }],
    });

    // L'entree de menu s'affiche...
    expect(detient(s, 'finance.create')).toBe(true);
    // ...mais l'action est refusee sur une autre branche.
    expect(peut(s, 'finance.create', P.paroisse2)).toBe(false);
  });

  it('accorde tout au SuperAdmin, sur l ensemble de la hierarchie', () => {
    const s = session({ role: 'SUPERADMIN', scopePath: P.siege, permissions: [] });
    expect(peut(s, 'settings.manage', P.districtB)).toBe(true);
    expect(detient(s, 'finance.delegate')).toBe(true);
  });
});

describe('Portee effective — borne de ce qui peut etre delegue', () => {
  it('retourne le perimetre du compte quand la portee est totale', () => {
    const s = session({ permissions: [{ permission: 'finance.read', scopePath: null }] });
    expect(porteeEffective(s, 'finance.read')).toBe(P.districtA);
  });

  it('retient la portee la plus LARGE quand plusieurs octrois coexistent', () => {
    const s = session({
      permissions: [
        { permission: 'finance.read', scopePath: P.eglise1 },
        { permission: 'finance.read', scopePath: P.paroisse1 },
      ],
    });
    expect(porteeEffective(s, 'finance.read')).toBe(P.paroisse1);
  });

  it('retourne null quand le droit n est pas detenu', () => {
    expect(porteeEffective(session(), 'finance.read')).toBeNull();
  });
});

describe('RG-24 — delegation : on ne delegue que ce que l on detient', () => {
  const delegant = session({
    permissions: [
      { permission: 'permission.delegate', scopePath: null },
      { permission: 'finance.create', scopePath: P.paroisse1 },
      { permission: 'croyant.read', scopePath: null },
    ],
  });

  it('accepte un octroi conforme dans le perimetre', () => {
    const r = peutDeleguer(
      delegant,
      { cheminEntite: P.paroisse1 },
      { permission: 'croyant.read', cheminPortee: null },
    );
    expect(r.ok).toBe(true);
  });

  it('refuse un droit que le delegant ne detient pas', () => {
    const r = peutDeleguer(
      delegant,
      { cheminEntite: P.paroisse1 },
      { permission: 'finance.validate', cheminPortee: null },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('ne detenez pas');
  });

  it('refuse un compte cible hors du perimetre du delegant', () => {
    const r = peutDeleguer(
      delegant,
      { cheminEntite: P.districtB },
      { permission: 'croyant.read', cheminPortee: null },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('perimetre');
  });

  it('refuse une portee plus large que celle du delegant', () => {
    // Le delegant ne detient finance.create que sur paroisse1 :
    // il ne peut pas l'accorder sur tout le district.
    const r = peutDeleguer(
      delegant,
      { cheminEntite: P.districtA },
      { permission: 'finance.create', cheminPortee: P.districtA },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('depasse');
  });

  it('accepte une portee incluse dans celle du delegant', () => {
    const r = peutDeleguer(
      delegant,
      { cheminEntite: P.paroisse1 },
      { permission: 'finance.create', cheminPortee: P.eglise1 },
    );
    expect(r.ok).toBe(true);
  });

  it('refuse tout droit non delegable, meme detenu', () => {
    const siege = session({
      role: 'ENTITE_ADMIN',
      permissions: [
        { permission: 'permission.delegate', scopePath: null },
        { permission: 'settings.manage', scopePath: null },
      ],
    });

    const r = peutDeleguer(
      siege,
      { cheminEntite: P.paroisse1 },
      { permission: 'settings.manage', cheminPortee: null },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Siege');
  });

  it('refuse un delegant depourvu du droit de deleguer', () => {
    const simple = session({
      permissions: [{ permission: 'croyant.read', scopePath: null }],
    });

    const r = peutDeleguer(
      simple,
      { cheminEntite: P.paroisse1 },
      { permission: 'croyant.read', cheminPortee: null },
    );
    expect(r.ok).toBe(false);
  });

  it('laisse le SuperAdmin accorder sans restriction', () => {
    const sa = session({ role: 'SUPERADMIN', scopePath: P.siege });
    const r = peutDeleguer(
      sa,
      { cheminEntite: P.districtB },
      { permission: 'settings.manage', cheminPortee: null },
    );
    expect(r.ok).toBe(true);
  });

  it('marque comme non delegables exactement les droits reserves au Siege', () => {
    // Liste FIGEE volontairement : un droit qui y entre ou qui en sort change
    // ce qu'une entite peut accorder a ses propres comptes. Ce test n'est pas
    // une redite du code, c'est le point ou une telle decision doit se voir.
    expect([...NON_DELEGABLES].sort()).toEqual([
      // Effacer l'histoire d'un bureau : les fonctions occupees disparaissent
      // des fiches des croyants concernes (EF-BUR-08).
      'bureau.delete',
      'entity.delete',
      'finance.delegate',
      'referentiel.manage',
      'settings.manage',
    ]);
    expect(estDelegable('croyant.create')).toBe(true);
    expect(estDelegable('settings.manage')).toBe(false);
    // `bureau.manage` reste delegable : gerer le present n'est pas reecrire
    // le passe.
    expect(estDelegable('bureau.manage')).toBe(true);
    expect(estDelegable('bureau.delete')).toBe(false);
  });
});

describe('Liste des droits proposables dans la matrice d habilitations', () => {
  it('ne propose que les droits detenus et delegables', () => {
    const delegant = session({
      permissions: [
        { permission: 'permission.delegate', scopePath: null },
        { permission: 'croyant.read', scopePath: null },
        { permission: 'croyant.create', scopePath: null },
      ],
    });

    const proposables = permissionsDeleguables(delegant);
    expect(proposables).toContain('croyant.read');
    expect(proposables).toContain('croyant.create');
    expect(proposables).not.toContain('finance.validate');
    expect(proposables).not.toContain('settings.manage');
  });

  it('ne propose rien a un compte sans droit de delegation', () => {
    expect(permissionsDeleguables(session())).toEqual([]);
  });

  it('propose tout au SuperAdmin', () => {
    const sa = session({ role: 'SUPERADMIN', scopePath: P.siege });
    expect(permissionsDeleguables(sa)).toHaveLength(ALL_PERMISSIONS.length);
  });
});
