'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useSession } from '@/components/shared/session-provider';
import { supprimerEntite } from '@/lib/actions/entities';
import { formatNombre } from '@/lib/utils/format';

import type { EntiteFlux } from './entite';
import { EntityCreateDialog, type ParentCible } from './entity-create-dialog';
import { EntityDetailDialog } from './entity-detail-dialog';
import { EntityEditDialog } from './entity-edit-dialog';

/**
 * Le CRUD d'entite en pop-up, partage par l'organigramme et la vue liste —
 * EF-STR-01, EF-STR-06, EF-STR-08.
 *
 * Consulter ou modifier une entite ne doit jamais faire QUITTER la vue : dans
 * l'organigramme on perdrait la branche en cours, dans la liste on perdrait
 * les filtres et la position de defilement. Les deux vues partagent donc le
 * meme jeu de dialogues, et les pages `/structure/[id]` restent disponibles
 * pour le lien profond et le partage.
 *
 * Le hook renvoie ses dialogues sous forme de noeud a poser en fin de rendu :
 * c'est ce qui evite de dupliquer quatre montages de pop-up par vue.
 */
export function useEntityDialogs(entites: readonly EntiteFlux[]) {
  const router = useRouter();
  const { peut } = useSession();

  const [parentPourCreation, setParentPourCreation] = useState<ParentCible | null>(null);
  const [aConsulter, setAConsulter] = useState<EntiteFlux | null>(null);
  const [aModifier, setAModifier] = useState<EntiteFlux | null>(null);
  const [aSupprimer, setASupprimer] = useState<EntiteFlux | null>(null);

  const parId = useMemo(() => new Map(entites.map((e) => [e.id, e])), [entites]);

  const ouvrirFiche = useCallback(
    (id: string) => {
      const entite = parId.get(id);
      if (entite) setAConsulter(entite);
    },
    [parId],
  );

  const modifier = useCallback(
    (id: string) => {
      const entite = parId.get(id);
      if (entite) {
        // La fiche se referme d'abord : deux dialogues empiles se disputeraient
        // le focus et le verrou de defilement.
        setAConsulter(null);
        setAModifier(entite);
      }
    },
    [parId],
  );

  const creerEnfant = useCallback(
    (id: string) => {
      const entite = parId.get(id);
      if (entite) {
        setAConsulter(null);
        setParentPourCreation({
          id: entite.id,
          nom: entite.nom,
          code: entite.code,
          type: entite.type,
        });
      }
    },
    [parId],
  );

  const demanderSuppression = useCallback(
    (id: string) => {
      const entite = parId.get(id);
      if (entite) {
        setAConsulter(null);
        setASupprimer(entite);
      }
    },
    [parId],
  );

  const dialogues = (
    <>
      {/* --- Creation : type et parent deduits du noeud d'origine --- */}
      <EntityCreateDialog
        parent={parentPourCreation}
        ouvert={parentPourCreation !== null}
        onOuvertChange={(v) => !v && setParentPourCreation(null)}
      />

      {/* --- Consultation --- */}
      <EntityDetailDialog
        entite={aConsulter}
        toutes={entites}
        peutModifier={aConsulter ? peut('entity.update', aConsulter.path) : false}
        ouvert={aConsulter !== null}
        onOuvertChange={(v) => !v && setAConsulter(null)}
        onModifier={modifier}
        onCreerEnfant={creerEnfant}
      />

      {/* --- Modification ---
          `key` sur l'identifiant : c'est le remontage qui reamorce les champs
          quand on passe d'une entite a une autre. */}
      {aModifier && (
        <EntityEditDialog
          key={aModifier.id}
          entite={{
            id: aModifier.id,
            nom: aModifier.nom,
            code: aModifier.code,
            type: aModifier.type,
            description: aModifier.description,
            sans_acces_application: aModifier.sans_acces_application,
            is_active: aModifier.is_active,
            nomParent: aModifier.parent_id
              ? (parId.get(aModifier.parent_id)?.nom ?? null)
              : null,
          }}
          ouvert
          onOuvertChange={(v) => !v && setAModifier(null)}
        />
      )}

      {/* --- Suppression --- */}
      {aSupprimer && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setASupprimer(null)}
          // ENF-UTI-04 : la confirmation NOMME l'objet concerne.
          title={`Supprimer « ${aSupprimer.nom} » ?`}
          description={
            aSupprimer.nbEnfants > 0
              ? `Cette entite contient ${formatNombre(aSupprimer.nbEnfants)} sous-entite(s). La suppression sera refusee : deplacez-les ou desactivez cette entite.`
              : "L'entite sera placee en corbeille et pourra etre restauree."
          }
          confirmLabel="Supprimer"
          onConfirm={async () => {
            const resultat = await supprimerEntite({ id: aSupprimer.id });
            setASupprimer(null);
            if (!resultat.ok) {
              toast.error(resultat.error);
              return;
            }
            toast.success('Entite placee en corbeille.');
            router.refresh();
          }}
        />
      )}
    </>
  );

  return {
    parId,
    ouvrirFiche,
    modifier,
    creerEnfant,
    demanderSuppression,
    dialogues,
  };
}
