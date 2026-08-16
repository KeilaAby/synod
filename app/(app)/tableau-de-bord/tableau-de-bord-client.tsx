'use client';

import {
  ArrowUpRight,
  CalendarDays,
  CalendarFold,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  LayoutTemplate,
  Printer,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useMemo, useState, useTransition } from 'react';

import { BoutonExport } from '@/components/finances/bouton-export';
import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { IconeKpi } from '@/components/tableau-de-bord/icones-kpi';
import { avertir } from '@/components/shared/messages';
import { EntityPicker, type OptionEntite } from '@/components/structure/entity-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { enregistrerDisposition } from '@/lib/actions/tableau-de-bord';
import {
  DISPOSITION_VIDE,
  type DefinitionKpi,
  type DispositionTableauDeBord,
  type GroupeKpi,
  LIBELLES_GROUPE_KPI,
  MODELES_TABLEAU_DE_BORD,
  type TailleKpi,
  appliquerDisposition,
  basculerMasque,
  deplacerKpi,
  dispositionDuModele,
  groupesVisibles,
  kpiEstAlerte,
  modeleApplicable,
  partDeLEffectif,
} from '@/lib/domain/kpi';
import { type Granularite, decalerPeriode, libellePeriode } from '@/lib/domain/synthese';
import { formatMontant, formatNombre } from '@/lib/utils/format';

/**
 * Le tableau de bord et sa personnalisation — EF-DSH-03, EF-DSH-07.
 *
 * DEUX MODES, ET UN SEUL RENDU. En consultation, les cartes se lisent et se
 * cliquent ; en personnalisation, les mêmes cartes se déplacent et se masquent.
 * Deux rendus séparés auraient divergé, et l'on aurait réorganisé une grille
 * qui n'est pas celle qu'on lit.
 *
 * LES GROUPES NE SE MÉLANGENT PAS. « Effectifs » et « Finances » ne sont pas
 * des étiquettes arbitraires : réordonner se fait DANS un groupe, ce qui garde
 * la lecture par thème tout en laissant choisir ce qui vient en premier. Le
 * masquage, lui, est global — c'est bien la question posée par EF-DSH-03.
 *
 * LE GLISSER-DÉPOSER N'EST PAS LE SEUL CHEMIN. Le HTML natif y suffit — aucune
 * bibliothèque (règle 29) — mais il est inaccessible au clavier : deux flèches
 * doublent donc chaque carte en mode personnalisation. Un réglage qu'on ne peut
 * poser qu'à la souris n'est pas un réglage pour tout le monde.
 */
export function TableauDeBordClient({
  kpis,
  mesures,
  disposition: dispositionInitiale,
  devise,
  entites,
  entiteId,
  entiteNom,
  granularite,
  ancre,
  blocs = {},
}: {
  /** Déjà filtrés par habilitation — EF-DSH-12 tient côté serveur. */
  kpis: DefinitionKpi[];
  mesures: Record<string, number>;
  disposition: DispositionTableauDeBord;
  devise: string;
  /** EF-DSH-06 — le périmètre observé se choisit dans l'arbre habilité. */
  entites: OptionEntite[];
  entiteId: string;
  entiteNom: string;
  granularite: Granularite;
  ancre: string;
  /**
   * EF-DSH-06 — le contenu des blocs qui ne sont pas un chiffre, PAR CLÉ.
   *
   * PAR CLÉ ET NON PAR RENDU : quatre répartitions partagent le même rendu et
   * n'affichent pas la même chose. Les indexer par rendu aurait donné la
   * pyramide des âges sous le titre « Par grade », sans qu'aucun type ne s'en
   * plaigne.
   *
   * ILS SONT CONSTRUITS PAR LA PAGE, pas ici. Chacun lit ses propres données,
   * et cette grille n'a pas à savoir d'où elles viennent : elle place, ordonne
   * et masque. Un bloc de plus ne la rouvre pas.
   */
  blocs?: Record<string, ReactNode>;
}) {
  const router = useRouter();
  const [disposition, setDisposition] = useState(dispositionInitiale);
  const [personnalise, setPersonnalise] = useState(false);
  const [enregistrement, demarrer] = useTransition();
  const [rechargement, demarrerRechargement] = useTransition();
  const [saisi, setSaisi] = useState<string | null>(null);

  /**
   * EF-DSH-06 — LE RÉGLAGE REPART AU SERVEUR, et il n'y a pas de raccourci.
   *
   * Périmètre et période changent ce que la base AGRÈGE, pas ce qu'on trie dans
   * une liste déjà chargée : la règle 17 ne s'applique pas ici. L'URL les porte,
   * ce qui rend l'écran partageable — « regarde mars à Avaradrano » tient dans
   * un lien.
   */
  const regler = (modif: {
    entite?: string;
    granularite?: Granularite;
    ancre?: string;
  }) =>
    demarrerRechargement(() => {
      const q = new URLSearchParams({
        entite: modif.entite ?? entiteId,
        granularite: modif.granularite ?? granularite,
        ancre: modif.ancre ?? ancre,
      });
      router.push(`/tableau-de-bord?${q.toString()}`);
    });

  /**
   * En consultation, on ne voit que ce qu'on a gardé. En personnalisation, on
   * voit TOUT — sinon ce qu'on a masqué serait invisible, donc impossible à
   * rétablir : le geste ne serait réversible que pour qui se souvient de ce
   * qu'il a caché.
   */
  const affiches = useMemo(
    () =>
      personnalise
        ? appliquerDisposition(kpis, { ...disposition, masques: [] })
        : appliquerDisposition(kpis, disposition),
    [kpis, disposition, personnalise],
  );

  const groupes = groupesVisibles(affiches);
  const masques = new Set(disposition.masques);

  /**
   * CE QUI S'EXPORTE EN CSV : les indicateurs CHIFFRÉS, et eux seuls.
   *
   * Une liste de croyants, une courbe et quatre répartitions n'ont pas la même
   * forme qu'un tableau à trois colonnes : les y forcer donnerait un fichier
   * dont chaque bloc aurait un sens différent selon la ligne. Les répartitions
   * exportent donc leur propre table, là où elles sont ; le PDF, lui, rend
   * l'écran entier.
   */
  const chiffres = useMemo(
    () => affiches.filter((k) => (k.rendu ?? 'VALEUR') === 'VALEUR'),
    [affiches],
  );

  /**
   * ON ENREGISTRE À CHAQUE GESTE, sans bouton « Valider ».
   *
   * Une préférence d'affichage n'a pas de transaction : la reperdre parce
   * qu'on a quitté la page sans confirmer serait une punition pour un travail
   * de dix secondes. L'appel est hors de la transition (règle 27) : `await`
   * seul y entre, sinon React fondrait l'indicateur avec la mise à jour et il
   * ne s'afficherait jamais.
   */
  function poser(suivante: DispositionTableauDeBord) {
    setDisposition(suivante);

    demarrer(async () => {
      const resultat = await enregistrerDisposition({
        ordre: [...suivante.ordre],
        masques: [...suivante.masques],
      });

      if (!resultat.ok) {
        /**
         * L'ÉCHEC SE DIT, le succès non (règle 30). Une carte qui se déplace
         * se voit du coin de l'œil ; un enregistrement qui échoue, jamais — et
         * l'on retrouverait l'ancienne disposition au prochain chargement sans
         * comprendre pourquoi.
         */
        avertir(resultat.error, {
          ton: 'refus',
          titre: 'Disposition non enregistrée',
        });
      }
    });
  }

  /** Réordonne DANS le groupe : l'ordre global est réécrit à partir de l'écran. */
  function deplacer(kpi: DefinitionKpi, versCle: string) {
    const ordreAffiche = affiches.map((k) => k.cle);
    poser({ ...disposition, ordre: deplacerKpi(ordreAffiche, kpi.cle, versCle) });
  }

  /** Le voisin dans le même groupe, ou `null` au bord. */
  function voisin(kpi: DefinitionKpi, pas: -1 | 1): DefinitionKpi | null {
    const duGroupe = affiches.filter((k) => k.groupe === kpi.groupe);
    const i = duGroupe.findIndex((k) => k.cle === kpi.cle);
    return duGroupe[i + pas] ?? null;
  }

  return (
    <div
      // L'attente se voit sans que l'écran disparaisse : estomper dit que ce
      // qui est affiché n'est plus à jour, là où un squelette effacerait ce
      // qu'on était en train de lire.
      className={`space-y-8 ${rechargement ? 'pointer-events-none opacity-60' : ''}`}
    >
      {/*
        --- UNE SEULE BARRE : ce sur quoi porte le tableau, et ce qu'on en fait.

        Les réglages à gauche, les actions à droite, sur la MÊME ligne. Deux
        rangées superposées faisaient deux niveaux de commande là où il n'y a
        qu'une barre d'outils, et l'œil devait redescendre pour trouver
        « Imprimer » après avoir choisi sa période.

        `no-print` — un sélecteur d'entité sur du papier n'attend qu'un clic qui
        ne viendra pas. Ce que valent la période et l'entité, l'en-tête le dit
        déjà en toutes lettres.
      */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {!personnalise && (
            <>
              <div className="min-w-64">
                <EntityPicker
                  options={entites}
                  value={entiteId}
                  onChange={(id) => id && regler({ entite: id })}
                  placeholder="Choisir une entité"
                  emptyMessage="Aucune entité dans votre périmètre."
                />
              </div>

              {/* Règle 18 — trois granularités, ensemble CLOS : pictogrammes. */}
              <GroupeFiltres libelle="Période">
                <FiltreIcone
                  icone={CalendarDays}
                  libelle="Mensuelle"
                  actif={granularite === 'MOIS'}
                  onClick={() => regler({ granularite: 'MOIS' })}
                />
                <FiltreIcone
                  icone={CalendarRange}
                  libelle="Trimestrielle"
                  actif={granularite === 'TRIMESTRE'}
                  onClick={() => regler({ granularite: 'TRIMESTRE' })}
                />
                <FiltreIcone
                  icone={CalendarFold}
                  libelle="Annuelle"
                  actif={granularite === 'ANNEE'}
                  onClick={() => regler({ granularite: 'ANNEE' })}
                />
              </GroupeFiltres>

              {/* Reculer d'un cran est le geste le plus fréquent : on compare au
              précédent avant toute autre chose. */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Période précédente"
                  onClick={() =>
                    regler({ ancre: decalerPeriode(granularite, ancre, -1) })
                  }
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </Button>

                <span className="min-w-32 text-center text-sm font-medium">
                  {libellePeriode(granularite, ancre)}
                </span>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Période suivante"
                  onClick={() => regler({ ancre: decalerPeriode(granularite, ancre, 1) })}
                >
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </div>
            </>
          )}

          {/* En personnalisation, la consigne prend la place des réglages :
              c'est le même côté de la barre, et la même hauteur. */}
          {personnalise && (
            <p className="text-muted-foreground text-sm">
              Glissez une carte pour la déplacer dans son groupe, ou masquez-la. Tout est
              enregistré au fil des gestes.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/*
            EF-DSH-10 — IMPRIMER, C'EST IMPRIMER L'ÉCRAN.

            Refabriquer un document à partir des mêmes données aurait donné un
            second rendu à maintenir, qui aurait divergé du premier (règle 16).
            La feuille de style d'impression retire la navigation et les
            contrôles ; ce qui reste est exactement ce qu'on lisait.
          */}
          {!personnalise && (
            <>
              <Button variant="outline" className="h-10" onClick={() => window.print()}>
                <Printer className="mr-2 size-4" aria-hidden />
                Imprimer
              </Button>

              <BoutonExport
                nombre={chiffres.length}
                libelle="Exporter"
                // Pas de PDF ici : « Imprimer » le produit déjà, et fidèlement.
                formats={['XLSX', 'CSV']}
                tableau={() => ({
                  titre: 'Tableau de bord',
                  sousTitre: `${entiteNom} — ${libellePeriode(granularite, ancre)}`,
                  entetes: ['Groupe', 'Indicateur', 'Valeur', 'Unité'],
                  /*
                    LA VALEUR PART EN NOMBRE, l'unité à côté. Écrire
                    « 15 000 000 MGA » dans une cellule en ferait du texte, et
                    la première chose qu'on fait d'un export est de le sommer.
                  */
                  lignes: chiffres.map((k) => [
                    LIBELLES_GROUPE_KPI[k.groupe],
                    k.libelle,
                    mesures[k.cle] ?? 0,
                    k.format === 'MONTANT' ? devise : 'personnes',
                  ]),
                })}
              />
            </>
          )}
          {personnalise && (
            <Button
              variant="ghost"
              className="h-10"
              disabled={enregistrement}
              onClick={() => poser(DISPOSITION_VIDE)}
            >
              <RotateCcw className="mr-2 size-4" aria-hidden />
              Rétablir l&apos;ordre d&apos;origine
            </Button>
          )}

          <Button
            variant={personnalise ? 'default' : 'outline'}
            className="h-10"
            aria-pressed={personnalise}
            onClick={() => setPersonnalise((v) => !v)}
          >
            <SlidersHorizontal className="mr-2 size-4" aria-hidden />
            {personnalise ? 'Terminer' : 'Personnaliser'}
          </Button>
        </div>
      </div>

      {/*
        EF-DSH-08 — LES MODÈLES, EN UN CLIC.

        Composer son tableau de bord carte par carte est le travail de quelqu'un
        qui sait déjà ce qu'il veut. Un modèle donne un POINT DE VUE tout fait —
        « la trésorerie », « les effectifs » — dont on part, et qu'on ajuste
        ensuite : c'est l'inverse de la page blanche.

        Ils ne s'affichent qu'en personnalisation : hors de ce mode, ils
        proposeraient de tout rebattre à côté d'un écran qu'on est en train de
        lire.
      */}
      {personnalise && (
        <div className="border-border bg-muted/30 no-print space-y-3 rounded-lg border p-4">
          <p className="eyebrow">Partir d’un modèle</p>

          <div className="flex flex-wrap gap-2">
            {MODELES_TABLEAU_DE_BORD.map((modele) => {
              const applicable = modeleApplicable(modele, kpis);

              return (
                <button
                  key={modele.cle}
                  type="button"
                  disabled={!applicable || enregistrement}
                  onClick={() => poser(dispositionDuModele(modele, kpis))}
                  /*
                    UN MODÈLE INAPPLICABLE RESTE VISIBLE, éteint et expliqué.
                    Le retirer laisserait croire qu'il n'existe pas ; le
                    proposer sans avertir donnerait un écran vide dont la cause
                    serait introuvable.
                  */
                  title={
                    applicable
                      ? modele.description
                      : 'Ce modèle ne retiendrait aucun indicateur que vous puissiez voir.'
                  }
                  className="border-border bg-card hover:border-foreground/30 flex max-w-72 cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <LayoutTemplate className="size-4 shrink-0" aria-hidden />
                    {modele.nom}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {applicable
                      ? modele.description
                      : 'Aucun de ses indicateurs ne vous est accessible.'}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-muted-foreground text-xs">
            Un modèle remplace votre disposition — il ne l’efface pas définitivement : «
            Rétablir l’ordre d’origine » revient au registre complet.
          </p>
        </div>
      )}

      {groupes.map((groupe) => {
        const duGroupe = affiches.filter((k) => k.groupe === groupe);

        /**
         * DEUX VOIES QUAND UN SEUL BLOC LARGE ACCOMPAGNE DES COMPTEURS.
         *
         * Un bloc large posé SOUS une rangée de compteurs laisse la moitié
         * droite de l'écran vide, et l'œil doit descendre pour rien. À côté,
         * il occupe la place qui reste — c'est le cas de « Structure », où
         * cinq chiffres tiennent en deux rangées de trois pendant que le
         * classement des filles se déploie en hauteur.
         *
         * DÈS QUE LES BLOCS LARGES SONT PLUSIEURS, ils se pavent très bien
         * entre eux : deux voies les empileraient dans une colonne étroite et
         * feraient une page trois fois plus longue. On garde alors la grille.
         */
        const larges = duGroupe.filter((k) => (k.taille ?? 1) >= 3);
        const petites = duGroupe.filter((k) => (k.taille ?? 1) < 3);
        const deuxVoies = larges.length === 1 && petites.length > 0;

        /**
         * DANS UNE VOIE, LA TAILLE DÉCIDE DU NOMBRE DE COLONNES, pas de
         * l'étendue de chaque carte.
         *
         * `taille` est exprimée en colonnes de la grille à SIX ; l'appliquer
         * telle quelle dans une voie qui n'en compte que trois donnait une
         * carte de montant occupant deux colonnes sur trois — une par rangée,
         * et une colonne perdue à côté.
         *
         * Ce que `taille: 2` veut dire, c'est « ce chiffre est LONG ». Dans une
         * voie, cela se traduit par deux colonnes au lieu de trois, et toutes
         * les cartes en occupent une.
         */
        const colonnes = petites.some((k) => (k.taille ?? 1) >= 2)
          ? 'md:grid-cols-2'
          : 'md:grid-cols-3';

        return (
          <section key={groupe} className="space-y-3">
            <p className="eyebrow">{LIBELLES_GROUPE_KPI[groupe as GroupeKpi]}</p>

            {deuxVoies ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <div className={`grid grid-cols-2 gap-4 ${colonnes}`}>
                  {petites.map((k) => carte(k, true))}
                </div>
                <div className="grid gap-4">{larges.map((k) => carte(k, true))}</div>
              </div>
            ) : (
              /*
                LES COMPTEURS ONT LEUR PROPRE RANGÉE.

                Ils portent tous la même chose — un nombre et son libellé — et
                doivent donc avoir la même largeur : c'est ce qui permet de les
                parcourir d'un coup d'œil au lieu de les lire un par un. Laisser
                un bloc large finir leur rangée les aurait rétrécis de façon
                inégale, sans que rien ne le justifie.

                EN FLEX, PAS EN GRILLE. Une grille à six colonnes laisse un TROU
                dès que le nombre de cartes ne la divise pas : cinq compteurs y
                occupaient cinq colonnes sur six, et la rangée s'arrêtait avant
                le bord — ce que le lecteur prend pour une carte manquante, pas
                pour un reste de division. Avec `grow`, chaque carte part d'une
                largeur confortable puis s'étire pour absorber ce qui reste.

                L'ordre choisi joue À L'INTÉRIEUR de chaque famille : on
                réordonne ses compteurs entre eux, et ses blocs entre eux.
              */
              <div className="space-y-4">
                {petites.length > 0 && (
                  <div className="flex flex-wrap gap-4">
                    {petites.map((k) => carte(k))}
                  </div>
                )}
                {larges.length > 0 && (
                  <div className="flex flex-wrap gap-4">
                    {larges.map((k) => carte(k))}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );

  /**
   * Le rendu d'une carte, écrit UNE FOIS.
   *
   * Les deux dispositions ci-dessus n'ont pas à connaître les onze
   * gestionnaires d'une carte : les recopier dans chaque branche aurait fait
   * diverger le glisser-déposer d'une voie à l'autre au premier ajustement.
   */
  function carte(kpi: DefinitionKpi, dansUneVoie = false) {
    return (
      <CarteKpi
        key={kpi.cle}
        definition={kpi}
        // Dans une voie, la carte remplit sa cellule : c'est la voie qui a
        // déjà tenu compte de la taille en choisissant son nombre de colonnes.
        largeurAuto={dansUneVoie}
        valeur={mesures[kpi.cle] ?? 0}
        total={kpi.partDe ? (mesures[kpi.partDe] ?? 0) : null}
        contenu={blocs[kpi.cle]}
        devise={devise}
        personnalise={personnalise}
        masque={masques.has(kpi.cle)}
        enSaisie={saisi === kpi.cle}
        onPrendre={() => setSaisi(kpi.cle)}
        onLacher={() => setSaisi(null)}
        onDeposer={() => {
          // On ne dépose que sur un frère de groupe : un chiffre de finances
          // au milieu des effectifs ne se lirait plus.
          const source = affiches.find((k) => k.cle === saisi);
          if (source && source.groupe === kpi.groupe) deplacer(source, kpi.cle);
          setSaisi(null);
        }}
        onReculer={() => {
          const avant = voisin(kpi, -1);
          if (avant) deplacer(kpi, avant.cle);
        }}
        onAvancer={() => {
          // Avancer, c'est passer AVANT le suivant du suivant : sans ce
          // décalage, on se replacerait à l'endroit qu'on occupe.
          const apres = voisin(kpi, 1);
          const encoreApres = apres ? voisin(apres, 1) : null;
          if (encoreApres) deplacer(kpi, encoreApres.cle);
          else if (apres) {
            const freres = affiches.filter((k) => k.groupe === kpi.groupe);
            const sansLui = affiches.map((k) => k.cle).filter((c) => c !== kpi.cle);
            const dernier = freres[freres.length - 1]!;
            const i = sansLui.indexOf(dernier.cle);
            poser({
              ...disposition,
              ordre: [...sansLui.slice(0, i + 1), kpi.cle, ...sansLui.slice(i + 1)],
            });
          }
        }}
        onBasculer={() => poser(basculerMasque(disposition, kpi.cle))}
      />
    );
  }
}

/**
 * La largeur d'un bloc, en classes LITTÉRALES.
 *
 * Tailwind lit le code source pour décider des classes qu'il produit : une
 * classe assemblée à l'exécution (`col-span-${n}`) n'existerait dans aucune
 * feuille de style, et le bloc s'afficherait à une colonne sans que rien ne
 * signale l'erreur.
 */
/**
 * La largeur d'un bloc en disposition FLEX : une base, et la permission de
 * s'étirer.
 *
 * `basis-*` dit la largeur CONFORTABLE — celle en dessous de laquelle le bloc
 * cesse d'être lisible et doit passer à la ligne. `grow` lui laisse absorber ce
 * qui reste sur sa rangée : c'est ce qui garantit qu'aucune rangée ne s'arrête
 * avant le bord, quel que soit le nombre de cartes.
 *
 * Les valeurs sont LITTÉRALES : Tailwind lit le code source pour décider des
 * classes qu'il produit, et une classe assemblée à l'exécution n'existerait
 * dans aucune feuille de style.
 */
const LARGEURS: Record<TailleKpi, string> = {
  // Un effectif tient en trois chiffres : 13 rem suffisent largement.
  1: 'grow basis-52',
  // Un montant est long — « 15 000 000 MGA » ne se replie pas proprement.
  2: 'grow basis-72',
  // Une liste ou une répartition a besoin de place pour ses libellés.
  3: 'grow basis-96',
  // La courbe prend la rangée : douze mois ne se lisent pas sur un tiers.
  6: 'basis-full',
};

/**
 * La teinte de la pastille, par groupe — en classes LITTÉRALES, même raison.
 *
 * ELLE SUIT LE GROUPE, PAS L'INDICATEUR. Vingt teintes distinctes feraient un
 * arc-en-ciel où plus rien ne se rattache à rien ; quatre familles de couleur
 * disent au contraire, de loin, dans quelle section on se trouve.
 *
 * Le fond reste très pâle : c'est le CHIFFRE qu'on vient lire, et une pastille
 * saturée le concurrencerait.
 */
const TEINTES: Record<GroupeKpi, string> = {
  EFFECTIFS: 'bg-sky-50 text-sky-600',
  STRUCTURE: 'bg-violet-50 text-violet-600',
  GOUVERNANCE: 'bg-amber-50 text-amber-600',
  FINANCES: 'bg-emerald-50 text-emerald-600',
};

function CarteKpi({
  definition,
  valeur,
  total,
  contenu: contenuAlternatif,
  devise,
  largeurAuto = false,
  personnalise,
  masque,
  enSaisie,
  onPrendre,
  onLacher,
  onDeposer,
  onReculer,
  onAvancer,
  onBasculer,
}: {
  definition: DefinitionKpi;
  valeur: number;
  /** L'effectif auquel ce chiffre se rapporte, ou `null` — EF-DSH-05. */
  total: number | null;
  /** Le rendu du bloc quand ce n'est pas un chiffre — EF-DSH-06. */
  contenu?: ReactNode;
  devise: string;
  /** La carte remplit sa cellule : sa voie a déjà tenu compte de la taille. */
  largeurAuto?: boolean;
  personnalise: boolean;
  masque: boolean;
  enSaisie: boolean;
  onPrendre: () => void;
  onLacher: () => void;
  onDeposer: () => void;
  onReculer: () => void;
  onAvancer: () => void;
  onBasculer: () => void;
}) {
  const alerte = kpiEstAlerte(definition, valeur);
  const rendu = definition.rendu ?? 'VALEUR';

  /**
   * SUR FOND BLANC, C'EST L'OMBRE QUI SÉPARE.
   *
   * Une carte blanche sur le gris de page se découpe d'elle-même ; ici, il n'y
   * a plus de contraste de fond à emprunter. Le relief prend le relais —
   * discret, parce qu'une ombre marquée sur vingt cartes fabrique un bruit que
   * l'œil doit trier avant d'atteindre les chiffres.
   */
  const largeur = `${largeurAuto ? '' : LARGEURS[definition.taille ?? 1]} border-border/70 shadow-sm`;
  const part = definition.partDe ? partDeLEffectif(valeur, total ?? 0) : null;

  const contenu = (
    /*
      `pt-4.5` — deux pixels de moins en haut que sur les autres côtés.

      C'est un ÉCART ASSUMÉ à la grille de 8 px (règle 6) : la pastille d'icône
      porte déjà son propre air visuel, et l'aplomb du haut paraissait plus
      lourd que celui des côtés. Deux pixels suffisent à rétablir l'équilibre —
      la valeur reste sur l'échelle Tailwind, pas en valeur arbitraire.
    */
    <CardContent className="space-y-1.5 px-5 pt-4.5 pb-5">
      {/*
        UNE ICÔNE NE DÉCORE PAS, ELLE DISTINGUE. Sur une grille de vingt cartes,
        on cherche « le solde » avant de lire les libellés : c'est la forme
        qu'on reconnaît de loin, et la teinte dit la section.

        Elle est masquée aux lecteurs d'écran : elle ne porte rien que le
        libellé n'ait déjà, et l'annoncer ferait entendre deux fois la même
        chose.
      */}
      <span
        className={`mb-3 flex size-10 items-center justify-center rounded-xl ${TEINTES[definition.groupe]}`}
      >
        <IconeKpi cle={definition.cle} className="size-5" />
      </span>

      <p className="text-muted-foreground flex items-center gap-1 text-sm font-medium">
        {definition.libelle}
        {definition.lien && !personnalise && (
          <ArrowUpRight
            className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        )}
      </p>

      {rendu === 'VALEUR' ? (
        <>
          {/*
            LE CHIFFRE EST CE QU'ON VIENT LIRE : il domine la carte. Un montant
            reste d'un cran plus petit — « 15 000 000 MGA » à la même taille
            qu'un effectif se replierait en deux lignes.
          */}
          <p
            className={`font-semibold tabular-nums ${
              definition.format === 'MONTANT' ? 'text-2xl' : 'text-4xl'
            } ${alerte ? 'text-rose-700' : 'text-foreground'}`}
          >
            {definition.format === 'MONTANT'
              ? formatMontant(valeur, devise)
              : formatNombre(valeur)}
          </p>

          {/*
            EF-DSH-05 — LA PART, quand le chiffre se rapporte à un total.
            « 1 240 femmes » ne dit rien seul ; « 53 % de l'effectif » se lit.
          */}
          {part !== null && (
            <p className="text-muted-foreground text-sm font-medium tabular-nums">
              {part.toFixed(1).replace('.', ',')} % de l’effectif
            </p>
          )}

          {definition.aide && (
            <p className="text-muted-foreground text-xs">{definition.aide}</p>
          )}
        </>
      ) : (
        /*
          UN BLOC SANS CONTENU NE SE TAIT PAS. Il est demandé par le registre,
          donc attendu à l'écran : le voir vide dirait « il n'y a rien », quand
          la cause peut être une lecture qui n'a pas abouti (règle 15).
        */
        (contenuAlternatif ?? (
          <p className="text-muted-foreground text-sm">Ce bloc n’a pas pu être chargé.</p>
        ))
      )}
    </CardContent>
  );

  if (!personnalise) {
    // Un bloc composé porte ses propres liens : l'envelopper d'un `<Link>`
    // imbriquerait deux ancres, ce que le navigateur défait comme il peut.
    if (!definition.lien || rendu !== 'VALEUR') {
      return <Card className={largeur}>{contenu}</Card>;
    }

    return (
      <Card
        // Le survol RENFORCE l'ombre plutôt que la bordure : c'est le même
        // signal que celui qui sépare déjà les cartes, en plus marqué.
        className={`group transition-shadow hover:shadow-md ${largeur}`}
      >
        {/* EF-DSH-09 — le chiffre mène à son détail. Voir « 12 transferts à
            décider » sans pouvoir y aller oblige à retrouver l'écran et à y
            reposer le filtre qu'on vient de lire. */}
        <Link href={definition.lien} className="block">
          {contenu}
        </Link>
      </Card>
    );
  }

  return (
    <Card
      draggable
      onDragStart={onPrendre}
      onDragEnd={onLacher}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDeposer();
      }}
      className={`relative cursor-grab transition-opacity ${largeur} ${
        enSaisie ? 'opacity-40' : ''
      } ${
        // Un indicateur masqué reste LISIBLE en personnalisation, estompé :
        // s'il disparaissait, on ne pourrait plus le rétablir.
        masque ? 'opacity-50' : ''
      }`}
    >
      <div className="absolute top-2 right-2 flex items-center gap-0.5">
        {/* Le clavier fait ce que fait la souris (ENF-ACC) : un réglage qu'on
            ne peut poser qu'au pointeur n'est pas un réglage pour tout le
            monde. */}
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`Reculer ${definition.libelle}`}
          onClick={onReculer}
        >
          <ChevronLeft className="size-3.5" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`Avancer ${definition.libelle}`}
          onClick={onAvancer}
        >
          <ChevronRight className="size-3.5" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={
            masque ? `Afficher ${definition.libelle}` : `Masquer ${definition.libelle}`
          }
          aria-pressed={!masque}
          onClick={onBasculer}
        >
          {masque ? (
            <EyeOff className="size-3.5" aria-hidden />
          ) : (
            <Eye className="size-3.5" aria-hidden />
          )}
        </Button>
      </div>

      <GripVertical
        className="text-muted-foreground absolute bottom-2 left-2 size-4"
        aria-hidden
      />

      {contenu}
    </Card>
  );
}
