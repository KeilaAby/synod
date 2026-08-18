'use client';

import { ArrowLeft, Download, Eye, EyeOff, Loader2, Printer } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { exporterDonnees } from '@/components/rapports/exporter-donnees';
import { RenduRapport, type EnteteRapport } from '@/components/rapports/rendu-rapport';
import { avertir } from '@/components/shared/messages';
import { PermissionGate } from '@/components/shared/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { publierRapport } from '@/lib/actions/rapports';
import {
  type BlocOmis,
  type ContenuRapport,
  type StructureRapport,
  mentionOmissions,
} from '@/lib/domain/rapport';
import { appelerAction } from '@/lib/utils/appeler-action';

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
 */
export function RapportClient({
  rapportId,
  nom,
  structure,
  contenu,
  blocsOmis,
  entete,
  publie,
  cheminEntite,
}: {
  rapportId: string;
  nom: string;
  structure: StructureRapport;
  contenu: ContenuRapport;
  blocsOmis: BlocOmis[];
  entete: EnteteRapport;
  publie: boolean;
  cheminEntite: string;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);

  async function basculerPublication() {
    setEnCours(true);
    const resultat = await appelerAction(() =>
      publierRapport({ rapportId, publier: !publie }),
    );
    setEnCours(false);

    if (!resultat.ok) {
      avertir(resultat.error);
      return;
    }
    toast.success(resultat.data.publie ? 'Rapport publié.' : 'Publication retirée.');
    router.refresh();
  }

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

        {publie && <Badge>Publié</Badge>}

        {/* EF-RAP-18 — publier est un droit à part : composer un rapport pour
            soi et le rendre lisible par tout un périmètre ne sont pas le même
            geste. */}
        <PermissionGate perm="report.publish" scope={cheminEntite}>
          <Button
            variant="outline"
            className="h-10"
            onClick={basculerPublication}
            disabled={enCours}
          >
            {enCours ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : publie ? (
              <EyeOff className="mr-2 size-4" aria-hidden />
            ) : (
              <Eye className="mr-2 size-4" aria-hidden />
            )}
            {publie ? 'Retirer la publication' : 'Publier'}
          </Button>
        </PermissionGate>

        {/* EF-RAP-16 — le classeur sert à REPRENDRE, le PDF à TRANSMETTRE. */}
        <Button
          variant="outline"
          className="h-10"
          onClick={() => exporterDonnees(nom, structure, contenu)}
        >
          <Download className="mr-2 size-4" aria-hidden />
          Données (Excel)
        </Button>

        <Button className="h-10" onClick={() => window.print()}>
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
