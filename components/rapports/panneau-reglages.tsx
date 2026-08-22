'use client';

import { Columns2, Columns3, Plus, RectangleHorizontal, Trash2 } from 'lucide-react';

import { Field, TextField } from '@/components/shared/field';
import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  type BlocRapport,
  LARGEURS_BLOC,
  type LargeurBloc,
  LIBELLES_GRAPHIQUE,
  LIBELLES_SOURCE,
  MARGE_MAX_MM,
  MARGE_MIN_MM,
  PERMISSION_SOURCE,
  SOURCES,
  type StructureRapport,
  TYPES_GRAPHIQUE,
  USAGES_GRAPHIQUE,
  afficheChamp,
  definitionBloc,
  filtresDuBloc,
  filtresPoses,
  margeDocument,
  sourceDuBloc,
  typeGraphique,
} from '@/lib/domain/rapport';
import { PERMISSIONS } from '@/lib/domain/permissions';

/**
 * Le troisième panneau — réglages du bloc sélectionné, ou du document.
 *
 * IL NE MONTRE JAMAIS RIEN DE VIDE. Sans bloc sélectionné, il règle l'en-tête
 * et le pied de page (EF-RAP-06) : deux questions qui se posent de toute façon,
 * et qui n'auraient sinon aucun endroit où vivre. Un panneau qui afficherait
 * « sélectionnez un bloc » occuperait un quart de l'écran pour ne rien dire.
 *
 * LE RÉGLAGE LE PLUS IMPORTANT EST LA SOURCE (EF-RAP-03), et c'est aussi celui
 * dont les conséquences se voient le moins : c'est elle qui décide de
 * l'habilitation exigée, donc de l'omission RG-26 à la génération. Le panneau
 * la nomme sous le sélecteur — « demande : Consulter les finances » —, parce
 * qu'un rapport composé par quelqu'un qui a tous les droits se vide chez le
 * lecteur qui ne les a pas, et que c'est ici que cela se décide.
 */

/**
 * La valeur qui dit « aucun filtre ».
 *
 * Le sélecteur n'accepte pas la chaîne vide comme valeur d'option : elle est
 * réservée à « rien de choisi », et poserait un menu qui s'ouvre vide. On
 * nomme donc explicitement le choix par défaut, et il ne quitte jamais cet
 * écran — `filtresPoses` ne retient que les valeurs déclarées au registre.
 */
const TOUT = 'TOUT';

const ICONES_LARGEUR: Record<LargeurBloc, typeof Columns2> = {
  PLEINE: RectangleHorizontal,
  DEMI: Columns2,
  TIERS: Columns3,
};

const LIBELLES_LARGEUR: Record<LargeurBloc, string> = {
  PLEINE: 'Pleine largeur',
  DEMI: 'Demi-largeur',
  TIERS: 'Un tiers',
};

export function PanneauReglages({
  bloc,
  structure,
  onReglerBloc,
  onReglerLargeur,
  onReglerDocument,
}: {
  bloc: BlocRapport | null;
  structure: StructureRapport;
  onReglerBloc: (reglages: Record<string, unknown>) => void;
  onReglerLargeur: (largeur: LargeurBloc) => void;
  onReglerDocument: (structure: StructureRapport) => void;
}) {
  if (!bloc) return <ReglagesDocument structure={structure} onRegler={onReglerDocument} />;

  const definition = definitionBloc(bloc.type);
  if (!definition) {
    return (
      <p className="text-sm text-muted-foreground">
        Ce bloc vient d’une version plus récente : cette page ne sait pas le régler.
      </p>
    );
  }

  const source = sourceDuBloc(bloc);
  const texte = (cle: string) =>
    typeof bloc.reglages[cle] === 'string' ? (bloc.reglages[cle] as string) : '';

  return (
    <div className="space-y-6">

      {/* EF-RAP-04 — ensemble CLOS de trois largeurs : des pictogrammes, pas
          une liste déroulante (règle 18). */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Largeur</p>
        <GroupeFiltres libelle="Largeur du bloc">
          {LARGEURS_BLOC.map((largeur) => (
            <FiltreIcone
              key={largeur}
              icone={ICONES_LARGEUR[largeur]}
              libelle={LIBELLES_LARGEUR[largeur]}
              actif={bloc.largeur === largeur}
              // Un bloc toujours pleine largeur : le contrôle est ÉTEINT et
              // expliqué, pas retiré — on chercherait sinon où il est passé.
              desactive={definition.toujoursPleine === true}
              onClick={() => onReglerLargeur(largeur)}
            />
          ))}
        </GroupeFiltres>
        {definition.toujoursPleine && (
          <p className="text-xs text-muted-foreground">
            Ce bloc occupe toujours la largeur de la page : en tiers de colonne, il ne
            voudrait rien dire.
          </p>
        )}
      </div>

      {/* EF-RAP-03 — d'où le bloc puise ses données, et ce que cela exige. */}
      {source !== null && (
        <Field
          label="Source des données"
          hint={`Demande « ${PERMISSIONS[PERMISSION_SOURCE[source]].label} » au lecteur : sans ce droit, le bloc sera omis du rapport (RG-26).`}
        >
          {(aria) => (
            <Select
              value={source}
              onValueChange={(v) => onReglerBloc({ source: v })}
            >
              <SelectTrigger {...aria} className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LIBELLES_SOURCE[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      {/*
        EF-RAP-03 — CE QUE CE BLOC RETIENT.

        « Tout » est le premier choix de chaque menu, et le défaut : un modèle
        écrit avant cette version n'a aucun filtre et doit continuer à rendre
        exactement ce qu'il rendait.

        Seuls des ensembles CLOS ET CONNUS sont proposés (règle 18) — sexe,
        sens, statut, niveau. Un filtre par grade ou par catégorie serait
        ouvert : il figerait dans le modèle une valeur que le référentiel peut
        renommer, et le bloc se viderait sans que rien ne l'explique.
      */}
      {filtresDuBloc(bloc).map((filtre) => (
        <Field key={filtre.cle} label={filtre.label}>
          {(aria) => (
            <Select
              value={filtresPoses(bloc)[filtre.cle] ?? TOUT}
              onValueChange={(v) =>
                onReglerBloc({
                  filtres: {
                    ...filtresPoses(bloc),
                    // `undefined` RETIRE la clé : la garder à « tout » laisserait
                    // dans le modèle un filtre qui ne filtre rien, et le compte
                    // annoncé sur la carte serait faux.
                    [filtre.cle]: v === TOUT ? undefined : v,
                  },
                })
              }
            >
              <SelectTrigger {...aria} className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TOUT}>Tout</SelectItem>
                {filtre.options.map((o) => (
                  <SelectItem key={o.valeur} value={o.valeur}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      ))}

      {/* EF-RAP-02 — six formes, six questions différentes. Le sélecteur dit à
          quoi chacune sert : « camembert » ne renseigne pas, « la part de
          chacun dans un tout » si. */}
      {bloc.type === 'GRAPHIQUE' && (
        <Field label="Forme du graphique" hint={USAGES_GRAPHIQUE[typeGraphique(bloc)]}>
          {(aria) => (
            <Select
              value={typeGraphique(bloc)}
              onValueChange={(v) => onReglerBloc({ graphique: v })}
            >
              <SelectTrigger {...aria} className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES_GRAPHIQUE.map((t) => (
                  <SelectItem key={t} value={t}>
                    {LIBELLES_GRAPHIQUE[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      {bloc.type === 'TITRE' && (
        <TextField
          label="Texte du titre"
          placeholder="Vue d’ensemble"
          value={texte('texte')}
          onChange={(e) => onReglerBloc({ texte: e.target.value })}
        />
      )}

      {bloc.type === 'TEXTE' && (
        <Field
          label="Paragraphe"
          hint="Les champs dynamiques — nom de l’entité, période — se posent à la génération."
        >
          {(aria) => (
            <Textarea
              {...aria}
              rows={5}
              value={texte('contenu')}
              onChange={(e) => onReglerBloc({ contenu: e.target.value })}
              placeholder="Ce rapport présente l’activité du trimestre…"
            />
          )}
        </Field>
      )}

      {bloc.type === 'IMAGE' && (
        <TextField
          label="Légende"
          hint="L’image est l’en-tête de l’entité pour laquelle le rapport est généré (réglé sur sa fiche), ou à défaut le logo de l’organisation (Administration → Paramètres généraux)."
          value={texte('legende')}
          onChange={(e) => onReglerBloc({ legende: e.target.value })}
        />
      )}

      {bloc.type === 'SIGNATURE' && (
        <LignesSignature bloc={bloc} onRegler={onReglerBloc} />
      )}

      {bloc.type === 'SAUT_DE_PAGE' && (
        <p className="text-sm text-muted-foreground">
          Rien à régler : ce qui suit commence sur une nouvelle feuille.
        </p>
      )}

      {source !== null && (
        <TextField
          label="Titre du bloc"
          hint="Facultatif — ce qui s’affiche au-dessus, dans le rapport."
          value={texte('titre')}
          onChange={(e) => onReglerBloc({ titre: e.target.value })}
        />
      )}
    </div>
  );
}

/**
 * EF-RAP-02 — un cadre nommé, à signer à la main.
 *
 * Les lignes sont un TABLEAU et non deux champs fixes : un rapport de district
 * se signe à trois — président, trésorier, secrétaire —, une attestation à un.
 */
function LignesSignature({
  bloc,
  onRegler,
}: {
  bloc: BlocRapport;
  onRegler: (reglages: Record<string, unknown>) => void;
}) {
  const brutes = bloc.reglages.lignes;
  const lignes: string[] = Array.isArray(brutes)
    ? brutes.filter((l): l is string => typeof l === 'string')
    : [];

  function poser(suivantes: string[]) {
    // Une liste vide RETIRE la clé plutôt que d'enregistrer `[]` : le bloc
    // retrouve son défaut au lieu de porter un tableau vide qu'il faudrait
    // ensuite distinguer de « pas encore réglé ».
    onRegler({ lignes: suivantes.length > 0 ? suivantes : undefined });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground">Signataires</p>

      {lignes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Aucun signataire : le bloc rendra un cadre vide.
        </p>
      )}

      <ul className="space-y-2">
        {lignes.map((ligne, i) => (
          <li key={i} className="flex items-center gap-2">
            <Input
              value={ligne}
              aria-label={`Fonction du signataire ${i + 1}`}
              placeholder="Le Président"
              className="h-10"
              onChange={(e) =>
                poser(lignes.map((l, j) => (j === i ? e.target.value : l)))
              }
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-10 shrink-0"
              aria-label={`Retirer le signataire ${i + 1}`}
              onClick={() => poser(lignes.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>

      <Button
        variant="outline"
        className="h-10"
        onClick={() => poser([...lignes, ''])}
        disabled={lignes.length >= 4}
      >
        <Plus className="mr-2 size-4" aria-hidden />
        Ajouter un signataire
      </Button>
    </div>
  );
}

/**
 * EF-RAP-06 — en-tête et pied de page.
 *
 * Ce sont des réglages du DOCUMENT, pas d'un bloc : ils n'ont leur place ni
 * dans la palette ni dans la composition, et c'est le panneau au repos qui les
 * accueille.
 */
function ReglagesDocument({
  structure,
  onRegler,
}: {
  structure: StructureRapport;
  onRegler: (structure: StructureRapport) => void;
}) {
  const entete = structure.entete ?? {};
  const pied = structure.pied ?? {};

  const poserEntete = (modif: Partial<typeof entete>) =>
    onRegler({ ...structure, entete: { ...entete, ...modif } });

  const poserPied = (modif: Partial<typeof pied>) =>
    onRegler({ ...structure, pied: { ...pied, ...modif } });

  /** Un texte vide RETIRE la clé : le bloc retrouve son défaut. */
  const ouRien = (valeur: string) => (valeur.trim() ? valeur : undefined);

  const marge = margeDocument(structure);

  return (
    <div className="space-y-6">
      {/*
        EF-RAP-05 — LA MARGE DU PAPIER, RÉGLABLE ET VISIBLE.

        Le pop-up laisse l'aperçu visible derrière lui : on tire le curseur et
        la feuille bouge. C'est tout l'objet du réglage — vérifier AVANT
        d'imprimer qu'un tableau tient encore, plutôt que de le découvrir sur
        le papier.

        Un curseur natif et non un composant : c'est un `input` que le
        navigateur sait déjà rendre, au clavier comme au pointeur (règle 29).
      */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="marge-papier" className="text-sm font-medium text-foreground">
            Marge du papier
          </label>
          <span className="text-sm tabular-nums text-muted-foreground">{marge} mm</span>
        </div>

        <input
          id="marge-papier"
          type="range"
          min={MARGE_MIN_MM}
          max={MARGE_MAX_MM}
          step={1}
          value={marge}
          onChange={(e) => onRegler({ ...structure, marge: Number(e.target.value) })}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-indigo-600"
        />

        <p className="text-xs text-muted-foreground">
          Zone utile :{' '}
          <span className="tabular-nums">{210 - marge * 2}</span> ×{' '}
          <span className="tabular-nums">{297 - marge * 2}</span> mm. Sous 5 mm, la
          plupart des imprimantes rognent le bord.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">En-tête</p>
        {(
          [
            ['avecLogo', 'Logo de l’organisation'],
            ['avecEntite', 'Nom de l’entité'],
            ['avecPeriode', 'Période couverte'],
          ] as const
        ).map(([cle, libelle]) => (
          <label key={cle} className="flex cursor-pointer items-center gap-3">
            <Checkbox
              // `afficheChamp` et non `=== true` : une structure composée avant
              // que ces champs n'existent ne les porte pas, et doit continuer à
              // les afficher. Lire `=== true` décocherait tout, partout, le jour
              // de la mise à jour.
              checked={afficheChamp(entete[cle])}
              onCheckedChange={(v) => poserEntete({ [cle]: v === true })}
            />
            <span className="text-sm text-foreground">{libelle}</span>
          </label>
        ))}
      </div>

      {/* Le titre du DOCUMENT, en première page. Il ne se répète pas sur les
          suivantes : porté sur chacune, il ferait croire à autant de rapports
          qu'il y a de feuilles. */}
      <TextField
        label="Titre du rapport"
        hint="Affiché en grand, sur la première page uniquement."
        placeholder="Rapport trimestriel"
        value={entete.titre ?? ''}
        onChange={(e) => poserEntete({ titre: ouRien(e.target.value) })}
      />

      <TextField
        label="Sous-titre"
        hint="Facultatif — ce sur quoi porte le rapport."
        placeholder="Activité du deuxième trimestre 2026"
        value={entete.sousTitre ?? ''}
        onChange={(e) => poserEntete({ sousTitre: ouRien(e.target.value) })}
      />

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Pied de page</p>
        <label className="flex cursor-pointer items-center gap-3">
          <Checkbox
            checked={afficheChamp(pied.avecNumerotation)}
            onCheckedChange={(v) => poserPied({ avecNumerotation: v === true })}
          />
          <span className="text-sm text-foreground">Numéroter les pages</span>
        </label>
      </div>

      <TextField
        label="Texte du pied de page"
        hint="À gauche du numéro de page."
        placeholder="SYNOD — Direction du district"
        value={pied.texte ?? ''}
        onChange={(e) => poserPied({ texte: ouRien(e.target.value) })}
      />

      <TextField
        label="Mention de confidentialité"
        hint="Laissez vide pour n’en porter aucune."
        placeholder="Document interne"
        value={pied.mentionConfidentialite ?? ''}
        onChange={(e) => poserPied({ mentionConfidentialite: ouRien(e.target.value) })}
      />

      {/* RG-26 rappelée là où elle se décide : la composition. */}
      <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Un bloc dont le lecteur n’a pas l’habilitation sera <strong>omis</strong> du
        rapport, et le pied de page le comptera. Choisissez les sources en connaissance
        de cause (RG-26).
      </p>
    </div>
  );
}
