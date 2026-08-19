import 'server-only';

import type { EntityType } from '@/lib/domain/hierarchy';
import { createClient } from '@/lib/supabase/server';

import { DataError } from './errors';

/**
 * La corbeille — EF-ADM-10.
 *
 * MULTI-TYPES, PARCE QUE LA QUESTION EST « QU'AI-JE SUPPRIME ? ». Personne ne se
 * demande « quelles ENTITES ai-je supprimees » puis « quels CROYANTS » : on
 * cherche ce qu'on vient d'effacer par erreur, et on ne se souvient pas
 * toujours de quel type c'etait. Deux ecrans separes obligeraient a chercher
 * deux fois.
 *
 * LA SUPPRESSION EST LOGIQUE, JAMAIS DEFINITIVE ICI. `deleted_at` est pose, la
 * ligne reste : c'est ce qui permet de revenir en arriere, et c'est aussi ce
 * qui garde justes les references de l'historique. La purge — l'effacement
 * reel — n'est pas proposee : elle romprait ces references, et rien dans le
 * cahier des charges ne la demande.
 *
 * LE PERIMETRE VIENT DE LA RLS. Un administrateur de district ne voit dans sa
 * corbeille que ce qui appartenait a son district.
 */

/** Ce qu'une ligne de corbeille a de commun, quel que soit son type. */
export interface ElementSupprime {
  readonly type: 'ENTITE' | 'CROYANT';
  readonly id: string;
  readonly libelle: string;
  /** Ce qui situe l'element : le chemin, l'eglise, le matricule. */
  readonly detail: string;
  readonly supprimeLe: string;
}

interface LigneEntite {
  id: string;
  nom: string;
  code: string;
  type: EntityType;
  deleted_at: string;
}

interface LigneCroyant {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  deleted_at: string;
  eglise: { nom: string } | null;
}

export async function chargerCorbeille(): Promise<ElementSupprime[]> {
  const sb = await createClient();

  /**
   * Deux lectures INDEPENDANTES, en parallele (regle 28). Enchainees, une
   * corbeille vide paierait deux attentes pour ne rien montrer.
   */
  const [entites, croyants] = await Promise.all([
    sb
      .from('entities')
      .select('id, nom, code, type, deleted_at')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(500)
      .returns<LigneEntite[]>(),

    sb
      .from('croyants')
      .select(
        'id, nom, prenom, matricule, deleted_at, eglise:entities!croyants_eglise_id_fkey (nom)',
      )
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(500)
      .returns<LigneCroyant[]>(),
  ]);

  if (entites.error && croyants.error) {
    throw new DataError('La corbeille est momentanement illisible.', entites.error);
  }

  const elements: ElementSupprime[] = [
    ...(entites.data ?? []).map((e) => ({
      type: 'ENTITE' as const,
      id: e.id,
      libelle: e.nom,
      detail: e.code,
      supprimeLe: e.deleted_at,
    })),
    ...(croyants.data ?? []).map((c) => ({
      type: 'CROYANT' as const,
      id: c.id,
      libelle: `${c.nom} ${c.prenom}`.trim(),
      detail: [c.matricule, c.eglise?.nom].filter(Boolean).join(' · '),
      supprimeLe: c.deleted_at,
    })),
  ];

  /**
   * UN SEUL ORDRE, TOUS TYPES CONFONDUS : du plus recemment supprime au plus
   * ancien. C'est la seule facon de retrouver « ce que je viens d'effacer »
   * sans savoir de quel type il s'agissait.
   */
  return elements.sort((a, b) => b.supprimeLe.localeCompare(a.supprimeLe));
}
