import { z } from 'zod';

import { ENTITY_TYPES } from '@/lib/domain/hierarchy';
import {
  LARGEURS_BLOC,
  MARGE_MAX_MM,
  MARGE_MIN_MM,
  TYPES_BLOC,
  VISIBILITES,
  largeurEffective,
} from '@/lib/domain/rapport';

/**
 * Schemas de la bibliotheque de modeles — EF-RAP-07 a 11.
 *
 * Le MEME schema alimente le pop-up et la Server Action : le client valide pour
 * expliquer, le serveur valide pour decider (regle 2).
 */

/**
 * Meme piege d'idempotence que partout ailleurs (regle 12), avec une marche de
 * plus : LA NORMALISATION PRECEDE LE TEST DU VIDE.
 *
 * Tester `v === ''` avant de couper les blancs laisse passer `'   '`, que le
 * `.trim()` du schema vide ENSUITE : la valeur arrive en base comme une chaine
 * vide la ou il faut `null`. La carte affiche alors un paragraphe de
 * description qui ne contient rien, et personne ne comprend d'ou il sort.
 */
const optionnel = (schema: z.ZodType<string>) =>
  z
    .preprocess((v) => {
      const normalise = typeof v === 'string' ? v.trim() : v;
      return normalise === '' || normalise === null || normalise === undefined
        ? undefined
        : normalise;
    }, schema.optional())
    .transform((v) => v ?? null);

/**
 * `length(trim(nom)) >= 3` en base : le schema porte la MEME borne.
 *
 * Plus permissif, il laisserait la contrainte refuser sans message lisible ;
 * plus strict, il refuserait ce que la base accepte — et le refus ne viendrait
 * alors ni de l'un ni de l'autre.
 */
const nom = z
  .string()
  .trim()
  .min(3, 'Donnez un nom d’au moins trois caracteres.')
  .max(160, 'Le nom ne peut pas depasser 160 caracteres.');

const description = optionnel(
  z.string().trim().max(500, 'La description ne peut pas depasser 500 caracteres.'),
);

/**
 * EF-RAP-10 — les niveaux auxquels le modele se propose.
 *
 * UNE LISTE VIDE NE BORNE RIEN, elle ne refuse pas tout (regle 15, et
 * `modeleSApplique` dit la meme chose cote domaine). C'est pourquoi aucun
 * `min(1)` ne figure ici : « je n'ai rien restreint » est un choix legitime, et
 * le plus courant.
 */
const niveaux = z
  .array(z.enum(ENTITY_TYPES))
  .default([])
  // Deux fois le meme niveau ne veut rien dire de plus, et la colonne est un
  // tableau que rien ne dedoublonne.
  .transform((v) => ENTITY_TYPES.filter((t) => v.includes(t)));

const visibilite = z.enum(VISIBILITES, { message: 'Portee de visibilite inconnue.' });

/**
 * UNE ENTITE COMPOSE POUR ELLE-MEME — et `entityId` ne figure donc NULLE PART.
 *
 * Ce n'est pas un oubli, c'est la regle metier : l'entite proprietaire est
 * celle de rattachement de l'auteur, que le serveur lit dans la session. La
 * laisser voyager dans le formulaire ouvrirait exactement ce qu'on ferme —
 * composer chez le voisin — et obligerait a le refuser ensuite, ce qui est
 * toujours moins sur que de ne pas le demander.
 *
 * La seule exception est le Siege, qui pose des modeles n'appartenant a aucune
 * entite (EF-RAP-08). Elle se dit par `estOfficiel`, pas par un identifiant.
 */
export const creerModeleSchema = z.object({
  nom,
  description,
  niveauxApplicables: niveaux,
  visibilite: visibilite.default('ENTITE'),
  /** EF-RAP-08 — reserve au Siege ; l'action le refuse aux autres. */
  estOfficiel: z.boolean().default(false),
});

export type CreerModeleInput = z.input<typeof creerModeleSchema>;

/**
 * EF-RAP-11 — renommer, redecrire, changer de portee.
 *
 * `entityId` EST ABSENT, et ce n'est pas un oubli. Deplacer un modele d'une
 * entite a une autre change d'un coup QUI le voit et QUI peut le modifier ;
 * celui qui l'a compose peut le perdre par un choix de liste. Un tel
 * deplacement se fait en dupliquant la-bas et en archivant ici — deux gestes,
 * dont chacun se comprend.
 *
 * `estOfficiel` est absent pour une raison voisine : un modele ne devient pas
 * officiel apres coup sans changer de proprietaire, puisqu'un officiel
 * n'appartient a personne (contrainte `report_templates_officiel_check`).
 *
 * Regle 19 — une action n'ecrit QUE les champs dont son formulaire est la
 * source. La structure n'y figure donc pas non plus : elle appartient a
 * l'editeur, et l'envoyer vide d'ici l'effacerait sans un mot.
 */
export const modifierModeleSchema = z.object({
  modeleId: z.uuid(),
  nom,
  description,
  niveauxApplicables: niveaux,
  visibilite,
});

export type ModifierModeleInput = z.input<typeof modifierModeleSchema>;

/**
 * EF-RAP-11 / EF-RAP-08 — dupliquer.
 *
 * Le duplicata appartient a l'entite de CELUI QUI COPIE, jamais a celle du
 * modele d'origine : reprendre une trame du Siege pour l'adapter chez soi est
 * le geste meme que decrit EF-RAP-08. Comme a la creation, l'entite se lit dans
 * la session — elle ne se demande pas.
 */
export const dupliquerModeleSchema = z.object({
  modeleId: z.uuid(),
  /** Facultatif : le serveur numerote lui-meme s'il n'est pas fourni. */
  nom: optionnel(nom),
});

export type DupliquerModeleInput = z.input<typeof dupliquerModeleSchema>;

/**
 * EF-RAP-11 — archiver, et desarchiver.
 *
 * UN SEUL SCHEMA POUR LES DEUX SENS (regle 16) : deux actions symetriques qui
 * divergent finissent par ne plus ecrire la meme colonne. `archiver: false`
 * remet le modele en service.
 */
export const archiverModeleSchema = z.object({
  modeleId: z.uuid(),
  archiver: z.boolean(),
});

export type ArchiverModeleInput = z.input<typeof archiverModeleSchema>;

/**
 * EF-RAP-07 — LE REGLAGE DE COMPOSITION A DEMENAGE, il n'a pas disparu.
 *
 * Il vivait ici, avec son schema, son action et son pop-up sur `/rapports`.
 * EF-ADM-13 veut que les options configurables se reglent au MEME endroit :
 * il est desormais l'un des champs de `parametresSchema`, sur
 * `/administration/parametres`. Deux chemins pour poser la meme colonne
 * auraient diverge (regle 16), et c'est celui qu'on ouvre le moins souvent qui
 * aurait pris du retard.
 *
 * La lecture, elle, n'a pas bouge : `compositionAutorisee` et
 * `modeleExploitable` restent dans le domaine des rapports, ou la regle
 * s'applique.
 */

// -----------------------------------------------------------------------------
// EF-RAP-01, EF-RAP-04 — la composition elle-meme
// -----------------------------------------------------------------------------

/**
 * LA STRUCTURE EST VALIDEE COTE SERVEUR, quoi qu'ait fait l'editeur (regle 2).
 *
 * Elle arrive en `jsonb`, que rien ne contraint en base : un appel direct a
 * l'API pourrait y poser n'importe quoi, et c'est ensuite le rendu — donc
 * l'ecran de TOUS ceux qui liront le modele — qui tomberait. Le schema est le
 * seul endroit ou cette forme se verifie.
 *
 * `reglages` reste OUVERT (`unknown`) : ses cles sont propres a chaque type de
 * bloc, et les enumerer ici obligerait a rouvrir ce fichier a chaque nouveau
 * reglage. Ce qui compte est verifie — le type existe, la largeur est admise.
 */
/**
 * Un texte d'en-tete ou de pied : vide vaut ABSENT, jamais `null`.
 *
 * La colonne est un `jsonb`, et l'editeur compare deux structures serialisees
 * pour decider s'il enregistre. Une cle a `null` et une cle absente donnent
 * deux JSON differents pour le meme document : l'auto-sauvegarde ecrirait sans
 * fin, et la version monterait a chaque passage.
 */
const texteFacultatif = (max: number) =>
  z
    .preprocess((v) => {
      const normalise = typeof v === 'string' ? v.trim() : v;
      return normalise === '' || normalise === null ? undefined : normalise;
    }, z.string().trim().max(max).optional())
    .optional();

const blocSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.enum(TYPES_BLOC, { message: 'Type de bloc inconnu.' }),
    largeur: z.enum(LARGEURS_BLOC, { message: 'Largeur inconnue.' }),
    reglages: z.record(z.string(), z.unknown()).default({}),
  })
  // EF-RAP-04 — un saut de page en tiers de colonne n'existe pas. La contrainte
  // du type s'applique ici, pas seulement dans l'ecran : idempotent, donc le
  // serveur peut revalider sa propre sortie sans la voir changer (regle 12).
  .transform((b) => ({ ...b, largeur: largeurEffective(b.type, b.largeur) }));

const sectionSchema = z.object({
  id: z.string().min(1).max(64),
  titre: z.string().trim().max(160).default(''),
  blocs: z.array(blocSchema).max(100).default([]),
});

export const structureSchema = z.object({
  sections: z.array(sectionSchema).max(50).default([]),
  /**
   * EF-RAP-05 — la marge du papier, en millimetres.
   *
   * Les bornes sont celles du domaine : sous 5 mm la plupart des imprimantes
   * rognent, et le texte sort coupe sans que rien ne l'ait annonce. Le schema
   * REFUSE plutot que de ramener silencieusement — une valeur impossible venue
   * d'un appel direct merite un message, pas une correction muette.
   */
  marge: z.number().int().min(MARGE_MIN_MM).max(MARGE_MAX_MM).optional(),
  /**
   * EF-RAP-06 — en-tete et pied de page.
   *
   * AUCUN `default` SUR LES BOOLEENS, et c'est voulu. Un defaut a `true` les
   * ECRIRAIT dans la structure de tout modele qui passe par ici, y compris ceux
   * composes avant que ces champs n'existent : la valeur cesserait d'etre
   * « non renseigne » — ce que `afficheChamp` sait lire — pour devenir un choix
   * que personne n'a fait. On garde l'absence, elle veut dire quelque chose.
   */
  entete: z
    .object({
      avecLogo: z.boolean().optional(),
      avecEntite: z.boolean().optional(),
      avecPeriode: z.boolean().optional(),
      titre: texteFacultatif(160),
      sousTitre: texteFacultatif(200),
    })
    .optional(),
  pied: z
    .object({
      avecNumerotation: z.boolean().optional(),
      mentionConfidentialite: texteFacultatif(160),
      texte: texteFacultatif(160),
    })
    .optional(),
});

/**
 * Les bornes — 50 sections, 100 blocs par section — n'interdisent pas
 * l'inhabituel, elles interdisent l'IMPOSSIBLE (regle 26). Un rapport de
 * cinquante sections est deja demesure ; cinq mille est le signe d'une boucle,
 * et le `jsonb` qui en resulterait ferait tomber la lecture de la bibliotheque
 * pour tout le monde.
 */
export const enregistrerStructureSchema = z.object({
  modeleId: z.uuid(),
  structure: structureSchema,
});

export type EnregistrerStructureInput = z.input<typeof enregistrerStructureSchema>;

// -----------------------------------------------------------------------------
// EF-RAP-12, EF-RAP-18 — generer, publier
// -----------------------------------------------------------------------------

/** `AAAA-MM-JJ` — le format des colonnes `date`, sans fuseau ni heure. */
const jour = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');

/**
 * EF-RAP-12 — le perimetre et la periode.
 *
 * LES DEUX BORNES SONT INCLUSES, comme partout ailleurs dans ce projet, et la
 * contrainte `report_periode` de la base dit la meme chose (`fin >= debut`).
 * Un schema plus strict refuserait ce que la base accepte — un rapport sur une
 * seule journee est bref, pas faux (regle 26).
 */
export const genererRapportSchema = z
  .object({
    modeleId: z.uuid(),
    entityId: z.uuid("Choisissez l'entite sur laquelle porte le rapport."),
    debut: jour,
    fin: jour,
  })
  .refine((d) => d.fin >= d.debut, {
    message: 'La fin de periode ne peut pas preceder son debut.',
    path: ['fin'],
  });

export type GenererRapportInput = z.input<typeof genererRapportSchema>;

/**
 * LA PUBLICATION A ETE RETIREE le 20 aout 2026 (migration `0060`).
 *
 * Publier rendait un rapport lisible par tout le perimetre SANS `report.read`.
 * Or RG-26 omet les blocs non habilites A LA GENERATION, sous la session de
 * celui qui genere, et le contenu est ensuite fige (RG-27) : un rapport publie
 * montrait donc ses finances a quelqu'un a qui `finance.read` avait ete refuse.
 *
 * Un rapport est desormais confidentiel a son entite, et `report.read` decide
 * seul, avec sa portee.
 */
