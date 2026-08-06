/**
 * Hierarchie des entites — plan.md §3.3, cdg.md RG-01 a RG-03.
 *
 * Module PUR : aucune dependance a React, a Next ni a la base. C'est la
 * contrepartie applicative des triggers SQL de `0003_entities.sql` — les deux
 * doivent rester d'accord, et les tests unitaires verrouillent cet accord.
 */

import { type ActionResult, ko, ok } from './result';

// -----------------------------------------------------------------------------
// Niveaux
// -----------------------------------------------------------------------------

export const ENTITY_TYPES = [
  'SIEGE',
  'REGIONAL',
  'DISTRICT',
  'PAROISSE',
  'EGLISE',
  'CELLULE',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

/** RG-01 : hierarchie strictement ordonnee, du niveau 1 au niveau 6. */
export const ENTITY_LEVELS: Record<EntityType, number> = {
  SIEGE: 1,
  REGIONAL: 2,
  DISTRICT: 3,
  PAROISSE: 4,
  EGLISE: 5,
  CELLULE: 6,
};

export const ENTITY_LABELS: Record<EntityType, { singulier: string; pluriel: string }> = {
  SIEGE: { singulier: 'Siege', pluriel: 'Sieges' },
  REGIONAL: { singulier: 'Regional', pluriel: 'Regionaux' },
  DISTRICT: { singulier: 'District', pluriel: 'Districts' },
  PAROISSE: { singulier: 'Paroisse', pluriel: 'Paroisses' },
  EGLISE: { singulier: 'Eglise', pluriel: 'Eglises' },
  CELLULE: { singulier: 'Cellule de priere', pluriel: 'Cellules de priere' },
};

/** Le croyant se rattache obligatoirement a une Eglise — RG-04. */
export const NIVEAU_RATTACHEMENT_CROYANT: EntityType = 'EGLISE';

/** RG-21 : une Cellule ne dispose jamais d'un compte d'acces. */
export const NIVEAUX_SANS_COMPTE: readonly EntityType[] = ['CELLULE'];

export function peutAvoirUnCompte(type: EntityType): boolean {
  return !NIVEAUX_SANS_COMPTE.includes(type);
}

/** Type parent attendu, ou `null` pour le Siege qui est racine. */
export function typeParentDe(type: EntityType): EntityType | null {
  const niveau = ENTITY_LEVELS[type];
  return niveau === 1 ? null : (ENTITY_TYPES[niveau - 2] ?? null);
}

/** Type enfant attendu, ou `null` pour la Cellule qui est feuille. */
export function typeEnfantDe(type: EntityType): EntityType | null {
  const niveau = ENTITY_LEVELS[type];
  return niveau === ENTITY_TYPES.length ? null : (ENTITY_TYPES[niveau] ?? null);
}

/** RG-01 : aucun saut de niveau. Le parent est du niveau immediatement superieur. */
export function peutEtreParent(typeParent: EntityType, typeEnfant: EntityType): boolean {
  return ENTITY_LEVELS[typeParent] === ENTITY_LEVELS[typeEnfant] - 1;
}

/**
 * RG-01 / RG-03 : valide un rattachement avant tout appel a la base.
 * Le message est destine a l'utilisateur final, pas au journal technique.
 */
export function validerRattachement(
  typeEnfant: EntityType,
  typeParent: EntityType | null,
): ActionResult<void> {
  const attendu = typeParentDe(typeEnfant);

  if (attendu === null) {
    return typeParent === null
      ? ok()
      : ko(`Le ${ENTITY_LABELS[typeEnfant].singulier} est la racine : il ne peut avoir de parent.`);
  }

  if (typeParent === null) {
    return ko(
      `Un(e) ${ENTITY_LABELS[typeEnfant].singulier} doit etre rattache(e) a un(e) ${ENTITY_LABELS[attendu].singulier}.`,
    );
  }

  if (!peutEtreParent(typeParent, typeEnfant)) {
    return ko(
      `Un(e) ${ENTITY_LABELS[typeEnfant].singulier} ne peut etre rattache(e) qu'a un(e) ` +
        `${ENTITY_LABELS[attendu].singulier}, pas a un(e) ${ENTITY_LABELS[typeParent].singulier}.`,
    );
  }

  return ok();
}

// -----------------------------------------------------------------------------
// Codes — RG-02
// -----------------------------------------------------------------------------

/** Doit rester aligne sur la contrainte `entities_code_format` (0003_entities.sql). */
export const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,15}$/;
export const CODE_LONGUEUR_MIN = 3;
export const CODE_LONGUEUR_MAX = 16;

export function normaliserCode(code: string): string {
  return code.trim().toUpperCase();
}

export function validerCode(code: string): ActionResult<string> {
  const normalise = normaliserCode(code);

  if (normalise.length < CODE_LONGUEUR_MIN) {
    return ko(`Le code doit comporter au moins ${CODE_LONGUEUR_MIN} caracteres.`);
  }
  if (normalise.length > CODE_LONGUEUR_MAX) {
    return ko(`Le code ne peut depasser ${CODE_LONGUEUR_MAX} caracteres.`);
  }
  if (!CODE_PATTERN.test(normalise)) {
    return ko(
      'Le code ne peut contenir que des lettres majuscules, des chiffres et des tirets, ' +
        'et doit commencer par une lettre ou un chiffre.',
    );
  }

  return ok(normalise);
}

// -----------------------------------------------------------------------------
// Chemins materialises (ltree) — DA-2
//
// Un chemin est une suite d'etiquettes separees par des points, chaque etiquette
// derivant d'un uuid : "n3f2a...._4b1c.n8d0e...."  (cf. fn_ltree_label en SQL).
// -----------------------------------------------------------------------------

/** Contrepartie exacte de la fonction SQL `fn_ltree_label`. */
export function etiquetteLtree(id: string): string {
  return `n${id.replace(/-/g, '_')}`;
}

export function construireChemin(cheminParent: string | null, id: string): string {
  const etiquette = etiquetteLtree(id);
  return cheminParent ? `${cheminParent}.${etiquette}` : etiquette;
}

export function profondeur(chemin: string): number {
  return chemin.length === 0 ? 0 : chemin.split('.').length;
}

/**
 * Equivalent de l'operateur SQL `<@` : `chemin` est-il dans le sous-arbre
 * de `cheminAncetre` ? Une entite est son propre descendant, comme en ltree.
 */
export function estDescendant(chemin: string, cheminAncetre: string | null): boolean {
  if (!chemin || !cheminAncetre) return false;
  return chemin === cheminAncetre || chemin.startsWith(`${cheminAncetre}.`);
}

export function estAncetre(chemin: string, cheminDescendant: string | null): boolean {
  return estDescendant(cheminDescendant ?? '', chemin);
}

/**
 * Plus petit ancetre commun de deux chemins — RG-12.
 * C'est lui qui borne l'ensemble des approbateurs competents d'un transfert.
 * Retourne `null` si les deux chemins n'ont aucune racine commune.
 */
export function ancetreCommun(cheminA: string, cheminB: string): string | null {
  const a = cheminA.split('.');
  const b = cheminB.split('.');
  const commun: string[] = [];

  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) break;
    commun.push(a[i]!);
  }

  return commun.length > 0 ? commun.join('.') : null;
}

/**
 * Un rattachement ne doit jamais creer de cycle : on ne peut pas rattacher une
 * entite sous l'un de ses propres descendants (EF-STR-07).
 */
export function creeraitUnCycle(cheminEntite: string, cheminNouveauParent: string): boolean {
  return estDescendant(cheminNouveauParent, cheminEntite);
}
