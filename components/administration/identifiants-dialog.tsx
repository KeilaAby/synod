'use client';

import { Check, Copy, Printer } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Les identifiants, montrés UNE SEULE FOIS — EF-ADM-01, EF-ADM-08.
 *
 * CE POP-UP EST LE SEUL ENDROIT OÙ CE MOT DE PASSE EXISTERA. Il n'est stocké
 * nulle part en clair — ni en base, ni dans le journal d'audit —, et le serveur
 * lui-même ne peut plus le relire : il l'a transmis au fournisseur
 * d'identité, qui n'en garde qu'une empreinte. Fermer cette fenêtre sans l'avoir
 * noté oblige à en générer un autre.
 *
 * IL LE DIT AVANT DE SE FERMER. Un avertissement après coup ne sert à rien ;
 * celui-ci est au-dessus du bouton, là où le regard passe en dernier.
 *
 * TROIS FAÇONS DE L'EMPORTER, parce que trois situations : **copier** quand on
 * va l'envoyer par un canal qu'on maîtrise, **imprimer** quand on le remet en
 * main propre, et **le lire** quand on l'a au téléphone — d'où les groupes de
 * cinq et l'absence de caractères ambigus.
 */
export function IdentifiantsDialog({
  identifiants,
  onFermer,
}: {
  /** `null` : rien à montrer, le pop-up reste fermé. */
  identifiants: { email: string; motDePasse: string; nomComplet: string } | null;
  onFermer: () => void;
}) {
  const [copie, setCopie] = useState(false);

  async function copier() {
    if (!identifiants) return;

    const texte = [
      `Identifiant : ${identifiants.email}`,
      `Mot de passe provisoire : ${identifiants.motDePasse}`,
      'À changer à la première connexion.',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      // Le retour à l'état initial permet de recopier : un bouton qui reste
      // « Copié » laisse croire qu'il ne fonctionne plus.
      setTimeout(() => setCopie(false), 2000);
    } catch {
      // `clipboard` échoue hors contexte sécurisé ou sans autorisation. Le mot
      // de passe reste lisible à l'écran : rien n'est perdu, on se tait.
    }
  }

  return (
    <Dialog
      open={identifiants !== null}
      onOpenChange={(ouvert) => !ouvert && onFermer()}
    >
      <DialogContent className="w-[min(96vw,32rem)] sm:max-w-lg" data-identifiants>
        <DialogHeader className="no-print">
          <DialogTitle>Compte ouvert</DialogTitle>
          <DialogDescription>
            Remettez ces identifiants à {identifiants?.nomComplet}. Ils ne seront plus
            affichés.
          </DialogDescription>
        </DialogHeader>

        {identifiants && (
          <div className="space-y-4">
            <Ligne libelle="Identifiant" valeur={identifiants.email} />
            <Ligne libelle="Mot de passe provisoire" valeur={identifiants.motDePasse} accentue />

            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <strong>Notez-le maintenant.</strong> Ce mot de passe n’est enregistré nulle
              part : une fois cette fenêtre fermée, il faudra en générer un autre. Son
              détenteur devra le changer à la première connexion.
            </p>
          </div>
        )}

        <DialogFooter className="no-print">
          <Button variant="outline" className="h-10" onClick={copier}>
            {copie ? (
              <Check className="mr-2 size-4" aria-hidden />
            ) : (
              <Copy className="mr-2 size-4" aria-hidden />
            )}
            {copie ? 'Copié' : 'Copier'}
          </Button>

          <Button variant="outline" className="h-10" onClick={() => window.print()}>
            <Printer className="mr-2 size-4" aria-hidden />
            Imprimer
          </Button>

          <Button className="h-10" onClick={onFermer}>
            J’ai noté les identifiants
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * `font-mono` est ICI à sa place (règle 5, amendée le 13 août) : ce sont des
 * identifiants qu'on recopie caractère par caractère, pas des chiffres qu'on
 * aligne en colonne. Un `l` et un `1` doivent s'y distinguer.
 */
function Ligne({
  libelle,
  valeur,
  accentue = false,
}: {
  libelle: string;
  valeur: string;
  accentue?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{libelle}</p>
      <p
        className={
          accentue
            ? 'rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-lg font-semibold tracking-wide text-foreground'
            : 'rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground'
        }
      >
        {valeur}
      </p>
    </div>
  );
}
