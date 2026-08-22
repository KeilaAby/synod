'use server';

import { revalidatePath } from 'next/cache';

import {
  type BureauComplet,
  chargerBureauxDeEntite,
  chargerCandidat,
  listerCandidats,
  listerFonctions,
} from '@/lib/data/bureaux';
import { getArbrePerimetre } from '@/lib/data/entities';
import { signerPhotos } from '@/lib/data/photos';
import { getParametres } from '@/lib/data/settings';
import {
  type FonctionBureau,
  aReconduire,
  candidatsEligibles,
  memeBureau,
  retraitRecevable,
  validerDesignation,
} from '@/lib/domain/bureau';
import { nomComplet } from '@/lib/domain/croyant';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import {
  auditer,
  requireEntityInScope,
  requirePermission,
  requireSession,
} from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitize } from '@/lib/utils/sanitize';
import {
  cloreMandatSchema,
  compositionEntiteSchema,
  designerMembreSchema,
  dispositionSchema,
  modifierBureauSchema,
  ouvrirMandatSchema,
  remplacerMembreSchema,
  retirerMembreSchema,
  supprimerBureauSchema,
} from '@/lib/validation/bureau';
import { champsEnErreur } from '@/lib/validation/zod-errors';

import { executerAction } from './executer';

/**
 * Bureaux et mandats — EF-BUR-01 a 09, RG-07 a RG-10.
 *
 * Les regles sont tenues a trois endroits, et ce n'est pas de la redondance :
 * le DOMAINE explique le refus a l'utilisateur, la RLS decide qui peut ecrire,
 * les CONTRAINTES et TRIGGERS garantissent l'etat de la base quoi qu'il
 * arrive. Retirer l'un des trois ne rend pas les deux autres suffisants.
 */

function messageErreurSql(erreur: { code?: string; message?: string }): string {
  // RG-08, RG-10 — index uniques partiels.
  if (erreur.code === '23505') {
    if (erreur.message?.includes('bureaux_un_actif_par_nom')) {
      return (
        'RG-10 : un bureau de ce nom est deja ouvert pour cette entite. ' +
        'Choisissez un autre nom, ou renouvelez le mandat existant.'
      );
    }
    if (erreur.message?.includes('membres_fonction_unique')) {
      return 'RG-08 : cette fonction est deja occupee. Remplacez son titulaire.';
    }
    if (erreur.message?.includes('membres_croyant_unique')) {
      return 'Ce croyant occupe deja une fonction dans ce bureau.';
    }
    return 'Cette valeur existe deja.';
  }

  // Les triggers RG-* levent avec un message deja redige pour l'utilisateur.
  if (erreur.message?.includes('RG-') || erreur.message?.includes('fonction')) {
    return erreur.message.split('\n')[0] ?? 'Operation refusee.';
  }

  /**
   * Un nom de contrainte n'est pas un message : « bureaux_periode » ne dit rien
   * a qui a simplement saisi deux dates dans le mauvais ordre. Le tri se fait
   * sur le NOM de la contrainte, jamais sur la forme du texte, qui depend de la
   * langue du serveur.
   */
  if (erreur.code === '23514') {
    if (
      erreur.message?.includes('bureaux_periode') ||
      erreur.message?.includes('membres_periode')
    ) {
      return 'La date de fin ne peut pas preceder la date de debut.';
    }
  }

  /**
   * `fn_clore_bureau` leve avec des messages deja rediges. La RLS emprunte le
   * meme code 42501 avec un texte technique — il faut donc les distinguer,
   * plutot que de tout laisser passer ou de tout masquer.
   */
  if (erreur.code === '02000' || erreur.code === '42501') {
    if (erreur.message && !erreur.message.includes('row-level security')) {
      return erreur.message.split('\n')[0]!;
    }
    return "Vous n'avez pas l'autorisation d'effectuer cette action.";
  }

  return "L'operation n'a pas pu aboutir.";
}

/** Le bureau, son entite et le chemin qui porte la portee du droit (RG-25). */
async function contexteBureau(bureauId: string) {
  const sb = await createClient();

  const { data, error } = await sb
    .from('bureaux')
    .select(
      'id, entity_id, libelle, date_debut, date_fin, is_active, entite:entities!bureaux_entity_id_fkey (path, nom, type)',
    )
    .eq('id', bureauId)
    .is('deleted_at', null)
    .maybeSingle<{
      id: string;
      entity_id: string;
      libelle: string;
      date_debut: string;
      date_fin: string | null;
      is_active: boolean;
      entite: { path: string; nom: string; type: string } | null;
    }>();

  return error || !data?.entite ? null : data;
}

/** Une date `Date` telle que la base l'attend : le jour, sans fuseau. */
function jour(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------

/**
 * EF-BUR-03, EF-STR-04 — la composition des bureaux d'une entite, a la demande.
 *
 * Une LECTURE parmi des ecritures, et c'est deliberé : elle sert un pop-up
 * ouvert depuis l'organigramme, ou la charger avec la page ferait payer a
 * chaque visiteur de la structure ce dont un seul se sert — jusqu'a deux mille
 * croyants et autant d'URL signees, pour une entree de menu rarement cliquee.
 *
 * Les candidats sont filtres ICI par RG-09 : n'expedier que les eligibles
 * reduit la charge utile, et evite au client de refaire une regle de perimetre
 * qu'il n'a pas a connaitre.
 */
export interface CompositionEntite {
  bureaux: BureauComplet[];
  fonctions: FonctionBureau[];
  candidats: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    photoKey: string | null;
    statut: string;
    cheminEglise: string;
  }[];
  photos: Record<string, string>;
}

export async function chargerCompositionEntite(
  input: unknown,
): Promise<ActionResult<CompositionEntite>> {
  return executerAction('chargerCompositionEntite', async () => {
    const session = await requireSession();

    const analyse = compositionEntiteSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    const arbre = await getArbrePerimetre();
    if (arbre.length === 0) {
      return ko("La structure n'a pas pu etre chargee. Verifiez votre connexion.");
    }

    const entite = arbre.find((e) => e.id === analyse.data.entityId);
    if (!entite) return ko('Cette entite est introuvable ou hors de votre perimetre.');

    await requireEntityInScope(session, entite.path);

    const [bureaux, fonctions, candidats] = await Promise.all([
      chargerBureauxDeEntite(entite.id),
      listerFonctions(),
      listerCandidats(),
    ]);

    // RG-09 — seuls les croyants du sous-arbre de l'entite peuvent y sieger.
    const eligibles = candidatsEligibles(
      candidats.map((c) => ({
        croyantId: c.id,
        nom: nomComplet(c.nom, c.prenom),
        cheminEglise: c.eglise?.path ?? '',
        statut: c.statut,
      })),
      entite.path,
    );
    const parId = new Map(candidats.map((c) => [c.id, c]));

    const retenus = eligibles
      .map((e) => parId.get(e.croyantId))
      .filter((c) => c !== undefined);

    // Une seule signature pour tout le pop-up : titulaires ET candidats.
    const photos = await signerPhotos([
      ...bureaux.flatMap((b) => b.membres.map((m) => m.croyant?.photo_key)),
      ...retenus.map((c) => c.photo_key),
    ]);

    return ok({
      bureaux,
      fonctions,
      candidats: retenus.map((c) => ({
        id: c.id,
        nom: c.nom,
        prenom: c.prenom,
        matricule: c.matricule,
        photoKey: c.photo_key,
        statut: c.statut,
        cheminEglise: c.eglise?.path ?? '',
      })),
      photos: Object.fromEntries(photos),
    });
  });
}

// -----------------------------------------------------------------------------

export async function ouvrirMandat(input: unknown): Promise<ActionResult<{ id: string }>> {
  return executerAction('ouvrirMandat', async () => {
    const session = await requireSession();

    const analyse = ouvrirMandatSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const sb = await createClient();

    /**
     * Les deux lectures partent ENSEMBLE — ENF-PRF-01.
     *
     * Elles ne dependent que de `data.entityId`, connu des la validation : les
     * enchainer ajoutait un aller-retour complet a chaque ouverture. Sur un
     * lien lointain, un aller-retour se mesure en centaines de millisecondes —
     * ce qui coute, ce n'est pas la duree de l'un mais leur NOMBRE.
     *
     * RG-10 — on ne clot QUE le mandat du MEME bureau. Une entite fait
     * coexister un « Bureau executif », un « Comite des finances », une
     * « Commission des jeunes » : ouvrir le second ne doit pas demettre le
     * premier. Ouvrir un bureau du meme nom, en revanche, est un
     * RENOUVELLEMENT : le mandat precedent se clot, et sa composition peut etre
     * reconduite.
     */
    const [arbre, actifs] = await Promise.all([
      getArbrePerimetre(),
      sb
        .from('bureaux')
        .select(
          'id, libelle, bureau_membres!bureau_membres_bureau_id_fkey (id, croyant_id, fonction_id, date_fin)',
        )
        .eq('entity_id', data.entityId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .returns<
          {
            id: string;
            libelle: string;
            bureau_membres: {
              id: string;
              croyant_id: string;
              fonction_id: string;
              date_fin: string | null;
            }[];
          }[]
        >(),
    ]);

    if (arbre.length === 0) {
      return ko("La structure n'a pas pu etre chargee. Verifiez votre connexion.");
    }

    const entite = arbre.find((e) => e.id === data.entityId);
    if (!entite) return ko('Cette entite est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'bureau.manage', entite.path);

    const precedent =
      (actifs.data ?? []).find((b) => memeBureau(b.libelle, data.libelle)) ?? null;

    if (precedent) {
      const veille = new Date(data.dateDebut);
      veille.setDate(veille.getDate() - 1);

      /**
       * La cloture passe par la fonction : elle borne la date au debut du
       * mandat. Renouveler le jour meme de l'ouverture donnerait sinon une
       * veille anterieure au debut, que la contrainte de periode refuse.
       *
       * L'ordre — clore puis creer — est impose par l'index unique, qui
       * n'admet pas deux bureaux actifs du meme nom. Si la creation echouait
       * ensuite, le precedent resterait clos sans successeur : etat visible a
       * l'ecran et rattrapable en rouvrant, donc laisse tel quel (regle 20).
       */
      const { error: erreurCloture } = await sb.rpc('fn_clore_bureau', {
        p_bureau: precedent.id,
        p_date: jour(veille),
      });

      if (erreurCloture) return ko(messageErreurSql(erreurCloture));
    }

    const { data: cree, error } = await sb
      .from('bureaux')
      .insert({
        entity_id: data.entityId,
        libelle: sanitize(data.libelle),
        date_debut: jour(data.dateDebut),
        date_fin: data.dateFin ? jour(data.dateFin) : null,
        created_by: session.profileId,
      })
      .select('id')
      .single<{ id: string }>();

    if (error) return ko(messageErreurSql(error));

    // EF-BUR-09 — reconduction : seuls les mandats EN COURS a la cloture sont
    // repris. Reprendre les mandats deja clos ressusciterait des titulaires
    // remplaces en cours de route.
    if (data.reconduire && precedent) {
      const repris = aReconduire(
        precedent.bureau_membres.map((m) => ({
          id: m.id,
          croyantId: m.croyant_id,
          fonctionId: m.fonction_id,
          dateDebut: '',
          // La cloture vient d'etre ecrite : on raisonne sur l'etat d'AVANT.
          dateFin: null,
        })),
      );

      if (repris.length > 0) {
        await sb.from('bureau_membres').insert(
          repris.map((m) => ({
            bureau_id: cree.id,
            croyant_id: m.croyantId,
            fonction_id: m.fonctionId,
            date_debut: jour(data.dateDebut),
            created_by: session.profileId,
          })),
        );
      }
    }

    await auditer({
      session,
      action: 'CREATE',
      table: 'bureaux',
      recordId: cree.id,
      entityId: data.entityId,
      diff: {
        apres: { libelle: data.libelle, debut: jour(data.dateDebut) },
        avant: precedent ? { bureauClos: precedent.id } : undefined,
      },
    });

    revalidatePath('/bureaux');
    revalidatePath(`/structure/${data.entityId}`);
    return ok(cree);
  });
}

// -----------------------------------------------------------------------------

export async function cloreMandat(input: unknown): Promise<ActionResult<void>> {
  return executerAction('cloreMandat', async () => {
    const session = await requireSession();

    const analyse = cloreMandatSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }

    const contexte = await contexteBureau(analyse.data.bureauId);
    if (!contexte) return ko('Ce bureau est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'bureau.manage', contexte.entite!.path);

    const demande = jour(analyse.data.dateFin);
    const sb = await createClient();

    /**
     * Clore le bureau ET les mandats de ses titulaires est UNE operation. En
     * deux appels HTTP, un echec entre les deux laisserait un bureau clos
     * peuple de mandats en cours : rien ne l'afficherait, rien ne le
     * rattraperait (regle 20). La fonction borne aussi la date au debut du
     * mandat — clore le jour de l'ouverture est legitime, la veille ne l'est
     * pas.
     */
    const { data: mandatsClos, error } = await sb.rpc('fn_clore_bureau', {
      p_bureau: contexte.id,
      p_date: demande,
    });

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'bureaux',
      recordId: contexte.id,
      entityId: contexte.entity_id,
      diff: {
        avant: { statut: 'en cours', date_fin: contexte.date_fin },
        apres: { statut: 'clos', date_fin: demande, mandatsClos: mandatsClos ?? 0 },
      },
    });

    revalidatePath('/bureaux');
    revalidatePath('/croyants');
    return ok();
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-BUR-02 — modification d'un bureau : son nom et ses dates.
 *
 * Le meme pop-up que la creation le porte (regle 16). Ce qui n'y figure pas
 * n'est pas un oubli : l'entite de rattachement est fixee a l'ouverture — la
 * deplacer invaliderait RG-09 pour tous ses titulaires — et le cycle de vie a
 * ses propres chemins, clore et supprimer.
 */
export async function modifierBureau(input: unknown): Promise<ActionResult<void>> {
  return executerAction('modifierBureau', async () => {
    const session = await requireSession();

    const analyse = modifierBureauSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const contexte = await contexteBureau(data.bureauId);
    if (!contexte) return ko('Ce bureau est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'bureau.manage', contexte.entite!.path);

    const sb = await createClient();

    // Regle 19 — l'action n'ecrit QUE les champs dont le formulaire est la
    // source. `entity_id`, `is_active` et `deleted_at` n'en font pas partie.
    const { error } = await sb
      .from('bureaux')
      .update({
        libelle: sanitize(data.libelle),
        date_debut: jour(data.dateDebut),
        date_fin: data.dateFin ? jour(data.dateFin) : null,
      })
      .eq('id', contexte.id);

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'bureaux',
      recordId: contexte.id,
      entityId: contexte.entity_id,
      diff: {
        avant: {
          libelle: contexte.libelle,
          date_debut: contexte.date_debut,
          date_fin: contexte.date_fin,
        },
        apres: {
          libelle: data.libelle,
          date_debut: jour(data.dateDebut),
          date_fin: data.dateFin ? jour(data.dateFin) : null,
        },
      },
    });

    revalidatePath('/bureaux');
    revalidatePath(`/structure/${contexte.entity_id}`);
    return ok();
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-BUR-08 — SUPPRESSION d'un bureau, a distinguer de la cloture.
 *
 * Clore conserve : l'historique reste lisible sur la fiche de chaque ancien
 * titulaire. Supprimer efface — les mandats individuels partent en cascade et
 * les fonctions occupees disparaissent des frises. C'est pourquoi l'operation
 * exige `bureau.delete`, un droit distinct et non delegable.
 */
export async function supprimerBureau(input: unknown): Promise<ActionResult<void>> {
  return executerAction('supprimerBureau', async () => {
    const session = await requireSession();

    const analyse = supprimerBureauSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    const contexte = await contexteBureau(analyse.data.bureauId);
    if (!contexte) return ko('Ce bureau est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'bureau.delete', contexte.entite!.path);

    /**
     * EF-BUR-08 — UN BUREAU CLOS EST ARCHIVE, JAMAIS SUPPRIME.
     *
     * Le refus est aussi en base (`trg_bureau_clos_immuable`, migration 0059),
     * et c'est lui qui protege vraiment. Ici, on le dit AVANT d'ecrire : le
     * message de la base est exact mais technique, et l'utilisateur merite
     * d'apprendre la regle plutot que de lire une contrainte.
     *
     * La suppression reste ouverte sur un bureau EN COURS : elle rattrape une
     * ouverture faite par erreur, et rien n'en depend encore.
     */
    if (!contexte.is_active) {
      return ko(
        'Un bureau clos ne se supprime pas : sa composition est citee par des '
          + 'rapports, des recus et le journal d\'audit. Il reste consultable '
          + 'dans les archives.',
      );
    }

    const sb = await createClient();

    // L'audit est ecrit AVANT la suppression : apres, il n'y aurait plus rien
    // a decrire, et c'est precisement le genre d'operation dont on veut
    // retrouver la trace.
    const { count } = await sb
      .from('bureau_membres')
      .select('id', { count: 'exact', head: true })
      .eq('bureau_id', contexte.id);

    await auditer({
      session,
      action: 'DELETE',
      table: 'bureaux',
      recordId: contexte.id,
      entityId: contexte.entity_id,
      diff: {
        avant: {
          libelle: contexte.libelle,
          mandatsIndividuelsEffaces: count ?? 0,
        },
      },
    });

    const { error } = await sb.from('bureaux').delete().eq('id', contexte.id);
    if (error) return ko(messageErreurSql(error));

    revalidatePath('/bureaux');
    revalidatePath('/croyants');
    return ok();
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-BUR-07 — enregistrement de la disposition de l'organigramme.
 *
 * TOUT LE PLAN D'UN COUP, et non un appel par bloc deplace. Les gestes
 * s'enchainent — deplacer, relier, redeplacer — et des ecritures independantes
 * laisseraient des etats ou un trait pointe vers un bloc dont la position n'est
 * pas encore enregistree. Un seul `upsert` rend l'ensemble coherent ou rien.
 *
 * Ce n'est PAS une mutation metier : elle ne change ni qui siege, ni depuis
 * quand. L'audit garde donc une seule ligne par enregistrement, sans detailler
 * des coordonnees que personne ne relira.
 */
export async function enregistrerDisposition(input: unknown): Promise<ActionResult<void>> {
  return executerAction('enregistrerDisposition', async () => {
    const session = await requireSession();

    const analyse = dispositionSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Disposition invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const contexte = await contexteBureau(data.bureauId);
    if (!contexte) return ko('Ce bureau est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'bureau.manage', contexte.entite!.path);

    // Le domaine a deja refuse les boucles a l'ecran ; le trigger les refuse en
    // base. Ce controle-ci ecarte le cas ou les deux auraient ete contournes —
    // un appel direct a l'action.
    const vus = new Set<string>();
    for (const poste of data.postes) {
      if (vus.has(poste.fonctionId)) {
        return ko('Une fonction ne peut figurer deux fois dans un organigramme.');
      }
      vus.add(poste.fonctionId);
    }

    const sb = await createClient();

    if (data.postes.length > 0) {
      const { error } = await sb.from('bureau_postes').upsert(
        data.postes.map((poste) => ({
          bureau_id: contexte.id,
          fonction_id: poste.fonctionId,
          parent_fonction_id: poste.parentFonctionId,
          pos_x: poste.x,
          pos_y: poste.y,
          // EF-BUR-07 — un adjoint se dessine A COTE DU TRONC. Le drapeau ne
          // change ni la parente ni le niveau : seulement le placement.
          en_derivation: poste.enDerivation,
          updated_by: session.profileId,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'bureau_id,fonction_id' },
      );

      if (error) return ko(messageErreurSql(error));
    }

    // Un bloc retire du plan doit disparaitre de la base : sans cela, il
    // reviendrait au prochain chargement, et l'utilisateur croirait son geste
    // perdu.
    const conserves = data.postes.map((p) => p.fonctionId);
    const retrait = sb.from('bureau_postes').delete().eq('bureau_id', contexte.id);

    const { error: erreurRetrait } = await (conserves.length > 0
      ? retrait.not('fonction_id', 'in', `(${conserves.join(',')})`)
      : retrait);

    if (erreurRetrait) return ko(messageErreurSql(erreurRetrait));

    await auditer({
      session,
      action: 'UPDATE',
      table: 'bureau_postes',
      recordId: contexte.id,
      entityId: contexte.entity_id,
      diff: { apres: { postes: data.postes.length } },
    });

    /**
     * PAS de `revalidatePath` — et c'est la correction du 9 aout.
     *
     * Une disposition ne s'affiche que dans l'editeur, qui la porte deja a
     * l'ecran : revalider forcait un rendu serveur complet de la page APRES
     * chaque geste, et l'enregistrement passait de quelques centaines de
     * millisecondes a plusieurs secondes. On ne revalide pas ce que personne
     * d'autre ne regarde.
     */
    return ok();
  });
}

// -----------------------------------------------------------------------------

export async function designerMembre(input: unknown): Promise<ActionResult<void>> {
  return executerAction('designerMembre', async () => {
    const session = await requireSession();

    const analyse = designerMembreSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const contexte = await contexteBureau(data.bureauId);
    if (!contexte) return ko('Ce bureau est introuvable ou hors de votre perimetre.');
    if (!contexte.is_active) return ko('Ce mandat est clos : sa composition ne change plus.');

    await requirePermission(session, 'bureau.manage', contexte.entite!.path);

    /**
     * UN croyant, et non toute la liste des candidats.
     *
     * `listerCandidats` lit jusqu'a deux mille lignes : le prix se justifie pour
     * peupler un ecran, pas pour valider une personne. La designation y passait
     * neuf secondes — mesurees le 9 aout — a lire des gens dont elle n'avait que
     * faire.
     */
    const [fonctions, croyant] = await Promise.all([
      listerFonctions(),
      chargerCandidat(data.croyantId),
    ]);

    const fonction = fonctions.find((f) => f.id === data.fonctionId);

    if (!fonction) return ko('Cette fonction est introuvable.');
    if (!croyant?.eglise) return ko('Ce croyant est introuvable ou hors de votre perimetre.');

    const sb = await createClient();
    const { data: enCours } = await sb
      .from('bureau_membres')
      .select('id, croyant_id, fonction_id, date_debut, date_fin')
      .eq('bureau_id', data.bureauId)
      .is('date_fin', null)
      .returns<
        { id: string; croyant_id: string; fonction_id: string; date_debut: string; date_fin: null }[]
      >();

    // Le domaine explique le refus AVANT que la contrainte SQL ne le prononce :
    // « RG-08 : cette fonction est deja occupee » vaut mieux qu'une violation
    // d'index unique.
    const verdict = validerDesignation(
      {
        croyantId: croyant.id,
        nom: nomComplet(croyant.nom, croyant.prenom),
        cheminEglise: croyant.eglise.path,
        statut: croyant.statut,
      },
      fonction,
      contexte.entite!.path,
      contexte.entite!.type as Parameters<typeof validerDesignation>[3],
      (enCours ?? []).map((m) => ({
        id: m.id,
        croyantId: m.croyant_id,
        fonctionId: m.fonction_id,
        dateDebut: m.date_debut,
        dateFin: null,
      })),
    );
    if (!verdict.ok) return ko(verdict.error);

    const { error } = await sb.from('bureau_membres').insert({
      bureau_id: data.bureauId,
      croyant_id: data.croyantId,
      fonction_id: data.fonctionId,
      notes: data.notes ? sanitize(data.notes) : null,
      created_by: session.profileId,
    });

    if (error) return ko(messageErreurSql(error));

    await auditer({
      session,
      action: 'CREATE',
      table: 'bureau_membres',
      recordId: data.bureauId,
      entityId: contexte.entity_id,
      diff: {
        apres: {
          croyant: nomComplet(croyant.nom, croyant.prenom),
          fonction: fonction.libelle,
        },
      },
    });

    revalidatePath('/bureaux');
    revalidatePath(`/croyants/${data.croyantId}`);
    return ok();
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-BUR-08 — remplacement : cloture du mandat individuel ET designation du
 * suivant. Les separer laisserait la fonction vacante entre les deux, et un
 * remplacement interrompu ressemblerait a un retrait.
 */
export async function remplacerMembre(input: unknown): Promise<ActionResult<void>> {
  return executerAction('remplacerMembre', async () => {
    const session = await requireSession();

    const analyse = remplacerMembreSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const sb = await createClient();
    const { data: membre } = await sb
      .from('bureau_membres')
      .select('id, bureau_id, croyant_id, fonction_id, date_fin')
      .eq('id', data.membreId)
      .maybeSingle<{
        id: string;
        bureau_id: string;
        croyant_id: string;
        fonction_id: string;
        date_fin: string | null;
      }>();

    if (!membre) return ko('Ce mandat est introuvable.');
    if (membre.date_fin) return ko('Ce mandat est deja clos.');

    const contexte = await contexteBureau(membre.bureau_id);
    if (!contexte) return ko('Ce bureau est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'bureau.manage', contexte.entite!.path);

    const jour = new Date().toISOString().slice(0, 10);

    const { error: erreurCloture } = await sb
      .from('bureau_membres')
      .update({ date_fin: jour })
      .eq('id', membre.id);

    if (erreurCloture) return ko(messageErreurSql(erreurCloture));

    const { error } = await sb.from('bureau_membres').insert({
      bureau_id: membre.bureau_id,
      croyant_id: data.croyantId,
      fonction_id: membre.fonction_id,
      date_debut: jour,
      notes: data.notes ? sanitize(data.notes) : null,
      created_by: session.profileId,
    });

    if (error) {
      // La designation a echoue : on rouvre le mandat precedent plutot que de
      // laisser la fonction vacante sans que personne ne l'ait voulu.
      await sb.from('bureau_membres').update({ date_fin: null }).eq('id', membre.id);
      return ko(messageErreurSql(error));
    }

    await auditer({
      session,
      action: 'UPDATE',
      table: 'bureau_membres',
      recordId: membre.bureau_id,
      entityId: contexte.entity_id,
      diff: { avant: { croyant: membre.croyant_id }, apres: { croyant: data.croyantId } },
    });

    revalidatePath('/bureaux');
    revalidatePath(`/croyants/${membre.croyant_id}`);
    revalidatePath(`/croyants/${data.croyantId}`);
    return ok();
  });
}

// -----------------------------------------------------------------------------

/** Retrait : le mandat individuel se CLOT, il ne s'efface pas (EF-BUR-08). */
export async function retirerMembre(input: unknown): Promise<ActionResult<void>> {
  return executerAction('retirerMembre', async () => {
    const session = await requireSession();

    const analyse = retirerMembreSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');

    const sb = await createClient();
    const { data: membre } = await sb
      .from('bureau_membres')
      .select('id, bureau_id, croyant_id, date_fin, created_at')
      .eq('id', analyse.data.membreId)
      .maybeSingle<{
        id: string;
        bureau_id: string;
        croyant_id: string;
        date_fin: string | null;
        created_at: string;
      }>();

    if (!membre) return ko('Ce mandat est introuvable.');
    if (membre.date_fin) return ko('Ce mandat est deja clos.');

    const contexte = await contexteBureau(membre.bureau_id);
    if (!contexte) return ko('Ce bureau est introuvable ou hors de votre perimetre.');

    await requirePermission(session, 'bureau.manage', contexte.entite!.path);

    /**
     * EF-BUR-08 — LE DELAI SE VERIFIE ICI, LU A CET INSTANT.
     *
     * Le pop-up ne propose « erreur d'assignation » que dans le delai, mais un
     * menu masque ne ferme rien : la Server Action s'appelle sans passer par
     * l'ecran qui la propose. Et ce qui est en jeu est un EFFACEMENT — le
     * refus se corrige, la ligne effacee non.
     *
     * `getParametres()` est appele ICI et non plus haut dans la fonction : un
     * onglet reste parfois ouvert pendant qu'on resserre le delai en
     * administration, et c'est la valeur AU MOMENT DE L'ECRITURE qui doit
     * trancher (regle 21) — jamais celle lue au premier rendu du pop-up.
     */
    const { jours_correction_saisie: joursDelai } = await getParametres();
    const recevable = retraitRecevable(
      analyse.data.nature,
      analyse.data.motif,
      membre.created_at,
      joursDelai,
    );
    if (!recevable.ok) return ko(recevable.raison);

    /**
     * DEUX GESTES, DEUX ECRITURES DIFFERENTES.
     *
     * ERREUR -> la ligne est SUPPRIMEE. Rien n'entre dans l'historique du
     * croyant, parce qu'il ne s'est rien passe dans sa vie : on a tape le
     * mauvais nom. Un mandat d'un jour laisse dans sa frise se lirait un jour
     * comme une destitution, et personne ne saurait dire le contraire.
     *
     * DECISION -> le mandat est CLOS, motif compris. La trace est le but.
     */
    const { error } =
      analyse.data.nature === 'ERREUR'
        ? await sb.from('bureau_membres').delete().eq('id', membre.id)
        : await sb
            .from('bureau_membres')
            .update({
              date_fin: new Date().toISOString().slice(0, 10),
              motif_retrait: analyse.data.motif ? sanitize(analyse.data.motif) : null,
            })
            .eq('id', membre.id);

    if (error) return ko(messageErreurSql(error));

    /**
     * L'AUDIT GARDE CE QUE LA FICHE PERD.
     *
     * Un retrait pour erreur efface la ligne : le journal devient alors la
     * SEULE trace que cette designation a existe, et qu'on l'a retiree. C'est
     * exactement ce qu'on veut — rien sur la fiche du croyant, tout dans le
     * journal, ou seul un administrateur va chercher.
     */
    await auditer({
      session,
      action: analyse.data.nature === 'ERREUR' ? 'DELETE' : 'UPDATE',
      table: 'bureau_membres',
      recordId: membre.bureau_id,
      entityId: contexte.entity_id,
      diff: {
        avant: { croyant: membre.croyant_id },
        apres:
          analyse.data.nature === 'ERREUR'
            ? { mandat: 'efface (erreur d assignation)' }
            : { mandat: 'clos' },
        motif: analyse.data.motif,
      },
    });

    revalidatePath('/bureaux');
    revalidatePath(`/croyants/${membre.croyant_id}`);
    return ok();
  });
}
