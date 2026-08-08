'use client';

import { AlertCircle, Loader2, Repeat, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import { Field } from '@/components/shared/field';
import { SelecteurMultiple } from '@/components/shared/selecteur-multiple';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { designerMembre, remplacerMembre } from '@/lib/actions/bureaux';
import type { BureauComplet } from '@/lib/data/bureaux';
import { type FonctionBureau, candidatsEligibles } from '@/lib/domain/bureau';
import { nomComplet } from '@/lib/domain/croyant';

/**
 * Désignation et remplacement d'un membre — EF-BUR-03, EF-BUR-08.
 *
 * UN SEUL COMPOSANT pour les deux gestes : ils ne diffèrent que par ce qui
 * arrive au titulaire précédent. Deux dialogues jumeaux auraient divergé dès la
 * première évolution — et la liste des candidats éligibles, qui porte RG-09,
 * aurait été écrite deux fois.
 *
 * La FONCTION n'est pas choisie ici : elle vient de la ligne d'où part le
 * geste. La redemander laisserait l'écran et la requête diverger.
 */

export interface CandidatOption {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  photoKey: string | null;
  statut: string;
  cheminEglise: string;
}

export function DesignationDialog({
  mode,
  bureau,
  fonctions,
  candidats,
  photos,
  fonctionId,
  membreId,
  ouvert,
  onOuvertChange,
}: {
  mode: 'designer' | 'remplacer';
  bureau: BureauComplet;
  fonctions: FonctionBureau[];
  candidats: CandidatOption[];
  photos: Record<string, string>;
  fonctionId: string;
  membreId?: string;
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
}) {
  const router = useRouter();
  const [choisi, setChoisi] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const fonction = fonctions.find((f) => f.id === fonctionId);
  const cheminEntite = bureau.entite?.path ?? '';

  /** Titulaire actuel, en remplacement : il reste proposable a lui-meme. */
  const occupantActuel = membreId
    ? (bureau.membres.find((m) => m.id === membreId)?.croyant_id ?? null)
    : null;

  /**
   * RG-09 — seuls les croyants du sous-arbre de l'entité sont proposés.
   *
   * Le filtre est appliqué ICI, à la source de la liste : proposer un croyant
   * hors périmètre pour le refuser ensuite ferait passer une règle de structure
   * pour une erreur de saisie.
   */
  const eligibles = useMemo(() => {
    const dejaMembres = new Set(
      bureau.membres.filter((m) => m.date_fin === null).map((m) => m.croyant_id),
    );

    return (
      candidatsEligibles(
        candidats.map((c) => ({
          croyantId: c.id,
          nom: nomComplet(c.nom, c.prenom),
          cheminEglise: c.cheminEglise,
          statut: c.statut,
        })),
        cheminEntite,
      )
        // Un croyant déjà membre de CE bureau ne peut pas y prendre une seconde
        // fonction : le proposer mènerait à un refus certain.
        .filter((c) => !dejaMembres.has(c.croyantId) || c.croyantId === occupantActuel)
        .map((c) => {
          const source = candidats.find((x) => x.id === c.croyantId)!;
          return {
            id: c.croyantId,
            libelle: c.nom,
            detail: source.matricule,
            avatar: (
              <AvatarCroyant
                nom={source.nom}
                prenom={source.prenom}
                url={source.photoKey ? photos[source.photoKey] : null}
              />
            ),
          };
        })
    );
  }, [candidats, bureau.membres, cheminEntite, photos, occupantActuel]);

  const titulaire = membreId
    ? (bureau.membres.find((m) => m.id === membreId)?.croyant ?? null)
    : null;

  function fermer() {
    setChoisi([]);
    setNotes('');
    setErreur(null);
    onOuvertChange(false);
  }

  async function envoyer() {
    const croyantId = choisi[0];
    if (!croyantId) {
      setErreur('Sélectionnez un croyant.');
      return;
    }

    setEnCours(true);
    setErreur(null);

    const resultat =
      mode === 'remplacer' && membreId
        ? await remplacerMembre({ membreId, croyantId, notes })
        : await designerMembre({ bureauId: bureau.id, croyantId, fonctionId, notes });

    setEnCours(false);

    if (!resultat.ok) {
      setErreur(resultat.error);
      return;
    }

    toast.success(
      mode === 'remplacer'
        ? 'Remplacement enregistré. Le mandat précédent est clos.'
        : 'Membre désigné.',
    );
    fermer();
    router.refresh();
  }

  return (
    <Dialog open={ouvert} onOpenChange={(v) => (v ? onOuvertChange(true) : fermer())}>
      <DialogContent className="max-h-[90vh] w-[min(96vw,42rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {mode === 'remplacer' ? 'Remplacer le titulaire' : 'Désigner un titulaire'}
          </DialogTitle>
          <DialogDescription>
            {fonction?.libelle} — {bureau.libelle}, {bureau.entite?.nom}.
            {titulaire &&
              ` Titulaire actuel : ${nomComplet(titulaire.nom, titulaire.prenom)}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {erreur && (
            <Alert variant="destructive" role="alert">
              <AlertCircle className="size-4" aria-hidden />
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}

          <Field
            label={mode === 'remplacer' ? 'Nouveau titulaire' : 'Croyant'}
            required
            hint={
              eligibles.length === 0
                ? "Aucun croyant actif du périmètre de cette entité n'est disponible."
                : 'RG-09 — seuls les croyants rattachés à cette entité ou à l’une de ses sous-entités.'
            }
          >
            {(aria) => (
              <SelecteurMultiple
                {...aria}
                options={eligibles}
                // Un seul titulaire par fonction (RG-08) : le choix précédent
                // est remplacé plutôt qu'ajouté.
                valeurs={choisi}
                onChange={(v) => setChoisi(v.slice(-1))}
                placeholder="Rechercher un croyant"
                rechercheMessage="Nom, prénom ou matricule…"
                emptyMessage="Aucun croyant éligible."
              />
            )}
          </Field>

          <Field label="Note" hint="Facultatif — précision sur la désignation.">
            {(aria) => (
              <Textarea
                {...aria}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Élu en assemblée du 12 janvier…"
              />
            )}
          </Field>

          {mode === 'remplacer' && (
            <p className="text-muted-foreground rounded-md bg-slate-50 p-3 text-xs">
              Le mandat du titulaire actuel sera clos à ce jour et conservé dans
              l&apos;historique. La fonction ne devient pas vacante : le remplaçant prend
              le relais immédiatement.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={fermer} disabled={enCours}>
            Annuler
          </Button>
          <Button
            className="h-10"
            onClick={envoyer}
            disabled={enCours || choisi.length === 0}
          >
            {enCours ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : mode === 'remplacer' ? (
              <Repeat className="mr-2 size-4" aria-hidden />
            ) : (
              <UserPlus className="mr-2 size-4" aria-hidden />
            )}
            {mode === 'remplacer' ? 'Remplacer' : 'Désigner'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
