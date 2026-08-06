'use client';

import { PanelLeftClose, PanelLeftOpen, UserCog } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';

import { Logo } from '@/components/shared/logo';
import { useSession } from '@/components/shared/session-provider';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { type CompteursAttente, NAV_ITEMS, type NavItem } from './nav-items';

const CLE_STOCKAGE = 'synod:sidebar-reduite';

/**
 * `localStorage` est un systeme EXTERNE a React : on s'y abonne plutot que d'en
 * recopier l'etat dans un `useState` via un effet. `useSyncExternalStore` gere
 * aussi l'hydratation — le serveur rend toujours la sidebar deployee, sans
 * divergence ni cascade de rendus.
 */
const abonnes = new Set<() => void>();

function abonner(callback: () => void) {
  abonnes.add(callback);
  // Synchronise l'etat entre onglets ouverts.
  window.addEventListener('storage', callback);
  return () => {
    abonnes.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

function lireReduite(): boolean {
  return window.localStorage.getItem(CLE_STOCKAGE) === '1';
}

function ecrireReduite(valeur: boolean) {
  window.localStorage.setItem(CLE_STOCKAGE, valeur ? '1' : '0');
  for (const callback of abonnes) callback();
}

/**
 * Navigation laterale — ENF-UTI-02, UI-21.
 *
 * Se reduit a une bande d'icones (w-16) sur demande, et l'etat est memorise.
 * Sur mobile, ce composant n'est pas rendu : la Topbar ouvre un <Sheet>
 * contenant la meme liste (`SidebarNav`).
 */
export function AppSidebar({ compteurs }: { compteurs: CompteursAttente }) {
  const reduite = useSyncExternalStore(abonner, lireReduite, () => false);

  function basculer() {
    ecrireReduite(!reduite);
  }

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 md:flex',
        reduite ? 'w-16' : 'w-64',
      )}
    >
      <div
        className={cn(
          'flex h-16 items-center border-b border-border px-4',
          reduite ? 'justify-center' : 'justify-between',
        )}
      >
        <Link href="/tableau-de-bord" aria-label="SYNOD — accueil">
          <Logo avecTexte={!reduite} taille="sm" />
        </Link>

        {!reduite && (
          <Button
            variant="ghost"
            size="icon"
            onClick={basculer}
            aria-label="Reduire la navigation"
            className="size-8"
          >
            <PanelLeftClose className="size-4" aria-hidden />
          </Button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-2" aria-label="Navigation principale">
        <SidebarNav reduite={reduite} compteurs={compteurs} />
      </nav>

      <Separator />

      <div className="p-2">
        <LienNav
          item={{ href: '/mon-compte', label: 'Mon compte', icon: UserCog }}
          reduite={reduite}
        />

        {reduite && (
          <Button
            variant="ghost"
            size="icon"
            onClick={basculer}
            aria-label="Deployer la navigation"
            className="mt-1 size-10 w-full"
          >
            <PanelLeftOpen className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </aside>
  );
}

/** Liste des entrees — partagee entre la sidebar et le tiroir mobile. */
export function SidebarNav({
  reduite = false,
  compteurs,
  onNavigate,
}: {
  reduite?: boolean;
  compteurs: CompteursAttente;
  onNavigate?: () => void;
}) {
  const { detient } = useSession();

  const visibles = NAV_ITEMS.filter((item) => !item.permission || detient(item.permission));

  return (
    <ul className="space-y-1">
      {visibles.map((item) => {
        const compteur =
          item.compteurCle && item.compteurPermission && detient(item.compteurPermission)
            ? compteurs[item.compteurCle]
            : undefined;

        return (
          <li key={item.href}>
            <LienNav
              item={item}
              reduite={reduite}
              compteur={compteur}
              onNavigate={onNavigate}
            />
          </li>
        );
      })}
    </ul>
  );
}

function LienNav({
  item,
  reduite,
  compteur,
  onNavigate,
}: {
  item: Pick<NavItem, 'href' | 'label' | 'icon'>;
  reduite: boolean;
  compteur?: number;
  onNavigate?: () => void;
}) {
  const chemin = usePathname();
  const actif = chemin === item.href || chemin.startsWith(`${item.href}/`);
  const Icone = item.icon;

  const lien = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={actif ? 'page' : undefined}
      className={cn(
        // UI-14 : transition de couleur sur tout element interactif
        'flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
        reduite && 'justify-center px-0',
        actif
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
      )}
    >
      <Icone className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />

      {!reduite && <span className="flex-1 truncate">{item.label}</span>}

      {compteur !== undefined && compteur > 0 && (
        <span
          className={cn(
            'inline-flex min-w-5 items-center justify-center rounded-md bg-amber-100 px-1.5 text-xs font-semibold text-amber-700',
            reduite && 'absolute top-1 right-1 min-w-4 px-1',
          )}
          aria-label={`${compteur} element${compteur > 1 ? 's' : ''} en attente`}
        >
          {compteur > 99 ? '99+' : compteur}
        </span>
      )}
    </Link>
  );

  // Reduite, l'intitule n'est plus lisible : l'infobulle le restitue.
  if (!reduite) return lien;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative">{lien}</div>
      </TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {compteur ? ` (${compteur} en attente)` : ''}
      </TooltipContent>
    </Tooltip>
  );
}
