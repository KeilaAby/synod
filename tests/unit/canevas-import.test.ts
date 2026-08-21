import { describe, expect, it } from 'vitest';

import {
  CANEVAS_CROYANTS,
  CANEVAS_DIMES,
  type Canevas,
  enTetes,
  feuillesDuCanevas,
  nomDuCanevas,
} from '@/lib/domain/canevas-import';
import { DESCRIPTION_CHAMPS, deviner } from '@/lib/domain/import-croyants';
import { DESCRIPTION_VERSEMENT, devinerVersement } from '@/lib/domain/import-dimes';

/**
 * Les CANEVAS D'IMPORT ne doivent jamais mentir — EF-CRO-11, EF-FIN-34.
 *
 * LE DEFAUT QU'ON EMPECHE ICI. Le canevas dit au saisiste quelles colonnes sont
 * obligatoires ; le domaine, lui, les REFUSE ou les accepte reellement. Si les
 * deux divergent, c'est le saisiste qui paie : il remplit trois cents lignes
 * selon un modele qui n'est plus le bon, et l'import les refuse une par une.
 *
 * La divergence n'arrive jamais le jour ou l'on ecrit la regle — elle arrive
 * six mois plus tard, quand quelqu'un rend une colonne facultative sans penser
 * au canevas. C'est exactement le cas de `bureau.delete`, non delegable en
 * TypeScript et delegable en SQL, que ce projet a deja paye.
 */

const CAS = [
  ['croyants', CANEVAS_CROYANTS, DESCRIPTION_CHAMPS] as const,
  ['dimes', CANEVAS_DIMES, DESCRIPTION_VERSEMENT] as const,
];

describe.each(CAS)('Le canevas des %s dit ce que le domaine exige', (_nom, canevas, registre) => {
  it('porte exactement autant de colonnes que de champs importables', () => {
    expect(canevas.colonnes).toHaveLength(registre.length);
  });

  /**
   * LE COEUR DU TEST. Une colonne annoncee facultative alors que le domaine
   * l'exige fait remplir un fichier que l'import refusera ligne a ligne.
   */
  it.each(registre.map((c) => [c.label, c.requis] as const))(
    '« %s » garde son caractere obligatoire',
    (label, requis) => {
      const colonne = canevas.colonnes.find((c) => c.entete === label);
      expect(colonne, `La colonne « ${label} » manque au canevas.`).toBeDefined();
      expect(colonne!.requis).toBe(requis);
    },
  );

  /**
   * CHAQUE LIGNE D'EXEMPLE REMPLIT TOUTES LES COLONNES.
   *
   * Une ligne plus courte que l'en-tete decale silencieusement les valeurs
   * suivantes : le saisiste ouvre le fichier, voit une date dans la colonne
   * « Adresse », et conclut que le canevas est faux — ou pire, le recopie.
   */
  it('aligne chaque ligne d’exemple sur le nombre de colonnes', () => {
    for (const [i, ligne] of canevas.exemples.entries()) {
      expect(ligne, `Ligne d’exemple ${i + 1}`).toHaveLength(canevas.colonnes.length);
    }
  });
});

/**
 * L'ETOILE NE DOIT PAS CASSER LA RECONNAISSANCE AUTOMATIQUE.
 *
 * Elle est posee dans l'en-tete pour que l'obligation se voie SANS quitter la
 * ligne qu'on remplit. Mais si « Nom * » cessait d'etre reconnu comme « Nom »,
 * le canevas imposerait treize choix manuels a chaque import — et il aurait
 * alors rendu l'import plus penible qu'un fichier quelconque.
 */
describe('EF-CRO-11, EF-FIN-34 — l’étoile ne gêne pas la reconnaissance', () => {
  it('reconnait les treize colonnes du canevas des croyants', () => {
    const devine = deviner(enTetes(CANEVAS_CROYANTS));
    const manquantes = DESCRIPTION_CHAMPS.filter((c) => devine[c.cle] == null);
    expect(manquantes.map((c) => c.label)).toEqual([]);
  });

  it('reconnait les cinq colonnes du canevas des dimes', () => {
    const devine = devinerVersement(enTetes(CANEVAS_DIMES));
    const manquantes = DESCRIPTION_VERSEMENT.filter((c) => devine[c.cle] == null);
    expect(manquantes.map((c) => c.label)).toEqual([]);
  });

  it('marque d’une étoile les colonnes obligatoires, et elles seules', () => {
    for (const canevas of [CANEVAS_CROYANTS, CANEVAS_DIMES]) {
      for (const [i, entete] of enTetes(canevas).entries()) {
        expect(entete.endsWith(' *'), entete).toBe(canevas.colonnes[i]!.requis);
      }
    }
  });
});

describe('EF-FIN-34 — le montant reste le seul champ obligatoire des dimes', () => {
  /**
   * CE N'EST PAS UNE FACILITE DE SAISIE. Une ligne represente de l'ARGENT DEJA
   * RECU : l'enveloppe est dans l'urne, elle ne disparaitra pas parce que le
   * fichier est imparfait. Rendre un autre champ obligatoire ferait rejeter des
   * lignes portant un montant — donc perdre de la collecte, en silence.
   */
  it('n’exige rien d’autre', () => {
    expect(CANEVAS_DIMES.colonnes.filter((c) => c.requis).map((c) => c.entete)).toEqual([
      'Montant',
    ]);
  });
});

describe('La forme du classeur', () => {
  /**
   * L'ORDRE DES FEUILLES EST UNE REGLE, pas une preference : `lib/domain/xlsx.ts`
   * lit la PREMIERE FEUILLE DECLAREE. Poser le guide en tete importerait le mode
   * d'emploi a la place des donnees.
   */
  it.each([CANEVAS_CROYANTS, CANEVAS_DIMES])(
    'place la saisie en PREMIERE feuille, le guide ensuite',
    (canevas: Canevas) => {
      const feuilles = feuillesDuCanevas(canevas);
      expect(feuilles.map((f) => f.nom)).toEqual(['Saisie', 'Guide de remplissage']);
    },
  );

  /**
   * LES EN-TETES OCCUPENT LA PREMIERE LIGNE, sans rien au-dessus : un titre pose
   * la deviendrait le nom des colonnes.
   */
  it.each([CANEVAS_CROYANTS, CANEVAS_DIMES])(
    'ouvre la feuille de saisie sur les en-tetes',
    (canevas: Canevas) => {
      const [saisie] = feuillesDuCanevas(canevas);
      expect(saisie!.lignes[0]).toEqual(enTetes(canevas));
      expect(saisie!.lignes).toHaveLength(1 + canevas.exemples.length);
    },
  );

  it('donne un nom de fichier sans accent ni espace', () => {
    expect(nomDuCanevas(CANEVAS_CROYANTS)).toBe('canevas-importer-des-croyants.xlsx');
    expect(nomDuCanevas(CANEVAS_DIMES)).toMatch(/^canevas-[a-z0-9-]+\.xlsx$/);
  });
});
