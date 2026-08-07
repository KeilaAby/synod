'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { Field, TextField } from '@/components/shared/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { modifierEntite } from '@/lib/actions/entities';
import { ENTITY_LABELS, type EntityType } from '@/lib/domain/hierarchy';
import { modifierEntiteSchema } from '@/lib/validation/entity';

import { TypeBadge } from './type-badge';

/**
 * Modification d'une entite en pleine page — EF-STR-01, EF-STR-02.
 *
 * Ce formulaire ne CREE plus : depuis la suppression de `/structure/nouveau`,
 * la creation passe exclusivement par `EntityCreateDialog`, ou le type et le
 * rattachement sont deduits du geste d'origine. Deux formulaires de creation
 * auraient divergé — le champ Code n'avait deja ete retire que de l'un.
 *
 * Le TYPE et le PARENT ne se modifient pas ici : changer de parent deplace tout
 * le sous-arbre (EF-STR-07, « Rattacher ») et merite sa propre confirmation ;
 * changer de type n'a aucun sens metier — une paroisse ne devient pas un
 * district.
 */

export interface EntiteExistante {
  id: string;
  type: EntityType;
  code: string;
  nom: string;
  description: string | null;
  sans_acces_application: boolean;
  is_active: boolean;
}

/** `is_active` est pilote par sa propre case, hors du schema partage. */
const saisieSchema = modifierEntiteSchema.omit({ id: true, isActive: true });

type Saisie = z.input<typeof saisieSchema>;

export function EntityForm({ entite }: { entite: EntiteExistante }) {
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
      code: entite.code,
      nom: entite.nom,
      description: entite.description ?? '',
      sansAccesApplication: entite.sans_acces_application,
    },
  });

  async function envoyer(valeurs: Saisie) {
    setErreur(null);

    const resultat = await modifierEntite({ ...valeurs, id: entite.id, isActive: actif });

    if (!resultat.ok) {
      // Les erreurs de champ reviennent se poser sur le champ fautif (ENF-UTI-05).
      for (const [champ, messages] of Object.entries(resultat.fieldErrors ?? {})) {
        if (champ in valeurs) setError(champ as keyof Saisie, { message: messages[0] });
      }
      setErreur(resultat.error);
      return;
    }

    toast.success('Modifications enregistrees.');
    router.push(`/structure/${entite.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(envoyer)} className="space-y-8" noValidate>
      {erreur && (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="flex items-center justify-between gap-4">
            <p className="eyebrow">Identification</p>
            <TypeBadge type={entite.type} />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <TextField
              label="Nom"
              required
              placeholder={`${ENTITY_LABELS[entite.type].singulier} …`}
              error={errors.nom?.message}
              {...register('nom')}
            />

            {/*
              Le code a ete attribue par la base a la creation. Il reste
              modifiable ici, et seulement ici : pour reprendre un code
              historique venu d'un registre papier.
            */}
            <TextField
              label="Code"
              required
              hint="3 a 16 caracteres. Unique dans toute l'application."
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-6 p-6">
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
                  {/* ARB-2 : c'est ce marqueur qui autorise la saisie deleguee. */}
                  <span className="block text-xs text-muted-foreground">
                    Le Siege pourra enregistrer des mouvements financiers pour son compte.
                    Ils resteront identifies comme saisie deleguee.
                  </span>
                </span>
              </label>
            )}
          />

          <label className="flex cursor-pointer items-start gap-4 border-t border-border pt-6">
            <Checkbox
              checked={actif}
              onCheckedChange={(v) => setActif(v === true)}
              className="mt-0.5"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-foreground">Entite active</span>
              <span className="block text-xs text-muted-foreground">
                Une entite inactive reste consultable et conserve son historique, mais
                n&apos;est plus proposee dans les listes de selection.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline" className="h-10">
          <Link href={`/structure/${entite.id}`}>Annuler</Link>
        </Button>

        {/* UI-16 : spinner sur une ACTION ponctuelle. */}
        <Button type="submit" className="h-10" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
