import type { Metadata } from 'next';

import { PageHeader } from '@/components/shared/page-header';
import { getArbrePerimetre } from '@/lib/data/entities';
import { versOptions } from '@/lib/data/entity-options';
import { chargerSyntheseAnnuelle } from '@/lib/data/finances';
import { getParametres } from '@/lib/data/settings';

import { SyntheseClient } from './synthese-client';

export const metadata: Metadata = { title: 'Synthèse' };

/**
 * Synthèse périodique — EF-FIN-24.
 *
 * TROIS LECTURES D'UNE MÊME PÉRIODE : d'où vient l'argent (par catégorie),
 * comment cela évolue (mois par mois), et sommes-nous dans la norme de nos
 * pairs (entre sœurs). Aucune ne se déduit des autres, et c'est pourquoi elles
 * tiennent sur un même écran plutôt que dans trois.
 *
 * L'ANNÉE ENTIÈRE EST CHARGÉE, mois par mois et dans les deux portées. Changer
 * de mois, passer au trimestre, basculer du propre au consolidé se font alors
 * dans le navigateur (règle 17) : seuls l'année et l'entité repartent au
 * serveur, parce que ce sont les deux seules choses qui changent le volume lu.
 *
 * LA RLS BORNE LE RÉSULTAT — les fonctions sont `SECURITY INVOKER`. Cet écran
 * n'a aucun filtrage à refaire, et ne peut donc pas se tromper en le faisant.
 */
export default async function SynthesePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const arbre = await getArbrePerimetre();

  /**
   * UN PÉRIMÈTRE VIDE EST UNE PANNE DE LECTURE, PAS UN REFUS DE DROIT
   * (règle 15). On le dit, plutôt que de rendre une synthèse à zéro qui se
   * lirait comme une organisation sans le moindre mouvement.
   */
  if (arbre.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Finances"
          title="Synthèse"
          description="Aucune entité n’est lisible dans votre périmètre : la synthèse ne peut porter sur rien."
        />
      </div>
    );
  }

  // L'entité de l'URL n'est retenue que si c'en est vraiment une : une URL
  // modifiée à la main donnerait sinon un écran vide sans raison visible.
  const entite =
    arbre.find((e) => e.id === params.entite) ??
    // À défaut, la racine du périmètre — celle qui n'a pas de parent DANS ce
    // périmètre. Pour le Siège c'est le Siège ; pour un gestionnaire de
    // district, c'est son district, et non la première entité venue.
    arbre.find((e) => !arbre.some((p) => p.id === e.parent_id)) ??
    arbre[0];

  const anneeDemandee = Number.parseInt(params.annee ?? '', 10);
  const annee =
    Number.isFinite(anneeDemandee) && anneeDemandee >= 2000 && anneeDemandee <= 2999
      ? anneeDemandee
      : new Date().getFullYear();

  const [synthese, parametres] = await Promise.all([
    chargerSyntheseAnnuelle(entite.id, annee),
    getParametres(),
  ]);

  /**
   * Les sœurs sont dressées ICI, depuis l'arbre : une sœur sans aucun
   * mouvement n'a pas de ligne en base et doit pourtant figurer à zéro —
   * absente, elle se lirait « hors périmètre » quand la vérité est « elle n'a
   * rien encaissé » (règle 15).
   */
  const soeursConnues = arbre
    .filter((e) => e.is_active && e.parent_id === entite.parent_id)
    .map((e) => ({ id: e.id, nom: e.nom, code: e.code }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Finances"
        title="Synthèse"
        description={`Recettes et dépenses de ${entite.nom} par catégorie, leur évolution, et le comparatif de ses pairs.`}
      />

      <SyntheseClient
        categories={synthese.categories}
        soeurs={synthese.soeurs}
        entites={versOptions(
          arbre.filter((e) => e.is_active),
          arbre,
        )}
        entiteId={entite.id}
        entiteNom={entite.nom}
        soeursConnues={soeursConnues}
        annee={annee}
        devise={parametres.devise}
      />
    </div>
  );
}
