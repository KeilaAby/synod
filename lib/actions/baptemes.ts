'use server';

import { revalidatePath } from 'next/cache';

import { chercherDoublons, chercherDoublonsLot } from '@/lib/data/croyants';
import { getArbrePerimetre } from '@/lib/data/entities';
import { doublonsInternes } from '@/lib/domain/bapteme-lot';
import { cleDoublon, nomComplet } from '@/lib/domain/croyant';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitize } from '@/lib/utils/sanitize';
import { saisirBaptiseSchema, saisirLotSchema } from '@/lib/validation/bapteme';
import { champsEnErreur } from '@/lib/validation/zod-errors';

import { executerAction } from './executer';

/**
 * Saisie d'un nouveau baptise — EF-BAP-01 a 03, RG-30.
 *
 * EF-BAP-02 : la saisie CREE le croyant, il n'y a pas de double saisie.
 *
 * DEUX ECRITURES, PAS DE TRANSACTION — et c'est assume, contrairement au
 * transfert. La difference tient a la nature de l'etat intermediaire :
 *
 *   - un transfert a moitie applique laisse un croyant deplace sans trace, ou
 *     un transfert clos sans effet : deux etats FAUX, et indetectables ;
 *   - un bapteme a moitie saisi laisse un croyant CORRECT, avec sa
 *     `date_bapteme` — donc compte dans les indicateurs (RG-30) — auquel il
 *     manque seulement le lieu et les celebrants.
 *
 * Le second est benin et rattrapable ; il ne justifie pas de dupliquer en SQL
 * toute la validation du croyant. L'action le DIT plutot que de le taire.
 */

function messageErreurSql(erreur: { code?: string; message?: string }): string {
  if (erreur.code === '23505') {
    return 'Un bapteme est deja enregistre pour ce croyant.';
  }
  if (erreur.code === '23503') {
    return "L'eglise, la cellule, le grade ou la nationalite indique est introuvable.";
  }
  if (erreur.message?.includes('RG-')) {
    return erreur.message.split('\n')[0] ?? 'Operation refusee.';
  }
  return "L'operation n'a pas pu aboutir.";
}

export async function saisirBaptise(
  input: unknown,
): Promise<ActionResult<{ croyantId: string; matricule: string; ceremonieEnregistree: boolean }>> {
  return executerAction('saisirBaptise', async () => {
    const session = await requireSession();

    const analyse = saisirBaptiseSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const arbre = await getArbrePerimetre();

    // Une absence de donnees n'est pas un refus de droit : un arbre vide
    // signale une panne de lecture, pas un perimetre vide.
    if (arbre.length === 0) {
      return ko(
        "La structure n'a pas pu etre chargee. Verifiez votre connexion, puis reessayez.",
      );
    }

    const eglise = arbre.find((e) => e.id === data.egliseId);
    if (!eglise) return ko('Cette eglise est introuvable ou hors de votre perimetre.');
    if (eglise.type !== 'EGLISE') {
      return ko('RG-04 : le rattachement principal doit etre une Eglise.');
    }

    // RG-05 — la cellule doit appartenir a l'eglise du bapteme.
    if (data.celluleId) {
      const cellule = arbre.find((e) => e.id === data.celluleId);
      if (!cellule || cellule.type !== 'CELLULE') return ko('Cette cellule est introuvable.');
      if (cellule.parent_id !== data.egliseId) {
        return ko(
          `RG-05 : la cellule « ${cellule.nom} » n'appartient pas a l'eglise « ${eglise.nom} ».`,
        );
      }
    }

    // Saisir un baptise, c'est CREER un croyant : les deux droits sont exiges,
    // avec la portee de l'eglise (RG-25).
    await requirePermission(session, 'bapteme.create', eglise.path);
    await requirePermission(session, 'croyant.create', eglise.path);

    // EF-CRO-13 — on avertit sans bloquer : deux homonymes nes le meme jour
    // existent reellement, et une ceremonie collective en produit.
    const doublons = await chercherDoublons(data.nom, data.prenom, data.dateNaissance);
    if (doublons.length > 0) {
      const premier = doublons[0]!;
      return ko(
        `${nomComplet(premier.nom, premier.prenom)} est deja enregistre avec la meme ` +
          `date de naissance (matricule ${premier.matricule}). ` +
          'Enregistrez son bapteme depuis sa fiche plutot que de creer un doublon.',
      );
    }

    const sb = await createClient();

    const { data: croyant, error: erreurCroyant } = await sb
      .from('croyants')
      .insert({
        nom: sanitize(data.nom),
        prenom: sanitize(data.prenom),
        sexe: data.sexe,
        telephone: data.telephone,
        date_naissance: data.dateNaissance.toISOString().slice(0, 10),
        date_bapteme: data.dateBapteme.toISOString().slice(0, 10),
        adresse: sanitize(data.adresse),
        eglise_id: data.egliseId,
        cellule_id: data.celluleId ?? null,
        grade_id: data.gradeId,
        nationalite_id: data.nationaliteId,
        saisi_par: session.profileId,
        saisi_depuis: session.entityId,
        // `matricule` omis : un trigger BEFORE le renseigne, seule la base
        // garantissant l'unicite de la sequence.
      })
      .select('id, matricule')
      .single<{ id: string; matricule: string }>();

    if (erreurCroyant) return ko(messageErreurSql(erreurCroyant));

    await auditer({
      session,
      action: 'CREATE',
      table: 'croyants',
      recordId: croyant.id,
      entityId: data.egliseId,
      diff: {
        apres: {
          nom: data.nom,
          prenom: data.prenom,
          matricule: croyant.matricule,
          origine: 'bapteme',
        },
      },
    });

    // --- La ceremonie (EF-BAP-03) ---
    const { data: bapteme, error: erreurBapteme } = await sb
      .from('baptemes')
      .insert({
        croyant_id: croyant.id,
        entity_id: data.egliseId,
        date_bapteme: data.dateBapteme.toISOString().slice(0, 10),
        lieu: data.lieu ? sanitize(data.lieu) : null,
        session_libelle: data.sessionLibelle ? sanitize(data.sessionLibelle) : null,
        saisi_par: session.profileId,
      })
      .select('id')
      .single<{ id: string }>();

    // Les celebrants vivent dans une table de liaison : plusieurs par ceremonie.
    if (!erreurBapteme && bapteme && data.celebrantIds.length > 0) {
      await sb.from('bapteme_celebrants').insert(
        data.celebrantIds.map((croyantId) => ({
          bapteme_id: bapteme.id,
          croyant_id: croyantId,
        })),
      );
    }

    revalidatePath('/baptemes');
    revalidatePath('/croyants');
    revalidatePath('/tableau-de-bord');

    if (erreurBapteme) {
      // Le croyant EXISTE et sa date de bapteme est enregistree : il compte
      // dans les indicateurs. Seules les informations de ceremonie manquent.
      // On le dit — un demi-succes tu se decouvre trois mois plus tard.
      console.error('[baptemes] ceremonie', croyant.id, erreurBapteme.message);
      return ok({
        croyantId: croyant.id,
        matricule: croyant.matricule,
        ceremonieEnregistree: false,
      });
    }

    await auditer({
      session,
      action: 'CREATE',
      table: 'baptemes',
      recordId: croyant.id,
      entityId: data.egliseId,
      diff: {
        apres: {
          date: data.dateBapteme.toISOString().slice(0, 10),
          lieu: data.lieu,
          session: data.sessionLibelle,
        },
      },
    });

    return ok({
      croyantId: croyant.id,
      matricule: croyant.matricule,
      ceremonieEnregistree: true,
    });
  });
}

// -----------------------------------------------------------------------------
// Lot d'une meme ceremonie — EF-BAP-07
// -----------------------------------------------------------------------------

export interface ResultatLot {
  /** Baptises reellement enregistres, dans l'ordre de la grille. */
  readonly enregistres: { readonly ligne: number; readonly matricule: string; readonly nom: string }[];
  /** Lignes ecartees, avec leur motif. Le numero est celui de la grille. */
  readonly refuses: { readonly ligne: number; readonly message: string }[];
  /** Ceremonies non ecrites alors que la fiche l'est : un demi-succes se DIT. */
  readonly ceremoniesManquantes: number;
}

/**
 * Saisie d'un LOT de baptises d'une meme ceremonie — EF-BAP-07.
 *
 * TROIS ECRITURES POUR N BAPTISES, PAS TROIS PAR BAPTISE.
 *
 * Trente baptises saisis un a un, c'est soixante allers-retours sur une
 * liaison ou chacun se mesure entre 0,5 et 4 secondes : deux minutes d'attente,
 * et soixante occasions de panne (regle 28). Les croyants partent donc en une
 * insertion, les baptemes en une autre, les celebrants en une troisieme — le
 * cout ne depend plus du nombre de lignes.
 *
 * PAS DE TRANSACTION, pour la meme raison qu'a l'unite : un lot a moitie ecrit
 * laisse des croyants CORRECTS, avec leur date de bapteme, donc comptes dans
 * les indicateurs (RG-30). L'etat intermediaire est benin et rattrapable — il
 * se DIT, ligne par ligne, plutot que de se taire (regle 20).
 */
export async function saisirBaptisesEnLot(
  input: unknown,
): Promise<ActionResult<ResultatLot>> {
  return executerAction('saisirBaptisesEnLot', async () => {
    const session = await requireSession();

    const analyse = saisirLotSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const data = analyse.data;

    const arbre = await getArbrePerimetre();

    // Une absence de donnees n'est pas un refus de droit (regle 15).
    if (arbre.length === 0) {
      return ko(
        "La structure n'a pas pu etre chargee. Verifiez votre connexion, puis reessayez.",
      );
    }

    const parId = new Map(arbre.map((e) => [e.id, e]));
    const eglisesPerimetre = arbre.filter((e) => e.type === 'EGLISE' && e.is_active);

    /**
     * L'eglise que le client n'a pas eu a renseigner.
     *
     * Le serveur la REDEDUIT plutot que de faire confiance : le formulaire a
     * pu ne pas l'envoyer parce qu'elle etait evidente a l'ecran, mais rien
     * n'empeche d'appeler l'action sans passer par lui.
     */
    const implicite = eglisesPerimetre.length === 1 ? eglisesPerimetre[0]!.id : null;

    const refuses: { ligne: number; message: string }[] = [];
    const retenues: {
      ligne: number;
      egliseId: string;
      celluleId: string | null;
      nom: string;
      prenom: string;
      cle: string;
      ligneSql: Record<string, unknown>;
    }[] = [];

    // --- Doublons INTERNES au lot : la meme ligne collee deux fois ---
    const repetees = new Set(
      doublonsInternes(
        data.lignes.map((l) => ({
          nom: l.nom,
          prenom: l.prenom,
          dateNaissance: l.dateNaissance.toISOString().slice(0, 10),
        })),
      ),
    );

    // --- Doublons DEJA enregistres : une seule requete pour tout le lot ---
    const dejaEnregistres = await chercherDoublonsLot(
      data.lignes.map((l) => ({
        nom: l.nom,
        prenom: l.prenom,
        dateNaissance: l.dateNaissance,
      })),
    );

    for (const [index, ligne] of data.lignes.entries()) {
      const numero = index + 1;
      const nom = sanitize(ligne.nom);
      const prenom = sanitize(ligne.prenom);

      const egliseId = ligne.egliseId ?? implicite;
      if (!egliseId) {
        refuses.push({
          ligne: numero,
          message: "L'eglise de rattachement est requise.",
        });
        continue;
      }

      const eglise = parId.get(egliseId);
      if (!eglise) {
        return ko(
          `Ligne ${numero} : cette eglise est introuvable ou hors de votre perimetre.`,
        );
      }
      if (eglise.type !== 'EGLISE') {
        return ko(`RG-04 : le rattachement principal doit etre une Eglise (ligne ${numero}).`);
      }

      // RG-05 — la cellule appartient a l'eglise du bapteme.
      if (ligne.celluleId) {
        const cellule = parId.get(ligne.celluleId);
        if (!cellule || cellule.type !== 'CELLULE') {
          refuses.push({ ligne: numero, message: 'Cette cellule est introuvable.' });
          continue;
        }
        if (cellule.parent_id !== egliseId) {
          refuses.push({
            ligne: numero,
            message: `RG-05 : la cellule « ${cellule.nom} » n'appartient pas a « ${eglise.nom} ».`,
          });
          continue;
        }
      }

      if (repetees.has(index)) {
        refuses.push({
          ligne: numero,
          message: `${nomComplet(nom, prenom)} figure deja plus haut dans ce lot.`,
        });
        continue;
      }

      // EF-CRO-13 — un homonyme ne du meme jour existe reellement, et une
      // ceremonie collective en produit : on ecarte la LIGNE en le disant,
      // sans emporter le reste du lot.
      const cle = cleDoublon(ligne.nom, ligne.prenom, ligne.dateNaissance);
      const existant = dejaEnregistres.get(cle);
      if (existant) {
        refuses.push({
          ligne: numero,
          message:
            `${nomComplet(existant.nom, existant.prenom)} est deja enregistre ` +
            `(matricule ${existant.matricule}). Saisissez son bapteme depuis sa fiche.`,
        });
        continue;
      }

      retenues.push({
        ligne: numero,
        egliseId,
        celluleId: ligne.celluleId ?? null,
        nom,
        prenom,
        // La cle est batie sur les valeurs ASSAINIES, celles que la base
        // rendra : c'est elle qui reliera chaque fiche creee a sa ligne.
        cle: cleDoublon(nom, prenom, ligne.dateNaissance),
        ligneSql: {
          nom,
          prenom,
          sexe: ligne.sexe,
          telephone: ligne.telephone,
          date_naissance: ligne.dateNaissance.toISOString().slice(0, 10),
          date_bapteme: data.dateBapteme.toISOString().slice(0, 10),
          adresse: sanitize(ligne.adresse),
          eglise_id: egliseId,
          cellule_id: ligne.celluleId ?? null,
          grade_id: data.gradeId,
          nationalite_id: data.nationaliteId,
          saisi_par: session.profileId,
          saisi_depuis: session.entityId,
          // `matricule` omis : le trigger l'attribue, seule la base garantissant
          // l'unicite de la sequence face a trente insertions simultanees.
        },
      });
    }

    if (retenues.length === 0) {
      return ok({ enregistres: [], refuses, ceremoniesManquantes: 0 });
    }

    /**
     * RG-25 — le droit s'evalue EGLISE PAR EGLISE.
     *
     * Une ceremonie de district reunit des baptises de plusieurs eglises, et
     * rien ne garantit qu'on les couvre toutes. Un droit manquant arrete le lot
     * ENTIER : ecrire les lignes permises et taire les autres laisserait une
     * ceremonie incomplete que personne ne saurait relire.
     */
    for (const egliseId of new Set(retenues.map((r) => r.egliseId))) {
      const chemin = parId.get(egliseId)!.path;
      await requirePermission(session, 'bapteme.create', chemin);
      await requirePermission(session, 'croyant.create', chemin);
    }

    const sb = await createClient();

    const { data: crees, error: erreurCroyants } = await sb
      .from('croyants')
      .insert(retenues.map((r) => r.ligneSql))
      .select('id, matricule, nom, prenom, date_naissance')
      .returns<
        { id: string; matricule: string; nom: string; prenom: string; date_naissance: string }[]
      >();

    if (erreurCroyants) return ko(messageErreurSql(erreurCroyants));

    /**
     * On relie par la CLE, pas par le rang.
     *
     * PostgreSQL rend bien les lignes d'un `insert ... returning` dans l'ordre
     * des valeurs, mais s'appuyer dessus ferait dependre l'appariement d'un
     * detail d'implementation : une inversion attacherait le bapteme de l'un a
     * la fiche de l'autre, silencieusement. Les doublons internes ayant deja
     * ete ecartes, la cle est unique dans le lot.
     */
    const parCle = new Map(
      (crees ?? []).map((c) => [
        cleDoublon(c.nom, c.prenom, new Date(c.date_naissance)),
        c,
      ]),
    );

    const enregistres: ResultatLot['enregistres'] = [];
    const ceremonies: { croyant_id: string; entity_id: string }[] = [];

    for (const retenue of retenues) {
      const cree = parCle.get(retenue.cle);
      if (!cree) {
        refuses.push({
          ligne: retenue.ligne,
          message: "La fiche n'a pas pu etre enregistree.",
        });
        continue;
      }
      enregistres.push({
        ligne: retenue.ligne,
        matricule: cree.matricule,
        nom: nomComplet(retenue.nom, retenue.prenom),
      });
      ceremonies.push({ croyant_id: cree.id, entity_id: retenue.egliseId });
    }

    await auditer({
      session,
      action: 'CREATE',
      table: 'croyants',
      // Aucun enregistrement PRECIS : l'evenement porte sur le lot entier.
      entityId: session.entityId,
      diff: {
        apres: {
          lot: true,
          origine: 'bapteme',
          session: data.sessionLibelle,
          date: data.dateBapteme.toISOString().slice(0, 10),
          enregistres: enregistres.length,
          refuses: refuses.length,
        },
      },
    });

    // --- Les ceremonies (EF-BAP-03), en une insertion ---
    let ceremoniesManquantes = 0;

    if (ceremonies.length > 0) {
      const { data: baptemes, error: erreurBaptemes } = await sb
        .from('baptemes')
        .insert(
          ceremonies.map((c) => ({
            ...c,
            date_bapteme: data.dateBapteme.toISOString().slice(0, 10),
            lieu: data.lieu ? sanitize(data.lieu) : null,
            session_libelle: data.sessionLibelle ? sanitize(data.sessionLibelle) : null,
            saisi_par: session.profileId,
          })),
        )
        .select('id')
        .returns<{ id: string }[]>();

      if (erreurBaptemes) {
        // Les fiches EXISTENT et portent leur date de bapteme : elles comptent
        // dans les indicateurs. Seules les informations de ceremonie manquent.
        console.error('[baptemes] ceremonies du lot', erreurBaptemes.message);
        ceremoniesManquantes = ceremonies.length;
      } else if (data.celebrantIds.length > 0 && baptemes) {
        // Les memes celebrants pour tout le lot : une seule insertion croisee.
        await sb.from('bapteme_celebrants').insert(
          baptemes.flatMap((b) =>
            data.celebrantIds.map((croyantId) => ({
              bapteme_id: b.id,
              croyant_id: croyantId,
            })),
          ),
        );
      }
    }

    revalidatePath('/baptemes');
    revalidatePath('/croyants');
    revalidatePath('/tableau-de-bord');

    return ok({ enregistres, refuses, ceremoniesManquantes });
  });
}
