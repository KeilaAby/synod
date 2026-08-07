import 'server-only';

import type { OptionEntite } from '@/components/structure/entity-picker';
import {
  ENTITY_TYPES,
  type EntityType,
  typeEnfantDe,
  typeParentDe,
} from '@/lib/domain/hierarchy';

import {
  type NoeudEntite,
  cheminLisible,
  getArbrePerimetre,
  indexerParChemin,
} from './entities';

/**
 * Adaptation arbre -> options de `EntityPicker`.
 *
 * L'index par chemin est construit UNE FOIS puis reutilise : le composer a
 * chaque ligne ferait retomber le cout a O(n²) sur les grandes structures.
 */
export function versOptions(entites: NoeudEntite[], arbre: NoeudEntite[]): OptionEntite[] {
  const index = indexerParChemin(arbre);

  return entites.map((e) => ({
    id: e.id,
    nom: e.nom,
    code: e.code,
    type: e.type,
    niveau: e.niveau,
    chemin: cheminLisible(e, index),
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

/**
 * Entites pouvant accueillir une sous-entite — cibles du pop-up de creation.
 *
 * Une Cellule est une feuille (RG-01) et une entite inactive ne doit plus
 * recevoir de nouvelle branche : proposer l'une ou l'autre ne produirait qu'un
 * refus a la validation.
 */
export function parentsPossibles(arbre: NoeudEntite[]): OptionEntite[] {
  return versOptions(
    arbre.filter((e) => e.is_active && typeEnfantDe(e.type) !== null),
    arbre,
  );
}

/** Arbre + options + types creables, en une seule lecture memoisee. */
export async function getContexteStructure() {
  const arbre = await getArbrePerimetre();
  return {
    arbre,
    options: versOptions(arbre, arbre),
    typesCreables: typesCreables(arbre),
  };
}
