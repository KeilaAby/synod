import { describe, expect, it } from 'vitest';

import { ErreurXlsx, dateExcel, indiceColonne, lireXlsx } from '@/lib/domain/xlsx';

/**
 * EF-CRO-11 / ARB-6 — lecture d'un classeur XLSX sans bibliotheque.
 *
 * Les classeurs de ces tests sont FABRIQUES ici, octet par octet. Deposer un
 * .xlsx binaire dans le depot rendrait les tests opaques : on ne saurait plus
 * ce qu'ils couvrent sans ouvrir Excel, et un cas limite ne s'ajouterait
 * qu'en refaisant un fichier a la main.
 */

// -----------------------------------------------------------------------------
// Fabrique d'archives ZIP
// -----------------------------------------------------------------------------

async function compresser(donnees: Uint8Array): Promise<Uint8Array> {
  const flux = new Blob([donnees as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

/**
 * Une archive ZIP minimale mais CONFORME : en-tetes locaux, catalogue central,
 * et fin de catalogue. Le CRC reste a zero — le lecteur ne le verifie pas, et
 * lui donner une valeur juste demanderait une implementation de CRC32 dont
 * aucun test n'a besoin.
 */
async function archive(
  fichiers: Record<string, string>,
  options: { compresse?: boolean } = {},
): Promise<ArrayBuffer> {
  const encodeur = new TextEncoder();
  const morceaux: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const [nom, contenu] of Object.entries(fichiers)) {
    const nomOctets = encodeur.encode(nom);
    const clair = encodeur.encode(contenu);
    const methode = options.compresse ? 8 : 0;
    const donnees = options.compresse ? await compresser(clair) : clair;

    const local = new Uint8Array(30 + nomOctets.length);
    const vueLocale = new DataView(local.buffer);
    vueLocale.setUint32(0, 0x04034b50, true);
    vueLocale.setUint16(4, 20, true);
    vueLocale.setUint16(8, methode, true);
    vueLocale.setUint32(18, donnees.length, true);
    vueLocale.setUint32(22, clair.length, true);
    vueLocale.setUint16(26, nomOctets.length, true);
    local.set(nomOctets, 30);

    const entree = new Uint8Array(46 + nomOctets.length);
    const vueCentrale = new DataView(entree.buffer);
    vueCentrale.setUint32(0, 0x02014b50, true);
    vueCentrale.setUint16(4, 20, true);
    vueCentrale.setUint16(6, 20, true);
    vueCentrale.setUint16(10, methode, true);
    vueCentrale.setUint32(20, donnees.length, true);
    vueCentrale.setUint32(24, clair.length, true);
    vueCentrale.setUint16(28, nomOctets.length, true);
    vueCentrale.setUint32(42, offset, true);
    entree.set(nomOctets, 46);

    morceaux.push(local, donnees);
    central.push(entree);
    offset += local.length + donnees.length;
  }

  const tailleCentral = central.reduce((n, e) => n + e.length, 0);
  const fin = new Uint8Array(22);
  const vueFin = new DataView(fin.buffer);
  vueFin.setUint32(0, 0x06054b50, true);
  vueFin.setUint16(8, central.length, true);
  vueFin.setUint16(10, central.length, true);
  vueFin.setUint32(12, tailleCentral, true);
  vueFin.setUint32(16, offset, true);

  const tout = [...morceaux, ...central, fin];
  const total = tout.reduce((n, m) => n + m.length, 0);
  const resultat = new Uint8Array(total);

  let position = 0;
  for (const morceau of tout) {
    resultat.set(morceau, position);
    position += morceau.length;
  }
  return resultat.buffer;
}

// -----------------------------------------------------------------------------
// Un classeur de reference
// -----------------------------------------------------------------------------

const CLASSEUR = (feuille: string, cible = 'worksheets/sheet1.xml') => ({
  'xl/workbook.xml':
    '<?xml version="1.0"?><workbook xmlns:r="http://x"><sheets>' +
    '<sheet name="Croyants" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':
    `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="${cible}"/></Relationships>`,
  'xl/sharedStrings.xml':
    '<?xml version="1.0"?><sst>' +
    '<si><t>Nom</t></si>' +
    '<si><t>Date de naissance</t></si>' +
    '<si><t>KOFFI</t></si>' +
    '<si><t>ADANHOUNM&amp;E</t></si>' +
    '</sst>',
  // Style 0 : general. Style 1 : format de date integre. Style 2 : format
  // personnalise. Style 3 : personnalise, mais du texte.
  'xl/styles.xml':
    '<?xml version="1.0"?><styleSheet>' +
    '<numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>' +
    '<numFmt numFmtId="165" formatCode="0.00&quot; kg&quot;"/></numFmts>' +
    '<cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs>' +
    '</styleSheet>',
  [`xl/${cible}`]: feuille,
});

const FEUILLE_SIMPLE =
  '<?xml version="1.0"?><worksheet><sheetData>' +
  '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
  '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>32248</v></c></row>' +
  '<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3" s="2"><v>33838</v></c></row>' +
  '</sheetData></worksheet>';

describe('EF-CRO-11 — un classeur se lit comme un CSV', () => {
  it('rend le meme tableau de chaines que lireCsv', async () => {
    const lignes = await lireXlsx(await archive(CLASSEUR(FEUILLE_SIMPLE)));

    expect(lignes).toEqual([
      ['Nom', 'Date de naissance'],
      ['KOFFI', '1988-04-15'],
      ['ADANHOUNM&E', '1992-08-22'],
    ]);
  });

  it('lit aussi une archive COMPRESSEE — le cas reel', async () => {
    // Excel compresse toujours ; l'archive non compressee ne sert qu'aux tests
    // les plus lisibles. Sans ce cas, le chemin `DecompressionStream` — le seul
    // que la production emprunte — ne serait jamais exerce.
    const lignes = await lireXlsx(
      await archive(CLASSEUR(FEUILLE_SIMPLE), { compresse: true }),
    );

    expect(lignes[1]).toEqual(['KOFFI', '1988-04-15']);
  });
});

describe('Les dates, seul piege reel du format', () => {
  it('convertit un numero de serie quand le FORMAT dit que c en est une', async () => {
    // Excel ne stocke pas une date mais un nombre de jours : sans styles.xml,
    // « 15/04/1988 » arriverait sous la forme « 32248 ».
    const lignes = await lireXlsx(await archive(CLASSEUR(FEUILLE_SIMPLE)));
    expect(lignes[1]![1]).toBe('1988-04-15');
  });

  it('laisse un nombre etre un nombre quand le format n en fait pas une date', async () => {
    const feuille =
      '<?xml version="1.0"?><worksheet><sheetData>' +
      '<row r="1"><c r="A1" s="0"><v>42</v></c><c r="B1" s="3"><v>7.5</v></c></row>' +
      '</sheetData></worksheet>';

    // Le format « 0.00" kg" » contient un « g » : sans neutraliser le texte
    // litteral entre guillemets, il passerait pour une date.
    expect(await lireXlsx(await archive(CLASSEUR(feuille)))).toEqual([['42', '7.5']]);
  });

  it('place les bornes du bug de 1900 la ou Excel les place', () => {
    // Excel tient 1900 pour bissextile — heritage de Lotus 1-2-3 — et compte un
    // 29 fevrier 1900 qui n'a jamais existe. Toute conversion qui ignore ce
    // decalage se trompe d'un jour sur toutes les dates anterieures a mars 1900.
    expect(dateExcel(1)).toBe('1900-01-01');
    expect(dateExcel(59)).toBe('1900-02-28');
    expect(dateExcel(61)).toBe('1900-03-01');
    expect(dateExcel(25569)).toBe('1970-01-01');
    expect(dateExcel(0)).toBeNull();
  });
});

describe('Ce qui decalerait silencieusement les colonnes', () => {
  it('comble les colonnes SAUTEES au lieu de tout decaler a gauche', async () => {
    // Une cellule vide n'est pas ecrite dans le fichier : elle n'existe que par
    // le trou entre deux references. Sans comblement, « C » remonterait en
    // deuxieme colonne et chaque champ changerait de sens.
    const feuille =
      '<?xml version="1.0"?><worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="inlineStr"><is><t>A</t></is></c>' +
      '<c r="C1" t="inlineStr"><is><t>C</t></is></c></row>' +
      '<row r="2"><c r="A2" t="inlineStr"><is><t>x</t></is></c>' +
      '<c r="B2" t="inlineStr"><is><t>y</t></is></c>' +
      '<c r="C2" t="inlineStr"><is><t>z</t></is></c></row>' +
      '</sheetData></worksheet>';

    expect(await lireXlsx(await archive(CLASSEUR(feuille)))).toEqual([
      ['A', '', 'C'],
      ['x', 'y', 'z'],
    ]);
  });

  it('compte les lettres de colonne au-dela de Z', () => {
    expect(indiceColonne('A1')).toBe(0);
    expect(indiceColonne('Z9')).toBe(25);
    expect(indiceColonne('AA1')).toBe(26);
    expect(indiceColonne('AB12')).toBe(27);
  });

  it('ecarte les lignes vides de fin de zone', async () => {
    const feuille =
      '<?xml version="1.0"?><worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Nom</t></is></c></row>' +
      '<row r="2"/><row r="3"/>' +
      '</sheetData></worksheet>';

    expect(await lireXlsx(await archive(CLASSEUR(feuille)))).toEqual([['Nom']]);
  });
});

describe('La feuille lue est celle qu on voit en premier', () => {
  it('suit la declaration du classeur, pas le nom de fichier', async () => {
    // Deplacer un onglet ne renomme pas son fichier : un classeur dont la
    // premiere feuille est `sheet3.xml` existe. Lire `sheet1.xml` importerait
    // une autre feuille que celle affichee, sans le signaler.
    const fichiers = CLASSEUR(
      '<?xml version="1.0"?><worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="inlineStr"><is><t>bonne feuille</t></is></c></row>' +
        '</sheetData></worksheet>',
      'worksheets/sheet3.xml',
    );

    fichiers['xl/worksheets/sheet1.xml'] =
      '<?xml version="1.0"?><worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="inlineStr"><is><t>mauvaise feuille</t></is></c></row>' +
      '</sheetData></worksheet>';

    expect(await lireXlsx(await archive(fichiers))).toEqual([['bonne feuille']]);
  });
});

describe('Refus explicites', () => {
  it('nomme le probleme quand le fichier n est pas un classeur', async () => {
    const texte = new TextEncoder().encode('Nom;Prenom\nKOFFI;Amos');

    await expect(lireXlsx(texte.buffer as ArrayBuffer)).rejects.toThrow(ErreurXlsx);
    // Le message doit proposer une SORTIE : un refus qui ne dit pas quoi faire
    // renvoie l'utilisateur au support.
    await expect(lireXlsx(texte.buffer as ArrayBuffer)).rejects.toThrow(/CSV/);
  });

  it('refuse une archive sans feuille plutot que de rendre un tableau vide', async () => {
    // Un tableau vide se lirait comme « fichier sans donnees », ce qui est faux
    // et envoie chercher l'erreur dans le fichier source.
    await expect(lireXlsx(await archive({ 'autre.txt': 'rien' }))).rejects.toThrow(ErreurXlsx);
  });
});
