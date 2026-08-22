'use client';

import { AlertCircle, Columns2, Loader2, Rows3 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import { Field, TextField } from '@/components/shared/field';
import { FiltreIcone, GroupeFiltres } from '@/components/shared/filtre-icone';
import { LogoUploader } from '@/components/shared/logo-uploader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  reglerParametres,
  supprimerLogoOrganisation,
  televerserLogoOrganisation,
} from '@/lib/actions/parametres';
import {
  COULEUR_PRIMAIRE_DEFAUT,
  DUREE_TOAST_MAX,
  DUREE_TOAST_MIN,
  LIBELLES_POSITION_TOAST,
  POSITIONS_TOAST,
  POSITION_TOAST_DEFAUT,
  estCouleurHex,
  estPositionToast,
  texteSurCouleur,
} from '@/lib/domain/apparence';
import type { Parametres } from '@/lib/data/settings';
import { appelerAction } from '@/lib/utils/appeler-action';
import { cn } from '@/lib/utils';
import { FUSEAUX, type ParametresInput } from '@/lib/validation/parametres';

/**
 * EF-ADM-13 — l'écran unique des options configurables.
 *
 * CE QUI ÉTAIT ÉPARPILLÉ EST ICI. Le réglage de composition des rapports vivait
 * dans un pop-up de `/rapports` ; la devise, le fuseau et la fenêtre des
 * nouveaux baptisés n'avaient aucun écran du tout — ils se posaient en SQL. Un
 * paramètre qu'on ne sait pas où changer est un paramètre qui ne change jamais,
 * et le défaut devient la règle sans que personne ne l'ait décidé.
 *
 * LES OPTIONS SONT GROUPÉES PAR CE QU'ELLES COMMANDENT, pas par leur type. Un
 * écran qui alignerait d'abord les cases à cocher puis les champs texte
 * obligerait à parcourir tout pour trouver « le workflow financier ».
 *
 * UN SEUL ENREGISTREMENT pour tout l'écran : ces réglages se relisent ensemble,
 * ils se posent ensemble. Un bouton par ligne aurait multiplié les
 * allers-retours et laissé la moitié de l'écran en attente de l'autre.
 */
/**
 * L'affichage en une ou deux colonnes se RETIENT.
 *
 * C'est une préférence de confort, pas un réglage de l'organisation : elle n'a
 * rien à faire en base. `localStorage` est un système externe à React — on s'y
 * abonne plutôt que d'en recopier l'état par un effet, qui déclencherait une
 * cascade de rendus.
 */
const CLE_COLONNES = 'synod:parametres-colonnes';

let colonnesEnMemoire: 1 | 2 | null = null;
const abonnesColonnes = new Set<() => void>();

function abonnerColonnes(callback: () => void) {
  abonnesColonnes.add(callback);
  window.addEventListener('storage', callback);
  return () => {
    abonnesColonnes.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

function lireColonnes(): 1 | 2 {
  colonnesEnMemoire ??= window.localStorage.getItem(CLE_COLONNES) === '2' ? 2 : 1;
  return colonnesEnMemoire;
}

function ecrireColonnes(valeur: 1 | 2) {
  colonnesEnMemoire = valeur;
  window.localStorage.setItem(CLE_COLONNES, String(valeur));
  for (const notifier of abonnesColonnes) notifier();
}

export function ParametresClient({
  parametres,
  logoUrl,
}: {
  parametres: Parametres;
  /** URL signée courante, ou `null` : la base ne stocke que la clé (règle 11). */
  logoUrl: string | null;
}) {
  const router = useRouter();

  /** Le serveur rend toujours une colonne : aucune divergence à l'hydratation. */
  const colonnes = useSyncExternalStore(abonnerColonnes, lireColonnes, () => 1 as const);

  const [valeurs, setValeurs] = useState<ParametresInput>({
    nomOrganisation: parametres.nom_organisation,
    devise: parametres.devise,
    fuseauHoraire: parametres.fuseau_horaire as ParametresInput['fuseauHoraire'],
    fenetreNouveauxBaptisesJours: parametres.fenetre_nouveaux_baptises_jours,
    financeValidationActive: parametres.finance_validation_active,
    separationSaisieValidation: parametres.separation_saisie_validation,
    transfertAutoApprobationInterne: parametres.transfert_auto_approbation_interne,
    promotionGradeValidation: parametres.promotion_grade_validation,
    rapportCompositionLibre: parametres.rapport_composition_libre,
    reinitialisationParEmail: parametres.reinitialisation_par_email,
    couleurPrimaire: parametres.couleur_primaire,
    toastDureeMs: parametres.toast_duree_ms,
    toastBoutonFermer: parametres.toast_bouton_fermer,
    toastCouleursVives: parametres.toast_couleurs_vives,
    toastPosition: estPositionToast(parametres.toast_position)
      ? parametres.toast_position
      : POSITION_TOAST_DEFAUT,
    joursCorrectionSaisie: parametres.jours_correction_saisie,
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  function poser(modif: Partial<ParametresInput>) {
    setValeurs((actuelles) => ({ ...actuelles, ...modif }));
  }

  async function enregistrer() {
    setEnCours(true);
    setErreur(null);

    const resultat = await appelerAction(() => reglerParametres(valeurs));
    setEnCours(false);

    if (!resultat.ok) {
      setErreur(resultat.error);
      return;
    }
    toast.success('Paramètres enregistrés.');
    router.refresh();
  }

  return (
    <div className={'space-y-6'}>
      {erreur && (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      {/*
        UNE OU DEUX COLONNES — deux façons de lire le même écran.

        Sur une colonne, on descend et on lit tout : c'est ce qu'on veut la
        première fois, ou quand on cherche un réglage sans savoir où il est.
        Sur deux, tout tient sous les yeux d'un coup : c'est ce qu'on veut quand
        on sait ce qu'on vient changer et qu'on veut vérifier le reste au
        passage.

        Le contrôle est un groupe de pictogrammes : l'ensemble est CLOS et
        connu — une ou deux (règle 18).
      */}
      <div className="flex justify-end">
        <GroupeFiltres libelle="Disposition des réglages">
          <FiltreIcone
            icone={Rows3}
            libelle="Une colonne"
            actif={colonnes === 1}
            onClick={() => ecrireColonnes(1)}
          />
          <FiltreIcone
            icone={Columns2}
            libelle="Deux colonnes"
            actif={colonnes === 2}
            onClick={() => ecrireColonnes(2)}
          />
        </GroupeFiltres>
      </div>

      <div
        className={cn(
          'gap-6',
          // Classes LITTÉRALES : Tailwind lit le source, une classe construite
          // n'existerait dans aucune feuille.
          colonnes === 2 ? 'grid lg:grid-cols-2 lg:items-start' : 'flex flex-col',
        )}
      >
        <Groupe
          titre="Identité"
          description="Ce qui nomme l’organisation dans l’application et sur les documents imprimés."
        >
          <TextField
            label="Nom de l’organisation"
            required
            value={valeurs.nomOrganisation}
            onChange={(e) => poser({ nomOrganisation: e.target.value })}
          />

          {/*
            EF-RAP-02 — LE LOGO SERT DE SOURCE PAR DÉFAUT AU BLOC IMAGE DES
            RAPPORTS. Posé en schéma depuis la migration `0006`, resté sans
            écran jusqu'à aujourd'hui. Envoi immédiat, hors du grand
            formulaire (même geste que le logo de l'attestation) : c'est un
            fichier, pas un champ texte à regrouper dans `reglerParametres`.
          */}
          <LogoUploader
            logoUrl={logoUrl}
            onUpload={televerserLogoOrganisation}
            onRemove={supprimerLogoOrganisation}
            hint="Utilisé comme logo par défaut du bloc Image des rapports (EF-RAP-02)."
            removeDescription="Un rapport avec un bloc Image dira désormais qu'aucun logo n'est réglé. Le fichier est définitivement supprimé du stockage."
          />

          <div className="grid gap-6 sm:grid-cols-2">
            <TextField
              label="Devise"
              required
              hint="Code sur trois lettres. ARB-7 : une seule devise pour toute l’organisation."
              className="uppercase"
              maxLength={3}
              value={valeurs.devise}
              onChange={(e) => poser({ devise: e.target.value.toUpperCase() })}
            />

            <Field
              label="Fuseau horaire"
              hint="Sert à l’affichage des horodatages. Les dates métier n’en dépendent pas."
            >
              {(aria) => (
                <Select
                  value={valeurs.fuseauHoraire}
                  onValueChange={(v) =>
                    poser({ fuseauHoraire: v as ParametresInput['fuseauHoraire'] })
                  }
                >
                  <SelectTrigger {...aria} className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FUSEAUX.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>
        </Groupe>

        <Groupe
          titre="Corrections de saisie"
          description="Le délai pendant lequel une saisie récente se corrige sans laisser de trace, plutôt que de s’inscrire comme une décision."
        >
          {/*
            EF-BUR-08, EF-CRO-12 — UN SEUL REGLAGE POUR DEUX GESTES.

            Retirer un titulaire de bureau et corriger un grade pose par
            erreur suivaient la MEME regle, ecrite a deux endroits avec sa
            propre constante a 15 jours. La meme regle a deux endroits ne
            diverge pas le jour ou on l'ecrit — elle diverge le jour ou l'un
            des deux est retouche sans l'autre.
          */}
          <TextField
            label="Délai de correction"
            required
            type="number"
            min={1}
            max={365}
            className="tabular-nums"
            hint="En jours, depuis l’ENREGISTREMENT — pas depuis le début du mandat ou du grade. Passé ce délai, retirer un titulaire ou corriger un grade devient une décision motivée plutôt qu’un effacement."
            value={String(valeurs.joursCorrectionSaisie)}
            onChange={(e) => poser({ joursCorrectionSaisie: e.target.value })}
          />
        </Groupe>

        <Groupe
          titre="Finances"
          description="Le défaut de l’organisation. Chaque entité peut s’en écarter depuis l’écran des finances — aucun héritage depuis le parent."
        >
          <Bascule
            coche={valeurs.financeValidationActive}
            onBascule={(v) => poser({ financeValidationActive: v })}
            titre="Workflow de validation"
            texte="Un mouvement passe par Brouillon → Soumis → Validé. Désactivé, il est acquis dès la saisie."
          />
          <Bascule
            coche={valeurs.separationSaisieValidation}
            onBascule={(v) => poser({ separationSaisieValidation: v })}
            titre="Séparation saisie / validation"
            texte="Celui qui saisit ne valide pas son propre mouvement. Le droit finance.validate_own lève cette règle, compte par compte."
          />
        </Groupe>

        <Groupe
          titre="Croyants et transferts"
          description="Ce qui commande les listes et le circuit d’approbation."
        >
          <TextField
            label="Fenêtre « nouveaux baptisés »"
            required
            type="number"
            min={1}
            max={365}
            className="tabular-nums"
            hint="En jours. Au-delà, un baptisé cesse d’apparaître comme nouveau (RG-30)."
            value={String(valeurs.fenetreNouveauxBaptisesJours)}
            onChange={(e) => poser({ fenetreNouveauxBaptisesJours: e.target.value })}
          />

          <Bascule
            coche={valeurs.transfertAutoApprobationInterne}
            onBascule={(v) => poser({ transfertAutoApprobationInterne: v })}
            titre="Auto-approbation des transferts internes"
            texte="Un transfert entre deux églises d’une même paroisse est approuvé sans décision. Les autres passent toujours par le circuit."
          />

          {/*
            EF-CRO-12 — LE RÉGLAGE EST GLOBAL, PAS PAR ENTITÉ.

            Le workflow financier s'active entité par entité : chaque bureau
            gère ses comptes. Un grade ne se compare pas — il vaut dans TOUTE
            l'organisation. « Pasteur » doit désigner la même chose d'une église
            à l'autre, et un circuit ouvert ici, fermé là, produirait exactement
            l'inverse.
          */}
          <Bascule
            coche={valeurs.promotionGradeValidation}
            onBascule={(v) => poser({ promotionGradeValidation: v })}
            titre="Validation des promotions de grade"
            texte="Changer le grade d’un croyant devient une demande, tranchée par l’entité immédiatement supérieure. Fermé, le grade se pose directement."
          />
        </Groupe>

        <Groupe
          titre="Mots de passe"
          description="Par quel chemin un utilisateur qui a oublié le sien en obtient un nouveau."
        >
          <Bascule
            coche={valeurs.reinitialisationParEmail}
            onBascule={(v) => poser({ reinitialisationParEmail: v })}
            titre="Réinitialisation par courriel"
            texte="L’utilisateur demande lui-même, un lien lui parvient. Désactivée, il contacte le Siège ou l’administrateur de son entité, qui lui remet un mot de passe provisoire."
          />

          {/* Dire la conséquence là où elle se décide : beaucoup d'adresses sont
            de convenance — saisies une fois, jamais relevées. Un circuit qui
            aboutit dans une boîte que personne n'ouvre ne réinitialise rien. */}
          {!valeurs.reinitialisationParEmail && (
            <p className="border-border bg-muted/40 text-muted-foreground rounded-md border p-3 text-xs">
              L’écran « mot de passe oublié » cessera de proposer l’envoi et renverra vers
              un administrateur. Dans les deux cas, un mot de passe provisoire doit être{' '}
              <strong>changé à la première connexion</strong>.
            </p>
          )}
        </Groupe>

        <Groupe
          titre="Rapports"
          description="Qui, dans l’organisation, dessine les modèles de rapport."
        >
          <Bascule
            coche={valeurs.rapportCompositionLibre}
            onBascule={(v) => poser({ rapportCompositionLibre: v })}
            titre="Composition ouverte aux entités"
            texte="Chaque entité emploie les modèles du Siège ET dessine les siens. Fermée, elle se conforme à ceux du Siège — qui, lui, compose dans les deux cas."
          />
        </Groupe>

        <Groupe
          titre="Apparence"
          description="La couleur des boutons principaux, partout dans l’application."
        >
          <Field
            label="Couleur des boutons"
            hint="La couleur du texte s’en déduit : clair sur un fond sombre, foncé sur un fond clair. Elle ne se règle donc pas."
          >
            {(aria) => (
              <div className="flex items-center gap-3">
                {/*
                  Le sélecteur natif ET le champ texte, côte à côte : l'un pour
                  choisir à l'œil, l'autre pour coller une valeur de charte.
                  Ce n'est pas deux chemins (règle 16) — c'est un seul champ,
                  avec deux façons de le remplir.
                */}
                <input
                  {...aria}
                  type="color"
                  value={valeurs.couleurPrimaire}
                  onChange={(e) => poser({ couleurPrimaire: e.target.value })}
                  className="border-border size-10 shrink-0 cursor-pointer rounded-lg border bg-transparent"
                />
                <Input
                  value={valeurs.couleurPrimaire}
                  onChange={(e) => poser({ couleurPrimaire: e.target.value })}
                  maxLength={7}
                  className="h-10 w-32 font-mono"
                  aria-label="Couleur en hexadécimal"
                />

                {/*
                  L'APERÇU EST LE VRAI CONTRÔLE. Un hexadécimal ne se lit pas :
                  personne ne sait à quoi ressemble #4f46e5 avant de le voir sur
                  un bouton, avec son texte.
                */}
                <span
                  className="rounded-lg px-4 py-2 text-sm font-medium"
                  style={{
                    backgroundColor: estCouleurHex(valeurs.couleurPrimaire)
                      ? valeurs.couleurPrimaire
                      : COULEUR_PRIMAIRE_DEFAUT,
                    color: texteSurCouleur(valeurs.couleurPrimaire),
                  }}
                >
                  Enregistrer
                </span>
              </div>
            )}
          </Field>
        </Groupe>

        <Groupe
          titre="Notifications"
          description="Les messages de confirmation qui apparaissent en haut à droite."
        >
          {/*
            CE QUE CE GROUPE NE RÈGLE PAS, dit à l'utilisateur : seules les
            confirmations passent par là (règle 30). Un refus ou une panne
            s'affiche dans un pop-up qu'on ferme, et ces réglages n'y touchent
            pas — sinon on croirait pouvoir raccourcir un message d'erreur.
          */}
          <p className="text-muted-foreground border-border rounded-lg border p-3 text-xs">
            Seules les confirmations — « Croyant enregistré » — s’affichent ainsi.
            Un refus, un avertissement ou une panne apparaît dans une fenêtre que
            vous fermez : ces réglages ne la concernent pas.
          </p>

          <Field
            label="Position"
            hint="En haut à droite se trouvent le menu ⋮ des lignes et les boutons d’en-tête : une notification y recouvre ce qu’on vient de cliquer."
          >
            {(aria) => (
              <Select
                value={valeurs.toastPosition}
                onValueChange={(v) =>
                  poser({ toastPosition: v as ParametresInput['toastPosition'] })
                }
              >
                <SelectTrigger {...aria} className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITIONS_TOAST.map((p) => (
                    <SelectItem key={p} value={p}>
                      {LIBELLES_POSITION_TOAST[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field
            label="Durée d’affichage"
            hint="En deçà de deux secondes on n’a pas le temps de lire ; au-delà de vingt, les messages s’empilent."
          >
            {(aria) => (
              /*
                UN CURSEUR, ET NON UN CHAMP DE SAISIE.

                On ne connaît pas la bonne durée, on la CHERCHE : « quatre
                secondes, est-ce trop ? » ne se répond qu'en comparant. Un champ
                oblige à effacer puis retaper pour essayer la valeur voisine ;
                un curseur la donne d'un cran. Et il rend l'intervalle visible —
                les bornes n'ont plus à être expliquées, elles se voient.

                La valeur reste affichée à côté : un curseur sans nombre laisse
                deviner où l'on est, et deux personnes ne le liraient pas pareil.
              */
              <div className="flex items-center gap-4">
                <input
                  {...aria}
                  type="range"
                  min={DUREE_TOAST_MIN}
                  max={DUREE_TOAST_MAX}
                  // Par demi-seconde : le pas de la seconde est trop grossier
                  // entre 2 et 5 s, là où le réglage se joue vraiment.
                  step={500}
                  value={Number(valeurs.toastDureeMs)}
                  onChange={(e) => poser({ toastDureeMs: Number(e.target.value) })}
                  className="accent-primary h-2 w-full cursor-pointer"
                />
                <span className="text-foreground w-14 shrink-0 text-right text-sm font-medium tabular-nums">
                  {(Number(valeurs.toastDureeMs) / 1000).toFixed(1)} s
                </span>
              </div>
            )}
          </Field>

          <Bascule
            coche={valeurs.toastBoutonFermer}
            onBascule={(v) => poser({ toastBoutonFermer: v })}
            titre="Bouton de fermeture"
            texte="Une croix pour écarter le message sans attendre la fin du délai."
          />

          <Bascule
            coche={valeurs.toastCouleursVives}
            onBascule={(v) => poser({ toastCouleursVives: v })}
            titre="Fond coloré selon le cas"
            texte="Vert pour une réussite. Éteint, le message reste sobre et seul le texte distingue les cas."
          />
        </Groupe>
      </div>

      {/* Le bouton reste HORS de la grille : un seul enregistrement pour tout
          l'écran, il ne doit pas se retrouver au bas d'une colonne comme s'il
          n'engageait qu'elle. */}
      <div className="flex justify-end">
        <Button className="h-10" onClick={enregistrer} disabled={enCours}>
          {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
          Enregistrer les paramètres
        </Button>
      </div>
    </div>
  );
}

function Groupe({
  titre,
  description,
  children,
}: {
  titre: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div>
          <h2 className="text-foreground text-sm font-semibold">{titre}</h2>
          <p className="text-muted-foreground mt-1 text-xs">{description}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * Une bascule qui DIT CE QU'ELLE PRODUIT.
 *
 * « Workflow de validation ☑ » n'apprend rien à qui ne connaît pas déjà le
 * réglage — et celui qui vient le changer est précisément celui qui ne le
 * connaît pas. La phrase sous le libellé décrit l'état obtenu, pas la
 * fonctionnalité.
 */
function Bascule({
  coche,
  onBascule,
  titre,
  texte,
}: {
  coche: boolean;
  onBascule: (valeur: boolean) => void;
  titre: string;
  texte: string;
}) {
  return (
    <label className="border-border flex cursor-pointer items-start gap-3 rounded-md border p-4">
      <Checkbox
        checked={coche}
        onCheckedChange={(v) => onBascule(v === true)}
        className="mt-0.5"
      />
      <span className="space-y-1">
        <span className="text-foreground block text-sm font-medium">{titre}</span>
        <span className="text-muted-foreground block text-xs">{texte}</span>
      </span>
    </label>
  );
}
