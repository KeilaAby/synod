'use client';

import { Loader2, UserCheck, UserPlus, UserSearch } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { NouveauCroyantDialog, type OptionsCroyant } from '@/components/croyants/croyant-dialog';
import { CroyantPicker, type OptionCroyant } from '@/components/croyants/croyant-picker';
import {
  SuggestionsEnveloppe,
  type PorteurSuggere,
} from '@/components/finances/suggestions-enveloppe';
import { avertir } from '@/components/shared/messages';
import { Button } from '@/components/ui/button';
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
   * L'église la plus PROBABLE : celle qui a collecté.
   *
   * Quelqu'un qui met une enveloppe dans l'urne d'Antsahatsiresy en est le plus
   * souvent membre. Ce n'est qu'une amorce — le champ reste libre.
   *
   * On ne crée AUCUNE entité « église inconnue » pour les autres cas : elle
   * entrerait dans la structure, recevrait un code, apparaîtrait dans chaque
   * sélecteur, dans l'organigramme et dans les soldes consolidés, et
   * quelqu'un finirait par y transférer un vrai croyant. Quand la collecte
   * vient d'un district ou d'une paroisse — un rassemblement —, l'église est
   * réellement inconnue : elle se choisit, ce qui prend un geste et laisse une
   * donnée juste.
   */
  function egliseProbable(r: RapprochementEnAttente): string | undefined {
    return options.eglises.some((e) => e.id === r.entite_id) ? r.entite_id : undefined;
  }

  if (rapprochements.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="border-destructive/30 bg-destructive/5 flex items-start gap-3 rounded-lg border p-4">
        <UserSearch className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="text-sm">
          <span className="font-medium">
            {formatNombre(rapprochements.length)} versement
            {rapprochements.length > 1 ? 's' : ''} sans fiche
          </span>{' '}
          <span className="text-muted-foreground">
            — le montant est déjà compté, seul le nom reste à retrouver.
          </span>
        </p>
      </div>

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
                    {/* CE QUE LE FICHIER DISAIT, tel quel : c'est contre lui
                        qu'on rapproche, et le corriger effacerait la trace. */}
                    <span className="font-medium">{r.nom_source}</span>
                    {r.prenom_source && ` ${r.prenom_source}`}
                    {r.entite && (
                      <span className="text-muted-foreground block text-xs">
                        {r.entite.nom}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-muted-foreground align-top font-mono text-xs">
                    {r.enveloppe_source ?? '—'}
                  </TableCell>

                  <TableCell className="align-top text-right text-sm tabular-nums">
                    {formatMontant(Number(r.versement?.montant ?? 0), devise)}
                  </TableCell>

                  <TableCell className="align-top">
                    <CroyantPicker
                      options={croyants}
                      value={retenu}
                      onChange={(id) => setChoix((c) => ({ ...c, [r.id]: id }))}
                      photos={photos}
                      placeholder="Chercher la fiche"
                      aria-label={`Rattacher ${r.nom_source}`}
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
                      */}
                      <Button
                        variant="ghost"
                        className="text-muted-foreground h-8 text-xs"
                        disabled={enCours !== null}
                        onClick={() => setCreation(r)}
                      >
                        <UserPlus className="mr-2 size-3.5" aria-hidden />
                        Créer la fiche
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/*
        UN SEUL POP-UP pour toute la file, piloté par la ligne retenue (règle
        16) : un par ligne monterait autant de formulaires que de rapprochements
        en attente, tous invisibles.
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
  );
}
