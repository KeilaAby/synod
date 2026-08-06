import { redirect } from 'next/navigation';

import { AppSidebar } from '@/components/layout/app-sidebar';
import type { CompteursAttente } from '@/components/layout/nav-items';
import { Topbar } from '@/components/layout/topbar';
import { SessionProvider } from '@/components/shared/session-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getSession } from '@/lib/session';

/**
 * Gabarit applicatif — plan.md §9.2.
 *
 * Charge la session UNE SEULE FOIS (React `cache`) et la transmet par contexte :
 * aucun composant n'interroge la base pour savoir s'il doit afficher un bouton.
 *
 * La redirection ici double celle du middleware. Ce n'est pas redondant : le
 * middleware verifie l'existence d'une identite, ce layout verifie l'existence
 * d'un PROFIL ACTIF rattache a une entite. Un compte desactive possede encore
 * une identite valide, mais n'a plus rien a faire dans l'application.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/connexion');

  // UI-21 — compteurs d'elements en attente.
  // Alimentes au lot 2 (transferts a approuver) et au lot 4 (mouvements a
  // valider). Tant que ces modules n'existent pas, aucun badge n'est affiche :
  // afficher un zero laisserait croire a une file vide alors qu'elle n'est
  // simplement pas encore branchee.
  const compteurs: CompteursAttente = {};

  return (
    <SessionProvider session={session}>
      <TooltipProvider delayDuration={300}>
        <div className="flex min-h-screen">
          <AppSidebar compteurs={compteurs} />

          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar compteurs={compteurs} />

            <main className="flex-1 px-4 py-6 md:px-8">
              <div className="mx-auto w-full max-w-[1600px]">{children}</div>
            </main>
          </div>
        </div>
      </TooltipProvider>
    </SessionProvider>
  );
}
