import type { Metadata, Viewport } from 'next';

import { GardeErreurs } from '@/components/shared/garde-erreurs';
import { GardeMessages } from '@/components/shared/messages';
import { Toaster } from '@/components/ui/sonner';
import { getParametres } from '@/lib/data/settings';
import {
  COULEUR_PRIMAIRE_DEFAUT,
  POSITION_TOAST_DEFAUT,
  bornerDuree,
  estCouleurHex,
  estPositionToast,
  texteSurCouleur,
} from '@/lib/domain/apparence';
import { fontMono, fontSans } from '@/lib/fonts';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'SYNOD',
    template: '%s · SYNOD',
  },
  description:
    "Plateforme de gestion et de pilotage d'une organisation ecclesiale : structure, croyants, bureaux, finances et rapports.",
  applicationName: 'SYNOD',
  // Donnees sensibles (ENF-DCP-01) : aucune indexation, aucun apercu externe.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // ENF-UTI-03 : ne jamais bloquer le zoom, indispensable a l'accessibilite.
  maximumScale: 5,
  themeColor: '#f9fafb',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  /**
   * EF-ADM-13 — L'APPARENCE SE LIT À CHAQUE RENDU (règle 21).
   *
   * Ici et non dans le gabarit applicatif, parce que le `Toaster` y est monté :
   * en déplacer un seul des deux les ferait vivre à deux endroits.
   *
   * Sur les écrans d'authentification, la RLS ne rend rien — la lecture est
   * réservée aux comptes connectés — et `getParametres` retombe sur ses
   * valeurs par défaut. La page de connexion garde donc l'apparence d'origine,
   * ce qui est correct : on ne peut pas personnaliser pour quelqu'un qu'on ne
   * connaît pas encore.
   */
  const parametres = await getParametres();

  const couleur = estCouleurHex(parametres.couleur_primaire)
    ? parametres.couleur_primaire
    : COULEUR_PRIMAIRE_DEFAUT;

  return (
    <html
      lang="fr"
      className={`${fontSans.variable} ${fontMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/*
          LA COULEUR VOYAGE COMME UNE VALEUR, POSÉE SUR UN JETON.

          Règle 32, payée une fois : Tailwind lit le SOURCE, il ne devine pas ce
          que le serveur enverra. Une classe fabriquée à la volée n'existerait
          dans aucune feuille, et une valeur arbitraire pointant une variable
          CSS casse la compilation de la feuille entière. On écrit donc la
          variable, que toutes les classes `bg-primary` existantes consomment.

          Le texte du bouton SE DÉDUIT du fond — il ne se saisit pas, sans quoi
          on poserait du blanc sur du jaune.

          `:root` et non `.dark` : le thème sombre n'est pas activé en V1 (voir
          `globals.css`). Le jour où il le sera, il faudra un second jeu de
          jetons — une couleur choisie pour du blanc ne vaut pas sur du noir.
        */}
        <style>{`:root{--primary:${couleur};--primary-foreground:${texteSurCouleur(couleur)}}`}</style>
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        {/* UI-20 : retour utilisateur systematique apres une mutation. */}
        {/* Aucune erreur ne reste muette — voir `garde-erreurs`. */}
        <GardeErreurs />
        {/* Ce qui doit être LU attend d'être fermé — voir `messages`. La
            notification ne garde que les confirmations de CRUD. */}
        <GardeMessages />
        {/*
          EF-ADM-13 — durée, bouton de fermeture et couleurs se règlent.

          Ce que ces réglages NE FONT PAS : la règle 30 tient. Seule une
          CONFIRMATION passe par une notification ; un refus, un avertissement
          ou une panne va dans un pop-up qu'on ferme, et ESLint refuse les
          autres appels. On règle ici la manière dont s'affiche ce qui a déjà le
          droit de s'y afficher.

          La durée est bornée à la lecture : une valeur hors bornes venue d'une
          base modifiée à la main ferait disparaître la notification avant
          qu'elle soit lue.
        */}
        <Toaster
          position={
            estPositionToast(parametres.toast_position)
              ? parametres.toast_position
              : POSITION_TOAST_DEFAUT
          }
          duration={bornerDuree(parametres.toast_duree_ms)}
          richColors={parametres.toast_couleurs_vives}
          closeButton={parametres.toast_bouton_fermer}
        />
      </body>
    </html>
  );
}
