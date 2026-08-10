import type { Metadata, Viewport } from 'next';

import { GardeErreurs } from '@/components/shared/garde-erreurs';
import { Toaster } from '@/components/ui/sonner';
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

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="fr"
      className={`${fontSans.variable} ${fontMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        {children}
        {/* UI-20 : retour utilisateur systematique apres une mutation. */}
        {/* Aucune erreur ne reste muette — voir `garde-erreurs`. */}
        <GardeErreurs />
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
