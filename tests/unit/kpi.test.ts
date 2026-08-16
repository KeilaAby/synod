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
  couverture,
  partDeLEffectif,
  preparerRepartition,
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

describe('EF-DSH-05, EF-DSH-06 — la part et les rendus', () => {
  it('rapporte un effectif a son total', () => {
    // « 1 240 femmes » ne dit rien seul ; « 53 % de l'effectif » se lit.
    expect(partDeLEffectif(53, 100)).toBeCloseTo(53, 5);
    expect(partDeLEffectif(1, 3)).toBeCloseTo(33.333, 2);
  });

  it('rend NULL plutot que zero sur un total vide', () => {
    /**
     * « 0 % » se lit comme une mesure, alors qu'il n'y a rien a mesurer : la
     * carte n'affiche alors simplement pas de part.
     */
    expect(partDeLEffectif(0, 0)).toBeNull();
    expect(partDeLEffectif(5, 0)).toBeNull();
    expect(partDeLEffectif(Number.NaN, 10)).toBeNull();
  });

  it('ne rapporte une part qu a une cle QUI EXISTE au registre', () => {
    /**
     * Une cle mal orthographiee ne leverait aucune erreur : la part serait
     * calculee sur zero, donc tue — et personne ne saurait qu'elle manque.
     */
    const cles = new Set(KPI_REGISTRY.map((k) => k.cle));
    for (const kpi of KPI_REGISTRY) {
      if (kpi.partDe) expect(cles.has(kpi.partDe)).toBe(true);
    }
  });

  it('n accorde le rapport qu a des indicateurs de MEME nature', () => {
    // Rapporter un montant a un effectif donnerait un pourcentage qui ne veut
    // rien dire — et que rien, a l'ecran, ne signalerait comme faux.
    const par = new Map(KPI_REGISTRY.map((k) => [k.cle, k]));
    for (const kpi of KPI_REGISTRY) {
      if (!kpi.partDe) continue;
      expect(par.get(kpi.partDe)?.format).toBe(kpi.format);
    }
  });

  it('donne une largeur d au moins deux colonnes aux blocs composes', () => {
    // Une liste de croyants ou une courbe dans un sixieme de grille serait
    // illisible : ce qui n'est pas un chiffre a besoin de place.
    for (const kpi of KPI_REGISTRY) {
      if ((kpi.rendu ?? 'VALEUR') !== 'VALEUR') {
        expect(kpi.taille ?? 1).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('garde les blocs composes DANS le mecanisme de personnalisation', () => {
    /**
     * Ils s'ordonnent et se masquent comme les autres : un bloc qu'on ne peut
     * pas retirer ferait de la personnalisation une demi-promesse.
     */
    const composes = KPI_REGISTRY.filter((k) => (k.rendu ?? 'VALEUR') !== 'VALEUR');
    expect(composes.length).toBeGreaterThan(0);

    const masques = composes.map((k) => k.cle);
    const restants = appliquerDisposition(KPI_REGISTRY, { ordre: [], masques });
    expect(restants.some((k) => masques.includes(k.cle))).toBe(false);
  });
});

describe('EF-DSH-05 — les repartitions', () => {
  const t = (dimension: string, cle: string, libelle: string, effectif: number) => ({
    dimension,
    cle,
    libelle,
    effectif,
  });

  const tranches = [
    t('GRADE', 'CRO', 'Croyant', 800),
    t('GRADE', 'DIA', 'Diacre', 150),
    t('GRADE', 'PAS', 'Pasteur', 50),
    t('AGE', '3', '26 à 40 ans', 400),
    t('AGE', '1', '0 à 17 ans', 200),
    t('AGE', '2', '18 à 25 ans', 300),
    // Une tranche a zero n'est pas une tranche : elle n'a rien a montrer.
    t('AGE', '5', '61 ans et plus', 0),
  ];

  it('trie par effectif DECROISSANT, sauf l age', () => {
    /**
     * Les tranches d'age ont un ordre NATUREL : les lire de la plus jeune a la
     * plus vieille est la seule facon d'y voir une pyramide. Les trier par
     * effectif en ferait un classement, ce qu'une pyramide n'est pas.
     */
    expect(preparerRepartition(tranches, 'GRADE').barres.map((b) => b.libelle)).toEqual([
      'Croyant',
      'Diacre',
      'Pasteur',
    ]);

    expect(preparerRepartition(tranches, 'AGE').barres.map((b) => b.cle)).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  it('ecarte les tranches vides', () => {
    // « 61 ans et plus : 0 » occupe une ligne pour ne rien dire : la tranche
    // vient du decoupage, pas de l'effectif.
    expect(preparerRepartition(tranches, 'AGE').barres.some((b) => b.cle === '5')).toBe(
      false,
    );
  });

  it('GARDE une entite a zero, contrairement aux autres dimensions', () => {
    /**
     * Un grade que personne ne detient est du bruit. Une eglise sans croyant
     * est precisement celle qu'on cherche en ouvrant ce bloc : l'effacer
     * masquerait le seul cas qui appelle une action.
     */
    const entites = [
      t('ENTITE', 'e1', 'Antsahatsiresy', 120),
      t('ENTITE', 'e2', 'Avaradrano', 0),
    ];

    const { barres } = preparerRepartition(entites, 'ENTITE');
    expect(barres.map((b) => b.libelle)).toEqual(['Antsahatsiresy', 'Avaradrano']);
    // Elle passe en dernier — c'est un classement — et sa barre est VIDE.
    expect(barres[1]!.effectif).toBe(0);
    expect(barres[1]!.longueur).toBe(0);
  });

  it('distingue LA PART de LA LONGUEUR', () => {
    /**
     * Ce n'est pas une redondance. `part` est ce qu'on LIT, `longueur` ce qu'on
     * VOIT : dessiner les barres a l'echelle de la part rendrait illisible
     * toute repartition ou rien ne depasse 20 %.
     */
    const { barres, total } = preparerRepartition(tranches, 'GRADE');

    expect(total).toBe(1000);
    expect(barres[0]!.part).toBeCloseTo(80, 5);
    // La plus grande occupe TOUTE la largeur, quelle que soit sa part.
    expect(barres[0]!.longueur).toBe(100);
    expect(barres[1]!.longueur).toBeCloseTo(18.75, 2);
  });

  it('borne le nombre de barres et DIT ce qu il a ecarte', () => {
    /**
     * Une repartition sert a voir la FORME d'un ensemble, pas a l'enumerer.
     * Mais un plafond silencieux ferait croire qu'il n'y a rien d'autre.
     */
    const nombreuses = Array.from({ length: 12 }, (_, i) =>
      t('NATIONALITE', `n${i}`, `Pays ${i}`, 12 - i),
    );

    const { barres, reste } = preparerRepartition(nombreuses, 'NATIONALITE', 8);
    expect(barres).toHaveLength(8);
    expect(reste).toBe(4);
  });

  it('rend un ensemble vide sans se plaindre', () => {
    expect(preparerRepartition([], 'GRADE')).toEqual({ barres: [], total: 0, reste: 0 });
  });
});

describe('EF-DSH-05, EF-DSH-06 — la jauge de couverture', () => {
  it('rapporte les couvertes au total', () => {
    expect(couverture(12, 20)).toBeCloseTo(60, 5);
    expect(couverture(20, 20)).toBe(100);
  });

  it('rend NULL quand il n y a rien a couvrir', () => {
    /**
     * « 0 % de bureaux » sur un perimetre sans entite eligible se lirait comme
     * un manquement, alors qu'il n'y a simplement rien a pourvoir (regle 15).
     */
    expect(couverture(0, 0)).toBeNull();
  });

  it('se BORNE a cent', () => {
    /**
     * Si deux bureaux se retrouvaient actifs sur une meme entite, une jauge a
     * 130 % ferait douter de tout l'ecran plutot que de signaler l'anomalie —
     * qui a son propre endroit, l'index unique `bureaux_un_seul_actif`.
     */
    expect(couverture(26, 20)).toBe(100);
  });
});
