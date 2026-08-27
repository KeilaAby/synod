import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parametresSchema } from '@/lib/validation/parametres';

/**
 * EF-BAP-07, EF-CRO-11, EF-ADM-13 — LES DEUX PLAFONDS D'IMPORT.
 *
 * Ils étaient deux constantes écrites en dur, choisies à l'estime. La première
 * a été atteinte : une cérémonie de district peut dépasser cent baptisés, et
 * l'import refusait alors en demandant de scinder le fichier.
 *
 * LA RÈGLE EST ÉCRITE À DEUX ENDROITS — le formulaire (Zod) et la base
 * (`check`) — et deux écritures de la même règle divergent le jour où l'une
 * change seule. Ce test lit le SQL et compare : sinon l'écart serait
 * INVISIBLE, l'écran acceptant ce que la base refuserait, ou l'inverse.
 */

const SQL = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '0079_plafonds_import.sql'),
  'utf8',
);

/** Un jeu de valeurs valides, dont on ne fait varier qu'un plafond à la fois. */
function parametresValides(modif: Record<string, unknown> = {}) {
  return {
    nomOrganisation: 'SYNOD',
    devise: 'MGA',
    fuseauHoraire: 'Indian/Antananarivo',
    fenetreNouveauxBaptisesJours: 15,
    financeValidationActive: false,
    separationSaisieValidation: true,
    transfertAutoApprobationInterne: true,
    promotionGradeValidation: false,
    rapportCompositionLibre: false,
    reinitialisationParEmail: false,
    couleurPrimaire: '#1d4ed8',
    toastDureeMs: 4000,
    toastBoutonFermer: true,
    toastCouleursVives: false,
    toastPosition: 'bottom-right',
    joursCorrectionSaisie: 15,
    plafondLotBaptemes: 100,
    plafondImportCroyants: 5000,
    ...modif,
  };
}

describe('EF-ADM-13 — les plafonds d’import sont réglables', () => {
  it('accepte les deux valeurs qui étaient auparavant en dur', () => {
    const resultat = parametresSchema.safeParse(parametresValides());
    expect(resultat.success).toBe(true);
  });

  it('accepte une cérémonie plus grande que l’ancienne constante de 100', () => {
    // C'est la raison d'être du réglage : la borne d'hier ne doit plus
    // refuser ce que l'organisation décide aujourd'hui.
    const resultat = parametresSchema.safeParse(
      parametresValides({ plafondLotBaptemes: 400 }),
    );
    expect(resultat.success).toBe(true);
  });

  it.each([
    ['plafondLotBaptemes', 0],
    ['plafondImportCroyants', 0],
  ])('refuse %s à zéro — un import fermé sans que rien ne le dise', (champ, valeur) => {
    const resultat = parametresSchema.safeParse(parametresValides({ [champ]: valeur }));
    expect(resultat.success).toBe(false);
  });

  it.each(['plafondLotBaptemes', 'plafondImportCroyants'])(
    'refuse %s au-delà de vingt mille — ce n’est plus un import',
    (champ) => {
      const resultat = parametresSchema.safeParse(parametresValides({ [champ]: 20001 }));
      expect(resultat.success).toBe(false);
    },
  );

  it('refuse une fraction de ligne', () => {
    const resultat = parametresSchema.safeParse(
      parametresValides({ plafondLotBaptemes: 12.5 }),
    );
    expect(resultat.success).toBe(false);
  });
});

describe('EF-ADM-13 — le formulaire et la base portent LES MÊMES bornes', () => {
  it.each([
    ['plafond_lot_baptemes', 'plafondLotBaptemes'],
    ['plafond_import_croyants', 'plafondImportCroyants'],
  ])('%s — la contrainte SQL dit bien « between 1 and 20000 »', (colonne) => {
    // On lit le SQL plutôt que de recopier le nombre : c'est le seul moyen
    // qu'un changement de borne d'un côté fasse échouer le test de l'autre.
    const contrainte = new RegExp(`check \\(${colonne} between (\\d+) and (\\d+)\\)`);
    const trouve = SQL.match(contrainte);

    expect(trouve, `contrainte introuvable pour ${colonne}`).not.toBeNull();
    expect(Number(trouve![1])).toBe(1);
    expect(Number(trouve![2])).toBe(20000);
  });

  it('purge le cache de schéma de PostgREST', () => {
    // Sans ce `notify`, les deux colonnes resteraient invisibles a l'API et la
    // lecture des parametres repondrait « column ... does not exist » sur du
    // SQL pourtant en place — constate deux fois sur ce projet.
    expect(SQL).toContain("notify pgrst, 'reload schema'");
  });
});
