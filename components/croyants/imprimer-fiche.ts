import { avertir } from '@/components/shared/messages';
import {
  type CleIcone,
  type TypeEvenement,
  apparenceEvenement,
} from '@/lib/domain/historique';
import type { StatutTransfert } from '@/lib/domain/transfert';
import { formatDate, formatDateHeure, formatMontant } from '@/lib/utils/format';

/**
 * L'impression d'une fiche de croyant — EF-CRO-06, EF-FIN-35.
 *
 * TROIS DOCUMENTS, PARCE QUE CE SONT TROIS DEMANDES DIFFERENTES.
 *
 *   - `FICHE` — l'etat civil et le rattachement. Ce qu'on joint a un dossier.
 *   - `DIMES` — le releve des versements. Ce qu'on remet a quelqu'un qui
 *     demande « qu'ai-je donne cette annee ? ».
 *   - `HISTORIQUE` — le parcours. Ce qu'on produit quand une entite superieure
 *     demande a retracer une situation.
 *
 * Tout imprimer d'un coup obligerait a decouper, ou a remettre a un croyant des
 * informations qu'il n'a pas demandees — son grade, son statut, sa cellule.
 *
 * L'EN-TETE EST LE MEME DANS LES TROIS, et ce n'est pas une commodite : une
 * feuille de versements sans nom ni eglise est un document ANONYME, qui ne
 * prouve rien et ne se classe nulle part. Photo, nom, matricule et eglise y
 * figurent donc toujours.
 *
 * LA PHOTO EST EMBARQUEE EN `data:`, jamais liee (regle 33, precedent de
 * l'organigramme imprime). Une image distante dans une fenetre d'impression se
 * charge APRES l'appel a `print()` — la feuille sort sans portrait une fois sur
 * deux — et l'URL est signee, donc perimee des le lendemain : un PDF garde ne
 * montrerait plus rien.
 *
 * CE QUI S'IMPRIME N'A PAS DE RECOURS (regle 33). Rien n'est tronque : les
 * cellules replient entre les mots, et le tableau s'allonge plutot que de
 * couper un libelle.
 */

export type PorteeImpression = 'FICHE' | 'DIMES' | 'HISTORIQUE';

/** Le cote du portrait embarque. Au-dela, le `data:` alourdit pour rien. */
const COTE_PORTRAIT = 256;

export interface EnTeteImpression {
  readonly nom: string;
  readonly prenom: string;
  readonly matricule: string;
  readonly eglise: string;
  /** URL signee de la photo, ou `null` : les initiales prennent le relais. */
  readonly urlPhoto: string | null;
}

export interface DonneeImprimable {
  readonly libelle: string;
  readonly valeur: string;
}

export interface SectionImprimable {
  readonly titre: string;
  readonly donnees: readonly DonneeImprimable[];
}

export interface VersementImprimable {
  readonly date: string | null;
  readonly evenement: string;
  readonly enveloppe: string | null;
  readonly recu: string | null;
  readonly montant: number;
}

export interface EvenementImprimable {
  readonly date: string;
  readonly titre: string;
  readonly detail?: string;
  readonly note?: string;
  /** De quoi retrouver la MEME pastille qu a l ecran — voir apparenceEvenement. */
  readonly type: TypeEvenement;
  readonly statut?: StatutTransfert;
  readonly enAttente: boolean;
}

export interface ContenuImpression {
  readonly entete: EnTeteImpression;
  readonly sections: readonly SectionImprimable[];
  readonly versements: readonly VersementImprimable[];
  readonly evenements: readonly EvenementImprimable[];
  readonly devise: string;
}

// ---------------------------------------------------------------------------

/** Rien de ce qui vient de la base n'entre tel quel dans du HTML. */
function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convertit la photo en `data:`, recadree en carre.
 *
 * L'echec est SILENCIEUX et rend `null` : l'en-tete retombe sur les initiales.
 * Une photo manquante ne doit pas empecher d'imprimer un releve de versements.
 */
async function embarquerPortrait(url: string): Promise<string | null> {
  try {
    const reponse = await fetch(url);
    if (!reponse.ok) return null;

    const blob = await reponse.blob();
    if (!blob.type.startsWith('image/')) return null;

    const image = await createImageBitmap(blob);
    const toile = document.createElement('canvas');
    toile.width = COTE_PORTRAIT;
    toile.height = COTE_PORTRAIT;

    const ctx = toile.getContext('2d');
    if (!ctx) return null;

    // Recadrage carre CENTRE, comme `object-cover` a l'ecran : un portrait se
    // rogne, il ne s'etire pas.
    const cote = Math.min(image.width, image.height);
    ctx.drawImage(
      image,
      (image.width - cote) / 2,
      (image.height - cote) / 2,
      cote,
      cote,
      0,
      0,
      COTE_PORTRAIT,
      COTE_PORTRAIT,
    );

    return toile.toDataURL('image/jpeg', 0.86);
  } catch {
    return null;
  }
}

function initiales(nom: string, prenom: string): string {
  return `${nom.trim()[0] ?? ''}${prenom.trim()[0] ?? ''}`.toLocaleUpperCase('fr');
}

const TITRES: Record<PorteeImpression, string> = {
  FICHE: 'Fiche du croyant',
  DIMES: 'Relevé des versements de dîme',
  HISTORIQUE: 'Historique du croyant',
};

/**
 * L'en-tete, IDENTIQUE dans les trois documents.
 *
 * Le portrait est ROND — comme a l'ecran. Un carre sur le papier et un rond a
 * l'ecran feraient douter qu'il s'agisse de la meme application, et c'est
 * exactement le genre d'ecart qui fait rejeter un document officiel.
 */
function enTeteHtml(
  e: EnTeteImpression,
  portrait: string | null,
  portee: PorteeImpression,
): string {
  const visuel = portrait
    ? `<img class="portrait" src="${portrait}" alt="">`
    : `<span class="portrait initiales">${echapper(initiales(e.nom, e.prenom))}</span>`;

  return `
<header class="entete">
  ${visuel}
  <div class="identite">
    <p class="surtitre">${echapper(TITRES[portee])}</p>
    <h1>${echapper(e.nom.toLocaleUpperCase('fr'))} ${echapper(e.prenom)}</h1>
    <p class="meta">Matricule <span class="mono">${echapper(e.matricule)}</span></p>
    <p class="meta">${echapper(e.eglise)}</p>
  </div>
</header>`;
}

function sectionsHtml(sections: readonly SectionImprimable[]): string {
  return sections
    .map(
      (s) => `
<section class="bloc">
  <h2>${echapper(s.titre)}</h2>
  <dl>
    ${s.donnees
      .map(
        (d) => `<div><dt>${echapper(d.libelle)}</dt><dd>${echapper(d.valeur)}</dd></div>`,
      )
      .join('')}
  </dl>
</section>`,
    )
    .join('');
}

function versementsHtml(
  tous: readonly VersementImprimable[],
  devise: string,
  plage: { readonly debut: string; readonly fin: string } | null,
): string {
  /**
   * LES DEUX BORNES SONT INCLUSES, et la comparaison se fait EN CHAINES.
   *
   * Les dates sont des jours ISO (`YYYY-MM-DD`) : leur ordre lexicographique
   * est leur ordre chronologique. Passer par `Date` introduirait un fuseau —
   * et un versement du 1er janvier basculerait au 31 décembre pour un lecteur
   * situé à l'ouest. Même choix que les filtres du registre financier.
   */
  const versements = plage
    ? tous.filter((v) => v.date !== null && v.date >= plage.debut && v.date <= plage.fin)
    : tous;

  /**
   * LE DOCUMENT DIT TOUJOURS CE QU'IL COUVRE.
   *
   * Un relevé partiel dont rien n'annonce la période se lit comme un relevé
   * complet : le total paraît faux, et personne ne peut le vérifier — sur une
   * feuille, on ne peut pas rouvrir les filtres pour comprendre (règle 33).
   */
  const periode = plage
    ? `Du ${formatDate(plage.debut)} au ${formatDate(plage.fin)}`
    : 'Tous les versements enregistrés';

  if (versements.length === 0) {
    return `<section class="bloc">
  <h2>Versements de dîme</h2>
  <p class="periode">${echapper(periode)}</p>
  <p class="vide">Aucun versement sur cette période.</p>
</section>`;
  }

  const total = versements.reduce((s, v) => s + v.montant, 0);

  return `
<section class="bloc">
  <h2>Versements de dîme</h2>
  <p class="periode">${echapper(periode)}</p>
  <table>
    <thead>
      <tr>
        <th>Date du culte</th>
        <th>Événement</th>
        <th>Enveloppe</th>
        <th>Reçu</th>
        <th class="droite">Montant</th>
      </tr>
    </thead>
    <tbody>
      ${versements
        .map(
          (v) => `<tr>
        <td class="mono">${v.date ? echapper(formatDate(v.date)) : '—'}</td>
        <td>${echapper(v.evenement)}</td>
        <td class="mono">${v.enveloppe ? echapper(v.enveloppe) : '—'}</td>
        <td class="mono">${v.recu ? echapper(v.recu) : '—'}</td>
        <td class="droite mono">${echapper(formatMontant(v.montant, devise))}</td>
      </tr>`,
        )
        .join('')}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4">Total — ${versements.length} versement${versements.length > 1 ? 's' : ''}</td>
        <td class="droite mono">${echapper(formatMontant(total, devise))}</td>
      </tr>
    </tfoot>
  </table>
  <p class="note">
    Le numéro d’enveloppe est celui en vigueur le jour du versement, pas celui
    d’aujourd’hui : c’est le reçu détenu qui fait foi.
  </p>
</section>`;
}

/**
 * LA MOITIE « PAPIER » DU RENDU DES ICONES — EF-CRO-06.
 *
 * L'ecran rend la cle par un composant de la bibliotheque ; ici il n'y a pas de
 * React, donc le trace est ecrit en clair. Il est RECOPIE DE LUCIDE, pas
 * redessine : une icone approchante sur le papier et l'exacte a l'ecran se
 * remarquent aussitot mises cote a cote.
 *
 * `currentColor` fait tout le travail de couleur : la teinte vient du domaine,
 * posee sur la pastille, et le trace en herite.
 */
const TRACES: Record<CleIcone, string> = {
  creation:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  bapteme:
    '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>',
  mandat:
    '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  grade:
    '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
  'grade-attente':
    '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
  'transfert-effectue': '<path d="M20 6 9 17l-5-5"/>',
  'transfert-refuse': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'transfert-annule':
    '<circle cx="12" cy="12" r="10"/><path d="M4.929 4.929 19.07 19.071"/>',
  'transfert-attente': '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  transfert:
    '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
};

/** La pastille ronde et coloree, telle qu'elle parait a l'ecran. */
function pastille(cle: CleIcone, fond: string, trait: string): string {
  return (
    `<span class="pastille" style="background:${fond};color:${trait}">` +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    `stroke-linecap="round" stroke-linejoin="round">${TRACES[cle]}</svg></span>`
  );
}

function historiqueHtml(evenements: readonly EvenementImprimable[]): string {
  if (evenements.length === 0) {
    return '<section class="bloc"><p class="vide">Aucun événement enregistré.</p></section>';
  }

  /**
   * L'ORDRE EST CELUI QU'ON A REÇU, et il ne se refait pas ici.
   *
   * `construireHistorique` trie déjà — chronologique, « Fiche créée » épinglée
   * en tête —, et l'écran affiche exactement cela. Re-trier sur la seule date
   * romprait l'épinglage : un baptême de 1995 saisi en 2026 remonterait avant
   * la création de la fiche, et le papier montrerait un autre ordre que l'écran
   * qu'on vient de regarder.
   *
   * Deux rendus d'une même frise doivent la raconter pareil : c'est la raison
   * d'être du tri unique, dans le domaine.
   */

  return `
<section class="bloc">
  <h2>Historique</h2>
  <ul class="frise">
    ${evenements
      .map((e) => {
        const a = apparenceEvenement({
          type: e.type,
          statut: e.statut,
          enAttente: e.enAttente,
        });

        return `<li>
      ${pastille(a.icone, a.fond, a.trait)}
      <span class="corps">
        <span class="titre-evt">
          <strong>${echapper(e.titre)}</strong>
          ${e.enAttente ? '<span class="attente">En attente</span>' : ''}
        </span>
        <span class="detail"><span class="mono">${echapper(formatDate(e.date))}</span>${
          e.detail ? ` · ${echapper(e.detail)}` : ''
        }</span>
        ${e.note ? `<span class="note-evt">« ${echapper(e.note)} »</span>` : ''}
      </span>
    </li>`;
      })
      .join('')}
  </ul>
</section>`;
}

/**
 * LA FEUILLE EST EN A4 PORTRAIT, marges de 14 mm.
 *
 * `@page` n'accepte ni classe ni variable : la marge se pose ici, une fois.
 * Le tableau ne coupe pas une ligne en deux pages (`break-inside: avoid`) —
 * une ligne coupee sur un releve d'argent se relit deux fois avant d'etre
 * comprise.
 */
const STYLE = `
@page { size: A4 portrait; margin: 14mm }
* { box-sizing: border-box }
body {
  margin: 0;
  font: 11px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #0f172a;
}
.entete {
  display: flex; align-items: center; gap: 16px;
  padding-bottom: 12px; margin-bottom: 18px;
  border-bottom: 2px solid #0f172a;
}
.portrait {
  width: 84px; height: 84px; border-radius: 50%;
  object-fit: cover; flex: none;
  border: 1px solid #e2e8f0;
}
.initiales {
  display: flex; align-items: center; justify-content: center;
  background: #e2e8f0; color: #475569;
  font-size: 28px; font-weight: 700;
}
.identite h1 { margin: 2px 0 4px; font-size: 20px; letter-spacing: -0.01em }
.surtitre {
  margin: 0; font-size: 9px; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase; color: #6366f1;
}
.meta { margin: 0; font-size: 10px; color: #475569 }
.mono { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace }

.bloc { margin-bottom: 18px; break-inside: avoid }
.bloc h2 {
  margin: 0 0 8px; font-size: 10px; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase; color: #64748b;
}
dl { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 24px; margin: 0 }
dt { font-size: 9px; color: #94a3b8 }
/* Le mot se replie, il ne se coupe pas : ce qui s'imprime n'a pas de recours. */
dd { margin: 0; font-size: 11px; overflow-wrap: break-word }

table { width: 100%; border-collapse: collapse }
th, td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top }
th { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b }
tr { break-inside: avoid }
.droite { text-align: right }
tfoot td { font-weight: 700; border-top: 2px solid #0f172a; border-bottom: none }

.frise { list-style: none; margin: 0; padding: 0 }
.frise li { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px solid #f1f5f9; break-inside: avoid }
/*
  LA PASTILLE EST IMPRIMEE EN COULEUR, comme a l'ecran.

  La propriete print-color-adjust est INDISPENSABLE : par defaut, les navigateurs
  suppriment les fonds a l'impression pour economiser l'encre, et les dix
  pastilles sortiraient blanches — donc indistinctes, ce qui retire a la frise
  le signal qui la rend lisible d'un coup d'oeil.
*/
.pastille {
  flex: none; width: 22px; height: 22px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.pastille svg { width: 13px; height: 13px }
.corps { display: flex; flex-direction: column; gap: 2px; padding-top: 2px }
.titre-evt { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap }
.attente {
  font-size: 8px; padding: 1px 5px; border-radius: 4px;
  background: #fef3c7; color: #b45309;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.detail, .note-evt { font-size: 10px; color: #64748b }

.periode { margin: -4px 0 8px; font-size: 10px; color: #475569; font-weight: 600 }
.vide { color: #94a3b8; font-style: italic }
.note { margin: 8px 0 0; font-size: 9px; color: #94a3b8 }
.pied {
  margin-top: 20px; padding-top: 8px; border-top: 1px solid #e2e8f0;
  font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between;
}
`;

// ---------------------------------------------------------------------------

/**
 * Ouvre la fenetre d'impression du navigateur, qui sait enregistrer en PDF.
 *
 * LA FENETRE S'OUVRE AVANT TOUT `await` : une pop-up qui suit une attente n'est
 * plus rattachee au clic qui l'a declenchee, et le navigateur la bloque. Elle
 * affiche donc d'abord un mot, puis son contenu quand le portrait est pret.
 */
export async function imprimerFicheCroyant(
  portee: PorteeImpression,
  contenu: ContenuImpression,
  /**
   * EF-FIN-35 — les bornes retenues pour le releve de dimes.
   *
   * Absentes : tous les versements. Le document DIT toujours ce qu il
   * couvre — un releve partiel dont rien n annonce la periode se lit comme
   * un releve complet, et le total parait faux.
   */
  plage?: { readonly debut: string; readonly fin: string } | null,
): Promise<void> {
  const fenetre = window.open('', '_blank', 'width=1024,height=768');
  if (!fenetre) {
    avertir("La fenêtre d'impression a été bloquée. Autorisez les pop-ups pour ce site.");
    return;
  }

  const { entete } = contenu;
  // Le titre devient le nom du fichier PDF : il nomme la personne ET le document.
  const titre = `${TITRES[portee]} — ${entete.nom} ${entete.prenom}`;

  fenetre.document.write(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
      `<title>${echapper(titre)}</title>` +
      '<style>body{font:14px system-ui,sans-serif;color:#475569;padding:32px}</style>' +
      "</head><body>Préparation de l'impression…</body></html>",
  );
  fenetre.document.close();

  const portrait = entete.urlPhoto ? await embarquerPortrait(entete.urlPhoto) : null;

  const corps =
    portee === 'FICHE'
      ? sectionsHtml(contenu.sections)
      : portee === 'DIMES'
        ? versementsHtml(contenu.versements, contenu.devise, plage ?? null)
        : historiqueHtml(contenu.evenements);

  fenetre.document.open();
  fenetre.document.write(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
      `<title>${echapper(titre)}</title><style>${STYLE}</style></head><body>` +
      enTeteHtml(entete, portrait, portee) +
      corps +
      `<footer class="pied">
         <span>${echapper(entete.nom.toLocaleUpperCase('fr'))} ${echapper(entete.prenom)} · ${echapper(entete.matricule)}</span>
         <span>Édité le ${echapper(formatDateHeure(new Date().toISOString()))}</span>
       </footer>` +
      '</body></html>',
  );
  fenetre.document.close();

  /**
   * L'impression attend que le document soit pose — lancee trop tot, elle
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
