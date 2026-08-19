'use client';

import {
  KeyRound,
  MoreVertical,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { CompteDialog } from '@/components/administration/compte-dialog';
import { IdentifiantsDialog } from '@/components/administration/identifiants-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { avertir } from '@/components/shared/messages';
import { OperationDialog } from '@/components/shared/operation-dialog';
import { useSession } from '@/components/shared/session-provider';
import type { OptionEntite } from '@/components/structure/entity-picker';
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
import {
  basculerActivationCompte,
  designerResponsableInformatique,
  reinitialiserMotDePasse,
  supprimerCompte,
} from '@/lib/actions/comptes';
import type { CompteListe, CroyantEligible } from '@/lib/data/comptes';
import type { ProfilEnregistre } from '@/lib/data/courriel';
import { type Permission, ROLE_LABELS } from '@/lib/domain/permissions';
import { appelerAction } from '@/lib/utils/appeler-action';
import { formatDateHeure } from '@/lib/utils/format';

/**
 * Les comptes du périmètre — EF-ADM-01, EF-ADM-07, EF-ADM-08.
 *
 * LE FILTRAGE EST EN MÉMOIRE (règle 17), et l'URL suit par
 * `history.replaceState` : la liste est déjà chargée, chercher un nom n'est pas
 * un motif de repartir au serveur.
 *
 * LES COMPTES DÉSACTIVÉS RESTENT VISIBLES, estompés. Les masquer ferait croire
 * qu'ils ont été supprimés — ce que l'application ne fait jamais : un compte a
 * signé des saisies, et les effacer laisserait le journal d'audit mentir.
 */
export function ComptesClient({
  comptes,
  croyants,
  photos,
  profils,
  entites,
  rechercheInitiale,
}: {
  comptes: CompteListe[];
  croyants: CroyantEligible[];
  photos: Record<string, string>;
  profils: ProfilEnregistre[];
  entites: OptionEntite[];
  rechercheInitiale: string;
}) {
  const router = useRouter();
  const { session: compte, peut, detient } = useSession();

  const [recherche, setRecherche] = useState(rechercheInitiale);
  const [identifiants, setIdentifiants] = useState<{
    email: string;
    motDePasse: string;
    nomComplet: string;
  } | null>(null);
  const [aReinitialiser, setAReinitialiser] = useState<CompteListe | null>(null);
  const [aSupprimer, setASupprimer] = useState<CompteListe | null>(null);
  const [enEdition, setEnEdition] = useState<CompteListe | null>(null);
  const [operation, setOperation] = useState<string | null>(null);

  const rechercheDifferee = useDeferredValue(recherche);

  useEffect(() => {
    const params = new URLSearchParams();
    if (rechercheDifferee.trim()) params.set('q', rechercheDifferee.trim());

    const url = params.size > 0 ? `?${params}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [rechercheDifferee]);

  const filtres = useMemo(() => {
    const terme = rechercheDifferee.trim().toLocaleLowerCase('fr');
    if (!terme) return comptes;

    return comptes.filter((c) =>
      [c.nom_complet, c.email, c.croyant?.matricule ?? '', c.entite?.nom ?? '']
        .join(' ')
        .toLocaleLowerCase('fr')
        .includes(terme),
    );
  }, [comptes, rechercheDifferee]);

  const peutOuvrir = entites.length > 0;

  async function basculer(cible: CompteListe) {
    const actif = !cible.is_active;
    setOperation(actif ? 'Réactivation du compte…' : 'Désactivation du compte…');

    const resultat = await appelerAction(() =>
      basculerActivationCompte({ profileId: cible.id, actif }),
    );
    setOperation(null);

    if (!resultat.ok) {
      avertir(resultat.error);
      return;
    }
    toast.success(actif ? 'Compte réactivé.' : 'Compte désactivé.');
    router.refresh();
  }

  async function reinitialiser(cible: CompteListe) {
    setAReinitialiser(null);
    setOperation('Génération d’un mot de passe provisoire…');

    const resultat = await appelerAction(() =>
      reinitialiserMotDePasse({ profileId: cible.id }),
    );
    setOperation(null);

    if (!resultat.ok) {
      avertir(resultat.error);
      return;
    }

    router.refresh();
    setIdentifiants({
      email: cible.email,
      motDePasse: resultat.data.motDePasse,
      nomComplet: cible.nom_complet,
    });
  }

  async function supprimer(cible: CompteListe) {
    setASupprimer(null);
    setOperation('Suppression du compte…');

    const resultat = await appelerAction(() => supprimerCompte({ profileId: cible.id }));
    setOperation(null);

    if (!resultat.ok) {
      avertir(resultat.error);
      return;
    }
    toast.success('Compte supprimé.');
    router.refresh();
  }

  async function basculerResponsable(cible: CompteListe) {
    const responsable = !cible.est_responsable_informatique;
    setOperation('Désignation en cours…');

    const resultat = await appelerAction(() =>
      designerResponsableInformatique({ profileId: cible.id, responsable }),
    );
    setOperation(null);

    if (!resultat.ok) {
      avertir(resultat.error);
      return;
    }
    toast.success(
      responsable
        ? 'Responsable informatique désigné.'
        : 'Désignation retirée.',
    );
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-64 flex-1">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, adresse, matricule, entité…"
            aria-label="Rechercher un compte"
            className="h-10 pl-9"
          />
        </div>

        {peutOuvrir && (
          <CompteDialog
            entites={entites}
            croyants={croyants}
            photos={photos}
            profils={profils}
            onOuvert={setIdentifiants}
          />
        )}
      </div>

      {filtres.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            rechercheDifferee.trim() ? 'Aucun compte ne correspond' : 'Aucun compte'
          }
          description={
            rechercheDifferee.trim()
              ? `Rien ne correspond à « ${rechercheDifferee.trim() }» dans votre périmètre.`
              : 'Votre périmètre ne contient aucun compte. Ouvrez le premier — ses identifiants vous seront remis à l’écran.'
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtres.map((c) => (
            <CarteCompte
              key={c.id}
              compte={c}
              soiMeme={c.id === compte.profileId}
              gerable={c.entite !== null && peut('user.manage', c.entite.path)}
              peutDesigner={detient('settings.manage')}
              onModifier={() => setEnEdition(c)}
              onBasculer={() => basculer(c)}
              onReinitialiser={() => setAReinitialiser(c)}
              onSupprimer={() => setASupprimer(c)}
              onResponsable={() => basculerResponsable(c)}
            />
          ))}
        </div>
      )}

      {/* Remonté par  : les champs repartent du compte affiché, sans effet
          de synchronisation qui arriverait plus tard et moins sûrement. */}
      {enEdition && (
        <CompteDialog
          key={enEdition.id}
          entites={entites}
          croyants={croyants}
          photos={photos}
          profils={profils}
          compte={{
            id: enEdition.id,
            nomComplet: enEdition.nom_complet,
            // Une adresse fabriquée depuis le matricule n'est pas une vraie
            // adresse : la proposer à la correction ferait croire qu'elle sert.
            email: enEdition.email.endsWith('@synod.invalid') ? '' : enEdition.email,
            entiteNom: enEdition.entite?.nom ?? '',
            entiteId: enEdition.entity_id,
            accordees: enEdition.habilitations.map((h) => h.permission as Permission),
          }}
          open
          onOpenChange={(ouvert) => !ouvert && setEnEdition(null)}
          onOuvert={setIdentifiants}
        />
      )}

      {/* Supprimer efface : cela se confirme, et le refus motivé arrive ensuite
          si le compte a laissé des traces. */}
      <ConfirmDialog
        open={aSupprimer !== null}
        onOpenChange={(v) => !v && setASupprimer(null)}
        title="Supprimer ce compte ?"
        description={
          aSupprimer
            ? `Le compte de ${aSupprimer.nom_complet} sera effacé. Ce n’est possible que s’il n’a jamais rien fait — sinon l’historique le mentionnerait sans pouvoir le nommer.`
            : ''
        }
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (aSupprimer) void supprimer(aSupprimer);
        }}
      />

      <IdentifiantsDialog
        identifiants={identifiants}
        onFermer={() => setIdentifiants(null)}
      />

      {/* Réinitialiser coupe l'accès jusqu'à ce que le nouveau mot de passe soit
          remis : cela se confirme. */}
      <ConfirmDialog
        open={aReinitialiser !== null}
        onOpenChange={(v) => !v && setAReinitialiser(null)}
        title="Réinitialiser le mot de passe ?"
        description={
          aReinitialiser
            ? `${aReinitialiser.nom_complet} ne pourra plus se connecter avec son mot de passe actuel. Le nouveau s’affichera une fois, à lui remettre en main propre.`
            : ''
        }
        confirmLabel="Réinitialiser"
        onConfirm={() => {
          if (aReinitialiser) void reinitialiser(aReinitialiser);
        }}
      />

      <OperationDialog ouvert={operation !== null} titre={operation ?? ''} />
    </div>
  );
}

function CarteCompte({
  compte,
  soiMeme,
  gerable,
  peutDesigner,
  onModifier,
  onBasculer,
  onReinitialiser,
  onSupprimer,
  onResponsable,
}: {
  compte: CompteListe;
  soiMeme: boolean;
  gerable: boolean;
  peutDesigner: boolean;
  onModifier: () => void;
  onBasculer: () => void;
  onReinitialiser: () => void;
  onSupprimer: () => void;
  onResponsable: () => void;
}) {
  return (
    <Card className={compte.is_active ? undefined : 'border-dashed opacity-75'}>
      <CardContent className="space-y-3 p-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {compte.nom_complet}
              {soiMeme && <span className="text-muted-foreground"> — vous</span>}
            </h3>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {compte.email}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label={`Actions sur le compte de ${compte.nom_complet}`}
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
              <DropdownMenuItem onClick={onModifier} disabled={!gerable}>
                <Pencil className="mr-2 size-4" aria-hidden />
                Modifier
              </DropdownMenuItem>

              <DropdownMenuItem onClick={onReinitialiser} disabled={!gerable}>
                <KeyRound className="mr-2 size-4" aria-hidden />
                Réinitialiser le mot de passe
              </DropdownMenuItem>

              {/* On ne se désactive pas soi-même : le compte se fermerait sous
                  celui qui clique, et un autre administrateur devrait le
                  rouvrir. L'entrée reste visible, éteinte. */}
              <DropdownMenuItem onClick={onBasculer} disabled={!gerable || soiMeme}>
                {compte.is_active ? (
                  <UserX className="mr-2 size-4" aria-hidden />
                ) : (
                  <UserCheck className="mr-2 size-4" aria-hidden />
                )}
                {compte.is_active ? 'Désactiver' : 'Réactiver'}
              </DropdownMenuItem>

              {/* La désignation appartient au SIÈGE : c'est un contournement de la
                  règle des bureaux, et laisser chaque entité se l'accorder
                  reviendrait à laisser chacune se dispenser de la règle. */}
              {peutDesigner && (
                <DropdownMenuItem onClick={onResponsable}>
                  <ShieldCheck className="mr-2 size-4" aria-hidden />
                  {compte.est_responsable_informatique
                    ? 'Retirer « responsable informatique »'
                    : 'Désigner responsable informatique'}
                </DropdownMenuItem>
              )}

              {/* Supprimer reste OUVERT même sur un compte qui a servi : c'est
                  l'action qui compte les traces et refuse en le disant. Éteindre
                  l'entrée ici obligerait à deviner pourquoi. */}
              <DropdownMenuItem
                onClick={onSupprimer}
                disabled={!gerable || soiMeme}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-4" aria-hidden />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{ROLE_LABELS[compte.role]}</Badge>
          {!compte.is_active && <Badge variant="outline">Désactivé</Badge>}
          {/* EF-ADM-01 — tant que le provisoire tient, le compte est connu de
              deux personnes. Le dire dans la liste, pas seulement à l'écran de
              celui qui l'a créé. */}
          {compte.doit_changer_mot_de_passe && (
            <Badge variant="outline">Mot de passe provisoire</Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {compte.entite?.nom ?? 'Entité inconnue'}
          {compte.croyant && (
            <>
              {' · '}
              <span className="font-mono">{compte.croyant.matricule}</span>
            </>
          )}
        </p>

        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          {compte.derniere_connexion ? (
            <>
              Dernière connexion le{' '}
              <span className="tabular-nums">
                {formatDateHeure(compte.derniere_connexion)}
              </span>
            </>
          ) : (
            // Un compte qui ne s'est jamais connecté est une information à part :
            // les identifiants n'ont peut-être jamais été remis.
            'Jamais connecté'
          )}
        </p>
      </CardContent>
    </Card>
  );
}
