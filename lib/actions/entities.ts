'use server';

import { revalidatePath } from 'next/cache';

import { getArbrePerimetre } from '@/lib/data/entities';
import {
  ENTITY_LABELS,
  creeraitUnCycle,
  estDescendant,
  validerRattachement,
} from '@/lib/domain/hierarchy';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { ErreurAcces, auditer, requirePermission, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitize } from '@/lib/utils/sanitize';
import {
  creerEntiteSchema,
  modifierEntiteSchema,
  rattacherEntiteSchema,
  supprimerEntiteSchema,
} from '@/lib/validation/entity';
import { champsEnErreur } from '@/lib/validation/zod-errors';

/**
 * Mutations sur les entites — EF-STR-01 a 12.
 *
 * Chaque action suit le meme enchainement (plan.md §5.4) :
 *   session -> validation Zod -> habilitation + PORTEE -> regles de gestion
 *          -> persistance -> audit -> revalidation
 *
 * Les triggers SQL rejouent les memes controles : ici les messages sont
 * destines a l'utilisateur, la base garantit l'invariant.
 */

/** Traduit une violation de contrainte PostgreSQL en message lisible. */
function messageErreurSql(erreur: { code?: string; message?: string }): string {
  if (erreur.code === '23505') {
    return "Ce code est deja utilise par une autre entite. Les codes sont uniques dans toute l'application.";
  }
  if (erreur.code === '23503') {
    return "L'entite parente est introuvable.";
  }
  // Les triggers RG-* levent avec un message deja redige pour l'utilisateur.
  if (erreur.message?.includes('RG-')) {
    return erreur.message.split('\n')[0] ?? 'Operation refusee.';
  }
  return "L'operation n'a pas pu aboutir.";
}

// -----------------------------------------------------------------------------

export async function creerEntite(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireSession();

    const analyse = creerEntiteSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const arbre = await getArbrePerimetre();
    const parent = data.parentId ? arbre.find((e) => e.id === data.parentId) : null;

    if (data.parentId && !parent) {
      return ko("L'entite parente est introuvable ou hors de votre perimetre.");
    }

    // RG-01 / RG-03 — coherence des niveaux, avant tout aller-retour en base.
    const rattachement = validerRattachement(data.type, parent?.type ?? null);
    if (!rattachement.ok) return ko(rattachement.error);

    // L'habilitation s'evalue sur le PARENT : creer sous une entite, c'est agir
    // sur elle. Pour le Siege (sans parent), seul le SuperAdmin passe.
    if (parent) {
      await requirePermission(session, 'entity.create', parent.path);
    } else if (session.role !== 'SUPERADMIN') {
      return ko('Seule l administration du Siege peut creer une entite racine.');
    }

    const sb = await createClient();
    const { data: creee, error } = await sb
      .from('entities')
      .insert({
        type: data.type,
        code: data.code,
        nom: sanitize(data.nom),
        parent_id: data.parentId,
        description: data.description ? sanitize(data.description) : null,
        sans_acces_application: data.sansAccesApplication,
        created_by: session.profileId,
      })
      .select('id, path')
      .single<{ id: string; path: string }>();

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'CREATE',
      table: 'entities',
      recordId: creee.id,
      entityId: creee.id,
      diff: { apres: { type: data.type, code: data.code, nom: data.nom } },
    });

    revalidatePath('/structure');
    revalidatePath('/structure/liste');
    return ok({ id: creee.id });
  } catch (erreur) {
    if (erreur instanceof ErreurAcces) return ko(erreur.message);
    throw erreur;
  }
}

// -----------------------------------------------------------------------------

export async function modifierEntite(input: unknown): Promise<ActionResult<void>> {
  try {
    const session = await requireSession();

    const analyse = modifierEntiteSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const arbre = await getArbrePerimetre();
    const entite = arbre.find((e) => e.id === data.id);
    if (!entite) return ko("Cette entite est introuvable ou hors de votre perimetre.");

    await requirePermission(session, 'entity.update', entite.path);

    const sb = await createClient();
    const { error } = await sb
      .from('entities')
      .update({
        code: data.code,
        nom: sanitize(data.nom),
        description: data.description ? sanitize(data.description) : null,
        sans_acces_application: data.sansAccesApplication,
        is_active: data.isActive,
      })
      .eq('id', data.id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'entities',
      recordId: data.id,
      entityId: data.id,
      diff: {
        avant: { code: entite.code, nom: entite.nom, is_active: entite.is_active },
        apres: { code: data.code, nom: data.nom, is_active: data.isActive },
      },
    });

    revalidatePath('/structure');
    revalidatePath(`/structure/${data.id}`);
    return ok();
  } catch (erreur) {
    if (erreur instanceof ErreurAcces) return ko(erreur.message);
    throw erreur;
  }
}

// -----------------------------------------------------------------------------

/**
 * EF-STR-07 — rattachement a un nouveau parent.
 * Le trigger `trg_entities_aiu` propage le nouveau chemin a tout le sous-arbre ;
 * ici on verifie la coherence de niveau, l'absence de cycle et l'habilitation
 * SUR LES DEUX COTES du deplacement.
 */
export async function rattacherEntite(input: unknown): Promise<ActionResult<void>> {
  try {
    const session = await requireSession();

    const analyse = rattacherEntiteSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const { id, nouveauParentId } = analyse.data;

    const arbre = await getArbrePerimetre();
    const entite = arbre.find((e) => e.id === id);
    const nouveauParent = arbre.find((e) => e.id === nouveauParentId);

    if (!entite) return ko('Cette entite est introuvable ou hors de votre perimetre.');
    if (!nouveauParent) {
      return ko("L'entite de destination est introuvable ou hors de votre perimetre.");
    }
    if (entite.parent_id === nouveauParentId) {
      return ko('Cette entite est deja rattachee a ce parent.');
    }

    const rattachement = validerRattachement(entite.type, nouveauParent.type);
    if (!rattachement.ok) return ko(rattachement.error);

    if (creeraitUnCycle(entite.path, nouveauParent.path)) {
      return ko(
        `« ${nouveauParent.nom} » appartient au sous-arbre de « ${entite.nom} » : ` +
          'ce rattachement creerait un cycle.',
      );
    }

    // Deplacer une branche modifie l'origine ET la destination : le droit doit
    // couvrir les deux, sans quoi on pourrait exporter une branche hors de son
    // perimetre de responsabilite.
    await requirePermission(session, 'entity.update', entite.path);
    await requirePermission(session, 'entity.update', nouveauParent.path);

    const sb = await createClient();
    const { error } = await sb
      .from('entities')
      .update({ parent_id: nouveauParentId })
      .eq('id', id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'entities',
      recordId: id,
      entityId: id,
      diff: {
        operation: 'rattachement',
        avant: { parent_id: entite.parent_id },
        apres: { parent_id: nouveauParentId },
        sous_arbre_deplace: entite.nbDescendants,
      },
    });

    revalidatePath('/structure');
    revalidatePath('/structure/liste');
    return ok();
  } catch (erreur) {
    if (erreur instanceof ErreurAcces) return ko(erreur.message);
    throw erreur;
  }
}

// -----------------------------------------------------------------------------

/**
 * EF-STR-08 / RG-22 — suppression LOGIQUE (corbeille).
 * Le trigger `trg_entities_soft_delete` refuse la suppression d'une entite
 * ayant des sous-entites vivantes ; on l'anticipe pour proposer une
 * desactivation a la place.
 */
export async function supprimerEntite(input: unknown): Promise<ActionResult<void>> {
  try {
    const session = await requireSession();

    const analyse = supprimerEntiteSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');
    const { id } = analyse.data;

    const arbre = await getArbrePerimetre();
    const entite = arbre.find((e) => e.id === id);
    if (!entite) return ko('Cette entite est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'entity.update', entite.path);

    if (entite.nbEnfants > 0) {
      return ko(
        `« ${entite.nom} » contient ${entite.nbEnfants} sous-entite(s). ` +
          'Deplacez-les ou supprimez-les d abord, ou desactivez cette entite.',
      );
    }

    if (entite.type === 'SIEGE') {
      return ko('Le Siege est la racine de la hierarchie et ne peut pas etre supprime.');
    }

    const sb = await createClient();
    const { error } = await sb
      .from('entities')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'DELETE',
      table: 'entities',
      recordId: id,
      entityId: id,
      diff: { avant: { code: entite.code, nom: entite.nom, type: entite.type } },
    });

    revalidatePath('/structure');
    revalidatePath('/structure/liste');
    return ok();
  } catch (erreur) {
    if (erreur instanceof ErreurAcces) return ko(erreur.message);
    throw erreur;
  }
}

// -----------------------------------------------------------------------------

/** EF-ADM-10 — restauration depuis la corbeille. */
export async function restaurerEntite(input: unknown): Promise<ActionResult<void>> {
  try {
    const session = await requireSession();

    const analyse = supprimerEntiteSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');
    const { id } = analyse.data;

    await requirePermission(session, 'trash.restore');

    const sb = await createClient();
    const { data: entite, error: erreurLecture } = await sb
      .from('entities')
      .select('id, nom, path, parent_id')
      .eq('id', id)
      .maybeSingle<{ id: string; nom: string; path: string; parent_id: string | null }>();

    if (erreurLecture || !entite) return ko('Cette entite est introuvable.');

    if (!estDescendant(entite.path, session.scopePath) && session.role !== 'SUPERADMIN') {
      return ko("Cette entite n'appartient pas a votre perimetre.");
    }

    // Restaurer sous un parent lui-meme supprime recreerait un orphelin visible.
    if (entite.parent_id) {
      const { data: parent } = await sb
        .from('entities')
        .select('id, nom, deleted_at')
        .eq('id', entite.parent_id)
        .maybeSingle<{ id: string; nom: string; deleted_at: string | null }>();

      if (parent?.deleted_at) {
        return ko(
          `L'entite parente « ${parent.nom} » est elle-meme dans la corbeille. ` +
            'Restaurez-la en premier.',
        );
      }
    }

    const { error } = await sb.from('entities').update({ deleted_at: null }).eq('id', id);
    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'RESTORE',
      table: 'entities',
      recordId: id,
      entityId: id,
      diff: { apres: { nom: entite.nom } },
    });

    revalidatePath('/structure');
    revalidatePath('/administration/corbeille');
    return ok();
  } catch (erreur) {
    if (erreur instanceof ErreurAcces) return ko(erreur.message);
    throw erreur;
  }
}

// -----------------------------------------------------------------------------

/**
 * EF-STR-10 / ARB-2 — marque une entite comme depourvue d'acces a
 * l'application, ce qui autorise la saisie financiere deleguee par le Siege.
 */
export async function basculerAccesApplication(
  input: unknown,
): Promise<ActionResult<{ sansAcces: boolean }>> {
  try {
    const session = await requireSession();

    const analyse = supprimerEntiteSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');
    const { id } = analyse.data;

    const arbre = await getArbrePerimetre();
    const entite = arbre.find((e) => e.id === id);
    if (!entite) return ko('Cette entite est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'entity.update', entite.path);

    const suivant = !entite.sans_acces_application;

    const sb = await createClient();
    const { error } = await sb
      .from('entities')
      .update({ sans_acces_application: suivant })
      .eq('id', id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'entities',
      recordId: id,
      entityId: id,
      diff: {
        champ: 'sans_acces_application',
        avant: entite.sans_acces_application,
        apres: suivant,
      },
    });

    revalidatePath('/structure');
    revalidatePath(`/structure/${id}`);
    return ok({ sansAcces: suivant });
  } catch (erreur) {
    if (erreur instanceof ErreurAcces) return ko(erreur.message);
    throw erreur;
  }
}

// -----------------------------------------------------------------------------

/** Libelle d'un type, pour composer les messages cote client. */
export async function libelleType(type: keyof typeof ENTITY_LABELS): Promise<string> {
  return ENTITY_LABELS[type].singulier;
}
