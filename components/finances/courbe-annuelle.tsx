'use client';

import { libelleMois } from '@/lib/domain/synthese';
import { formatMontant } from '@/lib/utils/format';

/**
 * L'évolution du solde sur douze mois — EF-FIN-24.
 *
 * EN SVG ÉCRIT À LA MAIN, sans bibliothèque. Douze mois font vingt-quatre
 * rectangles : Recharts pèse quelques centaines de kilooctets pour ce que
 * `<rect>` fait en trois lignes, et la règle 29 demande de se demander ce
 * qu'une dépendance apporte vraiment. Le SVG de l'organigramme a déjà tranché
 * cette question dans le même sens.
 *
 * DES BARRES, PAS UNE COURBE. Une ligne suggère qu'entre deux points il existe
 * des valeurs intermédiaires ; un mois est une somme close, pas une mesure
 * prise à un instant. Deux barres accolées se comparent aussi mieux qu'une
 * ligne à une autre.
 *
 * LES DOUZE MOIS SONT TOUJOURS LÀ, même quand la période sélectionnée n'en
 * couvre qu'un : c'est ce qui SITUE la période. Les mois hors sélection sont
 * estompés, jamais retirés — une année à laquelle il manque des mois ment sur
 * la pente.
 */

const HAUTEUR = 160;
const LARGEUR_MOIS = 76;
const MARGE_BAS = 22;

export function CourbeAnnuelle({
  points,
  devise,
  debut,
  fin,
}: {
  points: readonly { mois: string; recettes: number; depenses: number }[];
  devise: string;
  /** Bornes de la période retenue : ce qui est dedans est mis en avant. */
  debut: string;
  fin: string;
}) {
  if (points.length === 0) return null;

  // L'échelle est commune aux deux séries : deux échelles rendraient une
  // dépense de 100 000 aussi haute qu'une recette d'un million.
  const plafond = Math.max(
    1,
    ...points.map((p) => Math.max(p.recettes, p.depenses)),
  );

  const largeur = points.length * LARGEUR_MOIS;
  const echelle = (valeur: number) => (valeur / plafond) * (HAUTEUR - MARGE_BAS);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${largeur} ${HAUTEUR}`}
        className="h-40 w-full min-w-[36rem]"
        role="img"
        aria-label="Recettes et dépenses mois par mois"
      >
        {/* La ligne de base : sans elle, une colonne vide ne se distingue pas
            d'un mois absent. */}
        <line
          x1={0}
          y1={HAUTEUR - MARGE_BAS}
          x2={largeur}
          y2={HAUTEUR - MARGE_BAS}
          className="stroke-border"
          strokeWidth={1}
        />

        {points.map((p, i) => {
          const dans = p.mois >= debut && p.mois <= fin;
          const x = i * LARGEUR_MOIS;
          const hRecettes = echelle(p.recettes);
          const hDepenses = echelle(p.depenses);

          return (
            <g key={p.mois} opacity={dans ? 1 : 0.3}>
              <rect
                x={x + 14}
                y={HAUTEUR - MARGE_BAS - hRecettes}
                width={20}
                height={hRecettes}
                rx={2}
                className="fill-emerald-600"
              />
              <rect
                x={x + 38}
                y={HAUTEUR - MARGE_BAS - hDepenses}
                width={20}
                height={hDepenses}
                rx={2}
                className="fill-rose-500"
              />

              {/* Le survol donne les nombres : les inscrire tous rendrait le
                  graphique illisible, les taire en ferait une décoration. */}
              <title>
                {`${libelleMois(p.mois, true)} — recettes ${formatMontant(p.recettes, devise)}, dépenses ${formatMontant(p.depenses, devise)}`}
              </title>

              <text
                x={x + LARGEUR_MOIS / 2}
                y={HAUTEUR - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {libelleMois(p.mois)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="text-muted-foreground mt-2 flex items-center gap-6 text-xs">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-xs bg-emerald-600" aria-hidden />
          Recettes
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-xs bg-rose-500" aria-hidden />
          Dépenses
        </span>
        <span>Les mois estompés sont hors de la période retenue.</span>
      </div>
    </div>
  );
}
