import { Google_Sans, Google_Sans_Code } from 'next/font/google';

/**
 * Typographie — plan.md §8.2, P-9, `designrules.md`.
 *
 * -----------------------------------------------------------------------------
 * GOOGLE SANS, ET AUCUNE REQUETE VERS UN CDN
 * -----------------------------------------------------------------------------
 * `designrules.md` prescrit **Google Sans**. Elle a longtemps ete proprietaire
 * — c'est pourquoi ce fichier expediait Inter — et elle est publiee sur Google
 * Fonts depuis 2025. La contrainte qui justifiait le substitut est levee.
 *
 * ELLE N'EST PAS CHARGEE PAR UN `<link>`. La methode courante — trois balises
 * vers `fonts.googleapis.com` et `fonts.gstatic.com` — est ici INTERDITE :
 *
 *   - P-9 exige qu'aucune requete ne parte vers un tiers ;
 *   - la CSP stricte d'ENF-SEC-07 bloquerait le domaine, et la page se
 *     rendrait dans la police de repli sans le dire ;
 *   - une police servie par un CDN ARRIVE APRES le premier rendu : le texte
 *     saute au moment ou elle se substitue au repli.
 *
 * `next/font/google` fait exactement l'inverse : il telecharge les fichiers
 * AU BUILD et les sert depuis notre propre origine, avec le `@font-face` et le
 * preload generes. Le resultat est auto-heberge comme l'etaient les `.woff2` de
 * `app/fonts/`, sans avoir a les versionner ni a les mettre a jour a la main.
 *
 * Tout passe par les variables CSS `--font-sans` et `--font-mono` : aucun ecran
 * ne nomme une police.
 * -----------------------------------------------------------------------------
 */
export const fontSans = Google_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  /**
   * `opsz` — le dessin s'adapte a la taille de rendu : plus ouvert en petit
   * corps, plus resserre en titre. C'est ce qui fait tenir une interface dense
   * entre 12 et 14 px sans la rendre etouffante.
   *
   * `GRAD` accompagne l'axe optique dans cette famille.
   */
  axes: ['opsz', 'GRAD'],
  // UI-17 : `swap` evite le FOIT (texte invisible pendant le chargement).
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'sans-serif'],
  preload: true,
});

/**
 * Chasse fixe — UI-07 / UI-13.
 *
 * **Google Sans Code**, et non plus Geist Mono : c'est la mono de la meme
 * famille, elle en partage les proportions et la couleur de gris. Deux polices
 * d'origines differentes cote a cote dans un tableau se voient, et ce qui se
 * voit dans un tableau de chiffres detourne de ce qu'on y lit.
 *
 * Reservee desormais a ce qui doit s'ALIGNER en colonne — matricules, codes,
 * references. Les MONTANTS, eux, sont rendus dans la police d'interface avec
 * ses chiffres tabulaires : voir `.montant` dans `globals.css`.
 */
export const fontMono = Google_Sans_Code({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
  preload: true,
});
