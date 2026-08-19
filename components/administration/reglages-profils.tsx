'use client';

import { AlertCircle, Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { SelecteurHabilitations } from '@/components/administration/selecteur-habilitations';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { TextField } from '@/components/shared/field';
import { avertir } from '@/components/shared/messages';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { enregistrerProfil, supprimerProfil } from '@/lib/actions/courriel';
import type { ProfilEnregistre } from '@/lib/data/courriel';
import { ALL_PERMISSIONS, type Permission } from '@/lib/domain/permissions';
import { PROFILS_RACCOURCIS } from '@/lib/domain/profils-habilitation';
import { appelerAction } from '@/lib/utils/appeler-action';

/**
 * Les profils de privilèges — EF-ADM-04.
 *
 * DEUX ORIGINES, ET UNE SEULE EST MODIFIABLE. Les cinq profils **fournis**
 * viennent du code : ils décrivent des rôles qu'on retrouve dans toute
 * organisation, et les rendre modifiables les ferait dériver sans qu'on sache
 * plus à quoi « Trésorier » correspond. Ceux qu'on **ajoute** ici sont propres
 * à l'organisation : « Responsable jeunesse », « Chargé des dîmes ».
 *
 * UN PROFIL N'ACCORDE RIEN. Il pose des cases dans le formulaire d'un compte,
 * et c'est ce formulaire qui vérifie droit par droit ce que le délégant peut
 * transmettre. On peut donc définir ici un profil plus large que ce qu'un
 * administrateur de district pourra en tirer : chez lui, le reste restera
 * éteint. C'est aussi pourquoi supprimer un profil ne retire aucun droit à
 * personne — les comptes portent les leurs, un par un.
 */
export function ReglagesProfils({ profils }: { profils: ProfilEnregistre[] }) {
  const [enEdition, setEnEdition] = useState<ProfilEnregistre | 'nouveau' | null>(null);
  const [aSupprimer, setASupprimer] = useState<ProfilEnregistre | null>(null);
  const router = useRouter();

  async function supprimer(profil: ProfilEnregistre) {
    setASupprimer(null);
    const resultat = await appelerAction(() => supprimerProfil({ id: profil.id }));

    if (!resultat.ok) {
      avertir(resultat.error);
      return;
    }
    toast.success('Profil supprimé.');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Profils fournis</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Toujours proposés à l’ouverture d’un compte. Ils ne se modifient pas : ce
              sont des repères communs, et les laisser dériver ferait qu’on ne saurait
              plus à quoi « Trésorier » correspond.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {PROFILS_RACCOURCIS.map((profil) => (
              <li
                key={profil.cle}
                className="rounded-lg border border-dashed border-border p-3"
              >
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ShieldCheck className="size-4 shrink-0 text-slate-400" aria-hidden />
                  {profil.libelle}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{profil.description}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {profil.permissions === null ? (
                    // Il prend tout ce que le délégant peut transmettre — écrire
                    // la liste la ferait vieillir à chaque droit ajouté.
                    'Tout ce que vous pouvez transmettre'
                  ) : (
                    <span className="tabular-nums">
                      {profil.permissions.length} habilitations
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">
                Profils de l’organisation
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Vos propres découpages, proposés à côté des précédents.
              </p>
            </div>
            <Button className="h-10" onClick={() => setEnEdition('nouveau')}>
              <Plus className="mr-2 size-4" aria-hidden />
              Nouveau profil
            </Button>
          </div>

          {profils.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Aucun profil défini"
              description="Les cinq profils fournis suffisent souvent. Ajoutez-en un quand votre organisation a un découpage qui lui est propre."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {profils.map((profil) => (
                <li key={profil.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {profil.nom}
                      </p>
                      {profil.description && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {profil.description}
                        </p>
                      )}
                      <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                        {profil.permissions.length} habilitation
                        {profil.permissions.length > 1 ? 's' : ''}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Modifier ${profil.nom}`}
                        onClick={() => setEnEdition(profil)}
                      >
                        <ShieldCheck className="size-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 hover:text-destructive"
                        aria-label={`Supprimer ${profil.nom}`}
                        onClick={() => setASupprimer(profil)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {enEdition && (
        <ProfilDialog
          key={enEdition === 'nouveau' ? 'nouveau' : enEdition.id}
          profil={enEdition === 'nouveau' ? null : enEdition}
          onFermer={() => setEnEdition(null)}
        />
      )}

      <ConfirmDialog
        open={aSupprimer !== null}
        onOpenChange={(v) => !v && setASupprimer(null)}
        title="Supprimer ce profil ?"
        description={
          aSupprimer
            ? `« ${aSupprimer.nom} » ne sera plus proposé à l’ouverture d’un compte. Les comptes qui en ont bénéficié gardent leurs droits : un profil les pose, il ne les détient pas.`
            : ''
        }
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (aSupprimer) void supprimer(aSupprimer);
        }}
      />
    </div>
  );
}

/**
 * Définir un profil, c'est choisir des droits — le MÊME sélecteur que pour un
 * compte (règle 16). Sans les raccourcis, en revanche : définir un profil à
 * partir d'un autre ferait qu'on ne saurait plus lequel fait autorité.
 *
 * TOUS LES DROITS SONT PROPOSÉS ICI, y compris ceux que l'auteur ne détient
 * pas. Un profil n'accorde rien par lui-même ; c'est le formulaire d'un compte
 * qui filtrera, chez chaque administrateur, selon ce qu'il peut transmettre.
 * Brider la définition reviendrait à interdire au Siège de décrire un profil
 * complet parce qu'un district ne pourrait pas l'appliquer entièrement.
 */
function ProfilDialog({
  profil,
  onFermer,
}: {
  profil: ProfilEnregistre | null;
  onFermer: () => void;
}) {
  const router = useRouter();

  const [nom, setNom] = useState(profil?.nom ?? '');
  const [description, setDescription] = useState(profil?.description ?? '');
  const [accordees, setAccordees] = useState<Permission[]>(
    (profil?.permissions ?? []).filter((p): p is Permission =>
      (ALL_PERMISSIONS as readonly string[]).includes(p),
    ),
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer() {
    setEnCours(true);
    setErreur(null);

    const resultat = await appelerAction(() =>
      enregistrerProfil({
        id: profil?.id ?? null,
        nom,
        description,
        permissions: accordees,
      }),
    );
    setEnCours(false);

    if (!resultat.ok) {
      setErreur(resultat.error);
      return;
    }
    toast.success(profil ? 'Profil modifié.' : 'Profil créé.');
    onFermer();
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onFermer()}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,56rem)] overflow-y-auto sm:max-w-none">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {profil ? `Modifier « ${profil.nom} »` : 'Nouveau profil de privilèges'}
          </DialogTitle>
          <DialogDescription>
            Un profil pose des habilitations d’un clic à l’ouverture d’un compte. Il
            n’accorde rien par lui-même : chaque administrateur ne pourra en tirer que ce
            qu’il détient déjà.
          </DialogDescription>
        </DialogHeader>

        {erreur && (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="size-4" aria-hidden />
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6 py-2">
          <div className="grid gap-6 sm:grid-cols-2">
            <TextField
              label="Nom du profil"
              required
              placeholder="Responsable jeunesse"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
            />
            <TextField
              label="Description"
              hint="À quoi sert ce profil, en une phrase."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <SelecteurHabilitations
            accordees={accordees}
            // Tous les droits existent ici : voir le commentaire ci-dessus.
            delegables={ALL_PERMISSIONS}
            profils={[]}
            onRemplacer={setAccordees}
            onBasculer={(permission, cochee) =>
              setAccordees((actuelles) =>
                cochee
                  ? [...actuelles, permission]
                  : actuelles.filter((p) => p !== permission),
              )
            }
          />
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={onFermer} disabled={enCours}>
            Annuler
          </Button>
          <Button
            className="h-10"
            onClick={envoyer}
            disabled={enCours || nom.trim().length < 2}
          >
            {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            {profil ? 'Enregistrer' : 'Créer le profil'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
