import { redirect } from 'next/navigation';

import { AppSidebar } from '@/components/layout/app-sidebar';
import type { CompteursAttente } from '@/components/layout/nav-items';
import { Topbar } from '@/components/layout/topbar';
import { SessionProvider } from '@/components/shared/session-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { compterTransfertsAApprouver } from '@/lib/data/transferts';
import { compterMouvementsAValider } from '@/lib/data/finances';
import { detient } from '@/lib/domain/permissions';
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

  /**
   * EF-ADM-01, EF-ADM-08 — UN MOT DE PASSE PROVISOIRE SE CHANGE AVANT TOUT LE
   * RESTE.
   *
   * La garde est posee ICI, dans le gabarit, et non dans le proxy : elle a
   * besoin du PROFIL — le proxy ne voit qu'une identite, et lire la base a
   * chaque requete d'image ou de script pour cela serait absurde.
   *
   * L'ecran de changement vit dans le groupe `(auth)`, donc hors de ce
   * gabarit : la redirection ne peut pas boucler. C'est aussi ce qui le prive
   * de la navigation — on n'ouvre pas les finances avec un mot de passe que
   * quelqu'un d'autre connait.
   */
  /**
   * RG-07 — UN MANDAT ECHU FERME L'APPLICATION.
   *
   * Meme garde, meme raison : le drapeau vit sur le profil, donc la barriere
   * se pose la ou le profil est connu. La poser ecran par ecran finirait par
   * manquer quelque part, et c'est precisement l'ecran oublie qu'on trouverait.
   *
   * AVANT le mot de passe, et l'ordre compte : demander a quelqu'un dont le
   * mandat est termine de choisir un mot de passe le ferait travailler pour
   * un acces qu'on s'apprete a lui refuser — et l'action de changement, elle,
   * le refuserait deja.
   */
  if (session.mandatEchu) redirect('/mandat-echu');

  if (session.doitChangerMotDePasse) redirect('/changer-mot-de-passe');

  // UI-21 — compteurs d'elements en attente.
  //
  // EF-TRF-07 — le compteur ne denombre que les demandes que l'utilisateur peut
  // REELLEMENT trancher (RG-12), pas tout ce que la RLS lui laisse voir. Un
  // badge annoncant trois demandes pour une file qui en montre zero ferait
  // douter de l'application entiere.
  // Les deux comptages sont INDEPENDANTS : enchaines, ils doubleraient
  // l'attente avant le premier pixel de chaque page (regle 28).
  const [transferts, mouvements] = await Promise.all([
    compterTransfertsAApprouver(session),
    detient(session, 'finance.validate') ? compterMouvementsAValider() : Promise.resolve(0),
  ]);

  const compteurs: CompteursAttente = { transferts, mouvements };

  return (
    <SessionProvider session={session}>
      <TooltipProvider delayDuration={300}>
        <div className="flex min-h-screen">
          <AppSidebar compteurs={compteurs} />

          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar compteurs={compteurs} />

            {/*
              LE FOND EST BLANC PARTOUT — 20 août 2026.

              Il se demandait écran par écran (`data-fond="blanc"`), et deux
              pages seulement l'avaient posé. Un réglage que chaque nouvel écran
              doit penser à reprendre finit par manquer quelque part, et c'est
              l'écran oublié qu'on remarque : celui dont le fond est gris quand
              tous les autres sont blancs se lit comme un défaut d'affichage.

              CE QUE CELA OBLIGEAIT À CHANGER AILLEURS. Sur gris, une carte
              blanche se découpait d'elle-même et la bordure ne faisait que la
              finir. Sans contraste de fond à emprunter, la bordure seule laisse
              les cartes se fondre dans la page : `Card` porte donc une ombre
              légère par défaut (voir `components/ui/card.tsx`).

              Le fond est posé ICI et non depuis la page : la faire déborder
              elle-même aurait demandé des marges négatives à recompenser à
              chaque point de rupture, et un écran court aurait laissé une bande
              grise en bas.
            */}
            {/*
              LA PLEINE LARGEUR SE DEMANDE, elle aussi, PAR UN ATTRIBUT.

              Un écran à trois panneaux — l'éditeur de rapport — perd deux fois
              la gouttière du gabarit et le reste du plafond de 1600 px : la
              palette et le panneau de réglages ont une largeur fixe, et tout ce
              qu'on leur retire est pris sur la composition, au milieu, qui est
              la seule chose qu'on regarde.

              La page pose l'attribut, le gabarit y répond — des marges
              négatives depuis la page seraient à recompenser à chaque point de
              rupture. C'est le mécanisme qu'employait `data-fond`, retiré le
              20 août 2026 quand le fond blanc est devenu la règle : un attribut
              qui ne décide plus de rien devient un piège (règle 21).
            */}
            {/*
              MARGES HORIZONTALES DE 4 px — ÉCART ASSUMÉ À LA RÈGLE 6.

              La grille de 8 px vaut pour ce qui SÉPARE des éléments entre eux :
              c'est elle qui fait qu'un écran se lit comme un tout. La marge
              extérieure de la page ne sépare rien — elle ne fait que rogner la
              zone utile, et sur les tableaux larges de cette application (le
              registre financier, la composition d'un bureau) chaque pixel rendu
              est une colonne de moins à faire défiler.

              Le `py-6` vertical, lui, reste sur la grille : il sépare bien
              quelque chose — la barre du haut du contenu.

              `px-1` est sur l'échelle Tailwind, pas une valeur arbitraire :
              ESLint l'accepte, et l'écart reste lisible pour qui relit.
            */}
            <main className="bg-card flex-1 px-1 py-6 md:px-2 has-[[data-large]]:px-1 md:has-[[data-large]]:px-1">
              <div className="mx-auto w-full max-w-[1600px] has-[[data-large]]:max-w-none">
                {children}
              </div>
            </main>
          </div>
        </div>
      </TooltipProvider>
    </SessionProvider>
  );
}
