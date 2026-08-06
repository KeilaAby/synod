'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { Field, TextField } from '@/components/shared/field';
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
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { modifierEntite } from '@/lib/actions/entities';
import { ENTITY_LABELS, type EntityType } from '@/lib/domain/hierarchy';
import { creerEntiteSchema } from '@/lib/validation/entity';

import { TypeBadge } from './type-badge';

/**
 * Modification d'une entite sans quitter l'organigramme — EF-STR-01.
 *
 * Le TYPE et le PARENT restent verrouilles : changer de parent est une
 * operation distincte (EF-STR-07), qui deplace tout le sous-arbre et se fait
 * par glissement ou par un trait. Changer de type n'a aucun sens metier — une
 * paroisse ne devient pas un district.
 */

const saisieSchema = creerEntiteSchema.pick({
  nom: true,
  code: true,
  description: true,
  sansAccesApplication: true,
});

type Saisie = z.input<typeof saisieSchema>;

export interface EntiteModifiable {
  id: string;
  nom: string;
  code: string;
  type: EntityType;
  description: string | null;
  sans_acces_application: boolean;
  is_active: boolean;
  nomParent: string | null;
}

/**
 * L'appelant DOIT monter ce composant avec `key={entite.id}`.
 *
 * C'est ainsi que React remet un formulaire a zero quand sa cible change :
 * en le remontant. Resynchroniser les champs depuis un effet declencherait un
 * rendu en cascade a chaque ouverture, pour un resultat identique.
 */
export function EntityEditDialog({
  entite,
  ouvert,
  onOuvertChange,
}: {
  entite: EntiteModifiable;
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [actif, setActif] = useState(entite.is_active);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Saisie>({
    resolver: zodResolver(saisieSchema),
    defaultValues: {
      nom: entite.nom,
      code: entite.code,
      description: entite.description ?? '',
      sansAccesApplication: entite.sans_acces_application,
    },
  });

  async function envoyer(valeurs: Saisie) {
    setErreur(null);

    const resultat = await modifierEntite({
      id: entite.id,
      nom: valeurs.nom,
      code: valeurs.code,
      description: valeurs.description,
      sansAccesApplication: valeurs.sansAccesApplication,
      isActive: actif,
    });

    if (!resultat.ok) {
      for (const [champ, messages] of Object.entries(resultat.fieldErrors ?? {})) {
        if (champ in valeurs) setError(champ as keyof Saisie, { message: messages[0] });
      }
      setErreur(resultat.error);
      return;
    }

    toast.success('Modifications enregistrees.');
    onOuvertChange(false);
    router.refresh();
  }

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent className="max-h-[90vh] w-[min(96vw,56rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Modifier {entite.nom}</DialogTitle>
          <DialogDescription>
            Le rattachement se change par glissement dans l&apos;organigramme, ou en tirant
            un trait depuis la nouvelle entite mere.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(envoyer)} className="space-y-8 py-2" noValidate>
          {erreur && (
            <Alert variant="destructive" role="alert">
              <AlertCircle className="size-4" aria-hidden />
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}

          {/* --- Verrouille : position dans la hierarchie --- */}
          <div className="space-y-4 rounded-md border border-border bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="size-3.5" aria-hidden />
              Position dans la hierarchie
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Type</p>
                <TypeBadge type={entite.type} />
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Rattachee a</p>
                <p className="text-sm font-medium text-foreground">
                  {entite.nomParent ?? 'Racine de la hierarchie'}
                </p>
              </div>
            </div>
          </div>

          {/* --- Identification --- */}
          <section className="space-y-6">
            <p className="eyebrow">Identification</p>

            <div className="grid gap-6 sm:grid-cols-2">
              <TextField
                label="Nom"
                required
                autoFocus
                error={errors.nom?.message}
                {...register('nom')}
              />

              <TextField
                label="Code"
                required
                hint="3 a 16 caracteres, unique dans toute l'application."
                className="[&_input]:font-mono [&_input]:uppercase"
                error={errors.code?.message}
                {...register('code')}
              />
            </div>

            <Field label="Description" error={errors.description?.message}>
              {(aria) => (
                <Textarea
                  {...aria}
                  rows={3}
                  placeholder="Precisions facultatives sur cette entite."
                  {...register('description')}
                />
              )}
            </Field>
          </section>

          <Separator />

          {/* --- Parametres --- */}
          <section className="space-y-6">
            <p className="eyebrow">Parametres</p>

            <Controller
              control={control}
              name="sansAccesApplication"
              render={({ field }) => (
                <label className="flex cursor-pointer items-start gap-4">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="mt-0.5"
                  />
                  <span className="space-y-1">
                    <span className="block text-sm font-medium text-foreground">
                      Cette entite n&apos;a pas acces a l&apos;application
                    </span>
                    {/* ARB-2 : marqueur qui autorise la saisie deleguee. */}
                    <span className="block text-xs text-muted-foreground">
                      Le Siege pourra enregistrer des mouvements financiers pour son compte.
                      Ils resteront identifies comme saisie deleguee.
                    </span>
                  </span>
                </label>
              )}
            />

            <label className="flex cursor-pointer items-start gap-4">
              <Checkbox
                checked={actif}
                onCheckedChange={(v) => setActif(v === true)}
                className="mt-0.5"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-foreground">
                  {ENTITY_LABELS[entite.type].singulier} active
                </span>
                <span className="block text-xs text-muted-foreground">
                  Une entite inactive reste consultable et conserve son historique, mais
                  n&apos;est plus proposee dans les listes de selection.
                </span>
              </span>
            </label>
          </section>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => onOuvertChange(false)}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button type="submit" className="h-10" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
