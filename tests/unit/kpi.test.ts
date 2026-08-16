import { describe, expect, it } from 'vitest';

import {
  KPI_REGISTRY,
  type DefinitionKpi,
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
