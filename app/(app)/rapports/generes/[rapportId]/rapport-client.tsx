'use client';

import { ArrowLeft, Download, Printer } from 'lucide-react';
import Link from 'next/link';

import { exporterDonnees } from '@/components/rapports/exporter-donnees';
import { imprimerRapport } from '@/components/rapports/imprimer-rapport';
import { RenduRapport, type EnteteRapport } from '@/components/rapports/rendu-rapport';
import { Button } from '@/components/ui/button';
import {
  type BlocOmis,
  type ContenuRapport,
  type StructureRapport,
  mentionOmissions,
} from '@/lib/domain/rapport';

/**
 * Un rapport GENERE — EF-RAP-15 a 18.
 *
 * IL NE SE RECALCULE PAS. Tout vient de `contenu`, fige a la generation
 * (RG-27) : rouvrir ce rapport dans six mois donnera exactement le meme
 * document, meme si les chiffres ont bouge. C'est ce qui permet de le citer.
 *
 * EXPORTER EN PDF, C'EST L'IMPRIMER (règle 16, et le precedent d'EF-DSH-10).
 * Un moteur PDF serveur aurait produit un SECOND rendu — celui qu'on ne
 * regarde jamais, donc celui qui derive. Ici la feuille a l'ecran EST le
 * document : ce qu'on voit est ce qui sort. Aucun fichier n'est donc stocke, et
 * il n'a pas a l'etre : le contenu etant fige, la reimpression est reproductible
 * par construction (EF-RAP-17).
 *
 * IL N'Y A PLUS DE PUBLICATION (retiree le 20 aout 2026, migration `0060`).
 *
 * Publier rendait un rapport lisible par tout le perimetre SANS `report.read` —
 * c'en etait la definition. Le defaut se voyait mal : RG-26 omet bien les blocs
 * non habilites, mais A LA GENERATION et sous la session de CELUI QUI GENERE.
 * Le contenu etant ensuite fige (RG-27), un rapport publie montrait ses
 * finances a quelqu'un a qui `finance.read` avait ete refuse. L'omission avait
 * eu lieu, mais pour le mauvais lecteur.
 *
 * Un rapport est desormais confidentiel a son entite : `report.read` decide
 * seul, avec sa portee. Un droit, une portee, une regle.
 */
export function RapportClient({
  nom,
  structure,
  contenu,
  blocsOmis,
  entete,
}: {
  nom: string;
  structure: StructureRapport;
  contenu: ContenuRapport;
  blocsOmis: BlocOmis[];
  entete: EnteteRapport;
}) {
  return (
    <div data-large className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-4">
        <Button asChild variant="ghost" size="icon" className="size-10">
          <Link href="/rapports/generes" aria-label="Retour à l’historique">
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
        </Button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-foreground">{nom}</h1>
          <p className="text-xs text-muted-foreground">
            {entete.entite} · {entete.periode}
          </p>
        </div>

        {/* EF-RAP-16 — le classeur sert à REPRENDRE, le PDF à TRANSMETTRE. */}
        <Button
          variant="outline"
          className="h-10"
          onClick={() => exporterDonnees(nom, structure, contenu)}
        >
          <Download className="mr-2 size-4" aria-hidden />
          Données (Excel)
        </Button>

        <Button className="h-10" onClick={() => imprimerRapport(nom)}>
          <Printer className="mr-2 size-4" aria-hidden />
          Exporter en PDF
        </Button>
      </div>

      <div className="flex justify-center bg-slate-100 p-6 print:bg-white print:p-0">
        <div data-apercu>
          <RenduRapport
            structure={structure}
            entete={entete}
            contenu={contenu}
            // RG-26 — la mention COMPTE, elle n'énumère pas : lister les blocs
            // manquants apprendrait exactement ce que l'omission cache.
            mentionOmissions={mentionOmissions(blocsOmis)}
          />
        </div>
      </div>
    </div>
  );
}
