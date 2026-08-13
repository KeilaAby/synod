'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2, Paperclip, Plus, Repeat, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { Field, TextField } from '@/components/shared/field';
import { avertir } from '@/components/shared/messages';
import { PermissionGate } from '@/components/shared/permission-gate';
import { StatusBadge } from '@/components/shared/status-badge';
import { EntityPicker, type OptionEntite } from '@/components/structure/entity-picker';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { modifierMouvement, saisirMouvement } from '@/lib/actions/finances';
import { televerserJustificatif } from '@/lib/actions/justificatifs';
import type { CategorieFinance, MouvementListe } from '@/lib/data/finances';
import { LIBELLES_SENS, estModifiable } from '@/lib/domain/finance';
import { formatMontant } from '@/lib/utils/format';
import {
  type SaisirMouvementInput,
  saisirMouvementSchema,
} from '@/lib/validation/finance';

/**
 * Saisie d'un mouvement financier — EF-FIN-01, EF-FIN-05, EF-FIN-08.
 *
 * ON NE DEMANDE JAMAIS « RECETTE OU DEPENSE ? » (RG-13). Le sens est porté par
 * la catégorie : « Dîme » est une recette, « Loyer » une dépense, et le poser à
 * la main permettrait d'enregistrer une dépense dans une catégorie de recette —
 * le solde deviendrait faux sans qu'aucune ligne ne paraisse anormale. Le sens
 * s'AFFICHE dès que la catégorie est choisie, pour que rien ne soit caché.
 *
 * UN SEUL CHEMIN pour créer et pour modifier (règle 16) : `mouvement` distingue
 * les deux. Deux formulaires pour la même écriture divergent toujours.
 */
export function MouvementDialog({
  entites,
  categories,
  categoriesParDefaut,
  mouvement,
  devise,
  declencheur,
  peutDeleguer,
}: {
  entites: OptionEntite[];
  categories: CategorieFinance[];
  /** Entité présélectionnée : celle du filtre courant, sinon le rattachement. */
  categoriesParDefaut?: string | null;
  /** Renseigné : le formulaire modifie au lieu de créer. */
  mouvement?: MouvementListe | null;
  devise: string;
  declencheur?: React.ReactNode;
  /** EF-FIN-05 — la case « pour le compte de » n'apparaît qu'avec le droit. */
  peutDeleguer: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fichier, setFichier] = useState<File | null>(null);

  /**
   * Vider un <input type="file"> demande de le REMONTER.
   *
   * Sa valeur n'est pas pilotable depuis React — le navigateur l'interdit, pour
   * qu'une page ne puisse pas designer un fichier a la place de l'utilisateur.
   * On passait donc par une `ref` et une affectation directe de `value`, ce que
   * le compilateur React refuse de voir atteinte pendant le rendu. Changer la
   * CLÉ remonte un champ neuf : même effet, sans `ref`.
   */
  const [serie, setSerie] = useState(0);

  /** Distingue les deux boutons pendant l'attente : un seul doit tourner. */
  const [enchaine, setEnchaine] = useState(false);

  const enModification = Boolean(mouvement);

  // RG-17 — un mouvement valide est fige, sa piece jointe comprise.
  const modifiable = !mouvement || estModifiable(mouvement.statut);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SaisirMouvementInput>({
    resolver: zodResolver(saisirMouvementSchema),
    defaultValues: {
      entiteId: mouvement?.entity_id ?? categoriesParDefaut ?? undefined,
      categorieId: mouvement?.categorie_id ?? undefined,
      montant: mouvement ? String(mouvement.montant) : '',
      // La date du jour : on saisit une opération le jour où elle a lieu, ou le
      // lendemain. Pré-remplir épargne un aller-retour vers le calendrier.
      dateOperation: mouvement?.date_operation ?? new Date().toISOString().slice(0, 10),
      libelle: mouvement?.libelle ?? '',
      reference: mouvement?.reference ?? '',
      estDelegue: mouvement?.est_delegue ?? false,
    } as Partial<SaisirMouvementInput> as SaisirMouvementInput,
  });

  const categorieChoisie = useWatch({ control, name: 'categorieId' });

  /**
   * Le sens SE VOIT dès que la catégorie est choisie.
   *
   * Il n'est pas saisi (RG-13), mais le cacher reviendrait à faire enregistrer
   * une dépense à qui croyait saisir une recette.
   */
  const sens = useMemo(
    () => categories.find((c) => c.id === categorieChoisie)?.sens ?? null,
    [categories, categorieChoisie],
  );

  // Recettes et dépenses séparées dans la liste : on cherche « une catégorie de
  // dépense », pas « la dix-septième ligne ».
  const groupes = useMemo(
    () => [
      { sens: 'RECETTE' as const, items: categories.filter((c) => c.sens === 'RECETTE') },
      { sens: 'DEPENSE' as const, items: categories.filter((c) => c.sens === 'DEPENSE') },
    ],
    [categories],
  );

  function viderLeFichier() {
    setFichier(null);
    setSerie((n) => n + 1);
  }

  function fermer() {
    reset();
    viderLeFichier();
    setErreur(null);
    setOuvert(false);
  }

  /**
   * La pièce part APRÈS le mouvement, et ne le remet pas en cause.
   *
   * Elle a besoin de l'identifiant, qui n'existe qu'une fois la ligne écrite :
   * deux appels, donc, et jamais une transaction. L'état intermédiaire est
   * bénin — le mouvement existe, correct, sans son justificatif — mais il se
   * DIT, plutôt que de se taire (règle 20).
   */
  async function joindreLaPiece(mouvementId: string): Promise<boolean> {
    if (!fichier) return true;

    const corps = new FormData();
    corps.set('mouvementId', mouvementId);
    corps.set('justificatif', fichier);

    const depot = await televerserJustificatif(corps);
    if (depot.ok) return true;

    avertir(
      `Le mouvement est enregistré, mais la pièce justificative n’a pas pu être jointe : ${depot.error}`,
      { ton: 'information', titre: 'Enregistré, sans la pièce' },
    );
    return false;
  }

  async function envoyer(valeurs: SaisirMouvementInput, enchainer = false) {
    setErreur(null);
    setEnchaine(enchainer);

    /**
     * L'identifiant vient de la CRÉATION, pas de la modification.
     *
     * Les deux actions ne rendent pas la même chose — `saisirMouvement` rend
     * `{ id }`, `modifierMouvement` ne rend rien —, et la pièce jointe a besoin
     * de cet identifiant. On le résout dans la branche où il existe plutôt que
     * de le tirer d'un résultat qui, la moitié du temps, ne le porte pas.
     */
    let identifiant = mouvement?.id ?? '';

    const resultat = enModification
      ? await modifierMouvement({ ...valeurs, id: mouvement!.id })
      : await saisirMouvement(valeurs);

    if (!resultat.ok) {
      for (const [champ, messages] of Object.entries(resultat.fieldErrors ?? {})) {
        if (champ in valeurs) {
          setError(champ as keyof SaisirMouvementInput, { message: messages[0] });
        }
      }
      setErreur(resultat.error);
      return;
    }

    if (!enModification) identifiant = (resultat.data as { id: string }).id;

    const jointe = await joindreLaPiece(identifiant);

    // La notification ne porte que ce qui se constate d'un coup d'œil : quand
    // la pièce a manqué, `avertir` a déjà dit l'essentiel (règle 30).
    if (jointe) {
      toast.success(enModification ? 'Mouvement modifié.' : 'Mouvement enregistré.');
    }

    router.refresh();

    if (!enchainer) {
      fermer();
      return;
    }

    /**
     * EF-FIN-08 — on garde ce qui SE RÉPÈTE, on vide ce qui change.
     *
     * Entité, catégorie et date sont les trois champs communs à toute une
     * série ; le montant, le libellé, la référence et la pièce sont propres à
     * chaque ligne. Les conserver ferait ressaisir un montant par-dessus le
     * précédent — et un jour, on oublierait de le faire.
     */
    reset({
      ...valeurs,
      montant: '',
      libelle: '',
      reference: '',
    } as SaisirMouvementInput);
    viderLeFichier();
  }

  return (
    <>
      {declencheur ? (
        <span onClick={() => setOuvert(true)}>{declencheur}</span>
      ) : (
        <PermissionGate perm="finance.create">
          <Button className="h-10" onClick={() => setOuvert(true)}>
            <Plus className="mr-2 size-4" aria-hidden />
            Nouveau mouvement
          </Button>
        </PermissionGate>
      )}

      <Dialog open={ouvert} onOpenChange={(v) => (v ? setOuvert(true) : fermer())}>
        {/*
          Deux colonnes plutôt qu'une longue bande : les six champs tenaient
          empilés, mais imposaient de faire défiler au milieu de la saisie, et
          l'on perdait de vue ce qu'on venait de remplir. Sous 768 px elles se
          replient l'une sous l'autre.
        */}
        <DialogContent className="max-h-[92vh] w-[min(96vw,60rem)] overflow-y-auto sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {enModification ? 'Modifier le mouvement' : 'Nouveau mouvement'}
            </DialogTitle>
            <DialogDescription>
              Le sens — recette ou dépense — vient de la catégorie, il ne se saisit pas.
            </DialogDescription>
          </DialogHeader>

          {ouvert && (
            /*
              `(v) => envoyer(v, false)` et non `envoyer` : `handleSubmit`
              passe l'ÉVÉNEMENT en second argument, qui viendrait alors se
              loger dans `enchainer` — un objet, donc vrai, et chaque envoi
              enchaînerait sans qu'on l'ait demandé.
            */
            <form
              onSubmit={handleSubmit((v) => envoyer(v, false))}
              className="space-y-6 py-2"
              noValidate
            >
              {erreur && (
                <Alert variant="destructive" role="alert">
                  <AlertCircle className="size-4" aria-hidden />
                  <AlertDescription>{erreur}</AlertDescription>
                </Alert>
              )}

              {/* Ce qui RATTACHE l'écriture à gauche, ce qui la CHIFFRE à
                  droite : deux questions distinctes, deux colonnes. */}
              <div className="grid gap-6 md:grid-cols-2 md:gap-10">
                <section className="space-y-6">
                  <p className="eyebrow">Rattachement</p>

                  <Field label="Entité" required error={errors.entiteId?.message}>
                    {(aria) => (
                      <Controller
                        control={control}
                        name="entiteId"
                        render={({ field }) => (
                          <EntityPicker
                            {...aria}
                            options={entites}
                            value={field.value ?? null}
                            onChange={field.onChange}
                            placeholder="Choisir une entité"
                            emptyMessage="Aucune entité dans votre périmètre."
                          />
                        )}
                      />
                    )}
                  </Field>

                  <Field
                    label="Catégorie"
                    required
                    error={errors.categorieId?.message}
                    hint={
                      sens
                        ? undefined
                        : 'Elle détermine s’il s’agit d’une recette ou d’une dépense.'
                    }
                  >
                    {(aria) => (
                      <Controller
                        control={control}
                        name="categorieId"
                        render={({ field }) => (
                          <Select
                            value={field.value ?? ''}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger {...aria} className="h-10 w-full">
                              <SelectValue placeholder="Choisir" />
                            </SelectTrigger>
                            <SelectContent>
                              {groupes.map((groupe) =>
                                groupe.items.length === 0 ? null : (
                                  <div key={groupe.sens}>
                                    <p className="text-muted-foreground px-2 py-1.5 text-xs font-medium">
                                      {LIBELLES_SENS[groupe.sens]}s
                                    </p>
                                    {groupe.items.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {c.libelle}
                                      </SelectItem>
                                    ))}
                                  </div>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    )}
                  </Field>

                  {sens && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-sm">
                        Cette catégorie enregistre une
                      </span>
                      <StatusBadge tone={sens === 'RECETTE' ? 'success' : 'danger'}>
                        {LIBELLES_SENS[sens].toLocaleLowerCase('fr')}
                      </StatusBadge>
                    </div>
                  )}

                  {/* EF-FIN-05/06 — la saisie déléguée se DÉCLARE et se voit
                      ensuite dans toutes les listes. Sans le droit, la case
                      n'existe pas. */}
                  {peutDeleguer && !enModification && (
                    <Controller
                      control={control}
                      name="estDelegue"
                      render={({ field }) => (
                        <label className="border-border flex items-start gap-3 rounded-lg border p-4">
                          <Checkbox
                            checked={Boolean(field.value)}
                            onCheckedChange={field.onChange}
                            className="mt-0.5"
                          />
                          <span className="space-y-1">
                            <span className="block text-sm font-medium">
                              Saisie pour le compte de cette entité
                            </span>
                            <span className="text-muted-foreground block text-xs">
                              À cocher lorsque l’entité n’a pas accès à l’application.
                              Le mouvement lui est rattaché et porte la mention
                              « déléguée » avec votre nom.
                            </span>
                          </span>
                        </label>
                      )}
                    />
                  )}
                </section>

                {/* --- L'opération elle-même --- */}
                <section className="lg:border-border space-y-6 md:border-l md:pl-10">
                  <p className="eyebrow">L’opération</p>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <Field
                      label={`Montant (${devise})`}
                      required
                      error={errors.montant?.message}
                      hint="La virgule décimale est acceptée."
                    >
                      {(aria) => (
                        <Input
                          {...aria}
                          inputMode="decimal"
                          placeholder="150000"
                          className="h-10 tabular-nums"
                          {...register('montant')}
                        />
                      )}
                    </Field>

                    <Field
                      label="Date de l’opération"
                      required
                      error={errors.dateOperation?.message}
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
                  </div>

                  <TextField
                    label="Libellé"
                    placeholder="Collecte du dimanche"
                    hint="Facultatif, mais c’est ce qui rendra la ligne relisible dans six mois."
                    error={errors.libelle?.message}
                    {...register('libelle')}
                  />

                  <TextField
                    label="Référence"
                    placeholder="REC-2026-0148"
                    hint="Facultatif — numéro de reçu, de pièce ou de bordereau."
                    error={errors.reference?.message}
                    {...register('reference')}
                  />

                  {/* EF-FIN-07 — la pièce justificative. Absente d'un mouvement
                      validé : elle est figée avec lui (RG-17). */}
                  {modifiable && (
                    <Field
                      label="Pièce justificative"
                      hint="Facultatif — PDF, JPEG ou PNG, 10 Mo au maximum."
                    >
                      {(aria) => (
                        <div className="space-y-2">
                          <Input
                            {...aria}
                            key={serie}
                            type="file"
                            accept="application/pdf,image/jpeg,image/png"
                            className="h-10"
                            onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
                          />
                          {mouvement?.justificatif_key && !fichier && (
                            <p className="text-muted-foreground flex items-center gap-2 text-xs">
                              <Paperclip className="size-3" aria-hidden />
                              Une pièce est déjà jointe. En déposer une autre la
                              remplacera.
                            </p>
                          )}
                        </div>
                      )}
                    </Field>
                  )}
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

                {/* EF-FIN-08 — la saisie en SÉRIE. Une collecte du dimanche,
                    c'est huit lignes de la même entité, dans la même catégorie,
                    à la même date : rouvrir la fenêtre huit fois pour les
                    ressaisir est ce que cette exigence évite. */}
                {!enModification && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    disabled={isSubmitting}
                    onClick={() => void handleSubmit((v) => envoyer(v, true))()}
                  >
                    {isSubmitting && enchaine ? (
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    ) : (
                      <Repeat className="mr-2 size-4" aria-hidden />
                    )}
                    Enregistrer et saisir un autre
                  </Button>
                )}

                <Button type="submit" className="h-10" disabled={isSubmitting}>
                  {isSubmitting && !enchaine ? (
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  ) : (
                    <Wallet className="mr-2 size-4" aria-hidden />
                  )}
                  {enModification ? 'Enregistrer' : 'Enregistrer le mouvement'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Le montant, signé selon le sens — pour les listes et le détail. */
export function MontantSigne({
  montant,
  sens,
  devise,
}: {
  montant: number;
  sens: 'RECETTE' | 'DEPENSE';
  devise: string;
}) {
  return (
    <span
      className={
        sens === 'RECETTE'
          ? 'tabular-nums font-semibold text-emerald-700'
          : 'tabular-nums font-semibold text-rose-700'
      }
    >
      {sens === 'RECETTE' ? '+' : '−'}
      {formatMontant(montant, devise)}
    </span>
  );
}
