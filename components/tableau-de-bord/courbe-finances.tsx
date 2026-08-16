'use client';

import { useMemo, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { LigneSynthese } from '@/lib/data/finances';
import { libelleMois } from '@/lib/domain/synthese';
import { formatMontant } from '@/lib/utils/format';

/**
 * L'évolution des finances sur douze mois — EF-DSH-05, EF-DSH-06.
 *
 * TROIS CHIFFRES DU MOIS NE DISENT PAS S'IL EST BON : c'est la comparaison aux
 * onze précédents qui le dit. La catégorie se choisit, parce que « les recettes
 * baissent » et « les dîmes baissent » n'appellent pas la même réaction.
 *
 * LES DONNÉES SONT DÉJÀ LÀ. `fn_finance_synthese_categories` (migration 0039)
 * rend le détail mensuel par catégorie pour l'année entière : changer de
 * catégorie ou de sens est une somme faite dans le navigateur, sans le moindre
 * aller-retour (règles 17 et 28).
 *
 * EN SVG ÉCRIT À LA MAIN, comme la courbe de la synthèse : Recharts pèse
 * quelques centaines de kilooctets pour une aire et douze points (règle 29).
 *
 * UNE AIRE ET NON DES BARRES, ici — contrairement à la synthèse. La question
 * n'est pas « combien en août ? » mais « dans quel sens allons-nous ? », et
 * c'est une pente qui répond à cela. Les deux lectures coexistent parce
 * qu'elles ne posent pas la même question.
 */

const L = 720;
const H = 240;
const MARGE = { haut: 16, bas: 28, gauche: 68, droite: 16 };

export function CourbeFinances({
  lignes,
  annee,
  devise,
}: {
  lignes: LigneSynthese[];
  annee: number;
  devise: string;
}) {
  /** `RECETTE`, `DEPENSE`, ou l'identifiant d'une catégorie précise. */
  const [choix, setChoix] = useState('RECETTE');
  const [survole, setSurvole] = useState<number | null>(null);

  /** Les catégories réellement mouvementées : proposer les autres ne mène à rien. */
  const categories = useMemo(() => {
    const vues = new Map<string, { libelle: string; sens: string }>();
    for (const l of lignes) vues.set(l.categorieId, { libelle: l.libelle, sens: l.sens });
    return [...vues.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.sens.localeCompare(b.sens) || a.libelle.localeCompare(b.libelle, 'fr'));
  }, [lignes]);

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
      // Le CONSOLIDÉ : le tableau de bord parle du périmètre entier, comme les
      // cartes qui l'entourent. Mélanger les deux portées sur un même écran
      // ferait comparer des nombres qui ne comptent pas la même chose.
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

  // Quatre graduations : au-delà, elles encombrent plus qu'elles ne repèrent.
  const graduations = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maximum);

  const total = points.reduce((s, p) => s + p.valeur, 0);
  const actif = survole !== null ? points[survole] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs font-medium">
            Cumul {annee}
          </p>
          <p className="text-3xl font-semibold tabular-nums">
            {formatMontant(total, devise)}
          </p>
        </div>

        {/* Ensemble OUVERT — un référentiel que l'administration alimente :
            sélecteur, pas pictogrammes (règle 18). */}
        <Select value={choix} onValueChange={setChoix}>
          <SelectTrigger className="h-9 w-56" aria-label="Catégorie suivie">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="RECETTE">Toutes les recettes</SelectItem>
            <SelectItem value="DEPENSE">Toutes les dépenses</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.libelle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${L} ${H}`}
          className="h-60 w-full min-w-[32rem]"
          role="img"
          aria-label={`Évolution mensuelle — ${formatMontant(total, devise)} sur ${annee}`}
        >
          <defs>
            <linearGradient id="degrade-finances" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="text-emerald-500" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" className="text-emerald-500" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Les graduations sont DERRIÈRE l'aire : posées devant, elles la
              barreraient de traits qu'on prendrait pour des données. */}
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

          <path d={aire} fill="url(#degrade-finances)" />
          <path
            d={ligne}
            fill="none"
            className="stroke-emerald-600"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {points.map((p, i) => (
            <g key={p.mois}>
              {/*
                UNE BANDE INVISIBLE PAR MOIS. Viser un point de trois pixels à
                la souris est un exercice d'adresse ; viser sa colonne ne l'est
                pas.
              */}
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
                className="stroke-emerald-600"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <circle
                cx={x(survole)}
                cy={y(actif.valeur)}
                r={5}
                className="fill-emerald-600 stroke-white"
                strokeWidth={2}
              />
              {/*
                L'ÉTIQUETTE SE RABAT AUX BORDS. Ancrée au centre partout, elle
                déborderait du cadre sur janvier et sur décembre — et un
                montant coupé est pire qu'un montant absent.
              */}
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
 *
 * C'EST LE SEUL ENDROIT OÙ L'ON ABRÈGE UN MONTANT, et c'est admissible : une
 * graduation REPÈRE, elle ne se lit pas. Le montant exact reste au survol et
 * dans le cumul, en toutes lettres de chiffres.
 */
function abreger(valeur: number): string {
  if (valeur >= 1_000_000) return `${Math.round(valeur / 100_000) / 10} M`;
  if (valeur >= 1_000) return `${Math.round(valeur / 100) / 10} k`;
  return String(Math.round(valeur));
}
