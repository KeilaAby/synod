'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

import { executerAction } from './executer';

/**
 * EF-ADM-10 — l'effacement DEFINITIF depuis la corbeille.
 *
 * CE QUI CHANGE PAR RAPPORT A LA DOCTRINE INITIALE. La corbeille annonçait
 * « pas de suppression definitive » : la suppression est logique, la ligne
 * reste, et c'est ce qui garde justes les references de l'historique. C'est
 * toujours vrai — et c'est justement ce que ce geste accepte de rompre.
 *
 * LA CONSEQUENCE, DITE SANS DETOUR : le journal d'audit conserve les lignes qui
 * citent l'element efface, mais elles ne renverront plus a rien. « Croyant
 * supprime » restera lisible, le nom du croyant non. C'est le prix d'un
 * effacement reel, et c'est pourquoi le droit qui l'ouvre est a part et non
 * delegable.
 *
 * LA BASE A LE DERNIER MOT. Les cles etrangeres sont en `on delete restrict`
 * a peu pres partout : un croyant qui a siege dans un bureau, une entite qui
 * porte des mouvements. Elle REFUSERA de les effacer, et elle a raison — ces
 * lignes sont citees ailleurs. Cette action ne force rien : elle traduit le
 * refus en francais et nomme la ligne concernee.
 *
 * UN REFUS PARTIEL N'ARRETE PAS LE LOT — meme doctrine que la file de
 * validation financiere (EF-FIN-21). Sur trente elements dont deux sont
 * references, on efface les vingt-huit autres et on nomme les deux.
 */

const elementSchema = z.object({
  type: z.enum(['ENTITE', 'CROYANT']),
  id: z.uuid(),
});

const purgeSchema = z.object({
  elements: z.array(elementSchema).min(1).max(500),
});

export interface ResultatPurge {
  readonly effaces: number;
  /** Ce que la base a refuse, avec le motif. Jamais un simple compte. */
  readonly refuses: ReadonlyArray<{ libelle: string; motif: string }>;
}

/** 23503 : violation de cle etrangere — la ligne est citee ailleurs. */
function estReference(code: string | undefined): boolean {
  return code === '23503';
}

export async function purgerElements(input: unknown): Promise<ActionResult<ResultatPurge>> {
  return executerAction('purgerElements', async () => {
    const session = await requireSession();

    const analyse = purgeSchema.safeParse(input);
    if (!analyse.success) return ko<ResultatPurge>('Requete invalide.');

    const { elements } = analyse.data;
    const sb = await createClient();

    const idsEntites = elements.filter((e) => e.type === 'ENTITE').map((e) => e.id);
    const idsCroyants = elements.filter((e) => e.type === 'CROYANT').map((e) => e.id);

    /**
     * LA PORTEE SE VERIFIE SUR LES LIGNES, PAS SUR LA DEMANDE (regle 3).
     *
     * Deux lectures en parallele (regle 28), bornees par la RLS : ce qui n'est
     * pas dans le perimetre ne remonte pas, donc ne sera pas efface. On lit
     * aussi le chemin, parce que `trash.purge` est a portee PROPRE — le
     * detenir sur un district ne l'ouvre pas sur ses eglises (RG-25).
     */
    const [reponseEntites, reponseCroyants] = await Promise.all([
      idsEntites.length > 0
        ? sb
            .from('entities')
            .select('id, nom, code, path')
            .in('id', idsEntites)
            .not('deleted_at', 'is', null)
            .returns<{ id: string; nom: string; code: string; path: string }[]>()
        : Promise.resolve({ data: [], error: null }),

      idsCroyants.length > 0
        ? sb
            .from('croyants')
            .select('id, nom, prenom, matricule, eglise:entities!croyants_eglise_id_fkey (path)')
            .in('id', idsCroyants)
            .not('deleted_at', 'is', null)
            .returns<
              {
                id: string;
                nom: string;
                prenom: string;
                matricule: string;
                eglise: { path: string } | null;
              }[]
            >()
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (reponseEntites.error || reponseCroyants.error) {
      return ko<ResultatPurge>('La corbeille est momentanement illisible.');
    }

    const entites = reponseEntites.data ?? [];
    const croyants = reponseCroyants.data ?? [];

    if (entites.length === 0 && croyants.length === 0) {
      return ko<ResultatPurge>(
        'Aucun de ces éléments n’est dans votre corbeille. Ils ont pu être ' +
          'restaurés ou effacés entre-temps — rechargez la page.',
      );
    }

    /**
     * `requirePermission` avec le chemin : une entite par une entite. Un droit
     * a portee PROPRE ne se verifie pas une fois pour le lot — c'est justement
     * ce qui le distingue d'un droit qui descend.
     */
    for (const entite of entites) {
      await requirePermission(session, 'trash.purge', entite.path);
    }
    for (const croyant of croyants) {
      // Un croyant sans eglise lisible sortirait du controle de portee : on
      // refuse plutot que d'effacer sans savoir a qui il appartenait.
      if (!croyant.eglise) {
        return ko<ResultatPurge>(
          `L’église de ${croyant.prenom} ${croyant.nom} n’est pas lisible : ` +
            'l’effacement est refusé tant que son rattachement est inconnu.',
        );
      }
      await requirePermission(session, 'trash.purge', croyant.eglise.path);
    }

    const refuses: { libelle: string; motif: string }[] = [];
    let effaces = 0;

    /**
     * On tente le LOT d'abord, ligne par ligne ensuite — et seulement si le lot
     * echoue. Le cas courant coute alors deux allers-retours au lieu de N
     * (regle 28) ; le cas degrade n'en paie le prix que pour identifier
     * precisement ce qui bloque, ce qu'un echec global ne dirait pas.
     */
    async function effacer(
      table: 'entities' | 'croyants',
      lignes: { id: string; libelle: string }[],
    ) {
      if (lignes.length === 0) return;

      const { error } = await sb
        .from(table)
        .delete()
        .in(
          'id',
          lignes.map((l) => l.id),
        );

      if (!error) {
        effaces += lignes.length;
        return;
      }

      if (!estReference(error.code)) {
        for (const ligne of lignes) {
          refuses.push({ libelle: ligne.libelle, motif: 'Refus de la base de données.' });
        }
        return;
      }

      for (const ligne of lignes) {
        const { error: erreurLigne } = await sb.from(table).delete().eq('id', ligne.id);

        if (!erreurLigne) {
          effaces += 1;
          continue;
        }

        refuses.push({
          libelle: ligne.libelle,
          motif: estReference(erreurLigne.code)
            ? 'Encore cité ailleurs — un bureau, un mouvement ou un baptême s’y réfère. La corbeille le garde.'
            : 'Refus de la base de données.',
        });
      }
    }

    await effacer(
      'entities',
      entites.map((e) => ({ id: e.id, libelle: `${e.nom} (${e.code})` })),
    );
    await effacer(
      'croyants',
      croyants.map((c) => ({
        id: c.id,
        libelle: `${c.prenom} ${c.nom} (${c.matricule})`,
      })),
    );

    /**
     * L'AUDIT EST ECRIT MEME QUAND LA LIGNE DISPARAIT — et surtout alors.
     *
     * `recordId` ne renverra plus a rien : c'est precisement pourquoi le `diff`
     * porte le LIBELLE. Sans lui, la trace dirait « quelque chose a ete efface »
     * sans pouvoir dire quoi, ce qui ne vaut guere mieux que pas de trace.
     */
    if (effaces > 0) {
      await auditer({
        session,
        action: 'DELETE',
        table: 'corbeille',
        diff: {
          avant: {
            effaces: [
              ...entites.map((e) => `${e.nom} (${e.code})`),
              ...croyants.map((c) => `${c.prenom} ${c.nom} (${c.matricule})`),
            ].filter((libelle) => !refuses.some((r) => r.libelle === libelle)),
          },
        },
      });
    }

    revalidatePath('/administration/corbeille');
    return ok({ effaces, refuses });
  });
}
