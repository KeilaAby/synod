'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Coins, Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { CroyantPicker } from '@/components/croyants/croyant-picker';
import { Field, TextField } from '@/components/shared/field';
import { avertir } from '@/components/shared/messages';
import { PermissionGate } from '@/components/shared/permission-gate';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { saisirCollecteDime } from '@/lib/actions/dimes';
import type { CategorieFinance } from '@/lib/data/finances';
import {
  EVENEMENTS_DIME,
  LIBELLES_EVENEMENT,
  type ModeDime,
  admetLeDetail,
  modeEffectif,
  peutVerser,
  totalCollecte,
} from '@/lib/domain/dime';
import { formatMontant, formatNombre } from '@/lib/utils/format';
import { type SaisirCollecteInput, saisirCollecteSchema } from '@/lib/validation/dime';

/**
 * Saisie d'une collecte de dîmes — EF-FIN-27 à 31, RG-33.
 *
 * LE TOTAL NE SE SAISIT PAS, IL S'AFFICHE. En mode détaillé, il est la somme
 * des versements : le laisser saisir à côté produirait deux vérités — un
 * million annoncé pour neuf cent mille de détail — et personne ne saurait
 * laquelle croire. La fonction SQL fait le même calcul ; ce total-ci sert à le
 * voir monter pendant la saisie.
 *
 * LE MODE VIENT DE L'ENTITÉ (EF-FIN-28), et l'écran s'y plie : la grille
 * n'apparaît qu'en mode détaillé. Un événement national n'admet jamais le
 * détail — personne ne tient trois mille enveloppes à la main.
 */
export interface CroyantOption {
  readonly id: string;
  readonly nom: string;
  readonly prenom: string;
  readonly matricule: string;
  /**
   * Le CHEMIN de son église, pas seulement son identifiant.
   *
   * Lors d'un rassemblement de district, tous les croyants du district peuvent
   * verser — pas seulement ceux rattachés au district lui-même, qui sont
   * généralement zéro. Comparer les identifiants n'aurait donc rien proposé
   * (EF-FIN-30) ; c'est le sous-arbre qui décide, et il se lit dans le chemin.
   */
  readonly eglisePath: string;
  /** Cle de stockage de la photo (EF-CRO-09), resolue par `photos`. */
  readonly photoKey?: string | null;
}

export function CollecteDialog({
  entites,
  categories,
  devise,
  modes,
  croyants = [],
  croyantsTronques = false,
  enveloppes = {},
  photos = {},
}: {
  entites: OptionEntite[];
  categories: CategorieFinance[];
  devise: string;
  /** EF-FIN-28 — le mode DÉCIDÉ par chaque entité ; `null` = défaut. */
  modes: Record<string, ModeDime | null>;
  croyants?: CroyantOption[];
  /** Le périmètre dépasse le plafond : la liste proposée est une tranche. */
  croyantsTronques?: boolean;
  /** Numéro d'enveloppe connu de chaque croyant, pour ne pas le retaper. */
  enveloppes?: Record<string, string>;
  /** Clé de stockage -> URL signée, signées en lot par la page (EF-CRO-09). */
  photos?: Record<string, string>;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SaisirCollecteInput>({
    resolver: zodResolver(saisirCollecteSchema),
    defaultValues: {
      dateOperation: new Date().toISOString().slice(0, 10),
      evenement: 'CULTE',
      libelle: '',
      reference: '',
      montantGlobal: '',
      versements: [],
    } as Partial<SaisirCollecteInput> as SaisirCollecteInput,
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'versements',
  });

  const entiteChoisie = useWatch({ control, name: 'entiteCollecteId' });
  const evenement = useWatch({ control, name: 'evenement' });
  /**
   * `useWatch` rend le type d'ENTREE du schéma, où le montant est encore une
   * chaîne et l'enveloppe facultative. On le nomme ici plutôt que de le
   * réaffirmer à chaque usage.
   *
   * Le repli sur `[]` est mémoïsé : écrit en ligne, il produirait un tableau
   * NEUF à chaque rendu, et le `useMemo` du total se recalculerait toujours.
   */
  const versementsSurveilles = useWatch({ control, name: 'versements' });

  const lignes = useMemo(
    () => (versementsSurveilles ?? []) as { croyantId?: string; montant?: string }[],
    [versementsSurveilles],
  );

  /**
   * Le mode EFFECTIF : celui de l'entité, sinon le défaut de l'organisation.
   * Jamais celui du parent — chaque bureau gère ses finances.
   */
  const mode = modeEffectif(entiteChoisie ? (modes[entiteChoisie] ?? null) : null);

  const detaille = mode === 'DETAILLE' && admetLeDetail(evenement ?? 'CULTE');

  /**
   * EF-FIN-30 — qui peut verser lors de CETTE collecte.
   *
   * Le critère est le SOUS-ARBRE de l'entité hôte : lors d'un rassemblement de
   * district, tous les croyants du district peuvent verser, quelle que soit
   * leur église. Comparer les identifiants n'aurait rien proposé — presque
   * aucun croyant n'est rattaché à un district directement.
   */
  const eligibles = useMemo(() => {
    const hote = entites.find((e) => e.id === entiteChoisie);
    if (!hote) return [];

    return croyants
      .filter((c) => peutVerser(c.eglisePath, hote.path))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [croyants, entiteChoisie, entites]);

  const total = useMemo(
    () =>
      totalCollecte(
        lignes.map((l) => ({
          croyantId: l.croyantId ?? '',
          montant: Number((l.montant ?? '0').replace(',', '.')) || 0,
        })),
      ),
    [lignes],
  );

  function fermer() {
    reset();
    setErreur(null);
    setOuvert(false);
  }

  async function envoyer(valeurs: SaisirCollecteInput) {
    setErreur(null);

    const resultat = await saisirCollecteDime(valeurs);

    if (!resultat.ok) {
      setErreur(resultat.error);
      return;
    }

    const recus = resultat.data.recus.length;
    toast.success('Collecte enregistrée.');

    /**
     * Les reçus sont annoncés, et c'est ce qui relie l'écran au papier : le
     * membre du bureau recopie la référence sur le talon qu'il remet
     * (EF-FIN-27). Un pop-up qu'on ferme, pas une notification qui s'efface.
     */
    if (recus > 0) {
      avertir(
        `${formatNombre(recus)} reçu${recus > 1 ? 's' : ''} attribué${recus > 1 ? 's' : ''} :\n\n` +
          resultat.data.recus.map((r) => `• ${r.recu}`).join('\n'),
        { ton: 'information', titre: 'Reçus à reporter sur les talons' },
      );
    }

    fermer();
    router.refresh();
  }

  return (
    <>
      <PermissionGate perm="finance.dime.collect">
        <Button className="h-10" onClick={() => setOuvert(true)}>
          <Plus className="mr-2 size-4" aria-hidden />
          Nouvelle collecte
        </Button>
      </PermissionGate>

      <Dialog open={ouvert} onOpenChange={(v) => (v ? setOuvert(true) : fermer())}>
        <DialogContent className="max-h-[92vh] w-[min(98vw,72rem)] overflow-x-hidden overflow-y-auto sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="text-2xl">Nouvelle collecte de dîmes</DialogTitle>
            <DialogDescription>
              La dîme revient au Siège : votre entité la collecte, en tient le détail
              et en délivre les reçus. Elle n’entre pas dans son solde.
            </DialogDescription>
          </DialogHeader>

          {ouvert && (
            <form
              onSubmit={handleSubmit(envoyer)}
              className="min-w-0 space-y-6 py-2"
              noValidate
            >
              {erreur && (
                <Alert variant="destructive" role="alert">
                  <AlertCircle className="size-4" aria-hidden />
                  <AlertDescription>{erreur}</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-6 md:grid-cols-2 md:gap-10">
                <section className="space-y-6">
                  <p className="eyebrow">La collecte</p>

                  <Field
                    label="Entité collectrice"
                    required
                    error={errors.entiteCollecteId?.message}
                    hint="Celle qui reçoit les enveloppes — église, paroisse, district…"
                  >
                    {(aria) => (
                      <Controller
                        control={control}
                        name="entiteCollecteId"
                        render={({ field }) => (
                          <EntityPicker
                            {...aria}
                            options={entites}
                            value={field.value ?? null}
                            onChange={(v) => {
                              /**
                               * CHANGER D'ENTITÉ VIDE LES VERSEMENTS.
                               *
                               * Les croyants déjà saisis appartiennent à
                               * l'entité précédente : les garder enverrait des
                               * versements de croyants qui n'ont pas le droit
                               * de verser ici (EF-FIN-30), et le refus
                               * n'arriverait qu'à l'enregistrement, une fois
                               * trente lignes remplies.
                               *
                               * Seule la GRILLE est vidée : la date, le
                               * libellé, l'événement et la catégorie n'ont rien
                               * à voir avec l'entité et se ressaisiraient pour
                               * rien.
                               */
                              if (v !== field.value) replace([]);
                              field.onChange(v);
                            }}
                            placeholder="Choisir une entité"
                            emptyMessage="Aucune entité dans votre périmètre."
                          />
                        )}
                      />
                    )}
                  </Field>

                  <Field
                    label="Événement"
                    required
                    error={errors.evenement?.message}
                    hint="Un rassemblement accueille les croyants de tout son sous-arbre."
                  >
                    {(aria) => (
                      <Controller
                        control={control}
                        name="evenement"
                        render={({ field }) => (
                          <Select value={field.value ?? ''} onValueChange={field.onChange}>
                            <SelectTrigger {...aria} className="h-10 w-full">
                              <SelectValue placeholder="Choisir" />
                            </SelectTrigger>
                            <SelectContent>
                              {EVENEMENTS_DIME.map((e) => (
                                <SelectItem key={e} value={e}>
                                  {LIBELLES_EVENEMENT[e]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    )}
                  </Field>

                  <Field label="Catégorie" required error={errors.categorieId?.message}>
                    {(aria) => (
                      <Controller
                        control={control}
                        name="categorieId"
                        render={({ field }) => (
                          <Select value={field.value ?? ''} onValueChange={field.onChange}>
                            <SelectTrigger {...aria} className="h-10 w-full">
                              <SelectValue placeholder="Choisir" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.libelle}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    )}
                  </Field>
                </section>

                <section className="space-y-6 md:border-border md:border-l md:pl-10">
                  <p className="eyebrow">Le culte</p>

                  <Field
                    label="Date du culte"
                    required
                    error={errors.dateOperation?.message}
                    hint="Les dîmes doivent parvenir au Siège dans la semaine suivante."
                  >
                    {(aria) => (
                      <Input
                        {...aria}
                        type="date"
                        className="h-10 tabular-nums"
                        {...register('dateOperation')}
                      />
                    )}
                  </Field>

                  <TextField
                    label="Libellé"
                    placeholder="Culte du dimanche matin"
                    hint="Facultatif."
                    error={errors.libelle?.message}
                    {...register('libelle')}
                  />

                  <TextField
                    label="Référence"
                    placeholder="Bordereau interne, cahier de caisse…"
                    hint="Facultatif."
                    error={errors.reference?.message}
                    {...register('reference')}
                  />

                  {/* Mode GLOBAL, ou événement national : un seul montant. */}
                  {!detaille && (
                    <Field
                      label={`Montant global (${devise})`}
                      required
                      error={errors.montantGlobal?.message}
                      hint={
                        admetLeDetail(evenement ?? 'CULTE')
                          ? 'Cette entité saisit ses dîmes en montant global.'
                          : 'Un événement national se saisit toujours en global.'
                      }
                    >
                      {(aria) => (
                        <Input
                          {...aria}
                          inputMode="decimal"
                          placeholder="1500000"
                          className="h-10 tabular-nums"
                          {...register('montantGlobal')}
                        />
                      )}
                    </Field>
                  )}
                </section>
              </div>

              {/* --- Le détail, en mode détaillé seulement --- */}
              {detaille && (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="eyebrow">
                      Les versements — {formatNombre(fields.length)} enveloppe
                      {fields.length > 1 ? 's' : ''}
                    </p>

                    <div className="flex items-center gap-4">
                      {/* Le total SE CALCULE : deux vérités valent moins qu'une. */}
                      <p className="text-sm">
                        Total{' '}
                        <span className="font-semibold tabular-nums">
                          {formatMontant(total, devise)}
                        </span>
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9"
                        disabled={!entiteChoisie}
                        onClick={() =>
                          /*
                            `NonNullable` : le schéma porte un `.default([])`,
                            donc le type d'entrée admet `undefined` et ne
                            s'indexe pas directement.
                          */
                          append({
                            croyantId: '',
                            montant: '',
                            enveloppe: '',
                          } as NonNullable<SaisirCollecteInput['versements']>[number])
                        }
                      >
                        <Plus className="mr-2 size-4" aria-hidden />
                        Ajouter une enveloppe
                      </Button>
                    </div>
                  </div>

                  {/*
                    Une liste tronquée se DIT. Sans ce mot, un croyant absent
                    du menu se lirait « il n'existe pas » — et quelqu'un
                    créerait une fiche en double pour le faire apparaître.
                  */}
                  {croyantsTronques && entiteChoisie && (
                    <p className="text-muted-foreground text-xs">
                      Votre périmètre dépasse le plafond de chargement : la liste
                      proposée n’en est qu’une partie.
                    </p>
                  )}

                  {!entiteChoisie ? (
                    <p className="text-muted-foreground border-border rounded-lg border p-6 text-center text-sm">
                      Choisissez d’abord l’entité collectrice : ce sont ses croyants qui
                      pourront verser.
                    </p>
                  ) : eligibles.length === 0 ? (
                    <p className="text-muted-foreground border-border rounded-lg border p-6 text-center text-sm">
                      Aucun croyant n’est rattaché à cette entité ni à ses descendants.
                    </p>
                  ) : (
                    <div className="border-border min-w-0 rounded-lg border">
                      <Table className="table-fixed">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[6%]">#</TableHead>
                            <TableHead className="w-[46%]">Croyant *</TableHead>
                            <TableHead className="w-[20%]">Enveloppe</TableHead>
                            <TableHead className="w-[22%]">Montant *</TableHead>
                            <TableHead className="w-[6%]" />
                          </TableRow>
                        </TableHeader>

                        <TableBody>
                          {fields.length === 0 && (
                            <TableRow>
                              <TableCell
                                colSpan={5}
                                className="text-muted-foreground py-6 text-center text-sm"
                              >
                                Aucune enveloppe. Ajoutez-en une pour commencer.
                              </TableCell>
                            </TableRow>
                          )}

                          {fields.map((champ, index) => (
                            /*
                              AUCUN FOND AU SURVOL sur une ligne de SAISIE.
                              Le fond de `TableRow` sert à suivre une ligne
                              qu'on LIT ; ici chaque cellule est un contrôle
                              qui porte déjà son propre état — un aplat en plus
                              se déclenche au moindre passage de souris et fait
                              clignoter la grille pendant qu'on la remplit.

                              `has-aria-expanded` est neutralisé pour la même
                              raison : ouvrir le sélecteur de croyant colorait
                              la ligne entière.
                            */
                            <TableRow
                              key={champ.id}
                              className="hover:bg-transparent has-aria-expanded:bg-transparent"
                            >
                              <TableCell className="text-muted-foreground text-xs tabular-nums">
                                {index + 1}
                              </TableCell>

                              <TableCell>
                                {/* Une église de deux cents membres ne se
                                    parcourt pas à l'œil : recherche, matricule
                                    et portrait — deux homonymes sont sinon
                                    indiscernables. */}
                                <Controller
                                  control={control}
                                  name={`versements.${index}.croyantId`}
                                  render={({ field }) => (
                                    <CroyantPicker
                                      options={eligibles}
                                      value={field.value ?? null}
                                      onChange={field.onChange}
                                      photos={photos}
                                      placeholder="Choisir"
                                      aria-label={`Croyant, ligne ${index + 1}`}
                                    />
                                  )}
                                />
                              </TableCell>

                              <TableCell>
                                <Input
                                  className="h-9"
                                  /*
                                    Le numéro connu du croyant sert de
                                    PLACEHOLDER, pas de valeur : il se voit sans
                                    s'imposer, et celui qui a changé d'enveloppe
                                    tape la sienne par-dessus.
                                  */
                                  placeholder={
                                    enveloppes[lignes[index]?.croyantId ?? ''] ??
                                    'N° enveloppe'
                                  }
                                  aria-label={`Enveloppe, ligne ${index + 1}`}
                                  {...register(`versements.${index}.enveloppe`)}
                                />
                              </TableCell>

                              <TableCell>
                                <Input
                                  className="h-9 tabular-nums"
                                  inputMode="decimal"
                                  placeholder="10000"
                                  aria-label={`Montant, ligne ${index + 1}`}
                                  {...register(`versements.${index}.montant`)}
                                />
                              </TableCell>

                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-9"
                                  onClick={() => remove(index)}
                                  aria-label={`Retirer la ligne ${index + 1}`}
                                >
                                  <Trash2 className="size-4" aria-hidden />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </section>
              )}

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
                    <Coins className="mr-2 size-4" aria-hidden />
                  )}
                  Enregistrer la collecte
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
