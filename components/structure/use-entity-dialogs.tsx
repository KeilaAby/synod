'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { avertir } from '@/components/shared/messages';
import { BureauxEntiteDialog } from '@/components/bureaux/bureaux-entite-dialog';
import { MandatDialog } from '@/components/bureaux/mandat-dialog';
import {
  NouveauCroyantDialog,
  type OptionsCroyant,
} from '@/components/croyants/croyant-dialog';
import type { RattachementImpose } from '@/components/croyants/croyant-form';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useSession } from '@/components/shared/session-provider';
import {
  type CompositionEntite,
  chargerCompositionEntite,
} from '@/lib/actions/bureaux';
import { supprimerEntite } from '@/lib/actions/entities';
import type { ApercuBureaux } from '@/lib/data/bureaux';
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
export function useEntityDialogs(
  entites: readonly EntiteFlux[],
  /** EF-BUR-01 — bureaux actifs par entite, pour les entrees « bureau » du menu. */
  apercuBureaux: ApercuBureaux = {},
  /**
   * EF-CRO-01 — referentiels du formulaire de croyant. Absents, l'entree
   * « Ajouter un croyant » ne s'affiche pas : mieux vaut pas d'entree qu'une
   * entree qui ouvre un formulaire sans grades ni nationalites.
   */
  optionsCroyant?: OptionsCroyant,
) {
  const router = useRouter();
  const { peut } = useSession();

  const [parentPourCreation, setParentPourCreation] = useState<ParentCible | null>(null);
  const [aConsulter, setAConsulter] = useState<EntiteFlux | null>(null);
  const [aModifier, setAModifier] = useState<EntiteFlux | null>(null);
  const [aSupprimer, setASupprimer] = useState<EntiteFlux | null>(null);

  /** Creation d'un bureau depuis le menu — l'entite est deja designee. */
  const [bureauACreer, setBureauACreer] = useState<EntiteFlux | null>(null);

  /** EF-CRO-01 — enregistrement d'un croyant depuis une eglise ou une cellule. */
  const [croyantAAjouter, setCroyantAAjouter] = useState<RattachementImpose | null>(null);

  /**
   * Consultation ou composition. `contexte` est `null` pendant le chargement :
   * c'est ce qui declenche le squelette. Charger dans le GESTIONNAIRE et non
   * dans un effet evite un aller-retour d'etat — au clic, on sait deja ce qu'on
   * veut afficher.
   */
  const [bureauxOuverts, setBureauxOuverts] = useState<{
    entite: EntiteFlux;
    /** Bureau a composer d'emblee : sortie de creation, ou bureau sans membre. */
    bureauInitial?: string;
    contexte: CompositionEntite | null;
    erreur: string | null;
  } | null>(null);

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

  /**
   * Charge la composition d'une entite et l'affiche. Deux ecritures d'etat
   * encadrent l'attente : la premiere ouvre le pop-up sur son squelette, la
   * seconde le remplit. Sans la premiere, le clic resterait sans effet visible
   * le temps de l'aller-retour.
   */
  const chargerBureaux = useCallback(
    async (entite: EntiteFlux, bureauInitial?: string) => {
      // Un RECHARGEMENT — apres une designation — conserve ce qui est deja a
      // l'ecran : remettre le squelette ferait clignoter une composition que
      // l'utilisateur est en train de lire.
      setBureauxOuverts((precedent) =>
        precedent && precedent.entite.id === entite.id
          ? { ...precedent, bureauInitial: bureauInitial ?? precedent.bureauInitial, erreur: null }
          : { entite, bureauInitial, contexte: null, erreur: null },
      );

      const resultat = await chargerCompositionEntite({ entityId: entite.id });

      setBureauxOuverts((precedent) => {
        // L'utilisateur a pu fermer, ou ouvrir une autre entite entre-temps :
        // ecraser son ecran avec une reponse perimee serait pire que rien.
        if (!precedent || precedent.entite.id !== entite.id) return precedent;

        if (!resultat.ok) {
          return { ...precedent, contexte: null, erreur: resultat.error };
        }

        // Un bureau sans titulaire s'ouvre sur sa composition : la liste des
        // membres serait vide, et la seule action utile est d'y nommer.
        const actifs = resultat.data.bureaux.filter((b) => b.is_active);
        const seulEtVide =
          actifs.length === 1 && actifs[0]!.membres.every((m) => m.date_fin !== null)
            ? actifs[0]!.id
            : undefined;

        return {
          ...precedent,
          bureauInitial: precedent.bureauInitial ?? seulEtVide,
          contexte: resultat.data,
          erreur: null,
        };
      });
    },
    [],
  );

  const ouvrirBureaux = useCallback(
    (id: string, action: 'creer' | 'consulter') => {
      const entite = parId.get(id);
      if (!entite) return;

      setAConsulter(null);
      if (action === 'creer') setBureauACreer(entite);
      else void chargerBureaux(entite);
    },
    [parId, chargerBureaux],
  );

  /**
   * RG-04 / RG-05 — le rattachement se DEDUIT de l'entite d'ou part le geste.
   *
   * Sur une cellule, l'eglise est son PARENT : c'est la structure qui le sait,
   * pas l'utilisateur. Le lui redemander apres qu'il a ouvert le menu d'une
   * cellule reviendrait a lui faire ressaisir ce qu'il vient de designer.
   */
  const ajouterCroyant = useCallback(
    (id: string) => {
      const entite = parId.get(id);
      if (!entite) return;

      setAConsulter(null);

      if (entite.type === 'EGLISE') {
        setCroyantAAjouter({ egliseId: entite.id, egliseNom: entite.nom });
        return;
      }

      const eglise = entite.parent_id ? parId.get(entite.parent_id) : undefined;
      // Une cellule sans eglise parente serait une incoherence de structure :
      // mieux vaut ne rien ouvrir que d'ouvrir un formulaire non soumettable.
      if (entite.type === 'CELLULE' && eglise) {
        setCroyantAAjouter({
          egliseId: eglise.id,
          egliseNom: eglise.nom,
          celluleId: entite.id,
          celluleNom: entite.nom,
        });
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

      {/* --- Enregistrement d'un croyant, rattachement verrouille (EF-CRO-01) ---
          Le MEME pop-up en trois etapes que la liste des croyants (regle 16).
          `onCree` remplace la navigation vers la fiche : quitter
          l'organigramme perdrait la branche deployee et le point de depart. */}
      {croyantAAjouter && optionsCroyant && (
        <NouveauCroyantDialog
          key={croyantAAjouter.celluleId ?? croyantAAjouter.egliseId}
          options={optionsCroyant}
          rattachement={croyantAAjouter}
          open
          onOpenChange={(v) => !v && setCroyantAAjouter(null)}
          onCree={() => {
            setCroyantAAjouter(null);
            router.refresh();
          }}
        />
      )}

      {/* --- Ouverture d'un bureau, entite verrouillee (EF-BUR-01) ---
          Le MEME pop-up que l'ecran Bureaux (regle 16). A la creation, on
          enchaine sur la composition : un bureau vide ne renseigne personne. */}
      {bureauACreer && (
        <MandatDialog
          key={bureauACreer.id}
          entites={[]}
          bureauxActifsParEntite={{
            [bureauACreer.id]: (apercuBureaux[bureauACreer.id] ?? []).map((b) => ({
              id: b.id,
              libelle: b.libelle,
            })),
          }}
          entiteImposee={{ id: bureauACreer.id, nom: bureauACreer.nom }}
          open
          onOpenChange={(v) => !v && setBureauACreer(null)}
          onCree={(bureauId) => {
            const entite = bureauACreer;
            setBureauACreer(null);
            void chargerBureaux(entite, bureauId);
          }}
        />
      )}

      {/* --- Membres et composition --- */}
      {bureauxOuverts && (
        <BureauxEntiteDialog
          // Remontage par ENTITE seulement : un rechargement ne doit pas
          // ramener l'utilisateur a la liste alors qu'il compose.
          key={bureauxOuverts.entite.id}
          entite={{ id: bureauxOuverts.entite.id, nom: bureauxOuverts.entite.nom }}
          contexte={bureauxOuverts.contexte}
          erreur={bureauxOuverts.erreur}
          bureauInitial={bureauxOuverts.bureauInitial}
          peutGerer={peut('bureau.manage', bureauxOuverts.entite.path)}
          ouvert
          onOuvertChange={(v) => !v && setBureauxOuverts(null)}
          onRafraichir={() => void chargerBureaux(bureauxOuverts.entite)}
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
              avertir(resultat.error);
              return;
            }
            toast.success('Entite placee en corbeille.');
            router.refresh();
          }}
        />
      )}
    </>
  );

  /** Ce que le menu doit savoir des bureaux, sans rien charger de plus. */
  const etatBureau = useCallback(
    (entite: EntiteFlux) => ({
      bureaux: apercuBureaux[entite.id] ?? [],
      peutGerer: peut('bureau.manage', entite.path),
    }),
    [apercuBureaux, peut],
  );

  /** RG-04 — l'entree n'a de sens qu'ou un croyant peut effectivement etre cree. */
  const peutAjouterCroyant = useCallback(
    (entite: EntiteFlux) =>
      optionsCroyant !== undefined && peut('croyant.create', entite.path),
    [optionsCroyant, peut],
  );

  return {
    parId,
    ouvrirFiche,
    modifier,
    creerEnfant,
    demanderSuppression,
    ouvrirBureaux,
    etatBureau,
    ajouterCroyant,
    peutAjouterCroyant,
    dialogues,
  };
}
