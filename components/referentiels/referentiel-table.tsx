'use client';

import { Loader2, MoreVertical, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { MessageDialog } from '@/components/shared/message-dialog';
import { OperationDialog } from '@/components/shared/operation-dialog';
import { Field, TextField } from '@/components/shared/field';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  supprimerValeurReferentiel,
} from '@/lib/actions/referentiels';
import {
  type ChampReferentiel,
  type DefinitionReferentiel,
  LIBELLES_VALEURS,
  REFERENTIELS,
  type SlugReferentiel,
} from '@/lib/domain/referentiels';
import { cn } from '@/lib/utils';

/**
 * Ecran generique de referentiel — EF-REF-01 a 06.
 *
 * Un seul composant sert les quatre referentiels : la forme des colonnes et
 * des champs vient du registre (DA-7). Ajouter un referentiel n'ajoute pas une
 * ligne d'interface.
 *
 * LE COMPOSANT RECOIT UN SLUG, PAS UNE DEFINITION. La definition porte un
 * schema Zod — une instance de classe — et React refuse de serialiser autre
 * chose que des objets simples entre un composant serveur et un composant
 * client. La transmettre faisait echouer la page entiere :
 *
 *   « Only plain objects, and a few built-ins, can be passed to Client
 *     Components from Server Components. »
 *
 * Le registre etant un module PUR, le client le lit directement : rien ne
 * traverse la frontiere, et le probleme disparait au lieu d'etre contourne.
 */

export type LigneReferentiel = Record<string, unknown> & {
  id: string;
  is_active: boolean;
};

type Ligne = LigneReferentiel;

export function ReferentielTable({
  slug,
  lignes,
  peutGerer,
  ajoutImmediat = false,
}: {
  slug: SlugReferentiel;
  lignes: Ligne[];
  peutGerer: boolean;
  /** Ouvre le formulaire d'ajout des le montage — entree « Ajouter » du menu. */
  ajoutImmediat?: boolean;
}) {
  const definition = REFERENTIELS[slug];
  const router = useRouter();
  // Valeur INITIALE plutot qu'un effet : ouvrir le formulaire apres coup
  // aurait produit un second rendu, que le compilateur React refuse.
  const [edition, setEdition] = useState<{ ligne: Ligne | null } | null>(
    ajoutImmediat && peutGerer ? { ligne: null } : null,
  );
  const [enCours, demarrer] = useTransition();
  const [aSupprimer, setASupprimer] = useState<Ligne | null>(null);
  const [operation, setOperation] = useState<{ titre: string; description: string } | null>(
    null,
  );
  const [refus, setRefus] = useState<string | null>(null);

  /**
   * Une operation, son libelle et son attente, noues au meme endroit.
   *
   * Ces gestes touchent la base puis attendent le re-rendu : sans pop-up,
   * l'ecran reste identique plusieurs secondes et l'utilisateur recommence.
   * Deux etats regles separement — « ce qui se passe » et « ca se passe » —
   * finiraient par se contredire.
   */
  function lancer(
    annonce: { titre: string; description: string },
    executer: () => Promise<{ ok: boolean; error?: string }>,
    succes: (resultat: unknown) => string,
  ) {
    setOperation(annonce);
    demarrer(async () => {
      const resultat = await executer();

      if (!resultat.ok) {
        setOperation(null);
        /**
         * Un refus MOTIVE va dans un pop-up, pas dans une notification.
         *
         * « Loholona est utilise par 4 croyants : la suppression effacerait une
         * information encore vraie. Desactivez cette valeur… » enonce une
         * raison ET une alternative — et s'efface avant qu'on en soit a la
         * deuxieme ligne. L'utilisateur n'en retiendrait que « ca n'a pas
         * marche », precisement ce que le message evitait.
         */
        setRefus(resultat.error ?? "L'operation a echoue.");
        return;
      }
      toast.success(succes(resultat));
      router.refresh();
      // Ferme QUAND l'ecran rafraichi arrive : `router.refresh()` fait partie
      // de la transition, cette ecriture est donc validee avec elle.
      setOperation(null);
    });
  }

  function supprimer(ligne: Ligne) {
    setASupprimer(null);
    lancer(
      {
        titre: 'Suppression en cours…',
        description: `« ${String(ligne.libelle ?? '')} » quitte le referentiel ${definition.titre}.`,
      },
      () => supprimerValeurReferentiel({ slug: definition.slug, id: ligne.id }),
      () => `${definition.singulier} supprime.`,
    );
  }

  function basculer(ligne: Ligne) {
    lancer(
      {
        titre: ligne.is_active ? 'Desactivation…' : 'Reactivation…',
        description: `« ${String(ligne.libelle ?? '')} » — les fiches qui la portent ne changent pas.`,
      },
      () => basculerActivationReferentiel({ slug: definition.slug, id: ligne.id }),
      (resultat) =>
        (resultat as { data: { actif: boolean } }).data.actif
          ? 'Valeur reactivee.'
          : 'Valeur desactivee : elle disparait des nouvelles saisies mais reste dans l historique.',
    );
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
                <TableRow
                  key={ligne.id}
                  className={cn('h-12', !ligne.is_active && 'opacity-60')}
                >
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
                      {/* Le MEME menu ⋮ que partout ailleurs. Deux
                          pictogrammes cote a cote obligeaient a les survoler
                          pour savoir lequel desactive et lequel modifie. */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Actions sur ${String(ligne.libelle ?? '')}`}
                            className="text-muted-foreground hover:text-foreground ml-auto flex size-8 items-center justify-center rounded-md transition-colors hover:bg-slate-100"
                          >
                            <MoreVertical className="size-4" aria-hidden />
                          </button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end" className="w-60">
                          <DropdownMenuItem onSelect={() => setEdition({ ligne })}>
                            <Pencil className="mr-2 size-4" aria-hidden />
                            Modifier
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            disabled={enCours}
                            onSelect={() => basculer(ligne)}
                          >
                            <Power
                              className={cn(
                                'mr-2 size-4',
                                ligne.is_active ? 'text-emerald-600' : 'text-slate-400',
                              )}
                              aria-hidden
                            />
                            {ligne.is_active ? 'Desactiver' : 'Reactiver'}
                            <span className="text-muted-foreground ml-auto text-xs">
                              {ligne.is_active ? 'conserve' : ''}
                            </span>
                          </DropdownMenuItem>

                          {/* EF-REF-05 — desactiver conserve, supprimer efface.
                              L'action reste proposee meme quand la valeur est
                              utilisee : le refus, lui, NOMME ce qui s'y
                              rattache, ce qu'une entree grisee ne dirait pas. */}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setASupprimer(ligne)}
                          >
                            <Trash2 className="mr-2 size-4" aria-hidden />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/*
        L'ouverture ne depend QUE de `operation`, jamais de `isPending`.
        La suppression part de `ConfirmDialog`, qui execute `onConfirm` dans SA
        propre transition : la notre s'y fond, `enCours` ne bascule pas, et le
        pop-up ne s'ouvrait jamais. Un indicateur d'attente ne doit pas dependre
        de l'endroit d'ou l'operation a ete lancee.
      */}
      <OperationDialog
        ouvert={operation !== null}
        titre={operation?.titre ?? ''}
        description={operation?.description}
      />

      <MessageDialog
        ouvert={refus !== null}
        titre="Operation refusee"
        message={refus ?? ''}
        onFermer={() => setRefus(null)}
      />

      {/* EF-REF-05 — desactiver conserve, supprimer efface. La confirmation
          rappelle l'alternative, parce que c'est presque toujours celle qu'on
          voulait. */}
      {aSupprimer && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setASupprimer(null)}
          title={`Supprimer « ${String(aSupprimer.libelle ?? '')} » ?`}
          description={
            `Cette valeur sera effacee du referentiel « ${definition.titre} ». ` +
            'La suppression est refusee si quoi que ce soit s’y rattache encore — ' +
            'dans ce cas, desactivez-la : elle disparait des listes sans toucher a ' +
            'ce qui existe deja.'
          }
          confirmLabel={enCours ? 'Suppression…' : 'Supprimer'}
          onConfirm={() => supprimer(aSupprimer)}
        />
      )}

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
            <p role="alert" className="text-destructive text-sm font-medium">
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
            <span className="text-foreground block text-sm font-medium">
              {champ.label}
            </span>
            {hint && <span className="text-muted-foreground block text-xs">{hint}</span>}
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
                  <span className="text-foreground text-sm">{o.label}</span>
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
