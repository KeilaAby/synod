'use client';

import { Bold, Italic, List, Underline } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Éditeur de texte enrichi — ENF-UTI-03.
 *
 * ÉCRIT À LA MAIN, ET C'EST UN CHOIX (règle 29). Les bibliothèques d'édition
 * pèsent de trois cents kilooctets à un mégaoctet, imposent leur propre modèle
 * de document et produisent un balisage qu'il faudrait ensuite ramener à ce que
 * `sanitizeTexteRiche` accepte. Ici, quatre boutons suffisent — et le projet a
 * déjà payé une fois le prix d'une dépendance de mise en forme ajoutée sans
 * examen.
 *
 * LA BARRE D'OUTILS EST CALQUÉE SUR LA LISTE BLANCHE DU SERVEUR. Gras, italique,
 * souligné, listes, paragraphes : exactement les balises que le nettoyage
 * conserve. Proposer un titre ou une couleur produirait un balisage que le
 * serveur effacerait en silence — l'utilisateur mettrait en forme, et
 * retrouverait son texte nu.
 *
 * `execCommand` EST DÉPRÉCIÉ ET UNIVERSELLEMENT SUPPORTÉ. Son remplaçant
 * n'existe pas : aucune norme ne le remplace, et tous les navigateurs
 * l'implémentent encore. Le réécrire à partir des Sélections demanderait de
 * gérer soi-même le collage, l'annulation et les listes imbriquées — pour un
 * champ qui sert à rédiger trois modèles de message.
 */
export function EditeurRiche({
  valeur,
  onChange,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  className,
}: {
  valeur: string;
  onChange: (html: string) => void;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  className?: string;
}) {
  const zone = useRef<HTMLDivElement>(null);

  /**
   * LE CONTENU N'EST POSÉ QUE S'IL A CHANGÉ AILLEURS.
   *
   * Réécrire `innerHTML` à chaque frappe replacerait le curseur au début du
   * texte — le défaut classique d'un champ enrichi contrôlé. On compare donc
   * avant d'écrire : la frappe passe, un changement venu d'ailleurs est repris.
   */
  useEffect(() => {
    const element = zone.current;
    if (element && element.innerHTML !== valeur) element.innerHTML = valeur;
  }, [valeur]);

  function commander(commande: string) {
    // Le focus DOIT revenir dans la zone avant la commande : cliquer un bouton
    // le lui a pris, et la mise en forme s'appliquerait alors à rien.
    zone.current?.focus();
    document.execCommand(commande);
    if (zone.current) onChange(zone.current.innerHTML);
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-input focus-within:border-ring',
        className,
      )}
    >
      <div
        role="toolbar"
        aria-label="Mise en forme"
        className="flex items-center gap-1 border-b border-border bg-muted/40 p-1"
      >
        <Outil icone={Bold} libelle="Gras" onClick={() => commander('bold')} />
        <Outil icone={Italic} libelle="Italique" onClick={() => commander('italic')} />
        <Outil icone={Underline} libelle="Souligné" onClick={() => commander('underline')} />
        <Outil
          icone={List}
          libelle="Liste à puces"
          onClick={() => commander('insertUnorderedList')}
        />
      </div>

      <div
        ref={zone}
        id={id}
        role="textbox"
        aria-multiline
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        /**
         * LE COLLAGE ARRIVE EN TEXTE BRUT.
         *
         * Coller depuis un traitement de texte apporte sinon des dizaines
         * d'attributs de style que le serveur effacerait — l'utilisateur verrait
         * sa mise en forme à l'écran, puis disparaître à l'enregistrement.
         */
        onPaste={(e) => {
          e.preventDefault();
          const texte = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, texte);
        }}
        className="min-h-40 px-3 py-2 text-sm outline-none [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2"
      />
    </div>
  );
}

function Outil({
  icone: Icone,
  libelle,
  onClick,
}: {
  icone: typeof Bold;
  libelle: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={libelle}
      title={libelle}
      // `onMouseDown` et non `onClick` : le clic ferait perdre la sélection
      // avant que la commande ne s'applique.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      <Icone className="size-4" aria-hidden />
    </Button>
  );
}
