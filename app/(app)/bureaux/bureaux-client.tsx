'use client';

import {
  Briefcase,
  CircleCheck,
  CircleSlash,
  List,
  MoreVertical,
  Network,
  Pencil,
  Search,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { avertir } from '@/components/shared/messages';
import { BureauComposition } from '@/components/bureaux/bureau-composition';
import type { CandidatOption } from '@/components/bureaux/designation-dialog';
import {
  type BureauxActifsParEntite,
  MandatDialog,
} from '@/components/bureaux/mandat-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { OperationDialog } from '@/components/shared/operation-dialog';
import { useSession } from '@/components/shared/session-provider';
import { StatusBadge } from '@/components/shared/status-badge';
import type { OptionEntite } from '@/components/structure/entity-picker';
import { TypeBadge } from '@/components/structure/type-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cloreMandat, supprimerBureau } from '@/lib/actions/bureaux';
import type { BureauComplet } from '@/lib/data/bureaux';
import {
  type FonctionBureau,
  composerBureau,
  comptePostes,
  libelleAffichage,
} from '@/lib/domain/bureau';
import { normaliserRecherche } from '@/lib/domain/croyant';
import { ENTITY_LABELS, ENTITY_TYPES, type EntityType } from '@/lib/domain/hierarchy';
import type { ActionResult } from '@/lib/domain/result';
import { formatDate, formatNombre } from '@/lib/utils/format';

/**
 * Bureaux du périmètre — EF-BUR-01, EF-BUR-07.
 *
 * Une carte par bureau, sa composition en pop-up : consulter qui est trésorier
 * ne justifie pas une navigation, et l'on revient ensuite sur un autre bureau.
 *
 * Les cartes portent le taux de remplissage, parce que c'est la première
 * question qu'on se pose devant une liste de bureaux — lequel est incomplet.
 */
export function BureauxClient({
  bureaux,
  fonctions,
  candidats,
  photos,
  entites,
  joursDelai,
}: {
  bureaux: BureauComplet[];
  fonctions: FonctionBureau[];
  candidats: CandidatOption[];
  photos: Record<string, string>;
  entites: OptionEntite[];
  /** EF-BUR-08 — délai de correction, réglé dans « Corrections de saisie ». */
  joursDelai: number;
}) {
  const { peut } = useSession();
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [aModifier, setAModifier] = useState<BureauComplet | null>(null);
  /**
   * Clore demande confirmation, comme supprimer.
   *
   * Ce n'est pas la même perte — l'historique reste — mais c'est la même
   * irréversibilité côté écran : rien ne rouvre un mandat clos, et le geste
   * partait d'une entrée de menu, sans retour possible.
   */
  const [aClore, setAClore] = useState<BureauComplet | null>(null);
  const [aSupprimer, setASupprimer] = useState<BureauComplet | null>(null);
  /** Ce qui est en train de se faire — alimente le pop-up d'attente. */
  const [operation, setOperation] = useState<{
    titre: string;
    description: string;
  } | null>(null);

  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState<'tous' | 'actifs' | 'clos'>('actifs');
  /**
   * LE NIVEAU D'ENTITE, EN ONGLETS — règle 18.
   *
   * Les six niveaux forment un ensemble CLOS ET CONNU : ils se présentent donc
   * en onglets, pas en sélecteur. Les entités elles-mêmes sont un ensemble
   * ouvert — un onglet par église en donnerait vingt, illisibles, et un de plus
   * à chaque création.
   *
   * `null` = tous les niveaux, et c'est le défaut : un écran qui s'ouvre déjà
   * filtré cache une partie de ce qu'on vient voir.
   */
  const [niveau, setNiveau] = useState<EntityType | null>(null);
  /**
   * EF-BUR-01 — le niveau de navigation de plus, demandé le 20 août 2026 :
   * « onglet de niveau → liste des entités → clic → liste des bureaux ».
   *
   * `null` = on est sur la LISTE DES ENTITÉS du niveau (ou, sans niveau
   * choisi, sur la vue groupée d'aujourd'hui, inchangée). Posé, on est
   * DANS une entité : ses bureaux, et eux seuls.
   */
  const [entiteId, setEntiteId] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<BureauComplet | null>(null);

  const rechercheDifferee = useDeferredValue(recherche);

  const filtres = useMemo(() => {
    const terme = normaliserRecherche(rechercheDifferee);

    return bureaux.filter((b) => {
      if (statut === 'actifs' && !b.is_active) return false;
      if (statut === 'clos' && b.is_active) return false;
      if (niveau && b.entite?.type !== niveau) return false;
      // Dans une entité : ses bureaux, et eux seuls.
      if (entiteId && b.entity_id !== entiteId) return false;
      if (!terme) return true;

      const texte = normaliserRecherche(
        [b.libelle, b.entite?.nom ?? '', b.entite?.code ?? ''].join(' '),
      );
      return terme.split(' ').every((mot) => texte.includes(mot));
    });
  }, [bureaux, rechercheDifferee, statut, niveau, entiteId]);

  /**
   * Les niveaux qui portent VRAIMENT un bureau, et combien.
   *
   * On ne propose pas les six d'office : un onglet « Régional » sur une
   * organisation qui n'en a aucun se cliquerait pour ne rien montrer, et
   * ferait chercher une donnée qui n'existe pas (règle 15 — un vide doit se
   * distinguer d'une absence).
   *
   * Le compte suit le filtre de STATUT mais ignore la recherche : il dit
   * combien de bureaux ce niveau contient, pas combien répondent à la frappe
   * en cours — un onglet dont le nombre change à chaque touche ne se lit plus.
   */
  const niveaux = useMemo(() => {
    const compte = new Map<EntityType, number>();

    for (const b of bureaux) {
      if (statut === 'actifs' && !b.is_active) continue;
      if (statut === 'clos' && b.is_active) continue;

      const type = b.entite?.type as EntityType | undefined;
      if (!type) continue;
      compte.set(type, (compte.get(type) ?? 0) + 1);
    }

    // L'ordre hiérarchique, jamais celui des données : le Siège en tête.
    return ENTITY_TYPES.filter((t) => compte.has(t)).map((t) => ({
      type: t,
      libelle: ENTITY_LABELS[t].pluriel,
      nombre: compte.get(t)!,
    }));
  }, [bureaux, statut]);

  /**
   * Les bureaux GROUPÉS PAR ENTITÉ — « onglets d'entité → cartes → liste ».
   *
   * Une entité peut porter plusieurs bureaux : le mandat en cours et ceux qui
   * l'ont précédé. Les mêler dans une grille plate obligeait à lire le
   * sous-titre de chaque carte pour reconstituer à qui elle appartient.
   * Le titre le dit une fois, et les cartes suivent.
   */
  const groupes = useMemo(() => {
    const table = new Map<
      string,
      { nom: string; code: string; bureaux: BureauComplet[] }
    >();

    for (const b of filtres) {
      const cle = b.entity_id;
      const groupe = table.get(cle) ?? {
        nom: b.entite?.nom ?? 'Entité inconnue',
        code: b.entite?.code ?? '',
        bureaux: [],
      };
      groupe.bureaux.push(b);
      table.set(cle, groupe);
    }

    return [...table.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [filtres]);

  /**
   * TOUTES LES ENTITÉS DU NIVEAU CHOISI, y compris celles qui n'ont AUCUN
   * bureau — c'est justement sur elles qu'il y a quelque chose à faire
   * (règle 15 : une entité sans bureau doit figurer et le dire, pas
   * disparaître). `groupes`, lui, ne connaît que les entités qui EN ONT
   * déjà un : il ne peut donc pas servir cette liste-ci.
   *
   * Le compte suit le filtre de STATUT, comme les onglets de niveau — un
   * bureau clos ne doit pas gonfler « 3 bureaux » quand seul « Mandats en
   * cours » est demandé.
   */
  const entitesDuNiveau = useMemo(() => {
    if (!niveau) return [];

    const compteParEntite = new Map<string, number>();
    for (const b of bureaux) {
      if (statut === 'actifs' && !b.is_active) continue;
      if (statut === 'clos' && b.is_active) continue;
      if (b.entite?.type !== niveau) continue;
      compteParEntite.set(b.entity_id, (compteParEntite.get(b.entity_id) ?? 0) + 1);
    }

    const terme = normaliserRecherche(rechercheDifferee);

    return entites
      .filter((e) => e.type === niveau)
      .filter((e) => !terme || normaliserRecherche(`${e.nom} ${e.code}`).includes(terme))
      .map((e) => ({ ...e, nombreBureaux: compteParEntite.get(e.id) ?? 0 }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [niveau, bureaux, statut, entites, rechercheDifferee]);

  /** L'entité dans laquelle on est descendu — pour l'en-tête « ← Retour ». */
  const entiteOuverte = useMemo(
    () => (entiteId ? (entites.find((e) => e.id === entiteId) ?? null) : null),
    [entiteId, entites],
  );

  const comptes = useMemo(
    () => ({
      actifs: bureaux.filter((b) => b.is_active).length,
      clos: bureaux.filter((b) => !b.is_active).length,
    }),
    [bureaux],
  );

  /**
   * Bureaux déjà ouverts, par entité — pilote l'avertissement de renouvellement.
   * L'identifiant accompagne le nom : en modification, le bureau doit pouvoir
   * s'exclure lui-même, sans quoi corriger son propre nom déclencherait un
   * conflit avec soi.
   */
  const bureauxActifsParEntite = useMemo(() => {
    const table: BureauxActifsParEntite = {};
    for (const b of bureaux) {
      if (!b.is_active) continue;
      (table[b.entity_id] ??= []).push({ id: b.id, libelle: b.libelle });
    }
    return table;
  }, [bureaux]);

  /**
   * Une opération, son LIBELLÉ et son ATTENTE, décidés au même endroit.
   *
   * Deux états réglés séparément — « ce qui se passe » et « ça se passe » —
   * finissent par se contredire : il suffit qu'un chemin oublie le premier
   * pour que le pop-up annonce l'opération précédente. Les nouer dans une
   * seule fonction rend cet écart impossible plutôt qu'improbable.
   *
   * `useTransition` couvre l'action ET le re-rendu serveur qui suit : c'est
   * `router.refresh()` qui prend le plus de temps, et le laisser hors du
   * transition rendrait la main avant que l'écran ne soit à jour.
   */
  function lancer(
    annonce: { titre: string; description: string },
    executer: () => Promise<ActionResult<void>>,
    succes: string,
  ) {
    setOperation(annonce);
    demarrer(async () => {
      const resultat = await executer();
      if (!resultat.ok) {
        setOperation(null);
        avertir(resultat.error);
        return;
      }
      toast.success(succes);
      router.refresh();
      // Ferme QUAND l'écran rafraîchi arrive : `router.refresh()` appartient à
      // la transition, cette écriture est donc validée avec elle.
      setOperation(null);
    });
  }

  function clore(bureau: BureauComplet) {
    setAClore(null);
    lancer(
      {
        titre: 'Clôture du mandat…',
        description: `« ${bureau.libelle} » et les mandats de ses titulaires se clôturent ensemble.`,
      },
      () =>
        cloreMandat({
          bureauId: bureau.id,
          dateFin: new Date().toISOString().slice(0, 10),
        }),
      'Mandat clos. La composition reste consultable.',
    );
  }

  function supprimer(bureau: BureauComplet) {
    setASupprimer(null);
    lancer(
      {
        titre: 'Suppression du bureau…',
        description: `« ${bureau.libelle} » et ses ${formatNombre(bureau.membres.length)} mandat(s) sont effacés.`,
      },
      () => supprimerBureau({ bureauId: bureau.id }),
      'Bureau supprimé, avec son historique.',
    );
  }

  /** Le mandat rouvert après un rafraîchissement doit rester celui affiché. */
  const affiche = ouvert ? (bureaux.find((b) => b.id === ouvert.id) ?? null) : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="relative">
            <Search
              className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Bureau, entité, code…"
              aria-label="Rechercher un bureau"
              className="h-10 w-72 pl-9"
            />
          </div>

          <GroupeFiltres libelle="Filtrer par statut">
            <FiltreIcone
              icone={CircleCheck}
              libelle="Mandats en cours"
              badge={formatNombre(comptes.actifs)}
              actif={statut === 'actifs'}
              classeActive="bg-emerald-100 text-emerald-700"
              onClick={() => setStatut(statut === 'actifs' ? 'tous' : 'actifs')}
            />
            <FiltreIcone
              icone={CircleSlash}
              libelle="Mandats clos"
              badge={formatNombre(comptes.clos)}
              actif={statut === 'clos'}
              classeActive="bg-slate-200 text-slate-700"
              onClick={() => setStatut(statut === 'clos' ? 'tous' : 'clos')}
            />
          </GroupeFiltres>

          {(recherche !== '' || statut !== 'actifs' || niveau !== null) && (
            <Button
              variant="ghost"
              className="h-10"
              onClick={() => {
                setRecherche('');
                setStatut('actifs');
                setNiveau(null);
                setEntiteId(null);
              }}
            >
              <X className="mr-2 size-4" aria-hidden />
              Effacer
            </Button>
          )}

          <span className="ml-auto flex items-center gap-3">
            <span
              className="text-muted-foreground font-mono text-xs tabular-nums"
              aria-live="polite"
            >
              {formatNombre(filtres.length)} / {formatNombre(bureaux.length)}
            </span>
            <MandatDialog
              entites={entites}
              bureauxActifsParEntite={bureauxActifsParEntite}
            />
          </span>
        </div>

        {/*
          LES ONGLETS DE NIVEAU — « onglets d'entité → cartes → liste ».

          Ils ne s'affichent qu'à partir de DEUX niveaux : une organisation qui
          n'a que des églises verrait un onglet unique, qui ne filtre rien et
          n'apprend rien.
        */}
        {niveaux.length > 1 && (
          <div className="border-border flex flex-wrap gap-1 border-b">
            <BoutonNiveau
              libelle="Tous"
              nombre={niveaux.reduce((s, n) => s + n.nombre, 0)}
              actif={niveau === null}
              onClick={() => {
                setNiveau(null);
                setEntiteId(null);
              }}
            />
            {niveaux.map((n) => (
              <BoutonNiveau
                key={n.type}
                libelle={n.libelle}
                nombre={n.nombre}
                actif={niveau === n.type}
                onClick={() => {
                  // Changer de niveau referme l'entité ouverte : celle
                  // qu'on quittait n'a plus de sens sous le nouveau niveau.
                  setNiveau(n.type);
                  setEntiteId(null);
                }}
              />
            ))}
          </div>
        )}

        {/*
          EF-BUR-01 — LE NIVEAU DE NAVIGATION DE PLUS : un onglet de niveau
          s'ouvre d'abord sur la LISTE DES ENTITÉS, jamais directement sur des
          bureaux. Une entité SANS bureau y figure et le dit (règle 15) : elle
          n'a nulle part ailleurs où apparaître, et c'est justement celle sur
          laquelle il y a quelque chose à faire.
        */}
        {niveau && !entiteId ? (
          entitesDuNiveau.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="Aucune entité ne correspond"
              description="Élargissez la recherche."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {entitesDuNiveau.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEntiteId(e.id)}
                  className="text-left"
                >
                  <Card className="transition-colors hover:border-slate-300">
                    <CardContent className="space-y-2 p-6">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 space-y-1">
                          <span className="text-foreground block max-w-full truncate text-sm font-semibold">
                            {e.nom}
                          </span>
                          {e.code && (
                            <span className="text-muted-foreground block font-mono text-xs">
                              {e.code}
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Règle 15 — « Aucun bureau » se DIT, l'entité ne
                          disparaît pas : c'est elle qui manque d'un bureau. */}
                      {e.nombreBureaux > 0 ? (
                        <StatusBadge tone="neutral">
                          {formatNombre(e.nombreBureaux)} bureau
                          {e.nombreBureaux > 1 ? 'x' : ''}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="warning">Aucun bureau</StatusBadge>
                      )}
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          )
        ) : (
          <>
            {/*
              On est DANS une entité : le chemin du retour à la liste —
              jamais une navigation sans retour. Le NOM de l'entité n'est pas
              répété ici : le titre de section ci-dessous le porte déjà
              (avec son code et son compte de bureaux) quand elle en a, et
              l'état vide le porte sinon.
            */}
            {entiteOuverte && (
              <Button variant="ghost" className="h-9" onClick={() => setEntiteId(null)}>
                ← Retour aux entités
              </Button>
            )}

            {filtres.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title={
                  entiteOuverte
                    ? 'Aucun bureau pour cette entité'
                    : bureaux.length === 0
                      ? 'Aucun bureau enregistré'
                      : 'Aucun bureau ne correspond'
                }
                description={
                  entiteOuverte
                    ? `Ouvrez le premier bureau de « ${entiteOuverte.nom} » : vous composerez ensuite ses fonctions.`
                    : bureaux.length === 0
                      ? 'Ouvrez un bureau pour une entité de votre périmètre : vous composerez ensuite ses fonctions.'
                      : 'Élargissez les filtres.'
                }
                action={
                  entiteOuverte ? (
                    <MandatDialog
                      entites={entites}
                      bureauxActifsParEntite={bureauxActifsParEntite}
                      entiteImposee={{ id: entiteOuverte.id, nom: entiteOuverte.nom }}
                      libelle="Ouvrir le premier bureau"
                    />
                  ) : bureaux.length === 0 ? (
                    <MandatDialog
                      entites={entites}
                      bureauxActifsParEntite={bureauxActifsParEntite}
                      libelle="Ouvrir le premier bureau"
                    />
                  ) : undefined
                }
              />
            ) : (
              <div className="space-y-8">
                {groupes.map((groupe) => (
                  <section key={groupe.nom + groupe.code} className="space-y-3">
                    {/*
              LE TITRE D'ENTITÉ PORTE LE NOM UNE FOIS.

              Une entité peut avoir plusieurs bureaux — le mandat en cours et
              ceux qui l'ont précédé. Dans une grille plate, il fallait lire le
              sous-titre de chaque carte pour reconstituer à qui elle
              appartient ; le titre le dit une fois, et les cartes suivent.
            */}
                    <div className="flex items-baseline gap-3">
                      <h2 className="text-sm font-semibold">{groupe.nom}</h2>
                      {groupe.code && (
                        <span className="text-muted-foreground font-mono text-xs">
                          {groupe.code}
                        </span>
                      )}
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {formatNombre(groupe.bureaux.length)} bureau
                        {groupe.bureaux.length > 1 ? 'x' : ''}
                      </span>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {groupe.bureaux.map((bureau) => {
                        const niveau = (bureau.entite?.type ?? 'EGLISE') as EntityType;
                        const compte = comptePostes(
                          composerBureau(
                            fonctions,
                            bureau.membres.map((m) => ({
                              id: m.id,
                              croyantId: m.croyant_id,
                              fonctionId: m.fonction_id,
                              dateDebut: m.date_debut,
                              dateFin: m.date_fin,
                            })),
                            niveau,
                          ),
                        );

                        return (
                          <Card
                            key={bureau.id}
                            className={
                              bureau.is_active
                                ? 'transition-colors hover:border-slate-300'
                                : 'opacity-70 transition-colors hover:border-slate-300'
                            }
                          >
                            <CardContent className="space-y-4 p-6">
                              {/*
                      La carte n'est plus un bouton géant : le menu ⋮ en porte
                      un, et un bouton dans un bouton est un HTML invalide que
                      les lecteurs d'écran ne restituent pas. Seul le TITRE
                      ouvre la composition.
                    */}
                              <div className="space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <span className="min-w-0 space-y-1">
                                    <button
                                      type="button"
                                      onClick={() => setOuvert(bureau)}
                                      className="text-foreground block max-w-full truncate text-left text-sm font-semibold transition-colors hover:text-indigo-700"
                                    >
                                      {bureau.libelle}
                                    </button>
                                    <span className="text-muted-foreground block truncate text-xs">
                                      {bureau.entite?.nom}
                                    </span>
                                  </span>

                                  <span className="flex shrink-0 items-center gap-2">
                                    {bureau.entite && (
                                      <TypeBadge type={bureau.entite.type} />
                                    )}

                                    {/* Le même menu ⋮ que partout ailleurs. */}
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button
                                          type="button"
                                          aria-label={`Actions sur ${bureau.libelle}`}
                                          className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-md transition-colors hover:bg-slate-100"
                                        >
                                          <MoreVertical className="size-4" aria-hidden />
                                        </button>
                                      </DropdownMenuTrigger>

                                      <DropdownMenuContent align="end" className="w-64">
                                        <DropdownMenuItem
                                          onSelect={() => setOuvert(bureau)}
                                        >
                                          <List className="mr-2 size-4" aria-hidden />
                                          Voir la composition
                                        </DropdownMenuItem>

                                        {/* EF-BUR-07 — un plan de travail, pas un
                                  formulaire : il lui faut la page entière. */}
                                        <DropdownMenuItem asChild>
                                          <Link
                                            href={`/bureaux/${bureau.id}/organigramme`}
                                          >
                                            <Network
                                              className="mr-2 size-4"
                                              aria-hidden
                                            />
                                            Définir l&apos;organigramme
                                          </Link>
                                        </DropdownMenuItem>

                                        {bureau.entite &&
                                          peut('bureau.manage', bureau.entite.path) && (
                                            <>
                                              {/* Règle 16 — la modification rouvre le
                                        pop-up de création, pré-rempli. */}
                                              <DropdownMenuItem
                                                onSelect={() => setAModifier(bureau)}
                                              >
                                                <Pencil
                                                  className="mr-2 size-4"
                                                  aria-hidden
                                                />
                                                Modifier le bureau
                                              </DropdownMenuItem>

                                              {bureau.is_active && (
                                                <DropdownMenuItem
                                                  onSelect={() => setAClore(bureau)}
                                                  disabled={enCours}
                                                >
                                                  <SquarePen
                                                    className="mr-2 size-4"
                                                    aria-hidden
                                                  />
                                                  Clore le mandat
                                                  <span className="text-muted-foreground ml-auto text-xs">
                                                    conserve
                                                  </span>
                                                </DropdownMenuItem>
                                              )}
                                            </>
                                          )}

                                        {/*
                                EF-BUR-08 — droit DISTINCT : clore conserve,
                                supprimer efface l'historique des titulaires.

                                ET SEULEMENT SUR UN BUREAU EN COURS. Supprimer
                                un bureau CLOS effacerait ce qui a été — qui
                                était trésorier en 2024, qui a signé les
                                comptes — alors que des rapports, des reçus et
                                le journal d'audit le citent. L'entrée
                                disparaît donc, plutôt que d'être proposée puis
                                refusée : un menu qui offre ce qu'il n'accorde
                                pas fait douter du reste.

                                Le verrou réel est en base
                                (`trg_bureau_clos_immuable`, migration 0059) :
                                une entrée masquée se contourne par un appel
                                direct à l'API.
                              */}
                                        {bureau.is_active &&
                                          bureau.entite &&
                                          peut('bureau.delete', bureau.entite.path) && (
                                            <>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuItem
                                                className="text-destructive focus:text-destructive"
                                                onSelect={() => setASupprimer(bureau)}
                                              >
                                                <Trash2
                                                  className="mr-2 size-4"
                                                  aria-hidden
                                                />
                                                Supprimer le bureau
                                              </DropdownMenuItem>
                                            </>
                                          )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <StatusBadge
                                    tone={bureau.is_active ? 'success' : 'neutral'}
                                  >
                                    {bureau.is_active ? 'En cours' : 'Clos'}
                                  </StatusBadge>
                                  {/* Le manque avant le reste : c'est ce qu'on cherche. */}
                                  {compte.vacants > 0 && bureau.is_active && (
                                    <StatusBadge tone="warning">
                                      {formatNombre(compte.vacants)} vacant
                                      {compte.vacants > 1 ? 's' : ''}
                                    </StatusBadge>
                                  )}
                                </div>

                                <p className="text-muted-foreground font-mono text-xs tabular-nums">
                                  {formatNombre(compte.pourvus)} /{' '}
                                  {formatNombre(compte.total)} ·{' '}
                                  {formatDate(bureau.date_debut)}
                                  {bureau.date_fin && ` → ${formatDate(bureau.date_fin)}`}
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}

        {/* Règle 16 — UN SEUL chemin par opération : la modification passe par
            le pop-up de création. `key` le remonte à chaque bureau, ce qui
            repart des bonnes valeurs sans effet de synchronisation. */}
        {aModifier && (
          <MandatDialog
            key={aModifier.id}
            entites={entites}
            bureauxActifsParEntite={bureauxActifsParEntite}
            bureau={{
              id: aModifier.id,
              entity_id: aModifier.entity_id,
              entite_nom: aModifier.entite?.nom ?? '—',
              libelle: aModifier.libelle,
              date_debut: aModifier.date_debut,
              date_fin: aModifier.date_fin,
            }}
            open
            onOpenChange={(v) => !v && setAModifier(null)}
          />
        )}

        {/* Clore ne se rattrape pas depuis l'écran : la confirmation dit ce
            qui reste — l'historique — et ce qui cesse. */}
        {aClore && (
          <ConfirmDialog
            open
            onOpenChange={(v) => !v && setAClore(null)}
            title={`Clore le mandat « ${aClore.libelle} » ?`}
            description={
              `Ce bureau et les ${formatNombre(
                aClore.membres.filter((m) => m.date_fin === null).length,
              )} mandat(s) en cours de ses titulaires seront clos à ce jour. ` +
              'La composition reste consultable et figure toujours dans leur historique — ' +
              'mais elle ne se modifie plus, et rien ne rouvre un mandat clos.'
            }
            confirmLabel="Clore le mandat"
            destructive={false}
            onConfirm={() => clore(aClore)}
          />
        )}

        {/* EF-BUR-08 — la suppression EFFACE : la confirmation doit le dire,
            et proposer la clôture qui, elle, conserve. */}
        {aSupprimer && (
          <ConfirmDialog
            open
            onOpenChange={(v) => !v && setASupprimer(null)}
            title={`Supprimer « ${aSupprimer.libelle} » ?`}
            description={
              `Ce bureau et ses ${aSupprimer.membres.length} mandat(s) seront EFFACÉS. ` +
              'Les fonctions occupées disparaîtront des fiches des croyants concernés — ' +
              'rien n’en restera dans leur historique. ' +
              'Pour conserver la trace, clôturez le mandat plutôt que de le supprimer.'
            }
            confirmLabel="Supprimer définitivement"
            onConfirm={() => supprimer(aSupprimer)}
          />
        )}

        {/*
          Une opération lancée depuis un menu ⋮ n'a rien pour se signaler : le
          menu se referme et l'écran redevient identique.

          L'ouverture ne dépend QUE de `operation`, jamais de `isPending` :
          clore et supprimer partent de `ConfirmDialog`, qui exécute
          `onConfirm` dans SA propre transition — la nôtre s'y fond et
          `enCours` ne bascule pas. Un indicateur d'attente ne doit pas
          dépendre de l'endroit d'où l'opération a été lancée.
        */}
        <OperationDialog
          ouvert={operation !== null}
          titre={operation?.titre ?? ''}
          description={operation?.description}
        />

        {/* --- Composition, en pop-up --- */}
        <Dialog open={affiche !== null} onOpenChange={(v) => !v && setOuvert(null)}>
          <DialogContent className="max-h-[92vh] w-[min(96vw,72rem)] overflow-y-auto sm:max-w-5xl">
            {affiche && (
              <>
                <DialogHeader>
                  <p className="eyebrow">{affiche.entite?.nom}</p>
                  <DialogTitle className="text-2xl">
                    {libelleAffichage(
                      affiche.libelle,
                      affiche.date_debut,
                      affiche.date_fin,
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    Composition par rang protocolaire. Les fonctions vacantes restent à
                    leur rang : c&apos;est lui qui dit l&apos;importance du manque.
                  </DialogDescription>
                </DialogHeader>

                <BureauComposition
                  bureau={affiche}
                  fonctions={fonctions}
                  candidats={candidats}
                  photos={photos}
                  peutGerer={
                    affiche.entite ? peut('bureau.manage', affiche.entite.path) : false
                  }
                  joursDelai={joursDelai}
                />
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

/**
 * Un onglet de niveau — EF-BUR-01, règle 18.
 *
 * UN VRAI BOUTON, pas un `div` cliquable : il doit s'atteindre au clavier et
 * s'annoncer comme actionnable. `aria-pressed` dit lequel est retenu — le
 * soulignement ne se voit pas d'un lecteur d'écran.
 *
 * LE NOMBRE EST TOUJOURS LÀ, y compris sur l'onglet inactif : c'est lui qui
 * décide si l'onglet vaut un clic. Le masquer obligerait à cliquer pour savoir
 * s'il y avait quelque chose à voir.
 */
function BoutonNiveau({
  libelle,
  nombre,
  actif,
  onClick,
}: {
  libelle: string;
  nombre: number;
  actif: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={
        actif
          ? 'border-b-2 border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-700'
          : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors'
      }
    >
      {libelle}
      <span className="ml-2 text-xs tabular-nums opacity-70">{formatNombre(nombre)}</span>
    </button>
  );
}
