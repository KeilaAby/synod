'use client';

import { useMemo, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PointSerieEffectifs } from '@/lib/domain/evolution-effectifs';
import { formatNombre } from '@/lib/utils/format';

/**
 * L'évolution des effectifs Croyants sur douze mois — EF-DSH.
 *
 * Graphique en Aire réalisé en SVG pur (règle 29) : dégradé subtil,
 * infobulle interactive au survol, sélection des séries (Total, Femmes,
 * Hommes, En cellule, ou Vue comparée).
 */

const L = 720;
const H = 240;
const MARGE = { haut: 16, bas: 28, gauche: 52, droite: 16 };

type SerieChoisie = 'croyants' | 'femmes' | 'hommes' | 'encellules';

const SERIES_CONFIG: Record<
  SerieChoisie,
  { libelle: string; couleur: string; degradeId: string; stroke: string; stopColor: string }
> = {
  croyants: {
    libelle: 'Total des croyants',
    couleur: 'text-sky-600',
    stroke: '#0284c7',
    stopColor: '#0284c7',
    degradeId: 'degrade-croyants',
  },
  femmes: {
    libelle: 'Femmes',
    couleur: 'text-pink-600',
    stroke: '#db2777',
    stopColor: '#db2777',
    degradeId: 'degrade-femmes',
  },
  hommes: {
    libelle: 'Hommes',
    couleur: 'text-indigo-600',
    stroke: '#4f46e5',
    stopColor: '#4f46e5',
    degradeId: 'degrade-hommes',
  },
  encellules: {
    libelle: 'Croyants en cellule',
    couleur: 'text-emerald-600',
    stroke: '#059669',
    stopColor: '#059669',
    degradeId: 'degrade-encellules',
  },
};

export function CourbeEffectifs({
  points,
}: {
  points: readonly PointSerieEffectifs[];
}) {
  const [serie, setSerie] = useState<SerieChoisie>('croyants');
  const [survole, setSurvole] = useState<number | null>(null);

  const donnees = useMemo(() => {
    if (!points || points.length === 0) return [];
    return points.map((p) => ({
      mois: p.mois,
      libelle: p.libelle,
      valeur: p[serie] ?? 0,
      croyants: p.croyants ?? 0,
      femmes: p.femmes ?? 0,
      hommes: p.hommes ?? 0,
      encellules: p.encellules ?? 0,
    }));
  }, [points, serie]);

  const cfg = SERIES_CONFIG[serie];
  const maximum = Math.max(1, ...donnees.map((p) => p.valeur));
  const largeurUtile = L - MARGE.gauche - MARGE.droite;
  const hauteurUtile = H - MARGE.haut - MARGE.bas;

  const x = (i: number) =>
    donnees.length <= 1
      ? MARGE.gauche + largeurUtile / 2
      : MARGE.gauche + (i * largeurUtile) / (donnees.length - 1);

  const y = (v: number) => MARGE.haut + hauteurUtile - (v / maximum) * hauteurUtile;

  const ligne = donnees
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.valeur)}`)
    .join(' ');

  const aire =
    donnees.length > 0
      ? `${ligne} L ${x(donnees.length - 1)} ${MARGE.haut + hauteurUtile} L ${x(0)} ${
          MARGE.haut + hauteurUtile
        } Z`
      : '';

  // 4 graduations
  const graduations = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * maximum));

  const dernierPoint = donnees.length > 0 ? donnees[donnees.length - 1] : null;
  const actif = survole !== null && donnees[survole] ? donnees[survole] : null;

  if (donnees.length === 0) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
        Aucune donnée d’effectif disponible sur cette période.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Effectif actuel ({cfg.libelle.toLowerCase()})
          </p>
          <p className="text-3xl font-semibold tabular-nums text-foreground">
            {formatNombre(dernierPoint?.valeur ?? 0)}
          </p>
        </div>

        <Select value={serie} onValueChange={(v) => setSerie(v as SerieChoisie)}>
          <SelectTrigger className="h-9 w-52" aria-label="Série d'effectif affichée">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="croyants">Total croyants</SelectItem>
            <SelectItem value="femmes">Femmes</SelectItem>
            <SelectItem value="hommes">Hommes</SelectItem>
            <SelectItem value="encellules">En cellule</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${L} ${H}`}
          className="h-60 w-full min-w-[32rem]"
          role="img"
          aria-label={`Évolution mensuelle des effectifs — ${cfg.libelle}`}
        >
          <defs>
            <linearGradient id={cfg.degradeId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cfg.stopColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={cfg.stopColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Graduations */}
          {graduations.map((valeur, idx) => (
            <g key={`${valeur}-${idx}`}>
              <line
                x1={MARGE.gauche}
                y1={y(valeur)}
                x2={L - MARGE.droite}
                y2={y(valeur)}
                className="stroke-border"
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              <text
                x={MARGE.gauche - 8}
                y={y(valeur) + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {formatNombre(valeur)}
              </text>
            </g>
          ))}

          {/* Aire et Ligne */}
          <path d={aire} fill={`url(#${cfg.degradeId})`} />
          <path
            d={ligne}
            fill="none"
            stroke={cfg.stroke}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Zones interactives par mois */}
          {donnees.map((p, i) => (
            <g key={p.mois}>
              <rect
                x={x(i) - largeurUtile / Math.max(1, donnees.length * 2)}
                y={MARGE.haut}
                width={largeurUtile / Math.max(1, donnees.length)}
                height={hauteurUtile}
                fill="transparent"
                onMouseEnter={() => setSurvole(i)}
                onMouseLeave={() => setSurvole(null)}
              />

              <text
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {extraireMoisCourt(p.mois)}
              </text>
            </g>
          ))}

          {/* Curseur et Infobulle active au survol */}
          {actif && survole !== null && (
            <g pointerEvents="none">
              <line
                x1={x(survole)}
                y1={MARGE.haut}
                x2={x(survole)}
                y2={MARGE.haut + hauteurUtile}
                stroke={cfg.stroke}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <circle
                cx={x(survole)}
                cy={y(actif.valeur)}
                r={5}
                fill={cfg.stroke}
                className="stroke-white"
                strokeWidth={2}
              />
              <text
                x={x(survole)}
                y={Math.max(MARGE.haut + 12, y(actif.valeur) - 12)}
                textAnchor={
                  survole === 0 ? 'start' : survole === donnees.length - 1 ? 'end' : 'middle'
                }
                className="fill-foreground text-[12px] font-semibold tabular-nums"
              >
                {formatNombre(actif.valeur)} {cfg.libelle.toLowerCase()}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

function extraireMoisCourt(iso: string): string {
  if (!iso) return '';
  const parties = iso.split('-');
  if (parties.length < 2) return iso;
  const moisIndex = parseInt(parties[1]!, 10) - 1;
  const MOIS_COURTS = [
    'Jan',
    'Fév',
    'Mar',
    'Avr',
    'Mai',
    'Juin',
    'Juil',
    'Aoû',
    'Sep',
    'Oct',
    'Nov',
    'Déc',
  ];
  return MOIS_COURTS[moisIndex] ?? iso;
}
