'use client';

import {
  ArrowRightLeft,
  CircleCheck,
  CircleSlash,
  Cross,
  Mars,
  Search,
  SlidersHorizontal,
  UserMinus,
  UsersRound,
  Venus,
  X,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';

import type { OptionReferentiel } from '@/components/croyants/croyant-form';
import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { EntityPicker, type OptionEntite } from '@/components/structure/entity-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LIBELLES_STATUT_CROYANT } from '@/lib/domain/croyant';
import { formatNombre } from '@/lib/utils/format';

/**
 * Filtres de la liste des croyants — EF-CRO-04, EF-CRO-05.
 *
 * Contrairement à la structure, filtrée en mémoire, la recherche est SERVEUR :
 * les 200 000 croyants visés (ENF-PRF-05) ne peuvent pas être chargés côté
 * client. Chaque changement navigue donc réellement.
 *
 * D'où la règle qui gouverne ce composant : **l'affichage du filtre ne doit
 * jamais attendre le serveur.** L'état vit ici, en local ; le clic le change
 * immédiatement et l'URL suit dans une transition. Auparavant les contrôles
 * lisaient `useSearchParams()`, qui ne se met à jour qu'une fois la navigation
 * terminée : on cliquait, et rien ne bougeait pendant tout l'aller-retour.
 * La liste, elle, reste affichée et s'estompe — jamais de squelette à la place
 * de données déjà correctes.
 *
 * Les ensembles CLOS (sexe, statut, présence en cellule) passent en
 * pictogrammes, comme la liste des entités ; les ensembles OUVERTS (église,
 * grade, nationalité, âge) gardent un sélecteur.
 */

const SEXE_TOUS = 'tous';
const STATUT_DEFAUT = 'ACTIF';

interface Etat {
  q: string;
  entite: string | null;
  sexe: string;
  statut: string;
  encellule: string;
  grade: string;
  nationalite: string;
  age_min: string;
  age_max: string;
}

function etatDepuis(params: URLSearchParams): Etat {
  return {
    q: params.get('q') ?? '',
    entite: params.get('entite'),
    sexe: params.get('sexe') ?? SEXE_TOUS,
    statut: params.get('statut') ?? STATUT_DEFAUT,
    encellule: params.get('encellule') ?? 'tous',
    grade: params.get('grade') ?? 'tous',
    nationalite: params.get('nationalite') ?? 'tous',
    age_min: params.get('age_min') ?? '',
    age_max: params.get('age_max') ?? '',
  };
}

/**
 * Recliquer le filtre actif le relâche.
 *
 * Fonction PURE, appelée dans le gestionnaire et non pendant le rendu : une
 * fabrique de gestionnaires invoquée en rendu ferait lire le minuteur de
 * débounce à ce moment-là, ce que le compilateur React refuse à juste titre.
 */
function alterne(courant: string, valeur: string, neutre: string): string {
  return courant === valeur ? neutre : valeur;
}

const ETAT_VIDE: Etat = {
  q: '',
  entite: null,
  sexe: SEXE_TOUS,
  statut: STATUT_DEFAUT,
  encellule: 'tous',
  grade: 'tous',
  nationalite: 'tous',
  age_min: '',
  age_max: '',
};

export function FiltresCroyants({
  eglises,
  grades,
  nationalites,
  total,
  enCours,
  demarrer,
}: {
  eglises: OptionEntite[];
  grades: OptionReferentiel[];
  nationalites: OptionReferentiel[];
  total: number;
  /**
   * La transition appartient au PARENT : c'est lui qui estompe la table
   * pendant que le serveur recalcule. La remonter par un effet aurait
   * enfreint `react-hooks/set-state-in-effect` — et pour cause, ce serait un
   * second rendu pour propager une information déjà connue à l'appel.
   */
  enCours: boolean;
  demarrer: (action: () => void) => void;
}) {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();

  const [avance, setAvance] = useState(false);
  const [etat, setEtat] = useState<Etat>(() => etatDepuis(params));

  /**
   * Minuteur de débounce : une frappe ne doit pas produire une requête par
   * caractère, mais le champ doit répondre à chaque touche.
   */
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Navigation dérivée de l'état local. Appelée uniquement depuis un
   * gestionnaire d'événement : `etat` y est donc déjà celui du dernier rendu.
   */
  function appliquer(modifs: Partial<Etat>, delaiMs = 0) {
    const suivant = { ...etat, ...modifs };
    setEtat(suivant);
    programmer(suivant, delaiMs);
  }

  function programmer(cible: Etat, delaiMs: number) {
    if (minuteur.current) clearTimeout(minuteur.current);

    const naviguer = () => {
      const suivants = new URLSearchParams();
      if (cible.q.trim()) suivants.set('q', cible.q.trim());
      if (cible.entite) suivants.set('entite', cible.entite);
      if (cible.sexe !== SEXE_TOUS) suivants.set('sexe', cible.sexe);
      if (cible.statut !== STATUT_DEFAUT) suivants.set('statut', cible.statut);
      if (cible.encellule !== 'tous') suivants.set('encellule', cible.encellule);
      if (cible.grade !== 'tous') suivants.set('grade', cible.grade);
      if (cible.nationalite !== 'tous') suivants.set('nationalite', cible.nationalite);
      if (cible.age_min) suivants.set('age_min', cible.age_min);
      if (cible.age_max) suivants.set('age_max', cible.age_max);

      // Tout changement de filtre ramène à la première page : rester en page 7
      // d'un jeu qui n'en compte plus que 2 afficherait un vide inexplicable.
      demarrer(() => {
        router.replace(`${chemin}${suivants.size ? `?${suivants}` : ''}`, {
          scroll: false,
        });
      });
    };

    if (delaiMs === 0) naviguer();
    else minuteur.current = setTimeout(naviguer, delaiMs);
  }

  const aDesFiltres =
    etat.q !== '' ||
    etat.entite !== null ||
    etat.sexe !== SEXE_TOUS ||
    etat.statut !== STATUT_DEFAUT ||
    etat.encellule !== 'tous' ||
    etat.grade !== 'tous' ||
    etat.nationalite !== 'tous' ||
    etat.age_min !== '' ||
    etat.age_max !== '';

  function effacer() {
    setEtat(ETAT_VIDE);
    if (minuteur.current) clearTimeout(minuteur.current);
    demarrer(() => router.replace(chemin, { scroll: false }));
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4" data-pending={enCours || undefined}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="relative">
            <Search
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={etat.q}
              // Débounce : une frappe ne doit pas déclencher une requête par
              // caractère. Le champ, lui, répond à chaque touche.
              onChange={(e) => appliquer({ q: e.target.value }, 350)}
              placeholder="Nom, prénom, matricule, téléphone…"
              aria-label="Rechercher un croyant"
              className="h-10 w-72 pl-9"
            />
          </div>

          <div className="w-56">
            <EntityPicker
              options={eglises}
              value={etat.entite}
              onChange={(v) => appliquer({ entite: v })}
              placeholder="Tout le périmètre"
              emptyMessage="Aucune église"
            />
          </div>

          {/* --- Sexe --- */}
          <GroupeFiltres libelle="Filtrer par sexe">
            <FiltreIcone
              icone={Mars}
              libelle="Hommes"
              actif={etat.sexe === 'M'}
              classeActive="bg-sky-100 text-sky-700"
              onClick={() => appliquer({ sexe: alterne(etat.sexe, 'M', SEXE_TOUS) })}
            />
            <FiltreIcone
              icone={Venus}
              libelle="Femmes"
              actif={etat.sexe === 'F'}
              classeActive="bg-pink-100 text-pink-700"
              onClick={() => appliquer({ sexe: alterne(etat.sexe, 'F', SEXE_TOUS) })}
            />
          </GroupeFiltres>

          {/* --- Statut ---
              ACTIF est le défaut : la liste ne montre pas les décédés sans
              qu'on l'ait demandé. Recliquer un statut revient donc à ACTIF. */}
          <GroupeFiltres libelle="Filtrer par statut">
            <FiltreIcone
              icone={CircleCheck}
              libelle={LIBELLES_STATUT_CROYANT.ACTIF}
              actif={etat.statut === 'ACTIF'}
              classeActive="bg-emerald-100 text-emerald-700"
              onClick={() => appliquer({ statut: 'ACTIF' })}
            />
            <FiltreIcone
              icone={CircleSlash}
              libelle={LIBELLES_STATUT_CROYANT.INACTIF}
              actif={etat.statut === 'INACTIF'}
              classeActive="bg-slate-200 text-slate-700"
              onClick={() =>
                appliquer({ statut: alterne(etat.statut, 'INACTIF', STATUT_DEFAUT) })
              }
            />
            <FiltreIcone
              icone={ArrowRightLeft}
              libelle={LIBELLES_STATUT_CROYANT.TRANSFERE}
              actif={etat.statut === 'TRANSFERE'}
              classeActive="bg-indigo-100 text-indigo-700"
              onClick={() =>
                appliquer({ statut: alterne(etat.statut, 'TRANSFERE', STATUT_DEFAUT) })
              }
            />
            <FiltreIcone
              icone={Cross}
              libelle={LIBELLES_STATUT_CROYANT.DECEDE}
              actif={etat.statut === 'DECEDE'}
              classeActive="bg-slate-900 text-white"
              onClick={() =>
                appliquer({ statut: alterne(etat.statut, 'DECEDE', STATUT_DEFAUT) })
              }
            />
          </GroupeFiltres>

          {/* --- Présence en cellule (RG-05) --- */}
          <GroupeFiltres libelle="Filtrer par cellule">
            <FiltreIcone
              icone={UsersRound}
              libelle="Rattachés à une cellule"
              actif={etat.encellule === 'oui'}
              classeActive="bg-teal-100 text-teal-700"
              onClick={() => appliquer({ encellule: alterne(etat.encellule, 'oui', 'tous') })}
            />
            <FiltreIcone
              icone={UserMinus}
              libelle="Sans cellule"
              actif={etat.encellule === 'non'}
              classeActive="bg-amber-100 text-amber-700"
              onClick={() => appliquer({ encellule: alterne(etat.encellule, 'non', 'tous') })}
            />
          </GroupeFiltres>

          <Button
            variant="outline"
            className="h-10"
            onClick={() => setAvance((v) => !v)}
            aria-expanded={avance}
          >
            <SlidersHorizontal className="mr-2 size-4" aria-hidden />
            Plus de filtres
          </Button>

          {aDesFiltres && (
            <Button variant="ghost" className="h-10" onClick={effacer}>
              <X className="mr-2 size-4" aria-hidden />
              Effacer
            </Button>
          )}

          <span
            className="ml-auto font-mono text-xs tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            {formatNombre(total)} résultat{total > 1 ? 's' : ''}
          </span>
        </div>

        {/* --- Ensembles OUVERTS : la liste déroulante reste la bonne réponse --- */}
        {avance && (
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
            <Select value={etat.grade} onValueChange={(v) => appliquer({ grade: v })}>
              <SelectTrigger className="h-10 w-48" aria-label="Filtrer par grade">
                <SelectValue placeholder="Tous les grades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les grades</SelectItem>
                {grades.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.libelle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={etat.nationalite}
              onValueChange={(v) => appliquer({ nationalite: v })}
            >
              <SelectTrigger className="h-10 w-48" aria-label="Filtrer par nationalité">
                <SelectValue placeholder="Toutes nationalités" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Toutes nationalités</SelectItem>
                {nationalites.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.libelle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={130}
                placeholder="Âge min"
                value={etat.age_min}
                aria-label="Âge minimum"
                onChange={(e) => appliquer({ age_min: e.target.value }, 500)}
                className="h-10 w-28 font-mono tabular-nums"
              />
              <span className="text-sm text-muted-foreground">à</span>
              <Input
                type="number"
                min={0}
                max={130}
                placeholder="Âge max"
                value={etat.age_max}
                aria-label="Âge maximum"
                onChange={(e) => appliquer({ age_max: e.target.value }, 500)}
                className="h-10 w-28 font-mono tabular-nums"
              />
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
