'use client';

import { AlertCircle, Loader2, Mail, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Field, TextField } from '@/components/shared/field';
import { EditeurRiche } from '@/components/shared/editeur-riche';
import { avertir } from '@/components/shared/messages';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  enregistrerModeleCourriel,
  reglerCourriel,
  testerCourriel,
} from '@/lib/actions/courriel';
import type { ConfigurationCourriel, ModeleCourriel } from '@/lib/data/courriel';
import { appelerAction } from '@/lib/utils/appeler-action';

/**
 * Configuration d'envoi et modèles de message — EF-ADM-13.
 *
 * RIEN N'ENVOIE ENCORE, ET L'ÉCRAN LE DIT. Préparer la configuration avant que
 * l'envoi n'en dépende est exactement l'intérêt : un port faux découvert le
 * jour où l'on active les notifications, c'est découvrir que personne n'a rien
 * reçu. Laisser croire que ça marche déjà serait pire que de ne rien proposer.
 *
 * LE MOT DE PASSE N'A PAS DE CHAMP, et son absence est expliquée. Il vit dans
 * la configuration du serveur, pas en base : un secret rangé dans une table
 * finit dans une sauvegarde, un export, un journal de requêtes.
 */
export function ReglagesCourriel({
  configuration,
  modeles,
}: {
  configuration: ConfigurationCourriel;
  modeles: ModeleCourriel[];
}) {
  const router = useRouter();

  const [v, setV] = useState({
    actif: configuration.actif,
    hote: configuration.hote ?? '',
    port: String(configuration.port ?? 587),
    securite: configuration.securite,
    utilisateur: configuration.utilisateur ?? '',
    expediteurNom: configuration.expediteur_nom ?? '',
    expediteurEmail: configuration.expediteur_email ?? '',
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [destinataire, setDestinataire] = useState('');
  const [enEssai, setEnEssai] = useState(false);

  function poser(modif: Partial<typeof v>) {
    setV((actuels) => ({ ...actuels, ...modif }));
  }

  async function tester() {
    setEnEssai(true);
    setErreur(null);

    const resultat = await appelerAction(() => testerCourriel({ ...v, destinataire }));
    setEnEssai(false);

    if (!resultat.ok) {
      // Le motif d'un échec d'envoi porte la réponse du serveur — « 535
      // Authentication failed ». Une notification de quatre secondes la ferait
      // disparaître avant la deuxième ligne (règle 30).
      avertir(resultat.error);
      return;
    }
    toast.success(resultat.data.message);
  }

  async function enregistrer() {
    setEnCours(true);
    setErreur(null);

    const resultat = await appelerAction(() => reglerCourriel(v));
    setEnCours(false);

    if (!resultat.ok) {
      setErreur(resultat.error);
      return;
    }
    toast.success('Configuration enregistrée.');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-6 p-6">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Serveur d’envoi</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Par où les messages partiront, le jour où l’application en enverra.
            </p>
          </div>

          {erreur && (
            <Alert variant="destructive" role="alert">
              <AlertCircle className="size-4" aria-hidden />
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}

          {/* Dire que rien ne part encore, là où on configure : sans cette
              ligne, on attendrait des messages qui ne viendraient jamais. */}
          <Alert>
            <Mail className="size-4" aria-hidden />
            <AlertDescription>
              Aucun message n’est encore envoyé par l’application. Cette configuration se
              prépare et se vérifie dès maintenant, pour que l’activation ne soit plus
              qu’un interrupteur.
            </AlertDescription>
          </Alert>

          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-border p-4">
            <span className="space-y-1">
              <span className="block text-sm font-medium text-foreground">
                Envoi activé
              </span>
              <span className="block text-xs text-muted-foreground">
                Demande au moins un serveur et une adresse d’expédition.
              </span>
            </span>
            <Switch
              checked={v.actif}
              onCheckedChange={(c) => poser({ actif: c === true })}
              aria-label="Envoi activé"
              className="mt-0.5"
            />
          </label>

          <div className="grid gap-6 sm:grid-cols-2">
            <TextField
              label="Serveur (hôte)"
              placeholder="smtp.exemple.org"
              value={v.hote}
              onChange={(e) => poser({ hote: e.target.value })}
            />
            <TextField
              label="Port"
              type="number"
              className="tabular-nums"
              hint="587 avec STARTTLS, 465 avec TLS."
              value={v.port}
              onChange={(e) => poser({ port: e.target.value })}
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Sécurité" hint="Comment la connexion est chiffrée.">
              {(aria) => (
                <Select
                  value={v.securite}
                  onValueChange={(s) => poser({ securite: s as typeof v.securite })}
                >
                  <SelectTrigger {...aria} className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STARTTLS">STARTTLS</SelectItem>
                    <SelectItem value="TLS">TLS</SelectItem>
                    <SelectItem value="AUCUNE">Aucune</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>

            <TextField
              label="Nom d’utilisateur"
              placeholder="synod@exemple.org"
              value={v.utilisateur}
              onChange={(e) => poser({ utilisateur: e.target.value })}
            />
          </div>

          {/*
            L'ABSENCE DE CHAMP « MOT DE PASSE » SE DIT.

            Sans cette explication, on chercherait le champ, on croirait à un
            oubli, et quelqu'un finirait par le ranger dans « nom
            d'utilisateur ».
          */}
          <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <strong>Le mot de passe ne se saisit pas ici.</strong> Il se pose dans la
            configuration du serveur, sous le nom <code>SMTP_PASS</code> : un secret
            enregistré en base se retrouverait dans les sauvegardes et les exports.
          </p>

          <div className="grid gap-6 sm:grid-cols-2">
            <TextField
              label="Nom de l’expéditeur"
              hint="Ce que le destinataire lira dans « De : »."
              placeholder="SYNOD"
              value={v.expediteurNom}
              onChange={(e) => poser({ expediteurNom: e.target.value })}
            />
            <TextField
              label="Adresse d’expédition"
              type="email"
              placeholder="ne-pas-repondre@exemple.org"
              value={v.expediteurEmail}
              onChange={(e) => poser({ expediteurEmail: e.target.value })}
            />
          </div>

          {/*
            L'ESSAI EST LA SEULE FAÇON DE SAVOIR.

            Un serveur, un port et un mot de passe n'ont aucune apparence de
            justesse : ils sont plausibles ou faux, et rien ne les distingue
            avant qu'un message ne parte. Le découvrir le jour du premier envoi
            réel, c'est le découvrir quand personne n'a rien reçu.

            On teste CE QUI EST À L'ÉCRAN, pas ce qui est enregistré : essayer
            avant d'enregistrer est justement l'usage.
          */}
          <div className="space-y-3 rounded-md border border-border p-4">
            <p className="text-sm font-medium text-foreground">Essayer la configuration</p>

            <div className="flex flex-wrap items-end gap-4">
              <TextField
                label="Envoyer un message de test à"
                type="email"
                className="min-w-64"
                placeholder="vous@exemple.org"
                value={destinataire}
                onChange={(e) => setDestinataire(e.target.value)}
              />
              <Button
                variant="outline"
                className="h-10"
                onClick={tester}
                disabled={enEssai || !destinataire.includes('@')}
              >
                {enEssai ? (
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="mr-2 size-4" aria-hidden />
                )}
                Envoyer le test
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Le message part avec les valeurs affichées ci-dessus, sans qu’il soit
              nécessaire de les enregistrer. Réussi ou non, l’essai est consigné dans le
              journal.
            </p>
          </div>

          <div className="flex justify-end">
            <Button className="h-10" onClick={enregistrer} disabled={enCours}>
              {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              Enregistrer la configuration
            </Button>
          </div>
        </CardContent>
      </Card>

      {modeles.map((modele) => (
        <ModeleCard key={modele.cle} modele={modele} />
      ))}
    </div>
  );
}

/**
 * Un modèle se règle SEUL, avec son propre bouton.
 *
 * Trois modèles derrière un seul enregistrement obligeraient à relire les trois
 * pour vérifier ce qu'on vient de changer — et un refus sur l'un ferait perdre
 * les deux autres.
 */
function ModeleCard({ modele }: { modele: ModeleCourriel }) {
  const router = useRouter();

  const [sujet, setSujet] = useState(modele.sujet);
  const [corps, setCorps] = useState(modele.corps);
  const [actif, setActif] = useState(modele.actif);
  const [enCours, setEnCours] = useState(false);

  const modifie = sujet !== modele.sujet || corps !== modele.corps || actif !== modele.actif;

  async function enregistrer() {
    setEnCours(true);
    const resultat = await appelerAction(() =>
      enregistrerModeleCourriel({ cle: modele.cle, sujet, corps, actif }),
    );
    setEnCours(false);

    if (!resultat.ok) {
      // Le refus passe par le pop-up de messages : une notification de quatre
      // secondes ferait disparaitre le motif avant la deuxieme ligne (regle 30).
      avertir(resultat.error);
      return;
    }
    toast.success('Modèle enregistré.');
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{modele.libelle}</h2>
            {modele.description && (
              <p className="mt-1 text-xs text-muted-foreground">{modele.description}</p>
            )}
          </div>
          <Switch
            checked={actif}
            onCheckedChange={(c) => setActif(c === true)}
            aria-label={`Modèle « ${modele.libelle} » actif`}
            className="mt-0.5 shrink-0"
          />
        </div>

        <TextField
          label="Sujet"
          value={sujet}
          onChange={(e) => setSujet(e.target.value)}
        />

        <Field
          label="Corps du message"
          hint="Les champs entre doubles accolades sont remplacés à l’envoi : {{nom}}, {{organisation}}, {{lien}}…"
        >
          {(aria) => (
            <EditeurRiche
              {...aria}
              valeur={corps}
              onChange={setCorps}
            />
          )}
        </Field>

        <div className="flex justify-end">
          <Button
            variant="outline"
            className="h-10"
            onClick={enregistrer}
            // Un bouton actif sur un formulaire inchangé invite à cliquer pour
            // rien, et laisse douter que le clic précédent ait abouti.
            disabled={enCours || !modifie}
          >
            {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Enregistrer ce modèle
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
