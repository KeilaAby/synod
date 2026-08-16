import 'server-only';

import {
  DISPOSITION_VIDE,
  type DispositionTableauDeBord,
  estDisposition,
} from '@/lib/domain/kpi';
import { createClient } from '@/lib/supabase/server';

/**
 * Les indicateurs d'un perimetre — EF-DSH-01 a 04.
 *
 * UN SEUL ALLER-RETOUR pour quinze mesures. Les demander une par une couterait
 * quinze fois 0,5 a 4 secondes avant le premier chiffre, soit une minute pour
 * une page qui doit s'ouvrir d'un coup (regle 28).
 *
 * `fn_tableau_de_bord` est SECURITY INVOKER : la RLS borne le resultat a la
 * portee de l'appelant, et cet ecran n'a aucun filtrage a refaire.
 */

export type MesuresTableauDeBord = Record<string, number>;

/** Ce que rend la fonction quand rien n'est lisible : des zeros, pas `null`. */
const VIDE: MesuresTableauDeBord = {
  croyants: 0,
  femmes: 0,
  hommes: 0,
  nouveaux_baptises: 0,
  encellules: 0,
  cellules: 0,
  eglises: 0,
  paroisses: 0,
  districts: 0,
  regionaux: 0,
  membres_bureau: 0,
  membres_finances: 0,
  bureaux_actifs: 0,
  recettes: 0,
  depenses: 0,
  solde_consolide: 0,
  transferts_attente: 0,
  mouvements_attente: 0,
};

export interface ResultatTableauDeBord {
  readonly mesures: MesuresTableauDeBord;
  /**
   * La lecture a-t-elle ECHOUE ?
   *
   * A distinguer d'un perimetre reellement vide (regle 15) : des zeros affiches
   * sans nuance se lisent « nous ne sommes rien », quand la verite peut etre
   * « la mesure n'a pas abouti ». L'ecran le dit.
   */
  readonly illisible: boolean;
}

export async function chargerTableauDeBord(
  entityId: string,
  debut: string,
  fin: string,
): Promise<ResultatTableauDeBord> {
  const sb = await createClient();

  const { data, error } = await sb.rpc('fn_tableau_de_bord', {
    p_entity: entityId,
    p_debut: debut,
    p_fin: fin,
  });

  if (error) return { mesures: VIDE, illisible: true };

  const ligne = (data as Record<string, unknown>[] | null)?.[0];
  if (!ligne) return { mesures: VIDE, illisible: true };

  /**
   * `numeric` traverse PostgREST en CHAINE, pour ne pas perdre de precision en
   * JSON : sans `Number()`, « 1000 » + « 200 » ferait « 1000200 ».
   */
  const mesures: MesuresTableauDeBord = { ...VIDE };
  for (const cle of Object.keys(VIDE)) {
    mesures[cle] = Number(ligne[cle] ?? 0);
  }

  return { mesures, illisible: false };
}

/**
 * La disposition enregistree par le compte courant — EF-DSH-03, EF-DSH-07.
 *
 * LA COLONNE EST DU `jsonb` QUE RIEN NE CONTRAINT : elle a pu etre ecrite par
 * une version anterieure du produit, ou a la main par un appel direct a l'API.
 * `estDisposition` verifie donc la forme avant de la rendre — une valeur
 * inattendue traversant vers le client ferait echouer la page ENTIERE
 * (regle 24), et un tableau de bord blanc pour une preference d'affichage
 * serait une panne absurde.
 *
 * En cas de doute, on retombe sur la disposition VIDE : l'ordre du registre,
 * qui est un defaut valable pour tout le monde.
 */
export async function chargerDisposition(): Promise<DispositionTableauDeBord> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('dashboard_layouts')
    .select('layout')
    .maybeSingle<{ layout: unknown }>();

  if (error || !data) return DISPOSITION_VIDE;

  return estDisposition(data.layout)
    ? { ordre: data.layout.ordre, masques: data.layout.masques }
    : DISPOSITION_VIDE;
}

export interface CroyantRecent {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  photoKey: string | null;
  dateBapteme: string;
  createdAt: string;
  egliseNom: string | null;
}

/** Cinq lignes : au-dela, ce n'est plus « qui vient d'arriver », c'est la liste. */
export const DERNIERS_CROYANTS = 5;

/**
 * Les dernieres fiches enregistrees — EF-DSH-05.
 *
 * UN EFFECTIF DIT COMBIEN NOUS SOMMES, jamais QUI a rejoint. C'est pourtant la
 * premiere chose qu'un responsable regarde, et la seule qui appelle un geste :
 * accueillir quelqu'un.
 *
 * TRIEES PAR DATE DE CREATION DE LA FICHE, pas par date de bapteme. Les deux
 * different : une reprise de donnees enregistre en mars des baptemes de
 * l'annee derniere, et c'est bien « ce qui vient d'entrer dans le registre »
 * qu'on veut voir ici — la fenetre des nouveaux baptises, elle, a son propre
 * indicateur (RG-30).
 *
 * La RLS borne la lecture au perimetre ; une lecture illisible rend une liste
 * vide, et le bloc le dit plutot que de disparaitre.
 */
export async function chargerDerniersCroyants(): Promise<CroyantRecent[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('croyants')
    .select(
      'id, nom, prenom, matricule, photo_key, date_bapteme, created_at, ' +
        'eglise:entities!croyants_eglise_id_fkey (nom)',
    )
    .is('deleted_at', null)
    .eq('statut', 'ACTIF')
    .order('created_at', { ascending: false })
    .limit(DERNIERS_CROYANTS)
    .returns<
      {
        id: string;
        nom: string;
        prenom: string;
        matricule: string;
        photo_key: string | null;
        date_bapteme: string;
        created_at: string;
        eglise: { nom: string } | null;
      }[]
    >();

  if (error) return [];

  return (data ?? []).map((c) => ({
    id: c.id,
    nom: c.nom,
    prenom: c.prenom,
    matricule: c.matricule,
    photoKey: c.photo_key,
    dateBapteme: c.date_bapteme,
    createdAt: c.created_at,
    egliseNom: c.eglise?.nom ?? null,
  }));
}
