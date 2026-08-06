'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { Field, TextField } from '@/components/shared/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { creerEntite, modifierEntite } from '@/lib/actions/entities';
import { ENTITY_LABELS, type EntityType, typeParentDe } from '@/lib/domain/hierarchy';
import { type CreerEntiteInput, creerEntiteSchema } from '@/lib/validation/entity';

import { EntityPicker, type OptionEntite } from './entity-picker';

/**
 * Formulaire d'entite — EF-STR-01, EF-STR-02.
 *
 * Le TYPE est choisi en premier, et la liste des parents est alors restreinte
 * au seul niveau valide (RG-01). L'erreur « une Eglise ne peut pas etre
 * rattachee a un District » devient impossible a commettre, au lieu d'etre
 * rattrapee apres coup par un message.
 *
 * Un SEUL schema pilote le formulaire, y compris en modification : faire
 * dependre le resolver du mode produirait un type union impraticable. Le
 * serveur, lui, valide avec le schema exact de l'operation demandee.
 */

interface Commun {
  /** Entites du perimetre, filtrees ensuite selon le type choisi. */
  parents: OptionEntite[];
  /** Types que l'utilisateur peut effectivement creer. */
  typesDisponibles: EntityType[];
}

interface EntiteExistante {
  id: string;
  type: EntityType;
  code: string;
  nom: string;
  description: string | null;
  sans_acces_application: boolean;
  is_active: boolean;
}

type Props =
  | ({ mode: 'creation'; parentImpose?: string } & Commun)
  | ({ mode: 'modification'; entite: EntiteExistante } & Commun);

export function EntityForm(props: Props) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);

  const enCreation = props.mode === 'creation';
  const existante = props.mode === 'modification' ? props.entite : null;

  // `is_active` vit hors du formulaire : l'ajouter au schema de creation le
  // polluerait pour un champ qui n'existe qu'en modification.
  const [actif, setActif] = useState(existante?.is_active ?? true);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreerEntiteInput>({
    resolver: zodResolver(creerEntiteSchema),
    defaultValues: {
      type: existante?.type ?? props.typesDisponibles[0],
      code: existante?.code ?? '',
      nom: existante?.nom ?? '',
      // En modification, le parent ne se change pas ici (voir « Rattacher »).
      parentId: existante ? null : (props.mode === 'creation' ? props.parentImpose : null) ?? null,
      description: existante?.description ?? '',
      sansAccesApplication: existante?.sans_acces_application ?? false,
    },
  });

  // `useWatch` plutot que `watch()` : ce dernier retourne une fonction non
  // memoisable, que le compilateur React refuse d'optimiser.
  const typeChoisi = useWatch({ control, name: 'type' }) as EntityType | undefined;

  // RG-01 : seuls les parents du niveau immediatement superieur sont proposes.
  const parentsValides = useMemo(() => {
    if (!typeChoisi) return [];
    const typeAttendu = typeParentDe(typeChoisi);
    if (!typeAttendu) return [];
    return props.parents.filter((p) => p.type === typeAttendu);
  }, [typeChoisi, props.parents]);

  /** Les erreurs de champ reviennent se poser sur le champ fautif (ENF-UTI-05). */
  function traiterEchec(
    echec: { error: string; fieldErrors?: Record<string, string[]> },
    valeurs: CreerEntiteInput,
  ) {
    for (const [champ, messages] of Object.entries(echec.fieldErrors ?? {})) {
      if (champ in valeurs) {
        setError(champ as keyof CreerEntiteInput, { message: messages[0] });
      }
    }
    setErreur(echec.error);
  }

  async function envoyer(valeurs: CreerEntiteInput) {
    setErreur(null);

    // Les deux branches sont ecrites separement : `creerEntite` retourne un
    // identifiant, `modifierEntite` non. Les fusionner produirait une union
    // dont TypeScript ne peut extraire `data.id`.
    if (existante) {
      const resultat = await modifierEntite({
        id: existante.id,
        code: valeurs.code,
        nom: valeurs.nom,
        description: valeurs.description,
        sansAccesApplication: valeurs.sansAccesApplication,
        isActive: actif,
      });

      if (!resultat.ok) return traiterEchec(resultat, valeurs);

      toast.success('Modifications enregistrees.');
      router.push(`/structure/${existante.id}`);
    } else {
      const resultat = await creerEntite(valeurs);

      if (!resultat.ok) return traiterEchec(resultat, valeurs);

      toast.success('Entite creee.');
      router.push(`/structure/${resultat.data.id}`);
    }

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

      {enCreation && (
        <Card>
          <CardContent className="space-y-6 p-6">
            <p className="eyebrow">Position dans la hierarchie</p>

            <div className="grid gap-6 md:grid-cols-2">
              <Field label="Type" required error={errors.type?.message}>
                {(aria) => (
                  <Controller
                    control={control}
                    name="type"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={(valeur) => {
                          field.onChange(valeur);
                          // Le parent precedent devient invalide des que le
                          // niveau change : on le remet a zero.
                          setValue('parentId', null);
                        }}
                      >
                        <SelectTrigger {...aria} className="h-10 w-full">
                          <SelectValue placeholder="Choisir un type" />
                        </SelectTrigger>
                        <SelectContent>
                          {props.typesDisponibles.map((type) => (
                            <SelectItem key={type} value={type}>
                              {ENTITY_LABELS[type].singulier}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                )}
              </Field>

              <Field
                label="Rattachee a"
                required
                error={errors.parentId?.message}
                hint={
                  typeChoisi && typeParentDe(typeChoisi)
                    ? `Seuls les ${ENTITY_LABELS[typeParentDe(typeChoisi)!].pluriel.toLowerCase()} sont proposes.`
                    : undefined
                }
              >
                {(aria) => (
                  <Controller
                    control={control}
                    name="parentId"
                    render={({ field }) => (
                      <EntityPicker
                        {...aria}
                        options={parentsValides}
                        value={field.value}
                        onChange={field.onChange}
                        emptyMessage="Aucun parent disponible a ce niveau."
                      />
                    )}
                  />
                )}
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-6 p-6">
          <p className="eyebrow">Identification</p>

          <div className="grid gap-6 md:grid-cols-2">
            <TextField
              label="Nom"
              required
              placeholder="District Avaradrano"
              error={errors.nom?.message}
              {...register('nom')}
            />

            <TextField
              label="Code"
              required
              placeholder="DIS-AVA"
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

          {existante && (
            <label className="flex cursor-pointer items-start gap-4 border-t border-border pt-6">
              <Checkbox
                checked={actif}
                onCheckedChange={(v) => setActif(v === true)}
                className="mt-0.5"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-foreground">
                  Entite active
                </span>
                <span className="block text-xs text-muted-foreground">
                  Une entite inactive reste consultable et conserve son historique, mais
                  n&apos;est plus proposee dans les listes de selection.
                </span>
              </span>
            </label>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline" className="h-10">
          <Link href={existante ? `/structure/${existante.id}` : '/structure'}>Annuler</Link>
        </Button>

        {/* UI-16 : spinner sur une ACTION ponctuelle. */}
        <Button type="submit" className="h-10" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
          {existante ? 'Enregistrer' : "Creer l'entite"}
        </Button>
      </div>
    </form>
  );
}
