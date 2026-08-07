import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { EntityForm } from '@/components/structure/entity-form';
import { getEntite } from '@/lib/data/entities';
import { ENTITY_LABELS } from '@/lib/domain/hierarchy';

type Params = { params: Promise<{ entityId: string }> };

export const metadata: Metadata = { title: 'Modifier une entite' };

/**
 * EF-STR-01 — modification d'une entite.
 *
 * Le TYPE et le PARENT ne sont pas modifiables ici : changer de parent est une
 * operation distincte (EF-STR-07, « Rattacher »), qui deplace tout le
 * sous-arbre et merite sa propre confirmation. Changer de type n'a aucun sens
 * metier — une paroisse ne devient pas un district.
 */
export default async function ModifierEntitePage({ params }: Params) {
  const { entityId } = await params;

  const fiche = await getEntite(entityId);
  if (!fiche) notFound();

  const { entite, ancetres } = fiche;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={ancetres.map((a) => a.nom).join(' › ') || 'Racine de la hierarchie'}
        title={`Modifier ${entite.nom}`}
        description={`${ENTITY_LABELS[entite.type].singulier} — le rattachement se modifie depuis la fiche, via « Rattacher ».`}
      />

      <EntityForm
        entite={{
          id: entite.id,
          type: entite.type,
          code: entite.code,
          nom: entite.nom,
          description: entite.description,
          sans_acces_application: entite.sans_acces_application,
          is_active: entite.is_active,
        }}
      />
    </div>
  );
}
