'use client';

import { AlertCircle, Loader2, Search, WifiOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { avertir } from '@/components/shared/messages';
import { PermissionGate } from '@/components/shared/permission-gate';
import { TypeBadge } from '@/components/structure/type-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { basculerAccesApplication } from '@/lib/actions/entities';
import { normaliserRecherche } from '@/lib/domain/croyant';
import { ENTITY_LABELS, ENTITY_TYPES, type EntityType } from '@/lib/domain/hierarchy';

/**
 * Qui accède à l'application, et qui n'y accède pas — ARB-2, EF-STR-10.
 *
 * POURQUOI CET ÉCRAN EXISTE. Le réglage vivait dans le formulaire de chaque
 * entité : pour savoir lesquelles de ses vingt églises saisissent elles-mêmes,
 * il fallait ouvrir vingt fiches. La question est de COMPARAISON — « lesquelles
 * dois-je saisir à leur place ? » —, la réponse doit l'être aussi.
 *
 * CE QUE LE RÉGLAGE COMMANDE, ET RIEN D'AUTRE. Une entité déclarée sans accès
 * est la seule pour laquelle une entité au-dessus peut saisir des mouvements en
 * son nom (`finance.delegate`). Ce n'est pas une désactivation : ses données
 * restent lisibles, ses comptes existent, son solde se calcule. Cela dit
 * seulement « personne, ici, ne se connecte ».
 *
 * Le même patron que le réglage du workflow : des onglets par niveau, parce
 * qu'on cherche « mes églises » et non « la douzième ligne ».
 */

export interface LigneAcces {
  readonly id: string;
  readonly nom: string;
  readonly code: string;
  readonly type: EntityType;
  readonly sansAcces: boolean;
}

export function AccesApplicationDialog({ lignes }: { lignes: LigneAcces[] }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [ongletActif, setOngletActif] = useState<string | null>(null);

  /**
   * L'état local suit les bascules déjà faites : `router.refresh()` recharge la
   * page, mais l'interrupteur doit répondre AU CLIC, pas au retour du serveur.
   */
  const [bascules, setBascules] = useState<Record<string, boolean>>({});
  const sansAccesDe = (l: LigneAcces) => bascules[l.id] ?? l.sansAcces;

  const onglets = useMemo(() => {
    const terme = normaliserRecherche(recherche);
    const presents = new Set(lignes.map((l) => l.type));

    return ENTITY_TYPES.filter((type) => presents.has(type)).map((type) => ({
      type,
      libelle: ENTITY_LABELS[type]?.pluriel ?? type,
      // Le compte de l'onglet porte sur le NIVEAU, pas sur les résultats : il
      // ne doit pas bouger pendant qu'on tape.
      total: lignes.filter((l) => l.type === type).length,
      entites: lignes.filter(
        (l) =>
          l.type === type &&
          (!terme || normaliserRecherche(`${l.nom} ${l.code}`).includes(terme)),
      ),
    }));
  }, [lignes, recherche]);

  const actif = ongletActif ?? onglets[0]?.type ?? '';
  const sansAccesTotal = lignes.filter(sansAccesDe).length;

  async function basculer(ligne: LigneAcces) {
    setEnCours(ligne.id);
    try {
      const resultat = await basculerAccesApplication({ id: ligne.id });

      if (!resultat.ok) {
        avertir(resultat.error, { ton: 'refus', titre: 'Réglage refusé' });
        return;
      }

      setBascules((b) => ({ ...b, [ligne.id]: resultat.data.sansAcces }));
      router.refresh();
    } finally {
      setEnCours(null);
    }
  }

  return (
    <>
      {/* Le réglage touche la fiche d'une entité : c'est `entity.update` qui
          l'ouvre, pas un droit financier. */}
      <PermissionGate perm="entity.update">
        <Button variant="outline" className="h-10" onClick={() => setOuvert(true)}>
          <WifiOff className="mr-2 size-4" aria-hidden />
          Accès à l&apos;application
          {sansAccesTotal > 0 && (
            <span className="bg-foreground text-background ml-2 rounded-full px-2 py-0.5 text-xs tabular-nums">
              {sansAccesTotal}
            </span>
          )}
        </Button>
      </PermissionGate>

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="max-h-[92vh] w-[min(96vw,56rem)] overflow-x-hidden overflow-y-auto sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="text-2xl">Accès à l&apos;application</DialogTitle>
            <DialogDescription>
              Certaines églises n&apos;ont ni connexion ni ordinateur.
              Déclarez-les ici : quelqu&apos;un au-dessus d&apos;elles pourra
              alors enregistrer leurs recettes et leurs dépenses à leur place.
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 space-y-4 py-2">
            {/*
              CE QUE LE RÉGLAGE NE FAIT PAS, dit avant qu'on s'en inquiète :
              « sans accès » ressemble à « désactivée », et ce n'en est pas.
            */}
            <p className="text-muted-foreground border-border rounded-lg border p-3 text-sm">
              Une entité déclarée sans accès continue d&apos;exister normalement :
              ses croyants, ses bureaux et son solde restent visibles. Seule chose
              qui change — quelqu&apos;un d&apos;autre peut saisir ses mouvements,
              et chaque écriture porte alors la mention « saisie déléguée » avec le
              nom de son auteur.
            </p>

            {lignes.length === 0 ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <AlertCircle className="size-4" aria-hidden />
                Aucune entité dans votre périmètre.
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search
                    className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
                    aria-hidden
                  />
                  <Input
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                    placeholder="Nom ou code d&apos;entité…"
                    className="h-10 pl-9"
                    aria-label="Rechercher une entité"
                  />
                </div>

                <Tabs value={actif} onValueChange={setOngletActif}>
                  <TabsList
                    variant="line"
                    className="border-border h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b p-0"
                  >
                    {onglets.map((onglet) => (
                      <TabsTrigger
                        key={onglet.type}
                        value={onglet.type}
                        className="group-data-horizontal/tabs:after:bottom-0 group-data-horizontal/tabs:after:h-[3px] flex-none px-1 pt-1 pb-3 text-sm"
                      >
                        {onglet.libelle}
                        <span className="text-muted-foreground ml-2 font-mono text-xs tabular-nums">
                          {onglet.total}
                        </span>
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {onglets.map((onglet) => (
                    <TabsContent key={onglet.type} value={onglet.type} className="mt-4">
                      {onglet.entites.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                          Aucune entité de ce niveau ne correspond à votre recherche.
                        </p>
                      ) : (
                        <ul className="divide-border max-h-96 divide-y overflow-y-auto">
                          {onglet.entites.map((ligne) => (
                            <li
                              key={ligne.id}
                              className="flex items-center justify-between gap-4 py-3"
                            >
                              <span className="flex min-w-0 items-center gap-3">
                                <TypeBadge type={ligne.type} />
                                <span className="flex min-w-0 flex-col">
                                  <span className="truncate text-sm font-medium">
                                    {ligne.nom}
                                  </span>
                                  <span className="text-muted-foreground font-mono text-xs">
                                    {ligne.code}
                                  </span>
                                </span>
                              </span>

                              <span className="flex shrink-0 items-center gap-3">
                                <span className="text-muted-foreground text-xs">
                                  {sansAccesDe(ligne)
                                    ? 'Ne se connecte pas'
                                    : 'Se connecte'}
                                </span>
                                {enCours === ligne.id ? (
                                  <Loader2
                                    className="text-muted-foreground size-4 animate-spin"
                                    aria-hidden
                                  />
                                ) : (
                                  <Switch
                                    checked={sansAccesDe(ligne)}
                                    disabled={enCours !== null}
                                    onCheckedChange={() => void basculer(ligne)}
                                    aria-label={`${ligne.nom} ne se connecte pas`}
                                  />
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              </>
            )}
          </div>

          <DialogFooter>
            {/* Chaque bascule est déjà enregistrée : il n'y a rien à valider. */}
            <Button className="h-10" onClick={() => setOuvert(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
