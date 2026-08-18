import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { getArbrePerimetre } from '@/lib/data/entities';
import { versOptions } from '@/lib/data/entity-options';
import { chargerModele } from '@/lib/data/rapports';
import { peut } from '@/lib/domain/permissions';
import { modeleSApplique } from '@/lib/domain/rapport';
import { getSession } from '@/lib/session';

import { GenererClient } from './generer-client';

export const metadata: Metadata = { title: 'Generer un rapport' };

/**
 * EF-RAP-12 — generer : choisir le PERIMETRE et la PERIODE.
 *
 * DEUX QUESTIONS, ET ELLES SONT TOUT L'ECRAN. Un modele ne connait ni l'une ni
 * l'autre : c'est ce qui lui permet de servir vingt entites et quatre
 * trimestres. Les poser ici, une fois, est ce qui transforme une composition en
 * document.
 *
 * LES ENTITES PROPOSEES SONT CELLES OU L'ON PEUT GENERER — `report.create`
 * evalue AVEC SA PORTEE, entite par entite (regle 3). Une liste qui montrerait
 * tout le perimetre laisserait choisir ce que l'action refusera ensuite ; et
 * EF-RAP-10 ecarte en plus les niveaux auxquels ce modele ne s'applique pas,
 * dont chaque bloc serait vide.
 */
export default async function GenererRapportPage({
  params,
}: {
  params: Promise<{ modeleId: string }>;
}) {
  const { modeleId } = await params;

  const [modele, session, arbre] = await Promise.all([
    chargerModele(modeleId),
    getSession(),
    getArbrePerimetre(),
  ]);

  if (!modele || !session) notFound();

  const eligibles = arbre.filter(
    (e) =>
      e.is_active &&
      peut(session, 'report.create', e.path) &&
      modeleSApplique(modele.niveauxApplicables, e.type),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Rapports"
        title={`Generer « ${modele.nom} »`}
        description="Choisissez l’entite sur laquelle porte le rapport, et la periode qu’il couvre."
      />

      <GenererClient
        modeleId={modele.id}
        modeleNom={modele.nom}
        entites={versOptions(eligibles, arbre)}
        entiteParDefaut={
          // Celle de rattachement si elle est eligible : c'est le cas le plus
          // frequent, et le formulaire s'ouvre alors deja rempli.
          eligibles.some((e) => e.id === session.entityId) ? session.entityId : null
        }
      />
    </div>
  );
}
