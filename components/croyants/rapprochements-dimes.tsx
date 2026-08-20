'use client';

import { ChevronDown, Loader2, UserCheck, UserPlus, UserSearch } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  NouveauCroyantDialog,
  type OptionsCroyant,
} from '@/components/croyants/croyant-dialog';
import { CroyantPicker, type OptionCroyant } from '@/components/croyants/croyant-picker';
import {
  SuggestionsEnveloppe,
  type PorteurSuggere,
} from '@/components/finances/suggestions-enveloppe';
import { avertir } from '@/components/shared/messages';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { resoudreRapprochement } from '@/lib/actions/dimes';
import type { RapprochementEnAttente } from '@/lib/data/dimes';
import { suggestionsPourEnveloppe } from '@/lib/domain/dime';
import { cn } from '@/lib/utils';
import { formatDate, formatMontant, formatNombre } from '@/lib/utils/format';

/**
 * Les noms d'un import que rien n'a reconnu — EF-FIN-34.
 *
 * CE N'EST PAS UNE FILE D'ERREURS. Le montant est déjà compté, l'argent est
 * reçu : l'enveloppe était dans l'urne, elle n'a pas disparu parce que le
 * fichier écrivait « Razafindraparany » autrement que la fiche.
 *
 * Ce qui manque, c'est de savoir **à qui** l'attribuer — et cela se décide ici,
 * dans la page des croyants, où l'on connaît les gens. C'est aussi pourquoi
 * cette zone n'est pas dans les finances : le travail à faire est de
 * l'identification, pas de la comptabilité.
 *
 * LE REÇU EST ÉMIS À LA RÉSOLUTION : c'est à ce moment qu'il y a quelqu'un à
 * qui le remettre.
 *
 * TROIS CHEMINS, et pas un de plus : le numéro d'enveloppe propose, la
 * recherche trouve, la création ouvre une fiche quand la personne n'en a
 * simplement pas encore.
 */
export function RapprochementsDimes({
  rapprochements,
  croyants,
  photos,
  devise,
  options,
  porteurs = {},
}: {
  rapprochements: RapprochementEnAttente[];
  croyants: OptionCroyant[];
  photos: Record<string, string>;
  devise: string;
  /** Référentiels de la fiche croyant : la création se fait sans quitter l'écran. */
  options: OptionsCroyant;
  /** N° d'enveloppe -> ceux qui l'ont déjà portée (EF-FIN-27). */
  porteurs?: Record<string, PorteurSuggere[]>;
}) {
  const router = useRouter();
  const [choix, setChoix] = useState<Record<string, string | null>>({});
  const [enCours, setEnCours] = useState<string | null>(null);
  /** La ligne dont on est en train d'ouvrir la fiche, ou `null`. */
  const [creation, setCreation] = useState<RapprochementEnAttente | null>(null);
  /**
   * Replié par défaut : on vient sur cet écran pour la liste des croyants, pas
   * pour le rapprochement. Le bandeau, lui, reste toujours visible et porte le
   * compte — c'est lui qui alerte, pas la table.
   */
  const [deplie, setDeplie] = useState(false);

  async function resoudre(id: string, croyantId: string) {
    setEnCours(id);
    try {
      const resultat = await resoudreRapprochement({
        rapprochementId: id,
        croyantId,
      });

      if (!resultat.ok) {
        avertir(resultat.error, { ton: 'refus', titre: 'Rapprochement refusé' });
        return;
      }

      toast.success('Versement rattaché.');

      /**
       * LE REÇU SE REPORTE SUR LE TALON. Il vient d'être émis : sans cette
       * mention, la référence resterait dans la base et le croyant n'aurait
       * jamais rien en main.
       */
      avertir(
        `Reçu ${resultat.data.recu}\n\n` + 'À reporter sur le talon remis au croyant.',
        { ton: 'information', titre: 'Reçu attribué' },
      );

      router.refresh();
    } finally {
      setEnCours(null);
    }
  }

  /**
   * L'église la plus PROBABLE, dans cet ordre :
   *
   *   1. CELLE QUE LE FICHIER ANNONÇAIT (`eglise_id`, migration `0058`). C'est
   *      celui qui a tenu la collecte qui l'a écrite, et lui connaît ses gens :
   *      aucune déduction ne vaut ce témoignage-là.
   *   2. À défaut, CELLE QUI A COLLECTÉ. Quelqu'un qui met une enveloppe dans
   *      l'urne d'Antsahatsiresy en est le plus souvent membre.
   *   3. À défaut, RIEN — et le champ se remplit à la main, comme avant.
   *
   * Ce n'est qu'une amorce dans les trois cas : le champ reste libre.
   *
   * On ne crée AUCUNE entité « église inconnue » quand le libellé du fichier
   * ne correspond à rien : elle entrerait dans la structure, recevrait un
   * code, apparaîtrait dans chaque sélecteur, dans l'organigramme et dans les
   * soldes consolidés, et quelqu'un finirait par y transférer un vrai croyant.
   */
  function egliseProbable(r: RapprochementEnAttente): string | undefined {
    if (r.eglise_id && options.eglises.some((e) => e.id === r.eglise_id)) {
      return r.eglise_id;
    }
    return options.eglises.some((e) => e.id === r.entite_id) ? r.entite_id : undefined;
  }

  if (rapprochements.length === 0) return null;

  return (
    <Collapsible asChild open={deplie} onOpenChange={setDeplie}>
      <section className="space-y-3">
        {/*
          LE COMPTE RESTE VISIBLE, LE TRAVAIL SE REPLIE.

          Ces personnes ont donné et n'ont pas de fiche : c'est le vivier des
          croyants non rattachés, pas une file d'erreurs. Le bandeau ne se
          replie donc JAMAIS — replier l'alerte elle-même reviendrait à la
          supprimer, et douze enveloppes anonymes cesseraient d'exister pour
          tout le monde.

          Ce qui se replie est la TABLE, longue, qui repoussait la liste des
          croyants hors de l'écran alors que c'est elle qu'on vient consulter
          neuf fois sur dix. Repliée par défaut, pour la même raison.
        */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="border-destructive/30 bg-destructive/5 hover:bg-destructive/10 flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors"
          >
            <UserSearch className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="flex-1 text-sm">
              <span className="font-medium">
                {formatNombre(rapprochements.length)} personne
                {rapprochements.length > 1 ? 's' : ''} non rattachée
                {rapprochements.length > 1 ? 's' : ''}
              </span>{' '}
              <span className="text-muted-foreground">
                — {rapprochements.length > 1 ? 'elles ont' : 'elle a'} versé une dîme sans
                qu’aucune fiche ne {rapprochements.length > 1 ? 'leur' : 'lui'}{' '}
                corresponde. Le montant est déjà compté&nbsp;; seul le nom reste à
                retrouver.
              </span>
            </p>

            <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
              {deplie ? 'Replier' : 'Rapprocher'}
              <ChevronDown
                className={cn('size-4 transition-transform', deplie && 'rotate-180')}
                aria-hidden
              />
            </span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3">
          <div className="border-border overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Culte</TableHead>
                  <TableHead>Nom lu dans le fichier</TableHead>
                  <TableHead className="w-28">Enveloppe</TableHead>
                  <TableHead className="w-32 text-right">Montant</TableHead>
                  <TableHead className="w-80">Rattacher à</TableHead>
                  <TableHead className="w-44" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {rapprochements.map((r) => {
                  const retenu = choix[r.id] ?? null;

                  // Une suggestion n'a plus rien à proposer une fois le nom retenu.
                  const suggestions = retenu
                    ? []
                    : suggestionsPourEnveloppe(r.enveloppe_source, porteurs);

                  return (
                    <TableRow
                      key={r.id}
                      className="hover:bg-transparent has-aria-expanded:bg-transparent"
                    >
                      <TableCell className="align-top text-xs tabular-nums">
                        {r.versement?.entree
                          ? formatDate(r.versement.entree.date_operation)
                          : formatDate(r.created_at)}
                      </TableCell>

                      <TableCell className="align-top text-sm">
                        {/*
                          CE QUE LE FICHIER DISAIT, tel quel : c'est contre lui
                          qu'on rapproche, et le corriger effacerait la trace.

                          RÈGLE C — une enveloppe numérotée SANS NOM entre aussi
                          dans la file (migration `0056`). Le fichier ne portait
                          alors rien à afficher : on le DIT, plutôt que de
                          laisser une cellule vide qu'on prendrait pour une
                          panne d'affichage. Le numéro, lui, est en colonne
                          suivante — et c'est par lui que le rapprochement se
                          fera.
                        */}
                        {r.nom_source ? (
                          <>
                            <span className="font-medium">{r.nom_source}</span>
                            {r.prenom_source && ` ${r.prenom_source}`}
                          </>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Enveloppe sans nom
                          </span>
                        )}
                        {/*
                          L'ÉGLISE LUE PASSE DEVANT CELLE QUI A COLLECTÉ.
                          C'est celui qui a tenu la collecte qui l'a écrite dans
                          son fichier : elle dit à quelle église la personne
                          appartient, là où l'entité collectrice ne dit que
                          l'endroit où l'enveloppe a été remise. Sur un
                          rassemblement de district, les deux diffèrent.

                          Le libellé s'affiche MÊME QUAND rien ne l'a reconnu :
                          « Ambohipo » suffit souvent à trancher à l'œil, là où
                          un champ vide ne dit rien.
                        */}
                        {r.eglise_source ? (
                          <span className="text-muted-foreground block text-xs">
                            {r.eglise_source}
                            {!r.eglise_id && (
                              <span className="ml-1 italic">— église non reconnue</span>
                            )}
                          </span>
                        ) : (
                          r.entite && (
                            <span className="text-muted-foreground block text-xs">
                              {r.entite.nom}
                            </span>
                          )
                        )}
                      </TableCell>

                      <TableCell className="text-muted-foreground align-top font-mono text-xs">
                        {r.enveloppe_source ?? '—'}
                      </TableCell>

                      <TableCell className="text-right align-top text-sm tabular-nums">
                        {formatMontant(Number(r.versement?.montant ?? 0), devise)}
                      </TableCell>

                      <TableCell className="align-top">
                        <CroyantPicker
                          options={croyants}
                          value={retenu}
                          onChange={(id) => setChoix((c) => ({ ...c, [r.id]: id }))}
                          photos={photos}
                          placeholder="Chercher la fiche"
                          aria-label={
                            r.nom_source
                              ? `Rattacher ${r.nom_source}`
                              : `Rattacher l’enveloppe ${r.enveloppe_source ?? ''}`
                          }
                        />

                        {/*
                      EF-FIN-27 — LE NUMÉRO D'ENVELOPPE PROPOSE.

                      Le fichier l'a apporté avec le montant : il en dit souvent
                      plus que le nom, qui est justement celui qu'on n'a pas
                      reconnu. Une enveloppe se garde d'une année sur l'autre.
                    */}
                        <SuggestionsEnveloppe
                          porteurs={suggestions}
                          photos={photos}
                          fiche={(id) => {
                            const f = croyants.find((c) => c.id === id);
                            return f
                              ? {
                                  matricule: f.matricule,
                                  detail: f.detail,
                                  photoKey: f.photoKey,
                                }
                              : null;
                          }}
                          onChoisir={(id) => setChoix((c) => ({ ...c, [r.id]: id }))}
                        />
                      </TableCell>

                      <TableCell className="align-top">
                        <div className="flex flex-col items-stretch gap-1">
                          <Button
                            variant="outline"
                            className="h-9"
                            disabled={!retenu || enCours !== null}
                            onClick={() => void resoudre(r.id, retenu!)}
                          >
                            {enCours === r.id ? (
                              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                            ) : (
                              <UserCheck className="mr-2 size-4" aria-hidden />
                            )}
                            Rattacher
                          </Button>

                          {/*
                        AUCUNE CORRESPONDANCE N'EST AUSSI UNE RÉPONSE.

                        Le nom du fichier peut être celui de quelqu'un qui n'a
                        pas encore de fiche — un visiteur, un nouveau. La file
                        resterait alors bloquée sur une ligne qu'aucune
                        recherche ne résoudra. La fiche s'ouvre ici, amorcée du
                        nom lu, et le versement s'y rattache dans la foulée.

                        RÈGLE C — SAUF SI LE FICHIER NE PORTAIT AUCUN NOM. Il
                        n'y a alors rien pour amorcer la fiche, et on ouvrirait
                        un formulaire vide dont le seul résultat possible est
                        une personne inventée. Ces lignes-là se résolvent par la
                        recherche ou par la suggestion du numéro ; à défaut,
                        elles restent des enveloppes sans nom, ce qui est la
                        vérité.
                      */}
                          {r.nom_source && (
                            <Button
                              variant="ghost"
                              className="text-muted-foreground h-8 text-xs"
                              disabled={enCours !== null}
                              onClick={() => setCreation(r)}
                            >
                              <UserPlus className="mr-2 size-3.5" aria-hidden />
                              Créer la fiche
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>

        {/*
        UN SEUL POP-UP pour toute la file, piloté par la ligne retenue (règle
        16) : un par ligne monterait autant de formulaires que de rapprochements
        en attente, tous invisibles.

        Il vit HORS du repli : replier la file pendant qu'un formulaire de
        création est ouvert le démonterait, et la saisie en cours partirait avec.
      */}
        <NouveauCroyantDialog
          options={options}
          open={creation !== null}
          onOpenChange={(v) => {
            if (!v) setCreation(null);
          }}
          identite={
            creation
              ? { nom: creation.nom_source, prenom: creation.prenom_source ?? '' }
              : undefined
          }
          eglisePreselectionnee={creation ? egliseProbable(creation) : undefined}
          onCree={(id) => {
            const ligne = creation;
            setCreation(null);
            // La fiche vient d'être créée POUR ce versement : lui demander de la
            // rechercher ensuite ferait refaire un geste déjà fait.
            if (ligne) void resoudre(ligne.id, id);
          }}
        />
      </section>
    </Collapsible>
  );
}
