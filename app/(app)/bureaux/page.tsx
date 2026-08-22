import type { Metadata } from 'next';

import { PageHeader } from '@/components/shared/page-header';
import { chargerBureaux, listerCandidats, listerFonctions } from '@/lib/data/bureaux';
import { getArbrePerimetre } from '@/lib/data/entities';
import { versOptions } from '@/lib/data/entity-options';
import { signerPhotos } from '@/lib/data/photos';
import { getParametres } from '@/lib/data/settings';
import { formatNombre } from '@/lib/utils/format';

import { BureauxClient } from './bureaux-client';

export const metadata: Metadata = { title: 'Bureaux' };

/**
 * EF-BUR-01 à 10 — bureaux du périmètre.
 *
 * Tout est chargé ici, en parallèle : les mandats, le référentiel des
 * fonctions et les croyants éligibles. La composition s'ouvre alors sans
 * requête, et le filtrage reste instantané — même principe que les autres
 * listes de l'application.
 */
export default async function BureauxPage() {
  const [bureaux, fonctions, candidats, arbre, parametres] = await Promise.all([
    chargerBureaux(),
    listerFonctions(),
    listerCandidats(),
    getArbrePerimetre(),
    // EF-BUR-08 — le délai de correction de saisie, pour le pop-up de retrait.
    getParametres(),
  ]);

  // Une seule signature pour tout l'écran : titulaires ET candidats proposés.
  const photos = await signerPhotos([
    ...bureaux.flatMap((b) => b.membres.map((m) => m.croyant?.photo_key)),
    ...candidats.map((c) => c.photo_key),
  ]);

  const actifs = bureaux.filter((b) => b.is_active).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Organisation"
        title="Bureaux"
        description={
          bureaux.length > 0
            ? `${formatNombre(actifs)} mandat${actifs > 1 ? 's' : ''} en cours sur ${formatNombre(bureaux.length)} enregistré${bureaux.length > 1 ? 's' : ''}.`
            : 'Aucun bureau enregistré dans votre périmètre.'
        }
      />

      <BureauxClient
        bureaux={bureaux}
        fonctions={fonctions}
        candidats={candidats.map((c) => ({
          id: c.id,
          nom: c.nom,
          prenom: c.prenom,
          matricule: c.matricule,
          photoKey: c.photo_key,
          statut: c.statut,
          cheminEglise: c.eglise?.path ?? '',
        }))}
        photos={Object.fromEntries(photos)}
        entites={versOptions(
          // EF-BUR-01 — chaque niveau peut avoir un bureau, Cellule comprise.
          arbre.filter((e) => e.is_active),
          arbre,
        )}
        joursDelai={parametres.jours_correction_saisie}
      />
    </div>
  );
}
