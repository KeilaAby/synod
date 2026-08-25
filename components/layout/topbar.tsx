'use client';

import { BookOpen, LogOut, Menu, UserCog } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Logo } from '@/components/shared/logo';
import { useSession } from '@/components/shared/session-provider';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { deconnexion } from '@/lib/actions/auth';
import { ENTITY_LABELS, type EntityType } from '@/lib/domain/hierarchy';
import { ROLE_LABELS } from '@/lib/domain/permissions';
import { initiales } from '@/lib/utils/format';

import { SidebarNav } from './app-sidebar';
import { BreadcrumbNav } from './breadcrumb-nav';
import type { CompteursAttente } from './nav-items';

/**
 * Barre superieure — plan.md §9.2.
 *
 * Porte le fil d'Ariane, l'indicateur de perimetre et le menu de compte.
 * Sur mobile, elle porte aussi le declencheur du tiroir de navigation
 * (ENF-UTI-02 : la sidebar se replie en <Sheet> sous 768 px).
 */
export function Topbar({ compteurs }: { compteurs: CompteursAttente }) {
  const { session } = useSession();
  const [tiroirOuvert, setTiroirOuvert] = useState(false);

  const typeEntite = session.entiteType as EntityType;
  const libelleType = ENTITY_LABELS[typeEntite]?.singulier ?? session.entiteType;

  return (
    // `no-print` — la navigation n'a aucun sens sur du papier (EF-DSH-10).
    <header className="no-print flex h-16 shrink-0 items-center gap-4 border-b border-border bg-card px-4 md:px-8">
      {/* --- Tiroir de navigation, mobile uniquement --- */}
      <Sheet open={tiroirOuvert} onOpenChange={setTiroirOuvert}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Ouvrir la navigation">
            <Menu className="size-5" aria-hidden />
          </Button>
        </SheetTrigger>

        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="h-16 justify-center border-b border-border px-4">
            <SheetTitle className="sr-only">Navigation principale</SheetTitle>
            <Logo taille="sm" />
          </SheetHeader>
          <nav className="p-2" aria-label="Navigation principale">
            <SidebarNav compteurs={compteurs} onNavigate={() => setTiroirOuvert(false)} />
          </nav>
        </SheetContent>
      </Sheet>

      <div className="hidden min-w-0 flex-1 md:block">
        <BreadcrumbNav />
      </div>
      <div className="flex-1 md:hidden" />

      {/* --- Perimetre courant (RG-20) --- */}
      <div className="hidden items-center gap-2 rounded-md border border-border px-3 py-1.5 sm:flex">
        <span className="text-xs text-muted-foreground">{libelleType}</span>
        <span className="text-sm font-medium text-foreground">{session.entiteNom}</span>
        <span className="font-mono text-xs text-muted-foreground">{session.entiteCode}</span>
      </div>

      {/* --- Menu de compte --- */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-10 gap-2 px-2" aria-label="Menu du compte">
            <Avatar className="size-8">
              <AvatarFallback className="bg-slate-900 text-xs font-medium text-white">
                {initiales(session.nomComplet)}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="space-y-1">
            <p className="text-sm font-semibold text-foreground">{session.nomComplet}</p>
            <p className="truncate text-xs font-normal text-muted-foreground">
              {session.email}
            </p>
            <p className="text-xs font-normal text-muted-foreground">
              {ROLE_LABELS[session.role]}
            </p>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href="/documentation">
              <BookOpen className="mr-2 size-4" aria-hidden />
              Documentation & Guide
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href="/mon-compte">
              <UserCog className="mr-2 size-4" aria-hidden />
              Mon compte
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => {
              void deconnexion();
            }}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="mr-2 size-4" aria-hidden />
            Se deconnecter
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
