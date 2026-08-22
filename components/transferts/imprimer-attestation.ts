import { avertir } from '@/components/shared/messages';
import { pieceDossierDisponible } from '@/lib/domain/transfert';
import { formatDate } from '@/lib/utils/format';

/**
 * L'attestation de transfert — EF-TRF-08, demande du 20 août 2026, étendue le
 * 22 août 2026 à la pièce de dossier consultable AVANT décision.
 *
 * CE N'EST PAS UNE LECTURE DE LISTE, C'EST UN DOCUMENT SIGNÉ. Le transfert
 * existe déjà en base, approuvé et daté ; ce qui manquait, c'est le papier —
 * celui que le croyant présente à l'église qui l'accueille, et que celle-ci
 * classe. D'où un droit à part, `transfer.certify` : attester engage l'entité,
 * là où consulter ne fait que renseigner.
 *
 * DEUX DOCUMENTS, UN SEUL RENDU (règle 16) — comme l'aperçu et le rapport figé
 * du générateur. `statut` porte la différence : `DEMANDE` produit la PIÈCE DE
 * DOSSIER que l'entité appelée à trancher consulte avant de décider ;
 * `APPROUVE`/`EFFECTUE` produisent l'ATTESTATION définitive. Elles ne se
 * ressemblent PAS volontairement — un brouillon présenté comme une preuve
 * serait le défaut exact que ce document existe pour éviter :
 *   — le TITRE et le corps du texte changent de verbe : la pièce de dossier
 *     dit qu'un transfert est à l'examen, l'attestation dit qu'il a eu lieu.
 *   — une MENTION visible barre la pièce de dossier — pas une décoration,
 *     c'est ce qui empêche de la confondre avec la preuve définitive.
 *   — la pièce de dossier n'a NI date de décision, ni décideur, ni cartouche
 *     de signature : rien de tout cela n'existe encore, et un cartouche vide
 *     sur un papier officiel se lirait comme un oubli, pas comme une étape.
 *
 * IL N'ATTESTE (au sens définitif) QUE CE QUI EST APPROUVÉ. Une demande
 * refusée ou annulée n'a rien produit et n'entre pas ici — voir
 * `transfertAttestable` et `pieceDossierDisponible` dans le domaine.
 *
 * ON N'EN STOCKE AUCUN EXEMPLAIRE, pour la même raison que les rapports : les
 * données étant figées à l'approbation, réimprimer donne exactement le même
 * document. Un fichier conservé serait un second exemplaire à garder synchrone,
 * pour rien.
 *
 * CE QUI S'IMPRIME N'A PAS DE RECOURS (règle 33). Aucun nom, aucune entité
 * n'est tronqué : le texte se replie entre les mots et le cadre grandit.
 *
 * LE GABARIT EST RÉGLABLE (migration `0070`) — logo, texte du corps, mentions
 * légales, cartouche de signature — mais SEULEMENT sur l'attestation
 * DÉFINITIVE. La pièce de dossier n'y puise rien : son texte de mise en garde
 * reste fixe, pour ne jamais pouvoir être atténué par un réglage.
 */

export interface AttestationTransfert {
  /** La référence du transfert — c'est elle qu'on cite pour le retrouver. */
  readonly reference: string;
  /**
   * `DEMANDE` rend la pièce de dossier ; `APPROUVE`/`EFFECTUE` rendent
   * l'attestation définitive. Les statuts qui n'aboutissent à rien (`REFUSE`,
   * `ANNULE`) n'ont pas leur place ici — l'appelant les écarte en amont.
   */
  readonly statut: 'DEMANDE' | 'APPROUVE' | 'EFFECTUE';
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
  /**
   * Le gabarit réglé en administration (`chargerParametresAttestation`,
   * migration `0070`) — REQUIS et non repris par défaut ici : un texte de
   * référence dupliqué dans ce fichier ET dans `lib/data/attestation-transfert.ts`
   * finirait par diverger de la valeur réellement enregistrée.
   */
  readonly gabarit: {
    readonly logoUrl: string | null;
    readonly texteCorps: string;
    readonly mentionsLegales: string | null;
    readonly cartoucheSignature: string;
  };
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
.logo { display: block; max-height: 18mm; max-width: 60mm; margin: 0 auto 4mm; }
.organisation { font-size: 16px; font-weight: 700; letter-spacing: .02em }
.entite { font-size: 12px; color: #475569; margin-top: 1mm }
h1 {
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: .12em;
  margin: 0 0 2mm;
  text-align: center;
}
/* La mention qui distingue la piece de dossier de l'attestation definitive —
   pas une decoration, ce qui empeche de confondre un examen en cours avec une
   preuve (voir le commentaire d'en-tete de ce fichier). */
.mention-projet {
  text-align: center;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
  border-radius: 2mm;
  padding: 3mm 6mm;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  margin: 0 0 10mm;
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
.mentions { margin-top: 10mm; font-size: 10px; color: #64748b; text-align: justify }
`;

/** Échappe puis convertit les sauts de ligne — le seul balisage qu'un texte réglé en administration peut produire. */
function avecSautsDeLigne(texte: string): string {
  return echapper(texte).replace(/\n/g, '<br>');
}

function document(a: AttestationTransfert): string {
  const estDefinitif = !pieceDossierDisponible(a.statut);
  const effet = a.dateEffet ?? a.dateDecision;

  return (
    '<header>' +
    // Le logo n'existe QUE sur l'attestation definitive, comme le reste du
    // gabarit reglable (voir le commentaire d'en-tete du fichier).
    (estDefinitif && a.gabarit.logoUrl
      ? `<img class="logo" src="${echapper(a.gabarit.logoUrl)}" alt="">`
      : '') +
    `<p class="organisation">${echapper(a.organisation)}</p>` +
    `<p class="entite">${echapper(a.entiteEmettrice)}</p>` +
    '</header>' +
    `<h1>${estDefinitif ? 'Attestation de transfert' : 'Pièce de dossier — demande de transfert'}</h1>` +
    `<p class="reference">Référence ${echapper(a.reference)}</p>` +
    (estDefinitif
      ? ''
      : '<p class="mention-projet">Demande en cours d’examen — ce document ne constitue pas une attestation</p>') +
    '<dl>' +
    `<dt>Croyant</dt><dd>${echapper(nomComplet(a))}</dd>` +
    `<dt>Matricule</dt><dd>${echapper(a.matricule)}</dd>` +
    `<dt>Entité d’origine</dt><dd>${echapper(lieu(a.origine, a.celluleOrigine))}</dd>` +
    `<dt>Entité d’accueil</dt><dd>${echapper(lieu(a.destination, a.celluleDestination))}</dd>` +
    `<dt>Demandé le</dt><dd>${echapper(formatDate(a.dateDemande))}</dd>` +
    // Une decision et un effet n'existent pas encore pour une demande a
    // l'examen : `effet` est alors naturellement absent, sans branche a part.
    (effet ? `<dt>Effectif le</dt><dd>${echapper(formatDate(effet))}</dd>` : '') +
    '</dl>' +
    '<p class="corps">' +
    // Le texte du corps DEFINITIF vient du gabarit regle en administration ;
    // celui de la piece de dossier reste FIXE — voir le commentaire d'en-tete.
    (estDefinitif
      ? avecSautsDeLigne(a.gabarit.texteCorps)
      : 'Le croyant désigné ci-dessus fait l’objet d’une demande de transfert de ' +
        'son entité d’origine vers son entité d’accueil, actuellement soumise à ' +
        'l’examen de l’entité compétente. Aucune décision n’a encore été prise.') +
    '</p>' +
    (a.motif ? `<p class="motif">Motif : ${echapper(a.motif)}</p>` : '') +
    // Le cartouche de signature n'existe QUE sur l'attestation definitive :
    // vide, sur la piece de dossier, il se lirait comme un oubli plutot que
    // comme une etape a venir (voir le commentaire d'en-tete du fichier).
    (estDefinitif
      ? `<footer><span class="signature">${echapper(a.gabarit.cartoucheSignature)}` +
        (a.decideur ? `<span class="qui">${echapper(a.decideur)}</span>` : '') +
        '</span></footer>'
      : '') +
    (estDefinitif && a.gabarit.mentionsLegales
      ? `<p class="mentions">${avecSautsDeLigne(a.gabarit.mentionsLegales)}</p>`
      : '')
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
  // du document — c'est ce qu'on cherchera dans un dossier. Il porte aussi la
  // distinction piece de dossier / attestation, pour qui range ses fichiers.
  const titre = pieceDossierDisponible(a.statut)
    ? `Pièce de dossier — demande de transfert — ${nomComplet(a)}`
    : `Attestation de transfert — ${nomComplet(a)}`;

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
