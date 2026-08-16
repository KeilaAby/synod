import { describe, expect, it } from 'vitest';

import {
  DISPOSITION_VIDE,
  KPI_REGISTRY,
  type DefinitionKpi,
  appliquerDisposition,
  basculerMasque,
  deplacerKpi,
  estDisposition,
  groupesVisibles,
  kpiEstAlerte,
  kpisVisibles,
} from '@/lib/domain/kpi';
import { ALL_PERMISSIONS, type Permission } from '@/lib/domain/permissions';

/**
 * EF-DSH-03, EF-DSH-04, EF-DSH-12 — le registre des indicateurs.
 */
describe('EF-DSH-04 — le registre couvre le minimum exige', () => {
  it('porte les quatorze indicateurs du cahier des charges', () => {
    /**
     * Liste FIGEE volontairement. EF-DSH-04 enumere un minimum ; ce test est le
     * point ou l'on voit qu'un indicateur en sort — un tableau de bord qui perd
     * une mesure ne provoque aucune erreur, il montre simplement moins.
     */
    const attendus = [
      'croyants',
      'cellules',
      'eglises',
      'paroisses',
      'districts',
      'regionaux',
      'femmes',
      'hommes',
      'membres_bureau',
      'membres_finances',
      'nouveaux_baptises',
      'recettes',
      'depenses',
      'solde_consolide',
    ];

    const cles = KPI_REGISTRY.map((k) => k.cle);
    for (const attendu of attendus) expect(cles).toContain(attendu);
  });

  it('n a aucune cle en double', () => {
    // Deux definitions pour la meme colonne afficheraient deux fois le meme
    // chiffre sous deux libelles — la facon la plus sure de faire douter des deux.
    const cles = KPI_REGISTRY.map((k) => k.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('ne s appuie que sur des habilitations qui existent', () => {
    // Une permission mal orthographiee ne leverait aucune erreur : l'indicateur
    // disparaitrait simplement pour tout le monde, sans que rien ne le dise.
    for (const kpi of KPI_REGISTRY) {
      expect(ALL_PERMISSIONS).toContain(kpi.permission);
    }
  });
});

describe('EF-DSH-12 — le masquage par habilitation', () => {
  const detient = (accordees: Permission[]) => (p: Permission) => accordees.includes(p);

  it('RETIRE l indicateur, il ne le met pas a zero', () => {
    /**
     * `fn_tableau_de_bord` est SECURITY INVOKER : ce qu'on n'a pas le droit de
     * lire n'est pas refuse, il est compte a ZERO par la RLS. Afficher ce zero
     * ferait conclure a une base vide plutot qu'a une habilitation manquante
     * (regle 15).
     */
    const visibles = kpisVisibles(KPI_REGISTRY, detient(['croyant.read']));

    expect(visibles.every((k) => k.permission === 'croyant.read')).toBe(true);
    expect(visibles.some((k) => k.cle === 'solde_consolide')).toBe(false);
  });

  it('ne laisse aucun groupe vide', () => {
    // Un titre « Finances » suivi de rien apprendrait qu'il existe des
    // finances, ce que le masquage vise precisement a taire.
    const visibles = kpisVisibles(KPI_REGISTRY, detient(['entity.read']));
    const groupes = groupesVisibles(visibles);

    expect(groupes).toEqual(['STRUCTURE']);
    for (const groupe of groupes) {
      expect(visibles.some((k) => k.groupe === groupe)).toBe(true);
    }
  });

  it('ne rend rien du tout a un compte sans droit', () => {
    expect(kpisVisibles(KPI_REGISTRY, detient([]))).toEqual([]);
    expect(groupesVisibles([])).toEqual([]);
  });
});

describe('EF-DSH-05 — ce qui merite d attirer l oeil', () => {
  const kpi = (p: Partial<DefinitionKpi>): DefinitionKpi => ({
    cle: 'x',
    libelle: 'X',
    groupe: 'FINANCES',
    format: 'NOMBRE',
    permission: 'finance.read',
    ...p,
  });

  it('signale ce qui ATTEND une decision', () => {
    expect(kpiEstAlerte(kpi({ alerteSiPositif: true }), 3)).toBe(true);
    // Zero en attente n'est pas une alerte, c'est le cas normal.
    expect(kpiEstAlerte(kpi({ alerteSiPositif: true }), 0)).toBe(false);
  });

  it('signale un solde NEGATIF — EF-FIN-13', () => {
    expect(kpiEstAlerte(kpi({ alerteSiNegatif: true }), -1)).toBe(true);
    expect(kpiEstAlerte(kpi({ alerteSiNegatif: true }), 0)).toBe(false);
  });

  it('ne signale RIEN par defaut', () => {
    /**
     * Si tout se signale, plus rien ne ressort. Deux cas seulement le
     * justifient, et le registre les nomme.
     */
    expect(kpiEstAlerte(kpi({}), 999_999)).toBe(false);

    const signales = KPI_REGISTRY.filter((k) => k.alerteSiPositif || k.alerteSiNegatif);
    expect(signales.length).toBeLessThanOrEqual(3);
  });
});

describe('EF-DSH-03, EF-DSH-07 — la disposition choisie', () => {
  const kpi = (cle: string): DefinitionKpi => ({
    cle,
    libelle: cle,
    groupe: 'EFFECTIFS',
    format: 'NOMBRE',
    permission: 'croyant.read',
  });

  const registre = ['a', 'b', 'c'].map(kpi);

  it('rend l ordre du registre quand rien n est decide', () => {
    expect(appliquerDisposition(registre, DISPOSITION_VIDE).map((k) => k.cle)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('suit l ordre voulu', () => {
    expect(
      appliquerDisposition(registre, { ordre: ['c', 'a', 'b'], masques: [] }).map(
        (k) => k.cle,
      ),
    ).toEqual(['c', 'a', 'b']);
  });

  it('retire ce qui est EXPLICITEMENT masque', () => {
    expect(
      appliquerDisposition(registre, { ordre: [], masques: ['b'] }).map((k) => k.cle),
    ).toEqual(['a', 'c']);
  });

  it('MONTRE un indicateur ajoute apres la personnalisation', () => {
    /**
     * Le piege de l'exercice. Une simple liste de « ce que je veux voir »
     * serait plus courte a ecrire, mais un indicateur ajoute au registre plus
     * tard n'y figurerait pas : il n'apparaitrait JAMAIS chez ceux qui ont
     * personnalise, et personne ne saurait pourquoi.
     *
     * Ce qui n'est ni ordonne ni masque est NOUVEAU : il se montre, a la fin.
     */
    const avecNouveau = [...registre, kpi('d'), kpi('e')];
    const disposition = { ordre: ['c', 'a', 'b'], masques: [] };

    expect(appliquerDisposition(avecNouveau, disposition).map((k) => k.cle)).toEqual([
      'c',
      'a',
      'b',
      'd',
      'e',
    ]);
  });

  it('ignore une cle qui a quitte le registre', () => {
    // Inutile de nettoyer la base : rien ne resout la cle, elle disparait.
    expect(
      appliquerDisposition(registre, { ordre: ['zzz', 'b'], masques: ['yyy'] }).map(
        (k) => k.cle,
      ),
    ).toEqual(['b', 'a', 'c']);
  });

  it('bascule un masque dans les deux sens', () => {
    const pose = basculerMasque(DISPOSITION_VIDE, 'b');
    expect(pose.masques).toEqual(['b']);
    expect(basculerMasque(pose, 'b').masques).toEqual([]);
  });

  it('deplace un indicateur AVANT un autre', () => {
    expect(deplacerKpi(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(deplacerKpi(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'a', 'c']);
  });

  it('ne bouge rien quand la cible est le bloc lui-meme ou est absente', () => {
    expect(deplacerKpi(['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
    expect(deplacerKpi(['a', 'b'], 'a', 'zzz')).toEqual(['a', 'b']);
  });

  it('n accepte comme disposition qu un objet SIMPLE', () => {
    /**
     * Elle traverse la frontiere serveur -> client (regle 24), et elle vient
     * d'une colonne `jsonb` que rien ne contraint : une valeur ecrite a la
     * main par l'API ferait echouer la page entiere.
     */
    expect(estDisposition({ ordre: ['a'], masques: [] })).toBe(true);
    expect(estDisposition(null)).toBe(false);
    expect(estDisposition({ ordre: 'a', masques: [] })).toBe(false);
    expect(estDisposition({ ordre: [1], masques: [] })).toBe(false);
    expect(estDisposition({ ordre: [] })).toBe(false);
  });
});
