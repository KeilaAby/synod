import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getArbrePerimetre } from '@/lib/data/entities';
import { chargerModele } from '@/lib/data/rapports';
import { getParametres } from '@/lib/data/settings';
import { peut } from '@/lib/domain/permissions';
import { compositionAutorisee } from '@/lib/domain/rapport';
import { getSession } from '@/lib/session';

import { EditeurClient } from './editeur-client';

export const metadata: Metadata = { title: 'Composer un modele' };

/**
 * EF-RAP-01, EF-RAP-04 — l'editeur de composition.
 *
 * LA LECTURE SEULE EST DECIDEE ICI, pas dans l'editeur : c'est le serveur qui
 * detient la session, l'arbre du perimetre et le reglage d'organisation. Le
 * client recoit un booleen et un motif — il n'a rien a re-evaluer, et ne le
 * pourrait pas honnetement.
 *
 * Ce masquage reste un CONFORT : `enregistrerStructure` refait exactement les
 * memes controles, avec la portee (regle 3). Un editeur ouvert de force
 * n'ecrirait rien.
 */
export default async function EditerModelePage({
  params,
}: {
  params: Promise<{ modeleId: string }>;
}) {
  const { modeleId } = await params;

  const [modele, session, arbre, parametres] = await Promise.all([
    chargerModele(modeleId),
    getSession(),
    getArbrePerimetre(),
    // Regle 21 — le parametre se lit a CHAQUE rendu, jamais fige au chargement
    // du module : sinon fermer la composition n'aurait d'effet qu'au
    // redemarrage suivant.
    getParametres(),
  ]);

  // La RLS a deja tranche : si le modele ne revient pas, il n'est pas lisible.
  // Une page d'erreur distinguerait « inexistant » de « pas pour vous », ce qui
  // renseigne sur ce qu'on n'a pas le droit de voir.
  if (!modele || !session) notFound();

  /**
   * Le chemin de l'entite PROPRIETAIRE — c'est la portee du droit (regle 3).
   * `null` designe le Siege pour un modele officiel (EF-RAP-08).
   */
  const cheminProprietaire =
    modele.entityId === null
      ? (arbre.find((e) => e.type === 'SIEGE')?.path ?? null)
      : (modele.entite?.path ?? null);

  const detientLeDroit =
    cheminProprietaire !== null && peut(session, 'report.template.manage', cheminProprietaire);

  const composable = compositionAutorisee({
    detientLeDroit,
    compositionLibre: parametres.rapport_composition_libre,
    // Le critere est ce que le perimetre CONTIENT, jamais le role.
    estSiege: session.entiteType === 'SIEGE',
  });

  /**
   * TROIS REFUS, TROIS PHRASES. « Lecture seule » sans motif fait chercher un
   * bouton qui n'existe pas ; nomme, le refus se corrige — ou se comprend.
   * L'ordre suit celui de l'action, pour que les deux disent la meme chose.
   */
  const motifLectureSeule = !detientLeDroit
    ? modele.estOfficiel
      ? 'Modele officiel — lecture seule'
      : 'Modele d’une autre entite'
    : modele.archiveLe
      ? 'Modele archive'
      : !composable
        ? 'Composition reservee au Siege'
        : null;

  return (
    <EditeurClient
      modeleId={modele.id}
      nom={modele.nom}
      version={modele.version}
      structureInitiale={modele.structure}
      /**
       * EF-RAP-05 — ce que l'apercu porte en tete de feuille.
       *
       * L'entite et la periode sont celles d'un EXEMPLE : un modele ne connait
       * ni l'une ni l'autre, elles se choisissent a la generation (EF-RAP-12).
       * L'apercu le dit plutot que d'afficher un cadre vide, dont on se
       * demanderait s'il restera vide sur le PDF.
       */
      entete={{
        organisation: parametres.nom_organisation,
        entite: modele.entite?.nom ?? session.entiteNom,
        periode: 'Période choisie à la génération',
      }}
      modifiable={motifLectureSeule === null}
      motifLectureSeule={motifLectureSeule}
    />
  );
}
