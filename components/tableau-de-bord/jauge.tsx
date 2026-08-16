'use client';

import { formatNombre } from '@/lib/utils/format';

/**
 * Une jauge — EF-DSH-06.
 *
 * ELLE DIT « 12 SUR 20 », pas seulement « 60 % ». Un pourcentage seul ne
 * distingue pas trois entités sur cinq de six cents sur mille : le premier cas
 * se règle dans l'après-midi, le second est un chantier.
 *
 * UN ARC ET NON UNE BARRE. Une barre de progression dit « c'est en cours » ;
 * un arc dit « voici où l'on en est sur ce qui est atteignable ». Ce n'est pas
 * une tâche qui avance, c'est une couverture qu'on constate.
 *
 * LE SEUIL DE COULEUR EST GROSSIER, DÉLIBÉRÉMENT. Trois paliers — insuffisant,
 * partiel, complet — parce qu'une nuance continue ferait chercher le sens
 * d'une teinte intermédiaire là où il n'y en a pas.
 */

const RAYON = 52;
const CIRCONFERENCE = Math.PI * RAYON; // un demi-cercle

export function Jauge({
  valeur,
  couvertes,
  total,
  suffixe = 'entités',
}: {
  /** Le pourcentage, ou `null` s'il n'y a rien à couvrir. */
  valeur: number | null;
  couvertes: number;
  total: number;
  suffixe?: string;
}) {
  if (valeur === null) {
    return (
      <p className="text-muted-foreground text-sm">
        {/* Rien à couvrir n'est pas un manquement : « 0 % » se lirait comme un
            retard, alors qu'il n'y a rien à pourvoir (règle 15). */}
        Aucune {suffixe.replace(/s$/, '')} à pourvoir dans ce périmètre.
      </p>
    );
  }

  const teinte =
    valeur >= 90
      ? 'stroke-emerald-600'
      : valeur >= 60
        ? 'stroke-amber-500'
        : 'stroke-rose-500';

  const rempli = (valeur / 100) * CIRCONFERENCE;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        viewBox="0 0 120 68"
        className="w-full max-w-[13rem]"
        role="img"
        aria-label={`${valeur.toFixed(0)} % — ${couvertes} sur ${total}`}
      >
        {/* Le fond dit CE QUI RESTE À COUVRIR : sans lui, l'arc rempli n'aurait
            pas d'échelle et 60 % ressemblerait à 100 %. */}
        <path
          d={`M 8 60 A ${RAYON} ${RAYON} 0 0 1 112 60`}
          fill="none"
          className="stroke-muted"
          strokeWidth={10}
          strokeLinecap="round"
        />
        <path
          d={`M 8 60 A ${RAYON} ${RAYON} 0 0 1 112 60`}
          fill="none"
          className={teinte}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${rempli} ${CIRCONFERENCE}`}
        />

        <text
          x={60}
          y={54}
          textAnchor="middle"
          className="fill-foreground text-[22px] font-semibold tabular-nums"
        >
          {valeur.toFixed(0)} %
        </text>
      </svg>

      {/* LE RAPPORT BRUT, sous le pourcentage : c'est lui qui dit l'effort. */}
      <p className="text-muted-foreground text-sm tabular-nums">
        {formatNombre(couvertes)} sur {formatNombre(total)} {suffixe}
      </p>
    </div>
  );
}
