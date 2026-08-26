'use client';

import { Check, Loader2, Pencil, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { avertir } from '@/components/shared/messages';
import { Input } from '@/components/ui/input';
import { modifierChampCroyant } from '@/lib/actions/croyants';
import { type ChampEditable, CHAMPS, type OptionChamp } from '@/lib/domain/champ-croyant';
import { appelerAction } from '@/lib/utils/appeler-action';
import { cn } from '@/lib/utils';

/**
 * Corriger UN champ sans quitter la fiche — EF-CRO-01.
 *
 * CE QUE CELA REMPLACE. Rectifier un chiffre mal tapé dans un numéro de
 * téléphone demandait d'ouvrir le formulaire complet, de traverser ses trois
 * étapes et de tout renvoyer. Pour un caractère, c'est une disproportion — et
 * un formulaire qu'on rouvre pour rien est un formulaire où l'on finit par
 * changer autre chose par mégarde.
 *
 * LE CRAYON NE SE MONTRE QU'AU SURVOL, et disparaît sinon. Une fiche est faite
 * pour être LUE : douze crayons alignés en permanence transformeraient une
 * lecture en formulaire, et l'œil devrait les trier avant d'atteindre les
 * valeurs. Au clavier, il reparaît au focus — sinon il n'existerait que pour
 * ceux qui ont une souris.
 *
 * LA VALEUR EST PRÉ-SÉLECTIONNÉE à l'ouverture : on corrige presque toujours en
 * retapant, pas en insérant. C'est un caractère économisé sur chaque
 * correction, et surtout la certitude de ne pas ajouter à la fin de l'ancienne
 * valeur sans l'avoir voulu.
 *
 * TROIS SORTIES, et toutes les trois doivent exister : Entrée valide, Échap
 * abandonne, et la perte de focus abandonne aussi. Un champ ouvert qu'on ne
 * peut refermer qu'en enregistrant force à écrire pour sortir.
 */

export function ChampEditable({
  croyantId,
  champ,
  /** Ce qui s'affiche en lecture. `null` rend la mention « Non renseigné ». */
  affichage,
  /** La valeur BRUTE — celle que l'input ou le select doit porter. */
  brute,
  /** Pour un champ de type `reference` : les options, venues du serveur. */
  options,
  modifiable,
  mono,
}: {
  croyantId: string;
  champ: ChampEditable;
  affichage: string | null;
  brute: string | null;
  options?: readonly OptionChamp[];
  modifiable: boolean;
  mono?: boolean;
}) {
  const router = useRouter();
  const definition = CHAMPS[champ];

  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(brute ?? '');
  const [enCours, setEnCours] = useState(false);
  const champRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  const liste = definition.nature === 'choix' ? definition.options : options;
  const estListe = Boolean(liste);

  /**
   * L'ouverture SÉLECTIONNE — c'est tout l'objet du geste.
   *
   * `select()` n'existe que sur un champ de saisie : un `<select>` n'a rien à
   * sélectionner, il porte déjà sa valeur et s'ouvre au clic.
   */
  useEffect(() => {
    if (!edition) return;
    const noeud = champRef.current;
    if (!noeud) return;

    noeud.focus();
    if (noeud instanceof HTMLInputElement) noeud.select();
  }, [edition]);

  function fermer() {
    setEdition(false);
    // Le brouillon repart de la valeur EN BASE, pas de la dernière frappe :
    // rouvrir après un abandon doit redonner ce que la fiche affiche.
    setBrouillon(brute ?? '');
  }

  async function enregistrer() {
    // Rien n'a changé : on referme sans écrire ni notifier. Une notification
    // « enregistré » sur une valeur identique ferait douter de ce qui a bougé.
    if ((brouillon.trim() || '') === (brute ?? '')) {
      setEdition(false);
      return;
    }

    setEnCours(true);
    const resultat = await appelerAction(() =>
      modifierChampCroyant({ id: croyantId, champ, valeur: brouillon }),
    );
    setEnCours(false);

    if (!resultat.ok) {
      /**
       * LE CHAMP RESTE OUVERT SUR UN REFUS, avec la saisie intacte.
       *
       * Le refermer obligerait à retrouver le crayon et à tout retaper — alors
       * que le message explique précisément ce qu'il faut corriger.
       */
      avertir(resultat.error);
      return;
    }

    setEdition(false);
    toast.success(
      `${definition.label} enregistré${definition.label.endsWith('e') ? 'e' : ''}.`,
    );
    router.refresh();
  }

  if (!edition) {
    return (
      <span className="group/champ flex items-baseline gap-1.5">
        <span
          className={cn(
            'text-sm',
            affichage ? 'text-foreground' : 'text-muted-foreground italic',
            mono && 'font-mono',
          )}
        >
          {affichage ?? 'Non renseigné'}
        </span>

        {modifiable && (
          <button
            type="button"
            onClick={() => setEdition(true)}
            aria-label={`Modifier ${definition.label.toLowerCase()}`}
            title={`Modifier ${definition.label.toLowerCase()}`}
            /*
              INVISIBLE MAIS PRÉSENT : `opacity-0` garde la place du crayon, là
              où `hidden` ferait sauter la ligne d'un pixel à chaque survol.
              `focus-visible` le rend au clavier — sans quoi il n'existerait que
              pour ceux qui ont une souris.
            */
            className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 transition-opacity group-hover/champ:opacity-100 focus-visible:opacity-100"
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      {estListe ? (
        <select
          ref={champRef as React.Ref<HTMLSelectElement>}
          value={brouillon}
          disabled={enCours}
          onChange={(e) => setBrouillon(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') fermer();
          }}
          onBlur={fermer}
          className="border-input bg-card focus-visible:ring-ring h-9 min-w-0 flex-1 rounded-md border px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          {/* Un champ facultatif doit pouvoir SE VIDER : sans cette entrée, on
              ne peut que remplacer une valeur, jamais la retirer. */}
          {definition.facultatif && <option value="">— Aucun</option>}
          {liste!.map((o) => (
            <option key={o.valeur} value={o.valeur}>
              {o.libelle}
            </option>
          ))}
        </select>
      ) : (
        <Input
          ref={champRef as React.Ref<HTMLInputElement>}
          type={definition.nature === 'date' ? 'date' : 'text'}
          value={brouillon}
          disabled={enCours}
          onChange={(e) => setBrouillon(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void enregistrer();
            if (e.key === 'Escape') fermer();
          }}
          /*
            LA PERTE DE FOCUS ABANDONNE, elle n'enregistre pas.
            Enregistrer sur `blur` écrirait au moindre clic ailleurs — y compris
            sur le crayon d'un autre champ — sans que rien n'ait été confirmé.
            `relatedTarget` laisse passer le clic sur la coche, qui est la
            confirmation explicite.
          */
          onBlur={(e) => {
            if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) fermer();
          }}
          className={cn('h-9 min-w-0 flex-1 text-sm', mono && 'font-mono')}
        />
      )}

      <button
        type="button"
        onClick={() => void enregistrer()}
        disabled={enCours}
        aria-label="Enregistrer"
        title="Enregistrer"
        className="text-emerald-700 transition-colors hover:text-emerald-800 disabled:opacity-50"
      >
        {enCours ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Check className="size-4" aria-hidden />
        )}
      </button>

      <button
        type="button"
        onClick={fermer}
        disabled={enCours}
        aria-label="Annuler"
        title="Annuler"
        className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        <X className="size-4" aria-hidden />
      </button>
    </span>
  );
}
