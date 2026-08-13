import type { Metadata } from 'next';

import { WorkflowDialog } from '@/components/finances/workflow-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { getArbrePerimetre } from '@/lib/data/entities';
import { versOptions } from '@/lib/data/entity-options';
import {
  chargerMouvements,
  chargerSolde,
  listerCategoriesFinance,
} from '@/lib/data/finances';
import { signerJustificatifs } from '@/lib/data/photos';
import { getParametres } from '@/lib/data/settings';
import { getSession } from '@/lib/session';

import { FinancesClient } from './finances-client';

export const metadata: Metadata = { title: 'Finances' };

/**
 * EF-FIN-01 a 13 — mouvements financiers et soldes.
 *
 * TOUT PART EN PARALLELE. Cinq lectures enchainees, c'est cinq fois 0,5 a 4
 * secondes avant le premier pixel utile ; simultanees, c'est le cout de la plus
 * lente (regle 28).
 *
 * La DEVISE et la separation saisie/validation sont lues a CHAQUE rendu, jamais
 * codees en dur : les changer dans les parametres doit changer ce que cet ecran
 * montre, sans qu'on touche au code (regle 21).
 */
export default async function FinancesPage() {
  const session = await getSession();

  const [mouvements, categories, arbre, parametres] = await Promise.all([
    chargerMouvements(),
    listerCategoriesFinance(),
    getArbrePerimetre(),
    getParametres(),
  ]);

  /**
   * Le solde de l'entite de rattachement : la racine du perimetre (RG-20).
   *
   * Il depend de l'arbre, donc il ne peut pas partir avec les autres — mais il
   * ne coute qu'un aller-retour, et la fonction SQL fait la somme en base.
   */
  const solde = session ? await chargerSolde(session.entityId) : null;

  /**
   * EF-FIN-07 — les pieces justificatives, signees EN UNE FOIS.
   *
   * Les URL signees ne sont JAMAIS persistees (regle 11) : elles se fabriquent
   * a l'affichage et expirent. Signer piece par piece couterait un aller-retour
   * par ligne de la liste.
   */
  const justificatifs = await signerJustificatifs(
    mouvements.map((m) => m.justificatif_key),
  );

  const racine = arbre.find((e) => e.id === session?.entityId) ?? arbre[0] ?? null;

  /**
   * EF-FIN-15 — le reglage du workflow, entite par entite.
   *
   * Derive de l'arbre DEJA CHARGE : depuis que l'heritage a disparu, l'effectif
   * vaut « ce que l'entite a decide, sinon le defaut de l'organisation ». Aucune
   * requete supplementaire — interroger la base pour chaque entite aurait coute
   * un aller-retour par ligne (regle 28).
   */
  const reglages = arbre
    .filter((e) => e.is_active)
    .map((e) => ({
      entiteId: e.id,
      nom: e.nom,
      code: e.code,
      type: e.type,
      niveau: e.niveau,
      decide: e.finance_validation_active ?? null,
      effectif: e.finance_validation_active ?? parametres.finance_validation_active,
    }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Gestion"
        title="Finances"
        description={
          racine
            ? `Recettes, dépenses et solde de ${racine.nom} et de son périmètre.`
            : 'Recettes, dépenses et solde de votre périmètre.'
        }
        actions={
          <WorkflowDialog
            lignes={reglages}
            defautOrganisation={parametres.finance_validation_active}
          />
        }
      />

      <FinancesClient
        mouvements={mouvements}
        categories={categories}
        entites={versOptions(
          // RG-21 — une cellule n'a pas de compte, mais elle a des finances :
          // c'est justement le cas d'usage de la saisie déléguée (EF-FIN-05).
          arbre.filter((e) => e.is_active),
          arbre,
        )}
        solde={solde}
        entiteRacine={racine ? { id: racine.id, nom: racine.nom } : null}
        devise={parametres.devise}
        justificatifs={Object.fromEntries(justificatifs)}
      />
    </div>
  );
}
