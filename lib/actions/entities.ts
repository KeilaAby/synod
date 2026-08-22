'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getArbrePerimetre } from '@/lib/data/entities';
import {
  ENTITY_LABELS,
  creeraitUnCycle,
  estDescendant,
  validerRattachement,
} from '@/lib/domain/hierarchy';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { construireCle, storage, verifierFichier } from '@/lib/storage';
import { executerAction } from './executer';
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
  return executerAction('creerEntite', async () => {
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
        // Code OMIS quand il n'est pas fourni : le trigger l'attribue avant que
        // la contrainte NOT NULL ne soit verifiee. Un compteur cote application
        // ne pourrait pas garantir l'unicite face a deux creations simultanees.
        ...(data.code ? { code: data.code } : {}),
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
  });
}

// -----------------------------------------------------------------------------

export async function modifierEntite(input: unknown): Promise<ActionResult<void>> {
  return executerAction('modifierEntite', async () => {
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
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-RAP-02 — l'en-tete propre a une entite, source du bloc Image d'un
 * rapport (migration `0073`).
 *
 * MEME CONTROLE QUE LA PHOTO D'UN CROYANT (`lib/actions/photos.ts`) : le
 * type reel se deduit des premiers octets, jamais de l'extension ni du
 * `Content-Type` annonce (ENF-SEC-06). Cle construite sur l'ID de l'entite,
 * comme `photos/<croyant-id>` — contrairement au logo de l'organisation ou
 * de l'attestation (cle FIXE, une seule ligne de reglages), chaque entite a
 * la SIENNE.
 *
 * `entity.update` (RG-25, DESCENDANTE par defaut) : le meme droit qui
 * modifie le nom ou le code d'une entite regle aussi son en-tete — ce n'est
 * pas une habilitation a part, c'est un champ de plus de la meme fiche.
 */
const cibleLogoEntiteSchema = z.object({ entityId: z.uuid() });

export async function televerserLogoEntite(
  formulaire: FormData,
): Promise<ActionResult<{ logoKey: string }>> {
  return executerAction('televerserLogoEntite', async () => {
    const session = await requireSession();

    const analyse = cibleLogoEntiteSchema.safeParse({ entityId: formulaire.get('entityId') });
    if (!analyse.success) return ko('Requete invalide.');

    const arbre = await getArbrePerimetre();
    const entite = arbre.find((e) => e.id === analyse.data.entityId);
    if (!entite) return ko("Cette entite est introuvable ou hors de votre perimetre.");

    await requirePermission(session, 'entity.update', entite.path);

    const fichier = formulaire.get('logo');
    if (!(fichier instanceof File) || fichier.size === 0) {
      return ko('Aucun fichier reçu.');
    }

    const octets = new Uint8Array(await fichier.arrayBuffer());

    const verdict = verifierFichier('photo', octets.slice(0, 16), octets.byteLength);
    if (!verdict.ok) return ko(verdict.error);

    const extension = verdict.data.split('/')[1] ?? 'webp';
    const cle = construireCle('logos', entite.id, extension);

    const depot = await storage().put(cle, octets, {
      contentType: verdict.data,
      upsert: true,
    });
    if (!depot.ok) return ko(depot.error);

    const sb = await createClient();
    const { error } = await sb.from('entities').update({ logo_key: depot.data }).eq('id', entite.id);

    if (error) {
      // L'objet est depose mais le reglage ne le reference pas : on le retire
      // plutot que de laisser un orphelin dans le stockage.
      await storage().delete(depot.data);
      return ko("Le logo n'a pas pu être enregistré.");
    }

    await auditer({
      session,
      action: 'UPDATE',
      table: 'entities',
      recordId: entite.id,
      entityId: entite.id,
      diff: { apres: { logo_key: depot.data } },
    });

    revalidatePath(`/structure/${entite.id}`);
    return ok({ logoKey: depot.data });
  });
}

export async function supprimerLogoEntite(input: unknown): Promise<ActionResult<void>> {
  return executerAction('supprimerLogoEntite', async () => {
    const session = await requireSession();

    const analyse = cibleLogoEntiteSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    const arbre = await getArbrePerimetre();
    const entite = arbre.find((e) => e.id === analyse.data.entityId);
    if (!entite) return ko("Cette entite est introuvable ou hors de votre perimetre.");

    await requirePermission(session, 'entity.update', entite.path);

    if (!entite.logo_key) return ok();

    const sb = await createClient();
    const { error } = await sb.from('entities').update({ logo_key: null }).eq('id', entite.id);

    if (error) return ko("Le logo n'a pas pu être retiré.");

    // L'objet part APRES le reglage : si sa suppression echoue, il reste un
    // orphelin dans le stockage, sans consequence — l'inverse laisserait le
    // reglage pointer vers un objet disparu.
    await storage().delete(entite.logo_key);

    await auditer({
      session,
      action: 'UPDATE',
      table: 'entities',
      recordId: entite.id,
      entityId: entite.id,
      diff: { avant: { logo_key: entite.logo_key }, apres: { logo_key: null } },
    });

    revalidatePath(`/structure/${entite.id}`);
    return ok();
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-STR-07 — rattachement a un nouveau parent.
 * Le trigger `trg_entities_aiu` propage le nouveau chemin a tout le sous-arbre ;
 * ici on verifie la coherence de niveau, l'absence de cycle et l'habilitation
 * SUR LES DEUX COTES du deplacement.
 */
export async function rattacherEntite(input: unknown): Promise<ActionResult<void>> {
  return executerAction('rattacherEntite', async () => {
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
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-STR-08 / RG-22 — suppression LOGIQUE (corbeille).
 * Le trigger `trg_entities_soft_delete` refuse la suppression d'une entite
 * ayant des sous-entites vivantes ; on l'anticipe pour proposer une
 * desactivation a la place.
 */
export async function supprimerEntite(input: unknown): Promise<ActionResult<void>> {
  return executerAction('supprimerEntite', async () => {
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
  });
}

// -----------------------------------------------------------------------------

/** EF-ADM-10 — restauration depuis la corbeille. */
export async function restaurerEntite(input: unknown): Promise<ActionResult<void>> {
  return executerAction('restaurerEntite', async () => {
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
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-STR-10 / ARB-2 — marque une entite comme depourvue d'acces a
 * l'application, ce qui autorise la saisie financiere deleguee par le Siege.
 */
export async function basculerAccesApplication(
  input: unknown,
): Promise<ActionResult<{ sansAcces: boolean }>> {
  return executerAction('basculerAccesApplication', async () => {
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
  });
}

// -----------------------------------------------------------------------------

/** Libelle d'un type, pour composer les messages cote client. */
export async function libelleType(type: keyof typeof ENTITY_LABELS): Promise<string> {
  return ENTITY_LABELS[type].singulier;
}
