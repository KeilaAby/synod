'use client';

import { Download } from 'lucide-react';

import { exporterCsv } from '@/components/finances/exporter';
import type { BarreRepartition } from '@/lib/domain/kpi';
import { formatNombre } from '@/lib/utils/format';

/**
 * Une répartition, en barres horizontales — EF-DSH-05, EF-DSH-06.
 *
 * DES BARRES HORIZONTALES, ET NON UN CAMEMBERT. Un camembert est joli et se
 * lit mal : l'œil compare des longueurs, pas des angles, et il faut une légende
 * pour savoir quelle part est laquelle. Ici le libellé est **à côté** de sa
 * barre — rien à rapprocher.
 *
 * EN HTML, PAS EN SVG. Une barre est un rectangle avec du texte à côté : `div`
 * et `width` suffisent, et le texte reste sélectionnable, traduisible, et se
 * replie tout seul. Le SVG ne se justifie que là où il y a une géométrie —
 * une courbe, une jauge.
 *
 * LES DEUX LECTURES SONT LÀ. La longueur de la barre est mise à l'échelle de la
 * PLUS GRANDE tranche, sinon une répartition où rien ne dépasse 20 % ne
 * donnerait que huit traits minuscules ; le pourcentage écrit, lui, dit la
 * vérité de la part.
 */
export function RepartitionBarres({
  barres,
  total,
  reste,
  titre,
}: {
  barres: BarreRepartition[];
  total: number;
  /** Ce que le plafond a écarté — on le dit plutôt que de le taire. */
  reste: number;
  /** EF-DSH-10 — nomme le fichier exporté. Sans lui, pas d'export. */
  titre?: string;
}) {
  if (barres.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {/* Une répartition vide n'est pas une panne : un périmètre neuf n'a
            personne à répartir (règle 15). */}
        Aucun effectif à répartir.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">
        {barres.map((b) => (
          <li key={b.cle} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              {/* Le libellé se replie, il ne se tronque pas : « Diacre
                  responsable de la jeunesse » doit rester lisible. */}
              <span className="min-w-0 break-words">{b.libelle}</span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {formatNombre(b.effectif)}
                <span className="ml-2 text-xs">
                  {b.part.toFixed(1).replace('.', ',')} %
                </span>
              </span>
            </div>

            <div className="bg-muted h-2 overflow-hidden rounded-full">
              {/*
                Un plancher de 2 % : une tranche à une personne sur trois mille
                produirait une barre invisible, qu'on lirait comme une absence
                plutôt que comme une rareté.

                MAIS PAS POUR ZÉRO. Une entité sans personne doit rester une
                barre VIDE — lui donner ce plancher lui prêterait un effectif
                qu'elle n'a pas, et c'est justement celle qu'on cherche.
              */}
              <div
                className="bg-foreground/70 h-full rounded-full transition-[width]"
                style={{ width: `${b.effectif === 0 ? 0 : Math.max(2, b.longueur)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="border-border flex items-center justify-between gap-3 border-t pt-2">
        <p className="text-muted-foreground text-xs">
          {formatNombre(total)} au total
          {reste > 0 && (
            <>
              {' '}
              — {formatNombre(reste)} autre{reste > 1 ? 's' : ''} tranche
              {reste > 1 ? 's' : ''} non affichée{reste > 1 ? 's' : ''}
            </>
          )}
          .
        </p>

        {/*
          EF-DSH-10 — LE CSV EST ICI, et pas dans l'export global.

          C'est ce bloc qui porte une donnée TABULAIRE ; un indicateur à un
          chiffre n'a pas de CSV qui vaille la peine, et forcer les six
          répartitions dans un même fichier donnerait des colonnes dont le sens
          changerait selon la ligne.

          Le CSV rend CE QUI EST AFFICHÉ, plafond compris : un fichier qui
          contiendrait des tranches absentes de l'écran ne se rapprocherait
          plus de ce qu'on vient de lire.
        */}
        {titre && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground no-print flex cursor-pointer items-center gap-1 text-xs transition-colors"
            onClick={() =>
              exporterCsv({
                titre,
                entetes: ['Libellé', 'Effectif', 'Part (%)'],
                lignes: barres.map((b) => [
                  b.libelle,
                  b.effectif,
                  Number(b.part.toFixed(1)),
                ]),
              })
            }
          >
            <Download className="size-3.5" aria-hidden />
            CSV
          </button>
        )}
      </div>
    </div>
  );
}
