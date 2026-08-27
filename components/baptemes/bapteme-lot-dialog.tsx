'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, CircleCheck, Layers, Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { ChampDate } from '@/components/shared/champ-date';
import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import type {
  CelluleOption,
  OptionReferentiel,
} from '@/components/croyants/croyant-form';
import { Field, TextField } from '@/components/shared/field';
import { PermissionGate } from '@/components/shared/permission-gate';
import { SelecteurMultiple } from '@/components/shared/selecteur-multiple';
import { EntityPicker, type OptionEntite } from '@/components/structure/entity-picker';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type ResultatLot, saisirBaptisesEnLot } from '@/lib/actions/baptemes';
import type { OptionCelebrant } from '@/lib/data/baptemes';
import { egliseImplicite, trouverNationaliteParDefaut } from '@/lib/domain/bapteme-lot';
import { LIBELLES_SEXE, SEXES } from '@/lib/domain/croyant';
import { formatNombre } from '@/lib/utils/format';
import {
  LIGNES_LOT_MAX,
  type SaisirLotInput,
  saisirLotSchema,
} from '@/lib/validation/bapteme';

/**
 * Saisie d'un lot de baptisés — EF-BAP-07.
 *
 * DEUX ZONES, ET C'EST TOUT LE PROPOS. Ce qu'une cérémonie a en commun — sa
 * date, son lieu, ses célébrants, son libellé — se saisit UNE fois, en haut.
 * Ce qui distingue les personnes se saisit ligne par ligne, en bas. Trente
 * baptisés d'un même dimanche demandaient jusqu'ici trente fois les mêmes huit
 * champs de cérémonie.
 *
 * L'ÉGLISE EST UNE COLONNE quand il y en a plusieurs à portée : une cérémonie
 * de district réunit au bord de la même rivière des baptisés de cinq églises,
 * et chacun reste rattaché à la sienne (RG-04). Elle disparaît quand le
 * périmètre n'en compte qu'une — le seul choix possible n'a pas à être demandé.
 *
 * LE RAPPORT EST UN TEMPS À PART. Une ligne peut être écartée sans que les
 * autres le soient : un homonyme déjà enregistré, une cellule qui n'est pas de
 * l'église. Le dire dans une notification qui s'efface reviendrait à ne pas le
 * dire (règle 30).
 */

type Etape = 'saisie' | 'rapport';

type LigneLotInput = SaisirLotInput['lignes'][number];

/**
 * Une ligne vierge, prête à recevoir une personne.
 *
 * `sexe` n'a PAS de valeur de départ : « Masculin » présélectionné se serait
 * enregistré tel quel sur toute ligne où l'on aurait oublié d'y toucher. Le
 * schéma exige donc un type que le vide ne satisfait pas — d'où la conversion,
 * la même que dans le formulaire à l'unité : c'est l'état d'un formulaire en
 * cours de saisie, pas celui d'un envoi.
 */
function ligneVide(egliseId: string | null): LigneLotInput {
  return {
    nom: '',
    prenom: '',
    sexe: undefined,
    dateNaissance: '',
    adresse: '',
    telephone: '',
    egliseId,
    celluleId: null,
  } as Partial<LigneLotInput> as LigneLotInput;
}

export function BaptemeLotDialog({
  eglises,
  cellules,
  nationalites,
  celebrants,
  photos,
}: {
  eglises: OptionEntite[];
  cellules: CelluleOption[];
  nationalites: OptionReferentiel[];
  celebrants: OptionCelebrant[];
  /** Clé de stockage -> URL signée (EF-CRO-09), signées en lot par la page. */
  photos: Record<string, string>;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [etape, setEtape] = useState<Etape>('saisie');
  const [erreur, setErreur] = useState<string | null>(null);
  const [rapport, setRapport] = useState<ResultatLot | null>(null);

  /**
   * L'église que l'utilisateur n'a pas à renseigner — EF-BAP-07.
   *
   * Un seul lieu de rattachement possible : la colonne s'efface et la valeur
   * part quand même. Le serveur la redéduit de son côté, il ne fait pas
   * confiance à ce que le formulaire envoie.
   */
  const implicite = useMemo(() => egliseImplicite(eglises), [eglises]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SaisirLotInput>({
    resolver: zodResolver(saisirLotSchema),
    defaultValues: {
      dateBapteme: new Date().toISOString().slice(0, 10),
      lieu: '',
      sessionLibelle: '',
      celebrantIds: [],
      lignes: [ligneVide(implicite)],
    } as Partial<SaisirLotInput> as SaisirLotInput,
  });

  /**
   * EF-BAP-07 — CE QUE PREND UNE LIGNE LAISSÉE VIDE.
   *
   * Calculé une fois pour toute la grille : trente lignes qui chercheraient
   * chacune « Malagasy » dans le référentiel referaient trente fois le même
   * parcours à chaque frappe.
   *
   * LES DEUX ORTHOGRAPHES SONT ACCEPTÉES — « Malagasy » est la forme malgache,
   * « Malgache » la forme française, et les deux se rencontrent dans les
   * référentiels réels. C'est la même règle que le serveur applique
   * (`trouverNationaliteParDefaut`) : deux endroits, une seule définition, et
   * un test qui les compare.
   */
  const nationaliteDefaut = useMemo(() => {
    const id = trouverNationaliteParDefaut(nationalites);
    return id ? (nationalites.find((n) => n.id === id) ?? null) : null;
  }, [nationalites]);

  const { fields, append, remove } = useFieldArray({ control, name: 'lignes' });
  const lignes = useWatch({ control, name: 'lignes' });

  const celebrantsTries = useMemo(
    () => [...celebrants].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [celebrants],
  );

  const optionsCelebrants = useMemo(
    () =>
      celebrantsTries.map((c) => ({
        id: c.id,
        libelle: `${c.nom.toLocaleUpperCase('fr')} ${c.prenom}`,
        detail: c.grade,
        avatar: (
          <AvatarCroyant
            nom={c.nom}
            prenom={c.prenom}
            url={c.photoKey ? photos[c.photoKey] : null}
          />
        ),
      })),
    [celebrantsTries, photos],
  );

  function fermer() {
    reset();
    setEtape('saisie');
    setErreur(null);
    setRapport(null);
    setOuvert(false);
    if (rapport && rapport.enregistres.length > 0) router.refresh();
  }

  /**
   * La ligne ajoutée HÉRITE de l'église de la précédente.
   *
   * Une cérémonie regroupe le plus souvent une seule église, parfois deux :
   * repartir de vide obligerait à la choisir trente fois de suite.
   */
  function ajouterLigne() {
    const derniere = lignes?.[lignes.length - 1];
    append(ligneVide((derniere?.egliseId as string | null) ?? implicite));
  }

  async function envoyer(valeurs: SaisirLotInput) {
    setErreur(null);

    const resultat = await saisirBaptisesEnLot(valeurs);

    if (!resultat.ok) {
      setErreur(resultat.error);
      return;
    }

    setRapport(resultat.data);
    setEtape('rapport');

    // La notification ne porte que ce qui se constate d'un coup d'œil ; le
    // détail des lignes écartées est à l'écran, dans le rapport (règle 30).
    if (resultat.data.enregistres.length > 0) {
      toast.success(
        `${formatNombre(resultat.data.enregistres.length)} baptisé${resultat.data.enregistres.length > 1 ? 's' : ''} enregistré${resultat.data.enregistres.length > 1 ? 's' : ''}.`,
      );
    }
  }

  const messageLigne = (index: number, champ: keyof ReturnType<typeof ligneVide>) =>
    errors.lignes?.[index]?.[champ as 'nom']?.message;

  return (
    <>
      <PermissionGate perm="bapteme.create">
        <Button variant="outline" className="h-10" onClick={() => setOuvert(true)}>
          <Layers className="mr-2 size-4" aria-hidden />
          Saisir un lot
        </Button>
      </PermissionGate>

      <Dialog open={ouvert} onOpenChange={(v) => (v ? setOuvert(true) : fermer())}>
        {/*
          `overflow-x-hidden` est délibéré : la grille se contraint désormais
          d'elle-même, et une barre horizontale ici ne signalerait plus qu'une
          largeur mal calculée. Mieux vaut qu'elle ne puisse pas apparaître.
        */}
        <DialogContent className="max-h-[92vh] w-[min(98vw,96rem)] overflow-x-hidden overflow-y-auto sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {etape === 'saisie' ? 'Saisir un lot de baptisés' : 'Rapport de saisie'}
            </DialogTitle>
            <DialogDescription>
              {etape === 'saisie'
                ? 'Une même cérémonie, plusieurs baptisés. Ce qui leur est commun se saisit une seule fois, en haut ; chaque ligne crée une fiche et attribue un matricule.'
                : 'Ce qui a été enregistré, et ce qui ne l’a pas été.'}
            </DialogDescription>
          </DialogHeader>

          {etape === 'rapport' && rapport && <RapportLot rapport={rapport} />}

          {etape === 'saisie' && ouvert && (
            /*
              `min-w-0` : un enfant de grille vaut `min-width: auto`, donc il
              REFUSE de rétrécir sous la largeur de son contenu. Sans cela, la
              grille de saisie poussait la fenêtre entière au-delà de l'écran
              au lieu de se contraindre — c'était la seconde moitié de la barre
              de défilement.
            */
            <form
              onSubmit={handleSubmit(envoyer)}
              className="min-w-0 space-y-8 py-2"
              noValidate
            >
              {erreur && (
                <Alert variant="destructive" role="alert">
                  <AlertCircle className="size-4" aria-hidden />
                  <AlertDescription>{erreur}</AlertDescription>
                </Alert>
              )}

              {/* --- La cérémonie, commune au lot --- */}
              <section className="space-y-6">
                <p className="eyebrow">La cérémonie</p>

                <div className="grid gap-6 lg:grid-cols-3">
                  <Field
                    label="Date du baptême"
                    required
                    error={errors.dateBapteme?.message}
                  >
                    {(aria) => (
                      <Controller
                        control={control}
                        name="dateBapteme"
                        render={({ field }) => (
                          <ChampDate
                            {...aria}
                            value={(field.value as string) ?? ''}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
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
                    hint="Ce qui regroupe les baptisés de ce lot."
                    error={errors.sessionLibelle?.message}
                    {...register('sessionLibelle')}
                  />

                  <Field
                    label="Célébrants"
                    error={errors.celebrantIds?.message}
                    hint="Communs à tout le lot. Facultatif."
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
                </div>

                {implicite && (
                  <p className="text-muted-foreground text-xs">
                    Tous les baptisés de ce lot sont rattachés à{' '}
                    <span className="text-foreground font-medium">{eglises[0]?.nom}</span>{' '}
                    — la seule église de votre périmètre.
                  </p>
                )}
              </section>

              {/* --- Les baptisés, ligne par ligne --- */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="eyebrow">
                    Les baptisés — {formatNombre(fields.length)} ligne
                    {fields.length > 1 ? 's' : ''}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9"
                    onClick={ajouterLigne}
                    disabled={fields.length >= LIGNES_LOT_MAX}
                  >
                    <Plus className="mr-2 size-4" aria-hidden />
                    Ajouter une ligne
                  </Button>
                </div>

                {typeof errors.lignes?.message === 'string' && (
                  <Alert variant="destructive" role="alert">
                    <AlertCircle className="size-4" aria-hidden />
                    <AlertDescription>{errors.lignes.message}</AlertDescription>
                  </Alert>
                )}

                {/*
                  LA GRILLE NE DÉFILE PAS, ELLE SE PARTAGE LA LARGEUR.

                  Des largeurs MINIMALES par colonne additionnaient 1 430 px et
                  débordaient de toute fenêtre ordinaire : choisir une église au
                  nom un peu long faisait surgir une barre de défilement
                  horizontale, et le bouton d'enregistrement sortait de l'écran.

                  `table-fixed` avec des largeurs en POURCENTAGE fait l'inverse :
                  la somme vaut toujours 100 %, chaque contrôle se replie dans sa
                  colonne, et la grille tient quelle que soit la fenêtre. Ce qui
                  est trop long est tronqué À L'ÉCRAN — où l'on peut survoler,
                  ouvrir, chercher — jamais à l'impression (règle 31).
                */}
                <div className="border-border min-w-0 rounded-lg border [&_[role=combobox]]:h-9">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[3%]">#</TableHead>
                        {!implicite && (
                          <TableHead className="w-[17%]">Église *</TableHead>
                        )}
                        <TableHead className={implicite ? 'w-[14%]' : 'w-[11%]'}>
                          Nom *
                        </TableHead>
                        <TableHead className={implicite ? 'w-[14%]' : 'w-[11%]'}>
                          Prénom *
                        </TableHead>
                        <TableHead className={implicite ? 'w-[9%]' : 'w-[8%]'}>
                          Sexe *
                        </TableHead>
                        <TableHead className={implicite ? 'w-[14%]' : 'w-[12%]'}>
                          Naissance *
                        </TableHead>
                        <TableHead className={implicite ? 'w-[18%]' : 'w-[15%]'}>
                          Adresse *
                        </TableHead>
                        <TableHead className={implicite ? 'w-[10%]' : 'w-[9%]'}>
                          Téléphone
                        </TableHead>
                        {/*
                          EF-BAP-07 — LA NATIONALITÉ EST UNE COLONNE, et elle
                          est FACULTATIVE.

                          Elle valait pour tout le lot, au motif qu'elle ne
                          varie pratiquement jamais au sein d'une cérémonie.
                          C'était vrai la plupart du temps et faux quand cela
                          comptait : une cérémonie réunit des baptisés de
                          plusieurs nationalités, et le champ commun obligeait
                          à corriger les fiches une par une après coup.

                          L'astérisque manque volontairement : une ligne vide
                          prend « Malagasy ». Remplir trente cases identiques
                          serait plus pénible que l'ancien champ.
                        */}
                        <TableHead className={implicite ? 'w-[13%]' : 'w-[11%]'}>
                          Nationalité
                        </TableHead>
                        <TableHead className={implicite ? 'w-[10%]' : 'w-[8%]'}>
                          Cellule
                        </TableHead>
                        <TableHead className="w-[3%]" />
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {fields.map((champ, index) => (
                        <LigneBaptise
                          key={champ.id}
                          index={index}
                          control={control}
                          register={register}
                          cellules={cellules}
                          eglises={eglises}
                          implicite={implicite}
                          nationalites={nationalites}
                          idNationaliteDefaut={nationaliteDefaut?.id ?? null}
                          libelleNationaliteDefaut={nationaliteDefaut?.libelle ?? null}
                          erreurs={{
                            nom: messageLigne(index, 'nom'),
                            prenom: messageLigne(index, 'prenom'),
                            sexe: messageLigne(index, 'sexe'),
                            dateNaissance: messageLigne(index, 'dateNaissance'),
                            adresse: messageLigne(index, 'adresse'),
                            telephone: messageLigne(index, 'telephone'),
                            egliseId: messageLigne(index, 'egliseId'),
                          }}
                          surRetirer={fields.length > 1 ? () => remove(index) : null}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>

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
                    <Layers className="mr-2 size-4" aria-hidden />
                  )}
                  Enregistrer {formatNombre(fields.length)} baptisé
                  {fields.length > 1 ? 's' : ''}
                </Button>
              </DialogFooter>
            </form>
          )}

          {etape === 'rapport' && (
            <DialogFooter>
              <Button className="h-10" onClick={fermer}>
                Fermer
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Une ligne de la grille.
 *
 * Extraite pour que la saisie d'une ligne ne redessine pas les vingt-neuf
 * autres : à trente lignes de huit champs, le formulaire devenait pâteux à la
 * frappe.
 */
function LigneBaptise({
  index,
  control,
  register,
  cellules,
  eglises,
  implicite,
  erreurs,
  surRetirer,
  nationalites,
  idNationaliteDefaut,
  libelleNationaliteDefaut,
}: {
  index: number;
  control: ReturnType<typeof useForm<SaisirLotInput>>['control'];
  register: ReturnType<typeof useForm<SaisirLotInput>>['register'];
  cellules: CelluleOption[];
  eglises: OptionEntite[];
  implicite: string | null;
  erreurs: Record<string, string | undefined>;
  surRetirer: (() => void) | null;
  nationalites: OptionReferentiel[];
  /**
   * EF-BAP-07 — ce que prend une ligne laissée vide.
   *
   * Il est calculé UNE FOIS pour toute la grille : trente lignes qui
   * chercheraient chacune « Malagasy » dans le référentiel feraient trente
   * fois le même parcours à chaque frappe.
   */
  idNationaliteDefaut: string | null;
  libelleNationaliteDefaut: string | null;
}) {
  const egliseChoisie = useWatch({ control, name: `lignes.${index}.egliseId` });
  const eglise = (egliseChoisie as string | null) ?? implicite;

  // RG-05 — seules les cellules de l'église de CETTE ligne sont proposées.
  const cellulesDisponibles = useMemo(
    () => cellules.filter((c) => c.egliseId === eglise),
    [cellules, eglise],
  );

  /**
   * Un contrôle verrouillé DIT pourquoi.
   *
   * La cellule dépend de l'église (RG-05) : tant qu'aucune n'est choisie, il
   * n'y a rien à proposer. Mais un menu grisé sans un mot laisse croire à une
   * panne ou à un droit manquant — c'est ce qu'on a demandé le 12 août 2026.
   * Le motif remplace donc « Aucune ».
   */
  const motifCellule = !eglise
    ? "Choisir l'église d'abord"
    : cellulesDisponibles.length === 0
      ? 'Aucune cellule'
      : 'Aucune';

  const bordure = (message?: string) => (message ? 'h-9 border-destructive' : 'h-9');

  return (
    <TableRow>
      <TableCell className="text-muted-foreground font-mono text-xs tabular-nums">
        {index + 1}
      </TableCell>

      {!implicite && (
        <TableCell>
          <Controller
            control={control}
            name={`lignes.${index}.egliseId`}
            render={({ field }) => (
              <EntityPicker
                compact
                options={eglises}
                value={(field.value as string | null) ?? null}
                onChange={field.onChange}
                placeholder="Choisir"
                emptyMessage="Aucune église dans votre périmètre."
              />
            )}
          />
          {erreurs.egliseId && (
            <p className="text-destructive mt-1 text-xs">{erreurs.egliseId}</p>
          )}
        </TableCell>
      )}

      <TableCell>
        <Input
          className={bordure(erreurs.nom)}
          placeholder="Rakoto"
          aria-label={`Nom, ligne ${index + 1}`}
          aria-invalid={Boolean(erreurs.nom)}
          {...register(`lignes.${index}.nom`)}
        />
        {erreurs.nom && <p className="text-destructive mt-1 text-xs">{erreurs.nom}</p>}
      </TableCell>

      <TableCell>
        <Input
          className={bordure(erreurs.prenom)}
          placeholder="Randria"
          aria-label={`Prénom, ligne ${index + 1}`}
          aria-invalid={Boolean(erreurs.prenom)}
          {...register(`lignes.${index}.prenom`)}
        />
        {erreurs.prenom && (
          <p className="text-destructive mt-1 text-xs">{erreurs.prenom}</p>
        )}
      </TableCell>

      <TableCell>
        <Controller
          control={control}
          name={`lignes.${index}.sexe`}
          render={({ field }) => (
            <Select value={field.value ?? ''} onValueChange={field.onChange}>
              <SelectTrigger
                className="h-9 w-full"
                aria-label={`Sexe, ligne ${index + 1}`}
                aria-invalid={Boolean(erreurs.sexe)}
              >
                <SelectValue placeholder="—" />
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
        {erreurs.sexe && <p className="text-destructive mt-1 text-xs">{erreurs.sexe}</p>}
      </TableCell>

      <TableCell>
        <Controller
          control={control}
          name={`lignes.${index}.dateNaissance`}
          render={({ field }) => (
            <ChampDate
              value={(field.value as string) ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              className={bordure(erreurs.dateNaissance)}
              aria-invalid={Boolean(erreurs.dateNaissance)}
            />
          )}
        />
        {erreurs.dateNaissance && (
          <p className="text-destructive mt-1 text-xs">{erreurs.dateNaissance}</p>
        )}
      </TableCell>

      <TableCell>
        <Input
          className={bordure(erreurs.adresse)}
          placeholder="Lot IVJ 88 - Ankadifotsy"
          aria-label={`Adresse, ligne ${index + 1}`}
          aria-invalid={Boolean(erreurs.adresse)}
          {...register(`lignes.${index}.adresse`)}
        />
        {erreurs.adresse && (
          <p className="text-destructive mt-1 text-xs">{erreurs.adresse}</p>
        )}
      </TableCell>

      <TableCell>
        <Input
          className={bordure(erreurs.telephone)}
          placeholder="034 00 000 00"
          aria-label={`Téléphone, ligne ${index + 1}`}
          aria-invalid={Boolean(erreurs.telephone)}
          {...register(`lignes.${index}.telephone`)}
        />
        {erreurs.telephone && (
          <p className="text-destructive mt-1 text-xs">{erreurs.telephone}</p>
        )}
      </TableCell>

      {/*
        EF-BAP-07 — LA NATIONALITÉ, ligne par ligne et FACULTATIVE.

        « Malagasy » est proposé en tête sous son vrai nom, et non sous un
        « Aucune » qui ferait croire à une absence : la valeur n'est pas vide,
        elle est celle que le serveur posera. Dire « aucune » pour signifier
        « la plus courante » aurait été un mensonge d'interface.
      */}
      <TableCell>
        <Controller
          control={control}
          name={`lignes.${index}.nationaliteId`}
          render={({ field }) => (
            <Select
              value={(field.value as string | null) ?? 'defaut'}
              onValueChange={(v) => field.onChange(v === 'defaut' ? null : v)}
            >
              <SelectTrigger
                className="h-9 w-full"
                aria-label={`Nationalité, ligne ${index + 1}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="defaut">
                  {libelleNationaliteDefaut ?? 'Par défaut'}
                </SelectItem>
                {nationalites
                  .filter((n) => n.id !== idNationaliteDefaut)
                  .map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.libelle}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        />
      </TableCell>

      <TableCell>
        <Controller
          control={control}
          name={`lignes.${index}.celluleId`}
          render={({ field }) => (
            <Select
              value={(field.value as string | null) ?? 'aucune'}
              onValueChange={(v) => field.onChange(v === 'aucune' ? null : v)}
              disabled={cellulesDisponibles.length === 0}
            >
              <SelectTrigger
                className="h-9 w-full"
                aria-label={`Cellule, ligne ${index + 1}`}
                title={motifCellule}
              >
                <SelectValue placeholder={motifCellule} />
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
      </TableCell>

      <TableCell>
        {surRetirer && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={surRetirer}
            aria-label={`Retirer la ligne ${index + 1}`}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * Le rapport — EF-BAP-07.
 *
 * Une ligne écartée n'emporte pas les autres : il faut donc dire laquelle, et
 * pourquoi. Un compte global (« 28 sur 30 ») laisserait chercher les deux
 * manquantes dans une liste de trente noms.
 */
function RapportLot({ rapport }: { rapport: ResultatLot }) {
  return (
    <div className="space-y-6 py-2">
      {rapport.enregistres.length > 0 && (
        <Alert>
          <CircleCheck className="size-4" aria-hidden />
          <AlertTitle>
            {formatNombre(rapport.enregistres.length)} baptisé
            {rapport.enregistres.length > 1 ? 's' : ''} enregistré
            {rapport.enregistres.length > 1 ? 's' : ''}
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-1">
              {rapport.enregistres.map((e) => (
                <li key={e.matricule} className="text-sm">
                  <span className="font-mono text-xs tabular-nums">{e.matricule}</span>
                  {' — '}
                  {e.nom}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {rapport.ceremoniesManquantes > 0 && (
        <Alert>
          <AlertCircle className="size-4" aria-hidden />
          <AlertTitle>Enregistré, avec une réserve</AlertTitle>
          <AlertDescription>
            Les fiches sont créées et portent leur date de baptême — elles comptent dans
            les indicateurs. Seules les informations de cérémonie (lieu, célébrants,
            session) n’ont pas pu être enregistrées.
          </AlertDescription>
        </Alert>
      )}

      {rapport.refuses.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertTitle>
            {formatNombre(rapport.refuses.length)} ligne
            {rapport.refuses.length > 1 ? 's' : ''} écartée
            {rapport.refuses.length > 1 ? 's' : ''}
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-1">
              {rapport.refuses.map((r) => (
                <li key={r.ligne} className="text-sm">
                  <span className="font-mono text-xs tabular-nums">Ligne {r.ligne}</span>
                  {' — '}
                  {r.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
