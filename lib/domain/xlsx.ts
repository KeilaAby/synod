/**
 * Lecture d'un classeur XLSX — EF-CRO-11, EF-STR-11, ARB-6.
 *
 * POURQUOI SANS BIBLIOTHEQUE
 *
 * Les deux candidates du registre npm posent chacune un probleme : `xlsx` y est
 * fige depuis des annees avec des vulnerabilites connues — sa version maintenue
 * vit hors du registre —, et `exceljs` pese pres d'un megaoctet pour un besoin
 * de LECTURE d'un tableau plat.
 *
 * Or un .xlsx est une archive ZIP de fichiers XML, et le navigateur sait deja
 * decompresser (`DecompressionStream`). Ce qui reste tient dans ce module :
 * localiser trois entrees de l'archive, et lire leur XML. Le resultat est un
 * `string[][]`, exactement ce que produit `lireCsv` — la suite de la chaine
 * (`analyserLot`, correspondance de colonnes, pre-validation) ne voit aucune
 * difference.
 *
 * CE QUI EST LU, ET CE QUI NE L'EST PAS
 *
 * La PREMIERE feuille du classeur, telle que le classeur la declare — pas
 * `sheet1.xml`, qui n'est pas toujours la premiere a l'ecran. Valeurs, chaines
 * partagees, chaines en ligne, booleens, nombres, et les DATES converties en
 * `AAAA-MM-JJ`.
 *
 * Les dates meritent leur detour : Excel ne stocke pas une date mais un nombre
 * de jours, et c'est le FORMAT de la cellule qui dit que ce nombre est une
 * date. Sans lire `styles.xml`, une date de naissance arriverait sous la forme
 * « 32143 » et la pre-validation la refuserait sans que personne comprenne
 * pourquoi.
 *
 * Ne sont pas lus : formules (leur derniere valeur calculee l'est), mise en
 * forme, cellules fusionnees (seule la premiere cellule porte la valeur, ce
 * que fait deja Excel), feuilles suivantes.
 *
 * Module PUR : aucune dependance, donc testable directement.
 */

// -----------------------------------------------------------------------------
// L'archive ZIP
// -----------------------------------------------------------------------------

const SIGNATURE_FIN_CENTRAL = 0x06054b50;
const SIGNATURE_ENTREE_CENTRALE = 0x02014b50;
const SIGNATURE_ENTREE_LOCALE = 0x04034b50;

interface EntreeArchive {
  methode: number;
  tailleCompressee: number;
  offsetLocal: number;
}

export class ErreurXlsx extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurXlsx';
  }
}

/**
 * Catalogue des entrees de l'archive.
 *
 * On part de la FIN : un ZIP se lit par son « end of central directory », et
 * c'est la seule facon fiable de retrouver le catalogue — les en-tetes locaux,
 * eux, peuvent annoncer des tailles nulles quand l'archive a ete ecrite en
 * flux, ce que font certains tableurs.
 */
function catalogue(octets: Uint8Array, vue: DataView): Map<string, EntreeArchive> {
  let fin = -1;
  // Le commentaire final peut atteindre 65 535 octets ; au-dela, ce n'est pas
  // un ZIP, et mieux vaut le dire que de balayer tout le fichier.
  const borne = Math.max(0, octets.length - 66_000);

  for (let i = octets.length - 22; i >= borne; i--) {
    if (vue.getUint32(i, true) === SIGNATURE_FIN_CENTRAL) {
      fin = i;
      break;
    }
  }

  if (fin < 0) {
    throw new ErreurXlsx(
      "Ce fichier n'est pas un classeur Excel lisible. Enregistrez-le au format .xlsx, ou exportez-le en CSV.",
    );
  }

  const nombre = vue.getUint16(fin + 10, true);
  let position = vue.getUint32(fin + 16, true);

  const decodeur = new TextDecoder();
  const entrees = new Map<string, EntreeArchive>();

  for (let i = 0; i < nombre; i++) {
    if (position + 46 > octets.length) break;
    if (vue.getUint32(position, true) !== SIGNATURE_ENTREE_CENTRALE) break;

    const longueurNom = vue.getUint16(position + 28, true);
    const longueurExtra = vue.getUint16(position + 30, true);
    const longueurCommentaire = vue.getUint16(position + 32, true);

    entrees.set(decodeur.decode(octets.subarray(position + 46, position + 46 + longueurNom)), {
      methode: vue.getUint16(position + 10, true),
      tailleCompressee: vue.getUint32(position + 20, true),
      offsetLocal: vue.getUint32(position + 42, true),
    });

    position += 46 + longueurNom + longueurExtra + longueurCommentaire;
  }

  return entrees;
}

async function extraire(
  octets: Uint8Array,
  vue: DataView,
  entree: EntreeArchive,
): Promise<string> {
  if (vue.getUint32(entree.offsetLocal, true) !== SIGNATURE_ENTREE_LOCALE) {
    throw new ErreurXlsx('Ce classeur est endommage : une entree de son archive est illisible.');
  }

  // L'en-tete LOCAL redit les longueurs de nom et d'extra, qui different de
  // celles du catalogue : c'est lui qui donne le debut reel des donnees.
  const longueurNom = vue.getUint16(entree.offsetLocal + 26, true);
  const longueurExtra = vue.getUint16(entree.offsetLocal + 28, true);
  const debut = entree.offsetLocal + 30 + longueurNom + longueurExtra;

  const brut = octets.subarray(debut, debut + entree.tailleCompressee);

  if (entree.methode === 0) return new TextDecoder().decode(brut);

  if (entree.methode !== 8) {
    throw new ErreurXlsx(
      "Ce classeur emploie une compression que le navigateur ne sait pas lire. Reenregistrez-le depuis Excel, ou exportez-le en CSV.",
    );
  }

  // `deflate-raw` et non `deflate` : le ZIP stocke le flux sans l'en-tete zlib.
  const flux = new Blob([brut as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));

  return new Response(flux).text();
}

// -----------------------------------------------------------------------------
// Le XML
// -----------------------------------------------------------------------------

const ENTITES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decoderEntites(texte: string): string {
  return texte.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (entier, code: string) => {
    if (code.startsWith('#x')) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
    return ENTITES[code] ?? entier;
  });
}

interface Element {
  attributs: string;
  contenu: string;
}

/**
 * Les elements d'un nom donne, dans l'ordre du document.
 *
 * Une expression reguliere suffit ici, et ce n'est pas de la paresse : ce XML
 * est ECRIT PAR UNE MACHINE, sans commentaire ni CDATA, et aucun des elements
 * qu'on cherche ne s'imbrique dans un element de meme nom. Un analyseur complet
 * n'apporterait rien qu'une dependance.
 */
function elements(xml: string, nom: string): Element[] {
  const motif = new RegExp(`<${nom}(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${nom}>)`, 'g');
  const trouves: Element[] = [];

  for (const found of xml.matchAll(motif)) {
    trouves.push({ attributs: found[1] ?? '', contenu: found[2] ?? '' });
  }
  return trouves;
}

function attribut(attributs: string, nom: string): string | null {
  const found = attributs.match(new RegExp(`${nom}="([^"]*)"`));
  return found ? decoderEntites(found[1]!) : null;
}

/** Le texte de tous les `<t>` d'un fragment, concatene — le texte enrichi les eclate. */
function texteDe(fragment: string): string {
  return elements(fragment, 't')
    .map((t) => decoderEntites(t.contenu))
    .join('');
}

// -----------------------------------------------------------------------------
// Les dates
// -----------------------------------------------------------------------------

/** Formats de date integres a Excel — ils n'apparaissent pas dans `numFmts`. */
const FORMATS_DATE_INTEGRES = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47,
]);

function formatEstUneDate(code: string): boolean {
  // Le texte litteral d'un format vit entre guillemets : « "jour " d » ne fait
  // pas de ce format une date a cause du « j » de « jour ».
  const sansLitteraux = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
  return /[dmyhs]/i.test(sansLitteraux) && !/^[^dmy]*$/i.test(sansLitteraux);
}

/**
 * Indices de style dont le format est une date.
 *
 * Excel ne stocke pas une date : il stocke un nombre de jours et une mise en
 * forme. Sans ce tri, `15/04/1988` arriverait sous la forme `32247`.
 */
function stylesDate(stylesXml: string): Set<number> {
  const personnalises = new Map<number, string>();

  for (const format of elements(stylesXml, 'numFmt')) {
    const id = Number(attribut(format.attributs, 'numFmtId'));
    const code = attribut(format.attributs, 'formatCode');
    if (Number.isFinite(id) && code) personnalises.set(id, code);
  }

  // `cellXfs` porte les styles REELLEMENT appliques aux cellules ; `cellStyleXfs`
  // porte les styles nommes, auxquels les cellules ne renvoient pas.
  const blocCellules = stylesXml.match(/<cellXfs[\s\S]*?<\/cellXfs>/)?.[0] ?? '';
  const dates = new Set<number>();

  elements(blocCellules, 'xf').forEach((xf, index) => {
    const id = Number(attribut(xf.attributs, 'numFmtId') ?? '0');
    const personnalise = personnalises.get(id);

    if (FORMATS_DATE_INTEGRES.has(id) || (personnalise && formatEstUneDate(personnalise))) {
      dates.add(index);
    }
  });

  return dates;
}

/**
 * Le numero de serie d'Excel, en `AAAA-MM-JJ`.
 *
 * Le decalage de 1 sous 60 n'est pas une coquetterie : Excel tient 1900 pour
 * bissextile — un bug de Lotus 1-2-3 conserve par compatibilite — et compte
 * donc un 29 fevrier 1900 qui n'a jamais existe.
 */
export function dateExcel(serie: number): string | null {
  if (!Number.isFinite(serie) || serie < 1) return null;

  const jours = Math.floor(serie > 59 ? serie - 1 : serie);
  const date = new Date(Date.UTC(1899, 11, 31) + jours * 86_400_000);

  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------
// La feuille
// -----------------------------------------------------------------------------

/** `AB` -> 27. Les colonnes sautees doivent laisser une cellule vide, pas un decalage. */
export function indiceColonne(reference: string): number {
  const lettres = reference.match(/^[A-Z]+/)?.[0] ?? 'A';
  let indice = 0;
  for (const lettre of lettres) indice = indice * 26 + (lettre.charCodeAt(0) - 64);
  return indice - 1;
}

function grille(
  feuilleXml: string,
  chaines: string[],
  dates: Set<number>,
): string[][] {
  const lignes: string[][] = [];

  for (const ligne of elements(feuilleXml, 'row')) {
    const cellules: string[] = [];

    for (const cellule of elements(ligne.contenu, 'c')) {
      const colonne = indiceColonne(attribut(cellule.attributs, 'r') ?? '');
      const type = attribut(cellule.attributs, 't') ?? 'n';
      const style = Number(attribut(cellule.attributs, 's') ?? '-1');
      const brut = elements(cellule.contenu, 'v')[0]?.contenu ?? '';

      let valeur: string;

      if (type === 's') {
        valeur = chaines[Number(brut)] ?? '';
      } else if (type === 'inlineStr') {
        valeur = texteDe(cellule.contenu);
      } else if (type === 'b') {
        valeur = brut === '1' ? 'VRAI' : 'FAUX';
      } else if (type === 'e') {
        // Une cellule en erreur (#N/A, #REF!) vaut mieux vide qu'en litteral :
        // la pre-validation dira « champ manquant », ce qui est la verite.
        valeur = '';
      } else if (type === 'str') {
        valeur = decoderEntites(brut);
      } else {
        valeur = (dates.has(style) ? dateExcel(Number(brut)) : null) ?? decoderEntites(brut);
      }

      // Les trous entre deux references sont des cellules vides, pas des
      // colonnes absentes : sans ce comblement, tout se decalerait a gauche.
      while (cellules.length < colonne) cellules.push('');
      cellules[colonne] = valeur;
    }

    lignes.push(cellules);
  }

  // Une feuille porte souvent des lignes vides en fin de zone utilisee.
  while (lignes.length > 0 && lignes[lignes.length - 1]!.every((c) => c.trim() === '')) {
    lignes.pop();
  }

  const largeur = lignes.reduce((max, l) => Math.max(max, l.length), 0);
  return lignes.map((ligne) => {
    const complete = [...ligne];
    while (complete.length < largeur) complete.push('');
    return complete;
  });
}

// -----------------------------------------------------------------------------

/**
 * La premiere feuille d'un classeur, en tableau de lignes.
 *
 * Meme sortie que `lireCsv` : la chaine d'import ne distingue pas les deux
 * origines.
 */
export async function lireXlsx(source: ArrayBuffer): Promise<string[][]> {
  const octets = new Uint8Array(source);
  const vue = new DataView(source);
  const entrees = catalogue(octets, vue);

  const lire = async (nom: string): Promise<string | null> => {
    const entree = entrees.get(nom);
    return entree ? extraire(octets, vue, entree) : null;
  };

  const classeur = await lire('xl/workbook.xml');
  if (!classeur) {
    throw new ErreurXlsx(
      "Ce fichier n'est pas un classeur Excel : son contenu est introuvable. Exportez-le en CSV.",
    );
  }

  /**
   * La PREMIERE feuille declaree, et non `sheet1.xml`.
   *
   * L'ordre des fichiers de l'archive ne dit rien de l'ordre des onglets : un
   * classeur dont on a deplace les feuilles garde ses noms de fichiers. Lire
   * `sheet1.xml` importerait alors une autre feuille que celle affichee en
   * premier — sans le signaler.
   */
  const premiere = elements(classeur, 'sheet')[0];
  const relations = (await lire('xl/_rels/workbook.xml.rels')) ?? '';
  const identifiant = premiere ? attribut(premiere.attributs, 'r:id') : null;

  let cible: string | null = null;
  if (identifiant) {
    const relation = elements(relations, 'Relationship').find(
      (r) => attribut(r.attributs, 'Id') === identifiant,
    );
    const chemin = relation ? attribut(relation.attributs, 'Target') : null;
    if (chemin) cible = chemin.startsWith('/') ? chemin.slice(1) : `xl/${chemin}`;
  }

  const feuille =
    (cible ? await lire(cible) : null) ?? (await lire('xl/worksheets/sheet1.xml'));

  if (!feuille) {
    throw new ErreurXlsx('Ce classeur ne contient aucune feuille lisible.');
  }

  const chaines = elements((await lire('xl/sharedStrings.xml')) ?? '', 'si').map((si) =>
    texteDe(si.contenu),
  );

  // Les styles sont facultatifs : sans eux, les nombres restent des nombres.
  const dates = stylesDate((await lire('xl/styles.xml')) ?? '');

  return grille(feuille, chaines, dates);
}
