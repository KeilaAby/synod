'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { Field, TextField } from '@/components/shared/field';
import { EntityPicker, type OptionEntite } from '@/components/structure/entity-picker';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { creerCroyant, modifierCroyant } from '@/lib/actions/croyants';
import {
  LIBELLES_SEXE,
  LIBELLES_STATUT_CROYANT,
  LIBELLES_STATUT_MARITAL,
  SEXES,
  STATUTS_CROYANT,
  STATUTS_MARITAUX,
  type StatutCroyant,
} from '@/lib/domain/croyant';
import { croyantSchema, type CroyantInput } from '@/lib/validation/croyant';

/**
 * Formulaire du croyant — EF-CRO-01, ENF-UTI-07 (moins de 90 secondes).
 *
 * Trois sections en carte, jamais un formulaire monolithique : identité,
 * coordonnées, rattachement ecclésial. C'est l'ordre dans lequel on lit une
 * fiche d'état civil, pas l'ordre des colonnes de la table.
 *
 * La liste des cellules est filtrée dynamiquement par l'église choisie
 * (RG-05) : proposer une cellule d'une autre église serait une erreur qu'on
 * ne peut commettre qu'en la rendant possible.
 */

export interface OptionReferentiel {
  id: string;
  libelle: string;
}

export interface CelluleOption {
  id: string;
  nom: string;
  egliseId: string;
}

interface Commun {
  eglises: OptionEntite[];
  cellules: CelluleOption[];
  grades: OptionReferentiel[];
  nationalites: OptionReferentiel[];
}

interface CroyantExistant {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  sexe: 'M' | 'F';
  statut_marital: string | null;
  email: string | null;
  telephone: string | null;
  date_naissance: string;
  date_bapteme: string;
  adresse: string;
  eglise_id: string;
  cellule_id: string | null;
  grade_id: string;
  nationalite_id: string;
  statut: StatutCroyant;
  egliseNom: string;
}

type Props =
  | ({ mode: 'creation'; egliseImposee?: string } & Commun)
  | ({ mode: 'modification'; croyant: CroyantExistant } & Commun);

/** `<input type="date">` attend `YYYY-MM-DD`. */
function jour(valeur: string | Date | undefined): string {
  if (!valeur) return '';
  return new Date(valeur).toISOString().slice(0, 10);
}

export function CroyantForm(props: Props) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [doublonSignale, setDoublonSignale] = useState<string | null>(null);
  const existant = props.mode === 'modification' ? props.croyant : null;
  const [statut, setStatut] = useState<StatutCroyant>(existant?.statut ?? 'ACTIF');

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CroyantInput>({
    resolver: zodResolver(croyantSchema),
    defaultValues: {
      nom: existant?.nom ?? '',
      prenom: existant?.prenom ?? '',
      sexe: existant?.sexe,
      statutMarital: (existant?.statut_marital as CroyantInput['statutMarital']) ?? undefined,
      email: existant?.email ?? '',
      telephone: existant?.telephone ?? '',
      dateNaissance: jour(existant?.date_naissance),
      dateBapteme: jour(existant?.date_bapteme),
      adresse: existant?.adresse ?? '',
      egliseId:
        existant?.eglise_id ??
        (props.mode === 'creation' ? props.egliseImposee : undefined) ??
        undefined,
      celluleId: existant?.cellule_id ?? null,
      gradeId: existant?.grade_id ?? undefined,
      nationaliteId: existant?.nationalite_id ?? undefined,
      doublonAccepte: false,
    } as Partial<CroyantInput> as CroyantInput,
  });

  const egliseChoisie = useWatch({ control, name: 'egliseId' });

  // RG-05 — seules les cellules de l'église retenue sont proposées.
  const cellulesDisponibles = useMemo(
    () => props.cellules.filter((c) => c.egliseId === egliseChoisie),
    [props.cellules, egliseChoisie],
  );

  function traiterEchec(
    echec: { error: string; fieldErrors?: Record<string, string[]> },
    valeurs: CroyantInput,
  ) {
    for (const [champ, messages] of Object.entries(echec.fieldErrors ?? {})) {
      if (champ === 'doublon') {
        // EF-CRO-13 — avertissement, pas blocage : la décision revient à l'utilisateur.
        setDoublonSignale(echec.error);
        return;
      }
      if (champ in valeurs) {
        setError(champ as keyof CroyantInput, { message: messages[0] });
      }
    }
    setErreur(echec.error);
  }

  async function envoyer(valeurs: CroyantInput) {
    setErreur(null);

    if (existant) {
      const resultat = await modifierCroyant({
        id: existant.id,
        nom: valeurs.nom,
        prenom: valeurs.prenom,
        sexe: valeurs.sexe,
        statutMarital: valeurs.statutMarital ?? null,
        email: valeurs.email,
        telephone: valeurs.telephone,
        dateNaissance: valeurs.dateNaissance,
        dateBapteme: valeurs.dateBapteme,
        adresse: valeurs.adresse,
        celluleId: valeurs.celluleId ?? null,
        gradeId: valeurs.gradeId,
        nationaliteId: valeurs.nationaliteId,
        statut,
      });

      if (!resultat.ok) return traiterEchec(resultat, valeurs);

      toast.success('Fiche mise à jour.');
      router.push(`/croyants/${existant.id}`);
    } else {
      const resultat = await creerCroyant(valeurs);
      if (!resultat.ok) return traiterEchec(resultat, valeurs);

      toast.success(`Croyant enregistré — matricule ${resultat.data.matricule}.`);
      router.push(`/croyants/${resultat.data.id}`);
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(envoyer)} className="space-y-8" noValidate>
      {erreur && !doublonSignale && (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      {/* EF-CRO-13 — le doublon s'assume, il ne se contourne pas en silence. */}
      {doublonSignale && (
        <Alert role="alert" className="border-amber-200 bg-amber-50">
          <TriangleAlert className="size-4 text-amber-700" aria-hidden />
          <AlertTitle className="text-amber-900">Doublon possible</AlertTitle>
          <AlertDescription className="space-y-4 text-amber-900">
            <p>{doublonSignale}</p>
            <Button
              type="button"
              variant="outline"
              className="h-10 bg-card"
              onClick={() => {
                setValue('doublonAccepte', true);
                setDoublonSignale(null);
                void handleSubmit(envoyer)();
              }}
            >
              Il s&apos;agit bien d&apos;une autre personne — créer quand même
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* --- Identité --- */}
      <Card>
        <CardContent className="space-y-6 p-6">
          <p className="eyebrow">Identité</p>

          <div className="grid gap-6 md:grid-cols-2">
            <TextField
              label="Nom"
              required
              autoFocus
              placeholder="KOFFI"
              error={errors.nom?.message}
              {...register('nom')}
            />
            <TextField
              label="Prénom"
              required
              placeholder="Amos"
              error={errors.prenom?.message}
              {...register('prenom')}
            />

            <Field label="Sexe" required error={errors.sexe?.message}>
              {(aria) => (
                <Controller
                  control={control}
                  name="sexe"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...aria} className="h-10 w-full">
                        <SelectValue placeholder="Choisir" />
                      </SelectTrigger>
                      <SelectContent>
                        {SEXES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {LIBELLES_SEXE[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </Field>

            <Field
              label="Date de naissance"
              required
              error={errors.dateNaissance?.message}
            >
              {(aria) => <Input {...aria} type="date" {...register('dateNaissance')} />}
            </Field>

            <Field label="Statut marital" error={errors.statutMarital?.message}>
              {(aria) => (
                <Controller
                  control={control}
                  name="statutMarital"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ''}
                      onValueChange={(v) => field.onChange(v === '' ? null : v)}
                    >
                      <SelectTrigger {...aria} className="h-10 w-full">
                        <SelectValue placeholder="Non renseigné" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUTS_MARITAUX.map((s) => (
                          <SelectItem key={s} value={s}>
                            {LIBELLES_STATUT_MARITAL[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </Field>

            <Field label="Nationalité" required error={errors.nationaliteId?.message}>
              {(aria) => (
                <Controller
                  control={control}
                  name="nationaliteId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...aria} className="h-10 w-full">
                        <SelectValue placeholder="Choisir" />
                      </SelectTrigger>
                      <SelectContent>
                        {props.nationalites.map((n) => (
                          <SelectItem key={n.id} value={n.id}>
                            {n.libelle}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* --- Coordonnées --- */}
      <Card>
        <CardContent className="space-y-6 p-6">
          <p className="eyebrow">Coordonnées</p>

          <div className="grid gap-6 md:grid-cols-2">
            <TextField
              label="Adresse e-mail"
              type="email"
              placeholder="Facultatif"
              error={errors.email?.message}
              {...register('email')}
            />
            <TextField
              label="Téléphone"
              type="tel"
              placeholder="Facultatif"
              error={errors.telephone?.message}
              {...register('telephone')}
            />
          </div>

          <TextField
            label="Adresse"
            required
            placeholder="Quartier, rue, ville"
            error={errors.adresse?.message}
            {...register('adresse')}
          />
        </CardContent>
      </Card>

      {/* --- Rattachement ecclésial --- */}
      <Card>
        <CardContent className="space-y-6 p-6">
          <p className="eyebrow">Rattachement ecclésial</p>

          <div className="grid gap-6 md:grid-cols-2">
            {existant ? (
              // Le rattachement principal ne se modifie PAS ici : c'est un
              // transfert (EF-TRF-01), qui suit un workflow d'approbation.
              <Field label="Église d'appartenance">
                {() => (
                  <div className="flex h-10 items-center rounded-md border border-border bg-slate-50 px-3 text-sm text-muted-foreground">
                    {existant.egliseNom} — se change par transfert
                  </div>
                )}
              </Field>
            ) : (
              <Field label="Église d'appartenance" required error={errors.egliseId?.message}>
                {(aria) => (
                  <Controller
                    control={control}
                    name="egliseId"
                    render={({ field }) => (
                      <EntityPicker
                        {...aria}
                        options={props.eglises}
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          // La cellule précédente appartenait à l'autre église.
                          setValue('celluleId', null);
                        }}
                        placeholder="Rechercher une église…"
                        emptyMessage="Aucune église dans votre périmètre."
                      />
                    )}
                  />
                )}
              </Field>
            )}

            <Field
              label="Cellule de prière"
              error={errors.celluleId?.message}
              hint={
                egliseChoisie && cellulesDisponibles.length === 0
                  ? "Cette église n'a pas encore de cellule."
                  : 'Facultatif. Liste filtrée selon l’église.'
              }
            >
              {(aria) => (
                <Controller
                  control={control}
                  name="celluleId"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ''}
                      onValueChange={(v) => field.onChange(v === '__aucune' ? null : v)}
                      disabled={cellulesDisponibles.length === 0}
                    >
                      <SelectTrigger {...aria} className="h-10 w-full">
                        <SelectValue placeholder="Aucune" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__aucune">Aucune</SelectItem>
                        {cellulesDisponibles.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nom}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </Field>

            <Field label="Grade" required error={errors.gradeId?.message}>
              {(aria) => (
                <Controller
                  control={control}
                  name="gradeId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...aria} className="h-10 w-full">
                        <SelectValue placeholder="Choisir" />
                      </SelectTrigger>
                      <SelectContent>
                        {props.grades.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.libelle}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </Field>

            <Field label="Date de baptême" required error={errors.dateBapteme?.message}>
              {(aria) => <Input {...aria} type="date" {...register('dateBapteme')} />}
            </Field>
          </div>

          {existant && (
            <Field label="Statut" hint="Un croyant non actif sort des effectifs consolidés.">
              {(aria) => (
                <Select
                  value={statut}
                  onValueChange={(v) => setStatut(v as StatutCroyant)}
                >
                  <SelectTrigger {...aria} className="h-10 w-full md:w-1/2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUTS_CROYANT.map((s) => (
                      <SelectItem key={s} value={s}>
                        {LIBELLES_STATUT_CROYANT[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline" className="h-10">
          <Link href={existant ? `/croyants/${existant.id}` : '/croyants'}>Annuler</Link>
        </Button>
        <Button type="submit" className="h-10" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
          {existant ? 'Enregistrer' : 'Enregistrer le croyant'}
        </Button>
      </div>
    </form>
  );
}
