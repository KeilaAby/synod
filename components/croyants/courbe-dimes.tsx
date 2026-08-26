'use client';

import { CalendarRange, CalendarDays, ChevronDown } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { ChampDate } from '@/components/shared/champ-date';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  type Bornes,
  type Granularite,
  type VersementDate,
  PLAFOND_POINTS,
  bornesValides,
  courbeExploitable,
  derniersMois,
  evolutionDesDimes,
  libellePeriode,
  moisEnCours,
  nombreDePoints,
} from '@/lib/domain/dime-evolution';
import { cn } from '@/lib/utils';
import { formatMontant } from '@/lib/utils/format';

/**
 * L'évolution des dîmes d'un croyant, en aire — EF-FIN-35.
 *
 * EN SVG ÉCRIT À LA MAIN, sans bibliothèque (règle 29). Trente points font un
 * `<path>` : Recharts pèse quelques centaines de kilooctets pour ce que deux
 * boucles font en dix lignes, et trois courbes du projet ont déjà tranché la
 * question dans ce sens.
 *
 * LE MOIS EN COURS EST LA VUE PAR DÉFAUT, jour par jour — et c'est un
 * changement du 26 août 2026. Douze mois répondaient à « comment cela
 * évolue-t-il ? » ; or on ouvre une fiche pour savoir **où en est le mois**, et
 * à cette échelle chaque culte se distingue. Sur douze mois, un versement isolé
 * produisait une pointe verticale au bout d'une ligne plate : exact, et
 * illisible.
 *
 * LES DEUX AUTRES VUES SE DEMANDENT, elles ne s'imposent pas. Une plage se
 * choisit AU JOUR ou AU MOIS selon ce qu'on cherche : quelques semaines se
 * lisent jour par jour, trois ans ne se lisent qu'au mois.
 */

const HAUTEUR = 150;
const MARGE_HAUT = 12;
const MARGE_BAS = 24;

/**
 * La largeur d'un point s'adapte au NOMBRE de points.
 *
 * 64 px conviennent à douze mois ; à trente et un jours, la courbe ferait deux
 * mille pixels et sortirait de l'écran. On resserre donc, avec un plancher —
 * en dessous de 18 px, deux points se touchent et la pente disparaît.
 */
function largeurPoint(nb: number): number {
  if (nb <= 12) return 64;
  if (nb <= 20) return 44;
  if (nb <= 40) return 28;
  return 18;
}

/**
 * Une graduation sur N, pour que les libellés ne se chevauchent pas.
 *
 * Les points restent TOUS tracés : seule l'étiquette s'espace. Retirer des
 * points pour aérer l'axe changerait la courbe elle-même.
 */
function pasDesGraduations(nb: number): number {
  if (nb <= 14) return 1;
  if (nb <= 31) return 2;
  if (nb <= 60) return 5;
  return Math.ceil(nb / 12);
}

type Vue = 'MOIS_EN_COURS' | 'DOUZE_MOIS' | 'PERSONNALISE';

export function CourbeDimes({
  versements,
  devise,
}: {
  versements: readonly VersementDate[];
  devise: string;
}) {
  const [vue, setVue] = useState<Vue>('MOIS_EN_COURS');
  const [personnalisee, setPersonnalisee] = useState<Bornes | null>(null);
  const [dialogueOuvert, setDialogueOuvert] = useState(false);
  const [survole, setSurvole] = useState<number | null>(null);

  // L'identifiant du dégradé doit être UNIQUE dans la page : deux courbes
  // partageant un `id` verraient la seconde effacer la première.
  const idDegrade = useId();

  const bornes = useMemo<Bornes>(() => {
    if (vue === 'PERSONNALISE' && personnalisee) return personnalisee;
    if (vue === 'DOUZE_MOIS') return derniersMois(12);
    return moisEnCours();
  }, [vue, personnalisee]);

  const points = useMemo(
    () => evolutionDesDimes(versements, bornes),
    [versements, bornes],
  );

  const total = points.reduce((s, p) => s + p.montant, 0);
  const largeurP = largeurPoint(points.length);
  const pas = pasDesGraduations(points.length);
  const largeur = Math.max(points.length * largeurP, 1);
  const sol = HAUTEUR - MARGE_BAS;

  /**
   * L'ÉCHELLE PART DE ZÉRO, toujours.
   *
   * La faire commencer au minimum observé étirerait un écart de 2 % sur toute
   * la hauteur : la courbe montrerait une chute là où il y a une variation
   * ordinaire. Un graphique d'argent qui ne part pas de zéro exagère toujours.
   */
  const maximum = Math.max(...points.map((p) => p.montant), 1);
  const y = (montant: number) =>
    MARGE_HAUT + (sol - MARGE_HAUT) * (1 - montant / maximum);
  const x = (index: number) => index * largeurP + largeurP / 2;

  const ligne = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.montant)}`)
    .join(' ');
  const aire = `${ligne} L ${x(points.length - 1)} ${sol} L ${x(0)} ${sol} Z`;

  const actif = survole !== null ? points[survole] : null;
  const exploitable = points.length > 0 && courbeExploitable(points);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="eyebrow">Évolution</p>
          {/*
            LA COURBE DIT CE QU'ELLE COUVRE. Sans période annoncée, elle se lit
            comme la totalité : le creux qu'on y voit passerait pour un arrêt,
            alors qu'il n'est qu'une borne.
          */}
          <p className="text-muted-foreground text-xs">
            {libellePeriode(bornes)}
            {exploitable && (
              <>
                {' · '}
                <span className="text-foreground font-medium tabular-nums">
                  {formatMontant(total, devise)}
                </span>
              </>
            )}
          </p>
        </div>

        <SelecteurVue
          vue={vue}
          onMoisEnCours={() => setVue('MOIS_EN_COURS')}
          onDouzeMois={() => setVue('DOUZE_MOIS')}
          onPersonnaliser={() => setDialogueOuvert(true)}
        />
      </div>

      {!exploitable ? (
        /*
          UNE COURBE PLATE À ZÉRO SE LIT COMME UNE PANNE. On dit donc qu'il n'y
          a rien SUR CETTE PÉRIODE — l'information est là, et elle invite à
          élargir plutôt qu'à douter de l'écran.
        */
        <p className="text-muted-foreground border-border rounded-lg border border-dashed px-4 py-6 text-center text-sm">
          Aucun versement sur cette période.
        </p>
      ) : (
        <>
          <p className="text-muted-foreground h-4 text-xs tabular-nums">
            {actif ? (
              <>
                <span className="text-foreground font-medium">
                  {formatMontant(actif.montant, devise)}
                </span>{' '}
                — {actif.libelle}
                {bornes.granularite === 'JOUR' && ` ${actif.cle.slice(0, 7)}`}
                {actif.nombre > 0 && (
                  <>
                    {' · '}
                    {actif.nombre} versement{actif.nombre > 1 ? 's' : ''}
                  </>
                )}
              </>
            ) : (
              'Survolez un point pour le détail.'
            )}
          </p>

          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${largeur} ${HAUTEUR}`}
              width={largeur}
              height={HAUTEUR}
              role="img"
              aria-label={`Évolution des dîmes — ${libellePeriode(bornes)}`}
              className="max-w-full"
              onMouseLeave={() => setSurvole(null)}
            >
              <defs>
                <linearGradient id={idDegrade} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* La ligne de base ancre l'aire : sans elle, elle flotte. */}
              <line
                x1="0"
                y1={sol}
                x2={largeur}
                y2={sol}
                stroke="#e2e8f0"
                strokeWidth="1"
              />

              <path d={aire} fill={`url(#${idDegrade})`} />
              <path
                d={ligne}
                fill="none"
                stroke="#4f46e5"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {points.map((p, i) => (
                <g key={p.cle}>
                  {/*
                    LA ZONE DE SURVOL COUVRE TOUTE LA COLONNE, pas le seul
                    point : viser un cercle de trois pixels à la souris est un
                    exercice d'adresse, et sur une période à zéro le point est
                    sur la ligne de base, là où personne ne pense à pointer.
                  */}
                  <rect
                    x={i * largeurP}
                    y={0}
                    width={largeurP}
                    height={sol}
                    fill="transparent"
                    onMouseEnter={() => setSurvole(i)}
                  />

                  {/* À trente points, un cercle par jour fait un collier : on ne
                      marque que ce qui porte un montant, plus le survolé. */}
                  {(p.montant > 0 || survole === i || points.length <= 14) && (
                    <circle
                      cx={x(i)}
                      cy={y(p.montant)}
                      r={survole === i ? 4.5 : 2.5}
                      fill="#4f46e5"
                      stroke="#fff"
                      strokeWidth="1.5"
                    />
                  )}

                  {i % pas === 0 && (
                    <text
                      x={x(i)}
                      y={HAUTEUR - 6}
                      textAnchor="middle"
                      className="fill-slate-400"
                      style={{ fontSize: 10 }}
                    >
                      {p.libelle}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          </div>
        </>
      )}

      <DialoguePeriode
        ouvert={dialogueOuvert}
        onOuvertChange={setDialogueOuvert}
        initiales={bornes}
        onValider={(b) => {
          setPersonnalisee(b);
          setVue('PERSONNALISE');
          setDialogueOuvert(false);
        }}
      />
    </div>
  );
}

/** Le choix de vue — trois entrées, dont deux immédiates. */
function SelecteurVue({
  vue,
  onMoisEnCours,
  onDouzeMois,
  onPersonnaliser,
}: {
  vue: Vue;
  onMoisEnCours: () => void;
  onDouzeMois: () => void;
  onPersonnaliser: () => void;
}) {
  const libelle =
    vue === 'MOIS_EN_COURS'
      ? 'Mois en cours'
      : vue === 'DOUZE_MOIS'
        ? 'Douze derniers mois'
        : 'Période choisie';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 text-xs">
          <CalendarDays className="mr-2 size-3.5" aria-hidden />
          {libelle}
          <ChevronDown className="ml-2 size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>

      {/*
        LES DESCRIPTIONS NE SONT PAS DÉCORATIVES : « mois en cours » et « douze
        mois » ne disent pas à quelle ÉCHELLE ils tracent, et c'est justement ce
        qui change la lecture.
      */}
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem
          onSelect={onMoisEnCours}
          className="flex flex-col items-start gap-0.5 py-2.5"
        >
          <span className="text-sm font-medium">Mois en cours</span>
          <span className="text-muted-foreground text-xs whitespace-normal">
            Jour par jour, du 1er à aujourd’hui.
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={onDouzeMois}
          className="flex flex-col items-start gap-0.5 py-2.5"
        >
          <span className="text-sm font-medium">Douze derniers mois</span>
          <span className="text-muted-foreground text-xs whitespace-normal">
            Un point par mois : la tendance longue.
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={onPersonnaliser}
          className="flex flex-col items-start gap-0.5 py-2.5"
        >
          <span className="text-sm font-medium">Plage de dates ou de mois…</span>
          <span className="text-muted-foreground text-xs whitespace-normal">
            Deux bornes de votre choix, à l’échelle que vous décidez.
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Le pop-up de période — L'ÉCHELLE SE CHOISIT AVANT LES BORNES.
 *
 * Elle décide de ce qu'on saisit : deux jours, ou deux mois. Demander les
 * bornes d'abord obligerait à changer leur format après coup, ce qui perd la
 * saisie — et la question « jour ou mois » est celle qu'on se pose en premier.
 */
function DialoguePeriode({
  ouvert,
  onOuvertChange,
  initiales,
  onValider,
}: {
  ouvert: boolean;
  onOuvertChange: (v: boolean) => void;
  initiales: Bornes;
  onValider: (b: Bornes) => void;
}) {
  const [granularite, setGranularite] = useState<Granularite>(initiales.granularite);
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');

  const bornes: Bornes = { granularite, debut, fin };
  const valide = bornesValides(bornes);
  const nb = valide ? nombreDePoints(bornes) : 0;
  const tronquee = nb >= PLAFOND_POINTS;

  function changerGranularite(g: Granularite) {
    setGranularite(g);
    // Les bornes n'ont pas le même format d'une échelle à l'autre : les garder
    // produirait « 2026-08-14 » lu comme un mois, donc une plage muette.
    setDebut('');
    setFin('');
  }

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Période à afficher</DialogTitle>
          <DialogDescription>
            L’échelle décide de ce que la courbe montre : quelques semaines se lisent jour
            par jour, trois ans ne se lisent qu’au mois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <ChoixEchelle
              actif={granularite === 'JOUR'}
              icone={CalendarDays}
              titre="Par jour"
              texte="Un point par jour."
              onClick={() => changerGranularite('JOUR')}
            />
            <ChoixEchelle
              actif={granularite === 'MOIS'}
              icone={CalendarRange}
              titre="Par mois"
              texte="Un point par mois."
              onClick={() => changerGranularite('MOIS')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">
                {granularite === 'JOUR' ? 'Du' : 'Du mois de'}
              </span>
              {granularite === 'JOUR' ? (
                <ChampDate value={debut} onChange={setDebut} />
              ) : (
                // `month` reste un contrôle natif : contrairement au jour, son
                // format « 2026-08 » ne peut pas se lire à l'envers.
                <Input
                  type="month"
                  value={debut}
                  onChange={(e) => setDebut(e.target.value)}
                  className="h-10 tabular-nums"
                />
              )}
            </label>

            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">
                {granularite === 'JOUR' ? 'Au' : 'Au mois de'}
              </span>
              {granularite === 'JOUR' ? (
                <ChampDate value={fin} onChange={setFin} />
              ) : (
                <Input
                  type="month"
                  value={fin}
                  onChange={(e) => setFin(e.target.value)}
                  className="h-10 tabular-nums"
                />
              )}
            </label>
          </div>

          {/*
            CE QUE LA PLAGE PRODUIRA, DIT AVANT DE TRACER. « Du 1er janvier 2020
            à aujourd'hui, jour par jour » fait deux mille points : mieux vaut
            l'annoncer que d'afficher une courbe tronquée sans explication.
          */}
          {debut && fin && !valide && (
            <p className="text-destructive text-xs">
              La fin précède le début : aucun versement ne peut s’y trouver.
            </p>
          )}

          {valide && (
            <p
              className={cn(
                'text-xs',
                tronquee ? 'text-amber-700' : 'text-muted-foreground',
              )}
            >
              {libellePeriode(bornes)} — {nb} point{nb > 1 ? 's' : ''}.
              {tronquee && (
                <>
                  {' '}
                  Au-delà de {PLAFOND_POINTS}, la courbe s’arrête : resserrez la plage, ou
                  passez à l’échelle du mois.
                </>
              )}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="h-10"
            onClick={() => onOuvertChange(false)}
          >
            Annuler
          </Button>
          <Button className="h-10" disabled={!valide} onClick={() => onValider(bornes)}>
            Afficher
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Une échelle, présentée avec ce qu'elle trace. */
function ChoixEchelle({
  actif,
  icone: Icone,
  titre,
  texte,
  onClick,
}: {
  actif: boolean;
  icone: typeof CalendarDays;
  titre: string;
  texte: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors',
        actif ? 'border-indigo-300 bg-indigo-50/60' : 'border-border hover:bg-muted/40',
      )}
    >
      <Icone
        className={cn('size-4', actif ? 'text-indigo-700' : 'text-muted-foreground')}
        aria-hidden
      />
      <span className="text-sm font-medium">{titre}</span>
      <span className="text-muted-foreground text-xs">{texte}</span>
    </button>
  );
}
