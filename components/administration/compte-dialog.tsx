'use client';

import { AlertCircle, ArrowLeft, ArrowRight, Loader2, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useMemo, useState } from 'react';

import { SelecteurHabilitations } from '@/components/administration/selecteur-habilitations';
import { CroyantPicker } from '@/components/croyants/croyant-picker';
import { FriseEtapes, type Etape } from '@/components/croyants/etapes';
import { Field, TextField } from '@/components/shared/field';
import { useSession } from '@/components/shared/session-provider';
import { EntityPicker, type OptionEntite } from '@/components/structure/entity-picker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { creerCompte, modifierCompte } from '@/lib/actions/comptes';
import type { CroyantEligible } from '@/lib/data/comptes';
import type { ProfilEnregistre } from '@/lib/data/profils';
import {
  ALL_PERMISSIONS,
  type Permission,
  permissionsDeleguables,
} from '@/lib/domain/permissions';
import { PROFILS_RACCOURCIS } from '@/lib/domain/profils-habilitation';
import { appelerAction } from '@/lib/utils/appeler-action';
import { cn } from '@/lib/utils';

/**
 * Ouvrir un compte — EF-ADM-01, EF-ADM-07, RG-24.
 *
 * DEUX COLONNES, PARCE QUE DEUX QUESTIONS. À gauche : **qui** est cette
 * personne. À droite : **ce qu'elle aura le droit de faire**. Empilées, la
 * seconde passait sous la ligne de flottaison et se remplissait sans être
 * lue — or c'est elle qui décide de tout ce que le compte verra.
 *
 * SEULS LES MEMBRES DE BUREAUX REÇOIVENT UN COMPTE. La liste ne propose donc
 * que les croyants qui **siègent en ce moment** : le mandat est ce qui, dans
 * cette organisation, désigne un responsable. Un administrateur de district n'y
 * voit que les bureaux de son district — la RLS s'en charge, l'écran ne refait
 * aucun filtrage.
 */
const ETAPES: readonly Etape[] = [
  {
    cle: 'identite',
    titre: 'Informations generales',
    description: 'Qui est cette personne, et de quelle entite depend son compte.',
  },
  {
    cle: 'habilitations',
    titre: 'Habilitations',
    description: 'Ce qu elle aura le droit de faire, et sur quel perimetre.',
  },
];

/** Ce qu'il faut d'un compte existant pour le rouvrir en modification. */
export interface CompteModifiable {
  id: string;
  nomComplet: string;
  /** Vide quand l'adresse a été fabriquée depuis le matricule. */
  email: string;
  entiteNom: string;
  entiteId: string;
  accordees: Permission[];
}

export function CompteDialog({
  entites,
  croyants,
  photos,
  profils,
  compte,
  open,
  onOpenChange,
  onOuvert,
}: {
  entites: OptionEntite[];
  croyants: CroyantEligible[];
  /** Clé de photo → URL signée, signées en lot par la page. */
  photos: Record<string, string>;
  /** Les profils propres à l’organisation, à côté des cinq fournis. */
  profils: ProfilEnregistre[];
  /**
   * Mode MODIFICATION — UN SEUL POP-UP POUR LES DEUX (règle 16).
   *
   * Deux formulaires pour le même objet divergent toujours, et c'est celui
   * qu'on ouvre le moins souvent qui prend du retard. Le composant est alors
   * piloté par le menu de la carte, et remonté avec `key` pour que les champs
   * repartent du compte affiché.
   */
  compte?: CompteModifiable;
  open?: boolean;
  onOpenChange?: (ouvert: boolean) => void;
  onOuvert: (identifiants: {
    email: string;
    motDePasse: string;
    nomComplet: string;
  }) => void;
}) {
  const router = useRouter();
  const { session } = useSession();

  const edition = compte !== undefined;
  const pilote = open !== undefined;

  const [ouvertInterne, setOuvertInterne] = useState(false);
  const ouvert = pilote ? open : ouvertInterne;

  const [croyantId, setCroyantId] = useState<string | null>(null);
  const [nomComplet, setNomComplet] = useState(compte?.nomComplet ?? '');
  const [email, setEmail] = useState(compte?.email ?? '');
  const [entityId, setEntityId] = useState<string | null>(compte?.entiteId ?? null);
  const [accordees, setAccordees] = useState<Permission[]>(compte?.accordees ?? []);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [etape, setEtape] = useState(0);

  /** RG-24 — on ne propose que ce que le délégant détient lui-même. */
  const delegables = useMemo(() => permissionsDeleguables(session), [session]);

  /**
   * LES DEUX ORIGINES DE RACCOURCIS SE PRÉSENTENT ENSEMBLE.
   *
   * Celui qui ouvre un compte ne se demande pas si « Trésorier » vient du code
   * ou des réglages : il cherche le découpage qui correspond. Les séparer
   * ferait chercher deux fois.
   */
  const raccourcis = useMemo(
    () => [
      ...PROFILS_RACCOURCIS,
      ...profils.map((p) => ({
        cle: p.id,
        libelle: p.nom,
        description: p.description ?? 'Profil de l’organisation.',
        permissions: p.permissions.filter((x): x is Permission =>
          (ALL_PERMISSIONS as readonly string[]).includes(x),
        ),
      })),
    ],
    [profils],
  );

  const croyantChoisi = croyants.find((c) => c.id === croyantId) ?? null;

  /**
   * L'ENTITÉ SE VERROUILLE DÈS QU'ELLE EST DÉTERMINÉE, dans deux cas :
   *
   *  - un croyant est choisi : il siège dans un bureau, et c'est **cette**
   *    entité que son compte doit servir. La laisser modifiable inviterait à
   *    créer des comptes dont le périmètre ne correspond à aucun mandat ;
   *  - une seule entité est ouverte à l'administrateur : la question ne se pose
   *    pas, et un sélecteur à une entrée demande un clic pour rien.
   */
  // En modification, elle ne se change JAMAIS : le rattachement décide du
  // périmètre et porte le matricule de connexion.
  const entiteVerrouillee = edition || croyantChoisi !== null || entites.length === 1;
  const entiteEffective =
    compte?.entiteId ??
    croyantChoisi?.entite?.id ??
    (entites.length === 1 ? entites[0]!.id : entityId);
  const nomEntite =
    compte?.entiteNom ??
    entites.find((e) => e.id === entiteEffective)?.nom ??
    croyantChoisi?.entite?.nom ??
    '';

  /** La première étape suffit à ouvrir le compte : les droits peuvent attendre. */
  const premiereValide = nomComplet.trim().length >= 2 && Boolean(entiteEffective);

  function fermer() {
    if (pilote) {
      onOpenChange?.(false);
      return;
    }
    setOuvertInterne(false);
    setCroyantId(null);
    setNomComplet('');
    setEmail('');
    setEntityId(null);
    setAccordees([]);
    setErreur(null);
    setEtape(0);
  }

  /**
   * Choisir un croyant AMORCE le nom — il ne l'impose pas : « Jean-Baptiste »
   * sur la fiche peut devenir « J.-B. » sur le compte. L'entité, elle, suit le
   * mandat et se verrouille.
   */
  function choisirCroyant(id: string | null) {
    setCroyantId(id);
    const croyant = croyants.find((c) => c.id === id);
    if (croyant) setNomComplet(`${croyant.nom} ${croyant.prenom}`.trim());
  }

  async function envoyer() {
    setEnCours(true);
    setErreur(null);

    if (compte) {
      const modification = await appelerAction(() =>
        modifierCompte({
          profileId: compte.id,
          nomComplet,
          email,
          permissions: accordees,
        }),
      );
      setEnCours(false);

      if (!modification.ok) {
        setErreur(modification.error);
        return;
      }
      toast.success('Compte modifié.');
      fermer();
      router.refresh();
      return;
    }

    const resultat = await appelerAction(() =>
      creerCompte({
        email,
        nomComplet,
        entityId: entiteEffective,
        croyantId,
        permissions: accordees,
      }),
    );
    setEnCours(false);

    if (!resultat.ok) {
      setErreur(resultat.error);
      return;
    }

    // Le pop-up des identifiants s'ouvre APRÈS la fermeture de celui-ci : deux
    // fenêtres empilées cacheraient la seule information qu'on ne reverra pas.
    const identifiants = { ...resultat.data, nomComplet };
    fermer();
    router.refresh();
    onOuvert(identifiants);
  }

  return (
    <>
      {/* Pilote par le parent : le declencheur est ailleurs (le menu de la carte). */}
      {!pilote && (
        <Button className="h-10" onClick={() => setOuvertInterne(true)}>
          <UserPlus className="mr-2 size-4" aria-hidden />
          Ouvrir un compte
        </Button>
      )}

      <Dialog open={ouvert} onOpenChange={(v) => (v ? setOuvertInterne(true) : fermer())}>
        <DialogContent className="max-h-[92vh] w-[min(96vw,64rem)] overflow-y-auto sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {edition ? `Modifier le compte de ${compte.nomComplet}` : 'Ouvrir un compte'}
            </DialogTitle>
            <DialogDescription>
              {edition
                ? 'Le nom, l’adresse et les habilitations se corrigent ici. Le rattachement, non : il décide du périmètre et porte le matricule de connexion.'
                : 'Le compte est créé immédiatement. Ses identifiants s’affichent ensuite, une seule fois, pour être remis à son détenteur — aucun courriel n’est envoyé.'}
            </DialogDescription>
          </DialogHeader>

          {/*
            DEUX ÉTAPES, MÊME FRISE QUE L'ENREGISTREMENT D'UN CROYANT.

            Les deux questions ne se répondent pas ensemble : on identifie
            quelqu'un, PUIS on décide de ce qu'il pourra faire. Côte à côte,
            la seconde se remplissait sans être lue — or c'est elle qui ouvre
            l'accès aux données nominatives et financières.

            Les étapes sont CLIQUABLES dès que la première est valide : revenir
            corriger un nom ne doit pas obliger à refaire le chemin.
          */}
          <FriseEtapes
            etapes={ETAPES}
            courante={etape}
            onAller={premiereValide ? setEtape : undefined}
          />

          {erreur && (
            <Alert variant="destructive" role="alert">
              <AlertCircle className="size-4" aria-hidden />
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}

          <div className="py-2">
            {/* --- 1. Qui ------------------------------------------------ */}
            <div className={cn('space-y-6', etape === 0 ? 'block' : 'hidden')}>
              {/* En modification, le rattachement ne bouge pas : le sélecteur
                  n'aurait rien à proposer, et l'afficher inviterait à un geste
                  que l'action refuse. */}
              {!edition && (
              <Field
                label="Croyant rattaché"
                required
                hint="Seuls les membres d’un bureau en cours peuvent recevoir un compte. C’est lui qui porte le matricule de connexion."
              >
                {(aria) => (
                  <CroyantPicker
                    {...aria}
                    options={croyants.map((c) => ({
                      id: c.id,
                      nom: c.nom,
                      prenom: c.prenom,
                      matricule: c.matricule,
                      photoKey: c.photo_key,
                      // Sous le nom : où il siège, et à quel titre.
                      detail: [c.entite?.nom, c.fonction].filter(Boolean).join(' · '),
                    }))}
                    value={croyantId}
                    onChange={choisirCroyant}
                    photos={photos}
                    placeholder="Rechercher par nom ou par matricule…"
                    emptyMessage="Aucun membre de bureau sans compte dans votre périmètre."
                  />
                )}
              </Field>
              )}

              <TextField
                label="Nom complet"
                required
                placeholder="RAKOTO Jean"
                hint="Amorcé depuis la fiche, modifiable."
                value={nomComplet}
                onChange={(e) => setNomComplet(e.target.value)}
              />

              <TextField
                label="Adresse e-mail"
                type="email"
                hint="Facultative. Sans elle, l’identifiant est composé à partir du matricule — la connexion se fait alors par matricule."
                placeholder="prenom.nom@exemple.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              {/*
                LE MÊME SÉLECTEUR, VERROUILLÉ — pas un champ texte à sa place.

                Il porte le BADGE DE TYPE et le code de l'entité (« Église ·
                ALASORA · EGL-0005 ») : c'est ce qui distingue deux entités de
                même nom, et le remplacer par du texte brut aurait fait perdre
                cette lecture au moment précis où l'on vérifie sur quoi porte le
                compte. Désactivé, il reste identique — il ne s'ouvre plus.
              */}
              <Field
                label="Entité de rattachement"
                required
                hint={
                  entiteVerrouillee
                    ? croyantChoisi
                      ? 'Celle où siège ce croyant : le compte sert le mandat qu’il exerce.'
                      : 'La seule entité où vous puissiez ouvrir un compte.'
                    : 'Elle définit le périmètre du compte : son entité et tout son sous-arbre (RG-20).'
                }
              >
                {(aria) => (
                  <EntityPicker
                    {...aria}
                    options={entites}
                    value={entiteEffective}
                    onChange={setEntityId}
                    disabled={entiteVerrouillee}
                    placeholder="Choisir l'entité"
                    emptyMessage="Aucune entité où vous puissiez ouvrir un compte."
                  />
                )}
              </Field>
            </div>

            {/* --- 2. Ce qu'il aura le droit de faire --------------------- */}
            <div className={cn('space-y-4', etape === 1 ? 'block' : 'hidden')}>
              <p className="text-xs text-muted-foreground">
                Rien n’est accordé par défaut. Chaque droit vaut pour{' '}
                {nomEntite ? <strong>{nomEntite}</strong> : 'l’entité choisie'} et tout ce
                qu’elle contient ; une portée plus fine se règle ensuite.
              </p>

              <SelecteurHabilitations
                accordees={accordees}
                delegables={delegables}
                profils={raccourcis}
                onRemplacer={setAccordees}
                onBasculer={(permission, cochee) =>
                  setAccordees((actuelles) =>
                    cochee
                      ? [...actuelles, permission]
                      : actuelles.filter((p) => p !== permission),
                  )
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="h-10" onClick={fermer} disabled={enCours}>
              Annuler
            </Button>

            {etape === 0 ? (
              <Button
                className="h-10"
                onClick={() => setEtape(1)}
                disabled={!premiereValide}
              >
                Continuer
                <ArrowRight className="ml-2 size-4" aria-hidden />
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() => setEtape(0)}
                  disabled={enCours}
                >
                  <ArrowLeft className="mr-2 size-4" aria-hidden />
                  Retour
                </Button>
                <Button className="h-10" onClick={envoyer} disabled={enCours}>
                  {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
                  {edition ? 'Enregistrer' : 'Ouvrir le compte'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
