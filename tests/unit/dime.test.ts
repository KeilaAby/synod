import { describe, expect, it } from 'vitest';

import {
  DELAI_REMISE_JOURS,
  type VersementDime,
  admetLeDetail,
  datesDuBordereau,
  detailConsultable,
  doublonsDeCollecte,
  estEnRetard,
  admetUnNumero,
  modeEffectif,
  ouvreUnRecu,
  peutVerser,
  totalCollecte,
  trouverCategorieDime,
} from '@/lib/domain/dime';

/**
 * EF-FIN-27 a 31, RG-33 — dimes.
 *
 * Ces tests doublent `fn_saisir_collecte_dime` : le SQL protege contre les
 * appels directs, ce module produit le message a l'utilisateur (CA-02).
 */

const versement = (p: Partial<VersementDime> = {}): VersementDime => ({
  croyantId: 'c1',
  montant: 1000,
  ...p,
});

describe('EF-FIN-30 — la dime se verse aussi hors de son eglise', () => {
  it('accepte un croyant du SOUS-ARBRE de l entite hote', () => {
    /**
     * Lors d'un rassemblement de district, tous les croyants du district
     * peuvent verser, quelle que soit leur eglise. C'est ce qui justifie
     * `entite_collecte_id` plutot que `eglise_collecte_id`.
     */
    expect(peutVerser('siege.reg1.dist1.par1.egl1', 'siege.reg1.dist1')).toBe(true);
  });

  it('refuse un croyant d un AUTRE district', () => {
    expect(peutVerser('siege.reg1.dist2.par1.egl1', 'siege.reg1.dist1')).toBe(false);
  });

  it("accepte l entite hote elle-meme", () => {
    // Un rassemblement de paroisse accueille les croyants rattaches a la
    // paroisse directement, pas seulement ceux de ses eglises.
    expect(peutVerser('siege.reg1.dist1', 'siege.reg1.dist1')).toBe(true);
  });

  it("n admet PAS le detail pour un evenement national", () => {
    // Personne ne tient trois mille enveloppes a la main : le Siege encaisse
    // lui-meme et saisit un montant global.
    expect(admetLeDetail('EVENEMENT_NATIONAL')).toBe(false);
    expect(admetLeDetail('CULTE')).toBe(true);
    expect(admetLeDetail('RASSEMBLEMENT_REGIONAL')).toBe(true);
  });
});

describe('EF-FIN-28 — le mode de saisie', () => {
  it("prend le defaut de l organisation quand rien n est decide", () => {
    // `null` ne veut PAS dire « comme mon parent » : chaque bureau gere ses
    // finances, la hierarchie ne fait que les consulter.
    expect(modeEffectif(null)).toBe('DETAILLE');
    expect(modeEffectif(null, 'GLOBAL')).toBe('GLOBAL');
  });

  it("respecte le choix de l entite", () => {
    expect(modeEffectif('GLOBAL', 'DETAILLE')).toBe('GLOBAL');
  });

  it('laisse relire un detail apres le passage en global', () => {
    /**
     * Le mode decide de ce qu'on saisit DESORMAIS, jamais de ce qu'on peut
     * relire : masquer le detail effacerait des recus que des croyants
     * detiennent.
     */
    expect(detailConsultable(12)).toBe(true);
    expect(detailConsultable(0)).toBe(false);
  });
});

describe('EF-FIN-27 — le total ne se saisit pas, il se calcule', () => {
  it('somme les versements', () => {
    expect(
      totalCollecte([versement({ montant: 1000 }), versement({ montant: 2500 })]),
    ).toBe(3500);
  });

  it('rend zero sur une collecte vide', () => {
    expect(totalCollecte([])).toBe(0);
  });

  it('ecarte le croyant cite DEUX FOIS', () => {
    /**
     * Un croyant ne verse qu'une enveloppe par collecte. La base ne peut pas
     * voir l'erreur — rien n'y interdit deux versements du meme croyant,
     * puisque c'est licite d'une collecte a l'autre.
     */
    const repetes = doublonsDeCollecte([
      versement({ croyantId: 'a' }),
      versement({ croyantId: 'b' }),
      versement({ croyantId: 'a' }),
    ]);

    expect(repetes).toEqual([2]);
  });

  it('ne prend pas une ligne vide pour un doublon', () => {
    expect(
      doublonsDeCollecte([versement({ croyantId: '' }), versement({ croyantId: '' })]),
    ).toEqual([]);
  });
});

describe('EF-FIN-27 — la categorie ne se demande pas', () => {
  const categories = [
    { id: 'x', libelle: 'Offrande' },
    { id: 'y', libelle: 'Dime' },
    { id: 'z', libelle: 'Loyer' },
  ];

  it('resout la dime sans la demander a l utilisateur', () => {
    /**
     * Sur l'ecran des dimes, tout EST une dime : le champ n'offrait pas un
     * choix mais une occasion de se tromper. Une collecte rangee sous
     * « Offrande » disparaitrait du suivi sans qu'aucune ligne ne paraisse
     * anormale.
     */
    expect(trouverCategorieDime(categories)).toBe('y');
  });

  it('ignore la casse et les accents du referentiel', () => {
    expect(trouverCategorieDime([{ id: 'a', libelle: '  DÎMES ' }])).toBe('a');
  });

  it('reconnait aussi par le CODE', () => {
    expect(
      trouverCategorieDime([{ id: 'b', libelle: 'Recette du culte', code: 'DIME' }]),
    ).toBe('b');
  });

  it('ne prend RIEN par defaut quand aucune categorie ne convient', () => {
    // Ranger une collecte sous une categorie prise au hasard serait pire qu'un
    // refus : personne ne le verrait.
    expect(trouverCategorieDime([{ id: 'x', libelle: 'Offrande' }])).toBeNull();
    expect(trouverCategorieDime([])).toBeNull();
  });
});

describe('EF-FIN-33 — toute dime n a pas de nom', () => {
  it('ne delivre un recu QU AU nominatif', () => {
    // On ne remet pas un recu a personne : consommer la sequence pour une
    // enveloppe sans nom brouillerait la numerotation de ceux qui existent.
    expect(ouvreUnRecu('NOMINATIF')).toBe(true);
    expect(ouvreUnRecu('ENVELOPPE_ANONYME')).toBe(false);
    expect(ouvreUnRecu('EN_VRAC')).toBe(false);
  });

  it('ADMET un numero sur une enveloppe sans nom, sans l exiger', () => {
    /**
     * La premiere version l'exigeait, et renvoyait au vrac ce qui n'en avait
     * pas. C'etait une distinction d'informaticien, pas de tresorier : une
     * enveloppe sans numero reste une enveloppe. Surtout, cela otait un CHOIX
     * a l'utilisateur, seul juge de ce qu'il tient en main.
     */
    expect(admetUnNumero('ENVELOPPE_ANONYME')).toBe(true);
    expect(admetUnNumero('NOMINATIF')).toBe(true);
    // Le vrac, lui, n'a ni nom ni enveloppe : c'est sa definition.
    expect(admetUnNumero('EN_VRAC')).toBe(false);
  });

  it('compte les trois natures dans le TOTAL', () => {
    /**
     * L'argent est dans l'urne quelle que soit la facon dont il y est arrive.
     * N'y compter que le nominatif ferait un mouvement plus petit que la
     * collecte reelle — un ecart que personne ne saurait expliquer.
     */
    const total = totalCollecte([
      { croyantId: 'c1', montant: 10_000, nature: 'NOMINATIF' },
      { croyantId: null, montant: 5_000, nature: 'ENVELOPPE_ANONYME' },
      { croyantId: null, montant: 2_500, nature: 'EN_VRAC' },
    ]);
    expect(total).toBe(17_500);
  });

  it('ne voit AUCUN doublon entre deux versements anonymes', () => {
    // Dix enveloppes sans nom dans la meme collecte sont dix enveloppes, pas
    // neuf doublons.
    expect(
      doublonsDeCollecte([
        { croyantId: null, montant: 1000, nature: 'EN_VRAC' },
        { croyantId: null, montant: 2000, nature: 'EN_VRAC' },
      ]),
    ).toEqual([]);
  });
});

describe('EF-FIN-30 — le delai de remise', () => {
  it('signale une collecte non remise au-dela d une semaine', () => {
    expect(estEnRetard('2026-08-02', '2026-08-10')).toBe(true);
  });

  it('laisse passer la semaine entiere', () => {
    // Le delai est « au plus tard dans la semaine suivante » : le septieme
    // jour est encore dans les temps.
    expect(estEnRetard('2026-08-02', '2026-08-09')).toBe(false);
    expect(DELAI_REMISE_JOURS).toBe(7);
  });

  it('ne bascule JAMAIS de mois en traversant un fuseau', () => {
    /**
     * Meme piege que `periodeDe` : une colonne `date` n'a pas de fuseau, et
     * lui en inventer un ferait basculer une collecte du 31 dans le mois
     * suivant. On compare des chaines « AAAA-MM-JJ », interpretees en UTC.
     */
    expect(estEnRetard('2026-08-31', '2026-09-07')).toBe(false);
    expect(estEnRetard('2026-08-31', '2026-09-08')).toBe(true);
  });

  it('ne declare rien en retard sur une date illisible', () => {
    // Un constat faux serait pire que pas de constat du tout.
    expect(estEnRetard('', '2026-08-10')).toBe(false);
  });
});

describe('EF-FIN-30 — le bordereau detaille chaque culte', () => {
  it('ordonne les dates et retire les repetitions', () => {
    /**
     * Un regroupement de plusieurs dimanches est possible mais mal vu : le
     * detail des dates rend le retard visible au lieu de le noyer dans un
     * total.
     */
    expect(
      datesDuBordereau([
        { dateOperation: '2026-08-16' },
        { dateOperation: '2026-08-02' },
        { dateOperation: '2026-08-16' },
        { dateOperation: '2026-08-09' },
      ]),
    ).toEqual(['2026-08-02', '2026-08-09', '2026-08-16']);
  });

  it('rend une liste vide pour un bordereau sans collecte', () => {
    expect(datesDuBordereau([])).toEqual([]);
  });
});
