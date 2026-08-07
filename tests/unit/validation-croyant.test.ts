import { describe, expect, it } from 'vitest';

import { croyantSchema, modifierCroyantSchema } from '@/lib/validation/croyant';

/**
 * EF-CRO-01 — schéma de saisie du croyant.
 *
 * Ces tests existent parce qu'une date de baptême laissée vide déclenchait
 * « La date de baptême ne peut pas précéder la date de naissance » : le champ
 * facultatif était traité comme une date invalide plutôt que comme une absence.
 */

const uuid = () => crypto.randomUUID();

const base = {
  nom: 'KOFFI',
  prenom: 'Amos',
  sexe: 'M' as const,
  dateNaissance: '1990-03-12',
  adresse: 'Cotonou, quartier Zogbo',
  egliseId: uuid(),
  gradeId: uuid(),
  nationaliteId: uuid(),
};

describe('Date de baptême facultative', () => {
  it('accepte une chaîne vide et la normalise en absence', () => {
    const r = croyantSchema.safeParse({ ...base, dateBapteme: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dateBapteme).toBeNull();
  });

  it('accepte un champ absent', () => {
    const r = croyantSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dateBapteme).toBeNull();
  });

  it('accepte une date valide postérieure à la naissance', () => {
    const r = croyantSchema.safeParse({ ...base, dateBapteme: '2010-06-01' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dateBapteme).toBeInstanceOf(Date);
  });

  it('refuse toujours une date antérieure à la naissance', () => {
    const r = croyantSchema.safeParse({ ...base, dateBapteme: '1980-06-01' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('dateBapteme'))).toBe(true);
    }
  });

  it('ne signale AUCUNE erreur sur dateBapteme quand le champ est vide', () => {
    // Le symptôme exact : le message de cohérence des dates apparaissait sur
    // un champ non renseigné.
    const r = croyantSchema.safeParse({ ...base, dateBapteme: '' });
    if (!r.success) {
      const surBapteme = r.error.issues.filter((i) => i.path.includes('dateBapteme'));
      expect(surBapteme, JSON.stringify(surBapteme)).toEqual([]);
    }
    expect(r.success).toBe(true);
  });

  it('applique la même règle au schéma de modification', () => {
    const r = modifierCroyantSchema.safeParse({
      id: uuid(),
      nom: 'KOFFI',
      prenom: 'Amos',
      sexe: 'M',
      dateNaissance: '1990-03-12',
      dateBapteme: '',
      adresse: 'Cotonou',
      gradeId: uuid(),
      nationaliteId: uuid(),
      statut: 'ACTIF',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dateBapteme).toBeNull();
  });
});

/**
 * Le schéma est partagé client/serveur : le client valide la saisie, envoie le
 * RÉSULTAT à la Server Action, qui revalide avec le même schéma. Parser sa
 * propre sortie doit donc redonner la même valeur.
 *
 * Sans cette propriété, `null` — produit par le premier passage — était recoercé
 * par `z.coerce.date()` en 1er janvier 1970, et le contrôle de cohérence des
 * dates échouait sur un champ pourtant vide.
 */
describe('Idempotence du schéma — aller-retour client vers serveur', () => {
  it('reparse sa propre sortie sans erreur, champs facultatifs vides', () => {
    const premier = croyantSchema.safeParse({
      ...base,
      dateBapteme: '',
      email: '',
      telephone: '',
    });
    expect(premier.success).toBe(true);
    if (!premier.success) return;

    // Exactement ce que fait la Server Action avec la charge reçue du client.
    const second = croyantSchema.safeParse(premier.data);
    expect(
      second.success,
      second.success ? '' : JSON.stringify(second.error.issues),
    ).toBe(true);
    if (second.success) {
      expect(second.data.dateBapteme).toBeNull();
      expect(second.data.email).toBeNull();
      expect(second.data.telephone).toBeNull();
    }
  });

  it('reparse sa propre sortie sans erreur, champs facultatifs remplis', () => {
    const premier = croyantSchema.parse({
      ...base,
      dateBapteme: '2010-06-01',
      email: 'amos@exemple.org',
      telephone: '+229 97 00 00 00',
    });

    const second = croyantSchema.safeParse(premier);
    expect(second.success).toBe(true);
    if (second.success) {
      expect(second.data.dateBapteme).toBeInstanceOf(Date);
      expect(second.data.email).toBe('amos@exemple.org');
    }
  });

  it('ne transforme jamais une absence en 1er janvier 1970', () => {
    const r = croyantSchema.parse({ ...base, dateBapteme: null });
    expect(r.dateBapteme).toBeNull();
  });
});

describe('Champs facultatifs de contact', () => {
  it('normalise une adresse e-mail vide en absence', () => {
    const r = croyantSchema.safeParse({ ...base, email: '', telephone: '' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBeNull();
      expect(r.data.telephone).toBeNull();
    }
  });

  it('refuse une adresse e-mail mal formée', () => {
    const r = croyantSchema.safeParse({ ...base, email: 'pas-une-adresse' });
    expect(r.success).toBe(false);
  });
});

describe('Champs obligatoires', () => {
  it("exige l'église de rattachement (RG-04)", () => {
    const { egliseId: _, ...sansEglise } = base;
    expect(croyantSchema.safeParse(sansEglise).success).toBe(false);
  });

  it('exige la date de naissance', () => {
    const { dateNaissance: _, ...sansNaissance } = base;
    expect(croyantSchema.safeParse(sansNaissance).success).toBe(false);
  });
});

describe('EF-CRO-07 — la modification n ecrit que les champs dont elle est la source', () => {
  /**
   * REGRESSION. `photoKey` figurait dans ce schema alors que le formulaire ne
   * l'affiche pas : il arrivait donc vide, et `modifierCroyant` remettait
   * `photo_key` a null. Enregistrer la fiche effacait la photo televersee dix
   * secondes plus tot, sans message et sans erreur.
   *
   * Le journal d'audit l'a montre : deux UPDATE consecutifs, le second annulant
   * le premier.
   */
  const complet = {
    id: uuid(),
    nom: 'KOFFI',
    prenom: 'Amos',
    sexe: 'M' as const,
    dateNaissance: '1990-03-12',
    adresse: 'Cotonou, quartier Zogbo',
    gradeId: uuid(),
    nationaliteId: uuid(),
    statut: 'ACTIF' as const,
  };

  it('ignore une photo glissee dans la charge utile', () => {
    const analyse = modifierCroyantSchema.safeParse({
      ...complet,
      photoKey: 'photos/ailleurs.webp',
    });

    expect(analyse.success).toBe(true);
    if (analyse.success) expect(analyse.data).not.toHaveProperty('photoKey');
  });

  it('ignore une eglise glissee dans la charge utile', () => {
    // Le rattachement se change par TRANSFERT (EF-TRF-01), avec approbation :
    // le laisser passer ici contournerait tout le workflow.
    const analyse = modifierCroyantSchema.safeParse({ ...complet, egliseId: uuid() });

    expect(analyse.success).toBe(true);
    if (analyse.success) expect(analyse.data).not.toHaveProperty('egliseId');
  });

  it('n expose aucun champ que le formulaire ne saisit pas', () => {
    const analyse = modifierCroyantSchema.parse(complet);

    for (const interdit of ['photoKey', 'egliseId', 'matricule', 'saisiPar']) {
      expect(Object.keys(analyse), interdit).not.toContain(interdit);
    }
  });
});
