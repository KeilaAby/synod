'use client';

import { FileText, History, Loader2, Printer, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils/format';

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
 * technique.
 *
 * LE RELEVÉ DE DÎMES DEMANDE SA PÉRIODE, les deux autres non — et l'écart est
 * voulu. Une fiche et un historique n'ont qu'un état : celui d'aujourd'hui. Un
 * relevé d'argent, lui, se demande toujours POUR une période — « qu'ai-je donné
 * cette année ? » — et sortir douze ans de versements pour répondre à cela
 * gâcherait dix feuilles.
 *
 * « TOUS » RESTE LE PREMIER CHOIX, et il est celui par défaut : c'est le cas
 * qu'on veut sans y penser, et une période obligatoire ferait saisir deux dates
 * pour un document qu'on voulait complet.
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
      'Le relevé des versements, sur la période de votre choix. À remettre au croyant.',
    icone: Wallet,
  },
  {
    portee: 'HISTORIQUE',
    libelle: 'L’historique seulement',
    description: 'Le parcours : baptême, transferts, mandats, changements de grade.',
    icone: History,
  },
];

/** Les raccourcis de période. `null` = aucune borne, donc tout. */
type Raccourci = 'TOUS' | 'ANNEE' | 'ANNEE_PRECEDENTE' | 'PERSONNALISE';

export function ImprimerBouton({ contenu }: { contenu: ContenuImpression }) {
  const [enCours, setEnCours] = useState(false);
  const [plageOuverte, setPlageOuverte] = useState(false);
  const [raccourci, setRaccourci] = useState<Raccourci>('TOUS');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');

  /**
   * LES BORNES DU CROYANT, pas celles du calendrier.
   *
   * Un sélecteur qui proposerait « 2019 » à quelqu'un dont le premier versement
   * date de 2024 ferait chercher une période vide. Les dates sont des jours
   * ISO : leur ordre lexicographique est leur ordre chronologique.
   */
  const bornes = useMemo(() => {
    const dates = contenu.versements
      .map((v) => v.date)
      .filter((d): d is string => d !== null)
      .sort();

    return { premiere: dates[0] ?? null, derniere: dates.at(-1) ?? null };
  }, [contenu.versements]);

  const annee = new Date().getFullYear();

  function bornesDuRaccourci(): { debut: string; fin: string } | null {
    switch (raccourci) {
      case 'TOUS':
        return null;
      case 'ANNEE':
        return { debut: `${annee}-01-01`, fin: `${annee}-12-31` };
      case 'ANNEE_PRECEDENTE':
        return { debut: `${annee - 1}-01-01`, fin: `${annee - 1}-12-31` };
      case 'PERSONNALISE':
        return debut && fin ? { debut, fin } : null;
    }
  }

  // Une plage à l'envers ne rendrait aucune ligne, sans dire pourquoi.
  const plageInvalide = raccourci === 'PERSONNALISE' && Boolean(debut && fin) && debut > fin;
  const pret = raccourci !== 'PERSONNALISE' || (Boolean(debut) && Boolean(fin) && !plageInvalide);

  async function lancer(portee: PorteeImpression, plage?: { debut: string; fin: string } | null) {
    setEnCours(true);
    try {
      await imprimerFicheCroyant(portee, contenu, plage ?? null);
    } finally {
      setEnCours(false);
    }
  }

  function choisir(portee: PorteeImpression) {
    // Le relevé passe par le pop-up ; les deux autres partent directement.
    if (portee === 'DIMES') setPlageOuverte(true);
    else void lancer(portee);
  }

  return (
    <>
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
          LARGE ET NON `w-auto` : les descriptions se replient sur deux lignes,
          et un menu qui épouse le texte le plus long ferait une colonne de
          quarante centimètres.
        */}
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
            Chaque document porte le portrait, le nom et l’église.
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {CHOIX.map(({ portee, libelle, description, icone: Icone }) => (
            <DropdownMenuItem
              key={portee}
              onSelect={() => choisir(portee)}
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

      <Dialog open={plageOuverte} onOpenChange={setPlageOuverte}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Période du relevé</DialogTitle>
            <DialogDescription>
              {bornes.premiere && bornes.derniere ? (
                <>
                  Versements enregistrés du {formatDate(bornes.premiere)} au{' '}
                  {formatDate(bornes.derniere)}.
                </>
              ) : (
                'Aucun versement enregistré pour ce croyant.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Choix
              actif={raccourci === 'TOUS'}
              titre="Tous les versements"
              texte="Le relevé complet, depuis le premier versement enregistré."
              onClick={() => setRaccourci('TOUS')}
            />
            <Choix
              actif={raccourci === 'ANNEE'}
              titre={`Année ${annee}`}
              texte="Du 1er janvier au 31 décembre de l’année en cours."
              onClick={() => setRaccourci('ANNEE')}
            />
            <Choix
              actif={raccourci === 'ANNEE_PRECEDENTE'}
              titre={`Année ${annee - 1}`}
              texte="L’année civile précédente, entière."
              onClick={() => setRaccourci('ANNEE_PRECEDENTE')}
            />
            <Choix
              actif={raccourci === 'PERSONNALISE'}
              titre="Une période précise"
              texte="Deux dates, bornes comprises."
              onClick={() => setRaccourci('PERSONNALISE')}
            />

            {raccourci === 'PERSONNALISE' && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="space-y-1">
                  <span className="text-muted-foreground text-xs">Du</span>
                  <Input
                    type="date"
                    value={debut}
                    max={fin || undefined}
                    onChange={(e) => setDebut(e.target.value)}
                    className="h-10 tabular-nums"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground text-xs">Au</span>
                  <Input
                    type="date"
                    value={fin}
                    min={debut || undefined}
                    onChange={(e) => setFin(e.target.value)}
                    className="h-10 tabular-nums"
                  />
                </label>
              </div>
            )}

            {plageInvalide && (
              <p className="text-destructive text-xs">
                La date de fin précède celle de début : aucun versement ne peut s’y
                trouver.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="h-10"
              onClick={() => setPlageOuverte(false)}
              disabled={enCours}
            >
              Annuler
            </Button>
            <Button
              className="h-10"
              disabled={!pret || enCours}
              onClick={() => {
                setPlageOuverte(false);
                void lancer('DIMES', bornesDuRaccourci());
              }}
            >
              <Printer className="mr-2 size-4" aria-hidden />
              Imprimer le relevé
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Une période, présentée avec ce qu'elle couvre — le titre seul ne suffit pas. */
function Choix({
  actif,
  titre,
  texte,
  onClick,
}: {
  actif: boolean;
  titre: string;
  texte: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        'flex w-full flex-col gap-0.5 rounded-lg border p-3 text-left transition-colors',
        actif ? 'border-indigo-300 bg-indigo-50/60' : 'border-border hover:bg-muted/40',
      )}
    >
      <span className="text-sm font-medium">{titre}</span>
      <span className="text-muted-foreground text-xs">{texte}</span>
    </button>
  );
}
