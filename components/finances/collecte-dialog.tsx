'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Coins, Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { ChampDate } from '@/components/shared/champ-date';
import { CroyantPicker } from '@/components/croyants/croyant-picker';
import { SuggestionsEnveloppe } from '@/components/finances/suggestions-enveloppe';
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
import {
  EVENEMENTS_DIME,
  LIBELLES_EVENEMENT,
  LIBELLES_NATURE,
  NATURES_VERSEMENT,
  NIVEAU_HOTE,
  type ModeDime,
  type NatureVersement,
  type OptionEvenementDime,
  admetLeDetail,
  modeEffectif,
  suggestionsPourEnveloppe,
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
   * Le NOM de son église, affiché sous le sien.
   *
   * Depuis que la liste est globale (EF-FIN-32), deux croyants de deux églises
   * voisines s'y côtoient : sans ce repère, on ne voit pas qu'on est en train
   * de saisir un visiteur — ce qui est licite, mais mérite d'être vu.
   */
  readonly egliseNom: string | null;
  /** Cle de stockage de la photo (EF-CRO-09), resolue par `photos`. */
  readonly photoKey?: string | null;
}

export function CollecteDialog({
  entites,
  devise,
  modes,
  croyants = [],
  croyantsTronques = false,
  enveloppes = {},
  photos = {},
  porteurs = {},
  evenementsDisponibles,
  entiteImposee,
  libelle = 'Nouvelle collecte',
  open,
  onOpenChange,
}: {
  entites: OptionEntite[];
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
  /** N° d'enveloppe -> ceux qui l'ont déjà portée, du plus récent au plus ancien. */
  porteurs?: Record<string, { croyantId: string; nom: string; prenom: string }[]>;
  evenementsDisponibles?: OptionEvenementDime[];
  /**
   * EF-FIN-34 — ouverture depuis le menu ⋮ d'une ligne de `/finances/dimes` :
   * l'entité collectrice se LIT au lieu de se choisir, même principe que
   * `MandatDialog` depuis l'organigramme — elle est déjà désignée par la
   * ligne d'où part le geste.
   */
  entiteImposee?: { id: string; nom: string };
  libelle?: string;
  /** Mode PILOTÉ : le déclencheur est ailleurs, le pop-up ne rend pas son bouton. */
  open?: boolean;
  onOpenChange?: (ouvert: boolean) => void;
}) {
  const router = useRouter();
  const pilote = open !== undefined;
  const [ouvertInterne, setOuvertInterne] = useState(false);
  const ouvert = pilote ? open : ouvertInterne;
  const [erreur, setErreur] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SaisirCollecteInput>({
    resolver: zodResolver(saisirCollecteSchema),
    defaultValues: {
      entiteCollecteId: entiteImposee?.id ?? undefined,
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
    () =>
      (versementsSurveilles ?? []) as {
        croyantId?: string | null;
        montant?: string;
        enveloppe?: string | null;
        nature?: NatureVersement;
      }[],
    [versementsSurveilles],
  );

  const suggestionsDe = (index: number) => {
    const ligne = lignes[index];
    if (!ligne || (ligne.nature ?? 'NOMINATIF') !== 'NOMINATIF') return [];
    // Déjà choisi : la suggestion n'a plus rien à proposer.
    if (ligne.croyantId) return [];

    // Le seuil de quatre caractères vit dans le domaine : la file de
    // rapprochement l'applique au numéro lu dans un fichier.
    return suggestionsPourEnveloppe(ligne.enveloppe, porteurs);
  };

  /** La nature d'une ligne, avec son defaut : elle commande trois controles. */
  const natureDe = (index: number): NatureVersement =>
    lignes[index]?.nature ?? 'NOMINATIF';

  /**
   * Ajoute une ligne DE LA NATURE DEMANDÉE.
   *
   * `NonNullable` : le schéma porte un `.default([])`, donc le type d'entrée
   * admet `undefined` et ne s'indexe pas directement.
   */
  const ajouter = (nature: NatureVersement) =>
    append({
      croyantId: nature === 'NOMINATIF' ? '' : null,
      montant: '',
      enveloppe: '',
      nature,
    } as NonNullable<SaisirCollecteInput['versements']>[number]);

  /**
   * Le mode EFFECTIF : celui de l'entité, sinon le défaut de l'organisation.
   * Jamais celui du parent — chaque bureau gère ses finances.
   */
  const mode = modeEffectif(entiteChoisie ? (modes[entiteChoisie] ?? null) : null);

  const detaille = mode === 'DETAILLE' && admetLeDetail(evenement ?? 'CULTE');

  /**
   * EF-FIN-32 — TOUS les croyants, pas ceux du sous-arbre de l'hôte.
   *
   * Le premier jet bornait la liste au sous-arbre de l'entité collectrice, ce
   * que disait EF-FIN-30. C'était trop étroit : un croyant de passage assiste
   * au culte d'une autre église et y remet son enveloppe — c'est fréquent, et
   * le refuser obligerait à le saisir en anonyme, perdant justement la trace
   * que le reçu doit porter.
   *
   * La seule borne qui subsiste est l'HABILITATION du saisissant : la RLS ne
   * livre que les croyants de son périmètre. Un visiteur venu d'un autre
   * district n'apparaîtra donc pas — c'est à cela que servent l'enveloppe
   * anonyme (EF-FIN-33) et la reprise des non-rapprochés (EF-FIN-34).
   */
  const listeEvenements = useMemo(() => {
    if (evenementsDisponibles && evenementsDisponibles.length > 0) {
      return evenementsDisponibles;
    }
    return EVENEMENTS_DIME.map((e) => ({
      code: e,
      libelle: LIBELLES_EVENEMENT[e] ?? e,
      niveauHote: NIVEAU_HOTE[e] ?? 'EGLISE',
    }));
  }, [evenementsDisponibles]);

  const eligibles = useMemo(
    () =>
      [...croyants]
        // Nom PUIS prenom : deux « RAKOTO » se rangent entre eux, et la liste
        // se parcourt comme un registre. Un tri par date de creation ferait
        // chercher un nom la ou rien ne le fait attendre.
        .sort(
          (a, b) =>
            a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'),
        )
        .map((c) => ({ ...c, detail: c.egliseNom })),
    [croyants],
  );

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

  /**
   * Les croyants DÉJÀ cités, et à quelle ligne.
   *
   * Un croyant ne remet qu'une enveloppe par collecte : le serveur refuse la
   * répétition (`doublonsDeCollecte`), mais l'apprendre à l'enregistrement,
   * après trente lignes remplies, arrive trop tard. On le retire donc du menu
   * des AUTRES lignes — l'erreur cesse d'être possible au lieu d'être
   * rattrapée.
   *
   * Chaque ligne garde évidemment son propre choix, sans quoi le nom retenu
   * disparaîtrait de son propre sélecteur.
   */
  const ligneDuCroyant = useMemo(() => {
    const index = new Map<string, number>();
    lignes.forEach((l, i) => {
      if (l.croyantId && !index.has(l.croyantId)) index.set(l.croyantId, i);
    });
    return index;
  }, [lignes]);

  function fermer() {
    reset();
    setErreur(null);
    if (pilote) onOpenChange?.(false);
    else setOuvertInterne(false);
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
      /**
       * CHAQUE REÇU PORTE DE QUOI LE POSER SUR LE BON TALON.
       *
       * La référence seule ne disait pas lequel allait où : devant dix reçus,
       * il fallait deviner. Le nom vient en premier — c'est lui qu'on lit sur
       * l'enveloppe —, puis le numéro, puis la référence à recopier.
       */
      avertir(
        `${formatNombre(recus)} reçu${recus > 1 ? 's' : ''} attribué${recus > 1 ? 's' : ''} :\n\n` +
          resultat.data.recus
            .map((r) => {
              const nom = r.nom
                ? `${r.nom.toLocaleUpperCase('fr')} ${r.prenom ?? ''}`.trim()
                : 'Croyant';
              const env = r.enveloppe ? ` — enveloppe ${r.enveloppe}` : '';
              return `• ${nom}${env}\n  ${r.recu}`;
            })
            .join('\n\n'),
        { ton: 'information', titre: 'Reçus à reporter sur les talons' },
      );
    }

    fermer();
    router.refresh();
  }

  return (
    <>
      {/* Piloté par le parent : le déclencheur est ailleurs (le menu ⋮ d'une ligne). */}
      {!pilote && (
        <PermissionGate perm="finance.dime.collect">
          <Button className="h-10" onClick={() => setOuvertInterne(true)}>
            <Plus className="mr-2 size-4" aria-hidden />
            {libelle}
          </Button>
        </PermissionGate>
      )}

      <Dialog
        open={ouvert}
        onOpenChange={(v) => (v ? (pilote ? onOpenChange?.(true) : setOuvertInterne(true)) : fermer())}
      >
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

                  {/*
                    L'ENTITÉ SE LIT PLUTÔT QUE DE SE CHOISIR quand elle est
                    imposée : le geste part d'une ligne précise de
                    `/finances/dimes`, qui l'a déjà désignée (règle 16, même
                    principe que `MandatDialog` depuis l'organigramme). La
                    proposer quand même permettrait d'en changer par
                    inadvertance, et le pop-up ouvert depuis une ligne
                    enregistrerait alors pour une AUTRE église que celle
                    annoncée.
                  */}
                  {entiteImposee ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-foreground text-sm font-medium">
                        Entité collectrice
                      </p>
                      <p className="border-input bg-muted/40 text-muted-foreground flex h-10 items-center rounded-md border px-3 text-sm">
                        {entiteImposee.nom}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Celle de la ligne d’où part cet enregistrement.
                      </p>
                    </div>
                  ) : (
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
                  )}

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
                              {listeEvenements.map((e) => (
                                <SelectItem key={e.code} value={e.code}>
                                  {e.libelle}
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
                      <Controller
                        control={control}
                        name="dateOperation"
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
                      {/*
                        Trois boutons, un par nature (EF-FIN-33) — plutôt qu'un
                        seul suivi d'un changement de nature. Le geste qu'on
                        fait est « j'ajoute une enveloppe sans nom », pas
                        « j'ajoute une ligne puis je la requalifie ».

                        Le nominatif se désactive quand tous les croyants
                        lisibles sont déjà cités : une ligne de plus ne pourrait
                        pas être remplie, et la proposer serait mentir. Les deux
                        autres n'ont pas cette limite — on peut compter dix
                        enveloppes sans nom.
                      */}
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9"
                        disabled={
                          !entiteChoisie || ligneDuCroyant.size >= eligibles.length
                        }
                        onClick={() => ajouter('NOMINATIF')}
                      >
                        <Plus className="mr-2 size-4" aria-hidden />
                        Enveloppe nominative
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        className="h-9"
                        disabled={!entiteChoisie}
                        onClick={() => ajouter('ENVELOPPE_ANONYME')}
                      >
                        <Plus className="mr-2 size-4" aria-hidden />
                        Sans nom
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        className="h-9"
                        disabled={!entiteChoisie}
                        onClick={() => ajouter('EN_VRAC')}
                      >
                        <Plus className="mr-2 size-4" aria-hidden />
                        En vrac
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
                      L’organisation dépasse le plafond de chargement : la liste
                      proposée n’en est qu’une partie. Un donateur absent se saisit en
                      enveloppe sans nom.
                    </p>
                  )}

                  {!entiteChoisie ? (
                    <p className="text-muted-foreground border-border rounded-lg border p-6 text-center text-sm">
                      Choisissez d’abord l’entité collectrice.
                    </p>
                  ) : (
                    <div className="border-border min-w-0 rounded-lg border">
                      <Table className="table-fixed">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[5%]">#</TableHead>
                            <TableHead className="w-[18%]">Nature</TableHead>
                            <TableHead className="w-[35%]">Croyant</TableHead>
                            <TableHead className="w-[18%]">Enveloppe</TableHead>
                            <TableHead className="w-[19%]">Montant *</TableHead>
                            <TableHead className="w-[5%]" />
                          </TableRow>
                        </TableHeader>

                        <TableBody>
                          {fields.length === 0 && (
                            <TableRow>
                              <TableCell
                                colSpan={6}
                                className="text-muted-foreground py-6 text-center text-sm"
                              >
                                Aucun versement. Ajoutez-en un pour commencer.
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

                              {/* EF-FIN-33 — la nature du versement. Ensemble
                                  CLOS et connu, mais trois pictogrammes dans
                                  une colonne de grille seraient illisibles :
                                  le sélecteur reste ici le bon contrôle. */}
                              <TableCell>
                                <Controller
                                  control={control}
                                  name={`versements.${index}.nature`}
                                  render={({ field }) => (
                                    <Select
                                      value={(field.value as string) ?? 'NOMINATIF'}
                                      onValueChange={(v) => {
                                        /*
                                          Passer une ligne en anonyme DÉTACHE le
                                          croyant : le garder enverrait un nom
                                          sur un versement qui n'en a pas, et la
                                          contrainte de la base le refuserait à
                                          l'enregistrement.
                                        */
                                        if (v !== 'NOMINATIF') {
                                          setValue(`versements.${index}.croyantId`, null);
                                        }
                                        if (v === 'EN_VRAC') {
                                          setValue(`versements.${index}.enveloppe`, '');
                                        }
                                        field.onChange(v);
                                      }}
                                    >
                                      <SelectTrigger
                                        className="h-9 w-full"
                                        aria-label={`Nature, ligne ${index + 1}`}
                                      >
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {NATURES_VERSEMENT.map((n) => (
                                          <SelectItem key={n} value={n}>
                                            {LIBELLES_NATURE[n]}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                />
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
                                      /* Ceux d'une AUTRE ligne sont retirés :
                                         un croyant ne remet qu'une enveloppe
                                         par collecte. */
                                      options={eligibles.filter((c) => {
                                        const prise = ligneDuCroyant.get(c.id);
                                        return prise === undefined || prise === index;
                                      })}
                                      value={(field.value as string | null) ?? null}
                                      onChange={field.onChange}
                                      photos={photos}
                                      // Un versement anonyme n'a personne à
                                      // rattacher : le champ n'est pas vide, il
                                      // est sans objet.
                                      disabled={natureDe(index) !== 'NOMINATIF'}
                                      placeholder={
                                        natureDe(index) === 'NOMINATIF'
                                          ? 'Choisir'
                                          : 'Sans nom'
                                      }
                                      aria-label={`Croyant, ligne ${index + 1}`}
                                    />
                                  )}
                                />

                                {/* EF-FIN-27 — qui a déjà porté ce numéro. Le
                                    rendu vit dans `SuggestionsEnveloppe` : la
                                    file de rapprochement pose la même question
                                    sur un numéro lu dans un fichier. */}
                                <SuggestionsEnveloppe
                                  porteurs={suggestionsDe(index)}
                                  photos={photos}
                                  fiche={(id) => {
                                    const f = croyants.find((c) => c.id === id);
                                    return f
                                      ? {
                                          matricule: f.matricule,
                                          detail: f.egliseNom,
                                          photoKey: f.photoKey,
                                        }
                                      : null;
                                  }}
                                  onChoisir={(id) =>
                                    setValue(`versements.${index}.croyantId`, id, {
                                      shouldValidate: true,
                                    })
                                  }
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
                                    natureDe(index) === 'EN_VRAC'
                                      ? '—'
                                      : (enveloppes[lignes[index]?.croyantId ?? ''] ??
                                        'N° enveloppe')
                                  }
                                  // En vrac : il n'y a pas d'enveloppe, c'est
                                  // ce qui le définit.
                                  disabled={natureDe(index) === 'EN_VRAC'}
                                  aria-label={`Enveloppe, ligne ${index + 1}`}
                                  {...register(`versements.${index}.enveloppe`, {
                                    /**
                                     * CHANGER LE NUMÉRO DÉTACHE LE CROYANT.
                                     *
                                     * Sans cela, le nom retenu sur la
                                     * suggestion précédente restait accroché à
                                     * un numéro qui n'est plus le sien — et,
                                     * la ligne portant déjà un croyant, plus
                                     * aucune suggestion ne s'affichait. On
                                     * enregistrait donc la dîme de quelqu'un
                                     * d'autre, sans que rien ne l'annonce.
                                     */
                                    onChange: () => {
                                      if (lignes[index]?.croyantId) {
                                        setValue(`versements.${index}.croyantId`, null);
                                      }
                                    },
                                  })}
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
