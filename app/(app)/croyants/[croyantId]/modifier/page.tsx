import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CroyantForm } from '@/components/croyants/croyant-form';
import { PageHeader } from '@/components/shared/page-header';
import { getCroyant } from '@/lib/data/croyants';
import { getOptionsCroyant } from '@/lib/data/croyant-options';
import { type StatutCroyant, nomComplet } from '@/lib/domain/croyant';

type Params = { params: Promise<{ croyantId: string }> };

export const metadata: Metadata = { title: 'Modifier un croyant' };

/**
 * EF-CRO-07 — modification d'une fiche.
 *
 * L'eglise de rattachement n'y figure pas : la changer est un TRANSFERT
 * (EF-TRF-01), soumis a un workflow d'approbation. Le formulaire l'affiche
 * verrouillee plutot que de la masquer.
 */
export default async function ModifierCroyantPage({ params }: Params) {
  const { croyantId } = await params;

  const croyant = await getCroyant(croyantId);
  if (!croyant) notFound();

  const options = await getOptionsCroyant();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Croyants"
        title={`Modifier ${nomComplet(croyant.nom, croyant.prenom)}`}
        description={`Matricule ${croyant.matricule} — immuable, y compris apres transfert.`}
      />

      <CroyantForm
        mode="modification"
        croyant={{
          id: croyant.id,
          matricule: croyant.matricule,
          nom: croyant.nom,
          prenom: croyant.prenom,
          sexe: croyant.sexe,
          statut_marital: croyant.statut_marital,
          email: croyant.email,
          telephone: croyant.telephone,
          date_naissance: croyant.date_naissance,
          date_bapteme: croyant.date_bapteme,
          adresse: croyant.adresse,
          eglise_id: croyant.eglise_id,
          cellule_id: croyant.cellule_id,
          grade_id: croyant.grade_id,
          nationalite_id: croyant.nationalite_id,
          statut: croyant.statut as StatutCroyant,
          egliseNom: croyant.eglise?.nom ?? '—',
        }}
        eglises={options.eglises}
        cellules={options.cellules}
        grades={options.grades}
        nationalites={options.nationalites}
      />
    </div>
  );
}
