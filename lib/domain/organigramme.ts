import { ENTITY_LEVELS, type EntityType } from './hierarchy';

/**
 * Règles d'affichage de l'organigramme — EF-STR-04.
 *
 * Module PUR, sans dépendance à React Flow : c'est ce qui permet de le tester
 * sans monter un canevas.
 */

/**
 * Niveau à partir duquel les branches sont repliées à l'ouverture.
 *
 * Depuis le Siège, on voit donc les Régionaux repliés : la vue d'ensemble tient
 * à l'écran et l'on descend à la demande. Chaque dépliage ne révèle qu'un
 * niveau, les enfants arrivant eux-mêmes repliés.
 */
export const NIVEAU_REPLI_PAR_DEFAUT: EntityType = 'REGIONAL';

/** Le strict nécessaire pour décider d'un repli. */
export interface NoeudRepliable {
  readonly id: string;
  readonly niveau: number;
  readonly nbEnfants: number;
}

/**
 * Branches repliées à l'ouverture de la page.
 *
 * Deux précautions :
 *   - la **racine du périmètre** n'est jamais repliée. Pour un administrateur
 *     de Régional, sa propre entité est la racine : la replier n'afficherait
 *     qu'un seul nœud et la page paraîtrait vide.
 *   - une entité sans enfant n'a rien à replier.
 *
 * Un compte dont le périmètre démarre SOUS le niveau de repli — district,
 * paroisse — voit son arbre déployé : le seuil ne s'applique qu'à ce qui est
 * plus profond que sa propre racine.
 */
export function replisParDefaut(
  noeuds: readonly NoeudRepliable[],
  niveauRepli: EntityType = NIVEAU_REPLI_PAR_DEFAUT,
): Set<string> {
  if (noeuds.length === 0) return new Set();

  const seuil = ENTITY_LEVELS[niveauRepli];
  const niveauRacine = Math.min(...noeuds.map((n) => n.niveau));

  return new Set(
    noeuds
      .filter((n) => n.nbEnfants > 0 && n.niveau > niveauRacine && n.niveau >= seuil)
      .map((n) => n.id),
  );
}
