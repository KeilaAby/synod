'use client';

import { useId, useState } from 'react';

import {
  type PointDime,
  courbeExploitable,
  libelleMoisCourt,
} from '@/lib/domain/dime-evolution';
import { formatMontant } from '@/lib/utils/format';

/**
 * L'évolution des dîmes d'un croyant, en aire — EF-FIN-35.
 *
 * EN SVG ÉCRIT À LA MAIN, sans bibliothèque (règle 29). Douze points font un
 * `<path>` : Recharts pèse quelques centaines de kilooctets pour ce que deux
 * boucles font en dix lignes, et trois courbes du projet ont déjà tranché la
 * question dans ce sens.
 *
 * UNE AIRE, ET NON DES BARRES — à la différence de la courbe annuelle des
 * finances. Là-bas on compare deux séries, recettes contre dépenses, et deux
 * barres accolées se comparent mieux que deux lignes. Ici il n'y a qu'une
 * série, et la question n'est pas « combien ce mois-ci » — le tableau juste
 * au-dessus le dit, à l'ariary près — mais « dans quel sens allons-nous ». Une
 * pente répond à cela ; douze barres obligent à la reconstituer.
 *
 * LES MOIS À ZÉRO SONT TRACÉS, pas sautés : c'est `evolutionDesDimes` qui les
 * pose, et l'aire descend à la ligne de base. Un creux se voit ; un point
 * manquant ne se voit pas.
 */

const HAUTEUR = 150;
const MARGE_HAUT = 12;
const MARGE_BAS = 24;
const LARGEUR_POINT = 64;

export function CourbeDimes({
  points,
  devise,
}: {
  points: readonly PointDime[];
  devise: string;
}) {
  const [survole, setSurvole] = useState<number | null>(null);
  // L'identifiant du dégradé doit être UNIQUE dans la page : deux courbes
  // partageant un `id` verraient la seconde effacer la première.
  const idDegrade = useId();

  if (points.length === 0 || !courbeExploitable(points)) return null;

  const largeur = points.length * LARGEUR_POINT;
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
  const x = (index: number) => index * LARGEUR_POINT + LARGEUR_POINT / 2;

  const ligne = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.montant)}`)
    .join(' ');
  const aire = `${ligne} L ${x(points.length - 1)} ${sol} L ${x(0)} ${sol} Z`;

  const actif = survole !== null ? points[survole] : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">Évolution sur douze mois</p>
        {/*
          LE SURVOL DIT LE CHIFFRE EXACT — une aire donne une forme, pas une
          valeur. Sans lui, il faudrait redescendre au tableau pour lire ce
          qu'on vient de voir monter.
        */}
        <p className="text-muted-foreground text-xs tabular-nums">
          {actif ? (
            <>
              <span className="text-foreground font-medium">
                {formatMontant(actif.montant, devise)}
              </span>{' '}
              en {libelleMoisCourt(actif.mois)} {actif.mois.slice(0, 4)}
              {actif.nombre > 0 && (
                <>
                  {' · '}
                  {actif.nombre} versement{actif.nombre > 1 ? 's' : ''}
                </>
              )}
            </>
          ) : (
            'Survolez un mois pour le détail.'
          )}
        </p>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${largeur} ${HAUTEUR}`}
          width={largeur}
          height={HAUTEUR}
          role="img"
          aria-label={`Évolution des dîmes sur ${points.length} mois`}
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
          <line x1="0" y1={sol} x2={largeur} y2={sol} stroke="#e2e8f0" strokeWidth="1" />

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
            <g key={p.mois}>
              {/*
                LA ZONE DE SURVOL COUVRE TOUTE LA COLONNE, pas le seul point :
                viser un cercle de trois pixels à la souris est un exercice
                d'adresse, et sur un mois à zéro le point est sur la ligne de
                base, là où personne ne pense à pointer.
              */}
              <rect
                x={i * LARGEUR_POINT}
                y={0}
                width={LARGEUR_POINT}
                height={sol}
                fill="transparent"
                onMouseEnter={() => setSurvole(i)}
              />

              <circle
                cx={x(i)}
                cy={y(p.montant)}
                r={survole === i ? 4.5 : 2.5}
                fill="#4f46e5"
                stroke="#fff"
                strokeWidth="1.5"
              />

              <text
                x={x(i)}
                y={HAUTEUR - 6}
                textAnchor="middle"
                className="fill-slate-400"
                style={{ fontSize: 10 }}
              >
                {libelleMoisCourt(p.mois)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
