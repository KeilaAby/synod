#!/usr/bin/env node
/**
 * Assemble les migrations en fichiers collables d'un seul tenant dans
 * l'editeur SQL de Supabase.
 *
 * Les migrations restent la SOURCE DE VERITE : les fichiers produits sont
 * generes, jamais edites a la main.
 *
 *   pnpm db:bundle                 -> supabase/install.sql
 *                                     base NEUVE : tout, migrations + amorce.
 *
 *   pnpm db:bundle --depuis 0009   -> supabase/install-incremental.sql
 *                                     base DEJA INSTALLEE : seulement ce qui
 *                                     suit la version indiquee.
 *
 * Pourquoi deux fichiers plutot qu'un seul rejouable : rendre chaque
 * instruction idempotente (`create type` sous garde, `drop policy if exists`
 * avant chaque `create policy`...) alourdirait les migrations au point de les
 * rendre illisibles, pour un benefice qu'un simple registre de versions
 * apporte deja.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dossierMigrations = join(racine, 'supabase', 'migrations');

const argDepuis = process.argv.indexOf('--depuis');
const depuis = argDepuis > -1 ? process.argv[argDepuis + 1] : null;

/** L'ordre lexicographique EST l'ordre d'application (0000, 0001, …). */
const migrations = readdirSync(dossierMigrations)
  .filter((f) => f.endsWith('.sql'))
  .sort();

/** `0010_croyants.sql` -> `0010` */
const versionDe = (fichier) => fichier.split('_')[0];

/** Le registre lui-meme doit toujours precéder le reste. */
const REGISTRE = migrations.find((f) => versionDe(f) === '0000');
if (!REGISTRE) {
  console.error('0000_migrations.sql est introuvable : le registre est obligatoire.');
  process.exit(1);
}

const aJouer = migrations.filter((f) => {
  if (versionDe(f) === '0000') return false;
  return depuis === null || versionDe(f) > depuis;
});

if (depuis !== null && aJouer.length === 0) {
  console.error(`Aucune migration posterieure a « ${depuis} ».`);
  process.exit(1);
}

function section(titre, contenu) {
  return (
    `\n\n-- #############################################################################\n` +
    `-- ## ${titre}\n` +
    `-- #############################################################################\n\n` +
    contenu.trimEnd()
  );
}

/** Enregistre la migration : c'est ce qui rend le fichier suivant calculable. */
function marquer(version) {
  return `\n\ninsert into schema_migrations (version) values ('${version}')\n  on conflict (version) do nothing;`;
}

const morceaux = [];

if (depuis === null) {
  morceaux.push(`-- =============================================================================
-- SYNOD — Installation complete de la base
-- =============================================================================
-- FICHIER GENERE — ne pas editer a la main.
-- Regenerer avec : pnpm db:bundle
--
-- ⚠️  BASE NEUVE UNIQUEMENT.
--     Sur une base deja installee, ce fichier echoue des le premier
--     « create type ... already exists ». Utilisez alors :
--         pnpm db:bundle --depuis <derniere version appliquee>
--     La derniere version appliquee se lit dans supabase/diagnostic.sql.
--
-- Genere le ${new Date().toISOString()}
-- Migrations : ${aJouer.length} + amorce
-- =============================================================================
`);
} else {
  morceaux.push(`-- =============================================================================
-- SYNOD — Mise a jour de la base
-- =============================================================================
-- FICHIER GENERE — ne pas editer a la main.
-- Regenerer avec : pnpm db:bundle --depuis ${depuis}
--
-- Contient uniquement les migrations POSTERIEURES a « ${depuis} » :
${aJouer.map((f) => `--   · ${f}`).join('\n')}
--
-- L'amorce (seed) n'est PAS incluse : elle a deja ete appliquee.
--
-- Genere le ${new Date().toISOString()}
-- =============================================================================
`);
}

morceaux.push(
  section(REGISTRE, readFileSync(join(dossierMigrations, REGISTRE), 'utf8')),
  marquer('0000'),
);

// Sur une base existante, on inscrit d'abord ce qui a deja tourne : sans quoi
// le registre naitrait vide et laisserait croire que rien n'est applique.
if (depuis !== null) {
  const anterieures = migrations
    .filter((f) => versionDe(f) !== '0000' && versionDe(f) <= depuis)
    .map((f) => `  ('${versionDe(f)}')`);

  if (anterieures.length > 0) {
    morceaux.push(
      section(
        'Rattrapage du registre — migrations deja appliquees',
        `insert into schema_migrations (version) values\n${anterieures.join(',\n')}\n  on conflict (version) do nothing;`,
      ),
    );
  }
}

/**
 * Preflight — detecte le cas DANGEREUX, tolere le cas benin.
 *
 * Premiere version : le fichier refusait tout recouvrement du deja-applique.
 * C'etait le mauvais critere. Depuis la regle 23, chaque migration est
 * REJOUABLE — la rejouer ne coute rien. Le garde punissait donc le cas benin,
 * et l'utilisateur se retrouvait bloque devant un fichier parfaitement sain.
 *
 * Ce qui est reellement dangereux, c'est un ECART : lancer un fichier
 * `--depuis 0016` sur une base qui n'en est qu'a 0014. Le rattrapage du
 * registre inscrirait alors 0015 et 0016 comme appliquees SANS les avoir
 * jouees, et le trou deviendrait invisible. Le controle passe donc AVANT ce
 * rattrapage.
 */
if (depuis !== null && aJouer.length > 0) {
  const premiere = versionDe(aJouer[0]);

  morceaux.push(
    section(
      'Preflight — la base est-elle bien a jour jusqu a ce point ?',
      `do $$
declare v_dernier text;
begin
  select max(version) into v_dernier from schema_migrations;

  -- Un trou : des migrations seraient inscrites sans avoir ete jouees.
  if v_dernier is null or v_dernier < '${depuis}' then
    raise exception
      'Ce fichier suppose la base a jour jusqu a ${depuis}, or elle en est a %.',
      coalesce(v_dernier, 'aucune migration')
      using hint =
        'Regenerez le fichier avec :  pnpm db:bundle --depuis ' ||
        coalesce(v_dernier, '0000') ||
        '   Sans cela, les migrations manquantes seraient inscrites comme ' ||
        'appliquees sans avoir ete jouees.';
  end if;

  -- Recouvrement : sans gravite, les migrations sont rejouables (regle 23).
  if v_dernier >= '${premiere}' then
    raise notice 'Migrations % et suivantes deja appliquees : elles sont rejouees sans effet.', '${premiere}';
  end if;
end $$;`,
    ),
  );
}
for (const fichier of aJouer) {
  morceaux.push(
    section(fichier, readFileSync(join(dossierMigrations, fichier), 'utf8')),
    marquer(versionDe(fichier)),
  );
}

if (depuis === null) {
  morceaux.push(
    section(
      'seed.sql — amorce des donnees de reference',
      readFileSync(join(racine, 'supabase', 'seed.sql'), 'utf8'),
    ),
  );
}

const sortie = join(
  racine,
  'supabase',
  depuis === null ? 'install.sql' : 'install-incremental.sql',
);

writeFileSync(sortie, `${morceaux.join('')}\n`, 'utf8');

const nom = sortie.replace(`${racine}\\`, '').replace(`${racine}/`, '');
console.log(`${nom} genere — ${aJouer.length} migration(s)${depuis === null ? ' + amorce' : ''}.`);
for (const fichier of aJouer) console.log(`  · ${fichier}`);
