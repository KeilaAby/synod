'use client';

import { Loader2, Pencil, Plus, Power } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Field, TextField } from '@/components/shared/field';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  basculerActivationReferentiel,
  creerValeurReferentiel,
  modifierValeurReferentiel,
} from '@/lib/actions/referentiels';
import {
  type ChampReferentiel,
  type DefinitionReferentiel,
  LIBELLES_VALEURS,
} from '@/lib/domain/referentiels';
import { cn } from '@/lib/utils';

/**
 * Ecran generique de referentiel — EF-REF-01 a 06.
 *
 * Un seul composant sert les quatre referentiels : la forme des colonnes et
 * des champs vient du registre (DA-7). Ajouter un referentiel n'ajoute pas une
 * ligne d'interface.
 */

type Ligne = Record<string, unknown> & { id: string; is_active: boolean };

export function ReferentielTable({
  definition,
  lignes,
  peutGerer,
}: {
  definition: DefinitionReferentiel;
  lignes: Ligne[];
  peutGerer: boolean;
}) {
  const router = useRouter();
  const [edition, setEdition] = useState<{ ligne: Ligne | null } | null>(null);
  const [enCours, demarrer] = useTransition();

  function basculer(ligne: Ligne) {
    demarrer(async () => {
      const resultat = await basculerActivationReferentiel({
        slug: definition.slug,
        id: ligne.id,
      });
      if (!resultat.ok) {
        toast.error(resultat.error);
        return;
      }
      toast.success(
        resultat.data.actif
          ? 'Valeur reactivee.'
          : 'Valeur desactivee : elle disparait des nouvelles saisies mais reste dans l historique.',
      );
      router.refresh();
    });
  }

  return (
    <>
      {peutGerer && (
        <div className="flex justify-end">
          <Button className="h-10" onClick={() => setEdition({ ligne: null })}>
            <Plus className="mr-2 size-4" aria-hidden />
            Ajouter {definition.singulier}
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {/* UI-07 : pas de bordures verticales, valeurs numeriques en font-mono. */}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {definition.colonnes.map((colonne) => (
                  <TableHead
                    key={colonne.cle}
                    className={cn(colonne.alignementDroite && 'text-right')}
                  >
                    {colonne.label}
                  </TableHead>
                ))}
                <TableHead>Statut</TableHead>
                {peutGerer && <TableHead className="w-24 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>

            <TableBody>
              {lignes.map((ligne) => (
                <TableRow key={ligne.id} className={cn('h-12', !ligne.is_active && 'opacity-60')}>
                  {definition.colonnes.map((colonne) => (
                    <TableCell
                      key={colonne.cle}
                      className={cn(
                        colonne.mono && 'font-mono text-xs tabular-nums',
                        colonne.alignementDroite && 'text-right',
                      )}
                    >
                      {afficher(ligne[colonne.cle])}
                    </TableCell>
                  ))}

                  <TableCell>
                    <StatusBadge tone={ligne.is_active ? 'success' : 'neutral'}>
                      {ligne.is_active ? 'Active' : 'Desactivee'}
                    </StatusBadge>
                  </TableCell>

                  {peutGerer && (
                    <TableCell className="text-right">
                      <span className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Modifier ${String(ligne.libelle ?? '')}`}
                          onClick={() => setEdition({ ligne })}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          disabled={enCours}
                          aria-label={
                            ligne.is_active
                              ? `Desactiver ${String(ligne.libelle ?? '')}`
                              : `Reactiver ${String(ligne.libelle ?? '')}`
                          }
                          onClick={() => basculer(ligne)}
                        >
                          <Power
                            className={cn(
                              'size-4',
                              ligne.is_active ? 'text-emerald-600' : 'text-slate-400',
                            )}
                            aria-hidden
                          />
                        </Button>
                      </span>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {edition && (
        <FormulaireReferentiel
          definition={definition}
          ligne={edition.ligne}
          onFerme={() => setEdition(null)}
          onEnregistre={() => {
            setEdition(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function afficher(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '—';
  if (typeof valeur === 'boolean') return valeur ? 'Oui' : 'Non';
  if (Array.isArray(valeur)) {
    return valeur.map((v) => LIBELLES_VALEURS[String(v)] ?? String(v)).join(', ');
  }
  const texte = String(valeur);
  return LIBELLES_VALEURS[texte] ?? texte;
}

// -----------------------------------------------------------------------------

function FormulaireReferentiel({
  definition,
  ligne,
  onFerme,
  onEnregistre,
}: {
  definition: DefinitionReferentiel;
  ligne: Ligne | null;
  onFerme: () => void;
  onEnregistre: () => void;
}) {
  const enCreation = ligne === null;

  const [valeurs, setValeurs] = useState<Record<string, unknown>>(() => {
    const initiales: Record<string, unknown> = {};
    for (const champ of definition.champs) {
      const existante = ligne?.[champ.cle];
      initiales[champ.cle] =
        existante ??
        (champ.type === 'booleen'
          ? false
          : champ.type === 'nombre'
            ? 100
            : champ.type === 'choix-multiple'
              ? []
              : '');
    }
    return initiales;
  });

  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function poser(cle: string, valeur: unknown) {
    setValeurs((precedent) => ({ ...precedent, [cle]: valeur }));
    setErreurs((precedent) => {
      const suivant = { ...precedent };
      delete suivant[cle];
      return suivant;
    });
  }

  function enregistrer() {
    setErreurGlobale(null);
    setErreurs({});

    demarrer(async () => {
      const resultat = enCreation
        ? await creerValeurReferentiel({ slug: definition.slug, valeurs })
        : await modifierValeurReferentiel({
            slug: definition.slug,
            id: ligne.id,
            valeurs,
          });

      if (!resultat.ok) {
        setErreurGlobale(resultat.error);
        const parChamp: Record<string, string> = {};
        for (const [cle, messages] of Object.entries(resultat.fieldErrors ?? {})) {
          if (messages[0]) parChamp[cle] = messages[0];
        }
        setErreurs(parChamp);
        return;
      }

      toast.success(enCreation ? 'Valeur ajoutee.' : 'Modifications enregistrees.');
      onEnregistre();
    });
  }

  return (
    <Dialog open onOpenChange={(ouvert) => !ouvert && onFerme()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {enCreation
              ? `Ajouter ${definition.singulier}`
              : `Modifier ${String(ligne.libelle ?? definition.singulier)}`}
          </DialogTitle>
          <DialogDescription>{definition.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {erreurGlobale && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {erreurGlobale}
            </p>
          )}

          {definition.champs.map((champ) => (
            <ChampSaisie
              key={champ.cle}
              champ={champ}
              valeur={valeurs[champ.cle]}
              erreur={erreurs[champ.cle]}
              // Un champ immuable reste visible mais verrouille en modification :
              // le masquer laisserait croire qu'il n'existe pas.
              verrouille={!enCreation && Boolean(champ.immuable)}
              onChange={(v) => poser(champ.cle, v)}
            />
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={onFerme} disabled={enCours}>
            Annuler
          </Button>
          <Button className="h-10" onClick={enregistrer} disabled={enCours}>
            {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            {enCreation ? 'Ajouter' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChampSaisie({
  champ,
  valeur,
  erreur,
  verrouille,
  onChange,
}: {
  champ: ChampReferentiel;
  valeur: unknown;
  erreur?: string;
  verrouille: boolean;
  onChange: (valeur: unknown) => void;
}) {
  const hint = verrouille ? 'Non modifiable apres creation.' : champ.hint;

  switch (champ.type) {
    case 'booleen':
      return (
        <label className="flex cursor-pointer items-start gap-4">
          <Checkbox
            checked={Boolean(valeur)}
            onCheckedChange={(v) => onChange(v === true)}
            disabled={verrouille}
            className="mt-0.5"
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-foreground">{champ.label}</span>
            {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
          </span>
        </label>
      );

    case 'choix':
      return (
        <Field label={champ.label} required={champ.requis} error={erreur} hint={hint}>
          {(aria) => (
            <Select
              value={String(valeur ?? '')}
              onValueChange={onChange}
              disabled={verrouille}
            >
              <SelectTrigger {...aria} className="h-10 w-full">
                <SelectValue placeholder="Choisir…" />
              </SelectTrigger>
              <SelectContent>
                {champ.options.map((o) => (
                  <SelectItem key={o.valeur} value={o.valeur}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      );

    case 'choix-multiple': {
      const selection = Array.isArray(valeur) ? (valeur as string[]) : [];
      return (
        <Field label={champ.label} required={champ.requis} error={erreur} hint={hint}>
          {() => (
            <div className="grid grid-cols-2 gap-2">
              {champ.options.map((o) => (
                <label key={o.valeur} className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={selection.includes(o.valeur)}
                    disabled={verrouille}
                    onCheckedChange={(coche) =>
                      onChange(
                        coche === true
                          ? [...selection, o.valeur]
                          : selection.filter((v) => v !== o.valeur),
                      )
                    }
                  />
                  <span className="text-sm text-foreground">{o.label}</span>
                </label>
              ))}
            </div>
          )}
        </Field>
      );
    }

    case 'nombre':
      return (
        <Field label={champ.label} required={champ.requis} error={erreur} hint={hint}>
          {(aria) => (
            <Input
              {...aria}
              type="number"
              inputMode="numeric"
              value={String(valeur ?? '')}
              disabled={verrouille}
              onChange={(e) => onChange(e.target.value)}
              className="font-mono tabular-nums"
            />
          )}
        </Field>
      );

    default:
      return (
        <TextField
          label={champ.label}
          required={champ.requis}
          error={erreur}
          hint={hint}
          disabled={verrouille}
          value={String(valeur ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={champ.mono ? '[&_input]:font-mono [&_input]:uppercase' : undefined}
        />
      );
  }
}
