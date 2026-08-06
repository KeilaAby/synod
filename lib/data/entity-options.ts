import 'server-only';

import type { OptionEntite } from '@/components/structure/entity-picker';
import {
  ENTITY_TYPES,
  type EntityType,
  typeParentDe,
} from '@/lib/domain/hierarchy';

import { type NoeudEntite, cheminLisible, getArbrePerimetre } from './entities';

/**
 * Adaptation arbre -> options de `EntityPicker`.
 *
 * Isole ici pour que les pages n'aient pas a connaitre la forme interne des
 * entites, et pour que le chemin lisible soit calcule une seule fois.
 */
export function versOptions(entites: NoeudEntite[], arbre: NoeudEntite[]): OptionEntite[] {
  return entites.map((e) => ({
    id: e.id,
    nom: e.nom,
    code: e.code,
    type: e.type,
    niveau: e.niveau,
    chemin: cheminLisible(e, arbre),
  }));
}

/**
 * Types que l'utilisateur peut effectivement creer : ceux dont un parent
 * valide existe dans son perimetre (RG-01).
 *
 * Un administrateur de District ne se voit donc proposer que Paroisse, Eglise
 * et Cellule — jamais Regional, qu'il n'aurait ou rattacher.
 */
export function typesCreables(arbre: NoeudEntite[]): EntityType[] {
  const typesPresents = new Set(arbre.filter((e) => e.is_active).map((e) => e.type));

  return ENTITY_TYPES.filter((type) => {
    const parentAttendu = typeParentDe(type);
    // Le Siege est cree par l'amorce et unique (RG-03) : jamais propose.
    if (parentAttendu === null) return false;
    return typesPresents.has(parentAttendu);
  });
}

/** Raccourci : arbre + options + types creables, en une seule lecture. */
export async function getContexteStructure() {
  const arbre = await getArbrePerimetre();
  return {
    arbre,
    options: versOptions(arbre, arbre),
    typesCreables: typesCreables(arbre),
  };
}
