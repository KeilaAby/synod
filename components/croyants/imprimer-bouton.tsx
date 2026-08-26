'use client';

import { FileText, History, Loader2, Printer, Wallet } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  type ContenuImpression,
  type PorteeImpression,
  imprimerFicheCroyant,
} from './imprimer-fiche';

/**
 * Imprimer la fiche d'un croyant — EF-CRO-06, EF-FIN-35.
 *
 * TROIS CHOIX, ET CHACUN DIT CE QU'IL PRODUIT.
 *
 * Trois entrées nommées « Fiche », « Dîmes », « Historique » obligeraient à
 * essayer les trois pour savoir laquelle sort le bon papier — et l'essai coûte
 * une impression. La description n'est donc pas décorative : c'est elle qui
 * évite le geste inutile, et elle nomme le DESTINATAIRE, pas le contenu
 * technique. « Ce qu'on remet au croyant » se décide sans réfléchir ; « les
 * versements de dîme » demande de se demander à quoi ça sert.
 *
 * POURQUOI TROIS DOCUMENTS ET NON UN SEUL. Tout imprimer d'un coup obligerait à
 * découper, ou à remettre à un croyant des informations qu'il n'a pas
 * demandées — son grade, son statut, sa cellule. Le relevé de dîme se remet en
 * main propre ; la fiche se joint à un dossier ; l'historique se produit quand
 * une entité supérieure demande à retracer une situation.
 */

const CHOIX: readonly {
  portee: PorteeImpression;
  libelle: string;
  description: string;
  icone: typeof FileText;
}[] = [
  {
    portee: 'FICHE',
    libelle: 'La fiche seulement',
    description: 'État civil, coordonnées et rattachement. À joindre à un dossier.',
    icone: FileText,
  },
  {
    portee: 'DIMES',
    libelle: 'Les dîmes seulement',
    description:
      'Le relevé des versements, avec leur total. À remettre au croyant qui le demande.',
    icone: Wallet,
  },
  {
    portee: 'HISTORIQUE',
    libelle: 'L’historique seulement',
    description: 'Le parcours : baptême, transferts, mandats, changements de grade.',
    icone: History,
  },
];

export function ImprimerBouton({ contenu }: { contenu: ContenuImpression }) {
  const [enCours, setEnCours] = useState(false);

  async function imprimer(portee: PorteeImpression) {
    setEnCours(true);
    try {
      await imprimerFicheCroyant(portee, contenu);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-10" disabled={enCours}>
          {enCours ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          ) : (
            <Printer className="mr-2 size-4" aria-hidden />
          )}
          Imprimer
        </Button>
      </DropdownMenuTrigger>

      {/*
        LARGE ET NON `w-auto` : les descriptions se replient sur deux lignes, et
        un menu qui épouse le texte le plus long ferait une colonne de 40 cm.
      */}
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          Chaque document porte le portrait, le nom et l’église.
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {CHOIX.map(({ portee, libelle, description, icone: Icone }) => (
          <DropdownMenuItem
            key={portee}
            onSelect={() => void imprimer(portee)}
            className="flex items-start gap-3 py-2.5"
          >
            <Icone className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{libelle}</span>
              {/*
                `whitespace-normal` : les entrées de menu ne replient pas leur
                texte par défaut, et la description sortirait du cadre.
              */}
              <span className="text-muted-foreground text-xs whitespace-normal">
                {description}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
