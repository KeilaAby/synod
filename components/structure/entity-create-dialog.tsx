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
import { Textarea } from '@/components/ui/textarea';
import { creerEntite } from '@/lib/actions/entities';
import {
  ENTITY_LABELS,
  type EntityType,
  gabaritCode,
  typeEnfantDe,
} from '@/lib/domain/hierarchy';
import { creerEntiteSchema } from '@/lib/validation/entity';

import { TypeBadge } from './type-badge';

/**
 * Creation d'une sous-entite depuis l'organigramme — EF-STR-01.
 *
 * Le TYPE et le PARENT sont DEDUITS du noeud d'ou part le geste : cliquer
 * « Nouvelle structure » sur un District ne peut produire qu'une Paroisse
 * rattachee a ce District. Les deux champs sont donc affiches verrouilles
 * plutot que masques — l'utilisateur doit VOIR ce qui a ete decide pour lui,
 * sinon il se demande ou est passe le choix.
 *
 * RG-01 devient ainsi structurellement inviolable : il n'existe aucun chemin
 * d'interface produisant un rattachement incoherent.
 */

export interface ParentCible {
  id: string;
  nom: string;
  code: string;
  type: EntityType;
}

// Le CODE n'est plus saisi : la base l'attribue (`PAR-0007`).
const saisieSchema = creerEntiteSchema.pick({
  nom: true,
  description: true,
  sansAccesApplication: true,
});

/**
 * Champs reellement saisis : le type et le parent sont deduits.
 *
 * `z.input` et non `z.output` : le formulaire manipule les valeurs AVANT
 * transformation, ou `sansAccesApplication` est encore facultatif du fait de
 * son `.default(false)`.
 */
type Saisie = z.input<typeof saisieSchema>;

export function EntityCreateDialog({
  parent,
  ouvert,
  onOuvertChange,
}: {
  parent: ParentCible | null;
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);

  const typeEnfant = parent ? typeEnfantDe(parent.type) : null;

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Saisie>({
    resolver: zodResolver(saisieSchema),
    defaultValues: { nom: '', description: '', sansAccesApplication: false },
  });

  // Une Cellule est une feuille : rien a creer en dessous (RG-01).
  if (!parent || !typeEnfant) return null;

  async function envoyer(valeurs: Saisie) {
    setErreur(null);

    const resultat = await creerEntite({
      ...valeurs,
      type: typeEnfant,
      parentId: parent!.id,
    });

    if (!resultat.ok) {
      for (const [champ, messages] of Object.entries(resultat.fieldErrors ?? {})) {
        if (champ in valeurs) setError(champ as keyof Saisie, { message: messages[0] });
      }
      setErreur(resultat.error);
      return;
    }

    toast.success(`${ENTITY_LABELS[typeEnfant!].singulier} creee.`);
    reset();
    onOuvertChange(false);
    router.refresh();
  }

  return (
    <Dialog
      open={ouvert}
      onOpenChange={(v) => {
        if (!v) {
          reset();
          setErreur(null);
        }
        onOuvertChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] w-[min(96vw,56rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Nouvelle structure</DialogTitle>
          <DialogDescription>
            Sous « {parent.nom} ». Le niveau et le rattachement sont determines par la
            position dans la hierarchie.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(envoyer)} className="space-y-8 py-2" noValidate>
          {erreur && (
            <Alert variant="destructive" role="alert">
              <AlertCircle className="size-4" aria-hidden />
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}

          {/* --- Champs deduits, verrouilles --- */}
          <div className="space-y-4 rounded-md border border-border bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="size-3.5" aria-hidden />
              Determine par la hierarchie
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Type</p>
                <TypeBadge type={typeEnfant} />
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Rattachee a</p>
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {parent.nom}
                  <span className="font-mono text-xs text-muted-foreground">
                    {parent.code}
                  </span>
                </p>
              </div>

              {/* EF-STR-02 — le code n'est plus saisi : la base l'attribue. */}
              <div className="space-y-1 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Code</p>
                <p className="font-mono text-sm text-muted-foreground">
                  {gabaritCode(typeEnfant)} — attribue a l&apos;enregistrement
                </p>
              </div>
            </div>
          </div>

          {/* --- Champs saisis --- */}
          <TextField
            label="Nom"
            required
            autoFocus
            placeholder={`${ENTITY_LABELS[typeEnfant].singulier} …`}
            error={errors.nom?.message}
            {...register('nom')}
          />

          <Field label="Description" error={errors.description?.message}>
            {(aria) => (
              <Textarea
                {...aria}
                rows={2}
                placeholder="Facultatif."
                {...register('description')}
              />
            )}
          </Field>

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
                    Sans acces a l&apos;application
                  </span>
                  {/* ARB-2 : marqueur qui autorise la saisie financiere deleguee. */}
                  <span className="block text-xs text-muted-foreground">
                    Le Siege pourra saisir les mouvements financiers pour son compte.
                  </span>
                </span>
              </label>
            )}
          />

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
              Creer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
