import 'server-only';

import { cache } from 'react';

import type { EvenementDime, ModeDime, NatureVersement } from '@/lib/domain/dime';
import { createClient } from '@/lib/supabase/server';

import { DataError } from './errors';

/**
 * Lectures des dimes — EF-FIN-27 a 31, RG-33.
 *
 * CE QU'IL FAUT AVOIR EN TETE EN LISANT CE FICHIER : un mouvement de dime est
 * rattache au SIEGE par `entity_id`, et a l'eglise collectrice par
 * `entite_collecte_id`. Les lectures d'ici partent donc de la SECONDE — c'est
 * elle qui repond a « qu'avons-nous collecte ? », la question que se pose une
 * eglise.
 *
 * La RLS laisse voir les deux (migration `0027`) : sans quoi une eglise ne
 * pourrait pas repondre au croyant qui lui demande la trace de sa dime, alors
 * qu'elle lui en a remis le recu (EF-FIN-31).
 *
 * `rapprochement` VOYAGE AVEC LE VERSEMENT — EF-FIN-34. Le demander ligne par
 * ligne au moment de deplier couterait un aller-retour par versement, et c'est
 * justement en depliant qu'on veut une reponse immediate (regle 28).
 *
 * AUCUN COMMENTAIRE DANS LA CHAINE CI-DESSOUS. PostgREST lit un `select` , pas
 * du SQL : un `/* … *\/` y serait envoye tel quel et pris pour des colonnes.
 * `tests/unit/embeds-postgrest.test.ts` l'a attrape le 20 aout 2026, sur un
 * commentaire pose au milieu de l'embed.
 */

const CHAMPS = `
  id, montant, date_operation, libelle, reference, statut,
  entite_collecte_id, dime_evenement, dime_remise_id, created_at,
  collecteur:entities!finance_entries_entite_collecte_id_fkey (id, nom, code, type),
  categorie:finance_categories!finance_entries_categorie_id_fkey (id, libelle),
  remise:dime_remises!finance_entries_dime_remise_id_fkey (
    id, reference, date_remise, observation,
    porteur:croyants!dime_remises_porteur_id_fkey (id, nom, prenom)
  ),
  versements:dime_versements!dime_versements_finance_entry_id_fkey (
    id, croyant_id, enveloppe_numero, montant, recu_numero, nature,
    croyant:croyants!dime_versements_croyant_id_fkey (id, nom, prenom, matricule),
    rapprochement:dime_rapprochements!dime_rapprochements_versement_id_fkey (
      id, nom_source, prenom_source, enveloppe_source, croyant_id
    )
  )
` as const;

export interface VersementListe {
  id: string;
  /** `null` pour un versement anonyme — il n'y a personne a rattacher. */
  croyant_id: string | null;
  enveloppe_numero: string | null;
  montant: number;
  /** `null` pour un anonyme : on ne remet pas de recu a personne. */
  recu_numero: string | null;
  nature: NatureVersement;
  croyant: { id: string; nom: string; prenom: string; matricule: string } | null;
  /**
   * EF-FIN-34 — la ligne attend une identite, ou l'a deja trouvee.
   *
   * PostgREST rend un TABLEAU pour cette relation inverse, meme quand il n'y a
   * au plus qu'une ligne : le declarer au singulier ferait echouer la lecture
   * a l'execution, sans que le compilateur n'en sache rien.
   */
  rapprochement: {
    id: string;
    nom_source: string;
    prenom_source: string | null;
    enveloppe_source: string | null;
    croyant_id: string | null;
  }[];
}

export interface CollecteListe {
  id: string;
  montant: number;
  date_operation: string;
  libelle: string | null;
  reference: string | null;
  statut: string;
  entite_collecte_id: string | null;
  dime_evenement: EvenementDime | null;
  dime_remise_id: string | null;
  created_at: string;
  collecteur: { id: string; nom: string; code: string; type: string } | null;
  categorie: { id: string; libelle: string } | null;
  /** EF-FIN-30 — le bordereau qui l'a portee au Siege, s'il existe. */
  remise: {
    id: string;
    reference: string;
    date_remise: string;
    observation: string | null;
    porteur: { id: string; nom: string; prenom: string } | null;
  } | null;
  versements: VersementListe[];
}

/**
 * Les collectes du perimetre, detail compris.
 *
 * LE DETAIL EST CHARGE AVEC, en un seul embed. Le demander collecte par
 * collecte au moment de deplier coûterait un aller-retour par ligne — et c'est
 * justement en dépliant qu'on veut une reponse immediate (regle 28).
 *
 * Un changement de mode ne masque rien : une collecte saisie en detail garde
 * son detail apres le passage en global (EF-FIN-28).
 */
export const chargerCollectes = cache(async (): Promise<CollecteListe[]> => {
  const sb = await createClient();

  const { data, error } = await sb
    .from('finance_entries')
    .select(CHAMPS)
    .not('entite_collecte_id', 'is', null)
    .is('deleted_at', null)
    .order('date_operation', { ascending: false })
    .limit(2000)
    .returns<CollecteListe[]>();

  if (error) throw new DataError('Les collectes de dimes sont illisibles.', error);
  return data ?? [];
});

export interface EnveloppeCroyant {
  croyant_id: string;
  numero: string;
}

/**
 * Les enveloppes ACTIVES d'une entite, indexees par croyant.
 *
 * Sert a pre-remplir la grille de saisie : le membre du bureau retrouve un
 * numero qu'il n'a pas a recopier, et l'erreur de frappe disparait avec lui.
 * Les enveloppes inactives ne sont pas chargees — elles figurent sur d'anciens
 * recus, pas dans une saisie du jour.
 */
export async function chargerEnveloppes(
  egliseId: string,
): Promise<Map<string, string>> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('dime_enveloppes')
    .select('croyant_id, numero')
    .eq('eglise_id', egliseId)
    .eq('is_active', true)
    .returns<EnveloppeCroyant[]>();

  // Une enveloppe illisible ne doit pas empecher de saisir la collecte : le
  // numero se tape a la main, il n'est pas obligatoire.
  if (error) return new Map();
  return new Map((data ?? []).map((e) => [e.croyant_id, e.numero]));
}

export interface DonateurPossible {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  photo_key: string | null;
  eglise_nom: string | null;
}

/**
 * Les donateurs possibles d'une collecte — EF-FIN-32.
 *
 * TOUTE L'ORGANISATION, et non le seul perimetre : un croyant de passage
 * assiste au culte d'une autre eglise et y remet son enveloppe.
 *
 * On passe par `fn_croyants_pour_dime` plutot que par la table, et ce n'est pas
 * un detour : la fonction borne les COLONNES a l'identite — nom, prenom,
 * matricule, eglise, portrait — et l'AUDIENCE aux detenteurs de
 * `finance.dime.collect`. Lire `croyants` directement aurait demande
 * d'elargir sa RLS, ce qui aurait ouvert avec elle l'adresse, le telephone et
 * la date de naissance de toute l'organisation.
 */
/** Le plafond de `fn_croyants_pour_dime`. Doit rester aligne sur le SQL. */
export const PLAFOND_DONATEURS = 5000;

export const chargerDonateurs = cache(
  async (): Promise<{ donateurs: DonateurPossible[]; tronque: boolean }> => {
    const sb = await createClient();

    const { data, error } = await sb.rpc('fn_croyants_pour_dime');

    // Un refus de droit rend une liste vide plutot qu'une erreur : la saisie
    // anonyme reste possible, et l'ecran le dit.
    if (error) return { donateurs: [], tronque: false };

    const donateurs = (data as DonateurPossible[] | null) ?? [];
    return { donateurs, tronque: donateurs.length >= PLAFOND_DONATEURS };
  },
);

/**
 * TOUTES les enveloppes actives du perimetre, en une requete.
 *
 * La grille de saisie ne sait pas d'avance quelle entite sera choisie : les
 * charger apres coup couterait un aller-retour a chaque changement d'entite,
 * au milieu d'une saisie (regle 28). Une enveloppe par croyant et par eglise
 * reste un volume modeste — c'est un numero, pas une fiche.
 */
export async function chargerEnveloppesPerimetre(): Promise<Map<string, string>> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('dime_enveloppes')
    .select('croyant_id, numero')
    .eq('is_active', true)
    .limit(20000)
    .returns<EnveloppeCroyant[]>();

  // Une enveloppe illisible n'empeche pas de saisir : le numero se tape a la
  // main, et il est facultatif.
  if (error) return new Map();
  return new Map((data ?? []).map((e) => [e.croyant_id, e.numero]));
}

export interface PorteurDEnveloppe {
  readonly croyantId: string;
  readonly nom: string;
  readonly prenom: string;
  /** Dernier versement connu sous ce numero : le plus recent fait foi. */
  readonly derniereFois: string;
}

/**
 * QUI A DEJA UTILISE CE NUMERO D'ENVELOPPE — EF-FIN-27.
 *
 * Le numero est RECOPIE sur chaque versement (0027) : l'historique existe donc
 * deja, il suffit de le lire a l'envers. Un membre du bureau qui tient une
 * enveloppe en main en lit le numero avant le nom — souvent il n'y a pas de
 * nom du tout, seulement un numero connu de tous.
 *
 * C'est une SUGGESTION, jamais une attribution : deux personnes peuvent avoir
 * porte le meme numero a des annees d'ecart, et c'est l'utilisateur qui
 * reconnait l'ecriture sur l'enveloppe. La liste rend donc TOUS les porteurs
 * connus, du plus recent au plus ancien.
 */
export async function chargerPorteursDEnveloppe(): Promise<
  Map<string, PorteurDEnveloppe[]>
> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('dime_versements')
    .select(
      'enveloppe_numero, croyant_id, created_at, ' +
        'croyant:croyants!dime_versements_croyant_id_fkey (nom, prenom)',
    )
    .not('enveloppe_numero', 'is', null)
    .not('croyant_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20000)
    .returns<
      {
        enveloppe_numero: string;
        croyant_id: string;
        created_at: string;
        croyant: { nom: string; prenom: string } | null;
      }[]
    >();

  // Une suggestion illisible n'empeche pas de saisir : elle disparait, c'est
  // tout. Le nom se choisit alors dans le menu, comme avant.
  if (error) return new Map();

  const index = new Map<string, PorteurDEnveloppe[]>();

  for (const v of data ?? []) {
    if (!v.croyant) continue;

    const cle = v.enveloppe_numero.trim().toUpperCase();
    const porteurs = index.get(cle) ?? [];

    // Un meme croyant a pu verser vingt fois sous ce numero : on ne le propose
    // qu'une, avec sa date la plus recente — le tri l'a mis en premier.
    if (!porteurs.some((p) => p.croyantId === v.croyant_id)) {
      porteurs.push({
        croyantId: v.croyant_id,
        nom: v.croyant.nom,
        prenom: v.croyant.prenom,
        derniereFois: v.created_at,
      });
      index.set(cle, porteurs);
    }
  }

  // Le tri de la requete servait a DEDOUBLONNER — le versement le plus recent
  // en premier. L'affichage, lui, se lit par ordre ALPHABETIQUE : on y cherche
  // un nom, pas une date.
  for (const porteurs of index.values()) {
    porteurs.sort(
      (a, b) =>
        a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'),
    );
  }

  return index;
}

/**
 * Le mode de saisie DECIDE par chaque entite du perimetre.
 *
 * Derive de l'arbre plutot que d'une requete par entite : le mode effectif
 * vaut « ce que l'entite a decide, sinon le defaut de l'organisation », et il
 * n'y a aucun heritage a resoudre (EF-FIN-28).
 */
export type ModeParEntite = Map<string, ModeDime | null>;

export interface RapprochementEnAttente {
  id: string;
  entite_id: string;
  nom_source: string;
  prenom_source: string | null;
  enveloppe_source: string | null;
  /** Ce que le fichier disait de l'eglise, meme si rien ne l'a reconnu. */
  eglise_source: string | null;
  /** L'entite reconnue a l'import, ou `null` : elle amorce la creation. */
  eglise_id: string | null;
  created_at: string;
  versement: {
    id: string;
    montant: number;
    entree: { id: string; date_operation: string } | null;
  } | null;
  entite: { id: string; nom: string } | null;
}

/**
 * Les lignes d'import qui attendent un NOM — EF-FIN-34.
 *
 * Elles ne sont pas des erreurs : le montant est deja compte, l'argent est
 * recu. Ce qui manque, c'est de savoir A QUI l'attribuer — et cela se decide
 * dans `/croyants`, ou l'on connait les gens.
 *
 * Seules les NON RESOLUES sont chargees : une fois rapprochee, la ligne a fait
 * son office et n'a plus rien a demander.
 */
export const chargerRapprochements = cache(
  async (): Promise<RapprochementEnAttente[]> => {
    const sb = await createClient();

    const { data, error } = await sb
      .from('dime_rapprochements')
      .select(
        'id, entite_id, nom_source, prenom_source, enveloppe_source, ' +
          'eglise_source, eglise_id, created_at, ' +
          'versement:dime_versements!dime_rapprochements_versement_id_fkey (' +
          '  id, montant,' +
          '  entree:finance_entries!dime_versements_finance_entry_id_fkey (id, date_operation)' +
          '), ' +
          'entite:entities!dime_rapprochements_entite_id_fkey (id, nom)',
      )
      .is('croyant_id', null)
      .order('created_at', { ascending: true })
      .limit(2000)
      .returns<RapprochementEnAttente[]>();

    // Une file illisible ne doit pas casser la page des croyants : elle
    // disparait, et le reste de l'ecran continue de servir.
    if (error) return [];
    return data ?? [];
  },
);

export interface VersementDuCroyant {
  id: string;
  /** Le numero EN VIGUEUR AU MOMENT DU VERSEMENT — EF-FIN-35. */
  enveloppe_numero: string | null;
  montant: number;
  recu_numero: string | null;
  nature: NatureVersement;
  created_at: string;
  entree: {
    id: string;
    date_operation: string;
    dime_evenement: EvenementDime | null;
    libelle: string | null;
    dime_remise_id: string | null;
    collecteur: { id: string; nom: string } | null;
  } | null;
}

/**
 * L'historique des versements d'un croyant — EF-FIN-35.
 *
 * LE NUMERO D'ENVELOPPE EST CELUI DU JOUR DU VERSEMENT, pas celui d'aujourd'hui.
 * Il est recopie sur chaque ligne a la saisie (migration `0027`) plutot que lu
 * par jointure : un croyant qui change d'enveloppe ne doit pas voir ses anciens
 * recus se reecrire sous un numero qu'ils n'ont jamais porte. C'est le recu
 * qu'il detient qui fait foi, et il ne change pas.
 *
 * UN TRANSFERT NE REECRIT RIEN DE CET HISTORIQUE — verifie le 21 aout 2026,
 * a la demande de l'utilisateur.
 *
 * L'eglise affichee est `entite_collecte_id`, FIGEE sur le mouvement au moment
 * de la collecte : c'est celle qui a recu l'enveloppe, et elle le restera meme
 * si le croyant part ailleurs demain. La lire par l'eglise COURANTE du croyant
 * aurait retroactivement attribue ses anciennes dimes a sa nouvelle eglise —
 * une reecriture silencieuse de ce qui a ete encaisse.
 *
 * La RLS suit la meme logique : `dime_versements` se voit a travers son
 * mouvement, donc a travers l'entite collectrice. L'eglise d'origine continue
 * de voir ce qu'elle a collecte apres le depart du croyant, ce qui est la seule
 * lecture juste — c'est son argent qui a ete compte.
 *
 * `fn_appliquer_transfert` (migration `0014`) ne touche a aucune table de
 * dimes : l'invariant tient par construction, pas par vigilance.
 *
 * LE TRI SE FAIT ICI, sur la date de CULTE et non sur `created_at` : une
 * feuille importee un mois plus tard placerait sinon un vieux culte en tete.
 * Le volume est celui d'une personne — quelques dizaines de lignes.
 *
 * Ce qui remonte est borne par la RLS : la politique de `dime_versements`
 * delegue a la visibilite du mouvement parent. Une eglise voit donc ce qu'elle
 * a collecte, et le Siege tout. Un versement fait ailleurs par un croyant de
 * passage (EF-FIN-32) n'est pas cache : il appartient a une autre entite.
 */
export async function chargerVersementsDuCroyant(
  croyantId: string,
): Promise<VersementDuCroyant[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('dime_versements')
    .select(
      'id, enveloppe_numero, montant, recu_numero, nature, created_at, ' +
        'entree:finance_entries!dime_versements_finance_entry_id_fkey (' +
        '  id, date_operation, dime_evenement, libelle, dime_remise_id,' +
        '  collecteur:entities!finance_entries_entite_collecte_id_fkey (id, nom)' +
        ')',
    )
    .eq('croyant_id', croyantId)
    .limit(500)
    .returns<VersementDuCroyant[]>();

  // Une fiche ne doit pas devenir illisible parce que l'historique l'est : la
  // carte disparait, le reste de la page continue de servir.
  if (error) return [];

  return (data ?? []).sort((a, b) =>
    (b.entree?.date_operation ?? '').localeCompare(a.entree?.date_operation ?? ''),
  );
}
