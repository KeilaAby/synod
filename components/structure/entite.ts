import type { EntityType } from '@/lib/domain/hierarchy';

/**
 * Forme d'entite partagee par l'organigramme et la vue liste — EF-STR-04,
 * EF-STR-09.
 *
 * Le type vit ici et non dans `entity-flow.tsx` pour que la vue liste puisse
 * s'y referer sans faire entrer React Flow (~120 ko) dans son bundle.
 *
 * Elle porte tout ce dont la fiche en pop-up a besoin : ouvrir une entite ne
 * declenche donc AUCUNE requete, quelle que soit la vue d'ou l'on part.
 */
export interface EntiteFlux {
  id: string;
  nom: string;
  code: string;
  type: EntityType;
  parent_id: string | null;
  path: string;
  niveau: number;
  description: string | null;
  nbDescendants: number;
  nbEnfants: number;
  descendantsParType: Partial<Record<EntityType, number>>;
  sans_acces_application: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
