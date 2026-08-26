import { type EntityType, designerEntite } from './hierarchy';
import { estRetrogradation } from './promotion';
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

export type TypeEvenement = 'CREATION' | 'BAPTEME' | 'TRANSFERT' | 'MANDAT' | 'GRADE';

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
/**
 * EF-CRO-12 — un changement de grade, tel que la frise le lit.
 *
 * LES DEUX GRADES SONT LA, pas seulement le nouveau : « Diacre » seul ne dit
 * pas si c'est une montee, une correction ou une descente. Les deux ensemble
 * se lisent des annees plus tard, quand la fiche porte deja autre chose.
 *
 * L'OPERATEUR ET LE VALIDATEUR SONT DEUX PERSONNES DIFFERENTES, et la frise
 * les nomme toutes les deux : c'est tout l'objet du circuit. `decideur` reste
 * nul quand aucune validation n'a eu lieu — l'y mettre l'operateur ferait
 * croire a un controle qui ne s'est pas produit.
 */
export interface GradeHistorique {
  id: string;
  statut: string;
  date_demande: string;
  date_decision: string | null;
  motif: string | null;
  motif_refus: string | null;
  /**
   * `ordre` accompagne le libelle, et il n'est pas decoratif : sans lui, la
   * frise dirait « Grade : Croyant vers Diacre » sans pouvoir nommer le
   * MOUVEMENT. Or c'est le mouvement qu'on lit — promotion ou degradation —,
   * et deux libelles cote a cote ne le disent qu'a qui connait deja la
   * hierarchie des grades.
   */
  gradeActuel: { libelle: string; ordre: number } | null;
  gradeDemande: { libelle: string; ordre: number } | null;
  demandeur: { nom_complet: string } | null;
  decideur: { nom_complet: string } | null;
}

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
  /** EF-CRO-12 — les changements de grade DÉCIDÉS. Voir plus bas. */
  grades: readonly GradeHistorique[] = [],
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

  /**
   * EF-CRO-12 — LES CHANGEMENTS DE GRADE.
   *
   * ILS NE FIGURENT QUE S'ILS ONT ETE DECIDES. Une correction de saisie ne
   * s'inscrit jamais : il ne s'est rien passe dans la vie du croyant, on a
   * coche la mauvaise ligne. Un « Diacre » de trois jours dans cette frise se
   * lirait plus tard comme une degradation, et personne ne saurait dire le
   * contraire.
   *
   * UN REFUS S'INSCRIT AUSSI, et c'est voulu : une promotion demandee puis
   * refusee fait partie du parcours, et son motif explique la suite. La
   * taire donnerait une frise ou il ne s'est jamais rien passe entre deux
   * grades.
   */
  for (const g of grades) {
    if (g.statut === 'ANNULE') continue;

    const de = g.gradeActuel?.libelle ?? 'aucun grade';
    const vers = g.gradeDemande?.libelle ?? 'un grade';
    const decide = g.statut === 'APPROUVE';
    const attente = g.statut === 'DEMANDE';

    /**
     * LA FRISE NOMME LE MOUVEMENT, PAS SEULEMENT LES DEUX GRADES.
     *
     * « Croyant vers Diacre » suppose que le lecteur connaisse la hierarchie
     * des grades pour savoir si la personne est montee ou descendue. Or c'est
     * exactement ce qu'on vient lire, et cela se lit des annees plus tard, par
     * quelqu'un qui n'etait pas la.
     *
     * `estRetrogradation` porte la comparaison, une seule fois pour toute
     * l'application : le sens de l'`ordre` a deja ete tranche la-bas, par un
     * essai, et le redire ici le ferait diverger le jour ou il change.
     */
    const descente = estRetrogradation(g.gradeActuel?.ordre, g.gradeDemande?.ordre);
    const mouvement = descente ? 'Dégradation' : 'Promotion';

    /**
     * QUI A FAIT QUOI — la question du circuit.
     *
     * L'operateur a demande, le validateur a tranche. Quand personne n'a
     * valide — circuit ferme —, on ne nomme QUE l'operateur : ecrire
     * « validee par » son propre nom ferait croire a un controle qui
     * n'a pas eu lieu.
     */
    const parQui = [
      g.demandeur ? `demandee par ${g.demandeur.nom_complet}` : null,
      g.decideur ? `validee par ${g.decideur.nom_complet}` : null,
    ]
      .filter(Boolean)
      .join(', ');

    evenements.push({
      cle: `grade:${g.id}`,
      // La date de DECISION situe le changement : le grade a change ce
      // jour-la. Une demande en attente n'a que sa date de demande.
      date: g.date_decision ?? g.date_demande,
      type: 'GRADE',
      titre: attente
        ? `${mouvement} demandée : de ${de} à ${vers}`
        : decide
          ? `${mouvement} de ${de} à ${vers}`
          : `${mouvement} refusée : de ${de} à ${vers}`,
      detail: parQui || undefined,
      // Le motif du REFUS prime : c est lui qui explique l issue.
      note: g.motif_refus ?? g.motif ?? undefined,
      enAttente: attente,
    });
  }

  // Antechronologique : le plus recent en tete, comme partout ailleurs.
  return evenements.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// EF-CRO-06 — l'apparence d'un evenement : une CLE, jamais un composant
// ---------------------------------------------------------------------------

/**
 * LES CLES D'ICONE, et pourquoi elles vivent dans le domaine.
 *
 * La frise a l'ecran et la frise IMPRIMEE doivent porter le meme pictogramme
 * et la meme teinte : un bapteme bleu a l'ecran et gris sur le papier feraient
 * douter qu'il s'agisse du meme evenement.
 *
 * Or une icone est une FONCTION REACT : elle ne traverse pas vers un document
 * HTML ecrit a la main (regle 24). C'est donc la CLE qui voyage, et chaque
 * cote la rend a sa facon — le composant par un `<Icone/>` de la bibliotheque,
 * l'impression par un `<svg>` en clair. La DECISION, elle, n'est ecrite qu'ici.
 *
 * Un test verifie que chaque cle possede ses deux rendus : sans lui, ajouter un
 * type d'evenement laisserait un trou dans l'un des deux, et c'est le papier
 * qu'on ne regarde qu'apres impression.
 */
export const CLES_ICONE = [
  'creation',
  'bapteme',
  'mandat',
  'grade',
  'grade-attente',
  'transfert-effectue',
  'transfert-refuse',
  'transfert-annule',
  'transfert-attente',
  'transfert',
] as const;

export type CleIcone = (typeof CLES_ICONE)[number];

export interface ApparenceEvenement {
  readonly icone: CleIcone;
  /** Teintes litterales : elles servent AUSSI au HTML imprime, sans Tailwind. */
  readonly fond: string;
  readonly trait: string;
}

/**
 * L'ordre des cas est celui de leur PRECISION : les types propres d'abord, le
 * statut du transfert ensuite, le cas general en dernier.
 */
export function apparenceEvenement(evenement: {
  readonly type: TypeEvenement;
  readonly statut?: StatutTransfert;
  readonly enAttente: boolean;
}): ApparenceEvenement {
  if (evenement.type === 'CREATION') {
    return { icone: 'creation', fond: '#f1f5f9', trait: '#475569' };
  }
  if (evenement.type === 'BAPTEME') {
    return { icone: 'bapteme', fond: '#e0f2fe', trait: '#0369a1' };
  }
  // Une prise de fonction n'est pas un mouvement dans la structure : c'est une
  // responsabilite, et elle a sa propre teinte.
  if (evenement.type === 'MANDAT') {
    return { icone: 'mandat', fond: '#ede9fe', trait: '#6d28d9' };
  }
  if (evenement.type === 'GRADE') {
    // Un refus garde l'icone du GRADE et non celle d'un rejet : c'est la
    // reconnaissance qui a ete refusee, pas la personne.
    return evenement.enAttente
      ? { icone: 'grade-attente', fond: '#fef3c7', trait: '#b45309' }
      : { icone: 'grade', fond: '#ccfbf1', trait: '#0f766e' };
  }

  switch (evenement.statut) {
    case 'EFFECTUE':
      return { icone: 'transfert-effectue', fond: '#d1fae5', trait: '#047857' };
    case 'REFUSE':
      return { icone: 'transfert-refuse', fond: '#ffe4e6', trait: '#be123c' };
    case 'ANNULE':
      return { icone: 'transfert-annule', fond: '#f1f5f9', trait: '#64748b' };
    case 'DEMANDE':
      return { icone: 'transfert-attente', fond: '#fef3c7', trait: '#b45309' };
    default:
      return { icone: 'transfert', fond: '#e0e7ff', trait: '#4338ca' };
  }
}
