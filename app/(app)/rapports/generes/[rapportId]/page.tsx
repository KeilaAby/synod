import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { chargerRapport } from '@/lib/data/rapports';
import { getParametres } from '@/lib/data/settings';
import { formatDate } from '@/lib/utils/format';

import { RapportClient } from './rapport-client';

export const metadata: Metadata = { title: 'Rapport genere' };

/**
 * EF-RAP-15 a 18 — un rapport genere.
 *
 * AUCUNE RESOLUTION ICI. Tout vient de `report_instances` : la structure figee,
 * les donnees figees, les omissions consignees. C'est la definition meme de
 * RG-27 — un rapport qui se recalculerait a chaque ouverture ne serait pas un
 * rapport, mais un ecran.
 *
 * La RLS decide qui peut l'ouvrir : le perimetre, plus `report.read` — ou la
 * publication, qui est faite pour cela (EF-RAP-18). Un rapport introuvable est
 * rendu comme inexistant : distinguer « n'existe pas » de « pas pour vous »
 * renseignerait sur ce qu'on n'a pas le droit de voir.
 */
export default async function RapportGenerePage({
  params,
}: {
  params: Promise<{ rapportId: string }>;
}) {
  const { rapportId } = await params;

  const [rapport, parametres] = await Promise.all([
    chargerRapport(rapportId),
    getParametres(),
  ]);

  if (!rapport) notFound();

  return (
    <RapportClient
      nom={rapport.nom}
      structure={rapport.structure}
      contenu={rapport.contenu}
      blocsOmis={rapport.blocsOmis}
      entete={{
        organisation: parametres.nom_organisation,
        entite: rapport.entite?.nom ?? '—',
        periode: `${formatDate(rapport.periodeDebut)} — ${formatDate(rapport.periodeFin)}`,
      }}
    />
  );
}
