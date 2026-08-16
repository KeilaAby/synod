import { avertir } from '@/components/shared/messages';
import { montantEnLettres } from '@/lib/domain/montant-en-lettres';
import { formatDate, formatMontant } from '@/lib/utils/format';

/**
 * Le reçu de dîme imprimé — EF-FIN-27, EF-FIN-31.
 *
 * LE REÇU EXISTE DÉJÀ : la base l'a numéroté à la collecte. Ce qui manquait,
 * c'est le papier. Sa référence se recopiait à la main sur un talon, et une
 * référence recopiée est une référence fausse un jour sur dix.
 *
 * DEUX FORMATS, PARCE QUE CE SONT DEUX GESTES DIFFÉRENTS.
 *
 *   - `A4` — huit talons par feuille, deux colonnes, traits de coupe. C'est le
 *     format d'un carnet à souches : on imprime la collecte entière une fois,
 *     après le culte, et on découpe.
 *   - `CAISSE` — un rouleau de 80 mm, un reçu par ticket. C'est ce qu'on tend à
 *     quelqu'un qui est devant soi : le croyant qui vient réclamer le sien, ou
 *     celui qu'on sert à l'instant.
 *
 * Le second n'est pas une variante décorative du premier. Sur un rouleau, la
 * largeur est fixée par le matériel et la hauteur est libre — l'inverse exact
 * d'une feuille. Une mise en page prévue pour l'un ne tient pas sur l'autre.
 *
 * CE QUI S'IMPRIME N'A PAS DE RECOURS (règle 31). Un nom tronqué se survole à
 * l'écran ; sur un talon remis à quelqu'un, il est perdu. Rien n'est donc
 * coupé, dans aucun des deux formats : le texte se replie entre les mots, et
 * le cadre grandit s'il le faut.
 *
 * LE MONTANT EST ÉCRIT EN TOUTES LETTRES. « 12 000 » devient « 112 000 » d'un
 * trait de stylo ; « douze mille ariary » ne se rallonge pas.
 */

export type FormatRecu = 'A4' | 'CAISSE';

/**
 * CHAQUE TICKET PORTE SA PROPRE CÉRÉMONIE.
 *
 * L'église et la date sont sur le reçu, pas sur le lot : depuis la fiche d'un
 * croyant, on réimprime des reçus de plusieurs collectes — dates différentes,
 * et parfois églises différentes, un croyant de passage pouvant verser ailleurs
 * (EF-FIN-32). Un en-tête commun aurait daté tous les talons du premier.
 */
export interface RecuAImprimer {
  readonly reference: string;
  readonly nom: string;
  readonly prenom: string;
  readonly matricule: string;
  readonly enveloppe: string | null;
  readonly montant: number;
  /** L'entité qui a collecté — c'est elle qui délivre le reçu. */
  readonly entite: string;
  readonly dateOperation: string;
  readonly evenement: string | null;
}

/** Rien de ce qui vient de la base n'entre tel quel dans du balisage. */
function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** La phrase du domaine est en minuscules : elle se cite aussi bien ailleurs. */
function enLettres(montant: number, devise: string): string {
  const phrase = montantEnLettres(montant, devise);
  if (!phrase) return '';
  return phrase.charAt(0).toLocaleUpperCase('fr') + phrase.slice(1);
}

function nomComplet(recu: RecuAImprimer): string {
  return `${recu.nom.toLocaleUpperCase('fr')} ${recu.prenom}`;
}

// ---------------------------------------------------------------------------
// A4 — le carnet à souches
// ---------------------------------------------------------------------------

function ticketA4(recu: RecuAImprimer, devise: string): string {
  return (
    '<article class="ticket">' +
    `<header><span class="entite">${echapper(recu.entite)}</span>` +
    '<span class="genre">Reçu de dîme</span></header>' +
    `<p class="reference">${echapper(recu.reference)}</p>` +
    '<dl>' +
    `<dt>Reçu de</dt><dd class="nom">${echapper(nomComplet(recu))}` +
    `<span class="matricule">${echapper(recu.matricule)}</span></dd>` +
    `<dt>Culte du</dt><dd>${echapper(formatDate(recu.dateOperation))}` +
    (recu.evenement ? ` · ${echapper(recu.evenement)}` : '') +
    '</dd>' +
    (recu.enveloppe
      ? `<dt>Enveloppe</dt><dd class="enveloppe">n° ${echapper(recu.enveloppe)}</dd>`
      : '') +
    '</dl>' +
    `<p class="montant">${echapper(formatMontant(recu.montant, devise))}</p>` +
    `<p class="lettres">${echapper(enLettres(recu.montant, devise))}</p>` +
    '<footer><span class="signature">Le trésorier</span></footer>' +
    '</article>'
  );
}

const STYLE_A4 = `
@page { size: A4 portrait; margin: 10mm }
* { box-sizing: border-box }
html, body { margin: 0; padding: 0 }
body {
  font: 11px "Google Sans", system-ui, sans-serif;
  color: #0f172a;
  /* Deux colonnes de tickets, comme un carnet a souches. */
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4mm;
}
.ticket {
  /* Un quart de hauteur utile, MINIMUM : le cadre grandit si le nom deborde,
     parce qu'un nom coupe sur un talon est perdu (regle 31). */
  min-height: 62mm;
  padding: 5mm;
  border: 1px dashed #94a3b8;
  border-radius: 2mm;
  display: flex;
  flex-direction: column;
  gap: 2mm;
  break-inside: avoid;
}
header { display: flex; justify-content: space-between; align-items: baseline; gap: 3mm }
.entite { font-weight: 600; font-size: 12px }
.genre { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #64748b }
.reference {
  margin: 0;
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .04em;
}
dl { margin: 0; display: grid; grid-template-columns: 22mm 1fr; gap: 1mm 3mm }
dt { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: .06em }
dd { margin: 0; font-size: 11px }
/* Le nom se REPLIE entre les mots, et coupe le mot lui-meme s'il le faut :
   « Razafindraparanymanana » ne tient pas dans 60 mm, et doit tout de meme
   figurer en entier. */
.nom { font-weight: 600; overflow-wrap: anywhere; word-break: break-word }
.matricule, .enveloppe {
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size: 9px;
  color: #64748b;
}
.matricule { display: block }
.montant {
  margin: auto 0 0;
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.lettres {
  margin: 0;
  font-size: 10px;
  font-style: italic;
  color: #475569;
  overflow-wrap: anywhere;
}
footer { margin-top: 1mm; border-top: 1px solid #cbd5e1; padding-top: 1mm }
.signature { font-size: 9px; color: #64748b }
`;

// ---------------------------------------------------------------------------
// CAISSE — le rouleau de 80 mm
// ---------------------------------------------------------------------------

/** Un champ du ticket de caisse : intitulé au-dessus, valeur en dessous. */
function champ(intitule: string, valeur: string, classe = ''): string {
  return (
    `<div class="champ"><span class="intitule">${echapper(intitule)}</span>` +
    `<span class="valeur ${classe}">${valeur}</span></div>`
  );
}

function ticketCaisse(recu: RecuAImprimer, devise: string): string {
  const ceremonie =
    formatDate(recu.dateOperation) + (recu.evenement ? ` · ${recu.evenement}` : '');

  return (
    '<article class="caisse">' +
    `<p class="entite">${echapper(recu.entite)}</p>` +
    '<p class="genre">Reçu de dîme</p>' +
    '<hr>' +
    `<p class="reference">${echapper(recu.reference)}</p>` +
    '<hr>' +
    champ('Reçu de', echapper(nomComplet(recu)), 'nom') +
    champ('Matricule', echapper(recu.matricule), 'mono') +
    champ('Culte du', echapper(ceremonie)) +
    (recu.enveloppe ? champ('Enveloppe', `n° ${echapper(recu.enveloppe)}`, 'mono') : '') +
    '<hr>' +
    `<p class="montant">${echapper(formatMontant(recu.montant, devise))}</p>` +
    `<p class="lettres">${echapper(enLettres(recu.montant, devise))}</p>` +
    '<hr>' +
    /*
      LA MENTION QUI ÉVITE UN MALENTENDU (EF-FIN-29).
      Le croyant remet sa dîme à son église, mais elle appartient au Siège. Le
      dire sur le talon coûte une ligne et évite qu'on la croie acquise à
      l'église qui l'a reçue.
    */
    '<p class="mention">Dîme reçue pour le compte du Siège.</p>' +
    '<p class="signature">Le trésorier</p>' +
    '<p class="pied">Conservez ce reçu.</p>' +
    '</article>'
  );
}

const STYLE_CAISSE = `
/*
  80 mm est la largeur des rouleaux courants ; « auto » laisse la hauteur
  libre. C'est l'inverse exact d'une feuille, ou la hauteur est fixee et la
  largeur aussi — d'ou une mise en page a part et non une variante.
*/
@page { size: 80mm auto; margin: 4mm }
* { box-sizing: border-box }
html, body { margin: 0; padding: 0 }
body {
  font: 11px "Google Sans", system-ui, sans-serif;
  color: #0f172a;
  width: 72mm;
}
.caisse {
  display: flex;
  flex-direction: column;
  gap: 1.5mm;
  text-align: center;
  padding-bottom: 6mm;
}
/* Un ticket par coupe : le suivant repart d'une page. */
.caisse + .caisse { break-before: page }
hr { width: 100%; border: 0; border-top: 1px dashed #94a3b8; margin: 1mm 0 }
.entite { margin: 0; font-size: 13px; font-weight: 700; overflow-wrap: anywhere }
.genre { margin: 0; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; color: #475569 }
.reference {
  margin: 0;
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .04em;
  overflow-wrap: anywhere;
}
/*
  L'INTITULE EST AU-DESSUS DE SA VALEUR, jamais a cote : 72 mm ne laissent pas
  la place a deux colonnes, et un nom long y serait pousse a la ligne au
  milieu d'un mot.
*/
.champ { display: flex; flex-direction: column; gap: .3mm }
.intitule { font-size: 8px; text-transform: uppercase; letter-spacing: .08em; color: #64748b }
.valeur { font-size: 11px; overflow-wrap: anywhere; word-break: break-word }
.nom { font-size: 13px; font-weight: 700 }
.mono { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 10px }
.montant {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.lettres { margin: 0; font-size: 10px; font-style: italic; color: #475569; overflow-wrap: anywhere }
.mention { margin: 0; font-size: 9px; color: #475569 }
.signature { margin: 4mm 0 0; font-size: 9px; color: #64748b }
.pied { margin: 0; font-size: 8px; color: #94a3b8 }
`;

// ---------------------------------------------------------------------------

/**
 * Ouvre la fenêtre d'impression du navigateur, qui sait enregistrer en PDF.
 *
 * Aucun `await` avant `window.open` : une pop-up qui suit une attente n'est
 * plus rattachée au clic qui l'a déclenchée, et le navigateur la bloque.
 */
export function imprimerRecus(
  recus: readonly RecuAImprimer[],
  devise: string,
  format: FormatRecu = 'A4',
): void {
  if (recus.length === 0) {
    /**
     * UNE FEUILLE BLANCHE NE DIT PAS POURQUOI ELLE EST BLANCHE.
     *
     * Le cas est ordinaire, pas accidentel : une collecte peut n'être faite que
     * d'enveloppes anonymes et d'espèces en vrac, qui n'ouvrent aucun reçu
     * (EF-FIN-33) — il n'y a personne à qui le remettre.
     */
    avertir(
      'Cette collecte ne comporte aucun versement nominatif : il n’y a aucun reçu à imprimer.',
      { ton: 'information', titre: 'Rien à imprimer' },
    );
    return;
  }

  const fenetre = window.open('', '_blank', 'width=1024,height=768');
  if (!fenetre) {
    avertir("La fenêtre d'impression a été bloquée. Autorisez les pop-ups pour ce site.");
    return;
  }

  // Le titre nomme le LOT, pas un reçu : il devient le nom du fichier PDF.
  const titre =
    recus.length === 1
      ? `Reçu de dîme ${recus[0].reference}`
      : `Reçus de dîme — ${recus.length} talons`;

  const caisse = format === 'CAISSE';

  fenetre.document.write(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
      `<title>${echapper(titre)}</title>` +
      `<style>${caisse ? STYLE_CAISSE : STYLE_A4}</style></head><body>` +
      recus.map((r) => (caisse ? ticketCaisse(r, devise) : ticketA4(r, devise))).join('') +
      '</body></html>',
  );
  fenetre.document.close();

  /**
   * L'impression attend que le document soit posé — lancée trop tôt, elle
   * sortirait une page blanche. Deux chemins, parce que `load` a pu se produire
   * pendant `close()` : le verrou garantit qu'un seul aboutit.
   */
  let lance = false;
  const imprimer = () => {
    if (lance) return;
    lance = true;
    fenetre.print();
  };

  fenetre.addEventListener('load', imprimer);
  if (fenetre.document.readyState === 'complete') imprimer();
}
