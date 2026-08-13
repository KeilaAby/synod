'use client';

import {
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  FileEdit,
  MoreVertical,
  Paperclip,
  Search,
  Send,
  Trash2,
  Undo2,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { MontantSigne, MouvementDialog } from '@/components/finances/mouvement-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { avertir } from '@/components/shared/messages';
import { OperationDialog } from '@/components/shared/operation-dialog';
import { StatusBadge, type Tone } from '@/components/shared/status-badge';
import { EntityPicker, type OptionEntite } from '@/components/structure/entity-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { changerStatutMouvement, supprimerMouvement } from '@/lib/actions/finances';
import type { CategorieFinance, MouvementListe } from '@/lib/data/finances';
import {
  LIBELLES_SENS,
  LIBELLES_STATUT_MOUVEMENT,
  PLAFOND_MOUVEMENTS,
  type SensFinance,
  type Solde,
  type StatutMouvement,
  compteDansLeSolde,
  estModifiable,
  soldeConsolide,
  soldeDeMouvements,
  soldeDesDescendants,
  soldePropre,
} from '@/lib/domain/finance';
import { formatDate, formatMontant, formatNombre } from '@/lib/utils/format';

import { MotifDialog } from './motif-dialog';

/**
 * Registre des mouvements — EF-FIN-01, EF-FIN-09 a 14.
 *
 * LES FILTRES N'ATTENDENT JAMAIS LE SERVEUR (règle 17). Le périmètre est chargé
 * en une requête et filtré en mémoire : ce qui coûte n'est pas la durée d'un
 * aller-retour mais leur nombre, et un filtre qui interroge à chaque frappe en
 * fait un par caractère.
 *
 * Statut et sens sont des ensembles CLOS : pictogrammes. L'entité est un
 * ensemble OUVERT : sélecteur (règle 18).
 */

const TON_STATUT: Record<StatutMouvement, Tone> = {
  BROUILLON: 'neutral',
  SOUMIS: 'warning',
  VALIDE: 'success',
  REJETE: 'danger',
  ANNULE: 'neutral',
};

/** Ce qu'un motif accompagne. Les deux se motivent (EF-FIN-14, EF-FIN-20). */
type ActionMotivee = { id: string; statut: 'REJETE' | 'ANNULE' } | null;

export function FinancesClient({
  mouvements,
  categories,
  entites,
  solde,
  entiteRacine,
  devise,
  justificatifs,
}: {
  mouvements: MouvementListe[];
  categories: CategorieFinance[];
  entites: OptionEntite[];
  solde: Solde | null;
  entiteRacine: { id: string; nom: string } | null;
  devise: string;
  /** EF-FIN-07 — cle de stockage -> URL signee, signees en lot par la page. */
  justificatifs: Record<string, string>;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [operation, setOperation] = useState<string | null>(null);
  const [motif, setMotif] = useState<ActionMotivee>(null);

  const [recherche, setRecherche] = useState('');
  const [statuts, setStatuts] = useState<Set<StatutMouvement>>(new Set());
  const [sens, setSens] = useState<Set<SensFinance>>(new Set());
  const [entite, setEntite] = useState<string | null>(null);

  const basculer = <T,>(ensemble: Set<T>, valeur: T): Set<T> => {
    const suivant = new Set(ensemble);
    if (suivant.has(valeur)) suivant.delete(valeur);
    else suivant.add(valeur);
    return suivant;
  };

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLocaleLowerCase('fr');

    return mouvements.filter((m) => {
      if (statuts.size > 0 && !statuts.has(m.statut)) return false;
      if (sens.size > 0 && !sens.has(m.sens)) return false;
      /**
       * L'ENTITÉ SEULE, jamais son sous-arbre.
       *
       * Le filtre remontait les mouvements des descendants : choisir un
       * régional donnait ceux de ses districts, de ses paroisses et de ses
       * églises, et l'on ne pouvait plus voir ce que le régional avait saisi
       * LUI-MÊME. Or chaque entité a son bureau et gère ses propres finances :
       * « les finances du régional » désigne les siennes, pas la somme de
       * celles de ses enfants.
       *
       * Le périmètre reste ce qui borne le CHOIX, pas le résultat : la liste
       * déroulante ne propose que les entités habilitées (RLS), et chacune s'y
       * sélectionne séparément. Qui peut voir ses enfants peut donc les
       * filtrer — un par un.
       */
      if (entite && m.entity_id !== entite) return false;
      if (!terme) return true;

      return [m.libelle, m.reference, m.categorie?.libelle, m.entite?.nom]
        .filter(Boolean)
        .some((v) => v!.toLocaleLowerCase('fr').includes(terme));
    });
    // `entites` a disparu des dépendances avec le chemin ltree : le filtre
    // compare désormais deux identifiants, il n'a plus besoin de l'arbre.
  }, [mouvements, recherche, statuts, sens, entite]);

  /** Un filtre est-il posé ? Décide si le triptyque suit l'écran ou la base. */
  const filtreActif =
    recherche.trim() !== '' || statuts.size > 0 || sens.size > 0 || entite !== null;

  /**
   * EF-FIN-10 — le triptyque SUIT les filtres.
   *
   * SANS FILTRE, on garde le solde calculé EN BASE : il porte sur tout
   * l'historique, quand la liste s'arrête au plafond de chargement. Les deux
   * coïncident tant qu'on est sous le plafond, et au-delà c'est la base qui a
   * raison — recalculer en mémoire ce qu'elle a déjà fait juste ne servirait
   * qu'à le rendre faux.
   *
   * AVEC UN FILTRE, la base ne sait pas ce qu'on regarde : on somme la
   * sélection. `soldeDeMouvements` n'y compte que le validé (RG-18), quel que
   * soit le filtre de statut posé.
   */
  const entitePropre = entite ?? entiteRacine?.id ?? null;

  const soldeAffiche = useMemo(
    () => (filtreActif ? soldeDeMouvements(filtres, entitePropre) : solde),
    [filtreActif, filtres, entitePropre, solde],
  );

  /**
   * Le partage propre / consolidé n'a plus de sens sur UNE entité.
   *
   * Le filtre ne retient que ses propres mouvements : le consolidé lui est
   * alors identique, et la part des descendants vaut zéro. Garder les quatre
   * cartes afficherait deux fois le même nombre sous deux noms différents —
   * la façon la plus sûre de faire douter des deux.
   */
  const uneSeuleEntite = entite !== null;

  /** Le nom sous lequel le « propre » s'annonce : celui de l'entité filtrée. */
  const nomPropre = useMemo(() => {
    if (!entite) return entiteRacine?.nom ?? '';
    return entites.find((e) => e.id === entite)?.nom ?? entiteRacine?.nom ?? '';
  }, [entite, entites, entiteRacine]);

  /**
   * Ce que la sélection contient MAIS que le solde ne compte pas.
   *
   * Filtrer sur « Brouillon » donne un triptyque à zéro. Sans un mot, cela se
   * lit comme une panne ; avec, cela se lit comme la règle — seul le validé
   * alimente un solde.
   */
  const nonComptes = useMemo(
    () => (filtreActif ? filtres.filter((m) => !compteDansLeSolde(m.statut)).length : 0),
    [filtreActif, filtres],
  );

  /**
   * Le chargement a-t-il été TRONQUÉ ?
   *
   * Au plafond, la liste ne porte plus tout le périmètre, et une somme calculée
   * dessus serait fausse sans le dire. On l'annonce plutôt que de laisser
   * croire à un total.
   */
  const tronque = mouvements.length >= PLAFOND_MOUVEMENTS;

  /** Effectifs par statut : on voit AVANT de cliquer sur un filtre. */
  const parStatut = useMemo(() => {
    const compte = new Map<StatutMouvement, number>();
    for (const m of mouvements) compte.set(m.statut, (compte.get(m.statut) ?? 0) + 1);
    return compte;
  }, [mouvements]);

  async function changerStatut(
    id: string,
    statut: StatutMouvement,
    libelle: string,
    motifTexte?: string,
  ) {
    setOperation(libelle);
    try {
      const resultat = await changerStatutMouvement({ id, statut, motif: motifTexte });

      if (!resultat.ok) {
        // Un refus s'explique en plusieurs lignes et disparaîtrait avant d'être
        // lu : pop-up que l'utilisateur ferme (règle 30).
        avertir(resultat.error, { ton: 'refus', titre: 'Opération refusée' });
        return;
      }
      toast.success(`Mouvement ${LIBELLES_STATUT_MOUVEMENT[statut].toLowerCase()}.`);
      demarrer(() => router.refresh());
    } finally {
      setOperation(null);
    }
  }

  async function supprimer(id: string) {
    setOperation('Suppression du mouvement…');
    try {
      const resultat = await supprimerMouvement({ id });
      if (!resultat.ok) {
        avertir(resultat.error, { ton: 'refus', titre: 'Suppression refusée' });
        return;
      }
      toast.success('Mouvement supprimé.');
      demarrer(() => router.refresh());
    } finally {
      setOperation(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* --- Le triptyque — EF-FIN-10, EF-FIN-12, EF-FIN-13 --------------- */}
      {soldeAffiche && entiteRacine && (
        <section className="space-y-3">
          <div
            className={
              uneSeuleEntite
                ? 'grid gap-4 sm:grid-cols-3'
                : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4'
            }
          >
            <CarteSolde
              libelle="Recettes"
              valeur={soldeAffiche.recettesConsolidees}
              devise={devise}
              ton="success"
            />
            <CarteSolde
              libelle="Dépenses"
              valeur={soldeAffiche.depensesConsolidees}
              devise={devise}
              ton="danger"
            />
            <CarteSolde
              libelle={uneSeuleEntite ? `Solde — ${nomPropre}` : 'Solde consolidé'}
              valeur={soldeConsolide(soldeAffiche)}
              devise={devise}
              ton={soldeConsolide(soldeAffiche) < 0 ? 'danger' : 'success'}
              detail={
                uneSeuleEntite
                  ? 'Cette entité seule — les mouvements de ses enfants ne sont pas comptés.'
                  : `dont ${formatMontant(soldeDesDescendants(soldeAffiche), devise)} au périmètre`
              }
            />
            {/*
              EF-FIN-12 — le PROPRE est montré à part, et ce n'est pas cosmétique :
              une paroisse dont le consolidé est confortable peut n'avoir rien en
              propre. Confondre les deux fait engager l'argent de ses églises.

              Il disparaît quand une entité est filtrée : le filtre ne retient
              déjà qu'elle, la carte répéterait la précédente.
            */}
            {!uneSeuleEntite && (
              <CarteSolde
                libelle={`Solde propre — ${nomPropre}`}
                valeur={soldePropre(soldeAffiche)}
                devise={devise}
                ton={soldePropre(soldeAffiche) < 0 ? 'danger' : 'neutral'}
              />
            )}
          </div>

          {/*
            CE QUE LES CARTES COMPTENT, DIT SANS DÉTOUR.

            Un triptyque qui change avec les filtres doit annoncer sur quoi il
            porte, sinon il devient impossible de savoir si l'on regarde le
            solde de l'entité ou celui d'une sélection.
          */}
          {filtreActif && (
            <p className="text-muted-foreground text-xs">
              Sur les{' '}
              <span className="tabular-nums">{formatNombre(filtres.length)}</span>{' '}
              mouvement{filtres.length > 1 ? 's' : ''} de la sélection.
              {nonComptes > 0 && (
                <>
                  {' '}
                  <span className="text-foreground">
                    {formatNombre(nonComptes)} n’{nonComptes > 1 ? 'entrent' : 'entre'}{' '}
                    pas dans le solde
                  </span>{' '}
                  — seul un mouvement validé y compte (RG-18).
                </>
              )}
              {tronque && (
                <>
                  {' '}
                  Le périmètre dépasse {formatNombre(PLAFOND_MOUVEMENTS)} mouvements : ces
                  totaux ne portent que sur ceux qui sont chargés.
                </>
              )}
            </p>
          )}
        </section>
      )}

      {/* --- Filtres ------------------------------------------------------ */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search
            className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Libellé, référence, catégorie, entité…"
            className="h-10 pl-9"
            aria-label="Rechercher un mouvement"
          />
        </div>

        <div className="min-w-64">
          {/* Le choix porte sur UNE entité, pas sur une branche : la liste
              propose chacune de celles du périmètre, séparément. */}
          <EntityPicker
            options={entites}
            value={entite}
            onChange={setEntite}
            placeholder="Toutes les entités"
            emptyMessage="Aucune entité dans votre périmètre."
          />
        </div>

        <GroupeFiltres libelle="Sens du mouvement">
          <FiltreIcone
            icone={ArrowUpCircle}
            libelle="Recettes"
            actif={sens.has('RECETTE')}
            classeActive="bg-emerald-600 text-white"
            onClick={() => setSens(basculer(sens, 'RECETTE'))}
          />
          <FiltreIcone
            icone={ArrowDownCircle}
            libelle="Dépenses"
            actif={sens.has('DEPENSE')}
            classeActive="bg-rose-600 text-white"
            onClick={() => setSens(basculer(sens, 'DEPENSE'))}
          />
        </GroupeFiltres>

        <GroupeFiltres libelle="Statut du mouvement">
          <FiltreIcone
            icone={FileEdit}
            libelle="Brouillons"
            badge={parStatut.get('BROUILLON') ?? 0}
            actif={statuts.has('BROUILLON')}
            onClick={() => setStatuts(basculer(statuts, 'BROUILLON'))}
          />
          <FiltreIcone
            icone={Send}
            libelle="À valider"
            badge={parStatut.get('SOUMIS') ?? 0}
            actif={statuts.has('SOUMIS')}
            classeActive="bg-amber-500 text-white"
            onClick={() => setStatuts(basculer(statuts, 'SOUMIS'))}
          />
          <FiltreIcone
            icone={CheckCircle2}
            libelle="Validés"
            badge={parStatut.get('VALIDE') ?? 0}
            actif={statuts.has('VALIDE')}
            classeActive="bg-emerald-600 text-white"
            onClick={() => setStatuts(basculer(statuts, 'VALIDE'))}
          />
          <FiltreIcone
            icone={XCircle}
            libelle="Rejetés ou annulés"
            badge={(parStatut.get('REJETE') ?? 0) + (parStatut.get('ANNULE') ?? 0)}
            actif={statuts.has('REJETE')}
            classeActive="bg-rose-600 text-white"
            onClick={() => setStatuts(basculer(statuts, 'REJETE'))}
          />
        </GroupeFiltres>

        <MouvementDialog
          entites={entites}
          categories={categories}
          categoriesParDefaut={entite ?? entiteRacine?.id ?? null}
          devise={devise}
          peutDeleguer
        />
      </div>

      {/* --- Le registre -------------------------------------------------- */}
      {mouvements.length >= PLAFOND_MOUVEMENTS && (
        <p className="text-muted-foreground text-xs">
          Seuls les {formatNombre(PLAFOND_MOUVEMENTS)} mouvements les plus récents sont
          chargés. Restreignez l’entité pour en voir d’autres.
        </p>
      )}

      {filtres.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Aucun mouvement"
          description={
            mouvements.length === 0
              ? 'Aucune recette ni dépense n’est encore enregistrée dans votre périmètre.'
              : 'Aucun mouvement ne correspond à ces filtres.'
          }
        />
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Date</TableHead>
                <TableHead>Entité</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="w-16">Pièce</TableHead>
                <TableHead className="w-28">Statut</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {filtres.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs tabular-nums">
                    {formatDate(m.date_operation)}
                  </TableCell>

                  <TableCell>
                    <span className="block text-sm">{m.entite?.nom ?? '—'}</span>
                    {/* EF-FIN-06 — une saisie déléguée se SIGNALE partout. */}
                    {m.est_delegue && (
                      <StatusBadge tone="accent" className="mt-1">
                        Saisie déléguée
                      </StatusBadge>
                    )}
                  </TableCell>

                  <TableCell className="text-sm">
                    {m.categorie?.libelle ?? '—'}
                    <span className="text-muted-foreground block text-xs">
                      {LIBELLES_SENS[m.sens]}
                    </span>
                  </TableCell>

                  <TableCell className="text-sm">
                    {m.libelle ?? <span className="text-muted-foreground">—</span>}
                    {m.reference && (
                      <span className="text-muted-foreground block font-mono text-xs">
                        {m.reference}
                      </span>
                    )}
                    {m.motif_rejet && (
                      <span className="text-destructive block text-xs">
                        Rejeté : {m.motif_rejet}
                      </span>
                    )}
                    {m.motif_annulation && (
                      <span className="text-muted-foreground block text-xs">
                        Annulé : {m.motif_annulation}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <MontantSigne montant={m.montant} sens={m.sens} devise={devise} />
                  </TableCell>

                  {/* EF-FIN-07 — la pièce s'ouvre dans un onglet : un PDF ou
                      une photo de reçu n'a pas sa place dans un tableau, et
                      l'URL signée expire. */}
                  <TableCell>
                    {m.justificatif_key && justificatifs[m.justificatif_key] ? (
                      <a
                        href={justificatifs[m.justificatif_key]}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                        title="Ouvrir la pièce justificative"
                      >
                        <Paperclip className="size-4" aria-hidden />
                        <span className="sr-only">Ouvrir la pièce justificative</span>
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <StatusBadge tone={TON_STATUT[m.statut]}>
                      {LIBELLES_STATUT_MOUVEMENT[m.statut]}
                    </StatusBadge>
                  </TableCell>

                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Actions sur le mouvement du ${formatDate(m.date_operation)}`}
                        >
                          <MoreVertical className="size-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="end" className="w-56">
                        {/*
                          RG-17 — « Modifier » n'apparaît pas sur un mouvement
                          validé. Proposer un bouton qui déclenchera une
                          exception SQL est une promesse qu'on ne tient pas.
                        */}
                        {estModifiable(m.statut) && (
                          <MouvementDialog
                            entites={entites}
                            categories={categories}
                            mouvement={m}
                            devise={devise}
                            peutDeleguer={false}
                            declencheur={
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                <FileEdit className="mr-2 size-4" aria-hidden />
                                Modifier
                              </DropdownMenuItem>
                            }
                          />
                        )}

                        {m.statut === 'BROUILLON' && (
                          <DropdownMenuItem
                            onSelect={() =>
                              void changerStatut(m.id, 'SOUMIS', 'Envoi à la validation…')
                            }
                          >
                            <Send className="mr-2 size-4" aria-hidden />
                            Soumettre à validation
                          </DropdownMenuItem>
                        )}

                        {m.statut === 'SOUMIS' && (
                          <>
                            <DropdownMenuItem
                              onSelect={() =>
                                void changerStatut(m.id, 'VALIDE', 'Validation…')
                              }
                            >
                              <CheckCircle2 className="mr-2 size-4" aria-hidden />
                              Valider
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => setMotif({ id: m.id, statut: 'REJETE' })}
                            >
                              <XCircle className="mr-2 size-4" aria-hidden />
                              Rejeter…
                            </DropdownMenuItem>
                          </>
                        )}

                        {m.statut === 'REJETE' && (
                          <DropdownMenuItem
                            onSelect={() =>
                              void changerStatut(m.id, 'BROUILLON', 'Reprise en brouillon…')
                            }
                          >
                            <Undo2 className="mr-2 size-4" aria-hidden />
                            Reprendre la saisie
                          </DropdownMenuItem>
                        )}

                        {m.statut !== 'ANNULE' && (
                          <>
                            <DropdownMenuSeparator />
                            {/* EF-FIN-20 — un validé ne se supprime pas, il
                                s'annule, et l'annulation se motive. */}
                            <DropdownMenuItem
                              onSelect={() => setMotif({ id: m.id, statut: 'ANNULE' })}
                            >
                              <XCircle className="mr-2 size-4" aria-hidden />
                              Annuler le mouvement…
                            </DropdownMenuItem>

                            {m.statut !== 'VALIDE' && (
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => void supprimer(m.id)}
                              >
                                <Trash2 className="mr-2 size-4" aria-hidden />
                                Supprimer
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <MotifDialog
        key={motif?.id ?? 'aucun'}
        action={motif}
        onFermer={() => setMotif(null)}
        onValider={(texte) => {
          if (!motif) return;
          const libelle =
            motif.statut === 'REJETE' ? 'Rejet du mouvement…' : 'Annulation du mouvement…';
          setMotif(null);
          void changerStatut(motif.id, motif.statut, libelle, texte);
        }}
      />

      <OperationDialog
        ouvert={operation !== null || enCours}
        titre={operation ?? 'Actualisation…'}
        description="Cette opération met à jour les soldes de tout le périmètre."
      />
    </div>
  );
}

/**
 * Une carte du triptyque — UI-05.
 *
 * Le montant est en `tabular-nums` : sans chiffres de largeur fixe, quatre
 * cartes alignées donnent quatre montants qui dansent. La chasse fixe, elle,
 * n'y ajoutait rien — c'est `tabular-nums` qui aligne, pas `font-mono` — et
 * donnait à un écran de trésorerie l'aspect d'un terminal.
 */
function CarteSolde({
  libelle,
  valeur,
  devise,
  ton,
  detail,
}: {
  libelle: string;
  valeur: number;
  devise: string;
  ton: Tone;
  detail?: string;
}) {
  const couleur =
    ton === 'success'
      ? 'text-emerald-700'
      : ton === 'danger'
        ? 'text-rose-700'
        : 'text-foreground';

  return (
    <Card>
      <CardContent className="space-y-1 p-6">
        <p className="text-muted-foreground text-xs font-medium">{libelle}</p>
        <p className={`text-2xl font-semibold tabular-nums ${couleur}`}>
          {formatMontant(valeur, devise)}
        </p>
        {detail && <p className="text-muted-foreground text-xs">{detail}</p>}
      </CardContent>
    </Card>
  );
}
