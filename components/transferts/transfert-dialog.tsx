'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowRight, ArrowRightLeft, Loader2, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import type { CelluleOption } from '@/components/croyants/croyant-form';
import { Field } from '@/components/shared/field';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { demanderTransfert } from '@/lib/actions/transferts';
import { ENTITY_LABELS } from '@/lib/domain/hierarchy';
import { niveauDeTransfert } from '@/lib/domain/transfert';
import {
  type DemanderTransfertInput,
  demanderTransfertSchema,
} from '@/lib/validation/transfert';

/**
 * Demande de transfert — EF-TRF-01 a 06, ARB-4.
 *
 * L'ORIGINE n'est pas saisie : elle se lit sur la fiche. La demander laisserait
 * l'ecran et la requete diverger, et c'est l'origine qui determine
 * l'approbateur competent (RG-12).
 *
 * Le NIVEAU du transfert n'est pas saisi non plus, il est ANNONCE : deux
 * eglises d'une meme paroisse font un transfert d'eglise, deux eglises de
 * districts differents un transfert de district. L'utilisateur choisit une
 * destination ; l'application lui dit ce que cela signifie.
 */

export interface CroyantATransferer {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  egliseId: string;
  egliseNom: string;
  /** Chemin ltree de l'eglise actuelle : sert a annoncer le niveau. */
  eglisePath: string;
  celluleId: string | null;
  celluleNom: string | null;
}

export function TransfertDialog({
  croyant,
  eglises,
  cellules,
  ouvert,
  onOuvertChange,
}: {
  croyant: CroyantATransferer;
  eglises: OptionEntite[];
  cellules: CelluleOption[];
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);

  const {
    handleSubmit,
    control,
    register,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DemanderTransfertInput>({
    resolver: zodResolver(demanderTransfertSchema),
    defaultValues: {
      croyantId: croyant.id,
      toEgliseId: undefined,
      toCelluleId: null,
      motif: '',
    },
  });

  const destinationId = useWatch({ control, name: 'toEgliseId' });
  const destination = eglises.find((e) => e.id === destinationId);

  // RG-05 — seules les cellules de l'eglise visee sont proposees.
  const cellulesDisponibles = useMemo(
    () => cellules.filter((c) => c.egliseId === destinationId),
    [cellules, destinationId],
  );

  const niveau = destination
    ? niveauDeTransfert(croyant.eglisePath, destination.path)
    : null;

  function fermer() {
    reset();
    setErreur(null);
    onOuvertChange(false);
  }

  async function envoyer(valeurs: DemanderTransfertInput) {
    setErreur(null);

    const resultat = await demanderTransfert(valeurs);

    if (!resultat.ok) {
      for (const [champ, messages] of Object.entries(resultat.fieldErrors ?? {})) {
        if (champ in valeurs) {
          setError(champ as keyof DemanderTransfertInput, { message: messages[0] });
        }
      }
      setErreur(resultat.error);
      return;
    }

    toast.success(
      resultat.data.autoApprouve
        ? // EF-TRF-05 — l'utilisateur doit savoir que le transfert est DEJA fait.
          'Transfert effectue : il relevait de votre perimetre et de votre habilitation.'
        : "Demande enregistree. Elle attend l'approbation du responsable competent.",
    );
    fermer();
    router.refresh();
  }

  return (
    <Dialog open={ouvert} onOpenChange={(v) => (v ? onOuvertChange(true) : fermer())}>
      <DialogContent className="max-h-[90vh] w-[min(96vw,56rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Transférer {croyant.nom.toLocaleUpperCase('fr')} {croyant.prenom}
          </DialogTitle>
          <DialogDescription>
            Matricule {croyant.matricule} — il ne change jamais, y compris après
            transfert (RG-29).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(envoyer)} className="space-y-8 py-2" noValidate>
          {erreur && (
            <Alert variant="destructive" role="alert">
              <AlertCircle className="size-4" aria-hidden />
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}

          {/* --- Origine (lue, jamais saisie) → destination --- */}
          <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-slate-50 p-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Rattachement actuel</p>
              <p className="text-sm font-medium text-foreground">{croyant.egliseNom}</p>
              {croyant.celluleNom && (
                <p className="text-xs text-muted-foreground">
                  Cellule {croyant.celluleNom}
                </p>
              )}
            </div>

            <ArrowRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Destination</p>
              <p className="text-sm font-medium text-foreground">
                {destination?.nom ?? '—'}
              </p>
              {niveau && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ArrowRightLeft className="size-3" aria-hidden />
                  Transfert de niveau {ENTITY_LABELS[niveau].singulier.toLowerCase()}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Église de destination" required error={errors.toEgliseId?.message}>
              {(aria) => (
                <Controller
                  control={control}
                  name="toEgliseId"
                  render={({ field }) => (
                    <EntityPicker
                      {...aria}
                      options={eglises}
                      value={field.value ?? null}
                      onChange={(v) => {
                        field.onChange(v);
                        // La cellule precedente appartient a l'ancienne eglise :
                        // la garder produirait un rattachement incoherent (RG-05).
                        setValue('toCelluleId', null);
                      }}
                      placeholder="Choisir une église"
                      emptyMessage="Aucune église disponible dans votre périmètre."
                    />
                  )}
                />
              )}
            </Field>

            <Field
              label="Cellule de destination"
              error={errors.toCelluleId?.message}
              hint={
                destinationId && cellulesDisponibles.length === 0
                  ? 'Cette église ne compte aucune cellule.'
                  : 'Facultatif.'
              }
            >
              {(aria) => (
                <Controller
                  control={control}
                  name="toCelluleId"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? 'aucune'}
                      onValueChange={(v) => field.onChange(v === 'aucune' ? null : v)}
                      disabled={!destinationId || cellulesDisponibles.length === 0}
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
          </div>

          <Field
            label="Motif"
            required
            error={errors.motif?.message}
            hint="C'est ce que lira l'approbateur pour décider."
          >
            {(aria) => (
              <Textarea
                {...aria}
                rows={3}
                placeholder="Déménagement, rapprochement familial, affectation…"
                {...register('motif')}
              />
            )}
          </Field>

          {/* ARB-4 — dire ce qui va se passer, avant que cela se passe. */}
          <Alert>
            <ShieldCheck className="size-4" aria-hidden />
            <AlertTitle>Le transfert passe par une approbation</AlertTitle>
            <AlertDescription>
              Rien ne change pour le croyant tant que la demande n&apos;est pas
              approuvée (RG-11). Seul un responsable dont le périmètre couvre à la fois
              l&apos;origine et la destination peut la trancher — si c&apos;est votre
              cas, elle sera appliquée immédiatement.
            </AlertDescription>
          </Alert>

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
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              Demander le transfert
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
