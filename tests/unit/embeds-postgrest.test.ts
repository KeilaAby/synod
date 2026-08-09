import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * PGRST201 — tout embed PostgREST doit NOMMER sa cle etrangere.
 *
 * Ce test existe parce que le defaut s'est produit DEUX FOIS :
 *
 *   - 6 aout — deux cles entre `profiles` et `entities` empechaient la
 *     connexion (« Votre compte n'est pas rattache a une entite ») ;
 *   - 7 aout — deux cles entre `baptemes` et `croyants` (le baptise et le
 *     celebrant) rendaient le registre des baptemes illisible.
 *
 * Dans les deux cas l'erreur n'apparait qu'a L'EXECUTION : une chaine de
 * selection PostgREST n'est verifiee ni par TypeScript ni par le build. Seul un
 * test peut la voir.
 *
 * La regle est « nommer TOUJOURS », pas « nommer quand c'est ambigu » : une
 * requete correcte aujourd'hui casse le jour ou une seconde cle apparait vers
 * la meme table. Nommer d'emblee la rend insensible a cette evolution.
 */

const DOSSIER = join(process.cwd(), 'lib', 'data');

/**
 * Un embed s'ecrit `alias:table (champs)` ou `table (champs)`. Il est NOMME
 * quand un `!contrainte` suit le nom de la table.
 *
 * On ne cible que les tables du schema `public` : les fonctions SQL et les
 * agregats (`count`) ne sont pas des embeds.
 */
const EMBED = /(?:^|\n)\s*(?:([a-zA-Z][\w]*)\s*:\s*)?([a-z][a-z_]*)\s*(!\w+)?\s*\(/g;

/** Tables jamais embarquees : ce sont des colonnes ou des mots-cles. */
const NON_TABLES = new Set(['select', 'count', 'sum', 'avg', 'min', 'max', 'and', 'or']);

function fichiersDeDonnees(): string[] {
  return readdirSync(DOSSIER)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(DOSSIER, f));
}

/**
 * Extrait les chaines de selection.
 *
 * Chaque motif est ANCRE sur ce qui precede la chaine — une affectation, ou
 * l'ouverture de `.select(`. La premiere version cherchait n'importe quel
 * gabarit entre deux accents graves ; le 9 aout, un `\`fusionnerDisposition\``
 * ecrit dans un COMMENTAIRE a decale les paires, et tout le code compris entre
 * ce commentaire et le gabarit suivant a ete lu comme une chaine de selection.
 * Le test a signale `if`, `return`, `for` comme des embeds anonymes.
 *
 * Un garde-fou qui crie a tort est un garde-fou qu'on finit par desactiver.
 */
function chainesDeSelection(source: string): string[] {
  const chaines: string[] = [];

  const motifs = [
    /(?:=|\.select\(\s*)\s*`([^`]*)`/g, // gabarit affecte ou passe a select()
    /\.select\(\s*'([^']*)'/g, // chaine simple
    /\.select\(\s*"([^"]*)"/g,
  ];

  for (const motif of motifs) {
    for (const m of source.matchAll(motif)) {
      if (m[1] && m[1].includes('(')) chaines.push(m[1]);
    }
  }
  return chaines;
}

describe('PGRST201 — les embeds nomment leur cle etrangere', () => {
  const fichiers = fichiersDeDonnees();

  it('trouve bien les modules de lecture', () => {
    // Sans cette garde, un renommage de dossier rendrait le test vert a vide.
    expect(fichiers.length).toBeGreaterThan(3);
  });

  it('voit encore les embeds — un extracteur aveugle passerait pour vert', () => {
    // Le test ne prouve rien s'il n'extrait plus rien : la garde precedente
    // couvre le dossier, celle-ci couvre l'EXTRACTION elle-meme.
    const source = readFileSync(join(DOSSIER, 'bureaux.ts'), 'utf8');
    const embeds = chainesDeSelection(source).flatMap((chaine) => [
      ...chaine.matchAll(EMBED),
    ]);

    expect(embeds.length).toBeGreaterThan(3);
    // Et il n'extrait QUE des chaines de selection : du code JavaScript lu par
    // erreur amenerait des mots-cles dans la liste.
    expect(embeds.map((m) => m[2])).not.toContain('if');
  });

  for (const fichier of fichiers) {
    const nom = fichier.split(/[\\/]/).pop()!;

    it(`${nom} — aucun embed anonyme`, () => {
      const source = readFileSync(fichier, 'utf8');
      const anonymes: string[] = [];

      for (const chaine of chainesDeSelection(source)) {
        for (const m of chaine.matchAll(EMBED)) {
          const [, alias, table, contrainte] = m;
          if (!table || NON_TABLES.has(table)) continue;
          if (!contrainte) anonymes.push(alias ? `${alias}:${table}` : table);
        }
      }

      expect(anonymes, `Nommez la cle : ${anonymes.join(', ')}`).toEqual([]);
    });
  }
});
