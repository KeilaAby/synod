'use client';

import { TriangleAlert, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import {
  NouveauCroyantDialog,
  type OptionsCroyant,
} from '@/components/croyants/croyant-dialog';
import { CroyantMenu } from '@/components/croyants/croyant-menu';
import { useCroyantDialogs } from '@/components/croyants/use-croyant-dialogs';
import { EmptyState } from '@/components/shared/empty-state';
import { EnteteTriable } from '@/components/shared/entete-triable';
import { useSession } from '@/components/shared/session-provider';
import { StatusBadge, TON_CROYANT } from '@/components/shared/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import type { CroyantListe } from '@/lib/data/croyants';
import {
  type ColonneTriCroyant,
  FILTRES_LISTE_VIDES,
  type FiltresListeCroyants,
  LIBELLES_SEXE,
  aDesFiltres,
  calculerAge,
  filtrerCroyants,
  nomComplet,
  valeurTriCroyant,
} from '@/lib/domain/croyant';
import { type EtatTri, basculerTri, trierListe } from '@/lib/domain/tri';
import { formatDate, formatNombre } from '@/lib/utils/format';

import { FiltresCroyants } from './filtres';
import { Pagination } from './pagination';

/**
 * Liste des croyants — EF-CRO-04, EF-CRO-05.
 *
 * FILTRAGE INSTANTANÉ, en mémoire, comme la liste des entités. Les croyants du
 * périmètre sont chargés en une requête ; plus rien ne navigue ensuite — ni
 * une frappe, ni un pictogramme, ni un changement de page.
 *
 * Le filtrage serveur coûtait quatre allers-retours enchaînés par caractère
 * saisi : session, arbre, référentiels, liste — près de deux secondes sur la
 * liaison de l'utilisateur. Aucun réglage de requête ne rattrape cela ; c'est
 * le NOMBRE d'allers-retours qu'il fallait ramener à un.
 *
 * La contrepartie est bornée et assumée : au-delà de
 * `PLAFOND_CHARGEMENT_INTEGRAL`, le lot est tronqué et l'écran le dit — il
 * faut alors restreindre l'église, ce qui recharge un périmètre plus étroit.
 *
 * L'URL reste synchronisée par `history.replaceState` : la vue demeure
 * partageable, sans déclencher de rendu serveur.
 */

const TAILLE_PAGE = 50;

export function CroyantsClient({
  croyants,
  photos,
  tronque,
  options,
  filtresInitiaux,
}: {
  croyants: CroyantListe[];
  /** Clé de stockage -> URL signée (EF-CRO-09). Signées en lot par la page. */
  photos: Record<string, string>;
  tronque: boolean;
  options: OptionsCroyant;
  filtresInitiaux: FiltresListeCroyants;
}) {
  const { peut } = useSession();
  const router = useRouter();

  const [filtres, setFiltres] = useState<FiltresListeCroyants>(filtresInitiaux);
  const [page, setPage] = useState(1);
  /**
   * `null` = l'ordre du serveur, qui range deja par nom. Poser d'emblee un tri
   * sur « nom » afficherait un chevron actif que l'utilisateur n'a pas demande,
   * et lui ferait croire qu'il a cliqué.
   */
  const [tri, setTri] = useState<EtatTri<ColonneTriCroyant> | null>(null);

  const { modifier, transferer, demanderSuppression, dialogues } = useCroyantDialogs({
    croyants,
    photos,
    options,
  });

  // Déconnecte la frappe du filtrage : la saisie reste fluide même si le rendu
  // de la table prend quelques millisecondes.
  const filtresDifferes = useDeferredValue(filtres);

  /**
   * FILTRER PUIS TRIER, dans cet ordre : trier d'abord classerait des lignes
   * qu'on s'apprete a jeter.
   *
   * Le tri porte sur TOUT le résultat, pas sur la page affichée — sinon
   * « trier par âge » ne rangerait que les cinquante lignes sous les yeux, et
   * la page suivante repartirait de zéro.
   */
  const resultats = useMemo(
    () => trierListe(filtrerCroyants(croyants, filtresDifferes), tri, valeurTriCroyant),
    [croyants, filtresDifferes, tri],
  );

  const nbPages = Math.max(1, Math.ceil(resultats.length / TAILLE_PAGE));
  const pageBornee = Math.min(page, nbPages);
  const visibles = resultats.slice(
    (pageBornee - 1) * TAILLE_PAGE,
    pageBornee * TAILLE_PAGE,
  );

  // Synchronisation de l'URL sans navigation : pas de rendu serveur déclenché.
  useEffect(() => {
    const params = new URLSearchParams();
    const f = filtresDifferes;

    if (f.recherche.trim()) params.set('q', f.recherche.trim());
    if (f.egliseId) params.set('eglise', f.egliseId);
    if (f.sexe) params.set('sexe', f.sexe);
    if (f.statut !== FILTRES_LISTE_VIDES.statut) params.set('statut', f.statut);
    if (f.enCellule !== null) params.set('encellule', f.enCellule ? 'oui' : 'non');
    if (f.gradeId) params.set('grade', f.gradeId);
    if (f.nationaliteId) params.set('nationalite', f.nationaliteId);
    if (f.ageMin !== null) params.set('age_min', String(f.ageMin));
    if (f.ageMax !== null) params.set('age_max', String(f.ageMax));

    const url = params.size > 0 ? `?${params}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [filtresDifferes]);

  function changer(modifs: Partial<FiltresListeCroyants>) {
    // Lot tronqué : changer d'église doit RECHARGER un périmètre plus étroit,
    // sinon on ne filtrerait que les 2 000 premiers et l'alerte mentirait.
    if (tronque && 'egliseId' in modifs && modifs.egliseId !== filtres.egliseId) {
      router.replace(
        modifs.egliseId ? `/croyants?eglise=${modifs.egliseId}` : '/croyants',
      );
      return;
    }

    setFiltres((precedents) => ({ ...precedents, ...modifs }));
    // Rester en page 7 d'un jeu qui n'en compte plus que 2 afficherait un vide
    // inexplicable.
    setPage(1);
  }

  function effacer() {
    setFiltres(FILTRES_LISTE_VIDES);
    setPage(1);
  }

  function trier(colonne: ColonneTriCroyant) {
    setTri((actuel) => basculerTri(actuel, colonne));
    // Le premier de la liste triée doit être VISIBLE. Rester en page 4 après
    // avoir demandé « les plus jeunes d'abord » montrerait le 151ᵉ.
    setPage(1);
  }

  const filtrage = aDesFiltres(filtres);

  return (
    <div className="space-y-8">
      <FiltresCroyants
        filtres={filtres}
        onChange={changer}
        onEffacer={effacer}
        eglises={options.eglises}
        grades={options.grades}
        nationalites={options.nationalites}
        affiches={resultats.length}
        total={croyants.length}
      />

      {/* ENF-PRF-05 — au-delà du plafond, la recherche ne porte plus sur tout
          le périmètre. Le taire ferait croire à une absence de résultat. */}
      {tronque && (
        <Alert>
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Périmètre trop large pour une recherche complète</AlertTitle>
          <AlertDescription>
            Seuls les {formatNombre(croyants.length)} premiers croyants sont chargés.
            Choisissez une église pour restreindre le périmètre : la recherche redeviendra
            exhaustive.
          </AlertDescription>
        </Alert>
      )}

      {visibles.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filtrage ? 'Aucun croyant ne correspond' : 'Aucun croyant enregistré'}
          description={
            filtrage
              ? 'Élargissez les filtres, ou vérifiez le périmètre sélectionné.'
              : 'Enregistrez le premier croyant de votre périmètre. Le matricule sera attribué automatiquement.'
          }
          action={
            filtrage ? (
              <Button variant="outline" className="h-10" onClick={effacer}>
                Effacer les filtres
              </Button>
            ) : (
              <NouveauCroyantDialog
                options={options}
                libelle="Enregistrer le premier croyant"
              />
            )
          }
        />
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              {/* UI-07 : pas de bordures verticales, valeurs en font-mono. */}
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {/* EF-CRO-04 — chaque colonne se trie au clic. Le menu ⋮
                        n'est pas une donnée : il n'a rien à classer. */}
                    <EnteteTriable colonne="nom" etat={tri} onTrier={trier}>
                      Nom
                    </EnteteTriable>
                    <EnteteTriable colonne="matricule" etat={tri} onTrier={trier}>
                      Matricule
                    </EnteteTriable>
                    <EnteteTriable colonne="sexe" etat={tri} onTrier={trier}>
                      Sexe
                    </EnteteTriable>
                    <EnteteTriable
                      colonne="age"
                      etat={tri}
                      onTrier={trier}
                      alignementDroite
                    >
                      Âge
                    </EnteteTriable>
                    <EnteteTriable colonne="eglise" etat={tri} onTrier={trier}>
                      Église
                    </EnteteTriable>
                    <EnteteTriable colonne="cellule" etat={tri} onTrier={trier}>
                      Cellule
                    </EnteteTriable>
                    <EnteteTriable colonne="grade" etat={tri} onTrier={trier}>
                      Grade
                    </EnteteTriable>
                    <EnteteTriable colonne="bapteme" etat={tri} onTrier={trier}>
                      Baptême
                    </EnteteTriable>
                    <EnteteTriable colonne="statut" etat={tri} onTrier={trier}>
                      Statut
                    </EnteteTriable>
                    <TableHead className="w-12 text-right">
                      <span className="sr-only">Options</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {visibles.map((c) => {
                    // RG-25 : le droit s'évalue avec la portée de l'église.
                    const portee = c.eglise?.path;
                    return (
                      <TableRow key={c.id} className="h-12">
                        <TableCell>
                          <Link
                            href={`/croyants/${c.id}`}
                            className="text-foreground flex items-center gap-3 font-medium transition-colors hover:text-indigo-700"
                          >
                            {/* EF-CRO-09 — en attendant le téléversement de photo. */}
                            <AvatarCroyant
                              nom={c.nom}
                              prenom={c.prenom}
                              url={c.photo_key ? photos[c.photo_key] : null}
                            />
                            <span className="truncate">
                              {nomComplet(c.nom, c.prenom)}
                            </span>
                          </Link>
                        </TableCell>

                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {c.matricule}
                        </TableCell>

                        <TableCell className="text-sm">{LIBELLES_SEXE[c.sexe]}</TableCell>

                        <TableCell className="text-right font-mono tabular-nums">
                          {calculerAge(new Date(c.date_naissance))}
                        </TableCell>

                        <TableCell className="max-w-40 truncate text-sm">
                          {c.eglise?.nom ?? '—'}
                        </TableCell>

                        <TableCell className="text-muted-foreground max-w-32 truncate text-sm">
                          {c.cellule?.nom ?? '—'}
                        </TableCell>

                        <TableCell className="text-sm">
                          {c.grade?.libelle ?? '—'}
                        </TableCell>

                        <TableCell className="text-muted-foreground font-mono text-xs tabular-nums">
                          {formatDate(c.date_bapteme)}
                        </TableCell>

                        <TableCell>
                          <StatusBadge tone={TON_CROYANT[c.statut] ?? 'neutral'}>
                            {c.statut.charAt(0) + c.statut.slice(1).toLowerCase()}
                          </StatusBadge>
                        </TableCell>

                        <TableCell className="text-right">
                          <CroyantMenu
                            id={c.id}
                            nom={nomComplet(c.nom, c.prenom)}
                            peutModifier={portee ? peut('croyant.update', portee) : false}
                            peutTransferer={
                              portee ? peut('croyant.transfer', portee) : false
                            }
                            peutSupprimer={
                              portee ? peut('croyant.delete', portee) : false
                            }
                            onModifier={modifier}
                            onTransferer={transferer}
                            onSupprimer={demanderSuppression}
                            className="ml-auto"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Pagination
            page={pageBornee}
            nbPages={nbPages}
            total={resultats.length}
            onPage={setPage}
          />
        </>
      )}

      {dialogues}
    </div>
  );
}
