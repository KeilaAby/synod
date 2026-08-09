import { type EntityType, designerEntite } from './hierarchy';
import type { StatutTransfert } from './transfert';

/**
 * Historique d'un croyant — EF-TRF-08, EF-CRO-06.
 *
 * Module PUR : il compose une frise a partir de faits deja lus, sans rien
 * interroger. C'est ce qui permet de le tester sans base ni navigateur.
 *
 * PRINCIPE — la frise raconte ce qui est ARRIVE au croyant, pas ce qui a ete
 * saisi sur sa fiche. Une correction de numero de telephone n'y figure donc
 * pas : elle appartient au journal d'audit, qui repond a une autre question
 * (« qui a change quoi »). Melanger les deux produirait une frise ou l'essentiel
 * — un bapteme, un transfert — se noierait dans la correction d'une faute de
 * frappe.
 */

export type TypeEvenement = 'CREATION' | 'BAPTEME' | 'TRANSFERT' | 'MANDAT';

export interface EvenementCroyant {
  readonly cle: string;
  /** Date ISO servant au tri et a l'affichage. */
  readonly date: string;
  readonly type: TypeEvenement;
  readonly titre: string;
  readonly detail?: string;
  /** Motif invoque, ou motif de refus : le texte que l'humain a ecrit. */
  readonly note?: string;
  /** Present pour un transfert seulement : colore la pastille. */
  readonly statut?: StatutTransfert;
  /** Un evenement en attente n'est pas encore arrive : la frise le distingue. */
  readonly enAttente: boolean;
}

export interface TransfertHistorique {
  id: string;
  statut: StatutTransfert;
  motif: string | null;
  motif_refus: string | null;
  date_demande: string;
  date_decision: string | null;
  date_effet: string | null;
  origine: { nom: string } | null;
  destination: { nom: string } | null;
  celluleDestination: { nom: string } | null;
  demandeur: { nom_complet: string } | null;
  decideur: { nom_complet: string } | null;
}

export interface CroyantHistorique {
  created_at: string;
  date_bapteme: string | null;
  eglise?: { nom: string; type: EntityType } | null;
  /** Qui a enregistre la fiche. `null` : compte depuis supprime. */
  createur?: { nom_complet: string } | null;
}

/** EF-BUR-10 — une fonction occupee, telle qu'elle se lit sur la frise. */
export interface MandatHistorique {
  id: string;
  date_debut: string;
  date_fin: string | null;
  fonction: { libelle: string } | null;
  bureau: { libelle: string; entite: { nom: string; type: EntityType } | null } | null;
}

/**
 * La date qui situe REELLEMENT l'evenement sur la frise.
 *
 * Un transfert effectue se lit a sa date d'effet, pas a celle de sa demande :
 * c'est le jour ou le croyant a change d'eglise qui compte. Un refus se lit a
 * la date de decision. Une demande en attente n'a que sa date de demande.
 */
function dateDeReference(t: TransfertHistorique): string {
  if (t.statut === 'EFFECTUE' && t.date_effet) return t.date_effet;
  if (t.date_decision) return t.date_decision;
  return t.date_demande;
}

function titreTransfert(t: TransfertHistorique): string {
  const vers = t.destination?.nom ?? 'une autre eglise';
  const de = t.origine?.nom;

  switch (t.statut) {
    case 'EFFECTUE':
      return de ? `Transfere de ${de} vers ${vers}` : `Rattache a ${vers}`;
    case 'REFUSE':
      return `Transfert vers ${vers} refuse`;
    case 'ANNULE':
      return `Demande de transfert vers ${vers} retiree`;
    case 'APPROUVE':
      return `Transfert vers ${vers} approuve, application en cours`;
    default:
      return `Transfert demande vers ${vers}`;
  }
}

/**
 * EF-TRF-06 — QUI a demande, QUI a decide, et quand.
 *
 * L'evenement porte deja SA date ; ce recit porte l'AUTRE. Un transfert
 * effectue le 3 juin se lit mieux avec « demande le 1er juin par Christian,
 * approuve le 2 par le Siege » : c'est cet ecart de dates, et cette chaine de
 * responsabilite, qu'on vient verifier dans un historique.
 *
 * Un compte peut avoir ete supprime depuis (`on delete set null`) : on le dit
 * plutot que d'afficher un blanc, qui ferait croire a une donnee manquante.
 */
function recitDeLaDecision(t: TransfertHistorique): string {
  const auteur = (nom: string | undefined) => nom ?? 'un compte depuis supprime';
  const demande = `Demande le ${jour(t.date_demande)} par ${auteur(t.demandeur?.nom_complet)}`;

  if (t.statut === 'DEMANDE') return demande;

  const verbe =
    t.statut === 'REFUSE' ? 'Refuse' : t.statut === 'ANNULE' ? 'Retire' : 'Approuve';

  const decision = t.date_decision
    ? `${verbe} le ${jour(t.date_decision)} par ${auteur(t.decideur?.nom_complet)}`
    : `${verbe} par ${auteur(t.decideur?.nom_complet)}`;

  return `${demande} · ${decision}`;
}

/** Date courte, sans l'heure : la frise raconte des jours, pas des minutes. */
function jour(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function construireHistorique(
  croyant: CroyantHistorique,
  transferts: readonly TransfertHistorique[],
  mandats: readonly MandatHistorique[] = [],
): EvenementCroyant[] {
  const evenements: EvenementCroyant[] = [
    {
      cle: 'creation',
      date: croyant.created_at,
      type: 'CREATION',
      // QUI a enregistre la fiche. Un compte peut avoir ete supprime depuis
      // (`on delete set null`) : on le dit plutot que d'afficher un blanc, qui
      // ferait croire a une donnee manquante.
      titre: croyant.createur
        ? `Fiche creee par ${croyant.createur.nom_complet}`
        : 'Fiche creee',
      // Le TYPE avec le nom : « ANTSAHATSIRESY » seul ne dit pas si c'est une
      // eglise, une paroisse ou un district — or c'est justement ce que le
      // rattachement d'un croyant designe (RG-04).
      detail: croyant.eglise
        ? `Rattache ${designerEntite(croyant.eglise.type, croyant.eglise.nom, 'a')}`
        : undefined,
      enAttente: false,
    },
  ];

  // La date de bapteme est facultative : sans elle, l'evenement n'existe pas.
  if (croyant.date_bapteme) {
    evenements.push({
      cle: 'bapteme',
      date: croyant.date_bapteme,
      type: 'BAPTEME',
      titre: 'Bapteme',
      enAttente: false,
    });
  }

  for (const t of transferts) {
    evenements.push({
      cle: `transfert:${t.id}`,
      date: dateDeReference(t),
      type: 'TRANSFERT',
      titre: titreTransfert(t),
      detail: recitDeLaDecision(t),
      // Le motif du REFUS prime : c'est lui qui explique l'issue.
      note: t.motif_refus ?? t.motif ?? undefined,
      statut: t.statut,
      enAttente: t.statut === 'DEMANDE' || t.statut === 'APPROUVE',
    });
  }

  /**
   * EF-BUR-10 — les fonctions occupees.
   *
   * Un mandat se situe a sa PRISE DE FONCTION, pas a sa fin : c'est le jour ou
   * la personne est devenue tresoriere qui fait evenement. La cloture se lit
   * dans le detail, et un mandat en cours se distingue de celui qui s'est
   * acheve.
   */
  for (const m of mandats) {
    const fonction = m.fonction?.libelle ?? 'une fonction';
    const entite = m.bureau?.entite;

    /**
     * Le titre dit CE QU'ON ETAIT, le detail dit QUAND et A QUEL TITRE.
     *
     * « President — ANTSAHATSIRESY » obligeait a deviner : president de quoi,
     * et ANTSAHATSIRESY est-il une eglise ou un district ? La frise raconte une
     * vie, et une ligne d'histoire se lit sans avoir a la reconstituer.
     */
    evenements.push({
      cle: `mandat:${m.id}`,
      date: m.date_debut,
      type: 'MANDAT',
      titre: entite
        ? `Membre de bureau ${designerEntite(entite.type, entite.nom, 'de')}`
        : 'Membre de bureau',
      detail: m.date_fin
        ? `du ${jour(m.date_debut)} au ${jour(m.date_fin)} : ${fonction}`
        : `depuis le ${jour(m.date_debut)} : ${fonction}`,
      // Un mandat clos n'est pas « en attente » : il a bien eu lieu.
      enAttente: false,
    });
  }

  // Antechronologique : le plus recent en tete, comme partout ailleurs.
  return evenements.sort((a, b) => b.date.localeCompare(a.date));
}
