'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Droplets, Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import type {
  CelluleOption,
  OptionReferentiel,
} from '@/components/croyants/croyant-form';
import { Field, TextField } from '@/components/shared/field';
import { PermissionGate } from '@/components/shared/permission-gate';
import { SelecteurMultiple } from '@/components/shared/selecteur-multiple';
import { EntityPicker, type OptionEntite } from '@/components/structure/entity-picker';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { saisirBaptise } from '@/lib/actions/baptemes';
import type { OptionCelebrant } from '@/lib/data/baptemes';
import { LIBELLES_SEXE, SEXES } from '@/lib/domain/croyant';
import { type SaisirBaptiseInput, saisirBaptiseSchema } from '@/lib/validation/bapteme';

/**
 * Saisie d'un nouveau baptisé — EF-BAP-01, EF-BAP-02, EF-BAP-03.
 *
 * UN SEUL ÉCRAN, là où la création d'un croyant en demande trois. C'est ce que
 * veut dire « simplifié » : le parcours est raccourci, pas les données. Les
 * champs obligatoires de la fiche le restent — on ne peut pas inventer une
 * adresse — mais le grade est présélectionné sur « Croyant », et la cellule
 * comme le célébrant se déduisent de l'église choisie.
 *
 * EF-BAP-02 — cette saisie CRÉE le croyant. Il n'existe donc pas de « rattacher
 * un baptême à un croyant existant » : pour celui qui est déjà enregistré, la
 * date se renseigne sur sa fiche.
 *
 * Le libellé de session (« Cérémonie de Pâques 2026 ») est ce qui regroupera un
 * lot le jour où EF-BAP-07 sera livré : le saisir dès maintenant évite d'avoir
 * à revenir sur les baptêmes déjà enregistrés.
 */
export function BaptemeDialog({
  eglises,
  cellules,
  grades,
  nationalites,
  celebrants,
  photos,
  libelle = 'Nouveau baptisé',
}: {
  eglises: OptionEntite[];
  cellules: CelluleOption[];
  grades: OptionReferentiel[];
  nationalites: OptionReferentiel[];
  celebrants: OptionCelebrant[];
  /** Clé de stockage -> URL signée (EF-CRO-09), signées en lot par la page. */
  photos: Record<string, string>;
  libelle?: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // « Croyant » est le grade d'un nouveau baptisé dans l'immense majorité des
  // cas : le présélectionner épargne un choix qui n'en est pas un.
  const gradeParDefaut =
    grades.find((g) => g.libelle.toLocaleLowerCase('fr') === 'croyant')?.id ??
    grades[0]?.id;

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SaisirBaptiseInput>({
    resolver: zodResolver(saisirBaptiseSchema),
    defaultValues: {
      nom: '',
      prenom: '',
      adresse: '',
      telephone: '',
      celluleId: null,
      gradeId: gradeParDefaut,
      celebrantIds: [],
      lieu: '',
      sessionLibelle: '',
      // La date du jour : on saisit un baptême le jour où il a eu lieu, ou le
      // lendemain. Pré-remplir évite un aller-retour vers le calendrier.
      dateBapteme: new Date().toISOString().slice(0, 10),
    } as Partial<SaisirBaptiseInput> as SaisirBaptiseInput,
  });

  const egliseChoisie = useWatch({ control, name: 'egliseId' });

  // RG-05 — seules les cellules de l'église retenue sont proposées.
  const cellulesDisponibles = useMemo(
    () => cellules.filter((c) => c.egliseId === egliseChoisie),
    [cellules, egliseChoisie],
  );

  /**
   * EF-BAP-03 — les célébrants de l'église en tête, les autres ensuite.
   *
   * Un pasteur d'une autre église peut baptiser, c'est fréquent : les exclure
   * rendrait le champ inutilisable. Mais celui de l'église concernée est le cas
   * courant, il vient donc en premier.
   */
  const celebrantsTries = useMemo(() => {
    const local = (c: OptionCelebrant) => (c.egliseId === egliseChoisie ? 0 : 1);
    return [...celebrants].sort(
      (a, b) => local(a) - local(b) || a.nom.localeCompare(b.nom, 'fr'),
    );
  }, [celebrants, egliseChoisie]);

  const optionsCelebrants = useMemo(
    () =>
      celebrantsTries.map((c) => ({
        id: c.id,
        libelle: `${c.nom.toLocaleUpperCase('fr')} ${c.prenom}`,
        detail: c.grade,
        // Un visage se reconnait plus vite qu'un nom, surtout entre homonymes.
        // L'avatar à initiales prend le relais tant qu'il n'y a pas de photo.
        avatar: (
          <AvatarCroyant
            nom={c.nom}
            prenom={c.prenom}
            url={c.photoKey ? photos[c.photoKey] : null}
          />
        ),
        // Le célébrant de l'église concernée remonte en tête : c'est le cas
        // courant, sans exclure ceux d'ailleurs — un pasteur invité baptise.
        prioritaire: c.egliseId === egliseChoisie,
      })),
    [celebrantsTries, egliseChoisie, photos],
  );

  function fermer() {
    reset();
    setErreur(null);
    setOuvert(false);
  }

  async function envoyer(valeurs: SaisirBaptiseInput) {
    setErreur(null);

    const resultat = await saisirBaptise(valeurs);

    if (!resultat.ok) {
      for (const [champ, messages] of Object.entries(resultat.fieldErrors ?? {})) {
        if (champ in valeurs) {
          setError(champ as keyof SaisirBaptiseInput, { message: messages[0] });
        }
      }
      setErreur(resultat.error);
      return;
    }

    if (resultat.data.ceremonieEnregistree) {
      toast.success(`Baptisé enregistré — matricule ${resultat.data.matricule}.`);
    } else {
      // Un demi-succès tu se découvre trois mois plus tard.
      toast.warning(
        `Fiche créée (matricule ${resultat.data.matricule}), mais les informations de ` +
          'cérémonie n’ont pas pu être enregistrées. La date de baptême, elle, est bien prise en compte.',
      );
    }

    fermer();
    router.push(`/croyants/${resultat.data.croyantId}`);
    router.refresh();
  }

  return (
    <>
      <PermissionGate perm="bapteme.create">
        <Button className="h-10" onClick={() => setOuvert(true)}>
          <Plus className="mr-2 size-4" aria-hidden />
          {libelle}
        </Button>
      </PermissionGate>

      <Dialog open={ouvert} onOpenChange={(v) => (v ? setOuvert(true) : fermer())}>
        <DialogContent className="max-h-[92vh] w-[min(96vw,80rem)] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Nouveau baptisé</DialogTitle>
            <DialogDescription>
              Cette saisie crée la fiche du croyant — il n&apos;y a pas de double saisie.
              Le matricule est attribué à l&apos;enregistrement.
            </DialogDescription>
          </DialogHeader>

          {ouvert && (
            <form onSubmit={handleSubmit(envoyer)} className="space-y-8 py-2" noValidate>
              {erreur && (
                <Alert variant="destructive" role="alert">
                  <AlertCircle className="size-4" aria-hidden />
                  <AlertDescription>{erreur}</AlertDescription>
                </Alert>
              )}

              {/*
                Les deux sections COTE A COTE : identité à gauche, baptême à
                droite. Empilées, elles imposaient un défilement au milieu d'une
                saisie de dix champs — on perdait de vue ce qu'on venait de
                remplir. Sous 1024 px elles se replient l'une sous l'autre.
              */}
              <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
                {/* --- La personne --- */}
                <section className="space-y-6">
                  <p className="eyebrow">Identité</p>

                  <div className="grid gap-6">
                    <TextField
                      label="Nom"
                      required
                      autoFocus
                      placeholder="RAKOTONIRINA"
                      error={errors.nom?.message}
                      {...register('nom')}
                    />
                    <TextField
                      label="Prénom"
                      required
                      placeholder="Mamitiana"
                      error={errors.prenom?.message}
                      {...register('prenom')}
                    />

                    <Field label="Sexe" required error={errors.sexe?.message}>
                      {(aria) => (
                        <Controller
                          control={control}
                          name="sexe"
                          render={({ field }) => (
                            <Select
                              value={field.value ?? ''}
                              onValueChange={field.onChange}
                            >
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
                      {(aria) => (
                        <Input
                          {...aria}
                          type="date"
                          className="h-10 font-mono tabular-nums"
                          {...register('dateNaissance')}
                        />
                      )}
                    </Field>

                    <TextField
                      label="Adresse"
                      required
                      placeholder="Ambohitromanjaka"
                      error={errors.adresse?.message}
                      {...register('adresse')}
                    />

                    <TextField
                      label="Téléphone"
                      placeholder="034 00 000 00"
                      hint="Facultatif."
                      error={errors.telephone?.message}
                      {...register('telephone')}
                    />

                    <Field
                      label="Nationalité"
                      required
                      error={errors.nationaliteId?.message}
                    >
                      {(aria) => (
                        <Controller
                          control={control}
                          name="nationaliteId"
                          render={({ field }) => (
                            <Select
                              value={field.value ?? ''}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger {...aria} className="h-10 w-full">
                                <SelectValue placeholder="Choisir" />
                              </SelectTrigger>
                              <SelectContent>
                                {nationalites.map((n) => (
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

                    <Field
                      label="Grade"
                      required
                      error={errors.gradeId?.message}
                      hint="Un nouveau baptisé est « Croyant » sauf exception."
                    >
                      {(aria) => (
                        <Controller
                          control={control}
                          name="gradeId"
                          render={({ field }) => (
                            <Select
                              value={field.value ?? ''}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger {...aria} className="h-10 w-full">
                                <SelectValue placeholder="Choisir" />
                              </SelectTrigger>
                              <SelectContent>
                                {grades.map((g) => (
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
                  </div>
                </section>

                {/* --- La cérémonie — EF-BAP-03 --- */}
                <section className="lg:border-border space-y-6 lg:border-l lg:pl-10">
                  <p className="eyebrow">Baptême</p>

                  <div className="grid gap-6">
                    <Field label="Église" required error={errors.egliseId?.message}>
                      {(aria) => (
                        <Controller
                          control={control}
                          name="egliseId"
                          render={({ field }) => (
                            <EntityPicker
                              {...aria}
                              options={eglises}
                              value={field.value ?? null}
                              onChange={(v) => {
                                field.onChange(v);
                                // Cellule et célébrant dépendent de l'église :
                                // les garder produirait un rattachement incohérent.
                                setValue('celluleId', null);
                              }}
                              placeholder="Choisir une église"
                              emptyMessage="Aucune église dans votre périmètre."
                            />
                          )}
                        />
                      )}
                    </Field>

                    <Field
                      label="Date du baptême"
                      required
                      error={errors.dateBapteme?.message}
                    >
                      {(aria) => (
                        <Input
                          {...aria}
                          type="date"
                          className="h-10 font-mono tabular-nums"
                          {...register('dateBapteme')}
                        />
                      )}
                    </Field>

                    <Field
                      label="Cellule de prière"
                      error={errors.celluleId?.message}
                      hint={
                        egliseChoisie && cellulesDisponibles.length === 0
                          ? 'Cette église ne compte aucune cellule.'
                          : 'Facultatif.'
                      }
                    >
                      {(aria) => (
                        <Controller
                          control={control}
                          name="celluleId"
                          render={({ field }) => (
                            <Select
                              value={field.value ?? 'aucune'}
                              onValueChange={(v) =>
                                field.onChange(v === 'aucune' ? null : v)
                              }
                              disabled={
                                !egliseChoisie || cellulesDisponibles.length === 0
                              }
                            >
                              <SelectTrigger {...aria} className="h-10 w-full">
                                <SelectValue placeholder="Aucune" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="aucune">Aucune</SelectItem>
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

                    {/* EF-BAP-03 — plusieurs célébrants : un pasteur assisté
                      d'un diacre, deux pasteurs en cérémonie collective. */}
                    <Field
                      label="Célébrants"
                      error={errors.celebrantIds?.message}
                      hint="Pasteurs, évangélistes et diacres. Plusieurs possibles, facultatif."
                    >
                      {(aria) => (
                        <Controller
                          control={control}
                          name="celebrantIds"
                          render={({ field }) => (
                            <SelecteurMultiple
                              {...aria}
                              options={optionsCelebrants}
                              valeurs={(field.value as string[] | undefined) ?? []}
                              onChange={field.onChange}
                              placeholder="Non renseigné"
                              rechercheMessage="Rechercher par nom ou par grade…"
                              emptyMessage="Aucun célébrant enregistré."
                            />
                          )}
                        />
                      )}
                    </Field>

                    <TextField
                      label="Lieu"
                      placeholder="Rivière Ikopa, temple…"
                      hint="Facultatif."
                      error={errors.lieu?.message}
                      {...register('lieu')}
                    />

                    <TextField
                      label="Session ou cérémonie"
                      placeholder="Cérémonie de Pâques 2026"
                      hint="Ce qui regroupera les baptisés d'un même jour."
                      error={errors.sessionLibelle?.message}
                      {...register('sessionLibelle')}
                    />
                  </div>
                </section>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  onClick={fermer}
                  disabled={isSubmitting}
                >
                  Annuler
                </Button>
                <Button type="submit" className="h-10" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  ) : (
                    <Droplets className="mr-2 size-4" aria-hidden />
                  )}
                  Enregistrer le baptisé
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
