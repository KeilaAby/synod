import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { OrganigrammeLoader } from '@/components/bureaux/organigramme-loader';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import {
  chargerBureau,
  chargerDisposition,
  listerCandidats,
  listerFonctions,
} from '@/lib/data/bureaux';
import { candidatsEligibles, libelleAffichage } from '@/lib/domain/bureau';
import { nomComplet } from '@/lib/domain/croyant';
import { peut } from '@/lib/domain/permissions';
import { signerPhotos } from '@/lib/data/photos';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: "Organigramme d'un bureau" };

/**
 * EF-BUR-07 — l'organigramme d'un bureau se DESSINE.
 *
 * POURQUOI UNE PAGE, ET NON UN POP-UP
 *
 * La règle 16 veut qu'une édition déclenchée depuis une liste passe par le
 * pop-up partagé. Elle vise les FORMULAIRES : deux formulaires pour le même
 * objet divergent. Ici, ce n'est pas un formulaire mais un plan de travail —
 * il lui faut la largeur, le zoom, une liste de croyants à côté et de la place
 * pour glisser. C'est le même choix que `/structure`, pour la même raison.
 *
 * La composition tabulaire reste, elle, dans son pop-up : c'est là qu'on
 * compose au quotidien, et elle n'a besoin de rien de plus.
 */
export default async function OrganigrammeBureauPage({
  params,
}: {
  params: Promise<{ bureauId: string }>;
}) {
  const { bureauId } = await params;
  const session = await requireSession();

  const [bureau, fonctions, candidats, disposition] = await Promise.all([
    chargerBureau(bureauId),
    listerFonctions(),
    listerCandidats(),
    chargerDisposition(bureauId),
  ]);

  // La RLS a déjà écarté ce qui sort du périmètre : une absence ici est une
  // absence réelle, pas un refus de droit (règle 15).
  if (!bureau?.entite) notFound();

  // RG-09 — seuls les croyants du sous-arbre de l'entité sont proposés. Le
  // filtre est appliqué à la SOURCE : proposer quelqu'un pour le refuser
  // ensuite ferait passer une règle de structure pour une erreur de saisie.
  const eligibles = candidatsEligibles(
    candidats.map((c) => ({
      croyantId: c.id,
      nom: nomComplet(c.nom, c.prenom),
      cheminEglise: c.eglise?.path ?? '',
      statut: c.statut,
    })),
    bureau.entite.path,
  );
  const parId = new Map(candidats.map((c) => [c.id, c]));
  const retenus = eligibles.map((e) => parId.get(e.croyantId)).filter((c) => c !== undefined);

  const photos = await signerPhotos([
    ...bureau.membres.map((m) => m.croyant?.photo_key),
    ...retenus.map((c) => c.photo_key),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={bureau.entite.nom}
        title={bureau.libelle}
        description={
          bureau.is_active
            ? `${libelleAffichage(bureau.libelle, bureau.date_debut, bureau.date_fin)} — déplacez les blocs, tirez un trait d'un poste vers celui qui en dépend, faites glisser un croyant pour le désigner.`
            : 'Mandat clos : l’organigramme se consulte, il ne se modifie plus.'
        }
        actions={
          <Button asChild variant="outline" className="h-10">
            <Link href="/bureaux">
              <ArrowLeft className="mr-2 size-4" aria-hidden />
              Retour aux bureaux
            </Link>
          </Button>
        }
      />

      <OrganigrammeLoader
        bureau={bureau}
        fonctions={fonctions}
        candidats={retenus.map((c) => ({
          id: c.id,
          nom: c.nom,
          prenom: c.prenom,
          matricule: c.matricule,
          photoKey: c.photo_key,
          statut: c.statut,
          cheminEglise: c.eglise?.path ?? '',
        }))}
        photos={Object.fromEntries(photos)}
        dispositionInitiale={disposition}
        peutGerer={peut(session, 'bureau.manage', bureau.entite.path)}
      />
    </div>
  );
}
