'use client';

import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo, useState, useTransition } from 'react';

import { avertir } from '@/components/shared/messages';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { enregistrerDisposition } from '@/lib/actions/tableau-de-bord';
import {
  DISPOSITION_VIDE,
  type DefinitionKpi,
  type DispositionTableauDeBord,
  type GroupeKpi,
  LIBELLES_GROUPE_KPI,
  type TailleKpi,
  appliquerDisposition,
  basculerMasque,
  deplacerKpi,
  groupesVisibles,
  kpiEstAlerte,
  partDeLEffectif,
} from '@/lib/domain/kpi';
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
  blocs = {},
}: {
  /** Déjà filtrés par habilitation — EF-DSH-12 tient côté serveur. */
  kpis: DefinitionKpi[];
  mesures: Record<string, number>;
  disposition: DispositionTableauDeBord;
  devise: string;
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
  const [disposition, setDisposition] = useState(dispositionInitiale);
  const [personnalise, setPersonnalise] = useState(false);
  const [enregistrement, demarrer] = useTransition();
  const [saisi, setSaisi] = useState<string | null>(null);

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
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {personnalise
            ? 'Glissez une carte pour la déplacer dans son groupe, ou masquez-la. Tout est enregistré au fil des gestes.'
            : `${formatNombre(affiches.length)} indicateur${affiches.length > 1 ? 's' : ''} affiché${affiches.length > 1 ? 's' : ''}.`}
        </p>

        <div className="flex flex-wrap gap-2">
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

      {groupes.map((groupe) => (
        <section key={groupe} className="space-y-3">
          <p className="eyebrow">{LIBELLES_GROUPE_KPI[groupe as GroupeKpi]}</p>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
            {affiches
              .filter((k) => k.groupe === groupe)
              .map((kpi) => (
                <CarteKpi
                  key={kpi.cle}
                  definition={kpi}
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
                    // On ne dépose que sur un frère de groupe : un chiffre de
                    // finances au milieu des effectifs ne se lirait plus.
                    const source = affiches.find((k) => k.cle === saisi);
                    if (source && source.groupe === kpi.groupe) deplacer(source, kpi.cle);
                    setSaisi(null);
                  }}
                  onReculer={() => {
                    const avant = voisin(kpi, -1);
                    if (avant) deplacer(kpi, avant.cle);
                  }}
                  onAvancer={() => {
                    // Avancer, c'est passer AVANT le suivant du suivant : sans
                    // ce décalage, on se replacerait à l'endroit qu'on occupe.
                    const apres = voisin(kpi, 1);
                    const encoreApres = apres ? voisin(apres, 1) : null;
                    if (encoreApres) deplacer(kpi, encoreApres.cle);
                    else if (apres) {
                      const duGroupe = affiches.filter((k) => k.groupe === kpi.groupe);
                      const ordreAffiche = affiches.map((k) => k.cle);
                      const sansLui = ordreAffiche.filter((c) => c !== kpi.cle);
                      const dernier = duGroupe[duGroupe.length - 1]!;
                      const i = sansLui.indexOf(dernier.cle);
                      poser({
                        ...disposition,
                        ordre: [
                          ...sansLui.slice(0, i + 1),
                          kpi.cle,
                          ...sansLui.slice(i + 1),
                        ],
                      });
                    }
                  }}
                  onBasculer={() => poser(basculerMasque(disposition, kpi.cle))}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * La largeur d'un bloc, en classes LITTÉRALES.
 *
 * Tailwind lit le code source pour décider des classes qu'il produit : une
 * classe assemblée à l'exécution (`col-span-${n}`) n'existerait dans aucune
 * feuille de style, et le bloc s'afficherait à une colonne sans que rien ne
 * signale l'erreur.
 */
const LARGEURS: Record<TailleKpi, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-2 md:col-span-2 xl:col-span-3',
  6: 'col-span-2 md:col-span-4 xl:col-span-6',
};

function CarteKpi({
  definition,
  valeur,
  total,
  contenu: contenuAlternatif,
  devise,
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
  const largeur = LARGEURS[definition.taille ?? 1];
  const part = definition.partDe ? partDeLEffectif(valeur, total ?? 0) : null;

  const contenu = (
    <CardContent className="space-y-1.5 p-5">
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
          <p className="text-muted-foreground text-sm">
            Ce bloc n’a pas pu être chargé.
          </p>
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
        className={`group hover:border-foreground/20 transition-colors ${largeur}`}
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
          aria-label={masque ? `Afficher ${definition.libelle}` : `Masquer ${definition.libelle}`}
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
