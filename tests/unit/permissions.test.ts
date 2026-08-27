import { describe, expect, it } from 'vitest';

import {
  ALL_PERMISSIONS,
  NON_DELEGABLES,
  PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_TEMPLATES,
  type SessionUtilisateur,
  detient,
  estDelegable,
  peut,
  peutDeleguer,
  permissionsDeleguables,
  permissionsDuGroupe,
  porteeDe,
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
    const groupes = PERMISSION_GROUPS;
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
    /**
     * `croyant.create` est un droit a portee DESCENDANTE : accorde sur une
     * paroisse, il vaut pour ses eglises. Ce test portait sur
     * `finance.create` jusqu'au 19 aout 2026 — ce droit est devenu PROPRE, et
     * l'exemple ne disait plus ce qu'il voulait dire.
     */
    const s = session({
      permissions: [{ permission: 'croyant.create', scopePath: P.paroisse1 }],
    });

    expect(peut(s, 'croyant.create', P.paroisse1)).toBe(true);
    expect(peut(s, 'croyant.create', P.eglise1)).toBe(true); // descendant de la portee
    expect(peut(s, 'croyant.create', P.paroisse2)).toBe(false); // autre branche
    expect(peut(s, 'croyant.create', P.districtA)).toBe(false); // au-dessus de la portee
  });

  it('RG-25 : un droit PROPRE ne couvre QUE l entite designee', () => {
    /**
     * La contrepartie du test precedent, et le coeur du changement : accorde
     * sur une paroisse, `finance.create` ne descend pas a ses eglises. Chaque
     * bureau gere ses propres finances (doctrine du lot 4).
     */
    const s = session({
      permissions: [{ permission: 'finance.create', scopePath: P.paroisse1 }],
    });

    expect(peut(s, 'finance.create', P.paroisse1)).toBe(true);
    expect(peut(s, 'finance.create', P.eglise1)).toBe(false); // ne descend PLUS
    expect(peut(s, 'finance.create', P.paroisse2)).toBe(false);
    expect(peut(s, 'finance.create', P.districtA)).toBe(false);
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
      /*
        `finance.delegate` EST SORTI DE CETTE LISTE le 19 aout 2026.

        Non delegable, seul le Siege pouvait saisir pour une entite privee
        d'acces — un district dont trois eglises n'ont pas de connexion
        devait lui faire remonter chaque recette.

        Ce qui le borne desormais : la portee de son octroi (RG-25) et
        `sans_acces_application` sur l'entite visee, verifie a la saisie.
        Deux conditions cumulatives valent mieux qu une interdiction qui
        empechait aussi le cas legitime.
      */
      /**
       * EF-FIN-18 — se dispenser de la separation saisie/validation.
       *
       * Delegable, un compte qui le detient l'accorderait a celui qu'il
       * controle : la separation ne tiendrait plus qu'a la bonne volonte de
       * celui-la meme qu'elle surveille.
       */
      'finance.validate_own',
      /**
       * EF-FIN-26 — rouvrir une periode cloturee. Si celui qui clot pouvait
       * s'accorder de quoi rouvrir, la cloture ne serait plus qu'une
       * convention entre soi : elle n'arreterait rien.
       */
      'finance.periode.reopen',
      'referentiel.manage',
      'settings.manage',
      /**
       * EF-ADM-10 — l'effacement definitif, entre dans la liste le 19 aout 2026.
       *
       * C'est la seule operation de l'application qui ne se rattrape par rien :
       * ni la corbeille, ni le journal, ni une restauration ne ramenent ce
       * qu'elle a retire. Un droit sans retour se decide au Siege, une fois, et
       * ne se repand pas de proche en proche.
       */
      'trash.purge',
    ].sort());
    expect(estDelegable('croyant.create')).toBe(true);
    expect(estDelegable('settings.manage')).toBe(false);
    // Restaurer se delegue, purger non : ce ne sont pas deux degres du meme
    // droit mais deux actes opposes, et un seul est sans retour.
    expect(estDelegable('trash.restore')).toBe(true);
    expect(estDelegable('trash.purge')).toBe(false);
    // `bureau.manage` reste delegable : gerer le present n'est pas reecrire
    // le passe.
    expect(estDelegable('bureau.manage')).toBe(true);
    expect(estDelegable('bureau.delete')).toBe(false);
  });

  it('tient la MEME liste que la base — RG-24', async () => {
    /**
     * Le commentaire du domaine affirmait cet alignement ; rien ne le
     * verifiait, et les deux listes ont diverge : `bureau.delete` etait non
     * delegable en TypeScript et delegable en SQL. L'ecran disait donc non
     * pendant que la base disait oui — un appel direct a l'API aurait accorde
     * le droit d'effacer l'histoire d'un bureau.
     *
     * C'est le defaut le plus courant d'une regle ecrite a deux endroits :
     * elle ne diverge jamais le jour ou on l'ecrit.
     */
    const { readFile, readdir } = await import('node:fs/promises');
    const dossier = new URL('../../supabase/migrations/', import.meta.url);

    /**
     * ON LIT LA DERNIERE MIGRATION QUI DEFINIT LA FONCTION, jamais un fichier
     * nomme en dur.
     *
     * Le test pointait `0025`. Une migration ulterieure a redefini la
     * fonction : le test aurait continue de comparer le domaine a une version
     * PERIMEE, en affichant du vert. Il aurait alors garanti l'alignement sur
     * une base qui n'existe plus — pire que pas de test, parce qu'il rassure.
     */
    const fichiers = (await readdir(dossier)).filter((f) => f.endsWith('.sql')).sort();

    let derniere: string | null = null;
    for (const fichier of fichiers) {
      const contenu = await readFile(new URL(fichier, dossier), 'utf8');
      if (contenu.includes('function fn_permissions_non_delegables')) derniere = contenu;
    }

    expect(derniere, 'aucune migration ne definit fn_permissions_non_delegables').not.toBeNull();

    // Le corps du `select array[...]`, dont on extrait les chaines citees.
    const sql = derniere!;
    const tableau = sql.slice(sql.indexOf('select array['), sql.indexOf(']::text[]'));
    // Deux segments au moins, mais pas seulement : `finance.periode.reopen` en
    // porte trois, et un motif fige a deux l'aurait ignore en silence.
    const cotes = [...tableau.matchAll(/'([a-z_]+(?:\.[a-z_]+)+)'/g)].map((m) => m[1]!);

    expect(cotes.sort()).toEqual([...NON_DELEGABLES].sort());
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

describe('RG-25 — la portee est une propriete du DROIT', () => {
  /** Un district, une paroisse dessous, une eglise sous la paroisse. */
  const district = 'siege.reg.dis';
  const paroisse = 'siege.reg.dis.par';

  const rakoto: SessionUtilisateur = {
    profileId: 'rakoto',
    role: 'ENTITE_ADMIN',
    entityId: 'dis',
    scopePath: district,
    permissions: [
      // Accordes « sur tout son perimetre » : la portee de l'octroi est nulle.
      { permission: 'finance.validate', scopePath: null },
      { permission: 'finance.read', scopePath: null },
      { permission: 'entity.create', scopePath: null },
      { permission: 'croyant.create', scopePath: null },
      { permission: 'user.manage', scopePath: null },
    ],
  };

  it('declare DESCENDANTE tout droit qui ne dit rien', () => {
    /**
     * Le defaut conserve le comportement des droits qui n'ont pas ete
     * examines : un droit ajoute demain descend, comme avant. Le declarer
     * PROPRE est une decision explicite, prise une fois.
     */
    expect(porteeDe('croyant.create')).toBe('DESCENDANTE');
    expect(porteeDe('finance.read')).toBe('DESCENDANTE');
    expect(porteeDe('finance.validate')).toBe('PROPRE');
  });

  it('LE CAS RAKOTO : il valide chez lui, pas chez ses paroisses', () => {
    /**
     * Le lot 4 a pose en doctrine que chaque bureau gere SES finances et que la
     * hierarchie ne fait que les consulter. Le controle de droit ne l'avait
     * jamais suivie : une inclusion de chemin donnait tout le sous-arbre.
     */
    expect(peut(rakoto, 'finance.validate', district)).toBe(true);
    expect(peut(rakoto, 'finance.validate', paroisse)).toBe(false);
  });

  it('mais il CONSULTE les finances de toute sa descendance', () => {
    // « La hierarchie ne fait que les consulter » — la lecture, elle, descend.
    expect(peut(rakoto, 'finance.read', paroisse)).toBe(true);
  });

  it('et il structure sa descendance : entites et croyants', () => {
    /**
     * Un district structure ses paroisses. Si son administrateur ne le pouvait
     * pas, personne ne le ferait — c'est exactement ce que la portee PROPRE ne
     * doit PAS empecher.
     */
    expect(peut(rakoto, 'entity.create', paroisse)).toBe(true);
    expect(peut(rakoto, 'croyant.create', paroisse)).toBe(true);
  });

  it('n atteint pas les comptes ni les habilitations de ses descendants', () => {
    // Ouvrir des comptes et distribuer des droits dans une paroisse ne se
    // pilote pas depuis le district.
    expect(peut(rakoto, 'user.manage', district)).toBe(true);
    expect(peut(rakoto, 'user.manage', paroisse)).toBe(false);
  });

  it('respecte une portee EXPLICITE plus etroite que le perimetre', () => {
    const cible: SessionUtilisateur = {
      ...rakoto,
      permissions: [{ permission: 'finance.validate', scopePath: paroisse }],
    };

    // Accorde sur la paroisse : il y valide, et plus dans son propre district.
    expect(peut(cible, 'finance.validate', paroisse)).toBe(true);
    expect(peut(cible, 'finance.validate', district)).toBe(false);
  });

  it('ne borne rien pour le SuperAdmin', () => {
    const siege: SessionUtilisateur = {
      profileId: 's',
      role: 'SUPERADMIN',
      entityId: 'siege',
      scopePath: 'siege',
      permissions: [],
    };
    expect(peut(siege, 'finance.validate', paroisse)).toBe(true);
  });

  it('tient la MEME liste que la base — RG-25', async () => {
    /**
     * Meme raison que pour les droits non delegables : une regle ecrite a deux
     * endroits ne diverge jamais le jour ou on l'ecrit, elle diverge six mois
     * plus tard. Ici l'ecart serait invisible — l'ecran refuserait pendant que
     * la base accorderait, ou l'inverse.
     */
    const { readFile, readdir } = await import('node:fs/promises');
    const dossier = new URL('../../supabase/migrations/', import.meta.url);
    const fichiers = (await readdir(dossier)).filter((f) => f.endsWith('.sql')).sort();

    let derniere: string | null = null;
    for (const fichier of fichiers.slice().reverse()) {
      const contenu = await readFile(new URL(fichier, dossier), 'utf8');
      if (contenu.includes('function fn_permissions_portee_propre')) {
        derniere = contenu;
        break;
      }
    }

    expect(derniere, 'aucune migration ne definit fn_permissions_portee_propre').not.toBeNull();

    const sql = derniere!;
    const tableau = sql.slice(sql.indexOf('select array['), sql.indexOf(']::text[]'));
    const cotes = [...tableau.matchAll(/'([a-z_]+(?:\.[a-z_]+)+)'/g)].map((m) => m[1]!);

    const domaine = ALL_PERMISSIONS.filter((p) => porteeDe(p) === 'PROPRE');
    expect(cotes.sort()).toEqual([...domaine].sort());
  });
});
