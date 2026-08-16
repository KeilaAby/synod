import { avertir } from '@/components/shared/messages';
import { BOM_UTF8, ecrireCsv } from '@/lib/domain/csv';
import { type CelluleXlsx, ecrireXlsx } from '@/lib/domain/xlsx-ecriture';
import { formatDate } from '@/lib/utils/format';

/**
 * Les trois sorties d'un tableau — EF-FIN-25.
 *
 * TROIS FORMATS, TROIS USAGES, et aucun ne remplace les deux autres :
 *
 *   - `XLSX` — pour RETRAVAILLER. Les montants y restent des NOMBRES : on les
 *     somme, on les trie, on en fait un tableau croisé. C'est le seul format
 *     qui le permette, et c'est la première chose qu'on fait d'un export
 *     financier.
 *   - `CSV` — pour REPRENDRE ailleurs. Un logiciel comptable, un script, un
 *     tableur qui n'est pas Excel : le texte brut se lit partout.
 *   - `PDF` — pour TRANSMETTRE. Un conseil d'administration ne reçoit pas un
 *     classeur modifiable ; il reçoit une pièce, datée, qu'on ne retouche pas.
 *
 * ON EXPORTE CE QU'ON VOIT. Les lignes viennent de la sélection affichée,
 * filtres compris : un export qui rendrait tout le périmètre alors que l'écran
 * en montre un dixième produirait un fichier que personne ne saurait
 * rapprocher de ce qu'il vient de lire.
 */

export interface TableauExportable {
  /** Ce que le document annonce, et le nom du fichier téléchargé. */
  readonly titre: string;
  /** Ce sur quoi il porte : période, entité, filtres posés. */
  readonly sousTitre?: string;
  readonly entetes: readonly string[];
  /**
   * Les lignes. Un `number` reste un nombre dans le classeur ; dans le CSV et
   * le PDF il est rendu tel quel, sans séparateur de milliers — un espace
   * insécable y redeviendrait du texte à la relecture.
   */
  readonly lignes: readonly (readonly CelluleXlsx[])[];
}

/** Un nom de fichier sans rien qui gêne un système de fichiers. */
function nomFichier(titre: string, extension: string): string {
  const jour = new Date().toISOString().slice(0, 10);
  const base = titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return `${base || 'export'}-${jour}.${extension}`;
}

function telecharger(nom: string, donnees: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([donnees], { type }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  lien.click();

  /**
   * L'URL se libère APRÈS le clic, pas pendant. Révoquée trop tôt, le
   * navigateur n'a plus rien à télécharger et échoue en silence — sans
   * message, et sans fichier.
   */
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Le texte d'une cellule, pour les formats qui n'ont pas de types. */
function texte(valeur: CelluleXlsx): string {
  if (valeur === null) return '';
  return String(valeur);
}

// -----------------------------------------------------------------------------

export function exporterXlsx(tableau: TableauExportable): void {
  const lignes: CelluleXlsx[][] = [
    [...tableau.entetes],
    ...tableau.lignes.map((l) => [...l]),
  ];

  telecharger(
    nomFichier(tableau.titre, 'xlsx'),
    // `.buffer` plutôt que le tableau lui-même : depuis que TypeScript
    // paramètre `Uint8Array` par son tampon, seul l'`ArrayBuffer` satisfait
    // `BlobPart` sans conversion — et le contenu est le même.
    ecrireXlsx(lignes, tableau.titre).buffer as ArrayBuffer,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}

export function exporterCsv(tableau: TableauExportable): void {
  const lignes = [
    [...tableau.entetes],
    ...tableau.lignes.map((l) => l.map(texte)),
  ];

  // La marque d'ordre des octets est ce qui fait lire l'UTF-8 à Excel : sans
  // elle, les accents se perdent à l'ouverture.
  telecharger(
    nomFichier(tableau.titre, 'csv'),
    BOM_UTF8 + ecrireCsv(lignes),
    'text/csv;charset=utf-8',
  );
}

/** Rien de ce qui vient de la base n'entre tel quel dans du balisage. */
function echapper(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STYLE_PDF = `
@page { size: A4 landscape; margin: 12mm }
* { box-sizing: border-box }
html, body { margin: 0; padding: 0 }
body { font: 10px "Google Sans", system-ui, sans-serif; color: #0f172a }
header { margin-bottom: 6mm }
h1 { margin: 0; font-size: 16px }
.porte { margin: 1mm 0 0; font-size: 10px; color: #475569 }
.edite { margin: 1mm 0 0; font-size: 9px; color: #94a3b8 }
table { width: 100%; border-collapse: collapse }
thead { display: table-header-group }
th, td {
  padding: 1.6mm 2mm;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
  vertical-align: top;
  /* CE QUI S'IMPRIME N'A PAS DE RECOURS (regle 31) : le texte se REPLIE entre
     les mots, il ne se tronque pas. Un libelle coupe sur une piece transmise
     ne se survole pas. */
  overflow-wrap: anywhere;
}
th {
  border-bottom: 1px solid #94a3b8;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #475569;
}
/* Une ligne ne se coupe jamais au changement de page. */
tr { break-inside: avoid }
td.nombre, th.nombre { text-align: right; font-variant-numeric: tabular-nums }
`;

/**
 * Le PDF passe par la fenêtre d'impression du navigateur, qui sait enregistrer
 * en PDF — comme l'organigramme et les reçus. Aucune bibliothèque de rendu
 * n'est embarquée pour un tableau (règle 29).
 */
export function exporterPdf(tableau: TableauExportable): void {
  if (tableau.lignes.length === 0) {
    // Une feuille blanche ne dit pas pourquoi elle est blanche.
    avertir('La sélection ne contient aucune ligne : il n’y a rien à imprimer.', {
      ton: 'information',
      titre: 'Rien à imprimer',
    });
    return;
  }

  // Aucun `await` avant `window.open` : une pop-up qui suit une attente n'est
  // plus rattachée au clic qui l'a déclenchée, et le navigateur la bloque.
  const fenetre = window.open('', '_blank', 'width=1200,height=800');
  if (!fenetre) {
    avertir("La fenêtre d'impression a été bloquée. Autorisez les pop-ups pour ce site.");
    return;
  }

  // Une colonne est numérique si TOUTES ses valeurs le sont : une seule
  // exception et l'alignement à droite trahirait la lecture.
  const numerique = tableau.entetes.map((_, i) =>
    tableau.lignes.every((l) => l[i] === null || typeof l[i] === 'number'),
  );

  const enTete = tableau.entetes
    .map((e, i) => `<th class="${numerique[i] ? 'nombre' : ''}">${echapper(e)}</th>`)
    .join('');

  const corps = tableau.lignes
    .map(
      (ligne) =>
        '<tr>' +
        ligne
          .map(
            (v, i) =>
              `<td class="${numerique[i] ? 'nombre' : ''}">${echapper(texte(v))}</td>`,
          )
          .join('') +
        '</tr>',
    )
    .join('');

  fenetre.document.write(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
      `<title>${echapper(tableau.titre)}</title>` +
      `<style>${STYLE_PDF}</style></head><body>` +
      '<header>' +
      `<h1>${echapper(tableau.titre)}</h1>` +
      (tableau.sousTitre ? `<p class="porte">${echapper(tableau.sousTitre)}</p>` : '') +
      /* La DATE D'ÉDITION est sur la pièce, pas dans le nom du fichier : une
         pièce transmise se détache toujours de son fichier. */
      `<p class="edite">Édité le ${echapper(formatDate(new Date()))}</p>` +
      '</header>' +
      `<table><thead><tr>${enTete}</tr></thead><tbody>${corps}</tbody></table>` +
      '</body></html>',
  );
  fenetre.document.close();

  let lance = false;
  const imprimer = () => {
    if (lance) return;
    lance = true;
    fenetre.print();
  };

  fenetre.addEventListener('load', imprimer);
  if (fenetre.document.readyState === 'complete') imprimer();
}
