import { LIBELLES_STATUT_TRANSFERT, type StatutTransfert } from './transfert';

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

export type TypeEvenement = 'CREATION' | 'BAPTEME' | 'TRANSFERT';

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
  eglise?: { nom: string } | null;
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

export function construireHistorique(
  croyant: CroyantHistorique,
  transferts: readonly TransfertHistorique[],
): EvenementCroyant[] {
  const evenements: EvenementCroyant[] = [
    {
      cle: 'creation',
      date: croyant.created_at,
      type: 'CREATION',
      titre: 'Fiche creee',
      detail: croyant.eglise?.nom ? `Rattache a ${croyant.eglise.nom}` : undefined,
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
    const decideur = t.decideur?.nom_complet;
    const demandeur = t.demandeur?.nom_complet;

    evenements.push({
      cle: `transfert:${t.id}`,
      date: dateDeReference(t),
      type: 'TRANSFERT',
      titre: titreTransfert(t),
      detail:
        t.statut === 'DEMANDE'
          ? demandeur
            ? `Demande par ${demandeur}`
            : undefined
          : decideur
            ? `${LIBELLES_STATUT_TRANSFERT[t.statut]} par ${decideur}`
            : LIBELLES_STATUT_TRANSFERT[t.statut],
      // Le motif du REFUS prime : c'est lui qui explique l'issue.
      note: t.motif_refus ?? t.motif ?? undefined,
      statut: t.statut,
      enAttente: t.statut === 'DEMANDE' || t.statut === 'APPROUVE',
    });
  }

  // Antechronologique : le plus recent en tete, comme partout ailleurs.
  return evenements.sort((a, b) => b.date.localeCompare(a.date));
}
