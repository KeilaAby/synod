'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ALL_PERMISSIONS } from '@/lib/domain/permissions';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitizeAll } from '@/lib/utils/sanitize';
import { champsEnErreur } from '@/lib/validation/zod-errors';

import { executerAction } from './executer';

/**
 * Les profils de privilèges — EF-ADM-05.
 *
 * DEUX PORTÉES, DEUX HABILITATIONS, JAMAIS CHOISIES PAR LE FORMULAIRE. Un
 * profil GLOBAL (`entity_id null`) engage toute l'organisation — il apparaît
 * dans le formulaire de compte de CHAQUE entité — et reste réservé au Siège
 * via `settings.manage`, non délégable. Un profil LOCAL (`entity_id`
 * renseigné) n'appartient qu'à SA propre entité, et se compose avec
 * `permission.delegate` — la même habilitation qui gouverne déjà la
 * délégation de droits à un compte (RG-24), cohérente avec la RLS de
 * `permission_profiles` (migration `0008`) qui l'exige déjà.
 *
 * « CHAQUE ENTITÉ GÈRE LES SIENS » — décision de l'utilisateur le 23 août
 * 2026 : un profil local ne se compose QUE pour l'entité de rattachement de
 * son auteur, jamais pour une entité descendante. Volontairement plus étroit
 * que la RLS elle-même (qui autoriserait tout le périmètre via
 * `entity_in_scope`) : la défense en profondeur peut être plus stricte que
 * le dernier rempart, jamais plus large.
 */

/** Un texte vide vaut ABSENT, jamais chaine vide (regle 12). */
const optionnel = z
  .preprocess((v) => {
    const normalise = typeof v === 'string' ? v.trim() : v;
    return normalise === '' || normalise === null ? undefined : normalise;
  }, z.string().max(200).optional())
  .transform((v) => v ?? null);

const profilSchema = z.object({
  /** Absent : creation. Present : modification. */
  id: z.union([z.uuid(), z.null()]).default(null),
  nom: z.string().trim().min(2, 'Le nom du profil est requis.').max(80),
  description: optionnel,
  permissions: z.array(z.string()).max(64).default([]),
  /**
   * `null` : profil GLOBAL (Siège). Renseigné : profil LOCAL, à l'entité de
   * rattachement de l'auteur — vérifié côté serveur, jamais fait confiance
   * au client au-delà de la création (voir `enregistrerProfil`).
   */
  entityId: z.union([z.uuid(), z.null()]).default(null),
});

/**
 * EF-ADM-05 — enregistrer un profil de privilèges.
 *
 * UN PROFIL N'ACCORDE RIEN PAR LUI-MEME. Il ne fait que POSER des cases dans le
 * formulaire d'un compte ; c'est ce formulaire, et lui seul, qui vérifie
 * `peutDeleguer` droit par droit. On peut donc définir ici un profil plus large
 * que ce qu'un administrateur de district pourra en tirer : chez lui, les
 * droits hors de sa portée resteront simplement éteints.
 *
 * LA PORTÉE EXISTANTE FAIT AUTORITÉ POUR UNE MODIFICATION, PAS CELLE ENVOYÉE
 * PAR LE FORMULAIRE (règle 19, dans l'autre sens) : `entity_id` n'est écrit
 * qu'à la CRÉATION. Modifier un profil ne le fait jamais changer de
 * propriétaire — l'habilitation nécessaire se lit sur ce que le profil EST
 * déjà, récupéré en base, pas sur ce que le client prétend.
 */
export async function enregistrerProfil(input: unknown): Promise<ActionResult<void>> {
  return executerAction('enregistrerProfil', async () => {
    const session = await requireSession();

    const analyse = profilSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const v = analyse.data;

    const sb = await createClient();

    let entityId = v.entityId;
    if (v.id) {
      const { data: existant } = await sb
        .from('permission_profiles')
        .select('entity_id')
        .eq('id', v.id)
        .maybeSingle<{ entity_id: string | null }>();
      if (!existant) return ko('Ce profil est introuvable.');
      entityId = existant.entity_id;
    }

    if (entityId === null) {
      await requirePermission(session, 'settings.manage');
      if (session.entiteType !== 'SIEGE') {
        return ko(
          'Les profils de privilèges communs à toute l’organisation se définissent ' +
            'au Siège. Composez un profil propre à votre entité depuis ' +
            '« Profils de privilèges », dans Administration.',
        );
      }
    } else {
      await requirePermission(session, 'permission.delegate');
      if (entityId !== session.entityId) {
        return ko('Un profil local ne se compose que pour votre propre entité.');
      }
    }

    // Un droit inconnu vient d'une version anterieure : on l'ecarte plutot que
    // de le conserver, sinon il resterait dans la colonne sans jamais servir.
    const permissions = v.permissions.filter((p) =>
      (ALL_PERMISSIONS as readonly string[]).includes(p),
    );

    const donnees = sanitizeAll({
      nom: v.nom,
      description: v.description,
      permissions,
    });

    const { error } = v.id
      ? await sb.from('permission_profiles').update(donnees).eq('id', v.id)
      : await sb.from('permission_profiles').insert({
          ...donnees,
          entity_id: v.entityId,
          created_by: session.profileId,
        });

    if (error) return ko("Le profil n'a pas pu etre enregistre.");

    await auditer({
      session,
      action: v.id ? 'UPDATE' : 'CREATE',
      table: 'permission_profiles',
      recordId: v.id ?? undefined,
      entityId: entityId ?? undefined,
      diff: { apres: donnees },
    });

    revalidatePath('/administration/parametres');
    revalidatePath('/administration/profils');
    return ok();
  });
}

/**
 * EF-ADM-05 — supprimer un profil.
 *
 * SANS CONSEQUENCE SUR LES COMPTES. Un profil pose des droits, il ne les
 * detient pas : les comptes qui en ont beneficie gardent les leurs, inscrits
 * un par un dans leurs habilitations. C'est precisement ce qui distingue un
 * raccourci d'un role — et ce qui rend cette suppression sans danger.
 *
 * L'HABILITATION SE LIT SUR LE PROFIL LUI-MÊME, comme pour l'enregistrement :
 * global → Siège (`settings.manage`) ; local → sa propre entité
 * (`permission.delegate`).
 */
export async function supprimerProfil(input: unknown): Promise<ActionResult<void>> {
  return executerAction('supprimerProfil', async () => {
    const session = await requireSession();

    const analyse = z.object({ id: z.uuid() }).safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    const sb = await createClient();
    const { data: profil } = await sb
      .from('permission_profiles')
      .select('entity_id')
      .eq('id', analyse.data.id)
      .maybeSingle<{ entity_id: string | null }>();
    if (!profil) return ko('Ce profil est introuvable.');

    if (profil.entity_id === null) {
      await requirePermission(session, 'settings.manage');
      if (session.entiteType !== 'SIEGE') {
        return ko(
          'Les profils communs à toute l’organisation se définissent au Siège : ' +
            'seul lui peut en retirer un.',
        );
      }
    } else {
      await requirePermission(session, 'permission.delegate');
      if (profil.entity_id !== session.entityId) {
        return ko('Vous ne pouvez retirer qu’un profil propre à votre entité.');
      }
    }

    await auditer({
      session,
      action: 'DELETE',
      table: 'permission_profiles',
      recordId: analyse.data.id,
      entityId: profil.entity_id ?? undefined,
    });

    const { error } = await sb
      .from('permission_profiles')
      .delete()
      .eq('id', analyse.data.id);

    if (error) return ko("Le profil n'a pas pu etre supprime.");

    revalidatePath('/administration/parametres');
    revalidatePath('/administration/profils');
    return ok();
  });
}
