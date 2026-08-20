'use server';

import { revalidatePath } from 'next/cache';

import { chargerModele, nomsDeModeles } from '@/lib/data/rapports';
import { getArbrePerimetre } from '@/lib/data/entities';
import { resoudreContenu } from '@/lib/data/rapport-generation';
import { getParametres } from '@/lib/data/settings';
import { type ActionResult, ko, ok } from '@/lib/domain/result';
import { detient } from '@/lib/domain/permissions';
import {
  type StructureRapport,
  type VisibiliteModele,
  compositionAutorisee,
  modeleSApplique,
  resoudreStructure,
  nomDuplique,
  porteeReserveeAuSiege,
  resumeStructure,
} from '@/lib/domain/rapport';
import { auditer, requirePermission, requireSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { sanitizeAll } from '@/lib/utils/sanitize';
import {
  archiverModeleSchema,
  creerModeleSchema,
  dupliquerModeleSchema,
  enregistrerStructureSchema,
  genererRapportSchema,
  modifierModeleSchema,
} from '@/lib/validation/rapport';
import { champsEnErreur } from '@/lib/validation/zod-errors';

import { executerAction } from './executer';

/**
 * La bibliotheque de modeles — EF-RAP-07 a 11.
 *
 * UNE ENTITE COMPOSE POUR ELLE-MEME. L'entite proprietaire d'un modele est
 * TOUJOURS celle de rattachement de son auteur, lue dans la session : elle ne
 * voyage pas dans le formulaire, donc elle ne se choisit pas, donc elle n'a pas
 * a se refuser. Un district ne compose pas le rapport de sa paroisse — il
 * compose le sien, et le partage a ses descendants s'il le veut (EF-RAP-09).
 *
 * LE SIEGE FAIT EXCEPTION, et une seule : il pose des modeles OFFICIELS qui
 * n'appartiennent a aucune entite et se proposent a toutes (EF-RAP-08).
 *
 * `report.template.manage` s'evalue toujours AVEC SA PORTEE (regle 3) — sur
 * l'entite proprietaire, ou sur le Siege pour un officiel.
 */

/**
 * Le chemin ltree de l'entite proprietaire, ou `null` si elle n'est pas dans le
 * perimetre.
 *
 * `entityId === null` designe le Siege (EF-RAP-08) : un modele officiel
 * n'appartient a aucune entite, sa portee est celle de la racine. Si le Siege
 * n'est pas dans le perimetre de l'appelant, il n'y a rien a chercher — et
 * c'est bien un refus, pas une absence de donnees (regle 15) : on le dit.
 */
async function cheminProprietaire(entityId: string | null): Promise<string | null> {
  const arbre = await getArbrePerimetre();

  if (entityId === null) {
    return arbre.find((e) => e.type === 'SIEGE')?.path ?? null;
  }
  return arbre.find((e) => e.id === entityId)?.path ?? null;
}

const RATTACHEMENT_INTROUVABLE =
  'Votre entite de rattachement est introuvable dans votre perimetre : impossible d’y composer ' +
  'un modele. Signalez-le a un administrateur.';

const RESERVE_AU_SIEGE =
  'Un modele officiel ou visible par toute l’organisation se pose depuis le Siege (EF-RAP-08). ' +
  'Choisissez une portee qui s’arrete a votre entite ou a ses filles.';

/**
 * Le message dit un ETAT, pas un coupable.
 *
 * « Le Siege a ferme la composition » serait un diagnostic — et il serait FAUX
 * si le reglage n'avait pas pu etre lu (`REPLI` de `lib/data/settings.ts`, qui
 * ferme par prudence). Ce qui est vrai dans les deux cas, c'est que la
 * composition n'est pas ouverte ici et maintenant (regle 15).
 */
const COMPOSITION_FERMEE =
  'La composition de modeles n’est pas ouverte a votre entite : vous employez les modeles ' +
  'mis a disposition par le Siege. Un administrateur peut l’ouvrir depuis les reglages.';

/**
 * EF-RAP-07 — l'organisation ouvre-t-elle la composition a cette entite ?
 *
 * A n'appeler qu'APRES `requirePermission` : ce controle-ci ne remplace pas le
 * droit, il s'y ajoute. Detenir `report.template.manage` dit qu'on sait
 * composer pour son entite ; ce reglage dit si l'organisation le permet encore.
 */
async function refusDeComposition(
  session: Awaited<ReturnType<typeof requireSession>>,
): Promise<string | null> {
  const parametres = await getParametres();

  const ouverte = compositionAutorisee({
    // Garanti par le `requirePermission` de l'appelant, qui leve sinon.
    detientLeDroit: true,
    compositionLibre: parametres.rapport_composition_libre,
    // Le critere est ce que le perimetre CONTIENT, jamais le role : un compte
    // rattache au Siege couvre toute l'organisation, un gestionnaire de
    // district non — meme s'il en administre vingt eglises.
    estSiege: session.entiteType === 'SIEGE',
  });

  return ouverte ? null : COMPOSITION_FERMEE;
}

/**
 * Une portee qui deborde l'entite proprietaire se verifie AU SIEGE.
 *
 * La RLS ne peut pas s'en charger : elle autorise l'ecriture des lors qu'on
 * gere les modeles de l'entite proprietaire. Une paroisse qui gere les siens
 * pourrait donc s'annoncer a toute l'organisation en cochant « GLOBAL ». C'est
 * ici que le refus se pose, et il est MOTIVE.
 */
async function verifierPorteeElargie(
  session: Awaited<ReturnType<typeof requireSession>>,
  visibilite: VisibiliteModele,
  estOfficiel: boolean,
): Promise<string | null> {
  if (!porteeReserveeAuSiege(visibilite, estOfficiel)) return null;

  const cheminSiege = await cheminProprietaire(null);
  if (!cheminSiege) return RESERVE_AU_SIEGE;

  // Leve `ErreurAcces`, convertie en refus lisible par `executerAction`.
  await requirePermission(session, 'report.template.manage', cheminSiege);
  return null;
}

// -----------------------------------------------------------------------------

/** EF-RAP-07, EF-RAP-08, EF-RAP-09 — enregistrer une composition reutilisable. */
export async function creerModele(input: unknown): Promise<ActionResult<{ id: string }>> {
  return executerAction('creerModele', async () => {
    const session = await requireSession();

    const analyse = creerModeleSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const valeurs = analyse.data;

    /**
     * L'ENTITE PROPRIETAIRE VIENT DE LA SESSION, jamais du formulaire.
     *
     * Un modele officiel n'appartient a aucune entite : les deux ensemble
     * donneraient un « officiel reserve a une paroisse », ce que la contrainte
     * `report_templates_officiel_check` refuserait sans expliquer.
     */
    const entityId = valeurs.estOfficiel ? null : session.entityId;

    const chemin = await cheminProprietaire(entityId);
    if (!chemin) return ko(entityId === null ? RESERVE_AU_SIEGE : RATTACHEMENT_INTROUVABLE);

    await requirePermission(session, 'report.template.manage', chemin);

    const ferme = await refusDeComposition(session);
    if (ferme) return ko(ferme);

    const refus = await verifierPorteeElargie(session, valeurs.visibilite, valeurs.estOfficiel);
    if (refus) return ko(refus);

    const ligne = sanitizeAll({
      nom: valeurs.nom,
      description: valeurs.description,
      entity_id: entityId,
      niveaux_applicables: valeurs.niveauxApplicables,
      visibilite: valeurs.visibilite,
      est_officiel: valeurs.estOfficiel,
      created_by: session.profileId,
    });

    const sb = await createClient();
    const { data, error } = await sb
      .from('report_templates')
      .insert(ligne)
      .select('id')
      .single<{ id: string }>();

    if (error) return ko("Le modele n'a pas pu etre enregistre.");

    await auditer({
      session,
      action: 'CREATE',
      table: 'report_templates',
      recordId: data.id,
      entityId: entityId ?? undefined,
      diff: { apres: ligne },
    });

    revalidatePath('/rapports');
    return ok({ id: data.id });
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-RAP-11 — renommer, redecrire, changer de portee.
 *
 * La STRUCTURE n'est pas touchee ici (regle 19), et c'est ce qui laisse la
 * version tranquille : le trigger `fn_report_template_bu` ne l'incremente que
 * lorsque la composition change. Un modele renomme reste la version qu'il etait
 * — c'est ce que le modele PRODUIT qui se versionne, pas son etiquette.
 */
export async function modifierModele(input: unknown): Promise<ActionResult<void>> {
  return executerAction('modifierModele', async () => {
    const session = await requireSession();

    const analyse = modifierModeleSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const valeurs = analyse.data;

    const modele = await chargerModele(valeurs.modeleId);
    if (!modele) return ko('Ce modele est introuvable.');

    const chemin = await cheminProprietaire(modele.entityId);
    if (!chemin) {
      return ko(
        modele.entityId === null
          ? 'Ce modele officiel se modifie depuis le Siege.'
          : 'Ce modele appartient a une entite qui n’est pas dans votre perimetre.',
      );
    }

    await requirePermission(session, 'report.template.manage', chemin);

    // Un modele archive ne se modifie pas : il se desarchive d'abord. Sans ce
    // refus, ce qui a ete retire de la circulation changerait sans que personne
    // ne l'ait decide (EF-RAP-11).
    if (modele.archiveLe) {
      return ko(
        'Ce modele est archive. Desarchivez-le avant de le modifier — sinon il changerait ' +
          'sans etre revenu dans la bibliotheque.',
      );
    }

    const refus = await verifierPorteeElargie(session, valeurs.visibilite, modele.estOfficiel);
    if (refus) return ko(refus);

    /**
     * Regle 19 — QUATRE champs, ceux dont le formulaire est la source.
     *
     * `structure`, `entity_id`, `est_officiel` et `version` n'y figurent pas :
     * envoyes vides depuis un pop-up qui ne les affiche pas, ils effaceraient
     * la composition sans un mot d'erreur.
     */
    const modifications = sanitizeAll({
      nom: valeurs.nom,
      description: valeurs.description,
      niveaux_applicables: valeurs.niveauxApplicables,
      visibilite: valeurs.visibilite,
    });

    const sb = await createClient();
    const { error } = await sb
      .from('report_templates')
      .update(modifications)
      .eq('id', valeurs.modeleId);

    if (error) return ko("Le modele n'a pas pu etre modifie.");

    await auditer({
      session,
      action: 'UPDATE',
      table: 'report_templates',
      recordId: valeurs.modeleId,
      entityId: modele.entityId ?? undefined,
      diff: {
        avant: {
          nom: modele.nom,
          description: modele.description,
          niveaux_applicables: modele.niveauxApplicables,
          visibilite: modele.visibilite,
        },
        apres: modifications,
      },
    });

    revalidatePath('/rapports');
    return ok();
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-RAP-01, EF-RAP-04 — enregistrer la COMPOSITION.
 *
 * ELLE ET RIEN D'AUTRE (regle 19). `nom`, `visibilite`, `niveaux_applicables`
 * appartiennent au pop-up d'identite ; les envoyer d'ici, depuis un editeur qui
 * ne les affiche pas, les remettrait a vide sans un mot.
 *
 * C'EST ICI QUE LA VERSION MONTE. Le trigger `fn_report_template_bu` incremente
 * `version` des lors que `structure` change — et lui seul sait si elle a
 * vraiment change : l'auto-sauvegarde envoie parfois une structure identique
 * (une selection, un panneau ouvert), et compter les envois ferait grimper la
 * version sans que le modele produise rien de different.
 *
 * COMPOSER RESTE COMPOSER, meme sur un modele existant : le verrou
 * d'organisation s'applique (EF-RAP-07). Renommer et archiver, non — ranger sa
 * bibliotheque n'est pas dessiner.
 */
export async function enregistrerStructure(input: unknown): Promise<ActionResult<void>> {
  return executerAction('enregistrerStructure', async () => {
    const session = await requireSession();

    const analyse = enregistrerStructureSchema.safeParse(input);
    if (!analyse.success) {
      return ko(
        'La composition n’a pas pu etre enregistree : elle contient un element que cette ' +
          'version ne sait pas lire.',
        champsEnErreur(analyse.error),
      );
    }
    const { modeleId, structure } = analyse.data;

    const modele = await chargerModele(modeleId);
    if (!modele) return ko('Ce modele est introuvable.');

    const chemin = await cheminProprietaire(modele.entityId);
    if (!chemin) {
      return ko(
        modele.entityId === null
          ? 'Ce modele officiel se compose depuis le Siege.'
          : 'Ce modele appartient a une entite qui n’est pas dans votre perimetre.',
      );
    }

    await requirePermission(session, 'report.template.manage', chemin);

    if (modele.archiveLe) {
      return ko(
        'Ce modele est archive. Desarchivez-le avant de le composer — sinon il changerait ' +
          'sans etre revenu dans la bibliotheque.',
      );
    }

    const ferme = await refusDeComposition(session);
    if (ferme) return ko(ferme);

    const sb = await createClient();
    const { error } = await sb
      .from('report_templates')
      .update({ structure })
      .eq('id', modeleId);

    if (error) return ko("La composition n'a pas pu etre enregistree.");

    /**
     * L'AUDIT PORTE UNE MESURE, PAS LA STRUCTURE ENTIERE.
     *
     * Une auto-sauvegarde ecrit toutes les quelques secondes : recopier le
     * `jsonb` complet a chaque fois gonflerait `audit_log` de plusieurs
     * kilo-octets par frappe, pour un journal que personne ne relirait. Ce
     * qu'on veut savoir, c'est QUI a touche a QUOI et QUAND — et de combien la
     * composition a bouge.
     */
    const resume = resumeStructure(structure);
    await auditer({
      session,
      action: 'UPDATE',
      table: 'report_templates',
      recordId: modeleId,
      entityId: modele.entityId ?? undefined,
      diff: {
        champ: 'structure',
        avant: resumeStructure(modele.structure),
        apres: resume,
      },
    });

    // La bibliotheque annonce « N sections · N blocs · sources » sur chaque
    // carte : sans cette invalidation, elle afficherait la composition d'avant.
    revalidatePath('/rapports');
    return ok();
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-RAP-08, EF-RAP-11 — dupliquer pour adapter.
 *
 * LE DUPLICATA N'EST JAMAIS OFFICIEL, et il repart en version 1. C'est ce qui
 * fait tenir la trame officielle : si copier suffisait a produire un officiel,
 * n'importe quelle entite en fabriquerait, et « officiel » ne voudrait plus
 * rien dire. Le modele copie, lui, ne bouge pas — c'est tout l'interet.
 */
export async function dupliquerModele(
  input: unknown,
): Promise<ActionResult<{ id: string; nom: string }>> {
  return executerAction('dupliquerModele', async () => {
    const session = await requireSession();

    const analyse = dupliquerModeleSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const valeurs = analyse.data;

    // La RLS a deja tranche la LECTURE : si le modele revient, il est visible.
    const source = await chargerModele(valeurs.modeleId);
    if (!source) return ko('Ce modele est introuvable.');

    // Le duplicata appartient a celui qui copie, pas a la source — et « celui
    // qui copie » est son entite de rattachement, pas un choix de liste.
    const cible = session.entityId;

    const chemin = await cheminProprietaire(cible);
    if (!chemin) return ko(RATTACHEMENT_INTROUVABLE);

    await requirePermission(session, 'report.template.manage', chemin);

    // DUPLIQUER, C'EST COMPOSER : le duplicata est un modele de plus, qui
    // appartient a l'entite qui copie. L'autoriser quand la composition est
    // fermee rendrait le verrou decoratif.
    const ferme = await refusDeComposition(session);
    if (ferme) return ko(ferme);

    // Le nom se renumerote cote SERVEUR meme quand le client en propose un :
    // deux personnes qui dupliquent le meme modele au meme instant lisent la
    // meme bibliotheque et proposeraient le meme « (copie) ».
    const nom = valeurs.nom ?? nomDuplique(source.nom, await nomsDeModeles());

    const ligne = sanitizeAll({
      nom,
      description: source.description,
      entity_id: cible,
      niveaux_applicables: source.niveauxApplicables,
      /**
       * La copie hérite d'une portee ETROITE, jamais de celle de la source.
       *
       * Dupliquer un modele GLOBAL du Siege pour l'adapter chez soi ne doit pas
       * rediffuser un brouillon a toute l'organisation. `ENTITE` — et non
       * `PRIVE` — parce qu'une copie invisible a ses propres collegues se lit
       * comme une duplication qui a echoue.
       */
      visibilite: 'ENTITE' as const,
      est_officiel: false,
      structure: source.structure,
      created_by: session.profileId,
    });

    const sb = await createClient();
    const { data, error } = await sb
      .from('report_templates')
      .insert(ligne)
      .select('id')
      .single<{ id: string }>();

    if (error) return ko("Le modele n'a pas pu etre duplique.");

    await auditer({
      session,
      action: 'CREATE',
      table: 'report_templates',
      recordId: data.id,
      entityId: cible,
      diff: { duplicateDe: source.id, apres: { nom, entity_id: cible } },
    });

    revalidatePath('/rapports');
    return ok({ id: data.id, nom });
  });
}

// -----------------------------------------------------------------------------

/**
 * EF-RAP-12 a 15 — GENERER un rapport.
 *
 * QUATRE TEMPS, ET L'ORDRE COMPTE :
 *
 *   1. le perimetre et la periode sont choisis, et le droit `report.create` est
 *      verifie AVEC la portee de l'entite visee (regle 3) ;
 *   2. RG-26 retire de la structure les blocs dont l'habilitation manque, et
 *      les CONSIGNE — c'est ce qui evite d'interroger une source qu'on n'a pas
 *      le droit de lire ;
 *   3. les sources sont resolues SOUS LA SESSION DU GENERATEUR : la RLS borne
 *      ce qui revient, l'action n'a aucun filtre a refaire (EF-RAP-13) ;
 *   4. tout est FIGE en base — structure resolue, contenu, omissions.
 *
 * CE QUI EST FIGE, C'EST CE QUI A ETE PRODUIT.
 *
 * `template_snapshot` porte la structure APRES omission, et non le modele
 * entier. C'est le point qui rend un rapport reproductible : le re-resoudre a
 * la lecture le ferait varier d'un lecteur a l'autre, et deux personnes citant
 * « le rapport du 18 aout » ne parleraient plus du meme document. La
 * consequence merite d'etre connue — un rapport est un DOCUMENT : qui peut
 * l'ouvrir se decide par `report.read` et par la publication (EF-RAP-18), pas
 * en rejouant l'omission bloc par bloc.
 */
export async function genererRapport(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return executerAction('genererRapport', async () => {
    const session = await requireSession();

    const analyse = genererRapportSchema.safeParse(input);
    if (!analyse.success) {
      return ko('Formulaire invalide.', champsEnErreur(analyse.error));
    }
    const { modeleId, entityId, debut, fin } = analyse.data;

    const [modele, arbre] = await Promise.all([chargerModele(modeleId), getArbrePerimetre()]);
    if (!modele) return ko('Ce modele est introuvable.');

    const entite = arbre.find((e) => e.id === entityId);
    if (!entite) {
      return ko(
        'Cette entite n’appartient pas a votre perimetre : vous ne pouvez pas generer de ' +
          'rapport sur elle.',
      );
    }

    await requirePermission(session, 'report.create', entite.path);

    // EF-RAP-10 — un modele de district ne produit rien sur une cellule : ses
    // blocs seraient tous vides et l'utilisateur chercherait ce qu'il a mal
    // fait.
    if (!modeleSApplique(modele.niveauxApplicables, entite.type)) {
      return ko(
        `« ${modele.nom} » ne s’applique pas aux entites de ce niveau. Choisissez une autre ` +
          'entite, ou un autre modele.',
      );
    }

    // RG-26 — l'omission d'abord, la lecture ensuite : on n'interroge jamais
    // une source dont on n'a pas le droit.
    const resolution = resoudreStructure(modele.structure, (p) => detient(session, p));
    const structureFigee: StructureRapport = {
      ...modele.structure,
      sections: resolution.sections,
    };

    const contenu = await resoudreContenu(structureFigee, { entite, debut, fin });

    const ligne = {
      template_id: modele.id,
      template_snapshot: structureFigee,
      nom: `${modele.nom} — ${entite.nom}`,
      entity_id: entite.id,
      periode_debut: debut,
      periode_fin: fin,
      contenu,
      blocs_omis: resolution.omis,
      genere_par: session.profileId,
    };

    const sb = await createClient();
    const { data, error } = await sb
      .from('report_instances')
      .insert(ligne)
      .select('id')
      .single<{ id: string }>();

    if (error) return ko("Le rapport n'a pas pu etre genere.");

    await auditer({
      session,
      action: 'REPORT',
      table: 'report_instances',
      recordId: data.id,
      entityId: entite.id,
      diff: {
        modele: modele.nom,
        periode: [debut, fin],
        blocsOmis: resolution.omis.length,
      },
    });

    revalidatePath('/rapports/generes');
    return ok({ id: data.id });
  });
}

// -----------------------------------------------------------------------------


// -----------------------------------------------------------------------------

/**
 * EF-RAP-11 — archiver, et desarchiver.
 *
 * ARCHIVER N'EST PAS SUPPRIMER, et aucune suppression n'existe ici. Un modele a
 * produit des rapports : `report_instances.template_id` les relie encore a lui,
 * et un rapport diffuse doit pouvoir dire d'ou il vient. L'archivage le retire
 * de la bibliotheque active sans rien effacer — et se defait.
 */
export async function archiverModele(input: unknown): Promise<ActionResult<{ archive: boolean }>> {
  return executerAction('archiverModele', async () => {
    const session = await requireSession();

    const analyse = archiverModeleSchema.safeParse(input);
    if (!analyse.success) return ko('Requete invalide.');
    const { modeleId, archiver } = analyse.data;

    const modele = await chargerModele(modeleId);
    if (!modele) return ko('Ce modele est introuvable.');

    const chemin = await cheminProprietaire(modele.entityId);
    if (!chemin) {
      return ko(
        modele.entityId === null
          ? 'Ce modele officiel s’archive depuis le Siege.'
          : 'Ce modele appartient a une entite qui n’est pas dans votre perimetre.',
      );
    }

    await requirePermission(session, 'report.template.manage', chemin);

    const sb = await createClient();
    const { error } = await sb
      .from('report_templates')
      .update({ archived_at: archiver ? new Date().toISOString() : null })
      .eq('id', modeleId);

    if (error) return ko("L'archivage n'a pas pu aboutir.");

    await auditer({
      session,
      action: 'UPDATE',
      table: 'report_templates',
      recordId: modeleId,
      entityId: modele.entityId ?? undefined,
      diff: { champ: 'archived_at', avant: modele.archiveLe, apres: archiver },
    });

    revalidatePath('/rapports');
    return ok({ archive: archiver });
  });
}
