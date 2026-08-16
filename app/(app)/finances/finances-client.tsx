'use client';

import {
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  FileEdit,
  FilterX,
  Lock,
  MoreVertical,
  Paperclip,
  PenLine,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  Undo2,
  UserCog,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { BoutonExport } from '@/components/finances/bouton-export';
import type { TableauExportable } from '@/components/finances/exporter';
import { MontantSigne, MouvementDialog } from '@/components/finances/mouvement-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { Field } from '@/components/shared/field';
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
import { changerStatutMouvement, supprimerMouvement } from '@/lib/actions/finances';
import type { CategorieFinance, MouvementListe } from '@/lib/data/finances';
import {
  FILTRES_MOUVEMENTS_VIDES,
  type FiltresMouvements,
  LIBELLES_SENS,
  LIBELLES_STATUT_MOUVEMENT,
  PLAFOND_MOUVEMENTS,
  type Solde,
  type StatutMouvement,
  compteDansLeSolde,
  estEnPeriodeClose,
  estModifiable,
  filtreEstActif,
  filtrerMouvements,
  nombreFiltresAvances,
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
  periodesCloses = [],
}: {
  mouvements: MouvementListe[];
  categories: CategorieFinance[];
  entites: OptionEntite[];
  solde: Solde | null;
  entiteRacine: { id: string; nom: string } | null;
  devise: string;
  /** EF-FIN-07 — cle de stockage -> URL signee, signees en lot par la page. */
  justificatifs: Record<string, string>;
  /** EF-FIN-26 — les mois arrêtés, en clés `entite|AAAA-MM`. */
  periodesCloses?: readonly string[];
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [operation, setOperation] = useState<string | null>(null);
  const [motif, setMotif] = useState<ActionMotivee>(null);

  /**
   * EF-FIN-22 — UN SEUL ÉTAT POUR TOUS LES CRITÈRES.
   *
   * Onze critères en onze `useState` auraient donné onze dépendances à tenir
   * à jour dans chaque `useMemo`, et un oubli n'y produit pas une erreur mais
   * un résultat périmé — la panne la plus difficile à voir.
   *
   * Le filtrage lui-même vit dans le domaine (`filtrerMouvements`), où il est
   * testé : l'écran ne décide plus de ce qu'un critère signifie.
   */
  /**
   * Un `Set` plutôt qu'un tableau : la question se pose une fois par ligne du
   * registre, et une recherche linéaire y coûterait cinq mille lignes fois
   * cinquante clôtures. Les clés traversent en chaînes — un `Set` ne franchit
   * pas la frontière serveur → client (règle 24).
   */
  const closes = useMemo(() => new Set(periodesCloses), [periodesCloses]);

  const [criteres, setCriteres] = useState<FiltresMouvements>(FILTRES_MOUVEMENTS_VIDES);
  const [avances, setAvances] = useState(false);

  const poser = (modif: Partial<FiltresMouvements>) =>
    setCriteres((c) => ({ ...c, ...modif }));

  const basculer = <T,>(liste: readonly T[], valeur: T): T[] =>
    liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur];

  const recherche = criteres.recherche;
  const entite = criteres.entiteId;

  const filtres = useMemo(
    /**
     * L'ENTITÉ SEULE, jamais son sous-arbre — voir `filtrerMouvements`.
     *
     * Le filtre remontait les mouvements des descendants : choisir un régional
     * donnait ceux de ses districts et de ses églises, et l'on ne pouvait plus
     * voir ce que le régional avait saisi LUI-MÊME. Le périmètre borne le
     * CHOIX, pas le résultat.
     */
    () => filtrerMouvements(mouvements, criteres),
    [mouvements, criteres],
  );

  /** Un filtre est-il posé ? Décide si le triptyque suit l'écran ou la base. */
  const filtreActif = filtreEstActif(criteres);

  /**
   * LES AUTEURS SONT TIRÉS DES MOUVEMENTS CHARGÉS, pas de la table des comptes.
   *
   * On filtre sur qui a saisi ce qu'on regarde : proposer un compte qui n'a
   * rien saisi dans ce périmètre ne peut donner qu'une liste vide, et une
   * liste vide sans cause visible se lit comme une panne (règle 15).
   */
  const auteurs = useMemo(() => {
    const connus = new Map<string, string>();
    for (const m of mouvements) {
      if (m.saisi_par && m.auteur) connus.set(m.saisi_par, m.auteur.nom_complet);
    }
    return [...connus.entries()]
      .map(([id, nom]) => ({ id, nom }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [mouvements]);

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

  /**
   * EF-FIN-25 — le registre exporté, dans l'ordre où il est lu.
   *
   * UNE FONCTION, appelée à l'ouverture du menu : la sélection change à chaque
   * frappe dans la recherche, et reconstruire quelques milliers de lignes de
   * tableur à chacune ferait ramer la saisie pour un fichier que personne n'a
   * demandé.
   *
   * LE MONTANT PART EN NOMBRE, le reste en texte. C'est ce qui permet de le
   * sommer dans le classeur — la première chose qu'on fait d'un export
   * financier. Le SENS reste une colonne à part : une dépense en négatif se
   * sommerait bien, mais ne se lirait plus comme une dépense.
   */
  const tableauExportable = (): TableauExportable => ({
    titre: 'Mouvements financiers',
    sousTitre: filtreActif
      ? `Sélection filtrée — ${formatNombre(filtres.length)} mouvement${filtres.length > 1 ? 's' : ''}`
      : `${nomPropre} et son périmètre — ${formatNombre(filtres.length)} mouvement${filtres.length > 1 ? 's' : ''}`,
    entetes: [
      'Date',
      'Entité',
      'Catégorie',
      'Sens',
      `Montant (${devise})`,
      'Libellé',
      'Référence',
      'Statut',
      'Saisi par',
      'Origine',
    ],
    lignes: filtres.map((m) => [
      m.date_operation,
      m.entite?.nom ?? '',
      m.categorie?.libelle ?? '',
      LIBELLES_SENS[m.sens],
      Number(m.montant),
      m.libelle ?? '',
      m.reference ?? '',
      LIBELLES_STATUT_MOUVEMENT[m.statut],
      m.auteur?.nom_complet ?? '',
      m.est_delegue ? 'Saisie déléguée' : 'Saisie directe',
    ]),
  });

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
            onChange={(e) => poser({ recherche: e.target.value })}
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
            onChange={(id) => poser({ entiteId: id })}
            placeholder="Toutes les entités"
            emptyMessage="Aucune entité dans votre périmètre."
          />
        </div>

        <GroupeFiltres libelle="Sens du mouvement">
          <FiltreIcone
            icone={ArrowUpCircle}
            libelle="Recettes"
            actif={criteres.sens.includes('RECETTE')}
            classeActive="bg-emerald-600 text-white"
            onClick={() => poser({ sens: basculer(criteres.sens, 'RECETTE') })}
          />
          <FiltreIcone
            icone={ArrowDownCircle}
            libelle="Dépenses"
            actif={criteres.sens.includes('DEPENSE')}
            classeActive="bg-rose-600 text-white"
            onClick={() => poser({ sens: basculer(criteres.sens, 'DEPENSE') })}
          />
        </GroupeFiltres>

        <GroupeFiltres libelle="Statut du mouvement">
          <FiltreIcone
            icone={FileEdit}
            libelle="Brouillons"
            badge={parStatut.get('BROUILLON') ?? 0}
            actif={criteres.statuts.includes('BROUILLON')}
            onClick={() => poser({ statuts: basculer(criteres.statuts, 'BROUILLON') })}
          />
          <FiltreIcone
            icone={Send}
            libelle="À valider"
            badge={parStatut.get('SOUMIS') ?? 0}
            actif={criteres.statuts.includes('SOUMIS')}
            classeActive="bg-amber-500 text-white"
            onClick={() => poser({ statuts: basculer(criteres.statuts, 'SOUMIS') })}
          />
          <FiltreIcone
            icone={CheckCircle2}
            libelle="Validés"
            badge={parStatut.get('VALIDE') ?? 0}
            actif={criteres.statuts.includes('VALIDE')}
            classeActive="bg-emerald-600 text-white"
            onClick={() => poser({ statuts: basculer(criteres.statuts, 'VALIDE') })}
          />
          <FiltreIcone
            icone={XCircle}
            libelle="Rejetés ou annulés"
            badge={(parStatut.get('REJETE') ?? 0) + (parStatut.get('ANNULE') ?? 0)}
            actif={criteres.statuts.includes('REJETE')}
            classeActive="bg-rose-600 text-white"
            onClick={() => poser({ statuts: basculer(criteres.statuts, 'REJETE') })}
          />
        </GroupeFiltres>

        {/*
          EF-FIN-22 — LES CRITÈRES SECONDAIRES SE REPLIENT.

          Onze contrôles de front noieraient les quatre qu'on emploie tous les
          jours. Ceux-ci se déplient — mais le COMPTE de ceux qui sont posés
          reste visible sur le bouton : un filtre caché qui vide la liste sans
          qu'on puisse le voir est pire que pas de filtre du tout.
        */}
        <Button
          variant={avances ? 'default' : 'outline'}
          className="h-10"
          aria-expanded={avances}
          onClick={() => setAvances((v) => !v)}
        >
          <SlidersHorizontal className="mr-2 size-4" aria-hidden />
          Plus de filtres
          {nombreFiltresAvances(criteres) > 0 && (
            <span className="bg-background text-foreground ml-2 rounded-full px-2 py-0.5 text-xs tabular-nums">
              {nombreFiltresAvances(criteres)}
            </span>
          )}
        </Button>

        {/*
          EF-FIN-25 — ON EXPORTE CE QU'ON VOIT.

          Les lignes sont celles de la sélection, filtres compris : un fichier
          qui rendrait tout le périmètre alors que l'écran en montre un dixième
          serait impossible à rapprocher de ce qu'on vient de lire.
        */}
        <BoutonExport nombre={filtres.length} tableau={tableauExportable} />

        <MouvementDialog
          entites={entites}
          categories={categories}
          categoriesParDefaut={entite ?? entiteRacine?.id ?? null}
          devise={devise}
          peutDeleguer
        />
      </div>

      {/* --- Les critères secondaires ------------------------------------- */}
      {avances && (
        <div className="border-border bg-muted/30 grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Catégorie">
            {(aria) => (
              /* Ensemble OUVERT — un référentiel que l'administration
                 alimente : sélecteur, pas pictogrammes (règle 18). */
              <Select
                value={criteres.categorieId ?? 'toutes'}
                onValueChange={(v) => poser({ categorieId: v === 'toutes' ? null : v })}
              >
                <SelectTrigger {...aria} className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="toutes">Toutes les catégories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.libelle} — {c.sens === 'RECETTE' ? 'recette' : 'dépense'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field label="Saisi par">
            {(aria) => (
              <Select
                value={criteres.auteurId ?? 'tous'}
                onValueChange={(v) => poser({ auteurId: v === 'tous' ? null : v })}
              >
                <SelectTrigger {...aria} className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Tous les auteurs</SelectItem>
                  {auteurs.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          {/* Les DEUX bornes sont incluses : « du 1er au 31 août » désigne
              août entier pour tout le monde sauf pour un informaticien. */}
          <Field label="Du" hint="Borne incluse.">
            {(aria) => (
              <Input
                {...aria}
                type="date"
                value={criteres.du ?? ''}
                onChange={(e) => poser({ du: e.target.value || null })}
                className="h-10 tabular-nums"
              />
            )}
          </Field>

          <Field label="Au" hint="Borne incluse.">
            {(aria) => (
              <Input
                {...aria}
                type="date"
                value={criteres.au ?? ''}
                onChange={(e) => poser({ au: e.target.value || null })}
                className="h-10 tabular-nums"
              />
            )}
          </Field>

          <Field label={`Montant minimum (${devise})`}>
            {(aria) => (
              <Input
                {...aria}
                type="number"
                inputMode="numeric"
                min={0}
                value={criteres.montantMin ?? ''}
                /* `''` donne `null`, jamais `0` : « au moins zéro » ne filtre
                   rien mais afficherait un critère posé, et le compte du
                   bouton mentirait. */
                onChange={(e) =>
                  poser({ montantMin: e.target.value === '' ? null : Number(e.target.value) })
                }
                className="h-10 tabular-nums"
              />
            )}
          </Field>

          <Field label={`Montant maximum (${devise})`}>
            {(aria) => (
              <Input
                {...aria}
                type="number"
                inputMode="numeric"
                min={0}
                value={criteres.montantMax ?? ''}
                onChange={(e) =>
                  poser({ montantMax: e.target.value === '' ? null : Number(e.target.value) })
                }
                className="h-10 tabular-nums"
              />
            )}
          </Field>

          <div className="flex items-end">
            {/* EF-FIN-06 — l'origine se FILTRE, et pas seulement se signale.
                Ensemble clos de deux valeurs : pictogrammes (règle 18). */}
            <GroupeFiltres libelle="Origine de la saisie">
              <FiltreIcone
                icone={PenLine}
                libelle="Saisie directe"
                actif={criteres.origine === 'DIRECTE'}
                onClick={() =>
                  poser({ origine: criteres.origine === 'DIRECTE' ? null : 'DIRECTE' })
                }
              />
              <FiltreIcone
                icone={UserCog}
                libelle="Saisie déléguée"
                actif={criteres.origine === 'DELEGUEE'}
                classeActive="bg-indigo-600 text-white"
                onClick={() =>
                  poser({ origine: criteres.origine === 'DELEGUEE' ? null : 'DELEGUEE' })
                }
              />
            </GroupeFiltres>
          </div>

          <div className="flex items-end justify-end">
            {/*
              TOUT REMETTRE À ZÉRO D'UN GESTE. Défaire onze critères un par un
              pour repartir d'une liste complète est la façon la plus sûre d'en
              oublier un — et de conclure à une donnée manquante.
            */}
            <Button
              variant="ghost"
              className="h-10"
              disabled={!filtreActif}
              onClick={() => setCriteres(FILTRES_MOUVEMENTS_VIDES)}
            >
              <FilterX className="mr-2 size-4" aria-hidden />
              Tout effacer
            </Button>
          </div>
        </div>
      )}

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

                    {/*
                      EF-FIN-26 — LE VERROU SE VOIT SUR LA LIGNE.

                      Sans cette mention, le menu ⋮ vide se lit comme un droit
                      manquant : on cherche sur soi une habilitation qui ne
                      manque pas. La cause est ici, et elle est datée.
                    */}
                    {estEnPeriodeClose(m, closes) && (
                      <span className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                        <Lock className="size-3" aria-hidden />
                        Période close
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          // Une période close ne laisse RIEN faire : ni
                          // modifier, ni soumettre, ni annuler. Le verrou est
                          // tenu par la base ; l'écran ne fait que l'annoncer.
                          disabled={estEnPeriodeClose(m, closes)}
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
