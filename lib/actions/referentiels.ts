'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { type ActionResult, ko, ok } from '@/lib/domain/result';
import {
  REFERENTIELS,
  type SlugReferentiel,
  estSlugReferentiel,
} from '@/lib/domain/referentiels';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { executerAction } from './executer';
import { createClient } from '@/lib/supabase/server';
import { sanitizeAll } from '@/lib/utils/sanitize';
import { champsEnErreur } from '@/lib/validation/zod-errors';

/**
 * Mutations sur les referentiels — EF-REF-01 a 06.
 *
 * `referentiel.manage` figure dans NON_DELEGABLES : ces tables sont partagees
 * par toute l'organisation, une entite ne peut pas les modifier pour les
 * autres.
 */

const enveloppeSchema = z.object({
  slug: z.string().refine(estSlugReferentiel, { message: 'Referentiel inconnu.' }),
  valeurs: z.record(z.string(), z.unknown()),
});

const cibleSchema = z.object({
  slug: z.string().refine(estSlugReferentiel, { message: 'Referentiel inconnu.' }),
  id: z.uuid(),
});

function messageErreurSql(erreur: { code?: string; message?: string }): string {
  if (erreur.code === '23505') {
    return 'Ce code est deja utilise dans ce referentiel.';
  }
  if (erreur.code === '23503') {
    // RG-23 : une valeur utilisee ne peut pas disparaitre.
    return "Cette valeur est utilisee et ne peut pas etre supprimee. Desactivez-la a la place.";
  }
  return "L'operation n'a pas pu aboutir.";
}

// -----------------------------------------------------------------------------

export async function creerValeurReferentiel(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return executerAction('creerValeurReferentiel', async () => {
    const session = await requireSession();
    await requirePermission(session, 'referentiel.manage');

    const enveloppe = enveloppeSchema.safeParse(input);
    if (!enveloppe.success) return ko('Requete invalide.');

    const slug = enveloppe.data.slug as SlugReferentiel;
    const definition = REFERENTIELS[slug];

    const analyse = definition.schema.safeParse(enveloppe.data.valeurs);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }

    const sb = await createClient();
    const { data, error } = await sb
      .from(definition.table)
      .insert(sanitizeAll(analyse.data))
      .select('id')
      .single<{ id: string }>();

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'CREATE',
      table: definition.table,
      recordId: data.id,
      diff: { apres: analyse.data },
    });

    revalidatePath(`/referentiels/${slug}`);
    revalidatePath('/referentiels');
    return ok({ id: data.id });
  });
}

// -----------------------------------------------------------------------------

export async function modifierValeurReferentiel(input: unknown): Promise<ActionResult<void>> {
  return executerAction('modifierValeurReferentiel', async () => {
    const session = await requireSession();
    await requirePermission(session, 'referentiel.manage');

    const enveloppe = enveloppeSchema.extend({ id: z.uuid() }).safeParse(input);
    if (!enveloppe.success) return ko('Requete invalide.');

    const slug = enveloppe.data.slug as SlugReferentiel;
    const definition = REFERENTIELS[slug];

    const analyse = definition.schema.safeParse(enveloppe.data.valeurs);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }

    // Les champs marques `immuable` sont retires de la mise a jour : un code
    // ou un sens qui change retroactivement invaliderait l'historique.
    const modifiable = { ...(analyse.data as Record<string, unknown>) };
    for (const champ of definition.champs) {
      if (champ.immuable) delete modifiable[champ.cle];
    }

    const sb = await createClient();
    const { error } = await sb
      .from(definition.table)
      .update(sanitizeAll(modifiable))
      .eq('id', enveloppe.data.id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: definition.table,
      recordId: enveloppe.data.id,
      diff: { apres: modifiable },
    });

    revalidatePath(`/referentiels/${slug}`);
    return ok();
  });
}

// -----------------------------------------------------------------------------

/**
 * RG-23 — une valeur utilisee ne se supprime pas, elle se desactive.
 * Elle disparait des nouvelles saisies mais reste lisible dans l'historique.
 */
/**
 * EF-REF-05 — suppression d'une valeur de referentiel.
 *
 * DESACTIVER ET SUPPRIMER NE SE CONFONDENT PAS
 *
 * Desactiver retire de la liste ce qui a servi : les fiches qui le portent
 * restent justes. Supprimer efface — et n'est licite QUE si rien ne s'y
 * rattache. Une valeur creee par erreur, jamais employee, n'a aucune raison de
 * polluer un referentiel pour toujours.
 *
 * Le refus est MOTIVE : « ce grade est porte par 42 croyants » se comprend et
 * se corrige, un code de violation de cle etrangere ne se comprend pas. La cle
 * etrangere reste neanmoins la garantie — le decompte prealable ne fait
 * qu'expliquer, et il peut vieillir si une table nouvelle reference le
 * referentiel sans qu'on pense a l'inscrire au registre.
 */
export async function supprimerValeurReferentiel(
  input: unknown,
): Promise<ActionResult<void>> {
  return executerAction('supprimerValeurReferentiel', async () => {
    const session = await requireSession();
    await requirePermission(session, 'referentiel.manage');

    const cible = cibleSchema.safeParse(input);
    if (!cible.success) return ko('Requete invalide.');

    const slug = cible.data.slug as SlugReferentiel;
    const definition = REFERENTIELS[slug];

    const sb = await createClient();
    const { data: existante } = await sb
      .from(definition.table)
      .select('id, libelle')
      .eq('id', cible.data.id)
      .maybeSingle<{ id: string; libelle: string }>();

    if (!existante) return ko('Cette valeur est introuvable.');

    // Les decomptes en parallele : ils sont independants, et une valeur
    // employee a plusieurs titres doit tous les nommer.
    const decomptes = await Promise.all(
      definition.usages.map(async (usage) => {
        const { count } = await sb
          .from(usage.table)
          .select('id', { count: 'exact', head: true })
          .eq(usage.colonne, cible.data.id);

        return { quoi: usage.quoi, nombre: count ?? 0 };
      }),
    );

    const employee = decomptes.filter((d) => d.nombre > 0);
    if (employee.length > 0) {
      const detail = employee
        .map((d) => `${d.nombre} ${d.quoi}${d.nombre > 1 ? 's' : ''}`)
        .join(' et ');

      return ko(
        `« ${existante.libelle} » est utilise par ${detail} : la suppression effacerait ` +
          'une information encore vraie. Desactivez cette valeur, elle disparaitra des ' +
          'listes sans toucher a ce qui existe.',
      );
    }

    // L'audit est ecrit AVANT : apres, il n'y aurait plus rien a decrire.
    await auditer({
      session,
      action: 'DELETE',
      table: definition.table,
      recordId: cible.data.id,
      diff: { avant: { libelle: existante.libelle } },
    });

    const { error } = await sb.from(definition.table).delete().eq('id', cible.data.id);
    if (error) return ko(messageErreurSql(error));

    revalidatePath(`/referentiels/${slug}`);
    revalidatePath('/referentiels');
    return ok();
  });
}

export async function basculerActivationReferentiel(
  input: unknown,
): Promise<ActionResult<{ actif: boolean }>> {
  return executerAction('basculerActivationReferentiel', async () => {
    const session = await requireSession();
    await requirePermission(session, 'referentiel.manage');

    const cible = cibleSchema.safeParse(input);
    if (!cible.success) return ko('Requete invalide.');

    const slug = cible.data.slug as SlugReferentiel;
    const definition = REFERENTIELS[slug];

    const sb = await createClient();
    const { data: existante, error: erreurLecture } = await sb
      .from(definition.table)
      .select('id, libelle, is_active')
      .eq('id', cible.data.id)
      .maybeSingle<{ id: string; libelle: string; is_active: boolean }>();

    if (erreurLecture || !existante) return ko('Cette valeur est introuvable.');

    const suivant = !existante.is_active;

    const { error } = await sb
      .from(definition.table)
      .update({ is_active: suivant })
      .eq('id', cible.data.id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: definition.table,
      recordId: cible.data.id,
      diff: { champ: 'is_active', avant: existante.is_active, apres: suivant },
    });

    revalidatePath(`/referentiels/${slug}`);
    revalidatePath('/referentiels');
    return ok({ actif: suivant });
  });
}

/**
 * EF-REF-02 — REORDONNER, EN UNE SEULE ECRITURE.
 *
 * POURQUOI UN RANG NE SE TAPE PLUS. « Ordre d'affichage : 100, 200, 300 » est
 * une representation, pas une intention : pour glisser le tresorier avant le
 * secretaire, il fallait deviner un nombre libre entre les deux, et le jour ou
 * il n'y en avait plus, renumeroter la liste entiere. L'ordre PROTOCOLAIRE est
 * une suite de positions relatives — on le pose en deplaçant, pas en calculant.
 *
 * LA LISTE ENTIERE VOYAGE, ET C'EST VOULU. On pourrait n'envoyer que les lignes
 * deplacees ; mais deux personnes qui reordonnent en meme temps produiraient
 * alors des rangs qui s'entrelacent, sans que rien ne le signale. Envoyer
 * l'ordre COMPLET fait de la derniere ecriture la seule qui compte — un
 * arbitrage brutal, mais lisible, sur une table que deux personnes ne touchent
 * jamais ensemble en pratique.
 *
 * `upsert` plutot que N `update` : une ligne par valeur couterait un
 * aller-retour par fonction (regle 28), et une interruption a mi-parcours
 * laisserait un ordre a moitie applique — donc faux, et sans trace.
 */
const reordonnerSchema = z.object({
  slug: z.string(),
  /** Les identifiants DANS L'ORDRE VOULU. Le rang est l'indice, rien d'autre. */
  ids: z.array(z.uuid()).min(1).max(500),
});

export async function reordonnerReferentiel(input: unknown): Promise<ActionResult<void>> {
  return executerAction('reordonnerReferentiel', async () => {
    const session = await requireSession();
    await requirePermission(session, 'referentiel.manage');

    const analyse = reordonnerSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    const slug = analyse.data.slug as SlugReferentiel;
    const definition = REFERENTIELS[slug];
    if (!definition) return ko('Referentiel inconnu.');

    /**
     * Le referentiel doit AVOIR un ordre. Les nationalites se rangent par
     * libelle : leur imposer un rang inventerait une hierarchie entre des pays.
     */
    if (!definition.colonneOrdre) {
      return ko(
        `Les ${definition.titre.toLocaleLowerCase('fr')} n’ont pas d’ordre à définir : ` +
          'elles se rangent par libellé.',
      );
    }

    const sb = await createClient();

    /**
     * UNE FONCTION EN BASE, ET NON UN `upsert`.
     *
     * Le premier jet envoyait `upsert([{ id, ordre: 10 }, …])`. PostgREST le
     * traduit en `insert … on conflict (id) do update`, et PostgreSQL VALIDE
     * LE TUPLE INSERE AVANT de resoudre le conflit : `code` et `libelle` etant
     * `not null` sans defaut, l'ecriture echouait en 23502 sur une colonne a
     * laquelle on ne touchait pas. `upsert` ressemble a « mets a jour si ca
     * existe » ; c'est un INSERT qui se rattrape, pas un UPDATE qui s'etend.
     *
     * `fn_reordonner_referentiel` (0062) fait le tout en UNE ecriture : dix
     * appels seraient dix allers-retours (regle 28), et une interruption a
     * mi-parcours laisserait deux valeurs au meme rang — un etat faux ET
     * indetectable, donc il se traite en base (regle 20).
     */
    const { data: touchees, error } = await sb.rpc('fn_reordonner_referentiel', {
      p_table: definition.table,
      p_ids: analyse.data.ids,
    });

    if (error) return ko(messageErreurSql(error));

    /**
     * UNE REUSSITE PARTIELLE SE DIT. Un identifiant sans ligne correspondante —
     * valeur supprimee depuis l'ouverture de l'ecran — est ignore par la
     * fonction : annoncer un succes complet ferait croire a un ordre qui n'est
     * pas celui qu'on voit.
     */
    const attendues = analyse.data.ids.length;
    if (typeof touchees === 'number' && touchees < attendues) {
      return ko(
        `L’ordre n’a été appliqué qu’à ${touchees} valeur(s) sur ${attendues} : ` +
          'la liste a changé depuis l’ouverture de cet écran. Rechargez la page, ' +
          'puis reprenez le classement.',
      );
    }

    await auditer({
      session,
      action: 'UPDATE',
      table: definition.table,
      diff: { apres: { ordre: analyse.data.ids } },
    });

    revalidatePath(`/referentiels/${slug}`);
    revalidatePath('/referentiels');
    return ok();
  });
}
