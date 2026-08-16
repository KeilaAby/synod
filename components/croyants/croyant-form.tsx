'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { avertir } from '@/components/shared/messages';
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
import { televerserPhotoCroyant } from '@/lib/actions/photos';
import {
  LIBELLES_SEXE,
  LIBELLES_STATUT_CROYANT,
  LIBELLES_STATUT_MARITAL,
  SEXES,
  STATUTS_CROYANT,
  STATUTS_MARITAUX,
  type StatutCroyant,
} from '@/lib/domain/croyant';
import { appelerAction } from '@/lib/utils/appeler-action';
import { croyantSchema, type CroyantInput } from '@/lib/validation/croyant';

import { FriseEtapes, type Etape } from './etapes';
import { PhotoUploader } from './photo-uploader';
import { versFichierWebp } from './preparer-photo';
import { SelecteurPhoto } from './selecteur-photo';

/**
 * Formulaire du croyant — EF-CRO-01, ENF-UTI-07 (moins de 90 secondes).
 *
 * Découpé en TROIS ÉTAPES : un formulaire de quinze champs présenté d'un bloc
 * décourage, surtout sur un écran étroit. Une étape tient sous les yeux, et la
 * validation se fait au passage — l'erreur se corrige là où elle est née,
 * plutôt qu'après un défilement.
 *
 * En modification, les étapes restent affichées mais deviennent cliquables :
 * la fiche existe, ses valeurs sont valides, rien ne justifie d'imposer un
 * parcours linéaire pour corriger un numéro de téléphone.
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
  date_bapteme: string | null;
  adresse: string;
  eglise_id: string;
  cellule_id: string | null;
  grade_id: string;
  nationalite_id: string;
  statut: StatutCroyant;
  egliseNom: string;
}

/**
 * Le formulaire sert deux contextes : la page dédiée (lien profond, partage) et
 * le pop-up. Seule la sortie change.
 */
interface Presentation {
  onSucces?: (id: string) => void;
  onAnnuler?: () => void;
  /** URL signee de la photo existante (EF-CRO-09). Modification uniquement. */
  urlPhoto?: string | null;
}

/**
 * Rattachement DÉCIDÉ AILLEURS — EF-CRO-01, RG-04, RG-05.
 *
 * Le geste part du menu d'une église ou d'une cellule dans la structure :
 * l'utilisateur a déjà désigné le rattachement en ouvrant ce menu. Le champ se
 * LIT donc au lieu de se choisir — le proposer à nouveau permettrait d'en
 * changer par inadvertance, et l'écran ne dirait plus de quelle entité on est
 * parti.
 *
 * À distinguer d'`eglisePreselectionnee`, qui n'est qu'une commodité de lien
 * profond : elle amorce le champ, elle ne le verrouille pas.
 */
export interface RattachementImpose {
  egliseId: string;
  egliseNom: string;
  /** RG-05 — présent lorsque le geste part d'une cellule de prière. */
  celluleId?: string;
  celluleNom?: string;
}

type Props = Presentation &
  (
    | ({
        mode: 'creation';
        eglisePreselectionnee?: string;
        rattachement?: RattachementImpose;
        /**
         * Nom et prénom déjà connus — EF-FIN-34.
         *
         * La création part parfois d'un nom LU AILLEURS : une ligne de feuille
         * de versements qu'aucune fiche ne reconnaît. Le retaper serait une
         * occasion de le taper autrement, et l'écart serait recréé au moment
         * même où on le comble.
         *
         * Une AMORCE, pas un verrou : l'orthographe du fichier est justement
         * ce dont on doute, et elle reste corrigeable.
         */
        identite?: { nom: string; prenom: string };
      } & Commun)
    | ({ mode: 'modification'; croyant: CroyantExistant } & Commun)
  );

/**
 * L'ordre suit celui d'une fiche d'état civil, pas celui des colonnes de la
 * table : on identifie la personne, on la joint, puis on la rattache.
 */
const ETAPES: readonly Etape[] = [
  { cle: 'identite', titre: 'Identité', description: 'Nom, sexe, naissance' },
  { cle: 'rattachement', titre: 'Rattachement', description: 'Église, cellule, grade' },
  { cle: 'coordonnees', titre: 'Coordonnées', description: 'Adresse et contacts' },
];

/** Champs à valider avant de passer à l'étape suivante. */
const CHAMPS_PAR_ETAPE: readonly (keyof CroyantInput)[][] = [
  ['nom', 'prenom', 'sexe', 'dateNaissance', 'nationaliteId'],
  ['egliseId', 'celluleId', 'gradeId', 'dateBapteme'],
  ['email', 'telephone', 'adresse'],
];

/** Un `<input type="date">` attend le format `YYYY-MM-DD`. */
function jour(valeur: string | Date | null | undefined): string {
  if (!valeur) return '';
  return new Date(valeur).toISOString().slice(0, 10);
}

export function CroyantForm(props: Props) {
  const router = useRouter();
  const existant = props.mode === 'modification' ? props.croyant : null;

  const [etape, setEtape] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [doublonSignale, setDoublonSignale] = useState<string | null>(null);
  const [statut, setStatut] = useState<StatutCroyant>(existant?.statut ?? 'ACTIF');

  // EF-CRO-09 — en création, la photo attend l'identifiant que seule la base
  // peut attribuer. Elle part juste après, dans la foulée de l'enregistrement.
  const [photoEnAttente, setPhotoEnAttente] = useState<Blob | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<CroyantInput>({
    resolver: zodResolver(croyantSchema),
    // Valider au passage d'un champ : sur un parcours en étapes, découvrir une
    // erreur trois écrans plus loin oblige à revenir en arrière.
    mode: 'onBlur',
    defaultValues: {
      nom: existant?.nom ?? (props.mode === 'creation' ? props.identite?.nom : '') ?? '',
      prenom:
        existant?.prenom ?? (props.mode === 'creation' ? props.identite?.prenom : '') ?? '',
      sexe: existant?.sexe,
      statutMarital:
        (existant?.statut_marital as CroyantInput['statutMarital']) ?? undefined,
      email: existant?.email ?? '',
      telephone: existant?.telephone ?? '',
      dateNaissance: jour(existant?.date_naissance),
      dateBapteme: jour(existant?.date_bapteme),
      adresse: existant?.adresse ?? '',
      egliseId:
        existant?.eglise_id ??
        (props.mode === 'creation'
          ? (props.rattachement?.egliseId ?? props.eglisePreselectionnee)
          : undefined) ??
        undefined,
      celluleId:
        existant?.cellule_id ??
        (props.mode === 'creation' ? (props.rattachement?.celluleId ?? null) : null),
      gradeId: existant?.grade_id ?? undefined,
      nationaliteId: existant?.nationalite_id ?? undefined,
      doublonAccepte: false,
    } as Partial<CroyantInput> as CroyantInput,
  });

  /** Rattachement verrouillé par le chemin d'accès — voir `RattachementImpose`. */
  const impose = props.mode === 'creation' ? props.rattachement : undefined;

  const egliseChoisie = useWatch({ control, name: 'egliseId' });

  // L'avatar de repli suit la saisie : on voit ses initiales se former.
  const nomSaisi = useWatch({ control, name: 'nom' });
  const prenomSaisi = useWatch({ control, name: 'prenom' });

  // RG-05 — seules les cellules de l'église retenue sont proposées.
  const cellulesDisponibles = useMemo(
    () => props.cellules.filter((c) => c.egliseId === egliseChoisie),
    [props.cellules, egliseChoisie],
  );

  const derniereEtape = etape === ETAPES.length - 1;

  async function suivant() {
    // On ne valide QUE les champs de l'étape courante : valider tout le
    // formulaire signalerait des erreurs sur des champs pas encore présentés.
    const valide = await trigger(CHAMPS_PAR_ETAPE[etape]);
    if (!valide) return;
    setErreur(null);
    setEtape((e) => Math.min(e + 1, ETAPES.length - 1));
  }

  function traiterEchec(
    echec: { error: string; fieldErrors?: Record<string, string[]> },
    valeurs: CroyantInput,
  ) {
    for (const [champ, messages] of Object.entries(echec.fieldErrors ?? {})) {
      if (champ === 'doublon') {
        // EF-CRO-13 — avertissement, pas blocage : la décision revient à l'utilisateur.
        setDoublonSignale(echec.error);
        avertir('Doublon possible — voyez le message en haut du formulaire.');
        return;
      }
      if (champ in valeurs) {
        setError(champ as keyof CroyantInput, { message: messages[0] });
        // Ramener sur l'étape du champ fautif : un message hors écran n'existe pas.
        const index = CHAMPS_PAR_ETAPE.findIndex((c) =>
          c.includes(champ as keyof CroyantInput),
        );
        if (index >= 0) setEtape(index);
      }
    }
    setErreur(echec.error);

    /**
     * Le message va AUSSI dans une notification.
     *
     * L'alerte s'affiche en tête du formulaire — trois étapes plus haut que le
     * bouton d'enregistrement, dans un pop-up qui défile. Un refus produisait
     * donc exactement ce qu'on a observé en production : le spinner tourne une
     * seconde, puis « rien ne se passe ». Le code prenait déjà cette précaution
     * pour les erreurs de CHAMP — « un message hors écran n'existe pas » — et
     * l'oubliait pour l'erreur générale, qui est justement celle qui explique.
     */
    // Le pop-up attend d'être fermé : plus besoin d'allonger une durée qui,
    // de toute façon, ne suffisait jamais à lire un refus motivé.
    avertir(echec.error);
  }

  async function envoyer(valeurs: CroyantInput) {
    setErreur(null);

    if (existant) {
      const resultat = await appelerAction(() =>
        modifierCroyant({
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
        }),
      );

      if (!resultat.ok) return traiterEchec(resultat, valeurs);

      toast.success('Fiche mise à jour.');
      if (props.onSucces) props.onSucces(existant.id);
      else router.push(`/croyants/${existant.id}`);
    } else {
      const resultat = await appelerAction(() => creerCroyant(valeurs));
      if (!resultat.ok) return traiterEchec(resultat, valeurs);

      toast.success(`Croyant enregistré — matricule ${resultat.data.matricule}.`);

      // La photo part MAINTENANT : l'identifiant vient d'être attribué.
      // Un échec ici ne remet pas la fiche en cause — elle est créée, et la
      // photo se rajoute depuis la fiche. On le dit plutôt que de le taire.
      if (photoEnAttente) {
        const envoi = new FormData();
        envoi.set('croyantId', resultat.data.id);
        envoi.set('photo', versFichierWebp(photoEnAttente));

        const photo = await televerserPhotoCroyant(envoi);
        if (!photo.ok) {
          // La fiche EXISTE : titrer « l'opération n'a pas eu lieu » serait
          // faux et enverrait ressaisir ce qui est déjà enregistré.
          avertir(
            `La fiche est enregistrée, mais la photo n'a pas pu être jointe : ${photo.error}`,
            { ton: 'information', titre: 'Enregistré, avec une réserve' },
          );
        }
      }

      if (props.onSucces) props.onSucces(resultat.data.id);
      else router.push(`/croyants/${resultat.data.id}`);
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(envoyer)} className="space-y-8" noValidate>
      <FriseEtapes
        etapes={ETAPES}
        courante={etape}
        // En modification, tout est déjà valide : la navigation est libre.
        onAller={existant ? setEtape : undefined}
      />

      {erreur && !doublonSignale && (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      {doublonSignale && (
        <Alert role="alert" className="border-amber-200 bg-amber-50">
          <TriangleAlert className="size-4 text-amber-700" aria-hidden />
          <AlertTitle className="text-amber-900">Doublon possible</AlertTitle>
          <AlertDescription className="space-y-4 text-amber-900">
            <p>{doublonSignale}</p>
            <Button
              type="button"
              variant="outline"
              className="bg-card h-10"
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

      {/* --- Étape 1 : identité --- */}
      <Card hidden={etape !== 0}>
        <CardContent className="space-y-6 p-6">
          <p className="eyebrow">Identité</p>

          {/*
            EF-CRO-09 — la photo appartient à l'identité, pas à une page à part.
            En modification la fiche existe : l'envoi est immédiat. En création
            elle n'existe pas encore, donc l'image attend l'identifiant.
          */}
          {existant ? (
            <PhotoUploader
              croyantId={existant.id}
              nom={existant.nom}
              prenom={existant.prenom}
              urlPhoto={props.urlPhoto ?? null}
              peutModifier
              className="border-border border-b pb-6"
            />
          ) : (
            <SelecteurPhoto
              nom={nomSaisi ?? ''}
              prenom={prenomSaisi ?? ''}
              photo={photoEnAttente}
              onPhoto={setPhotoEnAttente}
              className="border-border border-b pb-6"
            />
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <TextField
              label="Nom"
              required
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
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
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
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
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
      {/* --- Étape 2 : rattachement ecclésial --- */}
      <Card hidden={etape !== 1}>
        <CardContent className="space-y-6 p-6">
          <p className="eyebrow">Rattachement ecclésial</p>

          <div className="grid gap-6 md:grid-cols-2">
            {existant ? (
              // Le rattachement principal ne se modifie PAS ici : c'est un
              // transfert (EF-TRF-01), qui suit un workflow d'approbation.
              <Field label="Église d'appartenance">
                {() => (
                  <div className="border-border text-muted-foreground flex h-10 items-center rounded-md border bg-slate-50 px-3 text-sm">
                    {existant.egliseNom} — se change par transfert
                  </div>
                )}
              </Field>
            ) : impose ? (
              // Le geste part de cette église : elle se lit, elle ne se choisit
              // pas. Voir `RattachementImpose`.
              <Field label="Église d'appartenance" hint="Choisie dans la structure.">
                {() => (
                  <div className="border-border text-muted-foreground flex h-10 items-center rounded-md border bg-slate-50 px-3 text-sm">
                    {impose.egliseNom}
                  </div>
                )}
              </Field>
            ) : (
              <Field
                label="Église d'appartenance"
                required
                error={errors.egliseId?.message}
              >
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

            {impose?.celluleNom ? (
              // Le geste part de la cellule elle-même : RG-05 est déjà tenue
              // par le chemin d'accès, il n'y a rien à choisir.
              <Field label="Cellule de prière" hint="Choisie dans la structure.">
                {() => (
                  <div className="border-border text-muted-foreground flex h-10 items-center rounded-md border bg-slate-50 px-3 text-sm">
                    {impose.celluleNom}
                  </div>
                )}
              </Field>
            ) : (
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
            )}

            <Field label="Grade" required error={errors.gradeId?.message}>
              {(aria) => (
                <Controller
                  control={control}
                  name="gradeId"
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
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

            {/* Facultative : une fiche se crée souvent avant que la date ne soit
                connue — reprise d'un registre, croyant en préparation. */}
            <Field
              label="Date de baptême"
              error={errors.dateBapteme?.message}
              hint="Facultative — peut être renseignée plus tard."
            >
              {(aria) => <Input {...aria} type="date" {...register('dateBapteme')} />}
            </Field>
          </div>

          {existant && (
            <Field
              label="Statut"
              hint="Un croyant non actif sort des effectifs consolidés."
            >
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

      {/* --- Étape 3 : coordonnées --- */}
      <Card hidden={etape !== 2}>
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

      {/* --- Navigation --- */}
      <div className="flex items-center justify-between gap-2">
        <div>
          {etape > 0 && (
            <Button
              type="button"
              variant="ghost"
              className="h-10"
              onClick={() => setEtape((e) => e - 1)}
              disabled={isSubmitting}
            >
              <ArrowLeft className="mr-2 size-4" aria-hidden />
              Précédent
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          {props.onAnnuler ? (
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={props.onAnnuler}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
          ) : (
            <Button asChild variant="outline" className="h-10">
              <Link href={existant ? `/croyants/${existant.id}` : '/croyants'}>
                Annuler
              </Link>
            </Button>
          )}

          {/* En modification, l'enregistrement reste accessible à toute étape :
              corriger un champ ne doit pas imposer de parcourir le reste. */}
          {!derniereEtape && !existant ? (
            <Button type="button" className="h-10" onClick={suivant}>
              Suivant {etape + 2}/{ETAPES.length}
              <ArrowRight className="ml-2 size-4" aria-hidden />
            </Button>
          ) : (
            <Button type="submit" className="h-10" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              )}
              {existant ? 'Enregistrer' : 'Enregistrer le croyant'}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
