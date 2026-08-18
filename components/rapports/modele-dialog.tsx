'use client';

import { AlertCircle, Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Field, TextField } from '@/components/shared/field';
import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { useSession } from '@/components/shared/session-provider';
import { ICONES_NIVEAU } from '@/components/structure/type-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { creerModele, modifierModele } from '@/lib/actions/rapports';
import { ENTITY_LABELS, ENTITY_TYPES, type EntityType } from '@/lib/domain/hierarchy';
import {
  DESCRIPTIONS_VISIBILITE,
  LIBELLES_VISIBILITE,
  VISIBILITES,
  type VisibiliteModele,
  porteeReserveeAuSiege,
} from '@/lib/domain/rapport';
import { appelerAction } from '@/lib/utils/appeler-action';

/**
 * Créer ET modifier un modèle de rapport — EF-RAP-07, EF-RAP-09, EF-RAP-10.
 *
 * UN SEUL POP-UP pour les deux (règle 16). Ce qu'il règle, c'est la **fiche
 * d'identité** du modèle : son nom, qui le voit, à quels niveaux il se propose.
 * Sa composition — les sections et les blocs — appartient à l'éditeur, et ne
 * traverse jamais ce formulaire : un champ qu'on n'affiche pas mais qu'on
 * envoie arrive vide et efface la donnée (règle 19).
 *
 * L'ENTITÉ PROPRIÉTAIRE NE SE CHOISIT PAS. Une entité compose **pour
 * elle-même** : le propriétaire est son entité de rattachement, que le serveur
 * lit dans la session. Le champ se **lit** donc ici plutôt que de s'ouvrir —
 * un sélecteur laisserait croire qu'on peut composer chez le voisin, et il
 * faudrait le refuser après coup.
 *
 * Le Siège fait exception, et une seule : il pose des modèles **officiels**
 * n'appartenant à aucune entité, proposés à toutes (EF-RAP-08).
 */

export interface ModeleModifiable {
  id: string;
  nom: string;
  description: string | null;
  entityId: string | null;
  /** Le nom vient de la carte : une entité désactivée ne figure plus dans les
   *  options, et le champ afficherait « — » alors qu'elle existe. */
  entiteNom: string;
  niveauxApplicables: EntityType[];
  visibilite: VisibiliteModele;
  estOfficiel: boolean;
}

export function ModeleDialog({
  cheminSiege,
  modele,
  open,
  onOpenChange,
  onCree,
}: {
  /**
   * Chemin ltree du Siège, ou `null` s'il n'est pas dans le périmètre. C'est
   * lui qui décide si « modèle officiel » et la portée globale sont proposés :
   * le critère est ce que le périmètre **contient**, jamais le rôle.
   */
  cheminSiege: string | null;
  /** Mode ÉDITION — le composant est alors piloté par le menu ⋮ de la carte. */
  modele?: ModeleModifiable;
  open?: boolean;
  onOpenChange?: (ouvert: boolean) => void;
  /** EF-RAP-01 — un modèle vide ne produit rien : l'appelant enchaîne. */
  onCree?: (modeleId: string) => void;
}) {
  const router = useRouter();
  const { session: compte, peut } = useSession();
  const edition = modele !== undefined;
  const pilote = open !== undefined;

  const [ouvertInterne, setOuvertInterne] = useState(false);
  const estOuvert = pilote ? open : ouvertInterne;

  const [nom, setNom] = useState(modele?.nom ?? '');
  const [description, setDescription] = useState(modele?.description ?? '');
  const [niveaux, setNiveaux] = useState<EntityType[]>(modele?.niveauxApplicables ?? []);
  const [visibilite, setVisibilite] = useState<VisibiliteModele>(
    modele?.visibilite ?? 'ENTITE',
  );
  const [officiel, setOfficiel] = useState(modele?.estOfficiel ?? false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  /**
   * EF-RAP-08 — poser une trame officielle, ou l'annoncer à toute
   * l'organisation, demande `report.template.manage` **au Siège**.
   *
   * Le masquage n'est qu'un confort : l'action revérifie avec sa portée. Mais
   * proposer une case qui produira un refus est une façon de faire perdre du
   * temps deux fois — à la cocher, puis à comprendre.
   */
  const peutSiege = cheminSiege !== null && peut('report.template.manage', cheminSiege);

  const visibilitesOffertes = VISIBILITES.filter(
    (v) => peutSiege || !porteeReserveeAuSiege(v, false),
  );

  function fermer() {
    if (pilote) {
      onOpenChange?.(false);
      return;
    }
    setOuvertInterne(false);
    setNom('');
    setDescription('');
    setNiveaux([]);
    setVisibilite('ENTITE');
    setOfficiel(false);
    setErreur(null);
  }

  function basculerNiveau(type: EntityType) {
    setNiveaux((actuels) =>
      actuels.includes(type) ? actuels.filter((t) => t !== type) : [...actuels, type],
    );
  }

  async function envoyer() {
    setEnCours(true);
    setErreur(null);

    if (modele) {
      const resultat = await appelerAction(() =>
        modifierModele({
          modeleId: modele.id,
          nom,
          description,
          niveauxApplicables: niveaux,
          visibilite,
        }),
      );
      setEnCours(false);

      if (!resultat.ok) {
        setErreur(resultat.error);
        return;
      }
      toast.success('Modèle modifié.');
      fermer();
      router.refresh();
      return;
    }

    const resultat = await appelerAction(() =>
      creerModele({
        nom,
        description,
        niveauxApplicables: niveaux,
        visibilite,
        estOfficiel: officiel,
      }),
    );
    setEnCours(false);

    if (!resultat.ok) {
      setErreur(resultat.error);
      return;
    }

    toast.success('Modèle créé.');
    fermer();
    router.refresh();

    // EF-RAP-01 — un modèle vide ne produit rien : l'appelant enchaîne sur la
    // composition. Le pop-up ne décide pas de la suite, il la signale.
    onCree?.(resultat.data.id);
  }

  return (
    <>
      {!pilote && (
        <Button className="h-10" onClick={() => setOuvertInterne(true)}>
          <Plus className="mr-2 size-4" aria-hidden />
          Nouveau modèle
        </Button>
      )}

      <Dialog open={estOuvert} onOpenChange={(v) => (v ? setOuvertInterne(true) : fermer())}>
        <DialogContent className="max-h-[90vh] w-[min(96vw,42rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {edition ? 'Modifier le modèle' : 'Nouveau modèle de rapport'}
            </DialogTitle>
            <DialogDescription>
              {edition
                ? 'Le nom, la portée et les niveaux se règlent ici. La composition se modifie dans l’éditeur.'
                : 'Un modèle décrit comment composer un rapport. Sa composition s’assemble ensuite dans l’éditeur.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {erreur && (
              <Alert variant="destructive" role="alert">
                <AlertCircle className="size-4" aria-hidden />
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}

            <TextField
              label="Nom du modèle"
              required
              placeholder="Synthèse trimestrielle de district"
              hint="Ce que le rapport DIT — il se retrouvera dans une bibliothèque."
              value={nom}
              onChange={(e) => setNom(e.target.value)}
            />

            <Field
              label="Description"
              hint="Facultative — à quoi sert ce modèle, et pour qui."
            >
              {(aria) => (
                <Textarea
                  {...aria}
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Présenté au conseil de district à la fin de chaque trimestre."
                />
              )}
            </Field>

            {/* L'entité se LIT, toujours : à la création parce qu'une entité
                compose pour elle-même, en édition parce qu'elle ne se change
                pas. Un champ désactivé mentirait — rien ici ne se saisit. */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">Entité propriétaire</p>
              <p className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                {edition
                  ? modele.estOfficiel
                    ? 'Siège — modèle officiel'
                    : modele.entiteNom
                  : officiel
                    ? 'Siège — modèle officiel, sans entité propriétaire'
                    : compte.entiteNom}
              </p>
              <p className="text-xs text-muted-foreground">
                {edition
                  ? 'Fixée à la création. Pour déplacer ce modèle, dupliquez-le depuis l’autre entité puis archivez celui-ci.'
                  : 'Votre entité de rattachement. Un modèle se compose pour son entité, pas pour une autre.'}
              </p>
            </div>

            {/* EF-RAP-08 — une trame de l'organisation, employée telle quelle. */}
            {!edition && peutSiege && (
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-card p-4">
                <Checkbox
                  checked={officiel}
                  onCheckedChange={(v) => {
                    const coche = v === true;
                    setOfficiel(coche);
                    // Un modèle officiel s'adresse à tous : la portée suit, sans
                    // quoi on poserait une trame officielle que personne ne voit.
                    if (coche) setVisibilite('GLOBAL');
                  }}
                  className="mt-0.5"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium text-foreground">
                    Modèle officiel
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    EF-RAP-08 — mis à disposition de toutes les entités, qui l’emploient
                    tel quel ou le dupliquent pour l’adapter. Il n’appartient alors à
                    aucune entité en particulier.
                  </span>
                </span>
              </label>
            )}

            <Field
              label="Qui voit ce modèle"
              hint={DESCRIPTIONS_VISIBILITE[visibilite]}
            >
              {(aria) => (
                <Select
                  value={visibilite}
                  onValueChange={(v) => setVisibilite(v as VisibiliteModele)}
                  disabled={officiel}
                >
                  <SelectTrigger {...aria} className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {visibilitesOffertes.map((v) => (
                      <SelectItem key={v} value={v}>
                        {LIBELLES_VISIBILITE[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            {/* EF-RAP-10 — ensemble CLOS et connu : des pictogrammes, pas une
                liste déroulante (règle 18). Six niveaux se voient d'un coup
                d'œil et basculent d'un clic. */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">Niveaux concernés</p>
              <GroupeFiltres libelle="Niveaux auxquels ce modèle se propose">
                {ENTITY_TYPES.map((type) => (
                  <FiltreIcone
                    key={type}
                    icone={ICONES_NIVEAU[type]}
                    libelle={ENTITY_LABELS[type].singulier}
                    actif={niveaux.includes(type)}
                    onClick={() => basculerNiveau(type)}
                  />
                ))}
              </GroupeFiltres>
              <p className="text-xs text-muted-foreground">
                {niveaux.length === 0
                  ? 'Aucun niveau coché : le modèle se propose à tous. Ne rien restreindre n’est pas tout refuser.'
                  : `Proposé aux ${niveaux.map((t) => ENTITY_LABELS[t].pluriel.toLowerCase()).join(', ')} uniquement.`}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="h-10" onClick={fermer} disabled={enCours}>
              Annuler
            </Button>
            <Button
              className="h-10"
              onClick={envoyer}
              disabled={enCours || nom.trim().length < 3}
            >
              {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              {edition ? 'Enregistrer' : 'Créer le modèle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
