'use client';

import {
  Archive,
  ArchiveRestore,
  Copy,
  FileClock,
  FileOutput,
  FileText,
  LayoutTemplate,
  Lock,
  MoreVertical,
  Pencil,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ModeleDialog, type ModeleModifiable } from '@/components/rapports/modele-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { avertir } from '@/components/shared/messages';
import { OperationDialog } from '@/components/shared/operation-dialog';
import { useSession } from '@/components/shared/session-provider';
import { ICONES_NIVEAU } from '@/components/structure/type-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { archiverModele, dupliquerModele } from '@/lib/actions/rapports';
import type { ModeleRapport } from '@/lib/data/rapports';
import { ENTITY_LABELS } from '@/lib/domain/hierarchy';
import {
  LIBELLES_SOURCE,
  LIBELLES_VISIBILITE,
  ONGLETS_BIBLIOTHEQUE,
  type OngletBibliotheque,
  capacitesModele,
  compositionAutorisee,
  modeleExploitable,
  ongletDuModele,
  resumeStructure,
} from '@/lib/domain/rapport';
import { appelerAction } from '@/lib/utils/appeler-action';
import { formatDate, formatNombre } from '@/lib/utils/format';

/**
 * La bibliothèque de modèles — EF-RAP-07 à 11.
 *
 * QUATRE ONGLETS, ET ILS S'EXCLUENT — la préséance est tranchée dans le
 * domaine par `ongletDuModele`, avec le pourquoi. La table `ONGLETS_BIBLIOTHEQUE`
 * y vit aussi : la page, qui est un Server Component, l'importait d'ici et
 * n'en recevait qu'une **référence** — un module `'use client'` ne livre pas
 * ses valeurs au serveur, et `ONGLETS.includes` n'était pas une fonction.
 *
 * Le filtrage est INSTANTANÉ (règle 17) : la liste est déjà chargée, l'onglet
 * et la recherche ne sont que des questions posées dessus. L'URL suit par
 * `history.replaceState` — la vue se partage et se retrouve au retour arrière,
 * sans déclencher de rendu serveur.
 */

const LIBELLES_ONGLET: Record<OngletBibliotheque, string> = {
  tous: 'Tous',
  miens: 'Mes modèles',
  officiels: 'Du Siège',
  partages: 'Partagés',
};

/** Ce qui explique un onglet VIDE — la question n'est jamais la même. */
const VIDES: Record<OngletBibliotheque, { titre: string; texte: string }> = {
  tous: {
    titre: 'Aucun modèle',
    texte:
      'Un modèle décrit comment composer un rapport : les sections, les blocs et les données qu’ils vont chercher. Le premier reste à écrire.',
  },
  officiels: {
    titre: 'Le Siège n’a posé aucun modèle',
    texte:
      'Aucune trame commune n’est encore mise à disposition. Composez la vôtre en attendant — celles du Siège se dupliquent pour être adaptées.',
  },
  miens: {
    titre: 'Votre entité n’a composé aucun modèle',
    texte:
      'Partez d’un modèle du Siège en le dupliquant, ou composez le vôtre : il appartiendra à votre entité et à elle seule.',
  },
  partages: {
    titre: 'Aucun modèle partagé avec vous',
    texte:
      'Une entité parente peut ouvrir ses modèles à ses filles. Aucune ne l’a fait pour l’instant.',
  },
};

/**
 * Le même onglet, quand c'est le VERROU qui l'a vidé.
 *
 * « Aucune entité ne partage » et « vous ne pouvez pas employer ce qu'elles
 * partagent » sont deux situations différentes, et le même texte pour les deux
 * ferait chercher un partage qui existe peut-être déjà.
 */
const PARTAGES_FERMES = {
  titre: 'Les modèles des autres entités ne sont pas employables',
  texte:
    'La composition étant réservée au Siège, une entité n’emploie que la trame du Siège et les modèles qu’elle a elle-même composés.',
};

export function RapportsClient({
  modeles,
  cheminSiege,
  compositionLibre,
  filtresInitiaux,
}: {
  modeles: ModeleRapport[];
  cheminSiege: string | null;
  /** EF-RAP-07 — réglage d'organisation, lu à chaque rendu (règle 21). */
  compositionLibre: boolean;
  filtresInitiaux: {
    recherche: string;
    onglet: OngletBibliotheque;
    avecArchives: boolean;
  };
}) {
  const router = useRouter();
  const { session: compte, peut } = useSession();

  const [recherche, setRecherche] = useState(filtresInitiaux.recherche);
  const [onglet, setOnglet] = useState<OngletBibliotheque>(filtresInitiaux.onglet);
  const [avecArchives, setAvecArchives] = useState(filtresInitiaux.avecArchives);
  const [enEdition, setEnEdition] = useState<ModeleModifiable | null>(null);
  const [operation, setOperation] = useState<string | null>(null);

  const rechercheDifferee = useDeferredValue(recherche);

  useEffect(() => {
    const params = new URLSearchParams();
    if (rechercheDifferee.trim()) params.set('q', rechercheDifferee.trim());
    if (onglet !== 'tous') params.set('onglet', onglet);
    if (avecArchives) params.set('archives', 'oui');

    const url = params.size > 0 ? `?${params}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [rechercheDifferee, onglet, avecArchives]);

  /**
   * `report.template.manage` s'évalue AVEC SA PORTÉE (règle 3), sur l'entité
   * propriétaire — celle du modèle pour le modifier, **la sienne** pour
   * composer, puisqu'une entité ne compose que pour elle-même. Un modèle du
   * Siège n'a pas d'entité : sa portée est celle de la racine.
   *
   * Le droit ne suffit pas : le réglage d'organisation s'y ajoute (EF-RAP-07).
   * La règle est dans le domaine — l'action la réévalue à l'identique, et ce
   * masquage-ci n'est qu'un confort.
   */
  const estSiege = compte.entiteType === 'SIEGE';

  const peutComposer = compositionAutorisee({
    detientLeDroit: peut('report.template.manage', compte.scopePath),
    compositionLibre,
    estSiege,
  });

  /**
   * Le bandeau ne s'affiche qu'à qui la fermeture CHANGE quelque chose.
   *
   * Le dire à un compte sans `report.template.manage` lui apprendrait qu'il
   * existe une composition dont il n'a de toute façon jamais eu l'usage — un
   * refus annoncé à qui ne demandait rien.
   */
  const compositionFermeePourMoi =
    !compositionLibre && !estSiege && peut('report.template.manage', compte.scopePath);

  const classes = useMemo(
    () =>
      modeles
        // COMPOSITION FERMÉE, UNE ENTITÉ N'EMPLOIE PAS LE MODÈLE D'UNE AUTRE.
        // Sans ce retrait, une paroisse privée de composition reprendrait la
        // trame que son district partage à ses descendants, et le verrou
        // n'imposerait plus rien. Les siens et ceux du Siège restent.
        .filter((m) =>
          modeleExploitable({
            estOfficiel: m.estOfficiel,
            estSien: m.entityId === compte.entityId,
            compositionLibre,
          }),
        )
        .map((m) => {
          const cheminProprietaire = m.estOfficiel ? cheminSiege : (m.entite?.path ?? null);
          const peutGerer =
            cheminProprietaire !== null && peut('report.template.manage', cheminProprietaire);

          return {
            modele: m,
            onglet: ongletDuModele({
              estOfficiel: m.estOfficiel,
              // « Mien » se lit du point de vue de l'ENTITÉ, pas du compte :
              // deux collègues d'une même paroisse doivent voir la même
              // bibliothèque.
              estSien: m.entityId === compte.entityId,
            }),
            capacites: capacitesModele({
              estArchive: m.archiveLe !== null,
              estOfficiel: m.estOfficiel,
              peutGererLeModele: peutGerer,
              peutComposer,
            }),
          };
        }),
    [modeles, cheminSiege, peut, compte.entityId, peutComposer, compositionLibre],
  );

  /** Les compteurs d'onglet ignorent la RECHERCHE mais pas les archives : un
   *  onglet annoncé « 4 » qui en montre zéro se lit comme une panne. */
  const comptes = useMemo(() => {
    const visibles = classes.filter((c) => avecArchives || c.modele.archiveLe === null);
    return {
      tous: visibles.length,
      miens: visibles.filter((c) => c.onglet === 'miens').length,
      officiels: visibles.filter((c) => c.onglet === 'officiels').length,
      partages: visibles.filter((c) => c.onglet === 'partages').length,
    } satisfies Record<OngletBibliotheque, number>;
  }, [classes, avecArchives]);

  const nbArchives = modeles.filter((m) => m.archiveLe !== null).length;

  const filtres = useMemo(() => {
    const terme = rechercheDifferee.trim().toLocaleLowerCase('fr');

    return classes.filter((c) => {
      if (!avecArchives && c.modele.archiveLe !== null) return false;
      if (onglet !== 'tous' && c.onglet !== onglet) return false;
      if (!terme) return true;

      return (
        c.modele.nom.toLocaleLowerCase('fr').includes(terme) ||
        (c.modele.description ?? '').toLocaleLowerCase('fr').includes(terme) ||
        (c.modele.entite?.nom ?? '').toLocaleLowerCase('fr').includes(terme)
      );
    });
  }, [classes, onglet, avecArchives, rechercheDifferee]);

  async function dupliquer(modele: ModeleRapport) {
    setOperation('Duplication du modèle…');
    const resultat = await appelerAction(() =>
      // Le duplicata revient à l'entité de celui qui copie — le serveur le
      // décide, pas l'écran. EF-RAP-08 décrit exactement ce geste : reprendre
      // une trame du Siège pour l'adapter chez soi.
      dupliquerModele({ modeleId: modele.id, nom: null }),
    );
    setOperation(null);

    if (!resultat.ok) {
      avertir(resultat.error);
      return;
    }
    toast.success(`« ${resultat.data.nom} » créé.`);
    router.refresh();
  }

  async function basculerArchive(modele: ModeleRapport) {
    const archiver = modele.archiveLe === null;
    setOperation(archiver ? 'Archivage du modèle…' : 'Remise en service…');

    const resultat = await appelerAction(() =>
      archiverModele({ modeleId: modele.id, archiver }),
    );
    setOperation(null);

    if (!resultat.ok) {
      avertir(resultat.error);
      return;
    }
    toast.success(archiver ? 'Modèle archivé.' : 'Modèle remis en service.');
    router.refresh();
  }

  // « Aucune entité ne partage » et « ce qu'elles partagent ne vous est pas
  // employable » sont deux situations différentes : le même texte pour les deux
  // ferait chercher un partage qui existe peut-être déjà.
  const vide =
    onglet === 'partages' && !compositionLibre ? PARTAGES_FERMES : VIDES[onglet];

  return (
    <div className="space-y-6">
      {/* Un ÉTAT, pas un coupable : « le Siège a fermé » serait faux si le
          réglage n'avait pas pu être lu (le repli ferme par prudence). Ce qui
          reste vrai dans les deux cas, c'est que la composition n'est pas
          ouverte ici et maintenant (règle 15). */}
      {compositionFermeePourMoi && (
        <Alert>
          <Lock className="size-4" aria-hidden />
          <AlertDescription>
            La composition de modèles n’est pas ouverte à votre entité : la trame du
            Siège s’applique. Ceux que vous aviez composés vous restent acquis et
            redeviennent employables dès que l’habilitation vous est rendue ; ceux des
            autres entités, non.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-64 flex-1">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un modèle…"
            aria-label="Rechercher un modèle"
            className="h-10 pl-9"
          />
        </div>

        {/* Un bouton plutôt qu'une case : il porte son effectif, et disparaît
            quand rien n'est archivé — un filtre qui ne filtre rien intrigue. */}
        {nbArchives > 0 && (
          <Button
            variant={avecArchives ? 'secondary' : 'outline'}
            className="h-10"
            aria-pressed={avecArchives}
            onClick={() => setAvecArchives((v) => !v)}
          >
            <Archive className="mr-2 size-4" aria-hidden />
            Archives
            <span className="ml-2 tabular-nums opacity-70">{formatNombre(nbArchives)}</span>
          </Button>
        )}

        {/* Le réglage de la composition N'EST PAS ICI, et c'est délibéré : un
            paramètre d'organisation se classe dans Administration (lot 7), pas
            dans l'écran du module qu'il commande. `CompositionDialog` et
            `reglerCompositionModeles` sont écrits et prêts — c'est l'écran
            d'administration qui les montera. */}
        {/* EF-RAP-17 — l'historique est l'autre moitié du module : la
            bibliothèque dit comment composer, l'historique ce qui a été
            produit. */}
        <Button asChild variant="outline" className="h-10">
          <Link href="/rapports/generes">
            <FileClock className="mr-2 size-4" aria-hidden />
            Rapports générés
          </Link>
        </Button>

        {peutComposer && <ModeleDialog cheminSiege={cheminSiege} />}
      </div>

      <Tabs value={onglet} onValueChange={(v) => setOnglet(v as OngletBibliotheque)}>
        <TabsList>
          {ONGLETS_BIBLIOTHEQUE.map((o) => (
            <TabsTrigger key={o} value={o}>
              {LIBELLES_ONGLET[o]}
              <span className="ml-2 text-xs tabular-nums opacity-70">{comptes[o]}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filtres.length === 0 ? (
        <EmptyState
          icon={onglet === 'partages' && !compositionLibre ? Lock : FileText}
          title={rechercheDifferee.trim() ? 'Aucun modèle ne correspond' : vide.titre}
          description={
            rechercheDifferee.trim()
              ? `Rien ne correspond à « ${rechercheDifferee.trim()} » dans cet onglet.`
              : vide.texte
          }
          action={
            peutComposer && !rechercheDifferee.trim() ? (
              <ModeleDialog cheminSiege={cheminSiege} />
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtres.map(({ modele, capacites }) => (
            <CarteModele
              key={modele.id}
              modele={modele}
              capacites={capacites}
              onModifier={() =>
                setEnEdition({
                  id: modele.id,
                  nom: modele.nom,
                  description: modele.description,
                  entityId: modele.entityId,
                  entiteNom: modele.entite?.nom ?? 'Siège',
                  niveauxApplicables: modele.niveauxApplicables,
                  visibilite: modele.visibilite,
                  estOfficiel: modele.estOfficiel,
                })
              }
              onDupliquer={() => dupliquer(modele)}
              onArchiver={() => basculerArchive(modele)}
            />
          ))}
        </div>
      )}

      {/* Remonté par `key` : les champs repartent du modèle affiché, sans effet
          de synchronisation qui arriverait plus tard et moins sûrement. */}
      {enEdition && (
        <ModeleDialog
          key={enEdition.id}
          cheminSiege={cheminSiege}
          modele={enEdition}
          open
          onOpenChange={(ouvert) => !ouvert && setEnEdition(null)}
        />
      )}

      <OperationDialog ouvert={operation !== null} titre={operation ?? ''} />
    </div>
  );
}

function CarteModele({
  modele,
  capacites,
  onModifier,
  onDupliquer,
  onArchiver,
}: {
  modele: ModeleRapport;
  capacites: ReturnType<typeof capacitesModele>;
  onModifier: () => void;
  onDupliquer: () => void;
  onArchiver: () => void;
}) {
  const resume = resumeStructure(modele.structure);
  const archive = modele.archiveLe !== null;
  const vide = resume.nbBlocs === 0;

  return (
    <Card className={archive ? 'border-dashed opacity-75' : undefined}>
      <CardContent className="flex h-full flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <h3 className="truncate text-sm font-semibold text-foreground">{modele.nom}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {modele.estOfficiel ? 'Siège' : (modele.entite?.nom ?? 'Entité inconnue')}
              {' · '}
              <span className="tabular-nums">v{modele.version}</span>
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label={`Actions sur « ${modele.nom} »`}
              >
                <MoreVertical className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            {/*
               : le composant force sinon la largeur du DECLENCHEUR —
              ici un bouton icone de 32 px —, et le menu se comprime a son
              plancher. Un libelle comme « Reinitialiser le mot de passe » y
              passait a la ligne pour rien.
            */}
            <DropdownMenuContent align="end" className="w-auto">
              {/* EF-RAP-01 — composer est le geste principal, il vient donc en
                  tête. Il reste OUVERT même en lecture seule : l'éditeur montre
                  alors la composition sans la laisser modifier, et voir ce que
                  produit un modèle officiel est précisément ce qu'on veut avant
                  de le dupliquer. */}
              {/* EF-RAP-12 — produire un document est ce pour quoi le modèle
                  existe : l'entrée vient donc en tête. Elle est ÉTEINTE tant
                  que rien n'est composé — générer une feuille vide ne dirait
                  rien à personne. */}
              <DropdownMenuItem asChild disabled={vide}>
                <Link href={`/rapports/generer/${modele.id}`}>
                  <FileOutput className="mr-2 size-4" aria-hidden />
                  Générer un rapport
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link href={`/rapports/modeles/${modele.id}/editer`}>
                  <LayoutTemplate className="mr-2 size-4" aria-hidden />
                  {capacites.modifiable ? 'Composer' : 'Voir la composition'}
                </Link>
              </DropdownMenuItem>

              {/* Une action impossible est ÉTEINTE et EXPLIQUÉE, jamais retirée :
                  la masquer ferait croire qu'elle n'existe pas, et l'utilisateur
                  chercherait ailleurs ce qui lui manque en réalité un droit. */}
              <DropdownMenuItem onClick={onModifier} disabled={!capacites.modifiable}>
                <Pencil className="mr-2 size-4" aria-hidden />
                Renommer
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDupliquer} disabled={!capacites.duplicable}>
                <Copy className="mr-2 size-4" aria-hidden />
                Dupliquer
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onArchiver} disabled={!capacites.archivable}>
                {archive ? (
                  <ArchiveRestore className="mr-2 size-4" aria-hidden />
                ) : (
                  <Archive className="mr-2 size-4" aria-hidden />
                )}
                {archive ? 'Remettre en service' : 'Archiver'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {modele.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{modele.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {modele.estOfficiel && <Badge>Officiel</Badge>}
          {archive && <Badge variant="outline">Archivé</Badge>}
          <Badge variant="secondary">{LIBELLES_VISIBILITE[modele.visibilite]}</Badge>
        </div>

        {/* EF-RAP-10 — les niveaux auxquels le modèle se propose. Aucun coché
            ne borne rien : la ligne se tait plutôt que d'afficher six
            pictogrammes qui ne distinguent aucun modèle d'un autre. */}
        {modele.niveauxApplicables.length > 0 && (
          <div className="flex items-center gap-1">
            {modele.niveauxApplicables.map((type) => {
              const Icone = ICONES_NIVEAU[type];
              return (
                <Tooltip key={type}>
                  <TooltipTrigger asChild>
                    <span className="flex size-6 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                      <Icone className="size-3.5" aria-hidden />
                      <span className="sr-only">{ENTITY_LABELS[type].singulier}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {ENTITY_LABELS[type].singulier}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}

        {/* La composition, dite par ses SOURCES : ce que le rapport ira
            chercher — donc ce qu'il faudra être habilité à lire (RG-26) —
            plutôt que sa mise en page. */}
        <div className="mt-auto space-y-2 border-t border-border pt-4">
          {resume.nbBlocs === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aucun bloc — ce modèle ne produit encore rien.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              <span className="tabular-nums">{formatNombre(resume.nbSections)}</span> section
              {resume.nbSections > 1 ? 's' : ''} ·{' '}
              <span className="tabular-nums">{formatNombre(resume.nbBlocs)}</span> bloc
              {resume.nbBlocs > 1 ? 's' : ''}
              {resume.sources.length > 0 && (
                <> · {resume.sources.map((s) => LIBELLES_SOURCE[s]).join(', ')}</>
              )}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Modifié le <span className="tabular-nums">{formatDate(modele.modifieLe)}</span>
            {modele.nbRapports > 0 && (
              <>
                {' · '}
                <span className="tabular-nums">{formatNombre(modele.nbRapports)}</span> rapport
                {modele.nbRapports > 1 ? 's' : ''} produit
                {modele.nbRapports > 1 ? 's' : ''}
              </>
            )}
          </p>

          {capacites.motif && (
            <p className="text-xs text-muted-foreground italic">{capacites.motif}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
