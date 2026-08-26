'use client';

import { useMemo, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CategorieFinance, LigneSynthese } from '@/lib/data/finances';
import { libelleMois } from '@/lib/domain/synthese';
import { formatMontant } from '@/lib/utils/format';

/**
 * L'évolution des finances sur douze mois — EF-DSH-05, EF-DSH-06.
 *
 * TROIS CHIFFRES DU MOIS NE DISENT PAS S'IL EST BON : c'est la comparaison aux
 * onze précédents qui le dit.
 *
 * Permet de sélectionner :
 * - Toutes les recettes
 * - Toutes les dépenses
 * - Chaque type/catégorie de finance individuellement (Dîmes, Quêtes, Offrandes,
 *   Dons, Cotisations, Fonctionnement, Travaux, etc.).
 *
 * EN SVG ÉCRIT À LA MAIN (règle 29) : dégradé subtil, graduations, infobulle
 * interactive au survol.
 */

const L = 720;
const H = 240;
const MARGE = { haut: 16, bas: 28, gauche: 68, droite: 16 };

export function CourbeFinances({
  lignes,
  categoriesReferentiel = [],
  annee,
  devise,
}: {
  lignes: LigneSynthese[];
  categoriesReferentiel?: CategorieFinance[];
  annee: number;
  devise: string;
}) {
  /** `RECETTE`, `DEPENSE`, ou l'identifiant d'une catégorie précise. */
  const [choix, setChoix] = useState('RECETTE');
  const [survole, setSurvole] = useState<number | null>(null);

  /**
   * Liste complète de toutes les catégories financières du référentiel
   * enrichie de celles éventuellement présentes dans les lignes.
   */
  const categories = useMemo(() => {
    const map = new Map<string, { id: string; libelle: string; sens: string }>();

    for (const c of categoriesReferentiel) {
      map.set(c.id, { id: c.id, libelle: c.libelle, sens: c.sens });
    }

    for (const l of lignes) {
      if (!map.has(l.categorieId)) {
        map.set(l.categorieId, { id: l.categorieId, libelle: l.libelle, sens: l.sens });
      }
    }

    const toutes = [...map.values()];
    const recettes = toutes
      .filter((c) => c.sens === 'RECETTE')
      .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
    const depenses = toutes
      .filter((c) => c.sens === 'DEPENSE')
      .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));

    return { recettes, depenses, toutes };
  }, [lignes, categoriesReferentiel]);

  // Déterminer le sens (recette ou dépense) de la sélection active
  const sensActif = useMemo(() => {
    if (choix === 'DEPENSE') return 'DEPENSE';
    if (choix === 'RECETTE') return 'RECETTE';
    const cat = categories.toutes.find((c) => c.id === choix);
    return cat?.sens ?? 'RECETTE';
  }, [choix, categories]);

  const libelleSelection = useMemo(() => {
    if (choix === 'RECETTE') return 'Toutes les recettes';
    if (choix === 'DEPENSE') return 'Toutes les dépenses';
    const cat = categories.toutes.find((c) => c.id === choix);
    return cat?.libelle ?? 'Catégorie';
  }, [choix, categories]);

  const points = useMemo(() => {
    const parMois = new Map<string, number>();
    for (let m = 1; m <= 12; m++) {
      parMois.set(`${annee}-${String(m).padStart(2, '0')}-01`, 0);
    }

    for (const l of lignes) {
      const retenue =
        choix === 'RECETTE' || choix === 'DEPENSE'
          ? l.sens === choix
          : l.categorieId === choix;
      if (!retenue) continue;

      const courant = parMois.get(l.mois);
      if (courant === undefined) continue;
      // Le CONSOLIDÉ : le tableau de bord parle du périmètre entier
      parMois.set(l.mois, courant + l.montantConsolide);
    }

    return [...parMois.entries()].map(([mois, valeur]) => ({ mois, valeur }));
  }, [lignes, choix, annee]);

  const maximum = Math.max(1, ...points.map((p) => p.valeur));
  const largeurUtile = L - MARGE.gauche - MARGE.droite;
  const hauteurUtile = H - MARGE.haut - MARGE.bas;

  const x = (i: number) => MARGE.gauche + (i * largeurUtile) / (points.length - 1);
  const y = (v: number) => MARGE.haut + hauteurUtile - (v / maximum) * hauteurUtile;

  const ligne = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.valeur)}`).join(' ');
  const aire =
    `${ligne} L ${x(points.length - 1)} ${MARGE.haut + hauteurUtile}` +
    ` L ${x(0)} ${MARGE.haut + hauteurUtile} Z`;

  // 4 graduations
  const graduations = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maximum);

  const total = points.reduce((s, p) => s + p.valeur, 0);
  const actif = survole !== null ? points[survole] : null;

  const estRecette = sensActif === 'RECETTE';
  const couleurStroke = estRecette ? '#059669' : '#e11d48';
  const couleurStop = estRecette ? 'text-emerald-500' : 'text-rose-500';
  const degradeId = estRecette ? 'degrade-finances-recette' : 'degrade-finances-depense';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Cumul {annee} — {libelleSelection}
          </p>
          <p
            className={`text-3xl font-semibold tabular-nums ${
              estRecette ? 'text-foreground' : 'text-rose-700'
            }`}
          >
            {formatMontant(total, devise)}
          </p>
        </div>

        <Select value={choix} onValueChange={setChoix}>
          <SelectTrigger className="h-9 w-64" aria-label="Type ou catégorie financière suivie">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="RECETTE">Toutes les recettes</SelectItem>
            <SelectItem value="DEPENSE">Toutes les dépenses</SelectItem>

            {categories.recettes.length > 0 && (
              <SelectGroup>
                <SelectLabel className="px-2 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Types de recettes
                </SelectLabel>
                {categories.recettes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.libelle}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}

            {categories.depenses.length > 0 && (
              <SelectGroup>
                <SelectLabel className="px-2 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Types de dépenses
                </SelectLabel>
                {categories.depenses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.libelle}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${L} ${H}`}
          className="h-60 w-full min-w-[32rem]"
          role="img"
          aria-label={`Évolution mensuelle — ${formatMontant(total, devise)} sur ${annee} (${libelleSelection})`}
        >
          <defs>
            <linearGradient id={degradeId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className={couleurStop} stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" className={couleurStop} stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Graduations */}
          {graduations.map((valeur) => (
            <g key={valeur}>
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
                {abreger(valeur)}
              </text>
            </g>
          ))}

          <path d={aire} fill={`url(#${degradeId})`} />
          <path
            d={ligne}
            fill="none"
            stroke={couleurStroke}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {points.map((p, i) => (
            <g key={p.mois}>
              <rect
                x={x(i) - largeurUtile / 24}
                y={MARGE.haut}
                width={largeurUtile / 12}
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
                {libelleMois(p.mois)}
              </text>
            </g>
          ))}

          {actif && survole !== null && (
            <g pointerEvents="none">
              <line
                x1={x(survole)}
                y1={MARGE.haut}
                x2={x(survole)}
                y2={MARGE.haut + hauteurUtile}
                stroke={couleurStroke}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <circle
                cx={x(survole)}
                cy={y(actif.valeur)}
                r={5}
                fill={couleurStroke}
                className="stroke-white"
                strokeWidth={2}
              />
              <text
                x={x(survole)}
                y={Math.max(MARGE.haut + 12, y(actif.valeur) - 12)}
                textAnchor={
                  survole === 0 ? 'start' : survole === points.length - 1 ? 'end' : 'middle'
                }
                className="fill-foreground text-[12px] font-semibold tabular-nums"
              >
                {formatMontant(actif.valeur, devise)}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

/**
 * L'échelle verticale, abrégée.
 */
function abreger(valeur: number): string {
  if (valeur >= 1_000_000) return `${Math.round(valeur / 100_000) / 10} M`;
  if (valeur >= 1_000) return `${Math.round(valeur / 100) / 10} k`;
  return String(Math.round(valeur));
}
