import { avertir } from '@/components/shared/messages';
import { formatDate } from '@/lib/utils/format';

/**
 * L'attestation de transfert — EF-TRF-08, demande du 20 août 2026.
 *
 * CE N'EST PAS UNE LECTURE DE LISTE, C'EST UN DOCUMENT SIGNÉ. Le transfert
 * existe déjà en base, approuvé et daté ; ce qui manquait, c'est le papier —
 * celui que le croyant présente à l'église qui l'accueille, et que celle-ci
 * classe. D'où un droit à part, `transfer.certify` : attester engage l'entité,
 * là où consulter ne fait que renseigner.
 *
 * IL N'ATTESTE QUE CE QUI EST APPROUVÉ. Une demande en attente ou refusée n'a
 * rien produit : en délivrer le papier ferait circuler un document qui affirme
 * un transfert qui n'a pas eu lieu — et personne, en le lisant, ne saurait
 * qu'il ne vaut rien.
 *
 * ON N'EN STOCKE AUCUN EXEMPLAIRE, pour la même raison que les rapports : les
 * données étant figées à l'approbation, réimprimer donne exactement le même
 * document. Un fichier conservé serait un second exemplaire à garder synchrone,
 * pour rien.
 *
 * CE QUI S'IMPRIME N'A PAS DE RECOURS (règle 33). Aucun nom, aucune entité
 * n'est tronqué : le texte se replie entre les mots et le cadre grandit.
 */

export interface AttestationTransfert {
  /** La référence du transfert — c'est elle qu'on cite pour le retrouver. */
  readonly reference: string;
  readonly nom: string;
  readonly prenom: string;
  readonly matricule: string;
  readonly origine: string;
  readonly destination: string;
  readonly celluleOrigine: string | null;
  readonly celluleDestination: string | null;
  readonly dateDemande: string;
  readonly dateDecision: string | null;
  readonly dateEffet: string | null;
  readonly motif: string | null;
  /** L'organisation et l'entité qui délivrent — l'en-tête du document. */
  readonly organisation: string;
  readonly entiteEmettrice: string;
  /** Qui a approuvé : c'est son nom qui figure au-dessus de la signature. */
  readonly decideur: string | null;
}

/** Rien de ce qui vient de la base n'entre tel quel dans du balisage. */
function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nomComplet(a: AttestationTransfert): string {
  return `${a.nom.toLocaleUpperCase('fr')} ${a.prenom}`.trim();
}

/**
 * Une entité, avec sa cellule quand il y en a une.
 *
 * La cellule n'est PAS toujours renseignée — un transfert peut ne concerner que
 * l'église. Écrire « — » à sa place ferait lire une donnée manquante là où il
 * n'y a simplement rien à dire.
 */
function lieu(entite: string, cellule: string | null): string {
  return cellule ? `${entite} — cellule ${cellule}` : entite;
}

const STYLE = `
@page { size: A4 portrait; margin: 20mm }
* { box-sizing: border-box }
html, body { margin: 0; padding: 0 }
body {
  font: 12px "Google Sans", system-ui, sans-serif;
  color: #0f172a;
  line-height: 1.6;
}
header {
  text-align: center;
  border-bottom: 2px solid #0f172a;
  padding-bottom: 6mm;
  margin-bottom: 10mm;
}
.organisation { font-size: 16px; font-weight: 700; letter-spacing: .02em }
.entite { font-size: 12px; color: #475569; margin-top: 1mm }
h1 {
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: .12em;
  margin: 0 0 2mm;
  text-align: center;
}
.reference {
  text-align: center;
  font-family: ui-monospace, "SFMono-Regular", monospace;
  font-size: 11px;
  color: #64748b;
  margin: 0 0 10mm;
}
dl { display: grid; grid-template-columns: 45mm 1fr; gap: 3mm 6mm; margin: 0 0 10mm }
dt { color: #64748b; font-size: 11px }
/* Un nom ne se coupe pas : il se replie entre les mots (regle 33). */
dd { margin: 0; font-weight: 500; overflow-wrap: break-word }
.corps { margin: 0 0 12mm; text-align: justify }
.motif {
  border-left: 3px solid #cbd5e1;
  padding-left: 4mm;
  color: #334155;
  margin: 0 0 10mm;
}
footer {
  margin-top: 16mm;
  display: flex;
  justify-content: flex-end;
}
.signature {
  width: 70mm;
  text-align: center;
  border-top: 1px solid #0f172a;
  padding-top: 2mm;
  font-size: 11px;
}
.signature .qui { display: block; font-weight: 600; margin-top: 1mm }
`;

function document(a: AttestationTransfert): string {
  const effet = a.dateEffet ?? a.dateDecision;

  return (
    '<header>' +
    `<p class="organisation">${echapper(a.organisation)}</p>` +
    `<p class="entite">${echapper(a.entiteEmettrice)}</p>` +
    '</header>' +
    '<h1>Attestation de transfert</h1>' +
    `<p class="reference">Référence ${echapper(a.reference)}</p>` +
    '<dl>' +
    `<dt>Croyant</dt><dd>${echapper(nomComplet(a))}</dd>` +
    `<dt>Matricule</dt><dd>${echapper(a.matricule)}</dd>` +
    `<dt>Entité d’origine</dt><dd>${echapper(lieu(a.origine, a.celluleOrigine))}</dd>` +
    `<dt>Entité d’accueil</dt><dd>${echapper(lieu(a.destination, a.celluleDestination))}</dd>` +
    `<dt>Demandé le</dt><dd>${echapper(formatDate(a.dateDemande))}</dd>` +
    (effet ? `<dt>Effectif le</dt><dd>${echapper(formatDate(effet))}</dd>` : '') +
    '</dl>' +
    '<p class="corps">' +
    'Le soussigné atteste que le croyant désigné ci-dessus a été régulièrement ' +
    'transféré de son entité d’origine vers son entité d’accueil, et que ce ' +
    'transfert a été approuvé aux dates portées au présent document.' +
    '</p>' +
    (a.motif ? `<p class="motif">Motif : ${echapper(a.motif)}</p>` : '') +
    '<footer><span class="signature">Pour l’entité émettrice' +
    (a.decideur ? `<span class="qui">${echapper(a.decideur)}</span>` : '') +
    '</span></footer>'
  );
}

/**
 * Ouvre l'attestation dans une fenêtre et lance l'impression.
 *
 * Aucun `await` avant `window.open` : une pop-up qui suit une attente n'est
 * plus rattachée au clic qui l'a déclenchée, et le navigateur la bloque.
 */
export function imprimerAttestation(a: AttestationTransfert): void {
  const fenetre = window.open('', '_blank', 'width=1024,height=768');
  if (!fenetre) {
    avertir("La fenêtre d'impression a été bloquée. Autorisez les pop-ups pour ce site.");
    return;
  }

  // Le titre devient le nom du fichier PDF : il nomme la personne, pas le genre
  // du document — c'est ce qu'on cherchera dans un dossier.
  const titre = `Attestation de transfert — ${nomComplet(a)}`;

  fenetre.document.write(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
      `<title>${echapper(titre)}</title>` +
      `<style>${STYLE}</style></head><body>` +
      document(a) +
      '</body></html>',
  );
  fenetre.document.close();

  /**
   * L'impression attend que le document soit posé — lancée trop tôt, elle
   * sortirait une page blanche. Deux chemins, parce que `load` a pu se produire
   * pendant `close()` : le verrou garantit qu'un seul aboutit.
   */
  let lance = false;
  const lancer = () => {
    if (lance) return;
    lance = true;
    fenetre.focus();
    fenetre.print();
  };

  fenetre.addEventListener('load', lancer);
  setTimeout(lancer, 400);
}
