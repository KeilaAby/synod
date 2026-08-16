'use client';

import {
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Network,
  PieChart,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { BoutonExport } from '@/components/finances/bouton-export';
import { CourbeAnnuelle } from '@/components/finances/courbe-annuelle';
import { EmptyState } from '@/components/shared/empty-state';
import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { EntityPicker, type OptionEntite } from '@/components/structure/entity-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { LigneSoeur, LigneSynthese } from '@/lib/data/finances';
import {
  type Granularite,
  bornesPeriode,
  decalerPeriode,
  libellePeriode,
  partDeCategorie,
  totauxDeSynthese,
} from '@/lib/domain/synthese';
import { formatMontant, formatNombre } from '@/lib/utils/format';

/**
 * Synthèse périodique — EF-FIN-24.
 *
 * TOUT SE CALCULE ICI. Le serveur a rendu l'année entière, mois par mois et
 * dans les deux portées : changer de mois, passer au trimestre, basculer du
 * propre au consolidé sont des sommes faites dans le navigateur (règle 17).
 * Ce qui coûte n'est pas la durée d'un aller-retour mais leur nombre, et celui
 * qui ouvre une synthèse en parcourt cinq ou six périodes de suite.
 *
 * SEUL LE CHANGEMENT D'ANNÉE OU D'ENTITÉ repart au serveur — ce sont les deux
 * seules choses qui changent le VOLUME lu.
 *
 * CE N'EST PAS UN SOLDE DE TRÉSORERIE. Le nombre affiché est un RÉSULTAT DE
 * PÉRIODE : recettes moins dépenses sur les mois retenus. `/finances` répond à
 * « de combien disposons-nous ? » ; cet écran répond à « qu'avons-nous fait ce
 * trimestre ? ». Les deux nombres sont plausibles et un seul répond.
 */
export function SyntheseClient({
  categories,
  soeurs,
  entites,
  entiteId,
  entiteNom,
  soeursConnues,
  annee,
  devise,
}: {
  categories: LigneSynthese[];
  soeurs: LigneSoeur[];
  entites: OptionEntite[];
  entiteId: string;
  entiteNom: string;
  /** Dressée depuis l'arbre : une sœur sans mouvement figure à zéro (règle 15). */
  soeursConnues: { id: string; nom: string; code: string }[];
  annee: number;
  devise: string;
}) {
  const router = useRouter();
  const [rechargement, demarrerRechargement] = useTransition();

  /**
   * SEULES L'ANNÉE ET L'ENTITÉ REPARTENT AU SERVEUR.
   *
   * Ce sont les deux seules choses qui changent le VOLUME lu ; tout le reste —
   * granularité, période, portée — se recalcule sur des données déjà en main
   * (règle 17). L'URL porte les deux, ce qui rend la synthèse partageable.
   */
  const recharger = (prochaineAnnee: number, prochaineEntite: string) =>
    demarrerRechargement(() => {
      router.push(`/finances/synthese?entite=${prochaineEntite}&annee=${prochaineAnnee}`);
    });

  const [granularite, setGranularite] = useState<Granularite>('MOIS');
  const [ancre, setAncre] = useState(() => {
    // On s'ouvre sur le mois d'aujourd'hui s'il appartient à l'année chargée,
    // sinon sur son dernier mois : une année passée s'ouvre sur décembre, pas
    // sur un mois vide choisi au hasard.
    const aujourdhui = new Date().toISOString().slice(0, 10);
    return aujourdhui.startsWith(String(annee)) ? aujourdhui : `${annee}-12-15`;
  });
  const [consolide, setConsolide] = useState(true);

  const bornes = useMemo(
    () => bornesPeriode(granularite, ancre),
    [granularite, ancre],
  );

  /** Les lignes des mois retenus, refondues par catégorie. */
  const parCategorie = useMemo(() => {
    const cumul = new Map<
      string,
      { libelle: string; sens: string; montant: number; nombre: number }
    >();

    for (const l of categories) {
      if (l.mois < bornes.debut || l.mois > bornes.fin) continue;

      const courant = cumul.get(l.categorieId) ?? {
        libelle: l.libelle,
        sens: l.sens,
        montant: 0,
        nombre: 0,
      };
      // La portée se lit ICI plutôt que dans une fonction proche : une closure
      // sortie du `useMemo` en devient une dépendance neuve à chaque rendu, et
      // le recalcul redevient systématique.
      courant.montant += consolide ? l.montantConsolide : l.montantPropre;
      courant.nombre += consolide ? l.nombreConsolide : l.nombrePropre;
      cumul.set(l.categorieId, courant);
    }

    return (
      [...cumul.entries()]
        .map(([id, v]) => ({ id, ...v }))
        // Une catégorie dont la portée retenue ne retient rien n'a pas de ligne :
        // un tableau de zéros ferait chercher les vrais nombres au milieu.
        .filter((c) => c.montant > 0)
        // Ce qui entre avant ce qui sort, et le plus gros avant le reste. Un
        // tri alphabétique ferait chercher ce qu'on vient lire en premier.
        .sort((a, b) => a.sens.localeCompare(b.sens) || b.montant - a.montant)
    );
  }, [categories, bornes, consolide]);

  const totaux = useMemo(() => totauxDeSynthese(parCategorie), [parCategorie]);

  /** L'évolution : la somme des catégories par mois, sur l'année entière. */
  const serie = useMemo(() => {
    const parMois = new Map<string, { recettes: number; depenses: number }>();

    for (let m = 1; m <= 12; m++) {
      parMois.set(`${annee}-${String(m).padStart(2, '0')}-01`, {
        recettes: 0,
        depenses: 0,
      });
    }

    for (const l of categories) {
      const point = parMois.get(l.mois);
      if (!point) continue;
      const montant = consolide ? l.montantConsolide : l.montantPropre;
      if (l.sens === 'RECETTE') point.recettes += montant;
      else point.depenses += montant;
    }

    return [...parMois.entries()].map(([mois, v]) => ({ mois, ...v }));
  }, [categories, annee, consolide]);

  /** Le comparatif : chaque sœur connue, à zéro si elle n'a rien encaissé. */
  const comparatif = useMemo(() => {
    const cumul = new Map<string, { recettes: number; depenses: number }>();

    for (const s of soeurs) {
      if (s.mois < bornes.debut || s.mois > bornes.fin) continue;
      const courant = cumul.get(s.entityId) ?? { recettes: 0, depenses: 0 };
      courant.recettes += s.recettes;
      courant.depenses += s.depenses;
      cumul.set(s.entityId, courant);
    }

    return soeursConnues
      .map((e) => {
        const m = cumul.get(e.id) ?? { recettes: 0, depenses: 0 };
        return { ...e, ...m, solde: m.recettes - m.depenses };
      })
      .sort((a, b) => b.solde - a.solde);
  }, [soeurs, soeursConnues, bornes]);

  const totalRecettes = totaux.recettes;
  const totalDepenses = totaux.depenses;

  return (
    /*
      L'ATTENTE SE VOIT SANS QUE L'ÉCRAN DISPARAISSE. Changer d'année recharge
      depuis le serveur : estomper ce qui est affiché dit que ce n'est plus à
      jour, là où un squelette effacerait ce qu'on était en train de lire.
    */
    <div className={`space-y-8 ${rechargement ? 'pointer-events-none opacity-60' : ''}`}>
      {/* --- Ce sur quoi porte la synthèse ------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-64">
          <EntityPicker
            options={entites}
            value={entiteId}
            onChange={(id) => id && recharger(annee, id)}
            placeholder="Choisir une entité"
            emptyMessage="Aucune entité dans votre périmètre."
          />
        </div>

        {/*
          RÈGLE 18 — l'ensemble est CLOS et connu : trois granularités, deux
          portées. Un sélecteur y coûterait trois gestes et cacherait l'état
          courant derrière un libellé.
        */}
        <GroupeFiltres libelle="Période">
          <FiltreIcone
            icone={CalendarDays}
            libelle="Mensuelle"
            actif={granularite === 'MOIS'}
            onClick={() => setGranularite('MOIS')}
          />
          <FiltreIcone
            icone={CalendarRange}
            libelle="Trimestrielle"
            actif={granularite === 'TRIMESTRE'}
            onClick={() => setGranularite('TRIMESTRE')}
          />
          <FiltreIcone
            icone={PieChart}
            libelle="Annuelle"
            actif={granularite === 'ANNEE'}
            onClick={() => setGranularite('ANNEE')}
          />
        </GroupeFiltres>

        <GroupeFiltres libelle="Portée">
          <FiltreIcone
            icone={Building2}
            libelle="Cette entité seule"
            actif={!consolide}
            onClick={() => setConsolide(false)}
          />
          <FiltreIcone
            icone={Network}
            libelle="Elle et tout son périmètre"
            actif={consolide}
            onClick={() => setConsolide(true)}
          />
        </GroupeFiltres>

        {/* La navigation de période : reculer d'un cran est le geste le plus
            fréquent d'une synthèse — on compare au précédent. */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Période précédente"
            onClick={() => {
              const suivant = decalerPeriode(granularite, ancre, -1);
              const anneeSuivante = Number(suivant.slice(0, 4));
              // Franchir le 1er janvier change l'année chargée : c'est le seul
              // pas de navigation qui coûte un aller-retour.
              if (anneeSuivante !== annee) recharger(anneeSuivante, entiteId);
              setAncre(suivant);
            }}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>

          <span className="min-w-32 text-center text-sm font-medium">
            {libellePeriode(granularite, ancre)}
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Période suivante"
            onClick={() => {
              const suivant = decalerPeriode(granularite, ancre, 1);
              const anneeSuivante = Number(suivant.slice(0, 4));
              if (anneeSuivante !== annee) recharger(anneeSuivante, entiteId);
              setAncre(suivant);
            }}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {/* --- Le triptyque de la période ---------------------------------- */}
      <section className="grid gap-4 sm:grid-cols-3">
        <CarteSynthese libelle="Recettes" valeur={totaux.recettes} devise={devise} ton="success" />
        <CarteSynthese libelle="Dépenses" valeur={totaux.depenses} devise={devise} ton="danger" />
        <CarteSynthese
          libelle="Résultat de la période"
          valeur={totaux.solde}
          devise={devise}
          ton={totaux.solde < 0 ? 'danger' : 'neutral'}
          /*
            LA MENTION N'EST PAS UNE PRÉCAUTION DE STYLE. Sans elle, ce nombre
            se lit comme le solde de trésorerie affiché sur `/finances`, et
            quelqu'un engagera une dépense sur un résultat de trimestre.
          */
          detail={`${consolide ? 'Périmètre entier' : entiteNom} — ce n’est pas la trésorerie disponible.`}
        />
      </section>

      {/* --- L'évolution -------------------------------------------------- */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1">
            <p className="eyebrow">Évolution — {annee}</p>
            <p className="text-muted-foreground text-sm">
              Les douze mois de l&apos;année, quelle que soit la période retenue :
              c&apos;est ce qui la situe.
            </p>
          </div>

          <CourbeAnnuelle
            points={serie}
            devise={devise}
            debut={bornes.debut}
            fin={bornes.fin}
          />
        </CardContent>
      </Card>

      {/* --- Par catégorie ------------------------------------------------ */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1">
            <p className="eyebrow">Par catégorie — {libellePeriode(granularite, ancre)}</p>
            <p className="text-muted-foreground text-sm">
              La part est celle de la catégorie dans son sens : une recette se
              rapporte aux recettes.
            </p>
          </div>

          {parCategorie.length > 0 && (
            <div className="flex justify-end">
              <BoutonExport
                nombre={parCategorie.length}
                libelle="Exporter la synthèse"
                tableau={() => ({
                  titre: `Synthese ${libellePeriode(granularite, ancre)}`,
                  sousTitre: `${entiteNom} — ${consolide ? 'périmètre entier' : 'entité seule'}`,
                  entetes: [
                    'Catégorie',
                    'Sens',
                    'Mouvements',
                    `Montant (${devise})`,
                    'Part (%)',
                  ],
                  lignes: parCategorie.map((c) => [
                    c.libelle,
                    c.sens === 'RECETTE' ? 'Recette' : 'Dépense',
                    c.nombre,
                    c.montant,
                    // Arrondi à la décimale AFFICHÉE : un export qui rendrait
                    // 66,666666 ne se rapprocherait plus de l'écran.
                    Number(
                      partDeCategorie(
                        c.montant,
                        c.sens === 'RECETTE' ? totalRecettes : totalDepenses,
                      ).toFixed(1),
                    ),
                  ]),
                })}
              />
            </div>
          )}

          {parCategorie.length === 0 ? (
            <EmptyState
              icon={PieChart}
              title="Aucun mouvement validé"
              description="Cette période ne compte aucun mouvement validé pour cette portée. Un mouvement en brouillon ou soumis n’entre dans aucune synthèse (RG-18)."
            />
          ) : (
            <div className="border-border overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Catégorie</TableHead>
                    <TableHead className="w-28">Sens</TableHead>
                    <TableHead className="w-24 text-right">Mouvements</TableHead>
                    <TableHead className="w-40 text-right">Montant</TableHead>
                    <TableHead className="w-24 text-right">Part</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {parCategorie.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm font-medium">{c.libelle}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {c.sens === 'RECETTE' ? 'Recette' : 'Dépense'}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNombre(c.nombre)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatMontant(c.montant, devise)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right text-sm tabular-nums">
                        {partDeCategorie(
                          c.montant,
                          c.sens === 'RECETTE' ? totalRecettes : totalDepenses,
                        ).toFixed(1)}
                        %
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Entre sœurs -------------------------------------------------- */}
      {comparatif.length > 1 && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1">
              <p className="eyebrow">Comparatif — entités de même rang</p>
              <p className="text-muted-foreground text-sm">
                Le consolidé de chacune sur la période. Comparer les montants
                propres ne dirait rien : là où l&apos;une encaisse elle-même,
                l&apos;autre laisse ses églises le faire.
              </p>
            </div>

            <div className="flex justify-end">
              <BoutonExport
                nombre={comparatif.length}
                libelle="Exporter le comparatif"
                tableau={() => ({
                  titre: `Comparatif ${libellePeriode(granularite, ancre)}`,
                  sousTitre: `Entités de même rang que ${entiteNom} — consolidé`,
                  entetes: [
                    'Entité',
                    'Code',
                    `Recettes (${devise})`,
                    `Dépenses (${devise})`,
                    `Résultat (${devise})`,
                  ],
                  lignes: comparatif.map((e) => [
                    e.nom,
                    e.code,
                    e.recettes,
                    e.depenses,
                    e.solde,
                  ]),
                })}
              />
            </div>

            <div className="border-border overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entité</TableHead>
                    <TableHead className="w-32">Code</TableHead>
                    <TableHead className="w-40 text-right">Recettes</TableHead>
                    <TableHead className="w-40 text-right">Dépenses</TableHead>
                    <TableHead className="w-40 text-right">Résultat</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {comparatif.map((e) => (
                    /* CELLE QU'ON REGARDE EST MISE EN AVANT : sans repère, il
                       faut relire les noms pour se situer dans son propre
                       comparatif. */
                    <TableRow key={e.id} className={e.id === entiteId ? 'bg-muted/50' : ''}>
                      <TableCell className="text-sm font-medium">{e.nom}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {e.code}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatMontant(e.recettes, devise)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatMontant(e.depenses, devise)}
                      </TableCell>
                      <TableCell
                        className={`text-right text-sm font-semibold tabular-nums ${
                          e.solde < 0 ? 'text-rose-700' : 'text-foreground'
                        }`}
                      >
                        {formatMontant(e.solde, devise)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CarteSynthese({
  libelle,
  valeur,
  devise,
  ton,
  detail,
}: {
  libelle: string;
  valeur: number;
  devise: string;
  ton: 'success' | 'danger' | 'neutral';
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
