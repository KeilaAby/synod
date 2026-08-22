import 'server-only';

import { ENTITY_LABELS, estDescendant } from '@/lib/domain/hierarchy';
import {
  type BlocRapport,
  type ContenuBloc,
  type ContenuRapport,
  type SourceRapport,
  type StructureRapport,
  filtresPoses,
  sourceDuBloc,
} from '@/lib/domain/rapport';
import { storage } from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';

import { type NoeudEntite, getArbrePerimetre } from './entities';
import { getParametres } from './settings';

/**
 * La resolution des sources — EF-RAP-12 a 15.
 *
 * UNE LECTURE PAR SOURCE, JAMAIS UNE PAR BLOC. Un rapport de vingt blocs
 * financiers ne doit pas produire vingt requetes : ce qui coute, c'est le
 * NOMBRE d'allers-retours (regle 28). On collecte donc les sources dont la
 * structure a besoin, on les lit une fois chacune en parallele, puis chaque
 * bloc se sert dans ce qui est deja la.
 *
 * TOUT PASSE PAR LA RLS — EF-RAP-13. Aucune de ces lectures n'utilise la clef
 * de service : elles s'executent sous la session du GENERATEUR, et ce qu'il n'a
 * pas le droit de voir ne revient pas. Le filtre de perimetre ajoute ici borne
 * au sous-arbre CHOISI ; il ne remplace pas la RLS, il la precise.
 *
 * CE QUI SORT D'ICI EST FIGE — RG-27. Le resultat part tel quel dans
 * `report_instances.contenu`, et plus rien ne le recalcule : c'est la seule
 * facon qu'un chiffre cite en conseil reste celui qu'on retrouve trois mois
 * plus tard.
 */

export interface ContexteGeneration {
  /** L'entite sur laquelle porte le rapport — EF-RAP-12. */
  readonly entite: NoeudEntite;
  /** Bornes INCLUSES, au format `AAAA-MM-JJ`. */
  readonly debut: string;
  readonly fin: string;
}

const nombre = (v: number) => new Intl.NumberFormat('fr-FR').format(v);
const montant = (v: number) => `${nombre(Math.round(v))} Ar`;
const jour = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/** Ce qu'une source a rendu, avant d'etre mis en forme par chaque bloc. */
interface Recoltes {
  entites: NoeudEntite[];
  croyants: LigneCroyant[];
  bureaux: LigneBureau[];
  finances: LigneFinance[];
  transferts: LigneTransfert[];
  baptemes: LigneBapteme[];
}

interface LigneCroyant {
  nom: string;
  prenom: string;
  matricule: string;
  statut: string;
  sexe: string;
  created_at: string;
  grade: { libelle: string } | null;
  eglise: { nom: string } | null;
}

interface LigneBureau {
  libelle: string;
  is_active: boolean;
  entite: { nom: string } | null;
  membres: {
    date_debut: string;
    date_fin: string | null;
    croyant: { nom: string; prenom: string } | null;
    fonction: { libelle: string } | null;
  }[];
}

interface LigneFinance {
  date_operation: string;
  sens: string;
  montant: number;
  categorie: { libelle: string } | null;
}

interface LigneTransfert {
  date_demande: string;
  statut: string;
  croyant: { nom: string; prenom: string } | null;
  origine: { nom: string; path: string } | null;
  destination: { nom: string; path: string } | null;
}

interface LigneBapteme {
  date_bapteme: string;
  lieu: string | null;
  croyant: { nom: string; prenom: string } | null;
  entite: { nom: string } | null;
}

const VIDE: Recoltes = {
  entites: [],
  croyants: [],
  bureaux: [],
  finances: [],
  transferts: [],
  baptemes: [],
};

/**
 * Resout le contenu de chaque bloc de donnees — EF-RAP-12 a 15.
 *
 * La structure recue est DEJA passee par `resoudreStructure` : les blocs que
 * l'habilitation n'autorise pas ont ete retires (RG-26), et on ne lit donc
 * jamais une source dont le generateur n'a pas le droit.
 */
export async function resoudreContenu(
  structure: StructureRapport,
  contexte: ContexteGeneration,
): Promise<ContenuRapport> {
  const blocs = structure.sections.flatMap((s) => s.blocs);
  const sources = new Set<SourceRapport>();
  for (const bloc of blocs) {
    const source = sourceDuBloc(bloc);
    if (source) sources.add(source);
  }

  // Un bloc IMAGE n'a pas de SOURCE (`sourceDuBloc` rend `null`) : sans ce
  // second drapeau, un modele qui n'aurait QUE des blocs de mise en page
  // sortait de la fonction avant meme de songer au logo.
  const contientImage = blocs.some((b) => b.type === 'IMAGE');

  const [recoltes, logo] = await Promise.all([
    sources.size > 0 ? recolter(sources, contexte) : Promise.resolve(VIDE),
    contientImage ? logoPourEntite(contexte.entite) : Promise.resolve(null),
  ]);

  const contenu: ContenuRapport = {};
  for (const bloc of blocs) {
    if (bloc.type === 'IMAGE') {
      // Aucun logo regle : le bloc est absent de `contenu`, comme un bloc de
      // donnees dont `composer` n'a rien produit — le rendu le dit (regle 15).
      if (logo) contenu[bloc.id] = { genre: 'IMAGE', dataUri: logo };
      continue;
    }

    const source = sourceDuBloc(bloc);
    if (!source) continue;

    /**
     * EF-RAP-03 — LES FILTRES S'APPLIQUENT PAR BLOC, PAS PAR LECTURE.
     *
     * Deux blocs peuvent partager une source et la restreindre differemment —
     * « les hommes » d'un cote, « les femmes » de l'autre. Filtrer dans la
     * requete demanderait alors DEUX lectures de la meme table, quand une
     * seule suffit : on recolte une fois le perimetre entier, et chaque bloc
     * y taille sa part en memoire (regle 28).
     */
    const resolu = composer(bloc, source, filtrer(recoltes, bloc, source), contexte);
    if (resolu) contenu[bloc.id] = resolu;
  }
  return contenu;
}

/**
 * Le logo du bloc Image, embarque en `data:` — ou `null` si NI l'entite NI
 * l'organisation n'en ont regle un.
 *
 * DEUX NIVEAUX, PAS UNE HIERARCHIE A ESCALADER (migration `0073`, demande de
 * l'utilisateur le 22 aout apres avoir teste le premier jet — celui-ci ne
 * connaissait que le logo de l'organisation). L'entite VISEE par le rapport
 * porte peut-etre son propre `logo_key` ; a defaut, celui de l'organisation
 * (`organisation_settings.logo_key`) prend le relais. Rien ne remonte par les
 * ancetres : une eglise sans en-tete n'emprunte pas celui de sa paroisse,
 * elle prend directement celui de l'ORGANISATION — un parcours de l'arbre a
 * la generation coûterait une lecture de plus par niveau, pour un resultat
 * moins previsible qu'un simple « le sien, sinon celui de tous ».
 *
 * UNE SEULE LECTURE MEME AVEC PLUSIEURS BLOCS IMAGE : `resoudreContenu` ne
 * l'appelle qu'une fois, avant la boucle, et chaque bloc y puise (regle 28).
 * Un stockage indisponible degrade comme les autres sources — le bloc
 * disparait de `contenu`, il ne fait pas echouer toute la generation.
 */
async function logoPourEntite(entite: NoeudEntite): Promise<string | null> {
  const cle = entite.logo_key ?? (await getParametres()).logo_key;
  if (!cle) return null;

  const telechargement = await storage().download(cle);
  if (!telechargement.ok) {
    console.error('[rapport] logo illisible', telechargement.error);
    return null;
  }

  return `data:${telechargement.data.contentType};base64,${telechargement.data.base64}`;
}

/**
 * La part des recoltes qu'un bloc retient — EF-RAP-03.
 *
 * PURE, et bornee aux filtres que `filtresPoses` a valides : un filtre inconnu
 * de la source, ou dont la valeur n'existe pas, est ignore plutot que
 * d'exclure tout. Un modele dont la source a change ne doit pas rendre un
 * tableau vide qu'on lirait « il n'y a rien ».
 */
function filtrer(r: Recoltes, bloc: BlocRapport, source: SourceRapport): Recoltes {
  const poses = filtresPoses(bloc);
  if (Object.keys(poses).length === 0) return r;

  /**
   * ON NE TAILLE QUE DANS LA SOURCE DU BLOC.
   *
   * `statut` existe pour les croyants ET pour les transferts, avec des valeurs
   * differentes. Appliquer aveuglement la table de filtres a toutes les
   * recoltes ferait qu'un bloc de croyants filtre sur « ACTIF » viderait aussi
   * les transferts — sans consequence aujourd'hui, puisque ce bloc ne les lit
   * pas, mais c'est exactement le genre de coincidence qui cesse d'etre vraie
   * le jour ou un bloc croise deux sources.
   */
  switch (source) {
    case 'CROYANTS':
      return {
        ...r,
        croyants: r.croyants.filter(
          (c) =>
            (!poses.sexe || c.sexe === poses.sexe) &&
            (!poses.statut || c.statut === poses.statut),
        ),
      };

    case 'FINANCES':
      return { ...r, finances: r.finances.filter((f) => !poses.sens || f.sens === poses.sens) };

    case 'ENTITES':
      return {
        ...r,
        entites: r.entites.filter((e) => !poses.niveau || e.type === poses.niveau),
      };

    case 'BUREAUX':
      return {
        ...r,
        bureaux: r.bureaux.filter(
          (b) => !poses.etat || b.is_active === (poses.etat === 'EN_COURS'),
        ),
      };

    case 'TRANSFERTS':
      return {
        ...r,
        transferts: r.transferts.filter((t) => !poses.statut || t.statut === poses.statut),
      };

    default:
      return r;
  }
}

// -----------------------------------------------------------------------------
// La recolte
// -----------------------------------------------------------------------------

async function recolter(
  sources: Set<SourceRapport>,
  contexte: ContexteGeneration,
): Promise<Recoltes> {
  const sb = await createClient();
  const arbre = await getArbrePerimetre();

  // Le sous-arbre de l'entite choisie, elle comprise. `estDescendant` compare
  // des chemins `ltree` : c'est la MEME regle que la RLS applique en base.
  const sousArbre = arbre.filter((e) => estDescendant(e.path, contexte.entite.path));
  const ids = sousArbre.map((e) => e.id);
  const eglises = sousArbre.filter((e) => e.type === 'EGLISE').map((e) => e.id);

  const dans = (colonne: string, liste: string[]) => liste.length > 0;

  /**
   * Les lectures sont INDEPENDANTES : `Promise.all` (regle 28). Enchainees,
   * une generation a six sources paierait six attentes l'une apres l'autre —
   * entre trois et vingt-quatre secondes sur cette liaison.
   */
  const [croyants, bureaux, finances, transferts, baptemes] = await Promise.all([
    sources.has('CROYANTS') && dans('eglise_id', eglises)
      ? sb
          .from('croyants')
          .select(
            'nom, prenom, matricule, statut, sexe, created_at, ' +
              'grade:grades!croyants_grade_id_fkey (libelle), ' +
              'eglise:entities!croyants_eglise_id_fkey (nom)',
          )
          .is('deleted_at', null)
          .in('eglise_id', eglises)
          .order('nom')
          .limit(5000)
          .returns<LigneCroyant[]>()
      : null,

    sources.has('BUREAUX') && dans('entity_id', ids)
      ? sb
          .from('bureaux')
          .select(
            'libelle, is_active, ' +
              'entite:entities!bureaux_entity_id_fkey (nom), ' +
              'membres:bureau_membres!bureau_membres_bureau_id_fkey (' +
              'date_debut, date_fin, ' +
              'croyant:croyants!bureau_membres_croyant_id_fkey (nom, prenom), ' +
              'fonction:fonctions!bureau_membres_fonction_id_fkey (libelle))',
          )
          .is('deleted_at', null)
          .in('entity_id', ids)
          .limit(500)
          .returns<LigneBureau[]>()
      : null,

    sources.has('FINANCES') && dans('entity_id', ids)
      ? sb
          .from('finance_entries')
          .select(
            'date_operation, sens, montant, ' +
              'categorie:finance_categories!finance_entries_categorie_id_fkey (libelle)',
          )
          .in('entity_id', ids)
          // SEULS LES MOUVEMENTS VALIDES. Un brouillon n'est pas un fait
          // comptable : le porter dans un rapport diffuse ferait citer une
          // somme que personne n'a arretee.
          .eq('statut', 'VALIDE')
          .gte('date_operation', contexte.debut)
          .lte('date_operation', contexte.fin)
          .order('date_operation')
          .limit(5000)
          .returns<LigneFinance[]>()
      : null,

    sources.has('TRANSFERTS')
      ? sb
          .from('transferts')
          .select(
            'date_demande, statut, ' +
              'croyant:croyants!transferts_croyant_id_fkey (nom, prenom), ' +
              'origine:entities!transferts_from_eglise_id_fkey (nom, path), ' +
              'destination:entities!transferts_to_eglise_id_fkey (nom, path)',
          )
          .gte('date_demande', contexte.debut)
          .lte('date_demande', contexte.fin)
          .order('date_demande', { ascending: false })
          .limit(2000)
          .returns<LigneTransfert[]>()
      : null,

    sources.has('BAPTEMES') && dans('entity_id', ids)
      ? sb
          .from('baptemes')
          .select(
            'date_bapteme, lieu, ' +
              'croyant:croyants!baptemes_croyant_id_fkey (nom, prenom), ' +
              'entite:entities!baptemes_entity_id_fkey (nom)',
          )
          .in('entity_id', ids)
          .gte('date_bapteme', contexte.debut)
          .lte('date_bapteme', contexte.fin)
          .order('date_bapteme', { ascending: false })
          .limit(2000)
          .returns<LigneBapteme[]>()
      : null,
  ]);

  /**
   * UNE LECTURE QUI ECHOUE NE FAIT PAS TOMBER LA GENERATION.
   *
   * Elle rend une source vide, et le bloc affichera zero. C'est un compromis
   * assume : un rapport partiel vaut mieux qu'aucun rapport, et le contenu
   * etant FIGE (RG-27), il porte la trace de ce qu'on a su lire ce jour-la.
   * Le journal serveur garde le detail.
   */
  const lignes = <T>(reponse: { data: T[] | null; error: unknown } | null): T[] => {
    if (!reponse) return [];
    if (reponse.error) {
      console.error('[rapport] source illisible', reponse.error);
      return [];
    }
    return reponse.data ?? [];
  };

  return {
    ...VIDE,
    entites: sousArbre,
    croyants: lignes(croyants),
    bureaux: lignes(bureaux),
    finances: lignes(finances),
    // Le perimetre des transferts se borne ICI : ni l'origine ni la
    // destination ne sont des colonnes du sous-arbre, ce sont des chemins.
    transferts: lignes(transferts).filter(
      (t) =>
        estDescendant(t.destination?.path ?? '', contexte.entite.path) ||
        estDescendant(t.origine?.path ?? '', contexte.entite.path),
    ),
    baptemes: lignes(baptemes),
  };
}

// -----------------------------------------------------------------------------
// La mise en forme, bloc par bloc
// -----------------------------------------------------------------------------

function composer(
  bloc: BlocRapport,
  source: SourceRapport,
  r: Recoltes,
  contexte: ContexteGeneration,
): ContenuBloc | null {
  switch (bloc.type) {
    case 'INDICATEUR':
      return indicateur(source, r);
    case 'TABLEAU':
      return tableau(source, r);
    case 'GRAPHIQUE':
      return serie(source, r, contexte);
    case 'JAUGE':
      return jauge(source, r);
    case 'FRISE':
      return frise(source, r);
    case 'ORGANIGRAMME':
      return {
        genre: 'ARBRE',
        racine: contexte.entite.nom,
        enfants: r.entites
          .filter((e) => e.parent_id === contexte.entite.id)
          .map((e) => e.nom)
          .slice(0, 8),
      };
    default:
      return null;
  }
}

function soldeDe(r: Recoltes): number {
  return r.finances.reduce(
    (total, m) => total + (m.sens === 'RECETTE' ? m.montant : -m.montant),
    0,
  );
}

function indicateur(source: SourceRapport, r: Recoltes): ContenuBloc {
  switch (source) {
    case 'CROYANTS':
      return {
        genre: 'INDICATEUR',
        valeur: nombre(r.croyants.filter((c) => c.statut === 'ACTIF').length),
        legende: 'Croyants actifs',
      };
    case 'ENTITES':
      return {
        genre: 'INDICATEUR',
        valeur: nombre(Math.max(0, r.entites.length - 1)),
        legende: 'Entités rattachées',
      };
    case 'BUREAUX':
      return {
        genre: 'INDICATEUR',
        valeur: nombre(r.bureaux.filter((b) => b.is_active).length),
        legende: 'Bureaux en cours',
      };
    case 'FINANCES':
      return { genre: 'INDICATEUR', valeur: montant(soldeDe(r)), legende: 'Solde de la période' };
    case 'TRANSFERTS':
      return {
        genre: 'INDICATEUR',
        valeur: nombre(r.transferts.length),
        legende: 'Transferts de la période',
      };
    case 'BAPTEMES':
      return {
        genre: 'INDICATEUR',
        valeur: nombre(r.baptemes.length),
        legende: 'Baptisés sur la période',
      };
  }
}

/** Les tableaux sont BORNES a cinquante lignes : un rapport n'est pas un export. */
const PLAFOND_LIGNES = 50;

function tableau(source: SourceRapport, r: Recoltes): ContenuBloc {
  switch (source) {
    case 'CROYANTS':
      return {
        genre: 'TABLEAU',
        colonnes: ['Nom', 'Matricule', 'Grade', 'Église'],
        lignes: r.croyants
          .slice(0, PLAFOND_LIGNES)
          .map((c) => [
            `${c.nom} ${c.prenom}`.trim(),
            c.matricule,
            c.grade?.libelle ?? '—',
            c.eglise?.nom ?? '—',
          ]),
      };

    case 'ENTITES':
      return {
        genre: 'TABLEAU',
        colonnes: ['Entité', 'Type', 'Code'],
        lignes: r.entites
          .slice(0, PLAFOND_LIGNES)
          .map((e) => [e.nom, ENTITY_LABELS[e.type].singulier, e.code]),
      };

    case 'BUREAUX':
      return {
        genre: 'TABLEAU',
        colonnes: ['Fonction', 'Titulaire', 'Depuis'],
        lignes: r.bureaux
          .flatMap((b) =>
            b.membres
              .filter((m) => m.date_fin === null)
              .map((m) => [
                m.fonction?.libelle ?? '—',
                m.croyant ? `${m.croyant.nom} ${m.croyant.prenom}`.trim() : 'Vacant',
                jour(m.date_debut),
              ]),
          )
          .slice(0, PLAFOND_LIGNES),
      };

    case 'FINANCES':
      return {
        genre: 'TABLEAU',
        colonnes: ['Date', 'Catégorie', 'Sens', 'Montant'],
        lignes: r.finances
          .slice(0, PLAFOND_LIGNES)
          .map((m) => [
            jour(m.date_operation),
            m.categorie?.libelle ?? '—',
            m.sens === 'RECETTE' ? 'Recette' : 'Dépense',
            montant(m.montant),
          ]),
      };

    case 'TRANSFERTS':
      return {
        genre: 'TABLEAU',
        colonnes: ['Croyant', 'Origine', 'Destination', 'Statut'],
        lignes: r.transferts
          .slice(0, PLAFOND_LIGNES)
          .map((t) => [
            t.croyant ? `${t.croyant.nom} ${t.croyant.prenom}`.trim() : '—',
            t.origine?.nom ?? '—',
            t.destination?.nom ?? '—',
            t.statut,
          ]),
      };

    case 'BAPTEMES':
      return {
        genre: 'TABLEAU',
        colonnes: ['Baptisé', 'Date', 'Lieu'],
        lignes: r.baptemes
          .slice(0, PLAFOND_LIGNES)
          .map((b) => [
            b.croyant ? `${b.croyant.nom} ${b.croyant.prenom}`.trim() : '—',
            jour(b.date_bapteme),
            b.lieu ?? (b.entite?.nom ?? '—'),
          ]),
      };
  }
}

const MOIS_COURTS = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Août',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
];

/**
 * Une serie se compte PAR MOIS de la periode demandee.
 *
 * Les mois SANS EVENEMENT figurent a zero, ils ne disparaissent pas : une
 * courbe dont les creux sont absents remonte toute seule, et ment sur la
 * tendance qu'elle est justement la pour montrer (regle 15).
 */
function moisDeLaPeriode(contexte: ContexteGeneration): { cle: string; libelle: string }[] {
  const mois: { cle: string; libelle: string }[] = [];
  const debut = new Date(`${contexte.debut}T00:00:00Z`);
  const fin = new Date(`${contexte.fin}T00:00:00Z`);

  const curseur = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth(), 1));
  while (curseur <= fin && mois.length < 24) {
    mois.push({
      cle: curseur.toISOString().slice(0, 7),
      libelle: MOIS_COURTS[curseur.getUTCMonth()]!,
    });
    curseur.setUTCMonth(curseur.getUTCMonth() + 1);
  }
  return mois;
}

function serie(
  source: SourceRapport,
  r: Recoltes,
  contexte: ContexteGeneration,
): ContenuBloc {
  const mois = moisDeLaPeriode(contexte);

  const compter = (dates: string[]) =>
    mois.map(({ cle }) => dates.filter((d) => d.startsWith(cle)).length);

  switch (source) {
    case 'FINANCES':
      return {
        genre: 'SERIE',
        libelles: mois.map((m) => m.libelle),
        valeurs: mois.map(({ cle }) =>
          r.finances
            .filter((m) => m.date_operation.startsWith(cle) && m.sens === 'RECETTE')
            .reduce((s, m) => s + m.montant, 0),
        ),
        legende: 'Recettes par mois',
      };

    case 'BAPTEMES':
      return {
        genre: 'SERIE',
        libelles: mois.map((m) => m.libelle),
        valeurs: compter(r.baptemes.map((b) => b.date_bapteme)),
        legende: 'Baptêmes par mois',
      };

    case 'TRANSFERTS':
      return {
        genre: 'SERIE',
        libelles: mois.map((m) => m.libelle),
        valeurs: compter(r.transferts.map((t) => t.date_demande)),
        legende: 'Transferts par mois',
      };

    default:
      return {
        genre: 'SERIE',
        libelles: mois.map((m) => m.libelle),
        valeurs: compter(r.croyants.map((c) => c.created_at)),
        legende: 'Fiches créées par mois',
      };
  }
}

function jauge(source: SourceRapport, r: Recoltes): ContenuBloc {
  if (source === 'BUREAUX') {
    /**
     * Couverture des bureaux — meme regle qu'EF-DSH-05 : LES CELLULES SONT HORS
     * DU DENOMINATEUR. Elles n'ont pas de bureau, et les compter ferait plonger
     * la couverture de celles qui vont le mieux.
     */
    const eligibles = r.entites.filter((e) => e.type !== 'CELLULE');
    const pourvues = new Set(
      r.bureaux.filter((b) => b.is_active).map((b) => b.entite?.nom ?? ''),
    );

    return {
      genre: 'JAUGE',
      atteint: eligibles.filter((e) => pourvues.has(e.nom)).length,
      total: eligibles.length,
      legende: 'Entités dotées d’un bureau',
    };
  }

  if (source === 'CROYANTS') {
    return {
      genre: 'JAUGE',
      atteint: r.croyants.filter((c) => c.statut === 'ACTIF').length,
      total: r.croyants.length,
      legende: 'Croyants actifs sur l’effectif',
    };
  }

  const total = r.finances.length;
  return {
    genre: 'JAUGE',
    atteint: r.finances.filter((m) => m.sens === 'RECETTE').length,
    total,
    legende: 'Recettes sur les mouvements',
  };
}

function frise(source: SourceRapport, r: Recoltes): ContenuBloc {
  const evenements =
    source === 'BAPTEMES'
      ? r.baptemes.slice(0, 12).map((b) => ({
          date: jour(b.date_bapteme),
          texte: `Baptême — ${b.croyant ? `${b.croyant.nom} ${b.croyant.prenom}`.trim() : 'sans nom'}`,
        }))
      : r.transferts.slice(0, 12).map((t) => ({
          date: jour(t.date_demande),
          texte: `${t.croyant ? `${t.croyant.nom} ${t.croyant.prenom}`.trim() : 'Transfert'} — ${t.origine?.nom ?? '—'} vers ${t.destination?.nom ?? '—'}`,
        }));

  return { genre: 'FRISE', evenements };
}
