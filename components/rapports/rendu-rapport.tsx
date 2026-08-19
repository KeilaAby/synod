'use client';

import {
  type BlocRapport,
  type LargeurBloc,
  type SectionRapport,
  type StructureRapport,
  type ContenuRapport,
  type TypeGraphique,
  afficheChamp,
  decouperEnFeuilles,
  definitionBloc,
  margeDocument,
  typeGraphique,
} from '@/lib/domain/rapport';
import { type ContenuExemple, contenuExemple } from '@/lib/domain/rapport-exemple';
import { couverture } from '@/lib/domain/kpi';
import { cn } from '@/lib/utils';

/**
 * Le rendu A4 d'un rapport — EF-RAP-05.
 *
 * UN SEUL RENDU, POUR L'APERÇU ET POUR LE PAPIER (règle 16, et le précédent
 * d'EF-DSH-10). Refabriquer un document à partir des mêmes données aurait donné
 * un second rendu à maintenir, qui aurait divergé du premier — et c'est
 * précisément l'aperçu qui promet que le PDF lui ressemblera. Exporter en PDF,
 * c'est donc **imprimer ceci**, et les styles `@page` de `globals.css` s'en
 * chargent : A4, marges 16 mm, `.page-break` là où l'auteur l'a demandé.
 *
 * LES MILLIMÈTRES SONT VRAIS. La feuille fait 210 mm, les marges 16 mm, le
 * texte 10 pt : c'est ce qui rend l'aperçu **fidèle**. Une maquette en pixels
 * approcherait la mise en page à l'écran et la trahirait à l'impression, ce qui
 * est exactement l'erreur qu'un aperçu doit empêcher.
 *
 * CE QUI N'EST PAS ENCORE GÉNÉRÉ SE DIT. Pendant la composition, un bloc de
 * données n'a pas de valeur : il rend un cadre qui NOMME sa source, plutôt
 * qu'un faux chiffre. Un aperçu qui inventerait « 1 248 croyants » ferait
 * valider une mise en page sur des données qui n'existent pas.
 */

const CLASSES_LARGEUR: Record<LargeurBloc, string> = {
  PLEINE: 'col-span-6',
  DEMI: 'col-span-3',
  TIERS: 'col-span-2',
};

export interface EnteteRapport {
  readonly organisation: string;
  readonly entite: string;
  readonly periode: string;
}

export function RenduRapport({
  structure,
  entete,
  contenu = null,
  mentionOmissions: mention = null,
  className,
}: {
  structure: StructureRapport;
  entete: EnteteRapport;
  /** RG-27 — le contenu FIGÉ.  pendant la composition : rien n est
   *  encore résolu, l aperçu montre alors des données d exemple. */
  contenu?: ContenuRapport | null;
  /** RG-26 — la mention portée en pied de page. */
  mentionOmissions?: string | null;
  className?: string;
}) {
  const reglagesEntete = structure.entete ?? {};
  const pied = structure.pied ?? {};
  const affiche = afficheChamp;

  /**
   * Les feuilles se séparent aux SAUTS DE PAGE demandés, et là seulement.
   *
   * Annoncer « page 3 sur 7 » demanderait de MESURER le contenu rendu — ce
   * qu'aucun calcul de mise en page ne sait faire avant que le navigateur n'ait
   * composé le texte. Un compte de pages inventé serait faux dès le premier
   * paragraphe un peu long. On rend donc ce qui est certain : les coupures
   * voulues, et le reste que l'impression répartira.
   */
  const feuilles = decouperEnFeuilles(structure.sections);
  const marge = margeDocument(structure);

  return (
    <div className={cn('space-y-6', className)}>
      {/*
        LA MARGE DU PAPIER SE DÉCLARE ICI, PAS DANS LA FEUILLE DE STYLE.

        `@page` n'accepte ni classe ni variable appliquée par un composant :
        c'est une règle de document. Un `<style>` rendu avec la feuille est le
        seul moyen de la faire suivre un réglage — et comme il vient après
        `globals.css`, sa déclaration l'emporte.

        Sans cela, l'aperçu montrait 16 mm quoi qu'on règle, et l'impression
        aussi : le réglage aurait été décoratif (règle 21).
      */}
      <style>{`@page { size: A4; margin: ${marge}mm; }`}</style>

      {feuilles.map((feuille, index) => (
        <article
          key={index}
          /*
            LES MILLIMÈTRES NE SONT PAS DES ESPACEMENTS D'ÉCRAN.

            210 × 297 mm et 16 mm de marge sont les dimensions du PAPIER : elles
            n'ont rien à faire sur la grille de 8 px (UI-01), qui règle des
            rapports entre éléments à l'écran. Les poser en style plutôt qu'en
            classe le dit, au lieu de contourner la règle par une exception.

            À l'impression, `globals.css` remet cette marge à zéro : c'est
            `@page { margin: 16mm }` qui la fournit, et la cumuler la doublerait.
          */
          style={{ width: '210mm', minHeight: '297mm', padding: `${marge}mm` }}
          className={cn(
            'mx-auto flex flex-col bg-white text-slate-900 shadow-sm print:shadow-none',
            index < feuilles.length - 1 && 'page-break',
          )}
        >
          {/* EF-RAP-06 — l'en-tête, sur chaque feuille. */}
          <header className="mb-6 border-b border-slate-300 pb-3">
            <div className="flex items-baseline justify-between text-[9pt]">
              <span className="flex items-center gap-2 font-semibold">
                {affiche(reglagesEntete.avecLogo) && (
                  // Le logo est un SVG inline, pas une image liée : une URL
                  // signée arriverait après `print()` et périmerait (règle 11,
                  // et le précédent d'`imprimerOrganigramme`).
                  <MarqueSynod />
                )}
                {entete.organisation}
              </span>
              <span className="text-slate-600">
                {affiche(reglagesEntete.avecEntite) && entete.entite}
                {affiche(reglagesEntete.avecEntite) &&
                  affiche(reglagesEntete.avecPeriode) &&
                  ' · '}
                {affiche(reglagesEntete.avecPeriode) && entete.periode}
              </span>
            </div>

            {/* Le titre ne se répète QU'EN PREMIÈRE PAGE : porté sur chacune, il
                ferait croire à autant de rapports qu'il y a de feuilles. */}
            {index === 0 && (reglagesEntete.titre || reglagesEntete.sousTitre) && (
              <div className="mt-4">
                {reglagesEntete.titre && (
                  <h1 className="text-[16pt] leading-tight font-semibold">
                    {reglagesEntete.titre}
                  </h1>
                )}
                {reglagesEntete.sousTitre && (
                  <p className="mt-1 text-[10pt] text-slate-600">
                    {reglagesEntete.sousTitre}
                  </p>
                )}
              </div>
            )}
          </header>

          <div className="flex-1 space-y-6">
            {feuille.map((section) => (
              <SectionRendue key={section.id} section={section} contenu={contenu} />
            ))}
          </div>

          {/* EF-RAP-06 et RG-26 — numérotation, confidentialité, omissions. */}
          <footer className="mt-6 border-t border-slate-300 pt-3 text-[8pt] text-slate-600">
            {/* Sans cette ligne, un chiffre d'exemple se citerait comme un vrai.
                Elle disparaît dès que le rapport porte son contenu figé. */}
            {contenu === null && (
              <p className="mb-1 font-medium">
                Aperçu — données d’exemple. Les valeurs réelles sont calculées à la
                génération.
              </p>
            )}
            {mention && <p className="mb-1 italic">{mention}</p>}
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0">
                {[pied.texte, pied.mentionConfidentialite].filter(Boolean).join(' — ')}
              </span>
              {affiche(pied.avecNumerotation) && (
                <span className="tabular-nums">
                  {index + 1} / {feuilles.length}
                </span>
              )}
            </div>
          </footer>
        </article>
      ))}
    </div>
  );
}

/**
 * La marque de l'organisation, en SVG inline.
 *
 * PAS UNE IMAGE LIÉE. Une `<img>` vers le stockage arriverait après `print()` —
 * le navigateur n'attend pas les requêtes réseau pour imprimer — et sa clé
 * signée aurait de toute façon une durée de vie. C'est le piège déjà payé sur
 * les portraits de l'organigramme, qui y sont embarqués en `data:`.
 */
function MarqueSynod() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden>
      <path
        d="M12 2 L21 7 V17 L12 22 L3 17 V7 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 7 V17 M8 11 H16" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function SectionRendue({
  section,
  contenu,
}: {
  section: SectionRapport;
  contenu: ContenuRapport | null;
}) {
  if (section.blocs.length === 0 && !section.titre) return null;

  return (
    <section className="space-y-3">
      {section.titre && (
        <h2 className="text-[12pt] font-semibold tracking-tight">{section.titre}</h2>
      )}

      {section.blocs.length > 0 && (
        <div className="grid grid-cols-6 gap-4">
          {section.blocs.map((bloc) => (
            <div key={bloc.id} className={CLASSES_LARGEUR[bloc.largeur]}>
              <BlocRendu bloc={bloc} contenu={contenu} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function BlocRendu({ bloc, contenu }: { bloc: BlocRapport; contenu: ContenuRapport | null }) {
  const definition = definitionBloc(bloc.type);
  if (!definition) return null;

  const texte = (cle: string) =>
    typeof bloc.reglages[cle] === 'string' ? (bloc.reglages[cle] as string) : '';

  switch (bloc.type) {
    case 'TITRE':
      return (
        <h3 className="text-[11pt] font-semibold">{texte('texte') || 'Titre sans texte'}</h3>
      );

    case 'TEXTE':
      return (
        <p className="text-[10pt] leading-relaxed whitespace-pre-line">
          {texte('contenu') || 'Paragraphe vide.'}
        </p>
      );

    case 'SIGNATURE': {
      const lignes = Array.isArray(bloc.reglages.lignes)
        ? bloc.reglages.lignes.filter((l): l is string => typeof l === 'string')
        : [];

      return (
        <div className="flex flex-wrap gap-6 pt-6">
          {(lignes.length > 0 ? lignes : ['']).map((ligne, i) => (
            <div key={i} className="min-w-32 flex-1">
              <div className="h-10 border-b border-slate-400" />
              <p className="mt-1 text-[9pt] text-slate-700">{ligne || ' '}</p>
            </div>
          ))}
        </div>
      );
    }

    case 'IMAGE':
      return (
        <figure className="flex flex-col items-center gap-1">
          <div className="flex h-24 w-full items-center justify-center border border-dashed border-slate-300 text-[8pt] text-slate-500">
            Image posée à la génération
          </div>
          {texte('legende') && (
            <figcaption className="text-[8pt] text-slate-600">{texte('legende')}</figcaption>
          )}
        </figure>
      );

    default:
      return <BlocDeDonnees bloc={bloc} contenu={contenu} />;
  }
}

/**
 * Un bloc de données.
 *
 * PENDANT LA COMPOSITION, IL MONTRE DES DONNÉES D'EXEMPLE. Un cadre nommant sa
 * source ne dit rien de ce qu'il fera : un tableau de quatre lignes ne tient
 * pas dans l'espace du même tableau vide, une courbe n'a pas la hauteur du
 * rectangle qui l'annonce. Sans matière, on compose à l'aveugle et on découvre
 * sa mise en page à la génération — trop tard.
 *
 * ELLES SE DISENT : le pied de page porte la mention. Un chiffre plausible
 * qu'on prendrait pour un vrai est pire qu'un cadre vide — on le citerait.
 */
function BlocDeDonnees({ bloc, contenu }: { bloc: BlocRapport; contenu: ContenuRapport | null }) {
  const definition = definitionBloc(bloc.type)!;
  const titre =
    typeof bloc.reglages.titre === 'string' && bloc.reglages.titre
      ? bloc.reglages.titre
      : definition.libelle;

  /**
   * LE RÉEL ET L'EXEMPLE PASSENT PAR LE MÊME RENDU.
   *
   * `contenu[bloc.id]` porte ce que la base a rendu à la génération, figé
   * (RG-27) ; en son absence, l'exemple tient la place. Les deux ont la même
   * forme (`ContenuBloc`), donc **une seule** fonction les dessine : c'est ce
   * qui garantit que l'aperçu ne ment pas sur le document (règle 16).
   */
  const resolu = contenu?.[bloc.id] ?? contenuExemple(bloc);

  return (
    <div className="flex h-full flex-col gap-2 rounded border border-slate-300 p-3">
      <p className="text-[8pt] font-medium tracking-wide text-slate-600 uppercase">
        {titre}
      </p>

      {resolu && <ContenuSimule contenu={resolu} forme={typeGraphique(bloc)} />}
    </div>
  );
}

/** Chaque genre a sa forme — c'est la FORME qu'on vient vérifier ici. */
function ContenuSimule({
  contenu,
  forme,
}: {
  contenu: ContenuExemple;
  forme: TypeGraphique;
}) {
  switch (contenu.genre) {
    case 'INDICATEUR':
      return (
        <div>
          <p className="text-[18pt] leading-none font-semibold tabular-nums">
            {contenu.valeur}
          </p>
          <p className="mt-1 text-[8pt] text-slate-600">{contenu.legende}</p>
        </div>
      );

    case 'TABLEAU':
      return (
        <table className="w-full border-collapse text-[8pt]">
          <thead>
            <tr className="border-b border-slate-400">
              {contenu.colonnes.map((c) => (
                <th key={c} className="py-1 text-left font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contenu.lignes.map((ligne, i) => (
              <tr key={i} className="border-b border-slate-200 last:border-0">
                {ligne.map((cellule, j) => (
                  <td key={j} className={cn('py-1', j > 0 && 'tabular-nums')}>
                    {cellule}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );

    case 'SERIE':
      return <Graphique contenu={contenu} forme={forme} />;

    case 'JAUGE': {
      /**
       * `couverture` PLUTOT QU'UNE DIVISION ECRITE ICI.
       *
       * Elle existe depuis EF-DSH-05, elle est testee, et elle rend `null`
       * quand il n'y a rien a couvrir. La division posee a la main donnait
       * « NaN % » sur un total nul — constate sur un rapport diffuse.
       *
       * Le fond de la regle : « 0 % » se lit comme une MESURE alors qu'il n'y
       * a rien a mesurer, et « NaN % » ne se lit pas du tout — il dit au
       * lecteur que le document est casse, ce qui est pire que de se taire.
       */
      const part = couverture(contenu.atteint, contenu.total);
      return (
        <div>
          {/* « 12 sur 20 » et pas seulement « 60 % » : un pourcentage seul ne
              distingue pas trois entités sur cinq de six cents sur mille. */}
          <p className="text-[14pt] leading-none font-semibold tabular-nums">
            {contenu.atteint} / {contenu.total}
          </p>
          <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
            <div
              className="h-2 rounded-full bg-slate-700"
              style={{ width: `${part ?? 0}%` }}
            />
          </div>
          <p className="mt-1 text-[8pt] text-slate-600">
            {contenu.legende}
            {part !== null && (
              <>
                {' — '}
                <span className="tabular-nums">{part.toFixed(0)} %</span>
              </>
            )}
          </p>
        </div>
      );
    }

    case 'FRISE':
      return (
        <ol className="space-y-2 text-[8pt]">
          {contenu.evenements.map((e) => (
            <li key={e.date} className="flex gap-3">
              <span className="w-16 shrink-0 tabular-nums text-slate-600">{e.date}</span>
              <span className="border-l border-slate-300 pl-3">{e.texte}</span>
            </li>
          ))}
        </ol>
      );

    case 'ARBRE':
      return (
        <div className="flex flex-col items-center gap-2 text-[8pt]">
          <span className="rounded border border-slate-400 px-2 py-1 font-medium">
            {contenu.racine}
          </span>
          <span className="h-3 w-px bg-slate-400" />
          <div className="flex flex-wrap justify-center gap-2">
            {contenu.enfants.map((enfant) => (
              <span key={enfant} className="rounded border border-slate-300 px-2 py-1">
                {enfant}
              </span>
            ))}
          </div>
        </div>
      );
  }
}

/**
 * Les six formes — EF-RAP-02.
 *
 * TOUT EST DU SVG ÉCRIT À LA MAIN (règle 29). Recharts pèse quelques centaines
 * de kilooctets pour six rectangles, et il faudrait l'importer dynamiquement —
 * donc gérer un état de chargement — dans un aperçu qui doit suivre la frappe.
 *
 * Un dégradé de gris et non des couleurs : ce document part à l'imprimante, et
 * six teintes voisines y deviennent six gris identiques. Les parts se
 * distinguent par leur VALEUR, pas par leur teinte.
 */
const GRIS = ['#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0'];

function Graphique({
  contenu,
  forme,
}: {
  contenu: Extract<ContenuExemple, { genre: 'SERIE' }>;
  forme: TypeGraphique;
}) {
  const max = Math.max(...contenu.valeurs, 1);

  if (forme === 'CAMEMBERT' || forme === 'ANNEAU') {
    return <Parts contenu={contenu} anneau={forme === 'ANNEAU'} />;
  }

  if (forme === 'BARRES_HORIZONTALES') {
    // Seule forme qui laisse lire un libellé long à côté de sa barre : c'est ce
    // qui la rend obligatoire dès qu'on classe des noms.
    return (
      <ul className="space-y-1">
        {contenu.valeurs.map((valeur, i) => (
          <li key={i} className="flex items-center gap-2 text-[7pt]">
            <span className="w-8 shrink-0 text-slate-600">{contenu.libelles[i]}</span>
            <span className="h-2 flex-1 rounded-sm bg-slate-100">
              <span
                className="block h-2 rounded-sm bg-slate-700"
                style={{ width: `${(valeur / max) * 100}%` }}
              />
            </span>
            <span className="w-6 shrink-0 text-right tabular-nums text-slate-600">
              {valeur}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  const pas = 100 / Math.max(1, contenu.valeurs.length - 1);
  const points = contenu.valeurs.map((v, i) => `${i * pas},${36 - (v / max) * 32}`);

  return (
    <div>
      <svg viewBox="0 0 100 40" className="h-16 w-full" role="img" aria-label={contenu.legende}>
        {forme === 'BARRES' &&
          contenu.valeurs.map((valeur, i) => {
            const largeur = 100 / contenu.valeurs.length;
            const hauteur = (valeur / max) * 32;
            return (
              <rect
                key={i}
                x={i * largeur + largeur * 0.2}
                y={36 - hauteur}
                width={largeur * 0.6}
                height={hauteur}
                fill="#334155"
              />
            );
          })}

        {/* L'aire se ferme sur la ligne de base : c'est ce remplissage qui
            donne le volume accumulé, et qui la distingue d'une courbe. */}
        {forme === 'AIRE' && (
          <polygon points={`0,36 ${points.join(' ')} 100,36`} fill="#cbd5e1" />
        )}

        {(forme === 'LIGNE' || forme === 'AIRE') && (
          <polyline
            points={points.join(' ')}
            fill="none"
            stroke="#334155"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        )}

        <line x1="0" y1="36" x2="100" y2="36" stroke="#94a3b8" strokeWidth="0.4" />
      </svg>

      <div className="flex text-[6pt] text-slate-600">
        {contenu.libelles.map((libelle) => (
          <span key={libelle} className="flex-1 text-center">
            {libelle}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Camembert et anneau — la seule question qu'ils savent poser est celle de la
 * PART DANS UN TOUT. Ils portent donc leurs pourcentages, sans quoi l'œil doit
 * comparer des angles, ce qu'il fait mal.
 */
function Parts({
  contenu,
  anneau,
}: {
  contenu: Extract<ContenuExemple, { genre: 'SERIE' }>;
  anneau: boolean;
}) {
  const total = contenu.valeurs.reduce((s, v) => s + v, 0) || 1;
  const rayon = 16;

  /**
   * Les angles de départ se CALCULENT, ils ne s'accumulent pas.
   *
   * Un compteur incrémenté dans le `map` serait réassigné pendant le rendu :
   * le compilateur React le refuse, et il a raison — un rendu interrompu puis
   * repris repartirait d'un angle déjà avancé, et le camembert se dessinerait
   * en spirale. Six valeurs : la somme préfixe ne coûte rien.
   */
  const parts = contenu.valeurs.map((valeur, i) => {
    const avant = contenu.valeurs.slice(0, i).reduce((s, v) => s + v, 0);
    const angle = -Math.PI / 2 + (avant / total) * Math.PI * 2;
    const balaye = (valeur / total) * Math.PI * 2;

    const x1 = 20 + rayon * Math.cos(angle);
    const y1 = 20 + rayon * Math.sin(angle);
    const x2 = 20 + rayon * Math.cos(angle + balaye);
    const y2 = 20 + rayon * Math.sin(angle + balaye);

    return {
      // `large-arc-flag` : au-delà d'un demi-tour, SVG a besoin qu'on lui dise
      // de prendre le grand arc — sinon une part de 60 % se dessine à 40 %.
      d: `M20,20 L${x1},${y1} A${rayon},${rayon} 0 ${balaye > Math.PI ? 1 : 0},1 ${x2},${y2} Z`,
      couleur: GRIS[i % GRIS.length]!,
      part: Math.round((valeur / total) * 100),
      libelle: contenu.libelles[i] ?? '',
    };
  });

  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 40 40" className="h-20 w-20 shrink-0" role="img" aria-label={contenu.legende}>
        {parts.map((p, i) => (
          <path key={i} d={p.d} fill={p.couleur} />
        ))}
        {anneau && <circle cx="20" cy="20" r="8" fill="#ffffff" />}
      </svg>

      <ul className="min-w-0 flex-1 space-y-0.5 text-[7pt]">
        {parts.map((p, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span
              className="size-2 shrink-0 rounded-sm"
              style={{ backgroundColor: p.couleur }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-slate-700">{p.libelle}</span>
            <span className="tabular-nums text-slate-600">{p.part} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
