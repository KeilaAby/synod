import type { Metadata } from 'next';
import Link from 'next/link';

import { ClipboardCheck } from 'lucide-react';

import { AccesApplicationDialog } from '@/components/finances/acces-application-dialog';
import { FinancesActionsMenu } from '@/components/finances/finances-actions-menu';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { chargerChiffresPerimetre, getArbrePerimetre } from '@/lib/data/entities';
import { versOptions } from '@/lib/data/entity-options';
import {
  chargerMouvements,
  chargerPeriodesCloses,
  chargerSolde,
  compterMouvementsAValider,
  listerCategoriesFinance,
} from '@/lib/data/finances';
import { signerJustificatifs } from '@/lib/data/photos';
import { getParametres } from '@/lib/data/settings';
import { clePeriode, exigeDelegation } from '@/lib/domain/finance';
import type { EntityType } from '@/lib/domain/hierarchy';
import { detient } from '@/lib/domain/permissions';
import { getSession } from '@/lib/session';
import { formatNombre } from '@/lib/utils/format';

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

  const [mouvements, categories, arbre, parametres, closes, chiffres] =
    await Promise.all([
      chargerMouvements(),
      listerCategoriesFinance(),
      getArbrePerimetre(),
      getParametres(),
      // EF-FIN-26 — les periodes arretees. L'ecran ne fait que les annoncer :
      // le verrou est tenu par `fn_finance_before_write`.
      chargerPeriodesCloses(),
      /**
       * ARB-2 / EF-FIN-05 — combien de titulaires en fonction dans CHAQUE
       * entite. `fn_chiffres_perimetre` (0053) le rend deja pour tout le
       * perimetre en une passe : demander entite par entite couterait un
       * aller-retour par ligne du selecteur (regle 28).
       */
      chargerChiffresPerimetre(),
    ]);

  /**
   * Le solde de l'entite de rattachement : la racine du perimetre (RG-20).
   *
   * Il depend de l'arbre, donc il ne peut pas partir avec les autres — mais il
   * ne coute qu'un aller-retour, et la fonction SQL fait la somme en base.
   */
  const solde = session ? await chargerSolde(session.entityId) : null;

  /**
   * EF-FIN-21 — combien de mouvements attendent une decision.
   *
   * `head: true` : on demande le COMPTE, pas les lignes. La file elle-meme est
   * un autre ecran, et ramener ses mouvements ici pour en afficher le nombre
   * serait le plus cher des affichages.
   */
  const aValider =
    session && detient(session, 'finance.validate')
      ? await compterMouvementsAValider()
      : 0;

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
   * ARB-2 / EF-FIN-05 — QUI N'A PERSONNE POUR TENIR SES ECRITURES.
   *
   * Deux cas, reunis parce qu'ils se ressemblent par ce qui compte : l'entite
   * declaree sans acces, et celle qui a l'acces mais dont aucun bureau n'est
   * encore constitue — un compte suppose un mandat en cours (lot 7), donc pas
   * de bureau signifie aucun operateur.
   *
   * REGLE 24 — un `Record`, pas une `Map` : seul du simple traverse la
   * frontiere serveur → client.
   */
  const exigeDelegationParEntite = Object.fromEntries(
    arbre.map((e) => [
      e.id,
      exigeDelegation({
        sansAccesApplication: e.sans_acces_application,
        membresBureauEnCours: chiffres.get(e.id)?.bureau?.membres ?? 0,
      }),
    ]),
  );

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
          <div className="flex flex-wrap gap-2">
            {/*
              EF-FIN-21 — le renvoi vers la file, et seulement s'il y a
              quelque chose à décider. Un bouton « À valider (0) » demande de
              vérifier qu'il n'y a rien : le faire disparaître le dit déjà.
            */}
            {aValider > 0 && (
              <Button asChild variant="outline" className="h-10">
                <Link href="/finances/a-valider">
                  <ClipboardCheck className="mr-2 size-4" aria-hidden />À valider
                  <span className="bg-foreground text-background ml-2 rounded-full px-2 py-0.5 text-xs tabular-nums">
                    {formatNombre(aValider)}
                  </span>
                </Link>
              </Button>
            )}

            {/* ARB-2 / EF-STR-10 — qui se connecte, et qui ne se connecte
                pas. Le reglage vivait dans la fiche de chaque entite : pour
                savoir lesquelles de ses vingt eglises saisissent elles-memes,
                il fallait ouvrir vingt fiches. */}
            <AccesApplicationDialog
              lignes={arbre
                .filter((e) => e.is_active)
                .map((e) => ({
                  id: e.id,
                  nom: e.nom,
                  code: e.code,
                  type: e.type as EntityType,
                  sansAcces: e.sans_acces_application,
                }))}
            />

            {/* Menu Hamburger consolidé pour Dîmes, Synthèse, Vue consolidée, Clôture et Workflow */}
            <FinancesActionsMenu
              arbreLength={arbre.length}
              entites={versOptions(
                arbre.filter((e) => e.is_active),
                arbre,
              )}
              closes={closes}
              mouvements={mouvements}
              reglages={reglages}
              defautOrganisation={parametres.finance_validation_active}
            />
          </div>
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
        // EF-FIN-26 — des CLÉS, pas des objets : seul du simple traverse la
        // frontière serveur → client (règle 24), et le client en fait un `Set`.
        periodesCloses={closes.map((c) => clePeriode(c.entityId, c.periode))}
        exigeDelegationParEntite={exigeDelegationParEntite}
      />
    </div>
  );
}
